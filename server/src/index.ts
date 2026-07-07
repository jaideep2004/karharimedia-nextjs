import 'dotenv/config';
import express, { Express, Request, Response } from 'express';
import mongoose from 'mongoose';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import apiRoutes from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.middleware';
import { setupCors } from './middleware/cors.middleware';
import { PORT, API_PREFIX, UPLOAD_DIR } from './config/constants';
import settingsController from './controllers/settings.controller';
import { startDspWorkerScheduler } from './services/dsp/dspWorkerScheduler';

// .env already loaded by the side-effect import above

// Create Express app
const app: Express = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
setupCors(app);
// Allow cross-origin loading of static media (images/audio) from Next.js (port 3000)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(compression());

// Static files
app.use('/uploads', express.static(path.join(UPLOAD_DIR)));

// Routes
app.use('/', apiRoutes);

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ 
    status: 'ok', 
    message: 'Server is running',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// API documentation endpoint
app.get(`${API_PREFIX}`, (req: Request, res: Response) => {
  res.status(200).json({
    message: 'Music Distribution Platform API',
    documentation: 'API documentation will be available soon',
    version: process.env.npm_package_version || '1.0.0',
    endpoints: [
      `${API_PREFIX}/auth`,
      `${API_PREFIX}/tracks`,
      `${API_PREFIX}/royalties`,
      `${API_PREFIX}/payouts`,
      `${API_PREFIX}/notifications`,
      `${API_PREFIX}/users`,
      `${API_PREFIX}/settings`,
      `${API_PREFIX}/dsp`
    ]
  });
});

// Error handling
app.use('*', notFoundHandler);
app.use(errorHandler);

// Connect to MongoDB
const connectDB = async (): Promise<void> => {
  try {
    const mongoURI = process.env.MONGODB_URI as string;
    if (!mongoURI) {
      throw new Error('MongoDB connection string is not defined');
    }
    
    await mongoose.connect(mongoURI);
    console.log('MongoDB connected successfully');
    
    // Initialize default settings after DB connection
    await settingsController.initializeDefaultSettings();
    console.log('Default settings initialized');
    startDspWorkerScheduler();
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Start server
const startServer = async (): Promise<void> => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      const localOrigin = `http://${'localhost'}:${PORT}`;
      console.log(`API base URL: ${(process.env.API_URL || `${localOrigin}${API_PREFIX}`).replace(/\/$/, '')}`);
      console.log(`Health check: ${localOrigin}/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  process.exit(1);
});

// Start the server
startServer(); 
