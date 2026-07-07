import cors from 'cors';
import { Express } from 'express';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configure CORS options (allow all origins for development)
const corsOptions: cors.CorsOptions = {
  origin: true, // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], 
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// Export CORS middleware setup function
export const setupCors = (app: Express): void => {
  app.use(cors(corsOptions));
  
  // Handle preflight requests
  app.options('*', cors(corsOptions));
}; 