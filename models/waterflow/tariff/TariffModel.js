const mongoose = require('mongoose');

const tariffSchema = new mongoose.Schema({
    chargeRate: { 
        type: Number, 
        required: true, 
        min: 0 
    }, // Taxa de cobrança, obrigatória e deve ser positiva
    maxRate: { 
        type: Number, 
        required: true, 
        min: 0 
    }, // Taxa máxima, obrigatória e deve ser positiva
    minRate: { 
        type: Number, 
        required: true, 
        min: 0 
    }, // Taxa mínima, obrigatória e deve ser positiva
    reconnectionFee: { 
        type: Number, 
        required: true, 
        min: 0 
    }, // Taxa de reconexão, obrigatória e deve ser positiva
    description: { 
        type: String, 
        required: true 
    }, // Descrição da tarifa, obrigatória
    salaryCalculationDate: { 
        type: Date, 
        required: true 
    }, // Data em que o cálculo de salário é realizado
    invoiceGenerationDate: { 
        type: Date, 
        required: true 
    }, // Data em que a fatura é gerada
    company: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Company', 
        required: true 
    } // Referência à empresa, obrigatória
}, { timestamps: true });

// Método para atualizar a taxa de cobrança
tariffSchema.methods.updateChargeRate = function(newChargeRate) {
    if (newChargeRate < 0) throw new Error("A taxa de cobrança não pode ser negativa.");
    this.chargeRate = newChargeRate;
    return this.save();
};

// Método para verificar se uma tarifa está dentro dos limites
tariffSchema.methods.isWithinLimits = function(amount) {
    return amount >= this.minRate && amount <= this.maxRate;
};

// Método estático para buscar tarifas por descrição
tariffSchema.statics.findByDescription = function(description) {
    return this.findOne({ description });
};

// Método estático para listar todas as tarifas
tariffSchema.statics.listAllTariffs = function() {
    return this.find({});
};

module.exports = mongoose.model("Tariff", tariffSchema);
