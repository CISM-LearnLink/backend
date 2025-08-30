const User = require('../models/User');
const PasswordReset = require('../models/PasswordReset');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { generateOTP, sendOTPEmail } = require('../utils/emailConfig');

// It's highly recommended to store your JWT_SECRET in an environment variable (.env file)
// instead of hardcoding it.
// const JWT_SECRET = process.env.JWT_SECRET;
const JWT_SECRET = 'bD4$9Yz2R!wJkX@70t3vLpA1qMeNgZxu';

exports.registerUser = async (req, res) => {
  // --- Start of Debugging Logs for Register ---
  console.log('--- [Auth Controller] Received a request to /register ---');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('Request Body:', req.body);
  console.log('Subjects field type:', typeof req.body.subjects);
  console.log('Subjects field value:', req.body.subjects);
  // --- End of Debugging Logs ---

  const { 
    name, 
    email, 
    password, 
    role, 
    education, 
    bio, 
    location, 
    experience, 
    subjects, 
    preferredSubjects,
    // Child details for parents
    childName,
    childAge,
    childGrade,
    childPreferredSubjects,
    childLearningGoals,
    childSpecialNeeds
  } = req.body;
  try {
    let user = await User.findOne({ email });
    if (user) {
      console.log(`[Auth Controller] Registration failed: User with email ${email} already exists.`);
      return res.status(400).json({ msg: 'User already exists' });
    }
    // Build user object
    const userData = { name, email, password, role };
    
    // Handle profile image upload
    if (req.file) {
      userData.profileImage = `/uploads/profiles/${req.file.filename}`;
    }
    
    if (role === 'tutor') {
      if (education) userData.education = education;
      if (bio) userData.bio = bio;
      if (location) userData.location = location;
      if (experience) userData.experience = experience;
      if (subjects) {
        try {
          // Parse subjects if it's a JSON string (from FormData)
          const subjectsData = typeof subjects === 'string' ? JSON.parse(subjects) : subjects;
          if (Array.isArray(subjectsData)) {
            userData.subjects = subjectsData;
            console.log('[Auth Controller] Subjects processed successfully:', subjectsData);
          }
        } catch (err) {
          console.error('[Auth Controller] Error parsing subjects:', err);
        }
      }
    }
    if (role === 'parent') {
      if (preferredSubjects && Array.isArray(preferredSubjects)) {
        userData.preferredSubjects = preferredSubjects;
      }
      // Add child details
      if (childName) userData.childName = childName;
      if (childAge) userData.childAge = childAge;
      if (childGrade) userData.childGrade = childGrade;
      if (childPreferredSubjects) {
        let parsedSubjects = childPreferredSubjects;
        if (typeof childPreferredSubjects === 'string') {
          try {
            parsedSubjects = JSON.parse(childPreferredSubjects);
          } catch (e) {
            parsedSubjects = [];
          }
        }
        if (Array.isArray(parsedSubjects)) {
          userData.childPreferredSubjects = parsedSubjects;
        }
      }
      if (childLearningGoals) userData.childLearningGoals = childLearningGoals;
      if (childSpecialNeeds) userData.childSpecialNeeds = childSpecialNeeds;
    }
    user = new User(userData);
    console.log('[Auth Controller] Final userData before saving:', JSON.stringify(userData, null, 2));
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    await user.save();
    console.log(`[Auth Controller] Registration successful: New user created with ID ${user.id}`);
    
    const payload = { user: { id: user.id, role: user.role } };
    jwt.sign(
      payload,
      JWT_SECRET,
      { expiresIn: '7d' },
      (err, token) => {
        if (err) throw err;
        res.json({ token });
      }
    );
  } catch (err) {
    console.error('[Auth Controller] CRITICAL ERROR during registration:', err.message);
    res.status(500).send('Server error');
  }
};

exports.loginUser = async (req, res) => {
  // --- Start of Debugging Logs for Login ---
  console.log('--- [Auth Controller] Received a request to /login ---');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('Request Body:', req.body);
  // --- End of Debugging Logs ---

  const { email, password, role } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      console.log(`[Auth Controller] Login failed: No user found with email ${email}.`);
      return res.status(400).json({ msg: 'Invalid Credentials' });
    }
    
    // Check if account is deactivated
    if (user.status === 'deactivated') {
      console.log(`[Auth Controller] Login failed: Account ${email} is deactivated.`);
      return res.status(400).json({ msg: 'Account has been deactivated. Please contact support.' });
    }
    
    // Check if user has admin role - if so, allow login regardless of requested role
    if (user.role === 'admin') {
      console.log(`[Auth Controller] Admin user ${email} logging in. Admin access granted.`);
    } else {
      // Validate role if provided and user is not admin
      if (role && user.role !== role) {
        console.log(`[Auth Controller] Login failed: Role mismatch for user ${email}. Expected ${role}, found ${user.role}.`);
        return res.status(400).json({ msg: 'Invalid Credentials' });
      }
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log(`[Auth Controller] Login failed: Password does not match for user ${email}.`);
      return res.status(400).json({ msg: 'Invalid Credentials' });
    }

    console.log(`[Auth Controller] Login successful: User ${email} authenticated with role ${user.role}.`);
    const payload = { user: { id: user.id, role: user.role } };
    jwt.sign(
      payload,
      JWT_SECRET,
      { expiresIn: '7d' },
      (err, token) => {
        if (err) throw err;
        res.json({ token });
      }
    );
  } catch (err) {
    console.error('[Auth Controller] CRITICAL ERROR during login:', err.message);
    res.status(500).send('Server error');
  }
};

// Get current user profile
exports.getMe = async (req, res) => {
  try {
    let user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    
    // Populate childPreferredSubjects if user is a parent
    if (user.role === 'parent' && user.childPreferredSubjects && user.childPreferredSubjects.length > 0) {
      user = await User.findById(req.user.id)
        .select('-password')
        .populate('childPreferredSubjects', 'name _id');
    }
    
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Update current user profile (name, location, child details for parents)
exports.updateMe = async (req, res) => {
  try {
    const { 
      name, 
      location,
      // Child details for parents
      childName,
      childAge,
      childGrade,
      childPreferredSubjects,
      childLearningGoals,
      childSpecialNeeds
    } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    
    // Update basic fields
    if (name) user.name = name;
    if (location !== undefined) user.location = location;
    
    // Handle profile image upload
    if (req.file) {
      user.profileImage = `/uploads/profiles/${req.file.filename}`;
    }
    
    // Update child details if user is a parent
    if (user.role === 'parent') {
      if (childName !== undefined) user.childName = childName;
      if (childAge !== undefined) user.childAge = childAge;
      if (childGrade !== undefined) user.childGrade = childGrade;
      if (childPreferredSubjects) {
        let parsedSubjects = childPreferredSubjects;
        if (typeof childPreferredSubjects === 'string') {
          try {
            parsedSubjects = JSON.parse(childPreferredSubjects);
          } catch (e) {
            parsedSubjects = [];
          }
        }
        if (Array.isArray(parsedSubjects)) {
          user.childPreferredSubjects = parsedSubjects;
        }
      }
      if (childLearningGoals !== undefined) user.childLearningGoals = childLearningGoals;
      if (childSpecialNeeds !== undefined) user.childSpecialNeeds = childSpecialNeeds;
    }
    
    await user.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Request password reset (send OTP)
exports.requestPasswordReset = async (req, res) => {
  console.log('--- [Auth Controller] Received password reset request ---');
  console.log('Request Body:', req.body);

  const { email } = req.body;
  
  try {
    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      console.log(`[Auth Controller] Password reset failed: No user found with email ${email}`);
      return res.status(404).json({ msg: 'No account found with this email address' });
    }

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Delete any existing reset tokens for this email
    await PasswordReset.deleteMany({ email });

    // Save new reset token
    const passwordReset = new PasswordReset({
      email,
      otp,
      expiresAt
    });
    await passwordReset.save();

    // Send OTP email
    const emailSent = await sendOTPEmail(email, otp);
    if (!emailSent) {
      console.log(`[Auth Controller] Failed to send OTP email to ${email}`);
      return res.status(500).json({ msg: 'Failed to send reset email. Please try again.' });
    }

    console.log(`[Auth Controller] Password reset OTP sent successfully to ${email}`);
    res.json({ msg: 'Password reset OTP sent to your email' });
  } catch (err) {
    console.error('[Auth Controller] Error in requestPasswordReset:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
};

// Verify OTP and reset password
exports.resetPassword = async (req, res) => {
  console.log('--- [Auth Controller] Received password reset verification ---');
  console.log('Request Body:', req.body);

  const { email, otp, newPassword } = req.body;
  
  try {
    // Find the reset token
    const resetToken = await PasswordReset.findOne({ 
      email, 
      otp,
      expiresAt: { $gt: new Date() }
    });

    if (!resetToken) {
      console.log(`[Auth Controller] Invalid or expired OTP for ${email}`);
      return res.status(400).json({ msg: 'Invalid or expired OTP' });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      console.log(`[Auth Controller] User not found for password reset: ${email}`);
      return res.status(404).json({ msg: 'User not found' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    // Delete the used reset token
    await PasswordReset.deleteOne({ _id: resetToken._id });

    console.log(`[Auth Controller] Password reset successful for ${email}`);
    res.json({ msg: 'Password reset successful' });
  } catch (err) {
    console.error('[Auth Controller] Error in resetPassword:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
};