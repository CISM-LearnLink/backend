# Password Reset Setup Guide

## Overview
The password reset functionality uses Mailtrap for email testing and OTP verification.

## Setup Instructions

### 1. Mailtrap Configuration
1. Go to [Mailtrap.io](https://mailtrap.io) and create a free account
2. Create a new inbox
3. Go to the inbox settings and copy your SMTP credentials
4. Add the following environment variables to your `.env` file:

```env
MAILTRAP_USER=your_mailtrap_username
MAILTRAP_PASS=your_mailtrap_password
```

### 2. Features
- **Forgot Password Page**: Users enter their email to receive an OTP
- **OTP Verification**: 6-digit code sent via email with 10-minute expiration
- **Password Reset**: Users enter OTP and new password
- **Resend OTP**: Option to resend the verification code
- **Security**: OTP tokens are automatically cleaned up after expiration

### 3. API Endpoints
- `POST /api/auth/forgot-password` - Request password reset OTP
- `POST /api/auth/reset-password` - Verify OTP and reset password

### 4. Frontend Routes
- `/forgot-password` - Enter email to receive OTP
- `/reset-password` - Enter OTP and new password

### 5. Email Template
The system sends a beautifully formatted HTML email with:
- LearnLink branding
- 6-digit OTP code
- 10-minute expiration notice
- Security instructions

### 6. Testing
1. Start the server: `npm run dev`
2. Start the client: `npm run dev`
3. Navigate to any login page and click "Forgot password?"
4. Enter a registered email address
5. Check your Mailtrap inbox for the OTP
6. Use the OTP to reset your password

### 7. Security Features
- OTP expires after 10 minutes
- Only one active OTP per email at a time
- Automatic cleanup of expired tokens
- Password strength validation
- Secure password hashing with bcrypt

## Troubleshooting
- Ensure Mailtrap credentials are correctly set in `.env`
- Check server logs for email sending errors
- Verify the email address exists in the database
- Make sure the server is running on port 5001 