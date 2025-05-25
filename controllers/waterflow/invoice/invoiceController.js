const Invoice = require('../../../models/waterflow/invoice/InvoiceModel');
const ErrorResponse = require('../../../utils/ErrorResponse');
const asyncHandler = require('../../../middleware/asyncHandler');
const logger = require('../../../utils/logger');
const mongoose = require('mongoose');
const Customer = require('../../../models/waterflow/customer/CustomerModel');

// @desc    Listar todas as faturas
// @route   GET /api/invoices
exports.getAllInvoices = asyncHandler(async (req, res, next) => {
    try {
        const {
            page = 1,
            pageSize = 10,
            searchTerm,
            startDate,
            endDate,
            status,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        // Construir a query do MongoDB
        const query = {};

        // Filtro de empresa para não-admin
        if (req.user.role !== 'admin') {
            query.company = req.user.company;
        }

        // Adicionar filtros de data se fornecidos
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        // Adicionar filtro de status se fornecido
        if (status) {
            query.status = status;
        }

        // Melhorar a lógica de busca com searchTerm
        if (searchTerm) {
            // Primeiro, buscar clientes que correspondam ao termo de pesquisa
            const customers = await Customer.find({
                name: { $regex: searchTerm, $options: 'i' }
            }).select('_id');
            
            const customerIds = customers.map(c => c._id);

            // Construir condições de busca
            query.$or = [
                { invoiceNumber: { $regex: searchTerm, $options: 'i' } },
                { status: { $regex: searchTerm, $options: 'i' } },
                { customer: { $in: customerIds } },
                { paymentMethod: { $regex: searchTerm, $options: 'i' } },
                { observations: { $regex: searchTerm, $options: 'i' } }
            ];

            // Se o termo de busca for um número, incluir busca por valores numéricos
            const numericSearch = parseFloat(searchTerm);
            if (!isNaN(numericSearch)) {
                query.$or.push(
                    { amount: numericSearch }
                );
            }
        }

        // Validar campos de ordenação
        const validSortFields = ['createdAt', 'dueDate', 'amount', 'status', 'invoiceNumber', 'paymentDate'];
        const sanitizedSortBy = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
        const sanitizedSortOrder = ['asc', 'desc'].includes(sortOrder.toLowerCase()) ? sortOrder : 'desc';

        // Executar queries em paralelo
        const [invoices, total] = await Promise.all([
            Invoice.find(query)
                .populate('customer', 'name code phone email') 
                .populate('company', 'name')
                .populate('createdBy', 'name email')
                .populate('updatedBy', 'name email')
                .populate('customerInfraction')
                .populate('reading', 'consumption currentReading previousReading date code')
                .populate('connection', 'meterNumber category code')
                .sort({ [sanitizedSortBy]: sanitizedSortOrder === 'desc' ? -1 : 1 })
                .skip((parseInt(page) - 1) * parseInt(pageSize))
                .limit(parseInt(pageSize))
                .lean(),
            Invoice.countDocuments(query)
        ]);

        return res.status(200).json({
            success: true,
            data: invoices,
            pagination: {
                currentPage: parseInt(page),
                pageSize: parseInt(pageSize),
                totalPages: Math.ceil(total / parseInt(pageSize)),
                totalCount: total
            },
            filters: {
                searchTerm,
                startDate,
                endDate,
                status,
                sortBy: sanitizedSortBy,
                sortOrder: sanitizedSortOrder
            }
        });

    } catch (error) {
        console.error('Error in getAllInvoices:', error);
        return next(new ErrorResponse('Erro ao buscar faturas', 500));
    }
});

// @desc    Buscar fatura por ID
// @route   GET /api/invoices/:id
exports.getInvoiceById = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    const query = { _id: id };
    if (req.user.role !== 'admin') {
        query.company = req.user.company;
    }

    const invoice = await Invoice.findOne(query)
        .populate('customer', 'name email phone')
        .populate({
            path: 'customerInfraction',
            populate: {
                path: 'infractionType',
                select: 'reason defaultValue'
            }
        })
        .populate('company', 'name')
        .populate('createdBy', 'name email');

    if (!invoice) {
        return next(new ErrorResponse('Fatura não encontrada', 404));
    }

    res.status(200).json({
        success: true,
        data: invoice
    });
});

// @desc    Atualizar status da fatura
// @route   PATCH /api/invoices/:id/status
exports.updateInvoiceStatus = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { status, paymentMethod, paymentReference } = req.body;

    // Validar status
    const validStatus = ['Pendente', 'Pago', 'Vencido', 'Cancelado'];
    if (!validStatus.includes(status)) {
        return next(new ErrorResponse(`Status inválido. Status permitidos: ${validStatus.join(', ')}`, 400));
    }

    const invoice = await Invoice.findOne({ 
        _id: id,
        ...(req.user.role !== 'admin' && { company: req.user.company })
    });

    if (!invoice) {
        return next(new ErrorResponse('Fatura não encontrada', 404));
    }

    // Validar método de pagamento se status for 'Pago'
    if (status === 'Pago') {
        if (!paymentMethod) {
            return next(new ErrorResponse('Método de pagamento é obrigatório para faturas pagas', 400));
        }
        invoice.paymentDate = new Date();
        invoice.paymentMethod = paymentMethod;
        invoice.paymentReference = paymentReference;
    }

    invoice.status = status;
    invoice.updatedBy = req.user.id;

    await invoice.save();

    logger.logBusiness('invoice_status_updated', {
        invoiceId: id,
        previousStatus: invoice.status,
        newStatus: status,
        paymentMethod,
        paymentReference,
        updatedBy: req.user.id
    });

    res.status(200).json({
        success: true,
        data: invoice,
        message: 'Status da fatura atualizado com sucesso'
    });
});

// @desc    Listar faturas por cliente
// @route   GET /api/invoices/customer/:customerId
exports.getInvoicesByCustomer = asyncHandler(async (req, res, next) => {
    const { customerId } = req.params;
    const {
        pageSize = 10,
        pageNumber = 1,
        status,
        sortBy = 'createdAt',
        sortOrder = 'desc'
    } = req.query;

    const query = { 
        customer: customerId,
        ...(req.user.role !== 'admin' && { company: req.user.company })
    };

    if (status) {
        query.status = status;
    }

    const invoices = await Invoice.find(query)
        .populate('customerInfraction')
        .populate('company', 'name')
        .populate('createdBy', 'name email')
        .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
        .skip((pageNumber - 1) * pageSize)
        .limit(parseInt(pageSize));

    const total = await Invoice.countDocuments(query);

    res.status(200).json({
        success: true,
        data: invoices,
        pagination: {
            total,
            pageSize: parseInt(pageSize),
            currentPage: parseInt(pageNumber),
            totalPages: Math.ceil(total / pageSize)
        }
    });
});

// @desc    Listar faturas por empresa
// @route   GET /api/invoices/company/:companyId
exports.getInvoicesByCompany = asyncHandler(async (req, res, next) => {
    const { companyId } = req.params;
    const {
        pageSize = 10,
        pageNumber = 1,
        status,
        sortBy = 'createdAt',
        sortOrder = 'desc'
    } = req.query;

    // Verificar se o usuário tem acesso à empresa
    if (req.user.role !== 'admin' && req.user.company.toString() !== companyId) {
        return next(new ErrorResponse('Não autorizado a acessar faturas de outra empresa', 403));
    }

    const query = { company: companyId };
    if (status) {
        query.status = status;
    }

    const invoices = await Invoice.find(query)
        .populate('customer', 'name email phone')
        // .populate('customerInfraction')
        .populate('createdBy', 'name email')
        .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
        .skip((pageNumber - 1) * pageSize)
        .limit(parseInt(pageSize));

    const total = await Invoice.countDocuments(query);

    res.status(200).json({
        success: true,
        data: invoices,
        pagination: {
            total,
            pageSize: parseInt(pageSize),
            currentPage: parseInt(pageNumber),
            totalPages: Math.ceil(total / pageSize)
        }
    });
});