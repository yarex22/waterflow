const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }, // Nome do departamento, obrigatório e único
    description: { type: String, required: false }, // Descrição do departamento, obrigatória
    head: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: false }, // Referência ao funcionário responsável, obrigatória
    createdAt: { type: Date, default: Date.now }, // Data de criação do registro
    updatedAt: { type: Date } // Data da última atualização
}, { timestamps: true });

// Método para atualizar a descrição do departamento
departmentSchema.methods.updateDescription = function(newDescription) {
    this.description = newDescription;
    return this.save();
};

// Método para atualizar o chefe do departamento
departmentSchema.methods.updateHead = function(newHead) {
    this.head = newHead;
    return this.save();
};

// Método estático para buscar departamentos por nome
departmentSchema.statics.findByName = function(name) {
    return this.findOne({ name });
};

// Método estático para listar todos os departamentos
departmentSchema.statics.listAllDepartments = function() {
    return this.find({}).populate('head'); // Popula a referência ao chefe do departamento
};

module.exports = mongoose.model("Department", departmentSchema);