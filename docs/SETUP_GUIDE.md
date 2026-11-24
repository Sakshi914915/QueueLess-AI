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

The frontend and API can be separate Vercel projects. MySQL must be hosted by an external MySQL provider; Vercel does not run the database server.

### Database
1. Create a remotely accessible MySQL 8.0 database with your database provider.
2. Import `database/schema.sql`, then run `backend`'s `npm run seed` with the production database variables if you want the demo data.
3. Allow connections from your hosting provider as required. Set `DB_SSL=true` if your provider requires TLS.

### Backend API on Vercel
1. Import this GitHub repository as a Vercel project.
2. Set **Root Directory** to `backend` and **Framework Preset** to **Other**.
3. Add these environment variables in Vercel (Production, Preview, and Development as needed):
   - `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT`
   - `DB_SSL=true` if required by the database provider
   - `JWT_SECRET` (use a private random secret of at least 32 characters)
   - `CORS_ORIGIN=https://queue-less-ai-two.vercel.app`
   - `GEMINI_API_KEY` (optional)
4. Deploy. The serverless handler is `backend/api/[...path].js`; verify `https://<backend-domain>/api/health`.

### Frontend on Vercel
1. Create a second Vercel project from the same repository.
2. Set **Root Directory** to `frontend` and **Framework Preset** to **Other**; no build command is required.
3. The frontend uses its own origin for the API, so frontend and backend can share the same Vercel domain.
4. Commit and push that change, then deploy the frontend. Verify login/API requests in the browser.

Vercel serverless functions do not keep a persistent Socket.IO connection, so API features work but live socket updates are disabled when the backend URL uses a `vercel.app` domain. For real-time updates, host the backend on a persistent Node.js service instead and set `BACKEND_URL_OVERRIDE` to that service URL.
