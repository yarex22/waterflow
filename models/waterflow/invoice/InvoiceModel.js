const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
    invoiceNumber: {
        type: String,
        required: true,
        unique: true
    },
    invoiceType: {
        type: String,
        enum: ['infraction', 'reading'],
        required: true
    },
    customerInfraction: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CustomerInfraction',
        required: function() {
            return this.invoiceType === 'infraction';
        }
    },
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer',
        required: true
    },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    reading: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Reading',
        required: function() {
            return this.invoiceType === 'reading';
        }
    },
    connection: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Connection',
        required: function() {
            return this.invoiceType === 'reading';
        }
    },
    amount: {
        type: Number,
        required: true
    },
    baseAmount: {
        type: Number,
        required: true
    },
    tax: {
        type: Number,
        required: true
    },
    totalAmount: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'paid', 'cancelled'],
        default: 'pending'
    },
    dueDate: {
        type: Date,
        required: true
    },
    issueDate: {
        type: Date,
        default: Date.now
    },
    paidDate: {
        type: Date
    },
    paymentMethod: {
        type: String,
        enum: ['cash', 'mpesa', 'bank_transfer', 'check', 'other']
    },
    paymentReference: {
        type: String
    },
    notes: {
        type: String
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Middleware para calcular valores antes de salvar
invoiceSchema.pre('save', function(next) {
    // Calcula o total com impostos
    this.totalAmount = this.baseAmount + this.tax;
    next();
});

// Método estático para gerar número da fatura
invoiceSchema.statics.generateInvoiceNumber = async function() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    
    // Encontra a última fatura do mês atual
    const lastInvoice = await this.findOne({
        invoiceNumber: new RegExp(`^INV${year}${month}`)
    }).sort({ invoiceNumber: -1 });
    
    let sequence = '0001';
    if (lastInvoice) {
        const lastSequence = parseInt(lastInvoice.invoiceNumber.slice(-4));
        sequence = String(lastSequence + 1).padStart(4, '0');
    }
    
    return `INV${year}${month}${sequence}`;
};

// Índices
invoiceSchema.index({ customer: 1 });
invoiceSchema.index({ connection: 1 });
invoiceSchema.index({ status: 1 });
invoiceSchema.index({ dueDate: 1 });
invoiceSchema.index({ invoiceNumber: 1 }, { unique: true });

const Invoice = mongoose.model('Invoice', invoiceSchema);

module.exports = Invoice; 