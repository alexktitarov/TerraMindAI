import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import groupRoutes from './routes/groups.js';
import courseRoutes from './routes/courses.js';
import quizRoutes from './routes/quizzes.js';
import badgeRoutes from './routes/badges.js';
import adminRoutes from './routes/admin.js';
import ttsRoutes from './routes/tts.js';
import questionRoutes from './routes/questions.js';
import learningMaterialRoutes from './routes/learningMaterial.js';
import chatRoutes from './routes/chat.js';
import quizFeedbackRoutes from './routes/quizFeedback.js';
import visualizationRoutes from './routes/visualization.js';
import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
// Allow multiple origins for development (frontend can run on different ports)
const allowedOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:8081', 'http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list or is a localhost port
    if (allowedOrigins.includes(origin) || 
        (process.env.NODE_ENV === 'development' && origin.startsWith('http://localhost:'))) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json());

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'TerraMindAI API',
    version: '1.0.0',
      endpoints: {
        health: '/health',
        auth: '/api/auth',
        users: '/api/users',
        groups: '/api/groups',
        courses: '/api/courses',
        quizzes: '/api/quizzes',
        badges: '/api/badges',
        admin: '/api/admin',
        tts: '/api/tts',
        questions: '/api/questions',
        learningMaterial: '/api/learning-material',
        chat: '/api/chat',
        quizFeedback: '/api/quiz/feedback',
        visualization: '/api/visualization'
      }
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/badges', badgeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', ttsRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/learning-material', learningMaterialRoutes);
app.use('/api', chatRoutes);
app.use('/api/quiz', quizFeedbackRoutes);
app.use('/api/visualization', visualizationRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

