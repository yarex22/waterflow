const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", required: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: Date, required: true, default: Date.now },
    amount: { type: Number, required: true, min: 0 },
    notes: { type: String, default: "" }
}, { timestamps: true });

// Função que atualiza a fatura após o pagamento
paymentSchema.methods.applyPayment = async function () {
    const Invoice = require('../invoice/InvoiceModel');
    const invoice = await Invoice.findById(this.invoiceId);
    if (!invoice) throw new Error('Fatura não encontrada');
  
    // Atualiza o valor restante da dívida
    invoice.remainingDebt = Math.max(invoice.remainingDebt - this.amount, 0);
    invoice.availableCreditUsed += this.amount;
  
    // Atualiza o status da fatura
    if (invoice.remainingDebt === 0) {
      invoice.status = 'pago';
    } else {
      invoice.status = invoice.availableCreditUsed > 0 ? 'pago parcial' : 'nao pago';
    }
  
    await invoice.save();
  };

// Método estático para buscar pagamentos por cliente
paymentSchema.statics.findByCustomerId = function(customerId) {
    return this.find({ customerId });
};

module.exports = mongoose.models.Payment || mongoose.model("Payment", paymentSchema);


// Explicações das melhorias:
// 1. Campo invoiceId: Tornado obrigatório para garantir que cada pagamento esteja associado a uma fatura.
// Validação do campo amount: Garantido que o valor do pagamento seja um número positivo.
// Método applyPayment: Permite aplicar um pagamento à fatura correspondente, atualizando a dívida e o status da fatura conforme necessário.
// Método estático findByCustomerId: Facilita a busca de pagamentos por cliente, tornando a consulta mais intuitiva.
// Essas melhorias tornam o modelo de pagamento mais robusto e funcional, permitindo um gerenciamento mais eficiente dos pagamentos.