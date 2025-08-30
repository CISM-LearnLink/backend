import axios from 'axios';

const API_URL = '/api/users';

export const getUserById = async (id, token) => {
  const res = await axios.get(`${API_URL}/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
};

export const getAllUsers = async (token) => {
  const res = await axios.get(API_URL, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
}; 