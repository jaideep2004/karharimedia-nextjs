import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/user.model';
import { connectDB } from '../config/db';
import { UserRole } from '../config/constants';

// Load environment variables
dotenv.config();

// Connect to database
connectDB();

// Admin user data
const adminData = {
  name: 'Admin User',
  email: 'admin@gmail.com',
  password: 'Admin@123!',
  role: UserRole.ADMIN,
  artistName: 'Admin',
};

// Create admin user
const seedAdmin = async () => {
  try {
    console.log('Starting admin seed...');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: adminData.email });
    
    if (existingAdmin) {
      console.log('Admin user already exists, updating role and password...');
      
      // Update admin role and password
      existingAdmin.role = UserRole.ADMIN;
      existingAdmin.password = adminData.password; // This will get hashed by the pre-save hook
      await existingAdmin.save();
      
      console.log('Admin user updated successfully');
      console.log('---------------------------------');
      console.log('Admin Login Details:');
      console.log(`Email: ${adminData.email}`);
      console.log(`Password: ${adminData.password}`);
      console.log('---------------------------------');
    } else {
      // Create new admin user
      const admin = await User.create(adminData);
      
      console.log('Admin user created successfully');
      console.log('---------------------------------');
      console.log('Admin Login Details:');
      console.log(`Email: ${adminData.email}`);
      console.log(`Password: ${adminData.password}`);
      console.log('---------------------------------');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin:', error);
    process.exit(1);
  }
};

// Run the seed function
seedAdmin(); 