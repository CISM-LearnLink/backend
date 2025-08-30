const User = require('../models/User');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tutorme', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function createAdminUser() {
  try {
    const adminData = {
      name: 'Admin User',
      email: 'admin@tutorme.com',
      password: 'admin123',
      role: 'admin'
    };

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: adminData.email });
    if (existingAdmin) {
      console.log('Admin user already exists:', existingAdmin.email);
      return;
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(adminData.password, salt);

    // Create admin user
    const adminUser = new User({
      name: adminData.name,
      email: adminData.email,
      password: hashedPassword,
      role: 'admin'
    });

    await adminUser.save();
    console.log('Admin user created successfully:', adminUser.email);
    console.log('You can now login with:');
    console.log('Email:', adminData.email);
    console.log('Password:', adminData.password);
    console.log('Role: admin (can access both parent and tutor login)');

  } catch (error) {
    console.error('Error creating admin user:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the script
createAdminUser(); 