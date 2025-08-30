const nodemailer = require('nodemailer');

// Create transporter for Mailtrap
const transporter = nodemailer.createTransport({
  host: 'sandbox.smtp.mailtrap.io',
  port: 2525,
  auth: {
    user: process.env.MAILTRAP_USER || 'your_mailtrap_user',
    pass: process.env.MAILTRAP_PASS || 'your_mailtrap_password'
  }
});

// Generate a random 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send OTP email
const sendOTPEmail = async (email, otp) => {
  const mailOptions = {
    from: '"LearnLink" <noreply@learnlink.com>',
    to: email,
    subject: 'Password Reset OTP - LearnLink',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #14b8a6 0%, #0ea5e9 100%); padding: 30px; border-radius: 10px; text-align: center; margin-bottom: 20px;">
          <h1 style="color: white; margin: 0; font-size: 28px;">LearnLink</h1>
          <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">Password Reset Request</p>
        </div>
        
        <div style="background: #f8f9fa; padding: 30px; border-radius: 10px; margin-bottom: 20px;">
          <h2 style="color: #333; margin-bottom: 20px;">Reset Your Password</h2>
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            You have requested to reset your password. Please use the following OTP (One-Time Password) to complete the reset process:
          </p>
          
          <div style="background: #14b8a6; color: white; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <h1 style="margin: 0; font-size: 32px; letter-spacing: 5px; font-weight: bold;">${otp}</h1>
          </div>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            This OTP will expire in <strong>10 minutes</strong>. If you didn't request this password reset, please ignore this email.
          </p>
        </div>
        
        <div style="text-align: center; color: #999; font-size: 14px;">
          <p>This is an automated message, please do not reply to this email.</p>
          <p>&copy; 2024 LearnLink. All rights reserved.</p>
        </div>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    return false;
  }
};

module.exports = {
  transporter,
  generateOTP,
  sendOTPEmail
}; 