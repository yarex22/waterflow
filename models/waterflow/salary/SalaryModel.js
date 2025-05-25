const mongoose = require('mongoose');

const salarySchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
    index: true
  },

  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },

  baseSalary: {
    type: Number,
    required: true,
    min: 0
  },

  totalTaxes: {
    type: Number,
    required: true,
    min: 0
  },

  totalBenefits: {
    type: Number,
    required: true,
    min: 0
  },

  netSalary: {
    type: Number,
    required: true,
    min: 0
  },

  details: {
    type: [
      {
        name: { type: String, required: true },
        type: { type: String, enum: ['Tax', 'Benefit'], required: true },
        source: { type: String, enum: ['Global', 'Individual'], required: true },
        valueType: { type: String, enum: ['Fixed', 'Percentage'], required: true },
        value: { type: Number, required: true },
        amount: { type: Number, required: true } // valor aplicado sobre o salário
      }
    ],
    default: []
  },

  month: {
    type: String, // Ex: "2024-03"
    required: true,
    match: /^\d{4}-\d{2}$/,
    index: true
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Salary', salarySchema);
