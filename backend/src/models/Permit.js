const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Permit = sequelize.define('Permit', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  permitNumber: {
    type: DataTypes.STRING,
    unique: true
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'submitted'
  },
  applicantName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  applicantEmail: {
    type: DataTypes.STRING,
    allowNull: false
  },
  propertyAddress: {
    type: DataTypes.STRING,
    allowNull: false
  },
  projectDescription: {
    type: DataTypes.TEXT
  }
});

module.exports = Permit;
