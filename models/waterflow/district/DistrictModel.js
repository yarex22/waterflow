const mongoose = require('mongoose');

const districtSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }, // Nome do distrito, obrigatório e único
    province: { type: mongoose.Schema.Types.ObjectId, ref: 'Province', required: true }, // Referência à província, obrigatória
    population: { type: Number, min: 0 }, // Garantido que a população seja um número positivo
    area: { type: Number, min: 0 }, // Área do distrito em km², opcional mas deve ser positiva
    createdAt: { type: Date, default: Date.now }, // Data de criação do registro
    updatedAt: { type: Date } // Data da última atualização
}, { timestamps: true });

// Método para atualizar a população do distrito
districtSchema.methods.updatePopulation = function(newPopulation) {
    if (newPopulation < 0) throw new Error("A população não pode ser negativa.");
    this.population = newPopulation;
    return this.save();
};

// Método para atualizar a área do distrito
districtSchema.methods.updateArea = function(newArea) {
    if (newArea < 0) throw new Error("A área não pode ser negativa.");
    this.area = newArea;
    return this.save();
};

// Método estático para buscar distritos por nome
districtSchema.statics.findByName = function(name) {
    return this.findOne({ name });
};

// Método estático para listar todos os distritos
districtSchema.statics.listAllDistricts = function() {
    return this.find({}).populate('province'); // Popula a referência à província
};

module.exports = mongoose.model("District", districtSchema);