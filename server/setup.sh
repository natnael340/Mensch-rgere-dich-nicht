#!/bin/bash

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed. Please install Node.js first."
    echo "Visit https://nodejs.org/ for installation instructions."
    exit 1
fi

echo "=== Setting up Node.js Backend for Mensch ärgere Dich nicht ==="
echo "This setup script will install all necessary dependencies and configure the server."

# Install dependencies
echo "Installing dependencies..."
npm install

# Create constants.js if it doesn't exist
if [ ! -f "src/constants.js" ]; then
    echo "Creating constants.js file..."
    cat > src/constants.js << EOF
// JWT Secret key - should match the one in Python backend
exports.SECRET_KEY = "your-secret-key-for-jwt-tokens";
exports.EXPIRE_MINUTES = 60; // Token expiration in minutes

// Game configuration
exports.MAXIMUM_ALLOWED_PLAYERS = 4;
EOF
fi

# Create .env file
echo "Creating .env file..."
cat > .env << EOF
PORT=8080
NODE_ENV=development
EOF

# Make the server.js file executable
chmod +x src/server.js

echo "=== Setup complete! ==="
echo "To start the server in development mode, run: npm run dev"
echo "To start the server in production mode, run: npm start"
echo "Server will run on port 8080"
echo ""
echo "Note: This server is compatible with the Python WebSocket implementation."
echo "Check WEBSOCKET.md for details on the compatibility layer."
