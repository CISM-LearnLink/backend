const { google } = require('googleapis');
const googleSecrets = require('./client_secret_955947755002-996k377jeeg89e3f0c8dr8c6tcmc7bvc.apps.googleusercontent.com.json');

function getOAuth2Client() {
  const { client_id, client_secret } = googleSecrets.web;
  return new google.auth.OAuth2(
    client_id,
    client_secret,
    `${process.env.VITE_API_URL}/api/google/callback`
  );
}

module.exports = { getOAuth2Client }; 