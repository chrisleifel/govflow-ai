const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const sequelize = require('./config/database');
require('dotenv').config();

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:8080',
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const authRoutes = require('./routes/auth');
const permitRoutes = require('./routes/permits');
const dashboardRoutes = require('./routes/dashboard');

app.use('/api/auth', authRoutes);
app.use('/api/permits', permitRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'Govli AI Backend',
    timestamp: new Date().toISOString() 
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

const PORT = process.env.PORT || 3000;

sequelize.sync().then(() => {
  console.log('✅ Database synced');
  app.listen(PORT, () => {
    console.log(`🚀 Govli AI Backend running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}).catch(err => {
  console.error('❌ Database sync failed:', err);
});

module.exports = app;
