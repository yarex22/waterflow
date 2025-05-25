const mongoose = require('mongoose');

const provinceSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }, // Nome da província, obrigatório e único
    population: { type: Number, min: 0 }, // Garantido que a população seja um número positivo
    capital: { type: String, required: true }, // Capital da província, obrigatório
    area: { type: Number, min: 0 }, // Área da província em km², opcional mas deve ser positiva
    createdAt: { type: Date, default: Date.now }, // Data de criação do registro
    updatedAt: { type: Date } // Data da última atualização
}, { timestamps: true });

// Método para atualizar a população da província
provinceSchema.methods.updatePopulation = function(newPopulation) {
    if (newPopulation < 0) throw new Error("A população não pode ser negativa.");
    this.population = newPopulation;
    return this.save();
};

// Método para atualizar a capital da província
provinceSchema.methods.updateCapital = function(newCapital) {
    this.capital = newCapital;
    return this.save();
};

// Método estático para buscar províncias por nome
provinceSchema.statics.findByName = function(name) {
    return this.findOne({ name });
};

// Método estático para listar todas as províncias
provinceSchema.statics.listAllProvinces = function() {
    return this.find({});
};

module.exports = mongoose.model("Province", provinceSchema);