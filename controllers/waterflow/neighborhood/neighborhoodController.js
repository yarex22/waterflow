const Neighborhood = require('../../../models/waterflow/neighborhood/NeighborhoodModel');
const District = require('../../../models/waterflow/district/DistrictModel');
const ErrorResponse = require('../../../utils/ErrorResponse');
const asyncHandler = require('../../../middleware/asyncHandler');
const logger = require('../../../utils/logger');
const mongoose = require('mongoose');

// @desc    Criar novo bairro
// @route   POST /api/neighborhood/add
// @access  Private/Admin
exports.createNeighborhood = asyncHandler(async (req, res, next) => {
    try {
        const { name, district, population, area } = req.body;

        // Validar campos obrigatórios
        if (!name || !district) {
            return next(new ErrorResponse('Nome e distrito são obrigatórios', 400));
        }

        // Validar se o ID do distrito é válido
        if (!mongoose.Types.ObjectId.isValid(district)) {
            return next(new ErrorResponse('ID do distrito inválido', 400));
        }

        // Verificar se o distrito existe
        const districtExists = await District.findById(district);
        if (!districtExists) {
            return next(new ErrorResponse('Distrito não encontrado', 404));
        }

        // Verificar se já existe um bairro com o mesmo nome no distrito
        const existingNeighborhood = await Neighborhood.findOne({ 
            name: name.trim(),
            district
        });
        if (existingNeighborhood) {
            return next(new ErrorResponse('Já existe um bairro com este nome neste distrito', 409));
        }

        // Validar população e área se fornecidos
        if (population && population < 0) {
            return next(new ErrorResponse('População não pode ser negativa', 400));
        }

        if (area && area < 0) {
            return next(new ErrorResponse('Área não pode ser negativa', 400));
        }

        // Criar bairro
        const neighborhood = await Neighborhood.create({
            name: name.trim(),
            district,
            population: population || 0,
            area: area || 0
        });

        // Populate dos dados do distrito para retorno
        await neighborhood.populate('district', 'name');

        logger.logBusiness('neighborhood_created', {
            neighborhoodId: neighborhood._id,
            name: neighborhood.name,
            district: neighborhood.district.name
        });

        res.status(201).json({
            success: true,
            data: neighborhood,
            message: 'Bairro criado com sucesso'
        });

    } catch (error) {
        logger.logError(error, req);
        next(new ErrorResponse('Erro ao criar bairro', 500));
    }
});

// @desc    Buscar todos os bairros
// @route   GET /api/neighborhood/all
// @access  Private
exports.getAllNeighborhoods = asyncHandler(async (req, res, next) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            sort = 'name', 
            district,
            search 
        } = req.query;

        const query = {};

        // Filtrar por distrito se fornecido
        if (district) {
            if (!mongoose.Types.ObjectId.isValid(district)) {
                return next(new ErrorResponse('ID do distrito inválido', 400));
            }
            query.district = district;
        }

        // Busca por nome se fornecido
        if (search) {
            query.name = { $regex: search, $options: 'i' };
        }

        // Contar total de registros
        const total = await Neighborhood.countDocuments(query);

        // Buscar bairros com paginação
        const neighborhoods = await Neighborhood.find(query)
            .populate({
                path: 'district',
                select: 'name province',
                populate: {
                    path: 'province',
                    select: 'name'
                }
            })
            .sort(sort)
            .skip((page - 1) * limit)
            .limit(limit);

        res.status(200).json({
            success: true,
            data: neighborhoods,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total
            }
        });

    } catch (error) {
        logger.logError(error, req);
        next(new ErrorResponse('Erro ao buscar bairros', 500));
    }
});

// @desc    Buscar bairro por ID
// @route   GET /api/neighborhood/:id
// @access  Private
exports.getNeighborhoodById = asyncHandler(async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(new ErrorResponse('ID do bairro inválido', 400));
        }

        const neighborhood = await Neighborhood.findById(id)
            .populate({
                path: 'district',
                select: 'name province',
                populate: {
                    path: 'province',
                    select: 'name'
                }
            });

        if (!neighborhood) {
            return next(new ErrorResponse('Bairro não encontrado', 404));
        }

        res.status(200).json({
            success: true,
            data: neighborhood
        });

    } catch (error) {
        logger.logError(error, req);
        next(new ErrorResponse('Erro ao buscar bairro', 500));
    }
});

// @desc    Atualizar bairro
// @route   PUT /api/neighborhood/:id
// @access  Private/Admin
exports.updateNeighborhood = asyncHandler(async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, district, population, area } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(new ErrorResponse('ID do bairro inválido', 400));
        }

        // Verificar se o bairro existe
        const neighborhood = await Neighborhood.findById(id);
        if (!neighborhood) {
            return next(new ErrorResponse('Bairro não encontrado', 404));
        }

        // Se estiver alterando o distrito
        if (district) {
            if (!mongoose.Types.ObjectId.isValid(district)) {
                return next(new ErrorResponse('ID do distrito inválido', 400));
            }

            const districtExists = await District.findById(district);
            if (!districtExists) {
                return next(new ErrorResponse('Distrito não encontrado', 404));
            }
        }

        // Se estiver alterando o nome, verificar duplicidade no mesmo distrito
        if (name && name !== neighborhood.name) {
            const existingNeighborhood = await Neighborhood.findOne({ 
                name: name.trim(),
                district: district || neighborhood.district,
                _id: { $ne: id }
            });
            if (existingNeighborhood) {
                return next(new ErrorResponse('Já existe um bairro com este nome neste distrito', 409));
            }
        }

        // Validar população e área se fornecidos
        if (population && population < 0) {
            return next(new ErrorResponse('População não pode ser negativa', 400));
        }

        if (area && area < 0) {
            return next(new ErrorResponse('Área não pode ser negativa', 400));
        }

        // Atualizar bairro
        const updatedNeighborhood = await Neighborhood.findByIdAndUpdate(
            id,
            { 
                name: name?.trim(),
                district,
                population,
                area,
                updatedAt: new Date()
            },
            { new: true, runValidators: true }
        ).populate({
            path: 'district',
            select: 'name province',
            populate: {
                path: 'province',
                select: 'name'
            }
        });

        logger.logBusiness('neighborhood_updated', {
            neighborhoodId: updatedNeighborhood._id,
            name: updatedNeighborhood.name,
            changes: req.body
        });

        res.status(200).json({
            success: true,
            data: updatedNeighborhood,
            message: 'Bairro atualizado com sucesso'
        });

    } catch (error) {
        logger.logError(error, req);
        next(new ErrorResponse('Erro ao atualizar bairro', 500));
    }
});

// @desc    Excluir bairro
// @route   DELETE /api/neighborhood/:id
// @access  Private/Admin
exports.deleteNeighborhood = asyncHandler(async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(new ErrorResponse('ID do bairro inválido', 400));
        }

        const neighborhood = await Neighborhood.findById(id);

        if (!neighborhood) {
            return next(new ErrorResponse('Bairro não encontrado', 404));
        }

        // Verificar se existem clientes vinculados ao bairro
        const hasCustomers = await mongoose.model('Customer').exists({ neighborhood: id });
        if (hasCustomers) {
            return next(new ErrorResponse('Não é possível excluir o bairro pois existem clientes vinculados', 400));
        }

        await neighborhood.remove();

        logger.logBusiness('neighborhood_deleted', {
            neighborhoodId: id,
            name: neighborhood.name
        });

        res.status(200).json({
            success: true,
            message: 'Bairro excluído com sucesso'
        });

    } catch (error) {
        logger.logError(error, req);
        next(new ErrorResponse('Erro ao excluir bairro', 500));
    }
});

// @desc    Listar bairros por distrito
// @route   GET /api/neighborhood/district/:districtId
// @access  Private
exports.getNeighborhoodsByDistrict = asyncHandler(async (req, res, next) => {
    try {
        const { districtId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(districtId)) {
            return next(new ErrorResponse('ID do distrito inválido', 400));
        }

        const neighborhoods = await Neighborhood.find({ district: districtId })
            .populate({
                path: 'district',
                select: 'name province',
                populate: {
                    path: 'province',
                    select: 'name'
                }
            })
            .sort('name');

        res.status(200).json({
            success: true,
            count: neighborhoods.length,
            data: neighborhoods
        });

    } catch (error) {
        logger.logError(error, req);
        next(new ErrorResponse('Erro ao buscar bairros do distrito', 500));
    }
}); 