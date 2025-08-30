// Tutor Controller
// Handles profile management, availability, bookings, schedule, calendar sync, and booking responses

const User = require('../models/User');
const Booking = require('../models/Booking');
const Review = require('../models/Review');
const Message = require('../models/Message');
const Waitlist = require('../models/Waitlist');
const Subject = require('../models/Subject');
const { getOAuth2Client } = require('../utils/googleAuth');
const { google } = require('googleapis');
const { createNotification } = require('../utils/notification');
const Dispute = require('../models/Dispute');

// Get tutor profile
exports.getProfile = async (req, res) => {
  try {
    const tutorId = req.user.id;

    const tutor = await User.findById(tutorId)
      .select('-password')
      .populate('subjects');

    if (!tutor || tutor.role !== 'tutor') {
      return res.status(404).json({
        success: false,
        message: 'Tutor profile not found'
      });
    }

    // Get recent reviews
    const recentReviews = await Review.find({ tutorId })
      .populate('parentId', 'name profileImage')
      .sort({ createdAt: -1 })
      .limit(5);

    // Get booking statistics
    const totalBookings = await Booking.countDocuments({ tutorId });
    const completedBookings = await Booking.countDocuments({ 
      tutorId, 
      status: 'completed' 
    });
    const pendingBookings = await Booking.countDocuments({ 
      tutorId, 
      status: { $in: ['requested', 'confirmed'] } 
    });

    // Get earnings data (mock calculation - in real app, integrate with payment system)
    const completedSessions = await Booking.find({ 
      tutorId, 
      status: 'completed' 
    }).populate('parentId', 'name');

    const totalEarnings = completedSessions.reduce((sum, booking) => {
      // Mock calculation - in real app, get actual payment data
      return sum + (tutor.hourlyRate || 0);
    }, 0);

    const responseData = {
      ...tutor.toObject(),
      recentReviews,
      statistics: {
        totalBookings,
        completedBookings,
        pendingBookings,
        totalEarnings
      }
    };

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

// Update tutor profile
exports.updateProfile = async (req, res) => {
  try {
    const tutorId = req.user.id;
    const {
      name,
      subjects,
      expertise,
      location,
      bio,
      education,
      experience,
      profileImage
    } = req.body;

    // Parse JSON strings from FormData
    let parsedSubjects = [];
    let parsedExpertise = [];
    
    try {
      if (subjects) {
        parsedSubjects = JSON.parse(subjects);
      }
      if (expertise) {
        parsedExpertise = JSON.parse(expertise);
      }
    } catch (parseError) {
      console.error('Error parsing JSON from FormData:', parseError);
      return res.status(400).json({
        success: false,
        message: 'Invalid data format'
      });
    }

    // Validate required fields
    if (!name || !parsedSubjects || !Array.isArray(parsedSubjects) || !location) {
      return res.status(400).json({
        success: false,
        message: 'Name, subjects, and location are required'
      });
    }

    // Validate expertise (can be empty array but must be array)
    if (!Array.isArray(parsedExpertise)) {
      return res.status(400).json({
        success: false,
        message: 'Expertise must be an array'
      });
    }

    // Normalize and validate each subject entry
    const normalizedSubjects = parsedSubjects.map(s => ({
      subject: s.subject,
      hourlyRate: Number(s.hourlyRate),
      hours: s.hours !== undefined ? Number(s.hours) : 0,
      title: s.title || ''
    }));
    for (const s of normalizedSubjects) {
      if (!s.subject || !s.hourlyRate) {
        return res.status(400).json({
          success: false,
          message: 'Each subject must have a subject and hourlyRate.'
        });
      }
      if (s.hourlyRate <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Hourly rate for each subject must be greater than 0.'
        });
      }
      if (s.hours < 0) {
        return res.status(400).json({
          success: false,
          message: 'Hours for each subject must be 0 or more.'
        });
      }
    }

    // Check if tutor exists
    const existingTutor = await User.findById(tutorId);
    if (!existingTutor || existingTutor.role !== 'tutor') {
      return res.status(404).json({
        success: false,
        message: 'Tutor not found'
      });
    }

    // Handle profile image upload
    let profileImagePath = profileImage;
    if (req.file) {
      profileImagePath = `/uploads/profiles/${req.file.filename}`;
    }

    // Update profile
    const updatedTutor = await User.findByIdAndUpdate(
      tutorId,
      {
        name,
        subjects: normalizedSubjects,
        expertise: parsedExpertise,
        location,
        bio,
        education,
        experience,
        profileImage: profileImagePath
      },
      { new: true, runValidators: true }
    ).select('-password').populate('subjects.subject');

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { tutor: updatedTutor }
    });

  } catch (error) {
    console.error('Update tutor profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating tutor profile',
      error: error.message
    });
  }
};

// Set tutor availability
exports.setAvailability = async (req, res) => {
  try {
    const tutorId = req.user.id;
    const { availability } = req.body;

    // Validate availability data
    if (!availability || !Array.isArray(availability)) {
      return res.status(400).json({
        success: false,
        message: 'Availability array is required'
      });
    }

    // Validate each availability slot
    const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    
    for (const slot of availability) {
      if (!slot.day || !slot.startTime || !slot.endTime) {
        return res.status(400).json({
          success: false,
          message: 'Each availability slot must have day, startTime, and endTime'
        });
      }

      if (!validDays.includes(slot.day.toLowerCase())) {
        return res.status(400).json({
          success: false,
          message: `Invalid day: ${slot.day}. Must be one of: ${validDays.join(', ')}`
        });
      }

      // Validate time format (HH:MM)
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(slot.startTime) || !timeRegex.test(slot.endTime)) {
        return res.status(400).json({
          success: false,
          message: 'Time format must be HH:MM (24-hour format)'
        });
      }

      // Check if start time is before end time
      if (slot.startTime >= slot.endTime) {
        return res.status(400).json({
          success: false,
          message: 'Start time must be before end time'
        });
      }
    }

    // Check if tutor exists
    const existingTutor = await User.findById(tutorId);
    if (!existingTutor || existingTutor.role !== 'tutor') {
      return res.status(404).json({
        success: false,
        message: 'Tutor not found'
      });
    }

    // Update availability
    const updatedTutor = await User.findByIdAndUpdate(
      tutorId,
      { availability },
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      success: true,
      message: 'Availability updated successfully',
      data: { availability: updatedTutor.availability }
    });

  } catch (error) {
    console.error('Set availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Error setting availability',
      error: error.message
    });
  }
};

// Get all bookings for this tutor
exports.getBookings = async (req, res) => {
  try {
    const tutorId = req.user.id;
    const { status, page = 1, limit = 10 } = req.query;

    const searchCriteria = { tutorId };
    if (status) {
      searchCriteria.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const bookings = await Booking.find(searchCriteria)
      .populate('parentId', 'name email')
      .populate('subject')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalBookings = await Booking.countDocuments(searchCriteria);
    const totalPages = Math.ceil(totalBookings / parseInt(limit));

    // Get booking statistics
    const stats = {
      requested: await Booking.countDocuments({ tutorId, status: 'requested' }),
      confirmed: await Booking.countDocuments({ tutorId, status: 'confirmed' }),
      completed: await Booking.countDocuments({ tutorId, status: 'completed' }),
      cancelled: await Booking.countDocuments({ tutorId, status: 'cancelled' })
    };

    res.json({
      success: true,
      data: {
        bookings,
        statistics: stats,
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
    console.error('Get tutor bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching bookings',
      error: error.message
    });
  }
};

// Sync with external calendar (Google Calendar, Outlook, etc.)
exports.syncCalendar = async (req, res) => {
  try {
    const tutorId = req.user.id;
    const { calendarType, accessToken, calendarId } = req.body;

    // Validate required fields
    if (!calendarType || !accessToken) {
      return res.status(400).json({
        success: false,
        message: 'Calendar type and access token are required'
      });
    }

    // Check if tutor exists
    const existingTutor = await User.findById(tutorId);
    if (!existingTutor || existingTutor.role !== 'tutor') {
      return res.status(404).json({
        success: false,
        message: 'Tutor not found'
      });
    }

    // Mock calendar sync - in real implementation, integrate with actual calendar APIs
    let syncResult;
    
    switch (calendarType.toLowerCase()) {
      case 'google':
        // TODO: Implement Google Calendar API integration
        syncResult = {
          provider: 'Google Calendar',
          status: 'connected',
          lastSync: new Date(),
          eventsCount: 0,
          message: 'Google Calendar integration not yet implemented'
        };
        break;
        
      case 'outlook':
        // TODO: Implement Outlook Calendar API integration
        syncResult = {
          provider: 'Outlook Calendar',
          status: 'connected',
          lastSync: new Date(),
          eventsCount: 0,
          message: 'Outlook Calendar integration not yet implemented'
        };
        break;
        
      case 'ical':
        // TODO: Implement iCal file import
        syncResult = {
          provider: 'iCal',
          status: 'connected',
          lastSync: new Date(),
          eventsCount: 0,
          message: 'iCal integration not yet implemented'
        };
        break;
        
      default:
        return res.status(400).json({
          success: false,
          message: 'Unsupported calendar type. Supported types: google, outlook, ical'
        });
    }

    // Update tutor with calendar sync info
    await User.findByIdAndUpdate(tutorId, {
      calendarSync: {
        type: calendarType,
        lastSync: syncResult.lastSync,
        status: syncResult.status
      }
    });

    res.json({
      success: true,
      message: 'Calendar sync initiated',
      data: syncResult
    });

  } catch (error) {
    console.error('Calendar sync error:', error);
    res.status(500).json({
      success: false,
      message: 'Error syncing calendar',
      error: error.message
    });
  }
};

// Accept/decline booking requests
exports.respondBooking = async (req, res) => {
  try {
    const tutorId = req.user.id;
    const { bookingId, action, notes } = req.body;

    // Validate required fields
    if (!bookingId || !action) {
      return res.status(400).json({
        success: false,
        message: 'Booking ID and action are required'
      });
    }

    if (!['accept', 'decline', 'reschedule'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Action must be accept, decline, or reschedule'
      });
    }

    // Find the booking
    const booking = await Booking.findById(bookingId);
    if (!booking || booking.tutorId.toString() !== tutorId) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found or unauthorized'
      });
    }

    // Check if booking is in requested status
    if (booking.status !== 'requested') {
      return res.status(400).json({
        success: false,
        message: 'Can only respond to requested bookings'
      });
    }

    let newStatus;
    let message;

    switch (action) {
      case 'accept':
        newStatus = 'confirmed';
        message = 'Booking accepted successfully';
        
        // Check for conflicts with existing bookings
        const conflictingBooking = await Booking.findOne({
          tutorId,
          sessionTime: {
            $gte: new Date(booking.sessionTime.getTime() - 60 * 60 * 1000),
            $lte: new Date(booking.sessionTime.getTime() + 60 * 60 * 1000)
          },
          status: { $in: ['confirmed', 'requested'] },
          _id: { $ne: bookingId }
        });

        if (conflictingBooking) {
          return res.status(400).json({
            success: false,
            message: 'Time slot conflicts with another booking'
          });
        }
        break;

      case 'decline':
        newStatus = 'declined';
        message = 'Booking declined';
        break;

      case 'reschedule':
        newStatus = 'requested';
        message = 'Reschedule request sent to parent';
        // In a real implementation, you might want to create a reschedule request
        break;
    }

    // Update booking status
    const updatedBooking = await Booking.findByIdAndUpdate(
      bookingId,
      {
        status: newStatus,
        tutorNotes: notes
      },
      { new: true }
    ).populate('parentId', 'name email');

    // If booking was accepted, check waitlist for alternative tutors
    if (action === 'accept') {
      // Find waitlist entries for the same time slot
      const waitlistEntries = await Waitlist.find({
        subject: booking.subject,
        requestedTime: {
          $gte: new Date(booking.sessionTime.getTime() - 60 * 60 * 1000),
          $lte: new Date(booking.sessionTime.getTime() + 60 * 60 * 1000)
        }
      }).populate('tutorId', 'name subjects location rating');

      // Suggest alternative tutors to waitlisted parents
      if (waitlistEntries.length > 0) {
        // In a real implementation, you would send notifications to these parents
        console.log('Alternative tutors available for waitlisted parents:', waitlistEntries);
      }
    }

    await createNotification({
      user: booking.parentId,
      type: action, // 'accept', 'decline', etc.
      message: `Your booking was ${action}ed by the tutor.`,
      data: { bookingId: booking._id }
    });

    res.json({
      success: true,
      message,
      data: { booking: updatedBooking }
    });

  } catch (error) {
    console.error('Respond to booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Error responding to booking',
      error: error.message
    });
  }
};

// Get tutor dashboard statistics
exports.getDashboardStats = async (req, res) => {
  try {
    const tutorId = req.user.id;

    // Get booking statistics
    const totalBookings = await Booking.countDocuments({ tutorId });
    const completedBookings = await Booking.countDocuments({ 
      tutorId, 
      status: 'completed' 
    });
    const pendingBookings = await Booking.countDocuments({ 
      tutorId, 
      status: { $in: ['requested', 'confirmed'] } 
    });
    const cancelledBookings = await Booking.countDocuments({ 
      tutorId, 
      status: 'cancelled' 
    });

    // Get recent bookings
    const recentBookings = await Booking.find({ tutorId })
      .populate('parentId', 'name')
      .populate('subject')
      .sort({ createdAt: -1 })
      .limit(5);

    // Get recent reviews
    const recentReviews = await Review.find({ tutorId })
      .populate('parentId', 'name')
      .sort({ createdAt: -1 })
      .limit(3);

    // Get unread messages count
    const unreadMessages = await Message.countDocuments({
      receiverId: tutorId,
      isRead: false
    });

    // Calculate earnings (mock calculation)
    const completedSessions = await Booking.find({ 
      tutorId, 
      status: 'completed' 
    });
    
    const tutor = await User.findById(tutorId);
    const totalEarnings = completedSessions.length * (tutor.hourlyRate || 0);

    // Get this month's bookings
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const thisMonthBookings = await Booking.countDocuments({
      tutorId,
      createdAt: { $gte: startOfMonth }
    });

    res.json({
      success: true,
      data: {
        statistics: {
          totalBookings,
          completedBookings,
          pendingBookings,
          cancelledBookings,
          totalEarnings,
          thisMonthBookings,
          unreadMessages
        },
        recentBookings,
        recentReviews
      }
    });

  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard statistics',
      error: error.message
    });
  }
};

// Get tutor messages
exports.getMessages = async (req, res) => {
  try {
    const tutorId = req.user.id;
    const { parentId, page = 1, limit = 20 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    let searchCriteria;
    if (parentId) {
      searchCriteria = {
        $or: [
          { senderId: tutorId, receiverId: parentId },
          { senderId: parentId, receiverId: tutorId }
        ]
      };
    } else {
      searchCriteria = {
        $or: [
          { senderId: tutorId },
          { receiverId: tutorId }
        ]
      };
    }

    const messages = await Message.find(searchCriteria)
      .populate('senderId', 'name')
      .populate('receiverId', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalMessages = await Message.countDocuments(searchCriteria);
    const totalPages = Math.ceil(totalMessages / parseInt(limit));

    res.json({
      success: true,
      data: {
        messages: messages.reverse(), // Show oldest first
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
    console.error('Get tutor messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching messages',
      error: error.message
    });
  }
};

// Mark messages as read
exports.markMessagesAsRead = async (req, res) => {
  try {
    const tutorId = req.user.id;
    const { messageIds } = req.body;

    if (!messageIds || !Array.isArray(messageIds)) {
      return res.status(400).json({
        success: false,
        message: 'Message IDs array is required'
      });
    }

    // Mark messages as read
    await Message.updateMany(
      {
        _id: { $in: messageIds },
        receiverId: tutorId
      },
      { isRead: true }
    );

    res.json({
      success: true,
      message: 'Messages marked as read'
    });

  } catch (error) {
    console.error('Mark messages as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking messages as read',
      error: error.message
    });
  }
};

// Send message to parent
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

    // Check if receiver exists and is a parent
    const receiver = await User.findById(receiverId);
    if (!receiver || receiver.role !== 'parent') {
      return res.status(404).json({
        success: false,
        message: 'Parent not found'
      });
    }

    // If bookingId is provided, verify it belongs to the sender
    if (bookingId) {
      const booking = await Booking.findById(bookingId);
      if (!booking || booking.tutorId.toString() !== senderId) {
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

// --- Tutor Waitlist Management ---
// Get all waitlist entries for this tutor
exports.getWaitlist = async (req, res) => {
  try {
    const tutorId = req.user.id;
    const waitlistEntries = await Waitlist.find({ tutorId })
      .populate('parentId', 'name email')
      .sort({ requestedTime: 1 });
    res.json({
      success: true,
      data: { waitlistEntries }
    });
  } catch (error) {
    console.error('Get tutor waitlist error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching waitlist',
      error: error.message
    });
  }
};

// Accept a waitlist entry (convert to booking if possible)
exports.acceptWaitlist = async (req, res) => {
  try {
    const tutorId = req.user.id;
    const { waitlistId, sessionTime } = req.body;
    const waitlistEntry = await Waitlist.findById(waitlistId);
    if (!waitlistEntry || waitlistEntry.tutorId.toString() !== tutorId) {
      return res.status(404).json({ success: false, message: 'Waitlist entry not found' });
    }
    // Use provided sessionTime or default to waitlist's requestedTime
    const bookingTime = sessionTime ? new Date(sessionTime) : waitlistEntry.requestedTime;
    // Check for booking conflict
    const conflict = await Booking.findOne({
      tutorId,
      sessionTime: {
        $gte: new Date(bookingTime.getTime() - 60 * 60 * 1000),
        $lte: new Date(bookingTime.getTime() + 60 * 60 * 1000)
      },
      status: { $in: ['requested', 'confirmed'] }
    });
    if (conflict) {
      return res.status(400).json({ success: false, message: 'Time slot is still not available' });
    }
    // Create booking
    const booking = new Booking({
      parentId: waitlistEntry.parentId,
      tutorId,
      sessionTime: bookingTime,
      subject: waitlistEntry.subject,
      status: 'requested'
    });
    await booking.save();
    // Remove from waitlist
    await Waitlist.findByIdAndDelete(waitlistId);
    await createNotification({
      user: waitlistEntry.parentId,
      type: 'waitlist-accept',
      message: `Your waitlist request was accepted and a booking was created.`,
      data: { bookingId: booking._id }
    });
    res.json({ success: true, message: 'Booking created and waitlist entry removed', data: { booking } });
  } catch (error) {
    console.error('Accept waitlist error:', error);
    res.status(500).json({ success: false, message: 'Error accepting waitlist', error: error.message });
  }
};

// Remove a waitlist entry
exports.removeWaitlist = async (req, res) => {
  try {
    const tutorId = req.user.id;
    const { waitlistId } = req.body;
    const waitlistEntry = await Waitlist.findById(waitlistId);
    if (!waitlistEntry || waitlistEntry.tutorId.toString() !== tutorId) {
      return res.status(404).json({ success: false, message: 'Waitlist entry not found' });
    }
    await Waitlist.findByIdAndDelete(waitlistId);
    await createNotification({
      user: waitlistEntry.parentId,
      type: 'waitlist-remove',
      message: `Your waitlist entry was removed by the tutor.`,
      data: { waitlistId }
    });
    res.json({ success: true, message: 'Waitlist entry removed' });
  } catch (error) {
    console.error('Remove waitlist error:', error);
    res.status(500).json({ success: false, message: 'Error removing waitlist', error: error.message });
  }
};

// --- Tutor Subject Management ---
// Create a subject
exports.createSubject = async (req, res) => {
  try {
    const tutorId = req.user.id;
    const { name, imageUrl } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Subject name is required' });
    }
    // Check if subject already exists
    let subject = await Subject.findOne({ name });
    if (subject) {
      // Add tutorId to tutorIds array if not already present
      if (!subject.tutorIds.includes(tutorId)) {
        subject.tutorIds.push(tutorId);
        await subject.save();
      }
    } else {
      subject = new Subject({ name, imageUrl, tutorIds: [tutorId] });
      await subject.save();
    }
    res.status(201).json({ success: true, data: { subject } });
  } catch (error) {
    console.error('Create subject error:', error);
    res.status(500).json({ success: false, message: 'Error creating subject', error: error.message });
  }
};

// Get all subjects for this tutor
exports.getSubjects = async (req, res) => {
  try {
    const tutorId = req.user.id;
    const subjects = await Subject.find({ tutorIds: tutorId });
    res.json({ success: true, data: { subjects } });
  } catch (error) {
    console.error('Get subjects error:', error);
    res.status(500).json({ success: false, message: 'Error fetching subjects', error: error.message });
  }
};

// Delete a subject
exports.deleteSubject = async (req, res) => {
  try {
    const tutorId = req.user.id;
    const { subjectId } = req.params;
    const subject = await Subject.findById(subjectId);
    if (!subject) {
      return res.status(404).json({ success: false, message: 'Subject not found' });
    }
    // Check for bookings with this subject and tutor
    const hasBooking = await Booking.findOne({ tutorId, subject: subjectId });
    if (hasBooking) {
      return res.status(400).json({ success: false, message: 'Cannot remove subject: you have bookings for this subject.' });
    }
    // Check for waitlist entries with this subject and tutor
    const hasWaitlist = await Waitlist.findOne({ tutorId, subject: subjectId });
    if (hasWaitlist) {
      return res.status(400).json({ success: false, message: 'Cannot remove subject: you have waitlist entries for this subject.' });
    }
    // Remove tutorId from tutorIds array
    subject.tutorIds = subject.tutorIds.filter(id => id.toString() !== tutorId);
    if (subject.tutorIds.length === 0) {
      await Subject.deleteOne({ _id: subjectId });
    } else {
      await subject.save();
    }
    res.json({ success: true, message: 'Subject updated or deleted' });
  } catch (error) {
    console.error('Delete subject error:', error);
    res.status(500).json({ success: false, message: 'Error deleting subject', error: error.message });
  }
};

// Get all subjects in the collection (public)
exports.getAllSubjects = async (req, res) => {
  try {
    const subjects = await Subject.find({});
    res.json({ success: true, data: { subjects } });
  } catch (error) {
    console.error('Get all subjects error:', error);
    res.status(500).json({ success: false, message: 'Error fetching all subjects', error: error.message });
  }
};

// Mark a booking as completed
exports.markBookingCompleted = async (req, res) => {
  try {
    const tutorId = req.user.id;
    const { bookingId } = req.params;
    const booking = await Booking.findById(bookingId);
    if (!booking || booking.tutorId.toString() !== tutorId) {
      return res.status(404).json({ success: false, message: 'Booking not found or unauthorized' });
    }
    if (booking.status !== 'confirmed') {
      return res.status(400).json({ success: false, message: 'Only confirmed bookings can be marked as completed' });
    }
    booking.status = 'completed';
    await booking.save();
    await createNotification({
      user: booking.parentId,
      type: 'completed',
      message: `Your session was marked as completed by the tutor.`,
      data: { bookingId: booking._id }
    });
    res.json({ success: true, message: 'Booking marked as completed', data: { booking } });
  } catch (error) {
    console.error('Mark booking completed error:', error);
    res.status(500).json({ success: false, message: 'Error marking booking as completed', error: error.message });
  }
};

// --- Google Calendar OAuth2 ---
// GET /api/tutor/calendar/auth
exports.googleCalendarAuth = (req, res) => {
  const oauth2Client = getOAuth2Client();
  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events'
  ];
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });
  res.redirect(url);
};

// GET /api/tutor/calendar/oauth2callback
exports.googleCalendarCallback = async (req, res) => {
  const oauth2Client = getOAuth2Client();
  const { code } = req.query;
  if (!code) return res.status(400).send('No code provided');
  try {
    const { tokens } = await oauth2Client.getToken(code);
    // TODO: Save tokens to the tutor's profile in DB for future use
    res.json({ success: true, tokens });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get tokens', error: err.message });
  }
};

// Get tutor's disputes
exports.getDisputes = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let query = { tutorId: req.user.id };
    if (status) {
      query.status = status;
    }

    const disputes = await Dispute.find(query)
      .populate('parentId', 'name email')
      .populate('bookingId', 'sessionTime subject')
      .populate('subjectId', 'name')
      .populate('resolvedBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalDisputes = await Dispute.countDocuments(query);

    // Get dispute statistics
    const stats = {
      total: await Dispute.countDocuments({ tutorId: req.user.id }),
      pending: await Dispute.countDocuments({ tutorId: req.user.id, status: 'pending' }),
      under_review: await Dispute.countDocuments({ tutorId: req.user.id, status: 'under_review' }),
      resolved: await Dispute.countDocuments({ tutorId: req.user.id, status: 'resolved' }),
      dismissed: await Dispute.countDocuments({ tutorId: req.user.id, status: 'dismissed' })
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

// Get tutor's bookings for dispute creation
exports.getBookingsForDispute = async (req, res) => {
  try {
    const bookings = await Booking.find({
      tutorId: req.user.id,
      status: { $in: ['requested', 'confirmed', 'completed'] }
    })
      .populate('parentId', 'name email')
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

    // Verify the booking belongs to this tutor
    const booking = await Booking.findById(bookingId);
    if (!booking || booking.tutorId.toString() !== req.user.id) {
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
      parentId: booking.parentId,
      tutorId: req.user.id,
      bookingId,
      subjectId: booking.subject,
      disputeType,
      title,
      description,
      priority
    });

    await dispute.save();

    // Add initial message from tutor
    await dispute.addMessage(req.user.id, 'tutor', description);

    // Populate the created dispute
    const populatedDispute = await Dispute.findById(dispute._id)
      .populate('parentId', 'name email')
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
      .populate('parentId', 'name email')
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

    // Verify the tutor has access to this dispute
    if (dispute.tutorId.toString() !== req.user.id) {
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

    // Verify the tutor has access to this dispute
    if (dispute.tutorId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Add message
    await dispute.addMessage(req.user.id, 'tutor', message);

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

// Get all students (parents) who have booked sessions with this tutor
exports.getStudents = async (req, res) => {
  try {
    const tutorId = req.user.id;

    // Get all bookings for this tutor with status requested, confirmed, or completed
    const bookings = await Booking.find({
      tutorId,
      status: { $in: ['requested', 'confirmed', 'completed'] }
    })
      .populate('parentId', 'name childName childAge childGrade childLearningGoals')
      .populate('subject', 'name')
      .sort({ sessionTime: -1 });

    // Group bookings by parent and get the latest booking for each
    const studentsMap = new Map();

    bookings.forEach(booking => {
      const parentId = booking.parentId._id.toString();
      
      if (!studentsMap.has(parentId)) {
        studentsMap.set(parentId, {
          parentId: parentId,
          parentName: booking.parentId.name,
          childName: booking.parentId.childName,
          childAge: booking.parentId.childAge,
          childGrade: booking.parentId.childGrade,
          childLearningGoals: booking.parentId.childLearningGoals,
          subject: booking.subject.name,
          latestBooking: {
            sessionTime: booking.sessionTime,
            status: booking.status,
            bookingId: booking._id
          },
          totalSessions: 1
        });
      } else {
        const student = studentsMap.get(parentId);
        student.totalSessions += 1;
        
        // Update latest booking if this booking is more recent
        if (new Date(booking.sessionTime) > new Date(student.latestBooking.sessionTime)) {
          student.latestBooking = {
            sessionTime: booking.sessionTime,
            status: booking.status,
            bookingId: booking._id
          };
        }
      }
    });

    const students = Array.from(studentsMap.values());

    res.json({
      success: true,
      data: students
    });

  } catch (error) {
    console.error('Get students error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching students',
      error: error.message
    });
  }
}; 