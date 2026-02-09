const mongoose = require('mongoose');

const disputeSchema = new mongoose.Schema({
  // Basic dispute information
  disputeType: {
    type: String,
    required: true,
    enum: ['payment', 'quality', 'scheduling', 'behavior', 'technical', 'other']
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  status: {
    type: String,
    default: 'pending',
    enum: ['pending', 'under_review', 'resolved', 'dismissed']
  },
  priority: {
    type: String,
    default: 'medium',
    enum: ['low', 'medium', 'high', 'urgent']
  },

  // Parties involved
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  tutorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true
  },

  // Subject information
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true
  },

  // Resolution details
  resolution: {
    type: String,
    trim: true,
    maxlength: 500
  },
  resolutionType: {
    type: String,
    enum: ['refund', 'partial_refund', 'reschedule', 'credit', 'dismiss', 'warning', 'other']
  },
  adminNotes: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolvedAt: {
    type: Date
  },

  // Evidence and attachments
  evidence: [{
    type: {
      type: String,
      enum: ['message', 'screenshot', 'document', 'other']
    },
    description: String,
    url: String,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Messages between parties and admin
  messages: [{
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    senderRole: {
      type: String,
      enum: ['parent', 'tutor', 'admin'],
      required: true
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000
    },
    isInternal: {
      type: Boolean,
      default: false // For admin-only notes
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for better query performance
disputeSchema.index({ parentId: 1, status: 1 });
disputeSchema.index({ tutorId: 1, status: 1 });
disputeSchema.index({ bookingId: 1 });
disputeSchema.index({ status: 1, priority: 1 });
disputeSchema.index({ createdAt: -1 });

// Pre-save middleware to update updatedAt
disputeSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// Virtual for dispute age
disputeSchema.virtual('age').get(function () {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24)); // Days
});

// Method to add message
disputeSchema.methods.addMessage = function (senderId, senderRole, message, isInternal = false) {
  this.messages.push({
    senderId,
    senderRole,
    message,
    isInternal
  });
  return this.save();
};

// Method to resolve dispute
disputeSchema.methods.resolve = function (resolution, resolutionType, adminNotes, resolvedBy) {
  this.status = 'resolved';
  this.resolution = resolution;
  this.resolutionType = resolutionType;
  this.adminNotes = adminNotes;
  this.resolvedBy = resolvedBy;
  this.resolvedAt = new Date();
  return this.save();
};

// Static method to get disputes for a user
disputeSchema.statics.getUserDisputes = function (userId, userRole) {
  const query = userRole === 'parent' ? { parentId: userId } : { tutorId: userId };
  return this.find(query)
    .populate('parentId', 'name email')
    .populate('tutorId', 'name email')
    .populate('bookingId', 'sessionTime subject')
    .populate('subjectId', 'name')
    .populate('resolvedBy', 'name')
    .sort({ createdAt: -1 });
};

