/**
 * Sequelize Instance Configuration
 * Central database connection for the application
 */

const { Sequelize } = require('sequelize');
const config = require('./config');

const sequelize = new Sequelize({
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  username: config.database.user,
  password: config.database.password,
  dialect: config.database.dialect,
  logging: config.database.logging,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  dialectOptions: config.nodeEnv === 'production' ? {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  } : {}
});

module.exports = sequelize;
