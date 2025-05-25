const Expense = require('../../../models/waterflow/expenses/ExpenseModel'); // Substitua pelo seu modelo de despesa
const ErrorResponse = require('../../../utils/ErrorResponse');
const asyncHandler = require('../../../middleware/asyncHandler');
const logger = require('../../../utils/logger');
const mongoose = require('mongoose');

// Categorias válidas
const VALID_CATEGORIES = [
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
    'equipamentos',
    'outros'
];

// Validações
const validateAmount = (amount) => {
    const numAmount = Number(amount);
    return !isNaN(numAmount) && numAmount >= 0;
};

const validateCategory = (category) => {
    return VALID_CATEGORIES.includes(category?.toLowerCase());
};

const validateKw = (kw) => {
    const numKw = Number(kw);
    return !isNaN(numKw) && numKw >= 0;
};

// Criar despesa
exports.createExpense = asyncHandler(async (req, res, next) => {
    try {
        const { name, description, date, category, kw } = req.body;
        const amount = Number(req.body.amount);
        const attachment = req.file;
        const createdBy = req.user.id;
        const company = req.user.company;

        // Validação dos campos obrigatórios
        if (!name || !description || !amount || !date || !category) {
            return res.status(400).json({
                message: "Required fields are missing.",
                requiredFields: ['name', 'description', 'amount', 'date', 'category']
            });
        }

        // Validação do valor
        if (!validateAmount(amount)) {
            return next(new ErrorResponse('Valor da despesa inválido. O valor deve ser um número maior ou igual a zero.', 400));
        }

        // Validação da categoria
        if (!validateCategory(category)) {
            return next(new ErrorResponse(`Categoria inválida. Categorias válidas são: ${VALID_CATEGORIES.join(', ')}`, 400));
        }

        // Validação específica para categoria 'energia'
        if (category.toLowerCase() === 'energia') {
            if (!kw) {
                return next(new ErrorResponse('O campo KW (kilowatt) é obrigatório para despesas de energia.', 400));
            }
            if (!validateKw(kw)) {
                return next(new ErrorResponse('Valor de KW inválido. O valor deve ser um número maior ou igual a zero.', 400));
            }
        }

        // Preparar objeto da despesa
        const expenseData = {
            name,
            description,
            amount,
            date,
            category: category.toLowerCase(),
            company,
            createdBy
        };

        // Adicionar KW apenas se for categoria energia
        if (category.toLowerCase() === 'energia') {
            expenseData.kw = Number(kw);
        }

        // Adicionar informações do attachment se existir
        if (attachment) {
            expenseData.attachment = {
                filename: attachment.filename,
                originalname: attachment.originalname,
                mimetype: attachment.mimetype,
                path: attachment.path,
                size: attachment.size
            };
        }

        // Criar despesa
        const expense = await Expense.create(expenseData);

        logger.logBusiness('expense_created', {
            expenseId: expense._id,
            category: expense.category,
            hasKw: !!expense.kw,
            hasAttachment: !!attachment
        });

        res.status(201).json({
            success: true,
            data: expense,
            message: 'Despesa criada com sucesso'
        });
    } catch (error) {
        console.error(error);
        logger.logError(error, req);
        next(new ErrorResponse('Erro ao criar despesa', 500));
    }
});

// Adicionar novo endpoint para listar categorias disponíveis
exports.getCategories = asyncHandler(async (req, res) => {
    res.status(200).json({
        success: true,
        data: VALID_CATEGORIES
    });
});

// Buscar despesa por ID
exports.getExpenseById = asyncHandler(async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(new ErrorResponse('ID de despesa inválido', 400));
        }

        const expense = await Expense.findById(id)
            .populate('createdBy', 'name username')
            .populate('company', 'name')
            .lean();;
        if (!expense) {
            return next(new ErrorResponse('Despesa não encontrada', 404));
        }

        res.status(200).json({
            success: true,
            data: expense
        });
    } catch (error) {
        logger.logError(error, req);
        next(new ErrorResponse('Erro ao buscar despesa', 500));
    }
});

// Listar todas as despesas
exports.getAllExpenses = asyncHandler(async (req, res, next) => {
    try {
        const {
            pageSize = 10,
            pageNumber = 1,
            searchTerm,
            sortBy = 'date',
            sortOrder = 'desc',
            category,
            startDate,
            endDate
        } = req.query;

        let query = {};
        if (req.user.role !== 'admin') {
            query.company = req.user.company;
        }

        // Add filters
        if (category) {
            query.category = category;
        }

        // Add date range filter with proper date handling
        if (startDate || endDate) {
            const startDateTime = startDate ? new Date(startDate) : null;
            const endDateTime = endDate ? new Date(endDate) : null;

            if (startDateTime) startDateTime.setUTCHours(0, 0, 0, 0);
            if (endDateTime) endDateTime.setUTCHours(23, 59, 59, 999);

            if (startDateTime || endDateTime) {
                const dateFilter = {};
                if (startDateTime) {
                    dateFilter.$gte = startDateTime;
                }
                if (endDateTime) {
                    dateFilter.$lte = endDateTime;
                }
                query.createdAt = dateFilter;
            }
        }

        // Add search criteria
        if (searchTerm) {
            query.$or = [
                { description: { $regex: searchTerm, $options: 'i' } },
                { category: { $regex: searchTerm, $options: 'i' } }
            ];
        }

        // Validate sort field
        const validSortFields = ['description', 'amount', 'date', 'category', 'createdAt'];
        if (!validSortFields.includes(sortBy)) {
            return next(new ErrorResponse('Invalid sort field', 400));
        }

        // Configure sorting
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

        // Count total documents
        const totalCount = await Expense.countDocuments(query);

        // Fetch expenses with pagination
        const expenses = await Expense.find(query)
            .sort(sortOptions)
            .skip((pageNumber - 1) * pageSize)
            .limit(parseInt(pageSize))
            .populate('createdBy', 'name username')
            .populate('company', 'name')
            .lean();

        res.status(200).json({
            success: true,
            data: expenses,
            pagination: {
                total: totalCount,
                pageSize: parseInt(pageSize),
                currentPage: parseInt(pageNumber),
                totalPages: Math.ceil(totalCount / pageSize)
            }
        });

    } catch (error) {
        console.error('Erro na busca:', error);
        logger.logError(error, req);
        next(new ErrorResponse('Error listing expenses', 500));
    }
});

// Atualizar despesa
exports.updateExpense = asyncHandler(async (req, res, next) => {
    try {
        const { id } = req.params;
        const updateData = { ...req.body }; // Create a copy of req.body
        const attachment = req.file;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(new ErrorResponse('ID de despesa inválido', 400));
        }

        // First, get the current expense to check its category
        const currentExpense = await Expense.findById(id);
        if (!currentExpense) {
            return next(new ErrorResponse('Despesa não encontrada', 404));
        }

        // Validate amount if it's being updated
        if (updateData.amount && !validateAmount(updateData.amount)) {
            return next(new ErrorResponse('Valor da despesa inválido', 400));
        }

        // Validate category if it's being updated
        if (updateData.category && !validateCategory(updateData.category)) {
            return next(new ErrorResponse(`Categoria inválida. Categorias válidas são: ${VALID_CATEGORIES.join(', ')}`, 400));
        }

        // Handle kw field based on category
        const targetCategory = updateData.category?.toLowerCase() || currentExpense.category;
        
        if (targetCategory === 'energia') {
            // If updating to or already energia category, validate kw
            if (updateData.hasOwnProperty('kw')) {
                if (!validateKw(updateData.kw)) {
                    return next(new ErrorResponse('Valor de KW inválido. O valor deve ser um número maior ou igual a zero.', 400));
                }
                updateData.kw = Number(updateData.kw);
            } else if (!currentExpense.kw) {
                return next(new ErrorResponse('O campo KW (kilowatt) é obrigatório para despesas de energia.', 400));
            }
        } else if (targetCategory !== 'energia') {
            // If not energia category, remove kw field
            updateData.kw = undefined;
            // Use $unset to remove the kw field from the document
            await Expense.findByIdAndUpdate(id, { $unset: { kw: 1 } });
        }

        // Convert amount to Number if it exists
        if (updateData.amount) {
            updateData.amount = Number(updateData.amount);
        }

        // Handle attachment update
        if (attachment) {
            // Se há um novo arquivo, atualiza com as novas informações
            updateData.attachment = {
                filename: attachment.filename,
                originalname: attachment.originalname,
                mimetype: attachment.mimetype,
                path: attachment.path,
                size: attachment.size
            };
        } else if (updateData.attachment === null) {
            // Se attachment é explicitamente null, remove o attachment
            updateData.$unset = { attachment: 1 };
        } else {
            // Se não há novo arquivo e não é para remover, mantém o attachment existente
            delete updateData.attachment;
        }

        const updatedExpense = await Expense.findByIdAndUpdate(
            id, 
            updateData,
            { 
                new: true,
                runValidators: true
            }
        );

        // Log da atualização bem-sucedida
        logger.logBusiness('expense_updated', {
            expenseId: updatedExpense._id,
            category: updatedExpense.category,
            hasKw: !!updatedExpense.kw,
            hasAttachment: !!updatedExpense.attachment
        });

        res.status(200).json({
            success: true,
            data: updatedExpense,
            message: 'Despesa atualizada com sucesso'
        });
    } catch (error) {
        logger.logError(error, req);
        next(new ErrorResponse('Erro ao atualizar despesa', 500));
    }
});

// Deletar despesa
exports.deleteExpense = asyncHandler(async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(new ErrorResponse('ID de despesa inválido', 400));
        }

        const deletedExpense = await Expense.findByIdAndDelete(id);
        if (!deletedExpense) {
            return next(new ErrorResponse('Despesa não encontrada', 404));
        }

        res.status(200).json({
            success: true,
            message: 'Despesa removida com sucesso'
        });
    } catch (error) {
        logger.logError(error, req);
        next(new ErrorResponse('Erro ao remover despesa', 500));
    }
});