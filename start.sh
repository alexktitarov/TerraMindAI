#!/bin/bash

# TerraMindAI Startup Script
# This script starts all services: Python backend, Node.js backend, and React frontend

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  TerraMindAI Startup Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if a port is in use
port_in_use() {
    lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null 2>&1
}

# Function to kill process on a port
kill_port() {
    if port_in_use $1; then
        echo -e "${YELLOW}Port $1 is in use. Attempting to kill process...${NC}"
        lsof -ti:$1 | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
}

# Check prerequisites
echo -e "${BLUE}Checking prerequisites...${NC}"

if ! command_exists python3; then
    echo -e "${RED}Error: Python 3 is not installed${NC}"
    exit 1
fi

if ! command_exists node; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    exit 1
fi

if ! command_exists npm; then
    echo -e "${RED}Error: npm is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites check passed${NC}"
echo ""

# Check for .env files
echo -e "${BLUE}Checking environment files...${NC}"

if [ ! -f "backend/.env" ]; then
    echo -e "${YELLOW}Warning: backend/.env not found. Creating template...${NC}"
    cat > backend/.env << EOF
GROQ_API_KEY=your_groq_api_key_here
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
PORT=5001
HOST=0.0.0.0
FLASK_DEBUG=True
EOF
    echo -e "${YELLOW}Please update backend/.env with your API keys${NC}"
fi

if [ ! -f "frontend/server/.env" ]; then
    echo -e "${YELLOW}Warning: frontend/server/.env not found. Creating template...${NC}"
    cat > frontend/server/.env << EOF
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
    echo -e "${YELLOW}Please update frontend/server/.env with your configuration${NC}"
fi

if [ ! -f "frontend/.env" ]; then
    echo -e "${YELLOW}Warning: frontend/.env not found. Creating template...${NC}"
    echo "VITE_API_URL=http://localhost:3001/api" > frontend/.env
fi

echo -e "${GREEN}✓ Environment files check passed${NC}"
echo ""

# Clean up ports
echo -e "${BLUE}Checking ports...${NC}"
kill_port 5001
kill_port 3001
kill_port 5173
echo -e "${GREEN}✓ Ports are ready${NC}"
echo ""

# Install dependencies if needed
echo -e "${BLUE}Checking dependencies...${NC}"

if [ ! -d "backend/venv" ] && [ ! -d "backend/env" ]; then
    echo -e "${YELLOW}Python virtual environment not found. Installing Python dependencies...${NC}"
    cd backend
    pip install -r requirements.txt || {
        echo -e "${RED}Error: Failed to install Python dependencies${NC}"
        exit 1
    }
    cd ..
fi

if [ ! -d "frontend/server/node_modules" ]; then
    echo -e "${YELLOW}Node.js backend dependencies not found. Installing...${NC}"
    cd frontend/server
    npm install || {
        echo -e "${RED}Error: Failed to install Node.js backend dependencies${NC}"
        exit 1
    }
    cd ../..
fi

if [ ! -d "frontend/node_modules" ]; then
    echo -e "${YELLOW}React frontend dependencies not found. Installing...${NC}"
    cd frontend
    npm install || {
        echo -e "${RED}Error: Failed to install React frontend dependencies${NC}"
        exit 1
    }
    cd ..
fi

echo -e "${GREEN}✓ Dependencies check passed${NC}"
echo ""

# Check database
echo -e "${BLUE}Checking database...${NC}"
if [ ! -f "frontend/server/prisma/dev.db" ]; then
    echo -e "${YELLOW}Database not found. Setting up database...${NC}"
    cd frontend/server
    npm run db:generate || echo -e "${YELLOW}Warning: db:generate failed${NC}"
    npm run db:push || echo -e "${YELLOW}Warning: db:push failed${NC}"
    cd ../..
fi
echo -e "${GREEN}✓ Database check passed${NC}"
echo ""

# Function to start Python backend
start_python_backend() {
    echo -e "${BLUE}Starting Python Backend (Port 5001)...${NC}"
    cd backend
    
    # Check if app.py exists
    if [ ! -f "app.py" ]; then
        echo -e "${YELLOW}Warning: app.py not found in backend directory${NC}"
        echo -e "${YELLOW}The Python backend may need to be set up separately${NC}"
        echo -e "${YELLOW}Please refer to backend/README.md for setup instructions${NC}"
        echo -e "${YELLOW}Skipping Python backend startup...${NC}"
        cd ..
        return 0
    fi
    
    # Check if Flask is installed
    if ! python3 -c "import flask" 2>/dev/null; then
        echo -e "${YELLOW}Warning: Flask is not installed. Installing dependencies...${NC}"
        pip install -r requirements.txt || {
            echo -e "${RED}Error: Failed to install Python dependencies${NC}"
            cd ..
            return 1
        }
    fi
    
    python3 app.py > ../logs/python_backend.log 2>&1 &
    PYTHON_PID=$!
    echo $PYTHON_PID > ../logs/python_backend.pid
    
    # Wait a bit and check if the process is still running
    sleep 2
    if ! kill -0 $PYTHON_PID 2>/dev/null; then
        echo -e "${RED}Error: Python backend failed to start. Check logs/python_backend.log${NC}"
        cd ..
        return 1
    fi
    
    echo -e "${GREEN}✓ Python Backend started (PID: $PYTHON_PID)${NC}"
    cd ..
}

# Function to start Node.js backend
start_node_backend() {
    echo -e "${BLUE}Starting Node.js Backend (Port 3001)...${NC}"
    cd frontend/server
    npm run dev > ../../logs/node_backend.log 2>&1 &
    NODE_PID=$!
    echo $NODE_PID > ../../logs/node_backend.pid
    echo -e "${GREEN}✓ Node.js Backend started (PID: $NODE_PID)${NC}"
    cd ../..
}

# Function to start React frontend
start_react_frontend() {
    echo -e "${BLUE}Starting React Frontend (Port 5173)...${NC}"
    cd frontend
    npm run dev > ../logs/react_frontend.log 2>&1 &
    REACT_PID=$!
    echo $REACT_PID > ../logs/react_frontend.pid
    echo -e "${GREEN}✓ React Frontend started (PID: $REACT_PID)${NC}"
    cd ..
}

# Create logs directory
mkdir -p logs

# Start services
echo -e "${BLUE}Starting services...${NC}"
echo ""

start_python_backend
sleep 3

start_node_backend
sleep 3

start_react_frontend
sleep 3

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  All services started!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}Services:${NC}"
echo -e "  ${GREEN}Python Backend:${NC}  http://localhost:5001"
echo -e "  ${GREEN}Node.js Backend:${NC} http://localhost:3001"
echo -e "  ${GREEN}React Frontend:${NC}  http://localhost:5173"
echo ""
echo -e "${BLUE}Logs:${NC}"
echo -e "  Python Backend:  logs/python_backend.log"
echo -e "  Node.js Backend: logs/node_backend.log"
echo -e "  React Frontend:  logs/react_frontend.log"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}Stopping all services...${NC}"
    
    if [ -f "logs/python_backend.pid" ]; then
        kill $(cat logs/python_backend.pid) 2>/dev/null || true
        rm logs/python_backend.pid
    fi
    
    if [ -f "logs/node_backend.pid" ]; then
        kill $(cat logs/node_backend.pid) 2>/dev/null || true
        rm logs/node_backend.pid
    fi
    
    if [ -f "logs/react_frontend.pid" ]; then
        kill $(cat logs/react_frontend.pid) 2>/dev/null || true
        rm logs/react_frontend.pid
    fi
    
    kill_port 5001
    kill_port 3001
    kill_port 5173
    
    echo -e "${GREEN}All services stopped${NC}"
    exit 0
}

# Trap Ctrl+C
trap cleanup INT TERM

# Wait for user interrupt
wait

