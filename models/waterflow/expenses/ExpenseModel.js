const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true, default: Date.now },
    category: {
        type: String,
        required: true,
        lowercase: true,
        enum: [
            'energia',
            'agua',
            'internet',
            'telefone',
            'aluguel',
            'material_escritorio',
            'manutencao',
            'transporte',
            'alimentacao',
            'salarios',
            'impostos',
            'software',
            'equipamentos',
            'outros'
        ]
    },
    kw: {
        type: Number,
        required: function() {
            return this.category === 'energia';
        },
        min: 0,
        validate: {
            validator: function(v) {
                if (this.category === 'energia') {
                    return v != null && v >= 0;
                }
                return true;
            },
            message: 'KW é obrigatório para despesas de energia e deve ser maior ou igual a zero'
        }
    },
    attachment: {
        filename: { type: String },
        originalname: { type: String },
        mimetype: { type: String },
        path: { type: String },
        size: { type: Number }
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

expenseSchema.methods.updateDescription = function (newDescription) {
    this.description = newDescription;
    return this.save();
};

expenseSchema.methods.updateAmount = function (newAmount) {
    if (newAmount < 0) throw new Error("O valor da despesa não pode ser negativo.");
    this.amount = newAmount;
    return this.save();
};

expenseSchema.statics.findByCategory = function (category) {
    return this.find({ category });
};

expenseSchema.statics.findByDateRange = function (startDate, endDate) {
    return this.find({ date: { $gte: startDate, $lte: endDate } });
};

module.exports = mongoose.models.Expense || mongoose.model("Expense", expenseSchema);
