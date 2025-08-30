import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';

const API_BASE_URL = 'http://localhost:5000';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);
    try {
      const res = await axios.post('http://localhost:5000/api/auth/login', { email, password });
      localStorage.setItem('token', res.data.token);
      setLoading(false);
      setSuccess(true);
      setTimeout(() => {
        navigate('/dashboard');
      }, 1000);
    } catch (err) {
      setLoading(false);
      setError(err.response?.data?.msg || 'Login failed');
    }
  };

  

  return (
    <div className="bg-light min-vh-100 d-flex align-items-center justify-content-center py-5">
      <div className="card shadow-lg border-0 rounded-4 p-4" style={{maxWidth: 400, width: '100%'}}>
        <div className="text-center mb-4">
          <i className="bi bi-box-arrow-in-right display-4 text-primary mb-2"></i>
          <h2 className="fw-bold">Login to LearnLink</h2>
          <p className="text-secondary">Welcome back! Please login to your account.</p>
        </div>
        {error && <div className="alert alert-danger">{error}</div>}
        {success && <div className="alert alert-success">Login successful! Redirecting...</div>}
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label">Email address</label>
            <input type="email" className="form-control border border-secondary" style={{background: '#fff'}} value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="mb-3">
            <label className="form-label">Password</label>
            <input type="password" className="form-control border border-secondary" style={{background: '#fff'}} value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <button type="submit" className="btn btn-primary w-100 fw-bold" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
        <div className="text-center mt-3">
          <span className="text-secondary">Don't have an account? </span>
          <span className="text-primary fw-bold" style={{cursor: 'pointer'}} onClick={() => navigate('/register')}>Sign Up</span>
        </div>
      </div>
    </div>
  );
}

export default Login; 