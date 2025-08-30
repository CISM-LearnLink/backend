const { getOAuth2Client } = require('../utils/googleAuth');
const User = require('../models/User');
const { google } = require('googleapis');

// Redirect user to Google OAuth consent screen
exports.googleAuth = async (req, res) => {
  const { userId } = req.params;
  const oauth2Client = getOAuth2Client();
  // Get the user's email from the database
  const user = await User.findById(userId);
  if (!user) return res.status(404).send('User not found');
  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/userinfo.email'
  ];
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
    state: userId,
    login_hint: user.email // Pre-fill the email in the Google login
  });
  res.redirect(url);
};

// Handle OAuth callback, exchange code for tokens, and save to user
exports.googleCallback = async (req, res) => {
  const oauth2Client = getOAuth2Client();
  const { code, state } = req.query; // state = userId
  if (!code || !state) return res.status(400).send('Missing code or userId');
  try {
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.access_token) {
      return res.status(400).json({ success: false, message: 'No access token received from Google.' });
    }
    oauth2Client.setCredentials(tokens);
    // Get Google user's email
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: googleUser } = await oauth2.userinfo.get();
    // Get your user from DB
    const user = await User.findById(state);
    if (!user) return res.status(404).send('User not found');
    // Compare emails
    if (user.email.toLowerCase() !== googleUser.email.toLowerCase()) {
      return res.status(400).send('Google account email does not match your registered email.');
    }
    // Save tokens
    await User.findByIdAndUpdate(state, {
      googleAccessToken: tokens.access_token,
      googleRefreshToken: tokens.refresh_token
    });
    
    // Send HTML page with success message and redirect
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Google Calendar Connected</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #7ee3f2 0%, #14b8a6 100%);
            margin: 0;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
          }
          .success-card {
            background: white;
            border-radius: 16px;
            padding: 40px;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            max-width: 400px;
            width: 90%;
          }
          .success-icon {
            width: 80px;
            height: 80px;
            background: #14b8a6;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
            color: white;
            font-size: 40px;
          }
          .title {
            color: #1a202c;
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 12px;
          }
          .message {
            color: #4a5568;
            font-size: 16px;
            margin-bottom: 32px;
            line-height: 1.5;
          }
          .redirect-info {
            background: #f7fafc;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 24px;
          }
          .countdown {
            color: #14b8a6;
            font-weight: bold;
            font-size: 18px;
          }
          .progress-bar {
            width: 100%;
            height: 4px;
            background: #e2e8f0;
            border-radius: 2px;
            overflow: hidden;
            margin-top: 12px;
          }
          .progress-fill {
            height: 100%;
            background: #14b8a6;
            width: 0%;
            transition: width 0.1s linear;
          }
          .manual-link {
            color: #14b8a6;
            text-decoration: none;
            font-weight: 500;
          }
          .manual-link:hover {
            text-decoration: underline;
          }
        </style>
      </head>
      <body>
        <div class="success-card">
          <div class="success-icon">✓</div>
          <div class="title">Google Calendar Connected!</div>
          <div class="message">Your Google Calendar has been successfully connected to LearnLink.</div>
          
          <div class="redirect-info">
            <div>Redirecting to dashboard in <span id="countdown" class="countdown">3</span> seconds...</div>
            <div class="progress-bar">
              <div id="progress" class="progress-fill"></div>
            </div>
          </div>
          
          <div>
            <a href="http://localhost:5173/dashboard" class="manual-link">Click here if you're not redirected automatically</a>
          </div>
        </div>
        
        <script>
          let timeLeft = 3;
          const countdownElement = document.getElementById('countdown');
          const progressElement = document.getElementById('progress');
          
          const timer = setInterval(() => {
            timeLeft--;
            countdownElement.textContent = timeLeft;
            progressElement.style.width = ((3 - timeLeft) / 3 * 100) + '%';
            
            if (timeLeft <= 0) {
              clearInterval(timer);
              window.location.href = 'http://localhost:5173/dashboard';
            }
          }, 1000);
        </script>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get tokens', error: err.message });
  }
}; 