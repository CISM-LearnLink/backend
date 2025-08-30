import React from 'react';
// TODO: Import and use ParentDashboard, TutorDashboard, AdminDashboard components

function Dashboard({ user, ...props }) {
  if (!user) return <div>Please log in to view your dashboard.</div>;
  if (user.role === 'parent') return <div>Parent Dashboard (to be implemented)</div>;
  if (user.role === 'tutor') return <div>Tutor Dashboard (to be implemented)</div>;
  if (user.role === 'admin') return <div>Admin Dashboard (to be implemented)</div>;
  return <div>Unknown user role.</div>;
}

export default Dashboard; 