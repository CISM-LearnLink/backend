const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const verifyBookingOwnership = require('../middleware/verifyBookingOwnership');
const bookingController = require('../controller/bookingController');

// View booking
router.get(
  '/:id',
  verifyToken,
  verifyBookingOwnership,
  bookingController.getBookingById
);

// Cancel booking
router.delete(
  '/:id',
  verifyToken,
  verifyBookingOwnership,
  bookingController.cancelBooking
);

// Reschedule booking
router.put(
  '/:id',
  verifyToken,
  verifyBookingOwnership,
  bookingController.rescheduleBooking
);

module.exports = router;
