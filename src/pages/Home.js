import React from 'react';
import { useNavigate } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';

const features = [
  {
    icon: 'bi-search',
    title: 'Search & Discover',
    desc: 'Easily search for tutors by subject, availability, and location to find the perfect match.'
  },
  {
    icon: 'bi-journal-bookmark',
    title: 'Book with Confidence',
    desc: 'View detailed profiles, ratings, and real-time calendars before booking a session.'
  },
  {
    icon: 'bi-shield-check',
    title: 'Verified Tutors',
    desc: 'Our platform verifies tutor profiles to ensure quality and safety for all users.'
  }
];

const testimonials = [
  {
    quote: 'Finding a reliable math tutor for my son was a nightmare. LearnLink made it so simple and stress-free. We found a perfect match in minutes!',
    author: 'Sarah L.',
    role: 'Parent'
  },
  {
    quote: 'As a university student, this platform is an amazing way to earn extra income. The schedule management is a lifesaver and I can focus on what I do best - teaching.',
    author: 'David K.',
    role: 'Tutor'
  }
];

function Home() {
  const navigate = useNavigate();
  return (
    <div className="bg-light min-vh-100">
      {/* Hero Section */}
      <section className="py-5 text-center position-relative" style={{background: 'linear-gradient(120deg, #e0e7ff 0%, #fff 100%)'}}>
        <div className="container position-relative z-2">
          <div className="row align-items-center justify-content-center">
            <div className="col-lg-6 mb-4 mb-lg-0 text-lg-start text-center">
              <h1 className="display-3 fw-bold mb-3">Unlock Your Potential with the <span className="text-primary">Perfect Tutor</span></h1>
              <p className="lead text-secondary mb-4">Connect with qualified university students for personalized tutoring. Flexible, reliable, and tailored to your academic needs.</p>
              <button onClick={() => navigate('/login')} className="btn btn-primary btn-lg px-5 shadow-sm">Find a Tutor Now</button>
            </div>
            <div className="col-lg-6 text-center">
              <img src="https://images.unsplash.com/photo-1513258496099-48168024aec0?auto=format&fit=crop&w=600&q=80" alt="Students learning online" className="img-fluid rounded-4 shadow-lg" style={{maxHeight: 400}} />
            </div>
          </div>
        </div>
        <div className="position-absolute top-0 start-0 w-100 h-100" style={{background: 'url(https://www.transparenttextures.com/patterns/cubes.png)', opacity: 0.07, zIndex: 1}}></div>
      </section>

      {/* Features Section */}
      <section className="container py-5">
        <h2 className="fw-bold text-center mb-4">Why Choose LearnLink?</h2>
        <div className="row g-4 justify-content-center">
          {features.map((f, idx) => (
            <div className="col-md-4" key={idx}>
              <div className="card border-0 shadow h-100 text-center p-4">
                <div className="mb-3">
                  <i className={`bi ${f.icon} display-4 text-primary`}></i>
                </div>
                <h5 className="fw-bold mb-2">{f.title}</h5>
                <p className="text-secondary mb-0">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="bg-white py-5">
        <div className="container">
          <h2 className="fw-bold text-center mb-4">Loved by Parents & Students</h2>
          <div id="testimonialCarousel" className="carousel slide" data-bs-ride="carousel">
            <div className="carousel-inner">
              {testimonials.map((t, idx) => (
                <div className={`carousel-item${idx === 0 ? ' active' : ''}`} key={idx}>
                  <div className="row justify-content-center">
                    <div className="col-md-8">
                      <div className="card border-0 shadow h-100 p-4 text-center">
                        <div className="mb-3">
                          <i className="bi bi-quote display-6 text-primary"></i>
                        </div>
                        <blockquote className="blockquote mb-3">
                          <p className="mb-0 fst-italic">"{t.quote}"</p>
                        </blockquote>
                        <footer className="blockquote-footer">
                          <span className="fw-bold">{t.author}</span> <cite title="Source Title">({t.role})</cite>
                        </footer>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button className="carousel-control-prev" type="button" data-bs-target="#testimonialCarousel" data-bs-slide="prev">
              <span className="carousel-control-prev-icon" aria-hidden="true"></span>
              <span className="visually-hidden">Previous</span>
            </button>
            <button className="carousel-control-next" type="button" data-bs-target="#testimonialCarousel" data-bs-slide="next">
              <span className="carousel-control-next-icon" aria-hidden="true"></span>
              <span className="visually-hidden">Next</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Home;