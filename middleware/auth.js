const jwt = require('jsonwebtoken');
const User = require('../models/User');

// JWT Authentication Middleware
const auth = async (req, res, next) => {
  let token = null;
  // Try to get token from Authorization header or cookies
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }
  if (!token) {
    return res.status(401).json({ success: false, message: 'No token, authorization denied' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.user.id).select('-password');
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    // SECURITY: Check if account is deactivated
    if (req.user.status === 'deactivated') {
      return res.status(403).json({
        success: false,
        message: 'Account has been deactivated. Please contact support.'
      });
    }

    // Check for token invalidation (password reset or logout)
    if (decoded.user.tokenVersion !== undefined &&
      req.user.tokenVersion !== undefined &&
      decoded.user.tokenVersion !== req.user.tokenVersion) {
      return res.status(401).json({ success: false, message: 'Token is invalid (password changed or logged out)' });
    }

    next();
  } catch (err) {
    res.status(401).json({ success: false, message: 'Token is not valid' });
  }
};

// Admin Authorization Middleware
const adminAuth = async (req, res, next) => {
  try {
    // First check if user is authenticated
    await auth(req, res, () => { });

    // Then check if user has admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }

    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Authentication failed' });
  }
};

module.exports = { auth, adminAuth };