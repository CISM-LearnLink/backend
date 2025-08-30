import axios from 'axios';

const API_URL = '/api/tutors';

export const getTutors = async (params = {}) => {
  const res = await axios.get(API_URL, { params });
  return res.data;
};

export const getTutorById = async (id) => {
  const res = await axios.get(`${API_URL}/${id}`);
  return res.data;
}; 