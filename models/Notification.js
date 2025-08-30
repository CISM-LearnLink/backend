const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Who receives the notification
  type: { type: String, required: true }, // e.g. 'booking', 'cancel', 'message', etc.
  message: { type: String, required: true },
  data: { type: Object }, // Extra info (bookingId, etc.)
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Notification', NotificationSchema); 