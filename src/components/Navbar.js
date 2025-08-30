import React from 'react';
import { useNavigate } from 'react-router-dom';

function Navbar({ user, handleLogout }) {
  const navigate = useNavigate();
  return (
    <nav className="navbar navbar-expand-lg navbar-light bg-white shadow sticky-top py-2">
      <div className="container">
        <span className="navbar-brand fw-bold text-primary d-flex align-items-center" style={{cursor: 'pointer'}} onClick={() => navigate('/') }>
          <i className="bi bi-journal-bookmark me-2 fs-3"></i>
          <span className="fs-4">LearnLink</span>
        </span>
        <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
          <span className="navbar-toggler-icon"></span>
        </button>
        <div className="collapse navbar-collapse" id="navbarNav">
          <ul className="navbar-nav ms-auto align-items-center gap-2">
            <li className="nav-item">
              <span className="nav-link" style={{cursor: 'pointer'}} onClick={() => navigate('/') }><i className="bi bi-house-door me-1"></i>Home</span>
            </li>
            {user ? (
              <>
                <li className="nav-item">
                  <span className="nav-link" style={{cursor: 'pointer'}} onClick={() => navigate('/dashboard')}><i className="bi bi-person-circle me-1"></i>Dashboard</span>
                </li>
                <li className="nav-item">
                  <span className="nav-link" style={{cursor: 'pointer'}} onClick={handleLogout}><i className="bi bi-box-arrow-right me-1"></i>Logout</span>
                </li>
              </>
            ) : (
              <>
                <li className="nav-item">
                  <span className="nav-link" style={{cursor: 'pointer'}} onClick={() => navigate('/login')}><i className="bi bi-box-arrow-in-right me-1"></i>Login</span>
                </li>
                <li className="nav-item">
                  <span className="nav-link" style={{cursor: 'pointer'}} onClick={() => navigate('/register')}><i className="bi bi-person-plus me-1"></i>Sign Up</span>
                </li>
              </>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
}

export default Navbar; 