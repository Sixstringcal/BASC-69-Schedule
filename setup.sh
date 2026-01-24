#!/bin/bash

echo "BASC 69 Schedule & Group Selection Setup"
echo "=========================================="
echo ""

# check if node is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed. Please install Node.js first."
    exit 1
fi

# check if mysql is installed
if ! command -v mysql &> /dev/null; then
    echo "WARNING: MySQL is not installed. Please install MySQL first."
    echo "   macOS: brew install mysql"
    echo "   Ubuntu: sudo apt-get install mysql-server"
    exit 1
fi

echo "Prerequisites check passed"
echo ""

# setup backend
echo "Installing backend dependencies..."
cd backend
npm install

if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install dependencies"
    exit 1
fi

echo "Backend dependencies installed"
echo ""

# check if .env exists
if [ ! -f ".env" ]; then
    echo "Creating .env file from template..."
    cp ../.env.example .env
    echo ".env file created"
    echo ""
    echo "IMPORTANT: Edit backend/.env with your configuration:"
    echo "   - WCA_CLIENT_ID"
    echo "   - WCA_CLIENT_SECRET"
    echo "   - DATABASE_URL"
    echo "   - SESSION_SECRET (generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\")"
    echo ""
else
    echo ".env file already exists"
fi

cd ..

# check if database exists
echo "Checking database..."
echo "Please enter your MySQL root password when prompted:"
mysql -u root -p -e "USE basc69_groups;" 2>/dev/null

if [ $? -ne 0 ]; then
    echo "Database does not exist. Creating database..."
    mysql -u root -p < backend/schema.sql
    
    if [ $? -eq 0 ]; then
        echo "Database created successfully"
    else
        echo "ERROR: Failed to create database. Please run manually:"
        echo "   mysql -u root -p < backend/schema.sql"
    fi
else
    echo "Database already exists"
fi

echo ""
echo "Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit backend/.env with your WCA OAuth credentials"
echo "2. Start the backend: cd backend && npm run dev"
echo "3. Start the frontend: python3 -m http.server 8000"
echo "4. Visit http://localhost:8000"
echo ""
