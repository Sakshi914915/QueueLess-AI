# QueueLess AI: Local Setup and Cloud Deployment Guide

## 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **MySQL**: 8.0 or compatible hosted MySQL database (e.g. AWS RDS, PlanetScale, Aiven)
- **npm**: v9.0.0 or higher

---

## 2. Local Development Setup

### Step 1: Clone or Navigate to Project
```bash
cd QueueLess-AI
```

### Step 2: Configure Environment Variables
Inside `backend/`, copy `.env.example` to `.env`:
```bash
cd backend
cp .env.example .env
```
Fill in your local MySQL credentials:
```env
PORT=5000
NODE_ENV=development
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=queueless_ai_db
DB_PORT=3306
JWT_SECRET=your_secure_jwt_secret_key_minimum_32_characters
JWT_EXPIRES_IN=7d
CORS_ORIGIN=*
GEMINI_API_KEY=your_gemini_api_key_optional
```

### Step 3: Initialize Database Schema & Seed Data
Execute the schema and seed scripts:
```bash
# Initialize 20 relational tables in MySQL
mysql -u root -p < ../database/schema.sql

# Seed initial Super Admin, Hospital, Bank, and Staff
npm run seed
```

### Step 4: Run Automated Test Suite
Verify that all 11 integration tests pass cleanly:
```bash
npm test
```

### Step 5: Start Server
```bash
npm start
```
The full application will be live at:
- Web App Frontend: `http://localhost:5000`
- REST APIs: `http://localhost:5000/api`
- Health Endpoint: `http://localhost:5000/api/health`

---

## 3. Demo Login Credentials

| Role | Email | Password |
|---|---|---|
| **Super Admin** | `superadmin@queueless.ai` | `Password@123` |
| **Hospital Admin** | `admin@citycare.org` | `Password@123` |
| **Bank Admin** | `admin@apexbank.com` | `Password@123` |
| **Staff (Dr. Sharma)** | `staff.drsharma@citycare.org` | `Password@123` |
| **Customer (Aarav)** | `customer@gmail.com` | `Password@123` |

---

## 4. Production Deployment

### Backend on Render (Web Service)
1. Push repository to GitHub.
2. In Render Dashboard, click **New + -> Web Service**.
3. Set **Root Directory**: `backend`
4. Set **Build Command**: `npm install`
5. Set **Start Command**: `npm start`
6. Add Environment Variables:
   - `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT` (Pointing to your hosted MySQL database)
   - `JWT_SECRET`
   - `CORS_ORIGIN` (Your Vercel domain or `*`)
   - `GEMINI_API_KEY` (Your Google Gemini API key)

### Frontend on Vercel
1. In Vercel Dashboard, click **Add New -> Project**.
2. Select your repository and set **Root Directory** to `frontend`.
3. Set **Framework Preset**: Other.
4. Deploy!
5. In `frontend/js/config.js`, verify `BACKEND_URL` points to your deployed Render URL.
