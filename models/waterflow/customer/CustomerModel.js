const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema({
  // ... existing code ...
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  
  // Contatos
  contact1: { 
    type: String, 
    required: true, 
    match: [/^\+?[1-9]\d{1,14}$/, "Número de telefone inválido"]
  },
  contact2: { 
    type: String, 
    match: [/^\+?[1-9]\d{1,14}$/, "Número de telefone inválido"]
  },
  email: { 
    type: String, 
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Email inválido"], 
    required: true,
    lowercase: true,
    trim: true 
  },
  availableCredit: {
    type: Number,
    default: 0
  },

  // Informações Adicionais
  docNumber: { type: String, required: true },
  nuit: { type: String, required: true },
  status: { type: String, enum: ["Ativo", "Inativo"], required: true },
  document: [{ type: String }],   // Array de URLs dos documentos anexados
  
  // Referência à empresa
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true }
}, { 
  timestamps: true 
});

// Índice de texto para buscas
customerSchema.index({ name: "text", email: "text" });

module.exports = mongoose.models.Customer || mongoose.model('Customer', customerSchema);