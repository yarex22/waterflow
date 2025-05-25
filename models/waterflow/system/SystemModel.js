const mongoose = require("mongoose");

const systemSchema = new mongoose.Schema({
  districtId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'District',
    required: true, 
    unique: true 
  },
  fontanarios: Number, // Tarifa por m³
  taxaDisponibilidade: Number, // MT/mês para todas categorias

  domestico: {
    consumoMinimo: Number,
    escalao1: { min: Number, max: Number, valor: Number },
    escalao2: { min: Number, max: Number, valor: Number },
    escalao3: { min: Number, max: Number, valor: Number }
  },

  municipio: {
    useEscaloes: Boolean, // true = usa escalões, false = usa taxa fixa
    taxaFixa: Number, // Se useEscaloes for false, essa taxa será usada
    consumoMinimo: Number,
    escalao1: { min: Number, max: Number, valor: Number },
    escalao2: { min: Number, max: Number, valor: Number },
    escalao3: { min: Number, max: Number, valor: Number }
  },

  comercioPublico: {
    consumoMinimo: Number,
    taxaBase: Number,
    tarifaAcimaMinimo: Number
  },

  industria: {
    consumoMinimo: Number,
    taxaBase: Number,
    tarifaAcimaMinimo: Number
  }
});

module.exports = mongoose.model("System", systemSchema);
