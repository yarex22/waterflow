const mongoose = require('mongoose');

const ConnectionInfractionSchema = new mongoose.Schema({
  connection: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Connection',
    required: true
  },
  infractionType: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InfractionType',
    required: true
  },
  images: {
    type: [String], // Array de strings para armazenar os caminhos das imagens
    required: true
  },
  infractionDate: {
    type: Date,
    default: Date.now
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['Pendente', 'Resolvida', 'Multa Aplicada'],
    default: 'Pendente'
  },
  comments: {
    type: String
  }
});

// Índices para melhorar a performance das consultas
ConnectionInfractionSchema.index({ connection: 1, company: 1 });
ConnectionInfractionSchema.index({ createdAt: -1 });
ConnectionInfractionSchema.index({ status: 1 });

module.exports = mongoose.model('ConnectionInfraction', ConnectionInfractionSchema); 