const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema({
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tutorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sessionTime: { type: Date, required: true },
  subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  notes: { type: String },
  status: { type: String, enum: ['requested', 'confirmed', 'declined', 'completed', 'cancelled'], default: 'requested' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Booking', BookingSchema); 