# TerraMindAI - Climate Education Platform

A comprehensive AI-powered climate education platform with interactive lessons, real-world data visualizations, and personalized learning experiences. TerraMindAI helps students learn about climate change through engaging courses, quizzes, and an interactive AI tutor named Terra.

## Features

- **Interactive Lessons**: AI-generated course content with adaptive learning paths
- **Real Data Visualizations**: Interactive temperature maps and charts showing climate data from around the world
- **AI Tutor (Terra)**: 24/7 chatbot assistant for climate education with RAG (Retrieval Augmented Generation)
- **Quiz System**: Auto-graded quizzes with personalized AI feedback
- **Progress Tracking**: Badges, milestones, and detailed learning analytics
- **Role-Based Access**: Students, Teachers, and Admins with different permissions
- **Temperature Data**: Country-specific temperature data (1743-2013) and temperature change data (1961-2019)
- **Text-to-Speech**: Audio playback for course content
- **Group Management**: Teachers can create groups and manage students

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** 18.0.0 or higher
- **npm** 9.0.0 or higher (comes with Node.js)
- **Git** (for cloning the repository)

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/alexktitarov/TerraMIndAI.git
cd TerraMindAI
```

### 2. Backend Setup

```bash
# Navigate to server directory
cd server

# Install dependencies
npm install

# Create .env file (see Environment Variables section below)
# Generate Prisma client and set up database
npm run db:generate
npm run db:push

# Start the development server
npm run dev
```

The backend API will be running on `http://localhost:3001`

### 3. Frontend Setup

```bash
# Navigate back to root directory
cd ..

# Install dependencies
npm install

# Create .env file (see Environment Variables section below)
# Start the development server
npm run dev
```

The frontend will be running on `http://localhost:5173`

## Environment Variables

### Backend (`server/.env`)

```env
# Server Configuration
PORT=3001
NODE_ENV=development

# Authentication
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# Database
DATABASE_URL="file:./dev.db"

# CORS Configuration (comma-separated for multiple origins)
CORS_ORIGIN=http://localhost:5173,http://localhost:8081,http://localhost:3000

# External API URLs (optional - defaults to http://localhost:5001)
# These can all point to the same API server or different ones
QUESTION_API_URL=http://localhost:5001
CHAT_API_URL=http://localhost:5001
LEARNING_MATERIAL_API_URL=http://localhost:5001
QUIZ_FEEDBACK_API_URL=http://localhost:5001
TTS_API_URL=http://localhost:5001
VISUALIZATION_API_URL=http://localhost:5001
```

**Note**: If backend is not running, most features won't be available!

### Frontend (`.env`)

```env
VITE_API_URL=http://localhost:3001/api
```

## Key Dependencies

### Backend
- **Express** - Web framework
- **Prisma** - Database ORM (SQLite for development)
- **JWT** - Authentication
- **Axios** - HTTP client for external APIs
- **Zod** - Schema validation
- **bcryptjs** - Password hashing

### Frontend
- **React** - UI framework
- **React Router** - Routing
- **React Query** - Data fetching and caching
- **Recharts** - Chart library
- **Leaflet** - Interactive maps
- **Radix UI** - Accessible UI components
- **Tailwind CSS** - Styling
- **Zod** - Schema validation

See `REQUIREMENTS.md` for complete dependency list.

## 🗄️ Database

The application uses **SQLite** for development (via Prisma). The database schema is defined in `server/prisma/schema.prisma`.

### Database Setup

```bash
cd server
npm run db:generate 
npm run db:push  
npm run db:studio  
```

### Database Schema

The database includes:
- **Users** - Students, Teachers, and Admins
- **Courses** - Course content and metadata
- **Lessons** - Individual lessons within courses
- **Quizzes** - Quiz questions and answers
- **Quiz Attempts** - Student quiz submissions
- **Badges** - Achievement badges
- **Groups** - Teacher-created student groups
- **Enrollments** - Course enrollments and progress

## Usage

### Creating an Account

1. Open `http://localhost:5173`
2. Click "Get Started"
3. Sign up as either a **Student**, **Teacher** or **Admin**
4. Complete registration

### As an Admin

1. Navigate to "Learn" page
2. Click "Create Course"
3. Enter topic, grade level, and duration
4. Quiz will be automatically generated via our custom-made backend
5. View student progress in "Dashboard"
6. Create groups to organize students
7. Access admin panel


### As a Teacher

1. Navigate to "Learn" page
2. Click "Create Course"
3. Enter topic, grade level, and duration
4. Quiz will be automatically generated via our custom-made backend
5. View student progress in "Dashboard"
6. Create groups to organize students

### As a Student

1. Browse available courses on "Learn" page
2. Enroll in courses
3. Complete interactive lessons with audio playback
4. Take quizzes to test knowledge
5. Receive personalized feedback via our custom-made backend
6. Chat with Terra (AI tutor) for help with climate questions
7. View progress, badges and achievements on "Progress" page

### Data Visualizations

1. Navigate to "Data" page
2. Explore interactive temperature map
3. Select countries to view detailed temperature data
4. View temperature trends and regional analysis
5. Analyze data from most countries in the world

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Sign up
- `POST /api/auth/login` - Log in
- `GET /api/auth/me` - Get current user

### Courses
- `GET /api/courses` - Get all courses
- `GET /api/courses/:id` - Get course details
- `POST /api/courses` - Create course (Teacher/Admin)
- `POST /api/courses/:id/enroll` - Enroll in course
- `PATCH /api/courses/:id/progress` - Update progress

### Quizzes
- `GET /api/quizzes/course/:courseId` - Get quiz by course
- `POST /api/quizzes/:id/submit` - Submit quiz
- `GET /api/quizzes/attempts` - Get user's quiz attempts
- `GET /api/quizzes/course/:courseId/attempts` - Get course quiz attempts (Teacher)

### Visualization
- `GET /api/visualization/countries` - Get available countries
- `GET /api/visualization/combined-country-temperature?country=X` - Get both absolute and change data
- `GET /api/visualization/country-temperature?country=X` - Get absolute temperature (1743-2013)
- `GET /api/visualization/country-temperature-change?country=X` - Get temperature change (1961-2019)

### Chat (Terra)
- `POST /api/chat/chat` - Chat with Terra (streaming SSE)
- `POST /api/chat/clear` - Clear chat history
- `GET /api/chat/rag-status` - Check RAG system status

### TTS
- `POST /api/tts/synthesize` - Generate speech from text

### Learning Material
- `POST /api/learning-material/generate` - Generate course content

### Questions
- `POST /api/questions/generate` - Generate quiz questions

### Quiz Feedback
- `POST /api/quiz/feedback` - Get personalized quiz feedback

### Badges
- `GET /api/badges/me` - Get user's badges
- `GET /api/badges/available` - Get all available badges

### Groups
- `GET /api/groups` - Get user's groups
- `POST /api/groups` - Create group (Teacher/Admin)
- `POST /api/groups/join` - Join group by code

### Admin
- `GET /api/admin/users` - Get all users (Admin only)
- `GET /api/admin/courses` - Get all courses (Admin only)
- `GET /api/admin/groups` - Get all groups (Admin only)
- `GET /api/admin/stats` - Get system statistics (Admin only)
- `PATCH /api/admin/users/:id/role` - Update user role (Admin only)
- `DELETE /api/admin/users/:id` - Delete user (Admin only)

## Project Structure

```
.
├── server/                 # Backend API
│   ├── src/
│   │   ├── routes/        # API routes
│   │   │   ├── auth.ts
│   │   │   ├── courses.ts
│   │   │   ├── quizzes.ts
│   │   │   ├── chat.ts
│   │   │   ├── visualization.ts
│   │   │   ├── tts.ts
│   │   │   ├── questions.ts
│   │   │   ├── learningMaterial.ts
│   │   │   ├── quizFeedback.ts
│   │   │   ├── badges.ts
│   │   │   ├── groups.ts
│   │   │   ├── users.ts
│   │   │   └── admin.ts
│   │   ├── middleware/    # Auth, error handling
│   │   ├── services/      # Business logic (llmService.ts)
│   │   └── lib/          # Utilities (prisma.ts)
│   ├── prisma/           # Database schema
│   │   ├── schema.prisma
│   │   └── dev.db
│   └── package.json
├── src/                   # Frontend
│   ├── components/       # React components
│   │   ├── Chatbot.tsx   # Terra chatbot
│   │   ├── TemperatureMap.tsx
│   │   ├── Quiz.tsx
│   │   └── ui/          # shadcn/ui components
│   ├── pages/           # Page components
│   │   ├── Index.tsx    # Homepage
│   │   ├── Learn.tsx    # Course listing
│   │   ├── CourseDetail.tsx
│   │   ├── DataViz.tsx  # Data visualizations
│   │   ├── Progress.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Admin.tsx
│   │   └── Auth.tsx
│   ├── contexts/        # React contexts (AuthContext)
│   ├── lib/             # Utilities (api.ts, utils.ts)
│   └── hooks/           # Custom hooks
├── public/              # Static assets
│   ├── logo.png
│   └── favicon.ico
└── package.json
```

## Troubleshooting

### Backend Issues

**Port already in use:**
```bash
# Change PORT in server/.env or kill the process using port 3001
lsof -ti:3001 | xargs kill -9
```

**Database errors:**
```bash
cd server
rm prisma/dev.db
npm run db:push
```

**Module not found:**
```bash
cd server
rm -rf node_modules
npm install
```

**External API errors:**
- Check that external API URLs are correct in `server/.env`
- Verify external APIs are running and accessible
- Application will use fallback content if APIs are unavailable

### Frontend Issues

**Can't connect to backend:**
- Verify backend is running on port 3001
- Check `VITE_API_URL` in `.env` matches backend URL
- Check `CORS_ORIGIN` in `server/.env` includes frontend URL
- Check browser console for CORS errors

**Build errors:**
```bash
rm -rf node_modules dist
npm install
npm run build
```

**Chatbot not working:**
- Verify Chat API URL is configured in `server/.env`
- Check that Chat API is running
- Check browser console for errors

### Database Issues

**Prisma client not generated:**
```bash
cd server
npm run db:generate
```

**Schema changes not applied:**
```bash
cd server
npm run db:push
```

**Database locked:**
- Close Prisma Studio if open
- Restart the backend server

## Production Deployment

### Build Frontend

```bash
npm run build
```

The build output will be in the `dist/` directory.

### Build Backend

```bash
cd server
npm run build
npm start
```

### Production Environment Variables

Update all environment variables for production:
- Set `NODE_ENV=production`
- Use a strong `JWT_SECRET`
- Use PostgreSQL instead of SQLite (update `DATABASE_URL`)
- Configure proper CORS origins (remove localhost)
- Set up external API URLs
- Enable HTTPS
- Configure proper logging

### Production Database

For production, use PostgreSQL:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/terramindai?schema=public"
```

Then run:
```bash
cd server
npm run db:push
```

## Additional Documentation

- `REQUIREMENTS.md` - Complete system requirements and dependencies list


## License

This project is provided as-is for educational purposes.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
