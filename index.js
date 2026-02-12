require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const { auth, adminAuth } = require('./middleware/auth');
const { uploadSubjectImage, uploadProfileImage, handleUploadError } = require('./middleware/upload');

const parentController = require('./controllers/parentController');
const tutorController = require('./controllers/tutorController');
const adminController = require('./controllers/adminController');

// Models (for reference, not used directly here)
require('./models/Booking');
require('./models/Review');
require('./models/Waitlist');
const helmet = require('helmet');
// require('./models/Message'); // Uncomment if Message.js is present
const { authLimiter, passwordResetLimiter, apiLimiter, refreshTokenLimiter } = require('./middleware/rateLimit');

const app = express();

// Connect Database
connectDB();

// Middleware
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));

const cookieParser = require('cookie-parser');

app.use(express.urlencoded({ extended: true }));


app.use(helmet());
// SECURITY: Strict Content Security Policy to mitigate XSS attacks
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: [
      "'self'",
      "'unsafe-inline'", // Required for React dev mode
      "https://www.google.com/recaptcha/",
      "https://www.gstatic.com/recaptcha/"
    ],
    styleSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline needed for inline styles
    imgSrc: ["'self'", "data:", "https:", "http:"],
    connectSrc: ["'self'"],
    frameSrc: ["https://www.google.com/recaptcha/"],
    objectSrc: ["'none'"],
    upgradeInsecureRequests: []
  }
}));
app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" }));
app.use(helmet.referrerPolicy({ policy: 'strict-origin-when-cross-origin' }));
app.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true }));
app.use(helmet.noSniff());
app.use(helmet.xssFilter());

app.use(cookieParser());
app.use(express.json());

// Serve static files from uploads directory
app.use('/uploads', express.static('uploads'));

// Apply general API rate limiter to all requests starting with /api
app.use('/api', apiLimiter);

// Parent routes
const parentRouter = express.Router();
parentRouter.get('/search-tutors', auth, parentController.searchTutors);
parentRouter.post('/book-session', auth, parentController.bookSession);
parentRouter.get('/bookings', auth, parentController.getBookings);
parentRouter.get('/tutor/:tutorId', auth, parentController.getTutorProfile);
parentRouter.get('/tutor/:tutorId/reviews', auth, parentController.getTutorReviews);
parentRouter.post('/review', auth, parentController.addReview);
parentRouter.post('/message', auth, parentController.sendMessage);
parentRouter.get('/messages/:tutorId', auth, parentController.getMessages);
parentRouter.get('/waitlist', auth, parentController.getWaitlist);
parentRouter.get('/dashboard', auth, parentController.getParentDashboard);
parentRouter.get('/tutor/:tutorId/busy-times', auth, parentController.getTutorBusyTimes);
parentRouter.get('/all-tutors/busy-times', auth, parentController.getAllTutorsBusyTimesForParent);
parentRouter.get('/similar-tutors', auth, parentController.getSimilarTutors);
parentRouter.post('/waitlist/cancel', auth, parentController.cancelWaitlist);
parentRouter.post('/bookings/cancel', auth, parentController.cancelBooking);
parentRouter.post('/recently-visited', auth, parentController.markRecentlyVisited);
parentRouter.post('/bookmark', auth, parentController.toggleBookmark);
parentRouter.get('/bookmarks', auth, parentController.getBookmarks);
parentRouter.get('/disputes', auth, parentController.getDisputes);
parentRouter.get('/bookings-for-dispute', auth, parentController.getBookingsForDispute);
parentRouter.post('/disputes', auth, parentController.createDispute);
parentRouter.get('/disputes/:disputeId', auth, parentController.getDisputeDetails);
parentRouter.post('/disputes/:disputeId/message', auth, parentController.addDisputeMessage);
parentRouter.get('/subjects-with-counts', auth, parentController.getSubjectsWithTutorCounts);
app.use('/api/parent', parentRouter);

// Tutor routes
const tutorRouter = express.Router();
tutorRouter.get('/profile', auth, tutorController.getProfile);
tutorRouter.put('/profile', auth, uploadProfileImage.single('profileImage'), handleUploadError, tutorController.updateProfile);
tutorRouter.post('/availability', auth, tutorController.setAvailability);
tutorRouter.get('/bookings', auth, tutorController.getBookings);
tutorRouter.post('/calendar/sync', auth, tutorController.syncCalendar);
tutorRouter.post('/booking/respond', auth, tutorController.respondBooking);
tutorRouter.get('/dashboard', auth, tutorController.getDashboardStats);
tutorRouter.get('/messages', auth, tutorController.getMessages);
tutorRouter.post('/messages/read', auth, tutorController.markMessagesAsRead);
tutorRouter.post('/message', auth, tutorController.sendMessage);
tutorRouter.get('/waitlist', auth, tutorController.getWaitlist);
tutorRouter.post('/waitlist/accept', auth, tutorController.acceptWaitlist);
tutorRouter.post('/waitlist/remove', auth, tutorController.removeWaitlist);
tutorRouter.post('/subjects', auth, tutorController.createSubject);
tutorRouter.get('/subjects', auth, tutorController.getSubjects);
tutorRouter.delete('/subjects/:subjectId', auth, tutorController.deleteSubject);
tutorRouter.get('/subjects/all', tutorController.getAllSubjects);
tutorRouter.put('/bookings/:bookingId/complete', auth, tutorController.markBookingCompleted);
tutorRouter.get('/calendar/auth', auth, tutorController.googleCalendarAuth);
tutorRouter.get('/calendar/oauth2callback', tutorController.googleCalendarCallback);
tutorRouter.get('/disputes', auth, tutorController.getDisputes);
tutorRouter.get('/bookings-for-dispute', auth, tutorController.getBookingsForDispute);
tutorRouter.post('/disputes', auth, tutorController.createDispute);
tutorRouter.get('/disputes/:disputeId', auth, tutorController.getDisputeDetails);
tutorRouter.post('/disputes/:disputeId/message', auth, tutorController.addDisputeMessage);
tutorRouter.get('/students', auth, tutorController.getStudents);
app.use('/api/tutor', tutorRouter);

// Admin routes - now using adminAuth middleware
const adminRouter = express.Router();
adminRouter.get('/users', adminAuth, adminController.getAllUsers);
adminRouter.get('/users/:userId', adminAuth, adminController.getUserDetails);
adminRouter.post('/verify-tutor/:tutorId', adminAuth, adminController.verifyTutor);
adminRouter.post('/verify-tutors', adminAuth, adminController.bulkVerifyTutors);
adminRouter.put('/users/:userId/status', adminAuth, adminController.updateUserStatus);
adminRouter.get('/activity', adminAuth, adminController.monitorActivity);
adminRouter.get('/disputes', adminAuth, adminController.getAllDisputes);
adminRouter.get('/disputes/:disputeId', adminAuth, adminController.getDisputeDetails);
adminRouter.post('/disputes/:disputeId/resolve', adminAuth, adminController.resolveDispute);
adminRouter.post('/disputes/:disputeId/message', adminAuth, adminController.addDisputeMessage);
adminRouter.put('/disputes/:disputeId/priority', adminAuth, adminController.updateDisputePriority);
adminRouter.post('/disputes/:disputeId/dismiss', adminAuth, adminController.dismissDispute);
adminRouter.post('/feedback', adminAuth, adminController.manageFeedback);
adminRouter.get('/reviews', adminAuth, adminController.getAllReviews);
adminRouter.get('/dashboard', adminAuth, adminController.getDashboardOverview);
adminRouter.get('/subjects', adminAuth, adminController.getAllSubjects);
adminRouter.post('/subjects', adminAuth, uploadSubjectImage.single('image'), handleUploadError, adminController.createSubject);
adminRouter.put('/subjects/:subjectId', adminAuth, uploadSubjectImage.single('image'), handleUploadError, adminController.updateSubject);
adminRouter.delete('/subjects/:subjectId', adminAuth, adminController.deleteSubject);
app.use('/api/admin', adminRouter);

// Auth routes
const authRouter = express.Router();
const authController = require('./controllers/authController');
const { verifyRecaptcha } = require('./middleware/recaptcha');

authRouter.post('/register', authLimiter, uploadProfileImage.single('profileImage'), handleUploadError, verifyRecaptcha, authController.registerUser);
authRouter.post('/login', authLimiter, verifyRecaptcha, authController.loginUser);
authRouter.post('/forgot-password', passwordResetLimiter, authController.requestPasswordReset);
authRouter.post('/reset-password', passwordResetLimiter, authController.resetPassword);
authRouter.get('/me', auth, authController.getMe);
authRouter.put('/me', auth, uploadProfileImage.single('profileImage'), handleUploadError, authController.updateMe);
authRouter.get('/refresh-token', refreshTokenLimiter, authController.refreshToken);
authRouter.post('/logout', authController.logoutUser);
app.use('/api/auth', authRouter);

app.get('/api/subjects', tutorController.getAllSubjects);

app.use('/api/google', require('./routes/google'));

const notificationRoutes = require('./routes/notification');
app.use('/api/notifications', notificationRoutes);

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`)); 