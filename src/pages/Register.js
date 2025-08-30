import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';

function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('parent');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await axios.post(`${API_BASE_URL}/api/auth/register`, { name, email, password, role });
      localStorage.setItem('token', res.data.token);
      setLoading(false);
      navigate('/dashboard');
    } catch (err) {
      setLoading(false);
      setError(err.response?.data?.msg || 'Registration failed');
    }
  };

  return (
    <div className="bg-light min-vh-100 d-flex align-items-center justify-content-center py-5">
      <div className="card shadow-lg border-0 rounded-4 p-4" style={{maxWidth: 400, width: '100%'}}>
        <div className="text-center mb-4">
          <i className="bi bi-person-plus display-4 text-primary mb-2"></i>
          <h2 className="fw-bold">Sign Up for LearnLink</h2>
          <p className="text-secondary">Create your account to get started.</p>
        </div>
        {error && <div className="alert alert-danger">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label">Full Name</label>
            <input type="text" className="form-control border border-secondary" style={{background: '#fff'}} value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="mb-3">
            <label className="form-label">Email address</label>
            <input type="email" className="form-control border border-secondary" style={{background: '#fff'}} value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="mb-3">
            <label className="form-label">Password</label>
            <input type="password" className="form-control border border-secondary" style={{background: '#fff'}} value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <div className="mb-3">
            <label className="form-label">Role</label>
            <select className="form-select border border-secondary" style={{background: '#fff'}} value={role} onChange={e => setRole(e.target.value)}>
              <option value="parent">Parent</option>
              <option value="tutor">Tutor</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary w-100 fw-bold" disabled={loading}>
            {loading ? 'Signing up...' : 'Sign Up'}
          </button>
        </form>
        <div className="text-center mt-3">
          <span className="text-secondary">Already have an account? </span>
          <span className="text-primary fw-bold" style={{cursor: 'pointer'}} onClick={() => navigate('/login')}>Login</span>
        </div>
      </div>
    </div>
  );
}

export default Register;
