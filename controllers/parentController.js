// Parent (User) Controller
// Handles searching tutors, booking sessions, managing bookings, viewing tutor profiles, providing reviews, and communication

const User = require('../models/User');
const Booking = require('../models/Booking');
const Review = require('../models/Review');
const Message = require('../models/Message');
const Waitlist = require('../models/Waitlist');
const Subject = require('../models/Subject');
const BookmarkSubject = require('../models/BookmarkSubject');
const Dispute = require('../models/Dispute');
const mongoose = require('mongoose');
const { getOAuth2Client } = require('../utils/googleAuth');
const { google } = require('googleapis');
const { createNotification } = require('../utils/notification');
const { transformTutorData } = require('../utils/imageUrl');

// Hardcoded Google OAuth2 credentials removed for security
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || `${process.env.VITE_API_URL}/api/google/callback`;


// Helper to get sort criteria
const getSearchSortCriteria = (sortBy) => {
  switch (sortBy) {
    case 'date':
    case 'createdAt':
    case 'newest':
      return { date: -1 };
    case 'rating':
      return { rating: -1, totalReviews: -1 };
    case 'price_low':
      return { 'subjects.hourlyRate': 1, rating: -1 };
    case 'price_high':
      return { 'subjects.hourlyRate': -1, rating: -1 };
    case 'name':
      return { name: 1 };
    default:
      return { rating: -1, totalReviews: -1 };
  }
};

// Search tutors with advanced filtering and rule-based matching
exports.searchTutors = async (req, res) => {
  try {
    const {
      search, name, rating, minRate, maxRate, location, subject,
      page = 1, limit = 10, sortBy = 'rating'
    } = req.query;

    const searchCriteria = { role: 'tutor', isVerified: true };
    let sortCriteria = getSearchSortCriteria(sortBy);

    if (name || search) searchCriteria.name = { $regex: name || search, $options: 'i' };
    if (location) searchCriteria.location = { $regex: location, $options: 'i' };
    if (rating) searchCriteria.rating = { $gte: parseFloat(rating) };
    if (subject) searchCriteria.subjects = { $elemMatch: { subject } };

    if (minRate || maxRate) {
      const rateConditions = {};
      if (minRate) rateConditions.hourlyRate = { $gte: parseFloat(minRate) };
      if (maxRate) {
        if (rateConditions.hourlyRate) rateConditions.hourlyRate.$lte = parseFloat(maxRate);
        else rateConditions.hourlyRate = { $lte: parseFloat(maxRate) };
      }

      if (searchCriteria.subjects && searchCriteria.subjects.$elemMatch) {
        searchCriteria.subjects.$elemMatch = { ...searchCriteria.subjects.$elemMatch, ...rateConditions };
      } else {
        searchCriteria.subjects = { $elemMatch: rateConditions };
      }
      sortCriteria = { 'subjects.hourlyRate': 1, rating: -1 };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const tutors = await User.find(searchCriteria)
      .select('-password')
      .populate('subjects.subject')
      .sort(sortCriteria)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const filteredTutors = tutors.map(tutor => {
      let subjects = tutor.subjects || [];
      if (subject) subjects = subjects.filter(s => s.subject && s.subject._id.toString() === subject);
      if (minRate || maxRate) {
        subjects = subjects.filter(s => {
          const r = s.hourlyRate;
          return !(minRate && r < parseFloat(minRate)) && !(maxRate && r > parseFloat(maxRate));
        });
      }
      return { ...tutor, subjects };
    }).filter(t => t.subjects.length > 0);

    const totalTutors = await User.countDocuments(searchCriteria);
    const totalPages = Math.ceil(totalTutors / parseInt(limit));

    res.json({
      success: true,
      data: {
        tutors: filteredTutors.map(transformTutorData),
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalTutors,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1,
          limit: parseInt(limit)
        },
        sortBy
      }
    });
  } catch (error) {
    console.error('Search tutors error:', error);
    res.status(500).json({ success: false, message: 'Error searching for tutors', error: error.message });
  }
};


// Book a session with a tutor
exports.bookSession = async (req, res) => {
  try {
    const { tutorId, sessionTime, subject, notes } = req.body;
    const parentId = req.user.id; // Assuming authentication middleware sets req.user

    // Validate required fields
    if (!tutorId || !sessionTime || !subject) {
      return res.status(400).json({
        success: false,
        message: 'Tutor ID, session time, and subject are required'
      });
    }

    // Check if tutor exists and is verified
    const tutor = await User.findById(tutorId).populate('subjects.subject');
    if (!tutor || tutor.role !== 'tutor' || !tutor.isVerified) {
      return res.status(404).json({
        success: false,
        message: 'Tutor not found or not verified'
      });
    }

    // Check if the requested time is in the future
    const requestedTime = new Date(sessionTime);
    if (requestedTime <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Session time must be in the future'
      });
    }

    // Find the tutor's subject configuration to get the hours
    const tutorSubject = tutor.subjects.find(s => s.subject._id.toString() === subject);
    if (!tutorSubject) {
      return res.status(400).json({
        success: false,
        message: 'Tutor does not teach this subject'
      });
    }

    const subjectHours = tutorSubject.hours || 1; // Default to 1 hour if not specified

    // Check if tutor is available at the requested time
    const dayOfWeek = requestedTime.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const timeString = requestedTime.toTimeString().slice(0, 5);

    const isAvailable = tutor.availability.some(avail =>
      avail.day === dayOfWeek &&
      avail.startTime <= timeString &&
      avail.endTime >= timeString
    );

    if (!isAvailable) {
      return res.status(400).json({
        success: false,
        message: 'Tutor is not available at the requested time'
      });
    }

    // Check for existing bookings at the same time based on subject hours
    const sessionStartTime = requestedTime.getTime();
    const sessionEndTime = sessionStartTime + (subjectHours * 60 * 60 * 1000); // Convert hours to milliseconds

    const existingBooking = await Booking.findOne({
      tutorId,
      sessionTime: {
        $lt: sessionEndTime,
        $gte: sessionStartTime - (subjectHours * 60 * 60 * 1000) // Check subjectHours before
      },
      status: { $in: ['requested', 'confirmed'] }
    });

    if (existingBooking) {
      // Add to waitlist instead
      const waitlistEntry = new Waitlist({
        parentId,
        tutorId,
        subject,
        requestedTime
      });
      await waitlistEntry.save();

      return res.status(200).json({
        success: true,
        message: `Tutor is busy at this time (${subjectHours} hour session). You have been added to the waitlist.`,
        data: { waitlistId: waitlistEntry._id }
      });
    }

    // Create the booking
    const booking = new Booking({
      parentId,
      tutorId,
      sessionTime: requestedTime,
      subject,
      notes,
      status: 'requested'
    });

    await booking.save();

    await createNotification({
      user: tutorId,
      type: 'booking',
      message: `New booking request from ${req.user.name}`,
      data: { bookingId: booking._id }
    });

    res.status(201).json({
      success: true,
      message: 'Session booked successfully',
      data: { booking }
    });

  } catch (error) {
    console.error('Book session error:', error);
    res.status(500).json({
      success: false,
      message: 'Error booking session',
      error: error.message
    });
  }
};

// Get all bookings for the parent
exports.getBookings = async (req, res) => {
  try {
    const parentId = req.user.id;
    const { status, page = 1, limit = 10 } = req.query;

    const searchCriteria = { parentId };
    if (status) {
      searchCriteria.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const bookings = await Booking.find(searchCriteria)
      .populate('tutorId', 'name email subjects location rating totalReviews')
      .populate('subject')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalBookings = await Booking.countDocuments(searchCriteria);
    const totalPages = Math.ceil(totalBookings / parseInt(limit));

    res.json({
      success: true,
      data: {
        bookings,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalBookings,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1,
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching bookings',
      error: error.message
    });
  }
};

// Get detailed tutor profile
exports.getTutorProfile = async (req, res) => {
  try {
    const { tutorId } = req.params;

    const tutor = await User.findById(tutorId)
      .select('-password')
      .populate('subjects.subject');

    if (!tutor || tutor.role !== 'tutor') {
      return res.status(404).json({
        success: false,
        message: 'Tutor not found'
      });
    }

    // Get recent reviews
    const recentReviews = await Review.find({ tutorId })
      .populate('parentId', 'name profileImage')
      .populate('subject', 'name _id')
      .sort({ createdAt: -1 })
      .limit(5);
    console.log('recentReviews:', recentReviews);
    // Get booking statistics
    const totalSessions = await Booking.countDocuments({
      tutorId,
      status: 'completed'
    });

    const responseData = {
      ...tutor.toObject(),
      recentReviews,
      totalSessions
    };
    console.log('responseData:', responseData);
    res.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('Get tutor profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tutor profile',
      error: error.message
    });
  }
};

// Add a review for a tutor/session
exports.addReview = async (req, res) => {
  try {
    const { bookingId, rating, comment, subject } = req.body;
    const parentId = req.user.id;

    // Validate required fields
    if (!bookingId || !rating || rating < 1 || rating > 5 || !subject) {
      return res.status(400).json({
        success: false,
        message: 'Booking ID, subject, and rating (1-5) are required'
      });
    }

    // Check if booking exists and belongs to the parent
    const booking = await Booking.findById(bookingId);
    if (!booking || booking.parentId.toString() !== parentId) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found or unauthorized'
      });
    }

    // Check if booking is completed
    if (booking.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Can only review completed sessions'
      });
    }

    // Check that the booking's subject matches the requested subject
    if (String(booking.subject) !== String(subject)) {
      return res.status(400).json({
        success: false,
        message: 'Can only review completed sessions'
      });
    }

    // Check if review already exists for this booking and subject
    const existingReview = await Review.findOne({ bookingId, subject });
    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: 'Review already exists for this booking and subject'
      });
    }

    // Create the review
    const review = new Review({
      bookingId,
      parentId,
      tutorId: booking.tutorId,
      subject,
      rating,
      comment
    });

    await review.save();

    // Update tutor's average rating
    const tutorReviews = await Review.find({ tutorId: booking.tutorId });
    const averageRating = tutorReviews.reduce((sum, rev) => sum + rev.rating, 0) / tutorReviews.length;

    await User.findByIdAndUpdate(booking.tutorId, {
      rating: Math.round(averageRating * 10) / 10, // Round to 1 decimal place
      totalReviews: tutorReviews.length
    });

    await createNotification({
      user: booking.tutorId,
      type: 'review',
      message: `You received a new review from ${req.user.name}`,
      data: { reviewId: review._id, bookingId: booking._id }
    });

    res.status(201).json({
      success: true,
      message: 'Review added successfully',
      data: { review }
    });

  } catch (error) {
    console.error('Add review error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding review',
      error: error.message
    });
  }
};

// Send message to tutor
exports.sendMessage = async (req, res) => {
  try {
    const { receiverId, content, bookingId } = req.body;
    const senderId = req.user.id;

    // Validate required fields
    if (!receiverId || !content) {
      return res.status(400).json({
        success: false,
        message: 'Receiver ID and message content are required'
      });
    }

    // Check if receiver exists and is a tutor
    const receiver = await User.findById(receiverId);
    if (!receiver || receiver.role !== 'tutor') {
      return res.status(404).json({
        success: false,
        message: 'Tutor not found'
      });
    }

    // If bookingId is provided, verify it belongs to the sender
    if (bookingId) {
      const booking = await Booking.findById(bookingId);
      if (!booking || booking.parentId.toString() !== senderId) {
        return res.status(400).json({
          success: false,
          message: 'Invalid booking ID'
        });
      }
    }

    // Create the message
    const message = new Message({
      senderId,
      receiverId,
      bookingId,
      content
    });

    await message.save();

    // Populate sender details for response
    await message.populate('senderId', 'name');

    await createNotification({
      user: receiverId,
      type: 'message',
      message: `New message from ${req.user.name}`,
      data: {
        messageId: message._id,
        bookingId,
        parentId: receiver.role === 'parent' ? receiverId : senderId,
        tutorId: receiver.role === 'tutor' ? receiverId : senderId
      }
    });

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: { message }
    });

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending message',
      error: error.message
    });
  }
};

// Get messages between parent and tutor
exports.getMessages = async (req, res) => {
  try {
    const { tutorId } = req.params;
    const parentId = req.user.id;
    const { page = 1, limit = 20 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const messages = await Message.find({
      $or: [
        { senderId: parentId, receiverId: tutorId },
        { senderId: tutorId, receiverId: parentId }
      ]
    })
      .populate('senderId', 'name')
      .populate('receiverId', 'name')
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalMessages = await Message.countDocuments({
      $or: [
        { senderId: parentId, receiverId: tutorId },
        { senderId: tutorId, receiverId: parentId }
      ]
    });

    const totalPages = Math.ceil(totalMessages / parseInt(limit));
    console.log("Messages:", messages);
    res.json({
      success: true,
      data: {
        messages,// Show oldest first
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalMessages,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1,
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching messages',
      error: error.message
    });
  }
};

// Get waitlist entries for parent
exports.getWaitlist = async (req, res) => {
  try {
    const parentId = req.user.id;
    const { page = 1, limit = 10 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const waitlistEntries = await Waitlist.find({ parentId })
      .populate('tutorId', 'name email subjects location rating')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalEntries = await Waitlist.countDocuments({ parentId });
    const totalPages = Math.ceil(totalEntries / parseInt(limit));

    res.json({
      success: true,
      data: {
        waitlistEntries,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalEntries,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1,
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Get waitlist error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching waitlist',
      error: error.message
    });
  }
};

// Helper: Update parent's recently visited tutors
async function updateRecentlyVisited(parentId, tutorId, subjectId) {
  const parent = await User.findById(parentId);
  if (!parent) return;
  // Remove any existing entry for this tutor+subject
  parent.recentlyVisited = parent.recentlyVisited.filter(
    v => !(v.tutorId.toString() === tutorId.toString() && v.subjectId.toString() === subjectId.toString())
  );
  // Add new entry to the front
  parent.recentlyVisited.unshift({ tutorId, subjectId, visitedAt: new Date() });
  // Keep only the 4 most recent
  parent.recentlyVisited = parent.recentlyVisited.slice(0, 4);
  await parent.save();
}

// Endpoint: Mark a tutor+subject as recently visited by parent
exports.markRecentlyVisited = async (req, res) => {
  try {
    const parentId = req.user.id;
    const { tutorId, subjectId } = req.body;
    if (!tutorId || !subjectId) {
      return res.status(400).json({ success: false, message: 'Tutor ID and Subject ID are required' });
    }
    await updateRecentlyVisited(parentId, tutorId, subjectId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error updating recently visited', error: error.message });
  }
};

// Get parent dashboard data: recommended tutors, recent bookings, waitlist
exports.getParentDashboard = async (req, res) => {
  try {
    const parentId = req.user.id;

    // 1. Recommended tutors: based on child's preferred subjects
    // Get parent with child's preferred subjects
    const parent = await User.findById(parentId).populate('childPreferredSubjects');
    let recommendedTutors = [];
    let childSubjectIds = [];

    if (parent && parent.childPreferredSubjects && parent.childPreferredSubjects.length > 0) {
      childSubjectIds = parent.childPreferredSubjects.map(s => s._id);
      console.log('Child preferred subjects:', childSubjectIds);

      // Find tutors who teach any of the child's preferred subjects
      const tutorsWithAllSubjects = await User.find({
        role: 'tutor',
        isVerified: true,
        'subjects.subject': { $in: childSubjectIds }
      })
        .select('-password')
        .populate('subjects.subject')
        .sort({ rating: -1, totalReviews: -1 })
        .limit(8);

      console.log(`Found ${tutorsWithAllSubjects.length} tutors matching child's subjects`);

      // FILTER: Only keep the subjects that match child's preferences
      recommendedTutors = tutorsWithAllSubjects.map(tutor => {
        const filteredSubjects = tutor.subjects.filter(subjectEntry =>
          subjectEntry.subject && childSubjectIds.some(childSubjId =>
            childSubjId.toString() === subjectEntry.subject._id.toString()
          )
        );

        return {
          ...tutor.toObject(),
          subjects: filteredSubjects
        };
      }).filter(tutor => tutor.subjects.length > 0); // Remove tutors with no matching subjects after filtering
    }

    // If no child preferred subjects or no matching tutors, show top-rated tutors
    if (recommendedTutors.length === 0) {
      console.log('No child preferred subjects or no matching tutors, showing top-rated tutors');
      recommendedTutors = await User.find({
        role: 'tutor',
        isVerified: true
      })
        .select('-password')
        .populate('subjects.subject')
        .sort({ rating: -1, totalReviews: -1 })
        .limit(8);
    }

    // Transform tutor data for image URLs
    const recommendedTutorsTransformed = recommendedTutors.map(transformTutorData);

    // 2. Recent/upcoming bookings
    const now = new Date();
    const bookings = await Booking.find({
      parentId,
      sessionTime: { $gte: now }
    })
      .populate('tutorId', 'name subjects location rating')
      .sort({ sessionTime: 1 })
      .limit(5);

    // 3. Recent waitlist entries
    const waitlist = await Waitlist.find({ parentId })
      .populate('tutorId', 'name subjects location rating')
      .sort({ createdAt: -1 })
      .limit(3);

    // Get recently visited tutors (max 4, ordered by visitedAt desc)
    const parentWithVisits = await User.findById(parentId).populate({
      path: 'recentlyVisited.tutorId',
      select: '-password',
      populate: { path: 'subjects.subject' }
    }).populate('recentlyVisited.subjectId');

    let recentlyVisited = [];
    if (parentWithVisits && parentWithVisits.recentlyVisited && parentWithVisits.recentlyVisited.length > 0) {
      recentlyVisited = parentWithVisits.recentlyVisited
        .sort((a, b) => new Date(b.visitedAt) - new Date(a.visitedAt))
        .slice(0, 4)
        .map(entry => ({
          ...entry.toObject(),
          tutorId: transformTutorData(entry.tutorId),
          subjectId: entry.subjectId,
        }));
    }

    res.json({
      success: true,
      data: {
        recommendedTutors: recommendedTutorsTransformed,
        bookings,
        waitlist,
        recentlyVisited,
        childSubjectIds // Optional: send child's subject IDs to frontend
      }
    });
  } catch (error) {
    console.error('Get parent dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard',
      error: error.message
    });
  }
};

exports.getTutorBusyTimes = async (req, res) => {
  try {
    const { tutorId } = req.params;

    // 1. Get tutor
    const tutor = await User.findById(tutorId).lean();
    if (!tutor) {
      return res.status(404).json({ success: false, message: 'Tutor not found' });
    }

    // 2. Get all bookings
    const bookings = await Booking.find({ tutorId, status: { $in: ['requested', 'confirmed'] } }).lean();

    // 3. Get waitlist
    const waitlist = await Waitlist.find({ tutorId }).lean();

    // 4. Map bookings to busy times using tutor subject hours
    const busyTimes = [
      ...bookings.map(b => {
        // Find the subject entry in tutor's profile
        const subjectEntry = tutor.subjects.find(s => s.subject.toString() === b.subjectId.toString());

        // Default to 1 hour if not found
        const durationInHours = subjectEntry?.hours || 1;

        const start = new Date(b.sessionTime);
        const end = new Date(start.getTime() + durationInHours * 60 * 60 * 1000);

        return {
          type: 'booking',
          start,
          end,
          status: b.status
        };
      }),

      ...waitlist.map(w => ({
        type: 'waitlist',
        start: w.requestedTime,
        end: new Date(new Date(w.requestedTime).getTime() + 60 * 60 * 1000),
        status: 'waitlist'
      }))
    ];

    res.json({ success: true, data: { busyTimes } });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Error fetching busy times', error: error.message });
  }
};

// Get all busy times for all tutors the parent has booked or waitlisted with
exports.getAllTutorsBusyTimesForParent = async (req, res) => {
  try {
    const parentId = req.user.id;
    // Get all bookings and waitlist entries for this parent to identify relevant tutors
    const bookings = await Booking.find({ parentId });
    const waitlist = await Waitlist.find({ parentId });

    // Get unique tutorIds
    const tutorIds = [
      ...new Set([
        ...bookings.map(b => b.tutorId.toString()),
        ...waitlist.map(w => w.tutorId.toString())
      ])
    ];

    if (tutorIds.length === 0) {
      return res.json({ success: true, data: { busyTimesByTutor: {} }, message: 'No tutors to sync.' });
    }

    // Fetch tutor names and subjects for all involved tutorIds
    const tutors = await User.find({ _id: { $in: tutorIds } }).select('name subjects');
    const tutorIdToName = {};
    const tutorIdToSubjects = {};
    tutors.forEach(t => {
      tutorIdToName[t._id.toString()] = t.name;
      tutorIdToSubjects[t._id.toString()] = t.subjects;
    });

    // For each tutor, get their busy times from other parents
    const busyTimesByTutor = {};
    for (const tutorId of tutorIds) {
      const tutorBookings = await Booking.find({ tutorId, parentId: { $ne: parentId }, status: { $in: ['requested', 'confirmed'] } });
      const tutorWaitlist = await Waitlist.find({ tutorId, parentId: { $ne: parentId } });

      busyTimesByTutor[tutorId] = [
        ...tutorBookings.map(b => {
          // Find the subject entry in tutor's profile to get hours
          const subjectEntry = tutorIdToSubjects[tutorId]?.find(s => s.subject.toString() === b.subjectId?.toString());
          const durationInHours = subjectEntry?.hours || 1;

          return {
            type: 'booking',
            start: b.sessionTime,
            end: new Date(new Date(b.sessionTime).getTime() + durationInHours * 60 * 60 * 1000),
            status: b.status
          };
        }),
        ...tutorWaitlist.map(w => {
          // Find the subject entry in tutor's profile to get hours
          const subjectEntry = tutorIdToSubjects[tutorId]?.find(s => s.subject.toString() === w.subject?.toString());
          const durationInHours = subjectEntry?.hours || 1;

          return {
            type: 'waitlist',
            start: w.requestedTime,
            end: new Date(new Date(w.requestedTime).getTime() + durationInHours * 60 * 60 * 1000),
            status: 'waitlist'
          };
        })
      ];
    }

    // --- Google Calendar Sync ---
    let syncMessage = 'Google Calendar not connected';
    // Check for tokens before attempting sync
    if (!req.user.googleAccessToken || !req.user.googleRefreshToken) {
      syncMessage = 'Google Calendar not connected. Please connect your account on the dashboard.';
      return res.json({ success: true, data: { busyTimesByTutor }, message: syncMessage });
    }

    try {
      const oauth2Client = new google.auth.OAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI
      );
      // Use the logged-in parent's tokens
      oauth2Client.setCredentials({
        access_token: req.user.googleAccessToken,
        refresh_token: req.user.googleRefreshToken
      });

      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      // --- 1. Delete previously synced events to prevent duplicates ---
      const syncMarker = 'TutorMe Sync:';
      let deletedCount = 0;
      try {
        const listRes = await calendar.events.list({
          calendarId: 'primary',
          q: syncMarker, // Search for our specific marker
          singleEvents: true,
          timeMin: (new Date()).toISOString(),
        });

        if (listRes.data.items) {
          const deletePromises = listRes.data.items.map(event => {
            return calendar.events.delete({
              calendarId: 'primary',
              eventId: event.id,
            }).then(() => deletedCount++);
          });
          await Promise.all(deletePromises);
          // for (const event of listRes.data.items) {
          //   try {
          //     await calendar.events.delete({
          //       calendarId: 'primary',
          //       eventId: event.id,
          //     });
          //     deletedCount++;
          //   } catch (err) {
          //     console.error(`Failed to delete event ${event.id}:`, err.message);
          //   }
          // }

        }
      } catch (err) {
        console.error('Could not delete old calendar events:', err.message);
        // Don't stop the process, just log and continue
      }

      // --- 2. Create and insert new events ---
      const events = [];
      for (const tutorId in busyTimesByTutor) {
        const tutorName = tutorIdToName[tutorId] || 'Tutor';
        for (const slot of busyTimesByTutor[tutorId]) {
          events.push({
            summary: `Tutor Busy: ${tutorName}`,
            description: `${syncMarker} A tutor you are interested in (${tutorName}) is busy at this time.`,
            start: { dateTime: new Date(slot.start).toISOString() },
            end: { dateTime: new Date(slot.end).toISOString() },
            colorId: '11' // Red
          });
        }
      }

      if (events.length === 0) {
        return res.json({ success: true, data: { busyTimesByTutor }, message: `Cleared ${deletedCount} old slots. No new busy slots to sync.` });
      }

      // Insert events into Google Calendar (primary calendar)
      let insertedCount = 0;
      const insertPromises = events.map(event => {
        return calendar.events.insert({
          calendarId: 'primary',
          resource: event
        }).then(() => insertedCount++);
      });
      await Promise.all(insertPromises);
      // for (const event of events) {
      //   try {
      //     await calendar.events.insert({
      //       calendarId: 'primary',
      //       resource: event
      //     });
      //     insertedCount++;
      //   } catch (err) {
      //     console.error('Failed to insert event:', err.message);
      //   }
      //}

      syncMessage = `Synced calendar: ${insertedCount} new slots added, ${deletedCount} old slots removed.`;
    } catch (err) {
      console.error('Google Calendar sync failed:', err);
      syncMessage = 'Failed to sync to Google Calendar. Your tokens may be invalid, please try reconnecting your account.';
    }

    res.json({ success: true, data: { busyTimesByTutor }, message: syncMessage });
  } catch (error) {
    console.error('Error in getAllTutorsBusyTimesForParent:', error);
    res.status(500).json({ success: false, message: 'Error fetching tutors busy times', error: error.message });
  }
};

// Get similar tutors by subject (excluding the current tutor)
exports.getSimilarTutors = async (req, res) => {
  try {
    const { subjectId, excludeTutorId } = req.query;
    if (!subjectId) {
      return res.status(400).json({ success: false, message: 'Subject ID is required' });
    }
    const query = {
      role: 'tutor',
      isVerified: true,
      'subjects.subject': subjectId
    };
    if (excludeTutorId) {
      query._id = { $ne: excludeTutorId };
    }
    const tutors = await User.find(query)
      .select('-password')
      .populate('subjects.subject')
      .sort({ rating: -1, totalReviews: -1 })
      .limit(5);
    res.json({ success: true, data: tutors });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching similar tutors', error: error.message });
  }
};

// Cancel a waitlist entry by parent
exports.cancelWaitlist = async (req, res) => {
  try {
    const parentId = req.user.id;
    const { waitlistId } = req.body;
    if (!waitlistId) {
      return res.status(400).json({ success: false, message: 'Waitlist ID is required' });
    }
    const entry = await Waitlist.findById(waitlistId);
    if (!entry || entry.parentId.toString() !== parentId) {
      return res.status(404).json({ success: false, message: 'Waitlist entry not found or unauthorized' });
    }
    await entry.deleteOne();
    await createNotification({
      user: entry.tutorId,
      type: 'waitlist-cancel',
      message: `Waitlist entry was cancelled by the parent.`,
      data: { waitlistId: entry._id }
    });
    res.json({ success: true, message: 'Waitlist entry cancelled' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error cancelling waitlist entry', error: error.message });
  }
};

// Cancel a booking by parent (only if not confirmed or completed)
exports.cancelBooking = async (req, res) => {
  try {
    const parentId = req.user.id;
    const { bookingId } = req.body;
    if (!bookingId) {
      return res.status(400).json({ success: false, message: 'Booking ID is required' });
    }
    const booking = await Booking.findById(bookingId);
    if (!booking || booking.parentId.toString() !== parentId) {
      return res.status(404).json({ success: false, message: 'Booking not found or unauthorized' });
    }
    if (booking.status === 'confirmed' || booking.status === 'completed') {
      return res.status(400).json({ success: false, message: 'Cannot cancel a confirmed or completed booking' });
    }
    await booking.deleteOne();
    await createNotification({
      user: booking.tutorId,
      type: 'cancel',
      message: `Booking was cancelled by the parent.`,
      data: { bookingId: booking._id }
    });
    res.json({ success: true, message: 'Booking cancelled' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error cancelling booking', error: error.message });
  }
};

// Add or remove a bookmark for a tutor+subject
exports.toggleBookmark = async (req, res) => {
  try {
    const parentId = req.user.id;
    const { tutorId, subjectId } = req.body;
    if (!tutorId || !subjectId) {
      return res.status(400).json({ success: false, message: 'Tutor ID and Subject ID are required' });
    }
    // Check if already bookmarked
    const existing = await BookmarkSubject.findOne({ parentId, tutorId, subjectId });
    if (existing) {
      await existing.deleteOne();
      await createNotification({
        user: tutorId,
        type: 'bookmark-remove',
        message: `You were removed from bookmarks by ${req.user.name}`,
        data: { parentId }
      });
      return res.json({ success: true, removed: true, message: 'Bookmark removed' });
    }
    // Add new bookmark
    const bookmark = new BookmarkSubject({ parentId, tutorId, subjectId });
    await bookmark.save();
    await createNotification({
      user: tutorId,
      type: 'bookmark',
      message: `You were bookmarked by ${req.user.name}`,
      data: { parentId }
    });
    res.json({ success: true, added: true, message: 'Bookmarked' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error toggling bookmark', error: error.message });
  }
};

// Get all bookmarks for the logged-in parent
exports.getBookmarks = async (req, res) => {
  try {
    const parentId = req.user.id;
    const bookmarks = await BookmarkSubject.find({ parentId })
      .populate({
        path: 'tutorId',
        select: '-password',
        populate: {
          path: 'subjects.subject',
          model: 'Subject'
        }
      })
      .populate('subjectId');
    res.json({ success: true, data: bookmarks });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching bookmarks', error: error.message });
  }
};

// Get parent's disputes
exports.getDisputes = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let query = { parentId: req.user.id };
    if (status) {
      query.status = status;
    }

    const disputes = await Dispute.find(query)
      .populate('tutorId', 'name email')
      .populate('bookingId', 'sessionTime subject')
      .populate('subjectId', 'name')
      .populate('resolvedBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalDisputes = await Dispute.countDocuments(query);

    // Get dispute statistics
    const stats = {
      total: await Dispute.countDocuments({ parentId: req.user.id }),
      pending: await Dispute.countDocuments({ parentId: req.user.id, status: 'pending' }),
      under_review: await Dispute.countDocuments({ parentId: req.user.id, status: 'under_review' }),
      resolved: await Dispute.countDocuments({ parentId: req.user.id, status: 'resolved' }),
      dismissed: await Dispute.countDocuments({ parentId: req.user.id, status: 'dismissed' })
    };

    res.json({
      success: true,
      data: {
        disputes,
        statistics: stats,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalDisputes / parseInt(limit)),
          totalDisputes,
          hasNextPage: parseInt(page) < Math.ceil(totalDisputes / parseInt(limit)),
          hasPrevPage: parseInt(page) > 1,
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Get disputes error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching disputes',
      error: error.message
    });
  }
};

// Get parent's bookings for dispute creation
exports.getBookingsForDispute = async (req, res) => {
  try {
    const bookings = await Booking.find({
      parentId: req.user.id,
      status: { $in: ['requested', 'confirmed', 'completed'] }
    })
      .populate('tutorId', 'name email')
      .populate('subject', 'name')
      .sort({ sessionTime: -1 });

    res.json({
      success: true,
      data: bookings
    });

  } catch (error) {
    console.error('Get bookings for dispute error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching bookings',
      error: error.message
    });
  }
};

// Create a new dispute
exports.createDispute = async (req, res) => {
  try {
    const { bookingId, disputeType, title, description, priority = 'medium' } = req.body;

    if (!bookingId || !disputeType || !title || !description) {
      return res.status(400).json({
        success: false,
        message: 'Booking ID, dispute type, title, and description are required'
      });
    }

    // Verify the booking belongs to this parent
    const booking = await Booking.findById(bookingId);
    if (!booking || booking.parentId.toString() !== req.user.id) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found or access denied'
      });
    }

    // Check if dispute already exists for this booking
    const existingDispute = await Dispute.findOne({ bookingId });
    if (existingDispute) {
      return res.status(400).json({
        success: false,
        message: 'A dispute already exists for this booking'
      });
    }

    // Create the dispute
    const dispute = new Dispute({
      parentId: req.user.id,
      tutorId: booking.tutorId,
      bookingId,
      subjectId: booking.subject,
      disputeType,
      title,
      description,
      priority
    });

    await dispute.save();

    // Add initial message from parent
    await dispute.addMessage(req.user.id, 'parent', description);

    // Populate the created dispute
    const populatedDispute = await Dispute.findById(dispute._id)
      .populate('tutorId', 'name email')
      .populate('bookingId', 'sessionTime subject')
      .populate('subjectId', 'name');

    res.json({
      success: true,
      message: 'Dispute created successfully',
      data: populatedDispute
    });

  } catch (error) {
    console.error('Create dispute error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating dispute',
      error: error.message
    });
  }
};

// Get dispute details
exports.getDisputeDetails = async (req, res) => {
  try {
    const { disputeId } = req.params;

    const dispute = await Dispute.findById(disputeId)
      .populate('tutorId', 'name email')
      .populate('bookingId', 'sessionTime subject')
      .populate('subjectId', 'name')
      .populate('resolvedBy', 'name')
      .populate('messages.senderId', 'name');

    if (!dispute) {
      return res.status(404).json({
        success: false,
        message: 'Dispute not found'
      });
    }

    // Verify the parent has access to this dispute
    if (dispute.parentId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      data: dispute
    });

  } catch (error) {
    console.error('Get dispute details error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dispute details',
      error: error.message
    });
  }
};

// Add message to dispute
exports.addDisputeMessage = async (req, res) => {
  try {
    const { disputeId } = req.params;
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    const dispute = await Dispute.findById(disputeId);
    if (!dispute) {
      return res.status(404).json({
        success: false,
        message: 'Dispute not found'
      });
    }

    // Verify the parent has access to this dispute
    if (dispute.parentId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Add message
    await dispute.addMessage(req.user.id, 'parent', message);

    // Update dispute status to under_review if it was pending
    if (dispute.status === 'pending') {
      dispute.status = 'under_review';
      await dispute.save();
    }

    res.json({
      success: true,
      message: 'Message added successfully'
    });

  } catch (error) {
    console.error('Add dispute message error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding message',
      error: error.message
    });
  }
};

// Get all reviews for a specific tutor
exports.getTutorReviews = async (req, res) => {
  try {
    const { tutorId } = req.params;

    // Check if tutor exists
    const tutor = await User.findById(tutorId);
    if (!tutor || tutor.role !== 'tutor') {
      return res.status(404).json({
        success: false,
        message: 'Tutor not found'
      });
    }

    // Get all reviews for this tutor
    const reviews = await Review.find({ tutorId })
      .populate('parentId', 'name profileImage')
      .populate('subject', 'name _id')
      .sort({ createdAt: -1 });

    // Calculate average rating
    let averageRating = 0;
    if (reviews.length > 0) {
      const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
      averageRating = Math.round((totalRating / reviews.length) * 10) / 10;
    }

    res.json({
      success: true,
      data: {
        reviews,
        averageRating,
        totalReviews: reviews.length,
        tutor: {
          name: tutor.name,
          rating: tutor.rating,
          totalReviews: tutor.totalReviews
        }
      }
    });

  } catch (error) {
    console.error('Get tutor reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching reviews',
      error: error.message
    });
  }
};

// Get all subjects with tutor counts
exports.getSubjectsWithTutorCounts = async (req, res) => {
  try {
    const [subjects, tutors] = await Promise.all([
      Subject.find({}),
      User.find({
        role: 'tutor',
        isVerified: true
      }).select('subjects')
    ]);

    const subjectCounts = {};

    // Count tutors for each subject
    tutors.forEach(tutor => {
      if (tutor.subjects && tutor.subjects.length > 0) {
        tutor.subjects.forEach(subjectEntry => {
          // Make sure subjectEntry.subject exists and is an ObjectId
          if (subjectEntry.subject && subjectEntry.subject.toString) {
            const subjectId = subjectEntry.subject.toString();
            subjectCounts[subjectId] = (subjectCounts[subjectId] || 0) + 1;
          }
        });
      }
    });

    // Add counts to subjects
    const subjectsWithCounts = subjects.map(subject => ({
      ...subject.toObject(),
      tutorsCount: subjectCounts[subject._id.toString()] || 0
    }));

    res.json({
      success: true,
      data: {
        subjects: subjectsWithCounts,
        totalTutors: tutors.length
      }
    });
  } catch (error) {
    console.error('Get subjects with tutor counts error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching subjects with tutor counts',
      error: error.message
    });
  }
};