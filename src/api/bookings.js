import axios from 'axios';

const API_URL = '/api/bookings';

export const getBookings = async (token) => {
  const res = await axios.get(API_URL, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
};

export const createBooking = async (bookingData, token) => {
  const res = await axios.post(API_URL, bookingData, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
};

export const getBookingById = async (id, token) => {
  const res = await axios.get(`${API_URL}/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
}; 