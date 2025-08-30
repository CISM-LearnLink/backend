const mongoose = require('mongoose');

const PasswordResetSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: true 
  },
  otp: { 
    type: String, 
    required: true 
  },
  expiresAt: { 
    type: Date, 
    required: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Index for automatic cleanup of expired tokens
PasswordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('PasswordReset', PasswordResetSchema); 