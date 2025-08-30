const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['parent', 'tutor', 'admin'], default: 'parent' },
  date: { type: Date, default: Date.now },
  status: { type: String, enum: [null, 'rejected', 'deactivated'], default: null },
  
  // Parent-specific fields (child details)
  childName: { type: String },
  childAge: { type: Number },
  childGrade: { type: String },
  childPreferredSubjects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }],
  childLearningGoals: { type: String },
  childSpecialNeeds: { type: String },
  
  // Tutor-specific fields
  subjects: [{
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    hours: { type: Number, default: 0 },
    hourlyRate: { type: Number, required: true },
    title: { type: String, default: '' }
  }],
  expertise: [{ type: String }],
  location: { type: String },
  bio: { type: String },
  education: { type: String },
  experience: { type: String },
  availability: [{
    day: { type: String, enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] },
    startTime: { type: String },
    endTime: { type: String }
  }],
  rating: { type: Number, default: 0 },
  totalReviews: { type: Number, default: 0 },
  isVerified: { type: Boolean, default: false },
  profileImage: { type: String },
  googleAccessToken: { type: String },
  googleRefreshToken: { type: String },
  recentlyVisited: [{
    tutorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
    visitedAt: { type: Date, default: Date.now }
  }]
});

module.exports = mongoose.model('User', UserSchema); 