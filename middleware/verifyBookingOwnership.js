const Booking = require('../models/Booking');

const verifyBookingOwnership = async (req, res, next) => {
  try {
    const bookingId = req.params.id;
    const { id: userId, role } = req.user;

    let booking = null;

    // Admin: unrestricted access
    if (role === 'admin') {
      booking = await Booking.findById(bookingId);
    }

    // Student / Parent: own bookings only
    else if (role === 'user') {
      booking = await Booking.findOne({
        _id: bookingId,
        userId: userId
      });
    }

    // Tutor: assigned bookings only
    else if (role === 'tutor') {
      booking = await Booking.findOne({
        _id: bookingId,
        tutorId: userId
      });
    }

    // Generic denial (prevents ID enumeration)
    if (!booking) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Attach authorized booking
    req.booking = booking;
    next();

  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};

module.exports = verifyBookingOwnership;
