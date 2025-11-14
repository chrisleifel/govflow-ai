# Govli AI - Government Automation Platform

## Quick Start

### Prerequisites
- Docker Desktop installed

### Start Everything
```bash
docker-compose up --build
```

### Access the Platform
- Frontend: http://localhost:8080
- Backend API: http://localhost:3000/health
- Database: localhost:5432

### Default Credentials
- Email: admin@govli.ai
- Password: Admin123!

## Manual Setup (Without Docker)

1. Install PostgreSQL
2. Create database: `createdb govli_ai`
3. Install backend: `cd backend && npm install`
4. Initialize DB: `node src/init-db.js`
5. Start backend: `npm start`
6. Serve frontend: `cd frontend && python3 -m http.server 8080`
