const { google } = require('googleapis');

function getOAuth2Client() {
  const client_id = process.env.GOOGLE_CLIENT_ID;
  const client_secret = process.env.GOOGLE_CLIENT_SECRET;
  const redirect_uri = process.env.GOOGLE_REDIRECT_URI || `${process.env.VITE_API_URL}/api/google/callback`;

  return new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uri
  );
}

// For Google Login 
function getOAuth2ClientForLogin() {
  const client_id = process.env.GOOGLE_CLIENT_ID;
  const client_secret = process.env.GOOGLE_CLIENT_SECRET;
  const BASE_URL = process.env.BASE_URL || 'http://localhost:5001';

  return new google.auth.OAuth2(
    client_id,
    client_secret,
    `${BASE_URL}/api/google/login/callback`
  );
}

module.exports = { getOAuth2Client, getOAuth2ClientForLogin };