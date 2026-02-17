const User = require("../models/User");
const PasswordReset = require("../models/PasswordReset");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { generateOTP, sendOTPEmail } = require("../utils/emailConfig");
const { sendSecurityAlert } = require("../utils/alerts");

// Helper function to hash refresh tokens before storage
const hashToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

// Use environment variable for JWT_SECRET
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn("WARNING: JWT_SECRET is not defined in environment variables.");
}

// Generate Access and Refresh Tokens
const sendTokenResponse = async (user, statusCode, res) => {
  // Create Access Token (Short-lived: 15m)
  const accessToken = jwt.sign(
    { user: { id: user.id, role: user.role, tokenVersion: user.tokenVersion } },
    process.env.JWT_SECRET,
    { expiresIn: "15m" },
  );

  // Create Refresh Token (Long-lived: 7d)
  const refreshToken = jwt.sign(
    { user: { id: user.id, tokenVersion: user.tokenVersion } },
    process.env.JWT_SECRET,
    { expiresIn: "7d" },
  );

  // Hash refresh token before storing in database (SECURITY: Prevent token theft on DB breach)
  const hashedRefreshToken = hashToken(refreshToken);
  user.refreshToken = hashedRefreshToken;
  await user.save();

  // Set Cookie Options
  const options = {
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    httpOnly: true, // Prevent JS access
    secure: process.env.NODE_ENV === "production", // Only send over HTTPS in production
    sameSite: "strict",
  };

  res
    .status(statusCode)
    .cookie("refreshToken", refreshToken, options)
    .json({
      success: true,
      token: accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
};

exports.registerUser = async (req, res) => {
  // --- Start of Debugging Logs for Register ---
  console.log("--- [Auth Controller] Received a request to /register ---");
  console.log(`Timestamp: ${new Date().toISOString()}`);
  // Removed sensitive log: console.log('Request Body:', req.body);
  console.log("Subjects field type:", typeof req.body.subjects);
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
    childSpecialNeeds,
  } = req.body;
  try {
    let user = await User.findOne({ email });
    if (user) {
      console.log(
        `[Auth Controller] Registration failed: User with email ${email} already exists.`,
      );
      return res.status(400).json({ msg: "User already exists" });
    }
    // Build user object - Strictly enforce role to be 'parent' or 'tutor'
    // Prevent anyone from registering as 'admin' via public API
    const safeRole = role === "tutor" ? "tutor" : "parent";
    const userData = { name, email, password, role: safeRole };

    // Handle profile image upload
    if (req.file) {
      userData.profileImage = `/uploads/profiles/${req.file.filename}`;
    }

    if (safeRole === "tutor") {
      if (education) userData.education = education;
      if (bio) userData.bio = bio;
      if (location) userData.location = location;
      if (experience) userData.experience = experience;
      if (subjects) {
        try {
          // Parse subjects if it's a JSON string (from FormData)
          const subjectsData =
            typeof subjects === "string" ? JSON.parse(subjects) : subjects;
          if (Array.isArray(subjectsData)) {
            userData.subjects = subjectsData;
            console.log(
              "[Auth Controller] Subjects processed successfully:",
              subjectsData,
            );
          }
        } catch (err) {
          console.error("[Auth Controller] Error parsing subjects:", err);
        }
      }
    }
    if (safeRole === "parent") {
      if (preferredSubjects && Array.isArray(preferredSubjects)) {
        userData.preferredSubjects = preferredSubjects;
      }
      // Add child details
      if (childName) userData.childName = childName;
      if (childAge) userData.childAge = childAge;
      if (childGrade) userData.childGrade = childGrade;
      if (childPreferredSubjects) {
        let parsedSubjects = childPreferredSubjects;
        if (typeof childPreferredSubjects === "string") {
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
    // Removed sensitive log: console.log('[Auth Controller] Final userData before saving:', JSON.stringify(userData, null, 2));
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    await user.save();
    console.log(
      `[Auth Controller] Registration successful: New user created with ID ${user.id}`,
    );

    const payload = {
      user: { id: user.id, role: user.role, tokenVersion: user.tokenVersion },
    };
    await sendTokenResponse(user, 201, res);
  } catch (err) {
    console.error(
      "[Auth Controller] CRITICAL ERROR during registration:",
      err.message,
    );
    res.status(500).send("Server error");
  }
};

exports.loginUser = async (req, res) => {
  // --- Start of Debugging Logs for Login ---
  console.log("--- [Auth Controller] Received a request to /login ---");
  console.log(`Timestamp: ${new Date().toISOString()}`);
  // Removed sensitive log: console.log('Request Body:', req.body);
  // --- End of Debugging Logs ---

  const { email, password, role } = req.body;
  try {
    if (!email) {
      return res.status(400).json({ msg: "Email is required" });
    }
    if (!password) {
      return res.status(400).json({ msg: "Password is required" });
    }
    const user = await User.findOne({ email });
    if (!user) {
      console.log(
        `[Auth Controller] Login failed: No user found with email ${email}.`,
      );
      return res.status(400).json({ msg: "Invalid Credentials" });
    }

    // Check if account is deactivated
    if (user.status === "deactivated") {
      console.log(
        `[Auth Controller] Login failed: Account ${email} is deactivated.`,
      );
      return res
        .status(400)
        .json({ msg: "Account has been deactivated. Please contact support." });
    }

    // Check if user has admin role - if so, allow login regardless of requested role
    if (user.role === "admin") {
      console.log(
        `[Auth Controller] Admin user ${email} logging in. Admin access granted.`,
      );
    } else {
      // Validate role if provided and user is not admin
      if (role && user.role !== role) {
        console.log(
          `[Auth Controller] Login failed: Role mismatch for user ${email}. Expected ${role}, found ${user.role}.`,
        );
        return res.status(400).json({ msg: "Invalid Credentials" });
      }
    }

    // Check if account is locked
    if (user.lockoutUntil && user.lockoutUntil > Date.now()) {
      const remainingTime = Math.ceil((user.lockoutUntil - Date.now()) / 60000);
      console.log(
        `[Auth Controller] Login failed: Account ${email} is temporarily locked.`,
      );
      return res
        .status(403)
        .json({
          msg: `Account is temporarily locked. Please try again in ${remainingTime} minutes.`,
        });
    }

    // If lockout has expired, reset failed attempts counter
    if (user.lockoutUntil && user.lockoutUntil <= Date.now()) {
      user.failedLoginAttempts = 0;
      user.lockoutUntil = null;
      await user.save();
      console.log(
        `[Auth Controller] Lockout expired for ${email}, failed attempts reset.`,
      );
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      // Increment failed login attempts
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;

      // Check if max attempts reached (e.g., 5 attempts)
      if (user.failedLoginAttempts >= 5) {
        user.lockoutUntil = Date.now() + 15 * 60 * 1000; // 15 minutes lock
        await user.save();

        const remainingTime = Math.ceil(
          (user.lockoutUntil - Date.now()) / 60000,
        );

        console.log(
          `[Auth Controller] Account ${email} locked due to too many failed attempts.`,
        );

        // Security alerts trigger
        await sendSecurityAlert(
          "SECURITY ALERT: Account Locked Due to Failed Logins",
          `
    User Email: ${email}
    Time: ${new Date().toISOString()}
    Failed Attempts: ${user.failedLoginAttempts}
    Lock Duration: 15 minutes
    `,
        );

        return res.status(403).json({
          msg: `Account locked due to multiple failed login attempts. Please try again in ${remainingTime} minutes.`,
        });
      }

      await user.save();

      console.log(
        `[Auth Controller] Login failed: Password does not match for user ${email}. Attempts: ${user.failedLoginAttempts}`,
      );
      return res.status(400).json({ msg: "Invalid Credentials" });
    }

    // Reset failed attempts and lockout on successful login
    if (user.failedLoginAttempts > 0 || user.lockoutUntil) {
      user.failedLoginAttempts = 0;
      user.lockoutUntil = null;
      await user.save();
    }

    console.log(
      `[Auth Controller] Login successful: User ${email} authenticated with role ${user.role}.`,
    );
    const payload = {
      user: { id: user.id, role: user.role, tokenVersion: user.tokenVersion },
    };
    await sendTokenResponse(user, 200, res);
  } catch (err) {
    console.error(
      "[Auth Controller] CRITICAL ERROR during login:",
      err.message,
    );
    res.status(500).send("Server error");
  }
};

// Get current user profile
exports.getMe = async (req, res) => {
  try {
    let user = await User.findById(req.user.id).select("-password");
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    // Populate childPreferredSubjects if user is a parent
    if (
      user.role === "parent" &&
      user.childPreferredSubjects &&
      user.childPreferredSubjects.length > 0
    ) {
      user = await User.findById(req.user.id)
        .select("-password")
        .populate("childPreferredSubjects", "name _id");
    }

    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
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
      childSpecialNeeds,
    } = req.body;
    const user = await User.findById(req.user.id);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    // Update basic fields
    if (name) user.name = name;
    if (location !== undefined) user.location = location;

    // Handle profile image upload
    if (req.file) {
      user.profileImage = `/uploads/profiles/${req.file.filename}`;
    }

    // Update child details if user is a parent
    if (user.role === "parent") {
      if (childName !== undefined) user.childName = childName;
      if (childAge !== undefined) user.childAge = childAge;
      if (childGrade !== undefined) user.childGrade = childGrade;
      if (childPreferredSubjects) {
        let parsedSubjects = childPreferredSubjects;
        if (typeof childPreferredSubjects === "string") {
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
      if (childLearningGoals !== undefined)
        user.childLearningGoals = childLearningGoals;
      if (childSpecialNeeds !== undefined)
        user.childSpecialNeeds = childSpecialNeeds;
    }

    await user.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Request password reset (send OTP)
exports.requestPasswordReset = async (req, res) => {
  console.log("--- [Auth Controller] Received password reset request ---");
  console.log("Request Body:", req.body);

  const { email } = req.body;

  try {
    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      console.log(
        `[Auth Controller] Password reset failed: No user found with email ${email}`,
      );
      return res
        .status(404)
        .json({ msg: "No account found with this email address" });
    }

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes (NIST recommendation)

    // Delete any existing reset tokens for this email
    await PasswordReset.deleteMany({ email });

    // Save new reset token
    const passwordReset = new PasswordReset({
      email,
      otp,
      expiresAt,
    });
    await passwordReset.save();

    // Send OTP email
    const emailSent = await sendOTPEmail(email, otp);
    if (!emailSent) {
      console.log(`[Auth Controller] Failed to send OTP email to ${email}`);
      return res
        .status(500)
        .json({ msg: "Failed to send reset email. Please try again." });
    }

    console.log(
      `[Auth Controller] Password reset OTP sent successfully to ${email}`,
    );
    res.json({ msg: "Password reset OTP sent to your email" });
  } catch (err) {
    console.error(
      "[Auth Controller] Error in requestPasswordReset:",
      err.message,
    );
    res.status(500).json({ msg: "Server error" });
  }
};

// Verify OTP and reset password
exports.resetPassword = async (req, res) => {
  console.log("--- [Auth Controller] Received password reset verification ---");
  console.log("Request Body:", req.body);

  const { email, otp, newPassword } = req.body;

  try {
    // Find the reset token
    const resetToken = await PasswordReset.findOne({
      email,
      otp,
      expiresAt: { $gt: new Date() },
    });

    if (!resetToken) {
      console.log(`[Auth Controller] Invalid or expired OTP for ${email}`);
      return res.status(400).json({ msg: "Invalid or expired OTP" });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      console.log(
        `[Auth Controller] User not found for password reset: ${email}`,
      );
      return res.status(404).json({ msg: "User not found" });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    // Increment tokenVersion to invalidate all existing tokens
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    // Delete the used reset token
    await PasswordReset.deleteOne({ _id: resetToken._id });

    console.log(`[Auth Controller] Password reset successful for ${email}`);
    res.json({ msg: "Password reset successful" });
  } catch (err) {
    console.error("[Auth Controller] Error in resetPassword:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
};

// Refresh Access Token
exports.refreshToken = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res
        .status(401)
        .json({ success: false, message: "No refresh token provided" });
    }

    // Verify token
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

    // Find user
    const user = await User.findById(decoded.user.id);

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "User not found" });
    }

    // Hash the incoming token and compare with stored hash (SECURITY: Tokens are hashed in DB)
    const hashedIncomingToken = hashToken(refreshToken);
    if (user.refreshToken !== hashedIncomingToken) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid refresh token" });
    }

    // Check token version (for password reset invalidation)
    if (user.tokenVersion !== decoded.user.tokenVersion) {
      return res
        .status(401)
        .json({
          success: false,
          message: "Token is invalid (password changed)",
        });
    }

    // Issue new tokens
    await sendTokenResponse(user, 200, res);
  } catch (err) {
    console.error("Refresh Token Error:", err.message);
    return res
      .status(401)
      .json({ success: false, message: "Invalid refresh token" });
  }
};

// Logout User
exports.logoutUser = async (req, res) => {
  try {
    // Clear cookie
    res.cookie("refreshToken", "none", {
      expires: new Date(Date.now() + 10 * 1000),
      httpOnly: true,
    });

    const refreshToken = req.cookies.refreshToken;
    if (refreshToken) {
      try {
        const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
        const user = await User.findById(decoded.user.id);
        if (user) {
          // SECURITY: Clear refresh token AND increment version to invalidate all access tokens
          user.refreshToken = "";
          user.tokenVersion = (user.tokenVersion || 0) + 1;
          await user.save();
          console.log(
            `[Auth Controller] User ${user.email} logged out. Token version incremented to ${user.tokenVersion}.`,
          );
        }
      } catch (e) {
        // Ignore verification errors on logout
      }
    }

    res.status(200).json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    console.error("[Auth Controller] Logout error:", err.message);
    res.status(500).json({ success: false, message: "Logout failed" });
  }
};
