const mongoose = require('mongoose');

const BookmarkSubjectSchema = new mongoose.Schema({
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tutorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('BookmarkSubject', BookmarkSubjectSchema); 