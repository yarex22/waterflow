const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    type: { type: String, enum: ['Cliente', 'Expansao'], required: true }, // Tipo da empresa
    config: {
      currency: { type: String, default: 'MZN' },
      billingDay: { type: Number, min: 1, max: 31 }, // dia do mês para faturamento
    },
    address: String,
    contact: String,
    nuit: String,
    logo: String,
    provinces: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Province' }], // Províncias em que atua
    email: { type: String, required: true, match: /.+\@.+\..+/ }, // Validação de formato de e-mail
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now } // Adicionado para rastrear a data de atualização
  });

module.exports = mongoose.model("Company", companySchema);