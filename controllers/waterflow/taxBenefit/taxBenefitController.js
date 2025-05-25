// controllers/waterflow/taxBenefitController.js
const TaxBenefit = require('../../../models/waterflow/taxBenefit/TaxBenefitModel');
const ErrorResponse = require('../../../utils/CustomErrorResponse');
const asyncHandler = require('../../../middleware/asyncHandler');
const logger = require('../../../utils/logger');

// Criar um novo imposto ou benefício
exports.createTaxBenefit = asyncHandler(async (req, res, next) => {
    try {
        const taxBenefitData = req.body;

        const taxBenefit = await TaxBenefit.create(taxBenefitData);

        logger.logBusiness('tax_benefit_created', {
            taxBenefitId: taxBenefit._id
        });

        res.status(201).json({
            success: true,
            data: taxBenefit,
            message: 'Imposto ou benefício criado com sucesso'
        });
    } catch (error) {
        logger.logError(error, req);
        next(new ErrorResponse('Erro ao criar imposto ou benefício', 500));
    }
});

// Obter todos os impostos e benefícios
exports.getAllTaxBenefits = asyncHandler(async (req, res, next) => {
    try {
        const taxBenefits = await TaxBenefit.find();

        res.status(200).json({
            success: true,
            data: taxBenefits
        });
    } catch (error) {
        logger.logError(error, req);
        next(new ErrorResponse('Erro ao buscar todos os impostos e benefícios', 500));
    }
});

// Obter um imposto ou benefício por ID
exports.getTaxBenefitById = asyncHandler(async (req, res, next) => {
    try {
        const { id } = req.params;

        const taxBenefit = await TaxBenefit.findById(id);
        if (!taxBenefit) {
            return next(new ErrorResponse('Imposto ou benefício não encontrado', 404));
        }

        res.status(200).json({
            success: true,
            data: taxBenefit
        });
    } catch (error) {
        logger.logError(error, req);
        next(new ErrorResponse('Erro ao buscar imposto ou benefício', 500));
    }
});

// Atualizar um imposto ou benefício
exports.updateTaxBenefit = asyncHandler(async (req, res, next) => {
    try {
        const { id } = req.params;
        const taxBenefitData = req.body;

        const taxBenefit = await TaxBenefit.findByIdAndUpdate(id, taxBenefitData, { new: true, runValidators: true });
        if (!taxBenefit) {
            return next(new ErrorResponse('Imposto ou benefício não encontrado', 404));
        }

        logger.logBusiness('tax_benefit_updated', {
            taxBenefitId: taxBenefit._id,
            updatedFields: taxBenefitData
        });

        res.status(200).json({
            success: true,
            data: taxBenefit,
            message: 'Imposto ou benefício atualizado com sucesso'
        });
    } catch (error) {
        logger.logError(error, req);
        next(new ErrorResponse('Erro ao atualizar imposto ou benefício', 500));
    }
});

// Deletar um imposto ou benefício
exports.deleteTaxBenefit = asyncHandler(async (req, res, next) => {
    try {
        const { id } = req.params;

        const taxBenefit = await TaxBenefit.findById(id);
        if (!taxBenefit) {
            return next(new ErrorResponse('Imposto ou benefício não encontrado', 404));
        }

        await taxBenefit.remove();

        logger.logBusiness('tax_benefit_deleted', {
            taxBenefitId: taxBenefit._id
        });

        res.status(200).json({
            success: true,
            message: 'Imposto ou benefício deletado com sucesso'
        });
    } catch (error) {
        logger.logError(error, req);
        next(new ErrorResponse('Erro ao deletar imposto ou benefício', 500));
    }
});