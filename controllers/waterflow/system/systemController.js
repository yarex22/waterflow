const System = require('../../../models/waterflow/system/SystemModel');
const ErrorResponse = require('../../../utils/ErrorResponse');
const asyncHandler = require('../../../middleware/asyncHandler');
const logger = require('../../../utils/logger');
const mongoose = require('mongoose');

// Get all systems
exports.getAllSystems = asyncHandler(async (req, res, next) => {
    try {
        const { 
            pageSize = 10, 
            pageNumber = 1,
            searchTerm,
            sortBy = 'districtId',
            sortOrder = 'asc'
        } = req.query;

        // Construir query
        const query = {};

        // Adicionar critérios de busca se houver searchTerm
        if (searchTerm) {
            query.$or = [
                { 'districtId': { $regex: searchTerm, $options: 'i' } }
            ];
        }

        // Configurar ordenação
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

        // Contar total de documentos
        const totalCount = await System.countDocuments(query);

        // Buscar sistemas com paginação
        const systems = await System.find(query)
            .populate('districtId')
            .select('-__v')
            .sort(sortOptions)
            .skip((pageNumber - 1) * pageSize)
            .limit(parseInt(pageSize));

        logger.logBusiness('systems_listed', {
            page: pageNumber,
            pageSize,
            totalCount,
            searchTerm: searchTerm || 'none'
        });

        res.status(200).json({
            success: true,
            data: systems,
            pagination: {
                total: totalCount,
                pageSize: parseInt(pageSize),
                currentPage: parseInt(pageNumber),
                totalPages: Math.ceil(totalCount / pageSize)
            }
        });
    } catch (error) {
        logger.logError(error, req);
        next(new ErrorResponse('Erro ao listar sistemas', 500));
    }
});

// Get single system
exports.getSystem = asyncHandler(async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(new ErrorResponse('ID de sistema inválido', 400));
        }

        const system = await System.findById(id)
            .populate('districtId')
            .select('-__v');

        if (!system) {
            return next(new ErrorResponse('Sistema não encontrado', 404));
        }

        logger.logBusiness('system_viewed', {
            systemId: system._id,
            districtId: system.districtId
        });

        res.status(200).json({
            success: true,
            data: system
        });
    } catch (error) {
        logger.logError(error, req);
        next(new ErrorResponse('Erro ao buscar sistema', 500));
    }
});

// Get system by district
exports.getSystemByDistrict = asyncHandler(async (req, res, next) => {
    try {
        const { districtId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(districtId)) {
            return next(new ErrorResponse('ID de distrito inválido', 400));
        }

        const system = await System.findOne({ districtId })
            .populate('districtId')
            .select('-__v');

        if (!system) {
            return next(new ErrorResponse('Sistema não encontrado para este distrito', 404));
        }

        logger.logBusiness('system_viewed_by_district', {
            systemId: system._id,
            districtId: system.districtId
        });

        res.status(200).json({
            success: true,
            data: system
        });
    } catch (error) {
        logger.logError(error, req);
        next(new ErrorResponse('Erro ao buscar sistema pelo distrito', 500));
    }
});

// Create new system
exports.createSystem = asyncHandler(async (req, res, next) => {
    try {
        const { districtId, fontanarios, taxaDisponibilidade, domestico, municipio, comercioPublico, industria } = req.body;

        // Validar campos obrigatórios
        const requiredFields = [districtId, fontanarios, taxaDisponibilidade, domestico, municipio, comercioPublico, industria];
        if (requiredFields.some(field => !field)) {
            return next(new ErrorResponse('Todos os campos são obrigatórios', 400));
        }

        // Verificar se já existe sistema para este distrito
        const existingSystem = await System.findOne({ districtId });
        if (existingSystem) {
            return next(new ErrorResponse('Já existe um sistema cadastrado para este distrito', 400));
        }

        const system = await System.create(req.body);

        logger.logBusiness('system_created', {
            systemId: system._id,
            districtId: system.districtId
        });

        res.status(201).json({
            success: true,
            data: system
        });
    } catch (error) {
        logger.logError(error, req);
        next(new ErrorResponse('Erro ao criar sistema', 500));
    }
});

// Update system
exports.updateSystem = asyncHandler(async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(new ErrorResponse('ID de sistema inválido', 400));
        }

        const system = await System.findById(id);
        if (!system) {
            return next(new ErrorResponse('Sistema não encontrado', 404));
        }

        // Se estiver tentando mudar o distrito, verificar se já existe sistema para o novo distrito
        if (req.body.districtId && req.body.districtId !== system.districtId.toString()) {
            const existingSystem = await System.findOne({ districtId: req.body.districtId });
            if (existingSystem) {
                return next(new ErrorResponse('Já existe um sistema cadastrado para este distrito', 400));
            }
        }

        const updatedSystem = await System.findByIdAndUpdate(
            id,
            req.body,
            {
                new: true,
                runValidators: true
            }
        ).populate('districtId');

        logger.logBusiness('system_updated', {
            systemId: updatedSystem._id,
            districtId: updatedSystem.districtId
        });

        res.status(200).json({
            success: true,
            data: updatedSystem
        });
    } catch (error) {
        logger.logError(error, req);
        next(new ErrorResponse('Erro ao atualizar sistema', 500));
    }
});

// Delete system
exports.deleteSystem = asyncHandler(async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(new ErrorResponse('ID de sistema inválido', 400));
        }

        const system = await System.findById(id);
        if (!system) {
            return next(new ErrorResponse('Sistema não encontrado', 404));
        }

        await system.deleteOne();

        logger.logBusiness('system_deleted', {
            systemId: id
        });

        res.status(200).json({
            success: true,
            message: 'Sistema excluído com sucesso'
        });
    } catch (error) {
        logger.logError(error, req);
        next(new ErrorResponse('Erro ao excluir sistema', 500));
    }
}); 