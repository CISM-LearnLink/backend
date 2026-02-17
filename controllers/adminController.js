// Admin Controller
// Handles user management, tutor verification, activity monitoring, disputes, and feedback

const User = require('../models/User');
const Booking = require('../models/Booking');
const Review = require('../models/Review');
const Message = require('../models/Message');
const Waitlist = require('../models/Waitlist');
const Dispute = require('../models/Dispute');
const Subject = require('../models/Subject');

// Security: Escape special regex characters to prevent NoSQL injection
const escapeRegex = (str) => {
  if (typeof str !== 'string') return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const mongoose = require('mongoose');

// Get all users with filtering and pagination
exports.getAllUsers = async (req, res) => {
  try {
    const rawQuery = req.query || {};
    const {
      role,
      status,
      search,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = rawQuery;

    // Build base search criteria (exclude deactivated by default)
    const searchCriteria = { status: { $ne: 'deactivated' } };

    // Whitelist validation for role
    const allowedRoles = ['parent', 'tutor', 'admin'];
    if (role && typeof role === 'string' && allowedRoles.includes(role)) {
      searchCriteria.role = role;
    }

    // Whitelist validation for status
    if (typeof status === 'string') {
      if (status === 'verified') {
        searchCriteria.isVerified = true;
      } else if (status === 'unverified') {
        searchCriteria.isVerified = false;
      } else if (status === 'rejected') {
        searchCriteria.status = 'rejected';
      } else if (status === 'deactivated') {
        searchCriteria.status = 'deactivated';
      }
    }

    // Validate and escape search input
    if (typeof search === 'string' && search.trim().length > 0) {
      // Limit search length to avoid abuse
      const safeSearch = search.trim().slice(0, 200);
      const escapedSearch = escapeRegex(safeSearch);
      searchCriteria.$or = [
        { name: { $regex: escapedSearch, $options: 'i' } },
        { email: { $regex: escapedSearch, $options: 'i' } },
        { location: { $regex: escapedSearch, $options: 'i' } }
      ];
    }

    // Pagination: enforce numeric and reasonable bounds
    const pg = Math.max(1, parseInt(page, 10) || 1);
    const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pg - 1) * lim;

    // Sort: whitelist allowed fields and orders to prevent malicious field injection
    const allowedSortFields = ['createdAt', 'name', 'email', 'role', 'rating', 'totalReviews'];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const sortOptions = { [sortField]: sortDirection };

    // Execute query with safe parameters
    const users = await User.find(searchCriteria)
      .select('-password')
      .populate('subjects.subject', 'name')
      .sort(sortOptions)
      .skip(skip)
      .limit(lim);

    // Get total count for pagination
    const totalUsers = await User.countDocuments(searchCriteria);

    // Get user statistics (unchanged semantics, safe as no user input is used here)
    const stats = {
      total: await User.countDocuments({ status: { $ne: 'deactivated' } }),
      parents: await User.countDocuments({ role: 'parent', status: { $ne: 'deactivated' } }),
      tutors: await User.countDocuments({ role: 'tutor', status: { $ne: 'deactivated' } }),
      verifiedTutors: await User.countDocuments({ role: 'tutor', isVerified: true, status: { $ne: 'deactivated' } }),
      unverifiedTutors: await User.countDocuments({ role: 'tutor', isVerified: false, status: { $ne: 'deactivated' } }),
      admins: await User.countDocuments({ role: 'admin', status: { $ne: 'deactivated' } }),
      rejected: await User.countDocuments({ status: 'rejected' }),
      deactivated: await User.countDocuments({ status: 'deactivated' })
    };

    const totalPages = Math.ceil(totalUsers / lim);

    res.json({
      success: true,
      data: {
        users,
        statistics: stats,
        pagination: {
          currentPage: pg,
          totalPages,
          totalUsers,
          hasNextPage: pg < totalPages,
          hasPrevPage: pg > 1,
          limit: lim
        }
      }
    });

  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users',
      error: error.message
    });
  }
};

// Get detailed user information
exports.getUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;

    // Validate userId to prevent injection and malformed queries
    if (!userId || typeof userId !== 'string' || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid userId parameter'
      });
    }

    const userObjectId = mongoose.Types.ObjectId(userId);

    const user = await User.findById(userObjectId).select('-password').populate('subjects.subject', 'name');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    let additionalData = {};

    if (user.role === 'tutor') {
      // Get tutor-specific data
      const totalBookings = await Booking.countDocuments({ tutorId: userObjectId });
      const completedBookings = await Booking.countDocuments({
        tutorId: userObjectId,
        status: 'completed'
      });
      const totalReviews = await Review.countDocuments({ tutorId: userObjectId });
      const averageRating = await Review.aggregate([
        { $match: { tutorId: user._id } },
        { $group: { _id: null, avgRating: { $avg: '$rating' } } }
      ]);

      additionalData = {
        totalBookings,
        completedBookings,
        totalReviews,
        averageRating: averageRating.length > 0 ? Math.round(averageRating[0].avgRating * 10) / 10 : 0
      };
    } else if (user.role === 'parent') {
      // Get parent-specific data
      const totalBookings = await Booking.countDocuments({ parentId: userObjectId });
      const completedBookings = await Booking.countDocuments({
        parentId: userObjectId,
        status: 'completed'
      });
      const totalReviews = await Review.countDocuments({ parentId: userObjectId });

      additionalData = {
        totalBookings,
        completedBookings,
        totalReviews
      };
    }

    res.json({
      success: true,
      data: {
        user,
        additionalData
      }
    });

  } catch (error) {
    console.error('Get user details error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user details',
      error: error.message
    });
  }
};

// Verify a tutor profile
exports.verifyTutor = async (req, res) => {
  try {
    const { tutorId } = req.params;
    const { action, reason, adminNotes } = req.body;

    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Action must be approve or reject'
      });
    }

    // Check if tutor exists
    const tutor = await User.findById(tutorId);
    if (!tutor || tutor.role !== 'tutor') {
      return res.status(404).json({
        success: false,
        message: 'Tutor not found'
      });
    }

    // Update verification status
    const updateData = {
      isVerified: action === 'approve',
      verificationDate: new Date(),
      adminNotes: adminNotes || '',
      status: action === 'approve' ? null : 'rejected'
    };

    if (action === 'reject' && reason) {
      updateData.rejectionReason = reason;
    }

    const updatedTutor = await User.findByIdAndUpdate(
      tutorId,
      updateData,
      { new: true }
    ).select('-password');

    // Log verification action
    console.log(`Tutor ${tutorId} ${action}ed by admin. Reason: ${reason || 'N/A'}`);

    res.json({
      success: true,
      message: `Tutor ${action}ed successfully`,
      data: { tutor: updatedTutor }
    });

  } catch (error) {
    console.error('Verify tutor error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying tutor',
      error: error.message
    });
  }
};

// Bulk verify tutors
exports.bulkVerifyTutors = async (req, res) => {
  try {
    const { tutorIds, action, reason, adminNotes } = req.body;

    if (!tutorIds || !Array.isArray(tutorIds) || tutorIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Tutor IDs array is required'
      });
    }

    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Action must be approve or reject'
      });
    }

    // Verify all tutors exist and are actually tutors
    const tutors = await User.find({
      _id: { $in: tutorIds },
      role: 'tutor'
    });

    if (tutors.length !== tutorIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Some tutor IDs are invalid or not tutors'
      });
    }

    // Update all tutors
    const updateData = {
      isVerified: action === 'approve',
      verificationDate: new Date(),
      adminNotes: adminNotes || '',
      status: action === 'approve' ? null : 'rejected'
    };

    if (action === 'reject' && reason) {
      updateData.rejectionReason = reason;
    }

    const result = await User.updateMany(
      { _id: { $in: tutorIds } },
      updateData
    );

    res.json({
      success: true,
      message: `${result.modifiedCount} tutors ${action}ed successfully`,
      data: {
        totalProcessed: result.modifiedCount,
        action,
        reason
      }
    });

  } catch (error) {
    console.error('Bulk verify tutors error:', error);
    res.status(500).json({
      success: false,
      message: 'Error bulk verifying tutors',
      error: error.message
    });
  }
};

// Monitor platform activity
exports.monitorActivity = async (req, res) => {
  try {
    const { period = '7d' } = req.query;

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();

    switch (period) {
      case '24h':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      default:
        startDate.setDate(startDate.getDate() - 7);
    }

    // Get activity statistics
    const newUsers = await User.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate }
    });

    const newBookings = await Booking.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate }
    });

    const completedBookings = await Booking.countDocuments({
      status: 'completed',
      updatedAt: { $gte: startDate, $lte: endDate }
    });

    const newReviews = await Review.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate }
    });

    const newMessages = await Message.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate }
    });

    // Get user registration trends
    const userTrends = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Get booking trends
    const bookingTrends = await Booking.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Get top performing tutors
    const topTutors = await User.aggregate([
      {
        $match: {
          role: 'tutor',
          isVerified: true
        }
      },
      {
        $lookup: {
          from: 'bookings',
          localField: '_id',
          foreignField: 'tutorId',
          as: 'bookings'
        }
      },
      {
        $lookup: {
          from: 'reviews',
          localField: '_id',
          foreignField: 'tutorId',
          as: 'reviews'
        }
      },
      {
        $addFields: {
          totalBookings: { $size: '$bookings' },
          completedBookings: {
            $size: {
              $filter: {
                input: '$bookings',
                cond: { $eq: ['$$this.status', 'completed'] }
              }
            }
          },
          averageRating: {
            $avg: '$reviews.rating'
          }
        }
      },
      {
        $sort: { completedBookings: -1, averageRating: -1 }
      },
      {
        $limit: 10
      },
      {
        $project: {
          name: 1,
          email: 1,
          subjects: 1,
          location: 1,
          totalBookings: 1,
          completedBookings: 1,
          averageRating: 1,
          rating: 1
        }
      }
    ]);

    // Populate subjects.subject for each tutor
    const populatedTopTutors = await User.populate(topTutors, { path: 'subjects.subject', select: 'name' });

    // Get platform health metrics
    const totalUsers = await User.countDocuments({ status: { $ne: 'deactivated' } });
    const totalTutors = await User.countDocuments({ role: 'tutor', status: { $ne: 'deactivated' } });
    const verifiedTutors = await User.countDocuments({ role: 'tutor', isVerified: true, status: { $ne: 'deactivated' } });
    const totalParents = await User.countDocuments({ role: 'parent', status: { $ne: 'deactivated' } });
    const totalBookings = await Booking.countDocuments({});
    const activeBookings = await Booking.countDocuments({
      status: { $in: ['requested', 'confirmed'] }
    });
    const totalReviews = await Review.countDocuments({});
    const flaggedReviews = await Review.countDocuments({ isFlagged: true });

    res.json({
      success: true,
      data: {
        period,
        dateRange: { startDate, endDate },
        activity: {
          newUsers,
          newBookings,
          completedBookings,
          newReviews,
          newMessages
        },
        trends: {
          userRegistration: userTrends,
          bookings: bookingTrends
        },
        topPerformers: {
          tutors: populatedTopTutors
        },
        platformHealth: {
          totalUsers,
          totalTutors,
          verifiedTutors,
          verificationRate: totalTutors > 0 ? (verifiedTutors / totalTutors * 100).toFixed(2) : 0,
          totalParents,
          totalBookings,
          activeBookings,
          totalReviews,
          flaggedReviews
        }
      }
    });

  } catch (error) {
    console.error('Monitor activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Error monitoring activity',
      error: error.message
    });
  }
};

// Handle user disputes
exports.handleDispute = async (req, res) => {
  try {
    const { bookingId, disputeType, description, resolution, adminNotes } = req.body;

    if (!bookingId || !disputeType || !description) {
      return res.status(400).json({
        success: false,
        message: 'Booking ID, dispute type, and description are required'
      });
    }

    // Check if booking exists
    const booking = await Booking.findById(bookingId)
      .populate('parentId', 'name email')
      .populate('tutorId', 'name email');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Create dispute record (you might want to create a separate Dispute model)
    const dispute = {
      bookingId,
      disputeType,
      description,
      resolution,
      adminNotes,
      status: resolution ? 'resolved' : 'pending',
      createdAt: new Date(),
      resolvedAt: resolution ? new Date() : null
    };

    // Update booking with dispute information
    const updatedBooking = await Booking.findByIdAndUpdate(
      bookingId,
      {
        dispute: dispute,
        status: resolution === 'refund' ? 'cancelled' : booking.status
      },
      { new: true }
    ).populate('parentId', 'name email')
      .populate('tutorId', 'name email');

    // Log dispute handling
    console.log(`Dispute handled for booking ${bookingId}: ${disputeType} - ${resolution || 'Pending'}`);

    res.json({
      success: true,
      message: 'Dispute handled successfully',
      data: {
        booking: updatedBooking,
        dispute
      }
    });

  } catch (error) {
    console.error('Handle dispute error:', error);
    res.status(500).json({
      success: false,
      message: 'Error handling dispute',
      error: error.message
    });
  }
};

// Get all disputes with filtering and pagination
exports.getAllDisputes = async (req, res) => {
  try {
    const {
      status,
      priority,
      disputeType,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build search criteria
    const searchCriteria = {};

    if (status) {
      searchCriteria.status = status;
    }

    if (priority) {
      searchCriteria.priority = priority;
    }

    if (disputeType) {
      searchCriteria.disputeType = disputeType;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Get disputes with pagination
    const disputes = await Dispute.find(searchCriteria)
      .populate('parentId', 'name email')
      .populate('tutorId', 'name email')
      .populate('bookingId', 'sessionTime subject')
      .populate('subjectId', 'name')
      .populate('resolvedBy', 'name')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const totalDisputes = await Dispute.countDocuments(searchCriteria);

    // Get dispute statistics
    const stats = {
      total: await Dispute.countDocuments({}),
      pending: await Dispute.countDocuments({ status: 'pending' }),
      under_review: await Dispute.countDocuments({ status: 'under_review' }),
      resolved: await Dispute.countDocuments({ status: 'resolved' }),
      dismissed: await Dispute.countDocuments({ status: 'dismissed' }),
      urgent: await Dispute.countDocuments({ priority: 'urgent' }),
      high: await Dispute.countDocuments({ priority: 'high' })
    };

    const totalPages = Math.ceil(totalDisputes / parseInt(limit));

    res.json({
      success: true,
      data: {
        disputes,
        statistics: stats,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalDisputes,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1,
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Get all disputes error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching disputes',
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

// Handle dispute resolution
exports.resolveDispute = async (req, res) => {
  try {
    const { disputeId } = req.params;
    const { resolution, resolutionType, adminNotes } = req.body;

    if (!resolution || !resolutionType) {
      return res.status(400).json({
        success: false,
        message: 'Resolution and resolution type are required'
      });
    }

    const dispute = await Dispute.findById(disputeId);
    if (!dispute) {
      return res.status(404).json({
        success: false,
        message: 'Dispute not found'
      });
    }

    // Resolve the dispute
    await dispute.resolve(resolution, resolutionType, adminNotes, req.user.id);

    // Populate the updated dispute
    const updatedDispute = await Dispute.findById(disputeId)
      .populate('parentId', 'name email')
      .populate('tutorId', 'name email')
      .populate('bookingId', 'sessionTime subject')
      .populate('subjectId', 'name')
      .populate('resolvedBy', 'name');

    res.json({
      success: true,
      message: 'Dispute resolved successfully',
      data: updatedDispute
    });

  } catch (error) {
    console.error('Resolve dispute error:', error);
    res.status(500).json({
      success: false,
      message: 'Error resolving dispute',
      error: error.message
    });
  }
};

// Add admin message to dispute
exports.addDisputeMessage = async (req, res) => {
  try {
    const { disputeId } = req.params;
    const { message, isInternal = false } = req.body;

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

    // Add admin message
    await dispute.addMessage(req.user.id, 'admin', message, isInternal);

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

// Update dispute priority
exports.updateDisputePriority = async (req, res) => {
  try {
    const { disputeId } = req.params;
    const { priority } = req.body;

    if (!priority || !['low', 'medium', 'high', 'urgent'].includes(priority)) {
      return res.status(400).json({
        success: false,
        message: 'Valid priority is required'
      });
    }

    const dispute = await Dispute.findByIdAndUpdate(
      disputeId,
      { priority },
      { new: true }
    ).populate('parentId', 'name email')
      .populate('tutorId', 'name email')
      .populate('bookingId', 'sessionTime subject')
      .populate('subjectId', 'name');

    if (!dispute) {
      return res.status(404).json({
        success: false,
        message: 'Dispute not found'
      });
    }

    res.json({
      success: true,
      message: 'Dispute priority updated successfully',
      data: dispute
    });

  } catch (error) {
    console.error('Update dispute priority error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating dispute priority',
      error: error.message
    });
  }
};

// Dismiss dispute
exports.dismissDispute = async (req, res) => {
  try {
    const { disputeId } = req.params;
    const { adminNotes } = req.body;

    const dispute = await Dispute.findById(disputeId);
    if (!dispute) {
      return res.status(404).json({
        success: false,
        message: 'Dispute not found'
      });
    }

    dispute.status = 'dismissed';
    dispute.adminNotes = adminNotes || dispute.adminNotes;
    dispute.resolvedBy = req.user.id;
    dispute.resolvedAt = new Date();
    await dispute.save();

    // Add admin message about dismissal
    await dispute.addMessage(req.user.id, 'admin', `Dispute dismissed. ${adminNotes || ''}`, true);

    const updatedDispute = await Dispute.findById(disputeId)
      .populate('parentId', 'name email')
      .populate('tutorId', 'name email')
      .populate('bookingId', 'sessionTime subject')
      .populate('subjectId', 'name')
      .populate('resolvedBy', 'name');

    res.json({
      success: true,
      message: 'Dispute dismissed successfully',
      data: updatedDispute
    });

  } catch (error) {
    console.error('Dismiss dispute error:', error);
    res.status(500).json({
      success: false,
      message: 'Error dismissing dispute',
      error: error.message
    });
  }
};

// Manage user feedback
exports.manageFeedback = async (req, res) => {
  try {
    const { reviewId, action, adminNotes } = req.body;

    if (!reviewId || !action) {
      return res.status(400).json({
        success: false,
        message: 'Review ID and action are required'
      });
    }

    if (!['approve', 'remove', 'flag'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Action must be approve, remove, or flag'
      });
    }

    // Check if review exists
    const review = await Review.findById(reviewId)
      .populate('parentId', 'name')
      .populate('tutorId', 'name');

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    let updateData = {
      adminNotes: adminNotes || '',
      adminAction: action,
      adminActionDate: new Date()
    };

    if (action === 'remove') {
      updateData.isRemoved = true;
    } else if (action === 'flag') {
      updateData.isFlagged = true;
    }

    const updatedReview = await Review.findByIdAndUpdate(
      reviewId,
      updateData,
      { new: true }
    ).populate('parentId', 'name')
      .populate('tutorId', 'name');

    // If review was removed, recalculate tutor's average rating
    if (action === 'remove') {
      const tutorReviews = await Review.find({
        tutorId: review.tutorId,
        isRemoved: { $ne: true }
      });

      const averageRating = tutorReviews.reduce((sum, rev) => sum + rev.rating, 0) / tutorReviews.length;

      await User.findByIdAndUpdate(review.tutorId, {
        rating: Math.round(averageRating * 10) / 10,
        totalReviews: tutorReviews.length
      });
    }

    res.json({
      success: true,
      message: `Review ${action}ed successfully`,
      data: { review: updatedReview }
    });

  } catch (error) {
    console.error('Manage feedback error:', error);
    res.status(500).json({
      success: false,
      message: 'Error managing feedback',
      error: error.message
    });
  }
};

// Get all reviews with admin management
exports.getAllReviews = async (req, res) => {
  try {
    const {
      status,
      rating,
      tutorId,
      parentId,
      page = 1,
      limit = 20
    } = req.query;

    const searchCriteria = {};

    if (status === 'flagged') {
      searchCriteria.isFlagged = true;
    } else if (status === 'removed') {
      searchCriteria.isRemoved = true;
    }

    if (rating) {
      searchCriteria.rating = parseInt(rating);
    }

    if (tutorId) {
      searchCriteria.tutorId = tutorId;
    }

    if (parentId) {
      searchCriteria.parentId = parentId;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const reviews = await Review.find(searchCriteria)
      .populate('parentId', 'name')
      .populate('tutorId', 'name')
      .populate('bookingId', 'subject sessionTime')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalReviews = await Review.countDocuments(searchCriteria);
    const totalPages = Math.ceil(totalReviews / parseInt(limit));

    // Get review statistics
    const stats = {
      total: await Review.countDocuments({}),
      flagged: await Review.countDocuments({ isFlagged: true }),
      removed: await Review.countDocuments({ isRemoved: true }),
      averageRating: await Review.aggregate([
        { $group: { _id: null, avgRating: { $avg: '$rating' } } }
      ]).then(result => result.length > 0 ? Math.round(result[0].avgRating * 10) / 10 : 0)
    };

    res.json({
      success: true,
      data: {
        reviews,
        statistics: stats,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalReviews,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1,
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Get all reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching reviews',
      error: error.message
    });
  }
};

// Get admin dashboard overview
exports.getDashboardOverview = async (req, res) => {
  try {
    // Get platform statistics
    const totalUsers = await User.countDocuments({ status: { $ne: 'deactivated' } });
    const totalTutors = await User.countDocuments({ role: 'tutor', status: { $ne: 'deactivated' } });
    const verifiedTutors = await User.countDocuments({ role: 'tutor', isVerified: true, status: { $ne: 'deactivated' } });
    const totalParents = await User.countDocuments({ role: 'parent', status: { $ne: 'deactivated' } });
    const totalBookings = await Booking.countDocuments({});
    const activeBookings = await Booking.countDocuments({
      status: { $in: ['requested', 'confirmed'] }
    });
    const totalReviews = await Review.countDocuments({});
    const flaggedReviews = await Review.countDocuments({ isFlagged: true });

    // Get recent activity
    const recentUsers = await User.find({
      status: { $ne: 'deactivated' }
    })
      .sort({ date: -1 })
      .limit(5)
      .select('name email role date');

    const recentBookings = await Booking.find({})
      .populate('parentId', 'name')
      .populate('tutorId', 'name')
      .sort({ createdAt: -1 })
      .limit(5);

    const pendingVerifications = await User.find({
      role: 'tutor',
      isVerified: { $ne: true },
      status: { $ne: 'deactivated' }
    })
      .populate('subjects.subject', 'name')
      .sort({ date: -1 })
      .limit(10)
      .select('name email subjects location date');

    const pendingDisputes = await Booking.find({
      'dispute.status': 'pending'
    })
      .populate('parentId', 'name')
      .populate('tutorId', 'name')
      .sort({ 'dispute.createdAt': -1 })
      .limit(5);

    res.json({
      success: true,
      data: {
        overview: {
          totalUsers,
          totalTutors,
          verifiedTutors,
          verificationRate: totalTutors > 0 ? (verifiedTutors / totalTutors * 100).toFixed(2) : 0,
          totalParents,
          totalBookings,
          activeBookings,
          totalReviews,
          flaggedReviews
        },
        recentActivity: {
          newUsers: recentUsers,
          newBookings: recentBookings
        },
        pendingActions: {
          verifications: pendingVerifications,
          disputes: pendingDisputes
        }
      }
    });

  } catch (error) {
    console.error('Get dashboard overview error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard overview',
      error: error.message
    });
  }
};

// Deactivate or reactivate user account
exports.updateUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { action, reason, adminNotes } = req.body;

    if (!action || !['activate', 'deactivate'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Action must be activate or deactivate'
      });
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update user status
    const updateData = {
      status: action === 'activate' ? null : 'deactivated',
      adminNotes: adminNotes || '',
      statusUpdateDate: new Date()
    };

    // If activating, also reset lockout counters
    if (action === 'activate') {
      updateData.lockoutUntil = null;
      updateData.failedLoginAttempts = 0;
    }

    if (action === 'deactivate' && reason) {
      updateData.deactivationReason = reason;
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true }
    ).select('-password').populate('subjects.subject', 'name');

    // Log status update
    console.log(`User ${userId} ${action}d by admin. Reason: ${reason || 'N/A'}`);

    res.json({
      success: true,
      message: `User ${action}d successfully`,
      data: { user: updatedUser }
    });

  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating user status',
      error: error.message
    });
  }
};

// Subjects Management Functions

// Get all subjects
exports.getAllSubjects = async (req, res) => {
  try {
    const subjects = await Subject.find({}).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: subjects
    });

  } catch (error) {
    console.error('Get all subjects error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching subjects',
      error: error.message
    });
  }
};

// Create a new subject
exports.createSubject = async (req, res) => {
  try {
    const { name } = req.body;
    let imageUrl = null;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Subject name is required'
      });
    }

    // Check if subject already exists
    const existingSubject = await Subject.findOne({ name: escapeRegex(name) });
    if (existingSubject) {
      return res.status(400).json({
        success: false,
        message: 'Subject with this name already exists'
      });
    }

    // Handle file upload
    if (req.file) {
      imageUrl = `/uploads/subjects/${req.file.filename}`;
    }

    const newSubject = new Subject({
      name,
      imageUrl
    });

    const savedSubject = await newSubject.save();

    res.status(201).json({
      success: true,
      message: 'Subject created successfully',
      data: savedSubject
    });

  } catch (error) {
    console.error('Create subject error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating subject',
      error: error.message
    });
  }
};

// Update a subject
exports.updateSubject = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const { name } = req.body;

    console.log('Update subject request:', { subjectId, name });

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Subject name is required'
      });
    }

    // Check if subject exists
    const existingSubject = await Subject.findById(subjectId);
    if (!existingSubject) {
      console.log('Subject not found:', subjectId);
      return res.status(404).json({
        success: false,
        message: 'Subject not found'
      });
    }

    // Check if new name conflicts with existing subject (excluding current subject)
    const nameConflict = await Subject.findOne({
      name: escapeRegex(name),
      _id: { $ne: subjectId }
    });

    if (nameConflict) {
      console.log('Name conflict found:', nameConflict.name);
      return res.status(400).json({
        success: false,
        message: 'Subject with this name already exists'
      });
    }

    // Handle file upload
    let imageUrl = existingSubject.imageUrl; // Keep existing image if no new file
    if (req.file) {
      imageUrl = `/uploads/subjects/${req.file.filename}`;
    }

    const updatedSubject = await Subject.findByIdAndUpdate(
      subjectId,
      { name, imageUrl },
      { new: true }
    );

    console.log('Subject updated successfully:', updatedSubject);

    res.json({
      success: true,
      message: 'Subject updated successfully',
      data: updatedSubject
    });

  } catch (error) {
    console.error('Update subject error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating subject',
      error: error.message
    });
  }
};

// Delete a subject
exports.deleteSubject = async (req, res) => {
  try {
    const { subjectId } = req.params;

    // Check if subject exists
    const existingSubject = await Subject.findById(subjectId);
    if (!existingSubject) {
      return res.status(404).json({
        success: false,
        message: 'Subject not found'
      });
    }

    // Check if subject is being used by any tutors
    const tutorsUsingSubject = await User.countDocuments({
      'subjects.subject': subjectId
    });

    if (tutorsUsingSubject > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete subject. It is being used by ${tutorsUsingSubject} tutor(s).`
      });
    }

    // Check if subject is being used in any bookings
    const bookingsUsingSubject = await Booking.countDocuments({
      subject: subjectId
    });

    if (bookingsUsingSubject > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete subject. It is being used in ${bookingsUsingSubject} booking(s).`
      });
    }

    await Subject.findByIdAndDelete(subjectId);

    res.json({
      success: true,
      message: 'Subject deleted successfully'
    });

  } catch (error) {
    console.error('Delete subject error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting subject',
      error: error.message
    });
  }
}; 