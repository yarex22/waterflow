// models/waterflow/connection/ConnectionModel.js
const mongoose = require('mongoose');

const ConnectionSchema = new mongoose.Schema({
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  meterNumber: {
    type: String,
    required: true,
    unique: true
  },
  address: {
    type: String,
    required: true
  },
  location: {
    latitude: {
      type: Number,
      required: true
    },
    longitude: {
      type: Number,
      required: true
    }
  },
  district: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'District',
    required: true
  },
  neighborhood: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Neighborhood',
    required: false
  },
  category: {
    type: String,
    enum: ["Domestico", "Fontanario", "Municipio", "Comercial", "Industrial", "Publico"],
    required: true
  },
  initialReading: {
    type: Number,
    required: true,
    min: 0
  },
  meterImage: {
    type: String,
    required: true
  },
  meterStatus: {
    type: String,
    enum: ['Activo', 'Inactivo'],
    default: 'Activo'
  },
  system: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'System',
    required: true
  },
  contractDate: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['Activo', 'Inactivo','Fraude'],
    default: 'Activo'
  }
}, {
  timestamps: true
});

module.exports = mongoose.models.Connection || mongoose.model('Connection', ConnectionSchema);
