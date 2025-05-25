const ErrorResponse = require("../utils/ErrorResponse");
const mongoose = require("mongoose");
const Customer = require('../models/waterflow/customer/CustomerModel');
const Payment = require('../models/waterflow/payment/PaymentModel');
const CustomerInfraction = require('../models/waterflow/customerInfraction/CustomerInfractionModel');
const Invoice = require('../models/waterflow/invoice/InvoiceModel');

// Middleware para verificar acesso baseado em empresa
exports.checkCompanyAccess = (resource) => async (req, res, next) => {
    try {
        // Admin tem acesso total
        if (req.user.role === 'admin') {
            return next();
        }

        // Para criação de novo pagamento
        if (req.method === 'POST' && resource === 'Payment') {
            const { invoiceId } = req.body;
            
            // Verificar se a fatura existe e pertence à empresa do usuário
            const invoice = await Invoice.findById(invoiceId);
            if (!invoice) {
                return next(new ErrorResponse('Fatura não encontrada', 404));
            }

            if (invoice.company.toString() !== req.user.company.toString()) {
                return next(new ErrorResponse('Não autorizado: fatura pertence a outra empresa', 403));
            }

            // Adicionar companyId ao body
            req.body.companyId = req.user.company;
        }

        // Para listagens e consultas
        if (req.method === 'GET') {
            // Adicionar filtro de empresa à query
            req.query.companyId = req.user.company;
        }

        // Para cancelamento ou atualização de pagamento
        if ((req.method === 'DELETE' || req.method === 'PUT') && resource === 'Payment') {
            const payment = await Payment.findById(req.params.id);
            if (!payment) {
                return next(new ErrorResponse('Pagamento não encontrado', 404));
            }

            if (payment.companyId.toString() !== req.user.company.toString()) {
                return next(new ErrorResponse('Não autorizado: pagamento pertence a outra empresa', 403));
            }
        }

        next();
    } catch (error) {
        next(new ErrorResponse('Erro ao verificar acesso', 500));
    }
};

// Middleware para verificar se o usuário tem acesso a um recurso específico
exports.checkResourceCompany = (Model) => async (req, res, next) => {
    try {
        // Se for admin, permite acesso total
        if (req.user.role === 'admin') {
            return next();
        }

        const resourceId = req.params.id;
        if (!resourceId) {
            return next();
        }

        const resource = await Model.findById(resourceId);
        if (!resource) {
            return next(new ErrorResponse("Recurso não encontrado", 404));
        }

        // Verifica se o recurso pertence à empresa do usuário
        if (resource.company.toString() !== req.user.company.toString()) {
            return next(new ErrorResponse("Acesso negado: Este recurso não pertence à sua empresa", 403));
        }

        next();
    } catch (error) {
        return next(new ErrorResponse("Erro ao verificar acesso ao recurso", 500));
    }
}; 
