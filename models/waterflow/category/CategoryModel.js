const mongoose = require("mongoose");
const categorySchema = new mongoose.Schema({
    name: { 
        type: String, 
        enum: ['Doméstico', 'Fontanário', 'Município', 'Comercial', 'Industrial', 'Público', 'Outros'], // categorias permitidas
        required: true // campo obrigatório
    },
    description: { type: String }, // descrição da categoria
    createdAt: { type: Date, default: Date.now }, // data de criação do registro
    updatedAt: { type: Date } // data da última atualização
  });
      
  module.exports = mongoose.model("Category", categorySchema);
  