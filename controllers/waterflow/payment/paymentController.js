const mongoose = require('mongoose');
const Payment = require('../../../models/waterflow/payment/PaymentModel');
const Invoice = require('../../../models/waterflow/invoice/InvoiceModel');
const Customer = require('../../../models/waterflow/customer/CustomerModel');
const ErrorResponse = require('../../../utils/ErrorResponse');
const asyncHandler = require('../../../middleware/asyncHandler');

// Função utilitária para arredondar valores monetários
const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

const logAuditInfo = (action, entityType, entityId, userId, oldData, newData) => {
    console.log(`[AUDIT] ${action} - ${entityType} ${entityId} by user ${userId}`);
    if (oldData) console.log(`[AUDIT] Old data: ${JSON.stringify(oldData)}`);
    if (newData) console.log(`[AUDIT] New data: ${JSON.stringify(newData)}`);
    // Em uma implementação completa, você salvaria essas informações em uma coleção de auditoria
  };

// @desc    Criar novo pagamento
// @route   POST /api/payments
// @access  Private
exports.createPayment = asyncHandler(async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { invoiceId, amount, notes } = req.body;

        // Validações
        if (!mongoose.Types.ObjectId.isValid(invoiceId)) {
            throw new ErrorResponse('ID da fatura inválido', 400);
        }

        // Validar e converter o valor amount para número
        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount) || numericAmount <= 0) {
            throw new ErrorResponse('Valor do pagamento deve ser positivo', 400);
        }

        // Arredondar o valor do pagamento para 2 casas decimais
        const paymentAmount = roundMoney(numericAmount);

        // Buscar a fatura
        const invoice = await Invoice.findById(invoiceId).session(session);
        if (!invoice) {
            throw new ErrorResponse('Fatura não encontrada', 404);
        }

        // Verificar se a fatura já está totalmente paga
        if (invoice.status === 'Pago' && invoice.remainingDebt === 0) {
            throw new ErrorResponse('Fatura já está completamente paga', 400);
        }

        // Verificar se o valor do pagamento é maior que o valor restante
        if (paymentAmount > invoice.remainingDebt) {
            throw new ErrorResponse(
                `Valor do pagamento excede o valor restante da fatura (${roundMoney(invoice.remainingDebt)})`,
                400
            );
        }

        // Criar um novo pagamento
        const payment = await Payment.create([{
            invoiceId: invoice._id,
            customerId: invoice.customer,
            companyId: req.body.companyId,
            amount: paymentAmount,
            notes: notes || 'Pagamento manual',
            createdBy: req.user._id
        }], { session });

        // Atualizar a fatura
        invoice.availableCreditUsed = roundMoney(invoice.availableCreditUsed + paymentAmount);
        invoice.remainingDebt = roundMoney(invoice.remainingDebt - paymentAmount);
        
        // Atualizar o status da fatura
        if (invoice.remainingDebt === 0) {
            invoice.status = 'Pago';
        } else {
            invoice.status = 'Pago parcial';
        }

        await invoice.save({ session });
        await session.commitTransaction();

        res.status(201).json({
            success: true,
            data: payment[0],
            remainingDebt: roundMoney(invoice.remainingDebt),
            status: invoice.status
        });

    } catch (error) {
        await session.abortTransaction();
        next(error);
    } finally {
        session.endSession();
    }
});

// @desc    Cancelar pagamento
// @route   DELETE /api/payments/:id
// @access  Private
exports.cancelPayment = asyncHandler(async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const payment = await Payment.findById(req.params.id).session(session);
        if (!payment) {
            throw new ErrorResponse('Pagamento não encontrado', 404);
        }

        // Buscar e atualizar a fatura
        const invoice = await Invoice.findById(payment.invoiceId).session(session);
        if (!invoice) {
            throw new ErrorResponse('Fatura não encontrada', 404);
        }

        // Atualizar a fatura
        invoice.availableCreditUsed = roundMoney(invoice.availableCreditUsed - payment.amount);
        invoice.remainingDebt = roundMoney(invoice.remainingDebt + payment.amount);

        // Atualizar o status da fatura
        if (invoice.remainingDebt === invoice.totalAmount) {
            invoice.status = 'Pendente';
        } else if (invoice.remainingDebt > 0) {
            invoice.status = 'Pago parcial';
        }

        await invoice.save({ session });
        await payment.remove({ session });
        await session.commitTransaction();

        res.status(200).json({
            success: true,
            message: 'Pagamento cancelado com sucesso'
        });

    } catch (error) {
        await session.abortTransaction();
        next(error);
    } finally {
        session.endSession();
    }
});

// @desc    Listar todos os pagamentos
// @route   GET /api/payments
// @access  Private
exports.getAllPayments = asyncHandler(async (req, res, next) => {
    const { 
        page = 1, 
        limit = 10, 
        customerId, 
        invoiceId, 
        startDate, 
        endDate 
    } = req.query;

    const query = { companyId: req.query.companyId };

    if (customerId) {
        query.customerId = customerId;
    }

    if (invoiceId) {
        query.invoiceId = invoiceId;
    }

    if (startDate || endDate) {
        query.date = {};
        if (startDate) query.date.$gte = new Date(startDate);
        if (endDate) {
            const endDateTime = new Date(endDate);
            endDateTime.setHours(23, 59, 59, 999);
            query.date.$lte = endDateTime;
        }
    }

    const total = await Payment.countDocuments(query);
    const payments = await Payment.find(query)
        .populate('invoiceId', 'invoiceNumber totalAmount')
        .populate('customerId', 'name code')
        .populate('createdBy', 'name')
        .sort('-date')
        .skip((page - 1) * limit)
        .limit(Number(limit));

    res.status(200).json({
        success: true,
        data: payments,
        pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / limit)
        }
    });
});

// @desc    Atualizar pagamento
// @route   PUT /api/payments/:id
// @access  Private
exports.updatePayment = asyncHandler(async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { amount, notes } = req.body;
        const payment = await Payment.findById(req.params.id).session(session);

        if (!payment) {
            throw new ErrorResponse('Pagamento não encontrado', 404);
        }

        // Validar novo valor
        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount) || numericAmount <= 0) {
            throw new ErrorResponse('Valor do pagamento deve ser positivo', 400);
        }

        const paymentAmount = roundMoney(numericAmount);
        const oldAmount = payment.amount;
        const difference = paymentAmount - oldAmount;

        // Buscar e atualizar a fatura
        const invoice = await Invoice.findById(payment.invoiceId).session(session);
        if (!invoice) {
            throw new ErrorResponse('Fatura não encontrada', 404);
        }

        // Verificar se o novo valor não excede o limite
        const newRemainingDebt = roundMoney(invoice.remainingDebt - difference);
        if (newRemainingDebt < 0) {
            throw new ErrorResponse(
                `O novo valor excederia o valor da fatura. Máximo possível: ${roundMoney(oldAmount + invoice.remainingDebt)}`,
                400
            );
        }

        // Atualizar pagamento
        payment.amount = paymentAmount;
        if (notes) payment.notes = notes;
        await payment.save({ session });

        // Atualizar fatura
        invoice.availableCreditUsed = roundMoney(invoice.availableCreditUsed + difference);
        invoice.remainingDebt = newRemainingDebt;

        if (invoice.remainingDebt === 0) {
            invoice.status = 'Pago';
        } else if (invoice.remainingDebt === invoice.totalAmount) {
            invoice.status = 'Pendente';
        } else {
            invoice.status = 'Pago parcial';
        }

        await invoice.save({ session });
        await session.commitTransaction();

        res.status(200).json({
            success: true,
            data: payment,
            remainingDebt: roundMoney(invoice.remainingDebt),
            status: invoice.status
        });

    } catch (error) {
        await session.abortTransaction();
        next(error);
    } finally {
        session.endSession();
    }
});