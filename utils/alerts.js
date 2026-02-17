const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.ADMIN_EMAIL,
    pass: process.env.EMAIL_PASSWORD,
  },
});

async function sendAlert(subject, message) {
  try {
    await transporter.sendMail({
      from: process.env.ADMIN_EMAIL,
      to: process.env.SECURITY_TEAM_EMAIL,
      subject,
      text: message,
    });
    console.log("Security alert sent successfully");
  } catch (error) {
    console.error("Failed to send security alert:", error);
  }
}

module.exports = { sendAlert };
