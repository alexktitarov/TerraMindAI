#!/bin/bash

# TerraMindAI Stop Script
# This script stops all running services

set -e

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
echo -e "${BLUE}  TerraMindAI Stop Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Function to kill process on a port
kill_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${YELLOW}Stopping service on port $port...${NC}"
        lsof -ti:$port | xargs kill -9 2>/dev/null || true
        sleep 1
        echo -e "${GREEN}✓ Stopped service on port $port${NC}"
    else
        echo -e "${BLUE}No service running on port $port${NC}"
    fi
}

# Function to kill process from PID file
kill_from_pid() {
    local pid_file=$1
    local service_name=$2
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 $pid 2>/dev/null; then
            echo -e "${YELLOW}Stopping $service_name (PID: $pid)...${NC}"
            kill $pid 2>/dev/null || kill -9 $pid 2>/dev/null || true
            sleep 1
            echo -e "${GREEN}✓ Stopped $service_name${NC}"
        else
            echo -e "${BLUE}$service_name was not running${NC}"
        fi
        rm -f "$pid_file"
    else
        echo -e "${BLUE}$service_name PID file not found${NC}"
    fi
}

# Stop services from PID files
echo -e "${BLUE}Stopping services from PID files...${NC}"
kill_from_pid "logs/python_backend.pid" "Python Backend"
kill_from_pid "logs/node_backend.pid" "Node.js Backend"
kill_from_pid "logs/react_frontend.pid" "React Frontend"

echo ""

# Stop services by port (fallback)
echo -e "${BLUE}Stopping services by port (fallback)...${NC}"
kill_port 5001
kill_port 3001
kill_port 5173

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  All services stopped${NC}"
echo -e "${GREEN}========================================${NC}"

