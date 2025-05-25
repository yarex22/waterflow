const mongoose = require('mongoose');

const InfractionTypeSchema = new mongoose.Schema({
  reason: {
    type: String,
    required: true,
    trim: true
  },
  defaultValue: {
    type: Number,
    required: true,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
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
  }
});

module.exports = mongoose.model('InfractionType', InfractionTypeSchema);
