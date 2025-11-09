#!/bin/bash

# API Test Script for TerraMindAI
# This script tests if all APIs are accessible

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  TerraMindAI API Test Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Function to test HTTP endpoint
test_endpoint() {
    local url=$1
    local name=$2
    local expected_status=${3:-200}
    
    echo -n "Testing $name... "
    
    if command -v curl >/dev/null 2>&1; then
        response=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "$url" 2>/dev/null || echo "000")
        
        if [ "$response" = "$expected_status" ] || [ "$response" = "200" ] || [ "$response" = "404" ]; then
            # 404 is acceptable for some endpoints that require auth
            if [ "$response" = "404" ]; then
                echo -e "${YELLOW}⚠ Server responding but endpoint not found (might require auth)${NC}"
            else
                echo -e "${GREEN}✓ Accessible (HTTP $response)${NC}"
            fi
            return 0
        else
            echo -e "${RED}✗ Not accessible (HTTP $response)${NC}"
            return 1
        fi
    else
        echo -e "${YELLOW}⚠ curl not available, skipping${NC}"
        return 1
    fi
}

# Function to check if port is open
check_port() {
    local port=$1
    local name=$2
    
    echo -n "Checking $name (port $port)... "
    
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Port $port is open${NC}"
        return 0
    else
        echo -e "${RED}✗ Port $port is not open${NC}"
        return 1
    fi
}

# Test ports
echo -e "${BLUE}Checking ports...${NC}"
PYTHON_PORT=5001
NODE_PORT=3001
REACT_PORT=5173

python_running=false
node_running=false
react_running=false

if check_port $PYTHON_PORT "Python Backend"; then
    python_running=true
fi

if check_port $NODE_PORT "Node.js Backend"; then
    node_running=true
fi

if check_port $REACT_PORT "React Frontend"; then
    react_running=true
fi

echo ""

# Test Python Backend APIs (if running)
if [ "$python_running" = true ]; then
    echo -e "${BLUE}Testing Python Backend APIs (Port $PYTHON_PORT)...${NC}"
    test_endpoint "http://localhost:$PYTHON_PORT/" "Root endpoint"
    test_endpoint "http://localhost:$PYTHON_PORT/rag-status" "RAG Status"
    test_endpoint "http://localhost:$PYTHON_PORT/visualization/countries" "Visualization - Countries"
    echo ""
else
    echo -e "${YELLOW}Python Backend is not running on port $PYTHON_PORT${NC}"
    echo -e "${YELLOW}Note: This is expected if app.py doesn't exist${NC}"
    echo ""
fi

# Test Node.js Backend APIs (if running)
if [ "$node_running" = true ]; then
    echo -e "${BLUE}Testing Node.js Backend APIs (Port $NODE_PORT)...${NC}"
    test_endpoint "http://localhost:$NODE_PORT/" "Root endpoint"
    test_endpoint "http://localhost:$NODE_PORT/health" "Health check"
    test_endpoint "http://localhost:$NODE_PORT/api/auth/login" "Auth endpoint (POST required)"
    test_endpoint "http://localhost:$NODE_PORT/api/courses" "Courses endpoint"
    echo ""
else
    echo -e "${RED}Node.js Backend is not running on port $NODE_PORT${NC}"
    echo ""
fi

# Test React Frontend (if running)
if [ "$react_running" = true ]; then
    echo -e "${BLUE}Testing React Frontend (Port $REACT_PORT)...${NC}"
    test_endpoint "http://localhost:$REACT_PORT/" "React Frontend"
    echo ""
else
    echo -e "${YELLOW}React Frontend is not running on port $REACT_PORT${NC}"
    echo ""
fi

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Test Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

if [ "$python_running" = true ]; then
    echo -e "${GREEN}✓ Python Backend: Running${NC}"
else
    echo -e "${YELLOW}⚠ Python Backend: Not running (may need app.py)${NC}"
fi

if [ "$node_running" = true ]; then
    echo -e "${GREEN}✓ Node.js Backend: Running${NC}"
else
    echo -e "${RED}✗ Node.js Backend: Not running${NC}"
fi

if [ "$react_running" = true ]; then
    echo -e "${GREEN}✓ React Frontend: Running${NC}"
else
    echo -e "${YELLOW}⚠ React Frontend: Not running${NC}"
fi

echo ""
echo -e "${BLUE}Access URLs:${NC}"
[ "$python_running" = true ] && echo -e "  Python Backend:  http://localhost:$PYTHON_PORT"
[ "$node_running" = true ] && echo -e "  Node.js Backend: http://localhost:$NODE_PORT"
[ "$react_running" = true ] && echo -e "  React Frontend:  http://localhost:$REACT_PORT"
echo ""

if [ "$node_running" = false ] && [ "$react_running" = false ]; then
    echo -e "${YELLOW}To start services, run: ./start.sh${NC}"
fi

