import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// MongoDB connection options
const options = {
  autoIndex: true,
  serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
  socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
};

// MongoDB connection URI
const mongoURI = process.env.MONGODB_URI as string;
 
if (!mongoURI) {
  console.error('MongoDB connection string is not defined');
  process.exit(1);
}

// Connect to MongoDB
export const connectDB = async (): Promise<typeof mongoose> => {
  try {
    const connection = await mongoose.connect(mongoURI, options);
    console.log(`MongoDB connected: ${connection.connection.host}`);
    return connection;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
}; 