# TerraMindAI - Climate Education Platform

A comprehensive AI-powered climate education platform with interactive lessons, real-world data visualizations, and personalized learning experiences. TerraMindAI helps students learn about climate change through engaging courses, quizzes, and an interactive AI tutor named Terra.

## Project Structure

This project consists of two main components:

### `backend/` - Python Flask API (AI Services)
Python backend providing AI-powered services for the platform:
- **RAG System**: Retrieval-Augmented Generation for climate data using FAISS vector store
- **Chatbot API**: AI tutor (Terra) with streaming responses
- **Quiz Generation**: Generate questions with RAG context from climate datasets
- **Learning Material Generation**: Create structured educational content
- **Text-to-Speech (TTS)**: Convert text to speech using Eleven Labs API
- **Temperature Visualization**: APIs for climate data visualization
- **Tech Stack**: Flask, Groq API (Llama 3.3 70B), FAISS, Sentence Transformers, Pandas

**Key Files:**
- `rag_system.py` - RAG system implementation with FAISS
- `process_fao_temperature_data.py` - Data processing script
- `requirements.txt` - Python dependencies
- `dataset/` - Climate datasets (temperature data, headlines, etc.)


### `frontend/` - React Application + Node.js API Server

#### React Frontend
- **Interactive Lessons**: AI-generated course content
- **Data Visualizations**: Interactive temperature maps and charts
- **AI Tutor Interface**: Chat interface for Terra chatbot
- **Quiz System**: Auto-graded quizzes with feedback
- **Progress Tracking**: Badges, milestones, and analytics
- **Tech Stack**: React, TypeScript, Vite, Tailwind CSS, React Router, Recharts, Leaflet

#### Node.js API Server (`frontend/server/`)
Express API server that acts as middleware between React frontend and Python backend:
- **Authentication**: JWT-based user authentication
- **Database**: SQLite (development) with Prisma ORM
- **User Management**: Students, Teachers, and Admins
- **Course Management**: Create, enroll, and track courses
- **Quiz Management**: Store quiz attempts and results
- **Badge System**: Achievement tracking
- **Group Management**: Teacher-created student groups

**Key Files:**
- `src/index.ts` - Express server entry point
- `src/routes/` - API route handlers
- `src/middleware/` - Authentication and error handling
- `prisma/schema.prisma` - Database schema
- `package.json` - Node.js dependencies

## Quick Start

### Prerequisites
- **Python** 3.8+ with pip
- **Node.js** 18.0.0+ with npm
- **API Keys**:
  - Groq API Key ([console.groq.com](https://console.groq.com))
  - Eleven Labs API Key ([elevenlabs.io](https://elevenlabs.io))

### Installation

1. **Clone the repository:**
```bash
git clone <repository-url>
cd Hackathone_final
```

2. **Set up Python Backend:**
```bash
cd backend
pip install -r requirements.txt

# Create .env file
cat > .env << EOF
GROQ_API_KEY=your_groq_api_key_here
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
PORT=5001
HOST=0.0.0.0
FLASK_DEBUG=True
EOF

# Process FAO temperature data (optional)
python process_fao_temperature_data.py
```

3. **Set up Node.js Backend:**
```bash
cd ../frontend/server
npm install

# Create .env file
cat > .env << EOF
PORT=3001
NODE_ENV=development
JWT_SECRET=your-super-secret-jwt-key-change-in-production
DATABASE_URL="file:./prisma/dev.db"
CORS_ORIGIN=http://localhost:5173,http://localhost:8081,http://localhost:3000
QUESTION_API_URL=http://localhost:5001
CHAT_API_URL=http://localhost:5001
LEARNING_MATERIAL_API_URL=http://localhost:5001
QUIZ_FEEDBACK_API_URL=http://localhost:5001
TTS_API_URL=http://localhost:5001
VISUALIZATION_API_URL=http://localhost:5001
EOF

# Set up database
npm run db:generate
npm run db:push
```

4. **Set up React Frontend:**
```bash
cd ..
npm install

# Create .env file
echo "VITE_API_URL=http://localhost:3001/api" > .env
```

### Running the Application

#### Option 1: Use the Startup Script (Recommended)
```bash
# Make script executable (if not already)
chmod +x start.sh

# Run all services
./start.sh

# To stop all services, press Ctrl+C or run:
./stop.sh
```

#### Option 2: Manual Startup

**Terminal 1 - Python Backend:**
```bash
cd backend
# Note: Ensure app.py exists (see backend/README.md for setup)
python app.py
```

**Important:** If `app.py` doesn't exist, you may need to create it. Refer to `backend/README.md` for the Flask application setup. The startup script will skip the Python backend if `app.py` is not found.

**Terminal 2 - Node.js Backend:**
```bash
cd frontend/server
npm run dev
```

**Terminal 3 - React Frontend:**
```bash
cd frontend
npm run dev
# Application runs on http://localhost:5173
```

## Services Overview

| Service | Port | Description |
|---------|------|-------------|
| React Frontend | 5173 | User interface (React + Vite) |
| Node.js API | 3001 | Backend API (Express + Prisma) |
| Python API | 5001 | AI Services (Flask + RAG) |

## Environment Variables

### Python Backend (`backend/.env`)
```env
GROQ_API_KEY=your_groq_api_key_here
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
PORT=5001
HOST=0.0.0.0
FLASK_DEBUG=True
```

### Node.js Backend (`frontend/server/.env`)
```env
PORT=3001
NODE_ENV=development
JWT_SECRET=your-super-secret-jwt-key
DATABASE_URL="file:./prisma/dev.db"
CORS_ORIGIN=http://localhost:5173
QUESTION_API_URL=http://localhost:5001
CHAT_API_URL=http://localhost:5001
LEARNING_MATERIAL_API_URL=http://localhost:5001
QUIZ_FEEDBACK_API_URL=http://localhost:5001
TTS_API_URL=http://localhost:5001
VISUALIZATION_API_URL=http://localhost:5001
```

### React Frontend (`frontend/.env`)
```env
VITE_API_URL=http://localhost:3001/api
```

## Features

### For Students
- Browse and enroll in climate education courses
- Complete interactive lessons with audio playback
- Take quizzes and receive personalized AI feedback
- Chat with Terra (AI tutor) for help
- Track progress and earn badges
- Explore climate data visualizations

### For Teachers
- Create courses with AI-generated content
- Manage student groups
- Track student progress and quiz results
- Generate quizzes with RAG context

### For Admins
- Full system access
- User management
- Course management
- System statistics

## API Endpoints

### Python Backend (Port 5001)
- `POST /chat` - Chat with Terra (streaming)
- `POST /generate-questions` - Generate quiz questions
- `POST /generate-learning-material` - Generate course content
- `POST /tts` - Text-to-speech conversion
- `GET /visualization/countries` - Get available countries
- `GET /visualization/country-temperature` - Get temperature data

### Node.js Backend (Port 3001)
- `POST /api/auth/signup` - User registration
- `POST /api/auth/login` - User login
- `GET /api/courses` - Get courses
- `POST /api/courses` - Create course
- `POST /api/quizzes/:id/submit` - Submit quiz
- `GET /api/chat/chat` - Chat endpoint (proxies to Python backend)
- `GET /api/admin/stats` - System statistics (Admin only)

## Database

The application uses **SQLite** for development (via Prisma). The database schema includes:
- Users (Students, Teachers, Admins)
- Courses and Lessons
- Quizzes and Quiz Attempts
- Badges
- Groups
- Enrollments

To reset the database:
```bash
cd frontend/server
rm prisma/dev.db
npm run db:push
```

## Development

### Python Backend
```bash
cd backend
python app.py  # Development server
# or
gunicorn -w 4 -b 0.0.0.0:5001 app:app  # Production
```

### Node.js Backend
```bash
cd frontend/server
npm run dev    # Development with hot reload
npm run build  # Build for production
npm start      # Production server
```

### React Frontend
```bash
cd frontend
npm run dev    # Development server
npm run build  # Build for production
npm run preview # Preview production build
```

## Documentation

- **Backend README**: `backend/README.md` - Detailed Python backend documentation
- **Frontend README**: `frontend/README.md` - Detailed frontend documentation
- **Requirements**: `frontend/REQUIREMENTS.md` - System requirements

## Troubleshooting

### Port Already in Use
```bash
# Kill process on port 5001 (Python)
lsof -ti:5001 | xargs kill -9

# Kill process on port 3001 (Node.js)
lsof -ti:3001 | xargs kill -9

# Kill process on port 5173 (React)
lsof -ti:5173 | xargs kill -9
```

### Database Issues
```bash
cd frontend/server
rm prisma/dev.db
npm run db:generate
npm run db:push
```

### Module Not Found
```bash
# Python backend
cd backend
pip install -r requirements.txt

# Node.js backend
cd frontend/server
rm -rf node_modules
npm install

# React frontend
cd frontend
rm -rf node_modules
npm install
```

### External API Connection Issues
- Verify Python backend is running on port 5001
- Ensure Python backend has correct API keys in `backend/.env`

## License

This project is provided as-is for educational purposes.

## Testing

### Test APIs
```bash
./test_apis.sh
```

This script will:
- Check if all ports are open
- Test API endpoints
- Provide a status summary

### Test Results
See `TEST_RESULTS.md` for detailed test results and `API_TEST_REPORT.md` for API test reports.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

