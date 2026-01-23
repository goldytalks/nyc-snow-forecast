#!/bin/bash

# NYC Snowfall Forecast Dashboard - Quick Start
# Run this script OR follow the manual steps below

echo "🌨️ NYC Snowfall Forecast Dashboard Setup"
echo "========================================="

# Step 1: Navigate to project
cd ~/Desktop/nyc-snow-forecast

# Step 2: Initialize Next.js (this will prompt for options)
echo ""
echo "Step 1: Creating Next.js app..."
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*" --use-npm

# Step 3: Install additional dependencies
echo ""
echo "Step 2: Installing dependencies..."
npm install recharts lucide-react clsx tailwind-merge

# Step 4: Initialize shadcn
echo ""
echo "Step 3: Initializing shadcn/ui..."
npx shadcn-ui@latest init -y

# Step 5: Add shadcn components
echo ""
echo "Step 4: Adding shadcn components..."
npx shadcn-ui@latest add card badge progress

# Step 6: Create directories
echo ""
echo "Step 5: Creating project structure..."
mkdir -p lib/model
mkdir -p data
mkdir -p components

# Step 7: Initialize git
echo ""
echo "Step 6: Initializing git..."
git init
git add .
git commit -m "Initial setup"

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Open a new terminal and run: cd ~/Desktop/nyc-snow-forecast && claude"
echo "2. Tell Claude: 'Read PROJECT_SPEC.md and CLAUDE.md, then build this dashboard autonomously. Start with Phase 1.'"
echo "3. Press Ctrl+B to background the task if you want to do other things"
echo ""
