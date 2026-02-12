const { google } = require("googleapis");

let googleSecrets = null;

try {
  googleSecrets = require("./client_secret_955947755002-996k377jeeg89e3f0c8dr8c6tcmc7bvc.apps.googleusercontent.com.json");
} catch (err) {
  console.warn("⚠ Google credentials not found. Google auth disabled.");
}

function getOAuth2Client() {
  if (!googleSecrets) return null;

  const { client_id, client_secret } = googleSecrets.web;

  return new google.auth.OAuth2(
    client_id,
    client_secret,
    `${process.env.VITE_API_URL}/api/google/callback`, // <-- wrap in backticks
  );
}

function getOAuth2ClientForLogin() {
  if (!googleSecrets) return null;

  const { client_id, client_secret } = googleSecrets.web;
  const BASE_URL = process.env.BASE_URL || "http://localhost:5001";

  return new google.auth.OAuth2(
    client_id,
    client_secret,
    `${BASE_URL}/api/google/login/callback`, // <-- wrap in backticks
  );
}

module.exports = { getOAuth2Client, getOAuth2ClientForLogin };
