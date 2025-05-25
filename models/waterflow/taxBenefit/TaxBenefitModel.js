const mongoose = require('mongoose');

const taxBenefitSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    index: true
  },

  type: {
    type: String,
    enum: ['Tax', 'Benefit'],
    required: true
  },

  valueType: {
    type: String,
    enum: ['Fixed', 'Percentage'],
    required: true
  },

  value: {
    type: Number,
    required: true,
    min: 0
  },

  applyToAllEmployees: {
    type: Boolean,
    default: true
  },

  description: {
    type: String,
    trim: true,
    default: ''
  },

  isActive: {
    type: Boolean,
    default: true
  },

  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

module.exports = mongoose.model("TaxBenefit", taxBenefitSchema);




