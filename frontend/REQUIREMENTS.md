# TerraMindAI - System Requirements

This document lists all the requirements needed to run the TerraMindAI platform.

## System Requirements

### Operating System
- macOS, Linux, or Windows
- Node.js 18.0.0 or higher
- npm 9.0.0 or higher (comes with Node.js)

### Hardware Requirements
- **Minimum**: 2GB RAM, 1GB free disk space
- **Recommended**: 4GB RAM, 2GB free disk space

## Software Dependencies

### Required Software

1. **Node.js** (v18.0.0 or higher)
   - Download from: https://nodejs.org/
   - Verify installation: `node --version`
   - Verify npm: `npm --version`

2. **Git** (for cloning the repository)
   - Download from: https://git-scm.com/
   - Verify installation: `git --version`

### Optional Software

1. **PostgreSQL** (for production database)
   - Download from: https://www.postgresql.org/
   - SQLite is used for development (included with Prisma)

2. **Code Editor** (recommended)
   - VS Code: https://code.visualstudio.com/
   - Or any editor of your choice

## npm Dependencies

### Backend Dependencies (`server/package.json`)

#### Runtime Dependencies
```json
{
  "@prisma/client": "^5.19.1",
  "express": "^4.21.1",
  "cors": "^2.8.5",
  "dotenv": "^16.4.5",
  "bcryptjs": "^2.4.3",
  "jsonwebtoken": "^9.0.2",
  "zod": "^3.23.8",
  "axios": "^1.7.7"
}
```

**Install with:**
```bash
cd server
npm install
```

#### Development Dependencies
```json
{
  "@types/express": "^4.17.21",
  "@types/cors": "^2.8.17",
  "@types/bcryptjs": "^2.4.6",
  "@types/jsonwebtoken": "^9.0.6",
  "@types/node": "^22.7.5",
  "prisma": "^5.19.1",
  "tsx": "^4.16.2",
  "typescript": "^5.6.2"
}
```

### Frontend Dependencies (`package.json`)

#### Runtime Dependencies
```json
{
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "react-router-dom": "^6.30.1",
  "@tanstack/react-query": "^5.83.0",
  "recharts": "^2.15.4",
  "leaflet": "^1.9.4",
  "react-leaflet": "^4.2.1",
  "lucide-react": "^0.462.0",
  "zod": "^3.25.76",
  "@radix-ui/react-accordion": "^1.2.11",
  "@radix-ui/react-alert-dialog": "^1.1.14",
  "@radix-ui/react-avatar": "^1.1.10",
  "@radix-ui/react-checkbox": "^1.3.2",
  "@radix-ui/react-dialog": "^1.1.14",
  "@radix-ui/react-dropdown-menu": "^2.1.15",
  "@radix-ui/react-label": "^2.1.7",
  "@radix-ui/react-popover": "^1.1.14",
  "@radix-ui/react-progress": "^1.1.7",
  "@radix-ui/react-radio-group": "^1.3.7",
  "@radix-ui/react-scroll-area": "^1.2.9",
  "@radix-ui/react-select": "^2.2.5",
  "@radix-ui/react-separator": "^1.1.7",
  "@radix-ui/react-slider": "^1.3.5",
  "@radix-ui/react-slot": "^1.2.3",
  "@radix-ui/react-switch": "^1.2.5",
  "@radix-ui/react-tabs": "^1.1.12",
  "@radix-ui/react-toast": "^1.2.14",
  "@radix-ui/react-tooltip": "^1.2.7",
  "class-variance-authority": "^0.7.1",
  "clsx": "^2.1.1",
  "cmdk": "^1.1.1",
  "date-fns": "^3.6.0",
  "react-hook-form": "^7.61.1",
  "next-themes": "^0.3.0",
  "sonner": "^1.7.4",
  "tailwind-merge": "^2.6.0",
  "tailwindcss-animate": "^1.0.7"
}
```

**Install with:**
```bash
npm install
```

#### Development Dependencies
```json
{
  "@vitejs/plugin-react-swc": "^3.11.0",
  "typescript": "^5.8.3",
  "vite": "^5.4.19",
  "tailwindcss": "^3.4.17",
  "autoprefixer": "^10.4.21",
  "postcss": "^8.5.6",
  "eslint": "^9.32.0",
  "@types/react": "^18.3.23",
  "@types/react-dom": "^18.3.7",
  "@types/node": "^22.16.5",
  "@types/leaflet": "^1.9.21",
  "@types/geojson": "^7946.0.16"
}
```

## Environment Variables

### Backend Environment Variables (`server/.env`)

**Required:**
```env
PORT=3001
NODE_ENV=development
JWT_SECRET=your-super-secret-jwt-key-change-in-production
DATABASE_URL="file:./dev.db"
```

**Optional (for external APIs):**
```env
# CORS Configuration (comma-separated for multiple origins)
CORS_ORIGIN=http://localhost:5173,http://localhost:8081,http://localhost:3000

# External API URLs (all default to http://localhost:5001 if not set)
# These APIs provide enhanced functionality but are optional
QUESTION_API_URL=http://localhost:5001
CHAT_API_URL=http://localhost:5001
LEARNING_MATERIAL_API_URL=http://localhost:5001
QUIZ_FEEDBACK_API_URL=http://localhost:5001
TTS_API_URL=http://localhost:5001
VISUALIZATION_API_URL=http://localhost:5001
```

**Note**: 
- If external APIs are not configured, the application will use fallback content
- All external API URLs can point to the same server or different servers
- The application will gracefully handle API unavailability

### Frontend Environment Variables (`.env`)

**Required:**
```env
VITE_API_URL=http://localhost:3001/api
```

## External Services (Optional)

The platform integrates with external APIs for enhanced functionality. These are **optional** but recommended for full functionality:

1. **Question Generation API** (`QUESTION_API_URL`)
   - Purpose: Generate quiz questions from course content
   - Endpoint: `POST /generate-questions`
   - Fallback: Basic question generation if unavailable

2. **Learning Material API** (`LEARNING_MATERIAL_API_URL`)
   - Purpose: Generate course content and lessons
   - Endpoint: `POST /generate-learning-material`
   - Fallback: Default course content if unavailable

3. **Chat API** (`CHAT_API_URL`)
   - Purpose: Terra chatbot functionality with RAG
   - Endpoint: `POST /chat` (streaming SSE)
   - Fallback: Basic responses if unavailable

4. **Quiz Feedback API** (`QUIZ_FEEDBACK_API_URL`)
   - Purpose: Personalized quiz feedback and explanations
   - Endpoint: `POST /quiz-feedback`
   - Fallback: Basic feedback if unavailable

5. **TTS API** (`TTS_API_URL`)
   - Purpose: Text-to-speech for course content
   - Endpoint: `POST /tts/synthesize`
   - Fallback: Browser TTS if unavailable

6. **Visualization API** (`VISUALIZATION_API_URL`)
   - Purpose: Climate data visualization (temperature data)
   - Endpoints: 
     - `GET /visualization/countries`
     - `GET /visualization/combined-country-temperature?country=X`
     - `GET /visualization/country-temperature?country=X`
     - `GET /visualization/country-temperature-change?country=X`
   - Fallback: Mock data if unavailable

**Important**: The application will work without these external APIs, but some features may be limited or use fallback content.

## Installation Steps

### 1. Install Node.js
```bash
# Check if Node.js is installed
node --version

# If not installed, download from https://nodejs.org/
# Required: Node.js 18.0.0 or higher
```

### 2. Clone Repository
```bash
git clone <repository-url>
cd AIvolution-main
```

### 3. Install Backend Dependencies
```bash
cd server
npm install
```

### 4. Install Frontend Dependencies
```bash
cd ..
npm install
```

### 5. Set Up Environment Variables

**Backend:**
```bash
cd server
# Create .env file
cat > .env << EOF
PORT=3001
NODE_ENV=development
JWT_SECRET=your-super-secret-jwt-key-change-in-production
DATABASE_URL="file:./dev.db"
CORS_ORIGIN=http://localhost:5173
QUESTION_API_URL=http://localhost:5001
CHAT_API_URL=http://localhost:5001
LEARNING_MATERIAL_API_URL=http://localhost:5001
QUIZ_FEEDBACK_API_URL=http://localhost:5001
TTS_API_URL=http://localhost:5001
VISUALIZATION_API_URL=http://localhost:5001
EOF
```

**Frontend:**
```bash
cd ..
# Create .env file
echo "VITE_API_URL=http://localhost:3001/api" > .env
```

### 6. Set Up Database
```bash
cd server
npm run db:generate  # Generate Prisma client
npm run db:push      # Create database schema
```

### 7. Start Development Servers

**Terminal 1 - Backend:**
```bash
cd server
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd ..
npm run dev
```

## Verification

### Verify Backend
- Open `http://localhost:3001`
- Should see: `{"message":"TerraMindAI API","version":"1.0.0",...}`
- Check `http://localhost:3001/health` for health status

### Verify Frontend
- Open `http://localhost:5173`
- Should see the TerraMindAI homepage
- Navigation should work
- Can access auth page

### Verify External APIs (Optional)
- Check that external APIs are running on configured ports
- Test API endpoints if available
- Application will use fallbacks if APIs are unavailable

## Common Issues

### Node.js Version
If you encounter errors, ensure you're using Node.js 18+:
```bash
node --version  # Should be v18.0.0 or higher
```

### Port Conflicts
If port 3001 or 5173 is already in use:
- Change `PORT` in `server/.env` for backend
- Change port in `vite.config.ts` for frontend
- Or kill the process using the port:
  ```bash
  # macOS/Linux
  lsof -ti:3001 | xargs kill -9
  lsof -ti:5173 | xargs kill -9
  ```

### Database Issues
If database errors occur:
```bash
cd server
rm prisma/dev.db
npm run db:push
```

### Module Not Found
If you see "module not found" errors:
```bash
# Backend
cd server
rm -rf node_modules
npm install

# Frontend
rm -rf node_modules
npm install
```

### External API Connection Issues
If external APIs are not available:
- Check API URLs in `server/.env`
- Verify APIs are running and accessible
- Application will use fallback content automatically
- Check backend logs for API connection errors

### CORS Errors
If you see CORS errors in browser:
- Check `CORS_ORIGIN` in `server/.env` includes frontend URL
- Verify backend is running
- Check browser console for specific CORS error

## Production Requirements

### Additional Production Dependencies
- **PostgreSQL** (recommended over SQLite)
- **PM2** or similar process manager
- **nginx** or similar reverse proxy (optional)
- **SSL certificate** (for HTTPS)

### Production Environment
- Set `NODE_ENV=production`
- Use strong `JWT_SECRET` (generate with: `openssl rand -base64 32`)
- Configure proper CORS origins (remove localhost)
- Use PostgreSQL database:
  ```env
  DATABASE_URL="postgresql://user:password@localhost:5432/terramindai?schema=public"
  ```
- Set up external API URLs (production endpoints)
- Enable HTTPS
- Configure proper logging
- Set up monitoring and error tracking
- Configure backup strategy for database

### Production Build
```bash
# Frontend
npm run build
# Output in dist/ directory

# Backend
cd server
npm run build
npm start
# Or use PM2: pm2 start dist/index.js
```

## Version Information

- **Node.js**: 18.0.0+
- **npm**: 9.0.0+
- **React**: 18.3.1
- **Express**: 4.21.1
- **Prisma**: 5.19.1
- **TypeScript**: 5.6.2+
- **Vite**: 5.4.19
- **React Router**: 6.30.1
- **React Query**: 5.83.0
- **Leaflet**: 1.9.4
- **React Leaflet**: 4.2.1
- **Recharts**: 2.15.4

## Support

For issues or questions:
1. Check the `README.md` for setup instructions
2. Review error messages and logs
3. Check browser console for frontend errors
4. Check backend console for API errors
5. Verify environment variables are set correctly
6. Verify external APIs are accessible (if using)

## Quick Reference

### Start Development
```bash
# Terminal 1
cd server && npm run dev

# Terminal 2
npm run dev
```

### Database Commands
```bash
cd server
npm run db:generate  # Generate Prisma client
npm run db:push      # Update database schema
npm run db:studio    # Open Prisma Studio (GUI)
```

### Build for Production
```bash
# Frontend
npm run build

# Backend
cd server
npm run build
npm start
```

### Reset Database
```bash
cd server
rm prisma/dev.db
npm run db:push
```
