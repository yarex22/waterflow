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
        required: function() {
            return this.invoiceType === 'reading';
        }
    },
    taxAmount: {
        type: Number,
        required: function() {
            return this.invoiceType === 'reading';
        }
    },
    totalAmount: {
        type: Number,
        required: true
    },
    reconnectionFee: {
        type: Number,
        default: 0
    },
    availableCreditUsed: {
        type: Number,
        default: 0
    },
    remainingDebt: {
        type: Number,
        default: 0
    },
    invoiceYearMonth: {
        type: String,
        required: true,
        validate: {
            validator: function(v) {
                return /^\d{4}-\d{2}$/.test(v);
            },
            message: props => `${props.value} não é um formato válido de ano-mês (YYYY-MM)!`
        }
    },
    payments: [{
        amount: Number,
        date: Date,
        method: {
            type: String,
            enum: ['Dinheiro', 'M-Pesa', 'Transferência Bancária', 'Outro']
        },
        reference: String,
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    }],
    status: {
        type: String,
        enum: ['Pendente', 'Pago', 'Pago parcial', 'Vencido', 'Cancelado'],
        default: 'Pendente'
    },
    dueDate: {
        type: Date,
        required: true
    },
    paymentDate: {
        type: Date
    },
    paymentMethod: {
        type: String,
        enum: ['Dinheiro', 'M-Pesa', 'Transferência Bancária', 'Outro']
    },
    paymentReference: {
        type: String
    },
    observations: {
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

// Gerar número da fatura automaticamente
invoiceSchema.pre('save', async function(next) {
    if (this.isNew) {
        const currentDate = new Date();
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        
        // Definir invoiceYearMonth
        this.invoiceYearMonth = `${year}-${month}`;
        
        const prefix = this.invoiceType === 'infraction' ? 'INF' : 'FAT';
        
        // Encontrar o último número de fatura para este mês e tipo
        const lastInvoice = await this.constructor.findOne({
            invoiceNumber: new RegExp(`^${prefix}${year}${month}`),
            invoiceType: this.invoiceType
        }).sort({ invoiceNumber: -1 });

        let sequence = 1;
        if (lastInvoice) {
            const lastSequence = parseInt(lastInvoice.invoiceNumber.slice(-4));
            sequence = lastSequence + 1;
        }

        this.invoiceNumber = `${prefix}${year}${month}${String(sequence).padStart(4, '0')}`;
    }
    next();
});

// Índices
invoiceSchema.index({ company: 1, invoiceNumber: 1 });
invoiceSchema.index({ customer: 1, status: 1 });
invoiceSchema.index({ customerInfraction: 1 });
invoiceSchema.index({ reading: 1 });
invoiceSchema.index({ connection: 1 });
invoiceSchema.index({ dueDate: 1, status: 1 });
invoiceSchema.index({ invoiceType: 1 });
invoiceSchema.index({ invoiceYearMonth: 1 });

const Invoice = mongoose.model('Invoice', invoiceSchema);

module.exports = Invoice;
