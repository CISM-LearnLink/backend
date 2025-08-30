const Notification = require('../models/Notification');

async function createNotification({ user, type, message, data }) {
  return Notification.create({ user, type, message, data });
}
 
module.exports = { createNotification }; 