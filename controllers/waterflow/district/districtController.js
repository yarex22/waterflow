const District = require('../../../models/waterflow/district/DistrictModel');
const Province = require('../../../models/waterflow/province/ProvinceModel');
const ErrorResponse = require('../../../utils/ErrorResponse');
const asyncHandler = require('../../../middleware/asyncHandler');
const logger = require('../../../utils/logger');
const mongoose = require('mongoose');

// @desc    Criar novo distrito
// @route   POST /api/district/add
// @access  Private/Admin
exports.createDistrict = asyncHandler(async (req, res, next) => {
    try {
        const { name, province, population, area } = req.body;

        // Validar campos obrigatórios
        if (!name || !province) {
            return next(new ErrorResponse('Nome e província são obrigatórios', 400));
        }

        // Validar se o ID da província é válido
        if (!mongoose.Types.ObjectId.isValid(province)) {
            return next(new ErrorResponse('ID da província inválido', 400));
        }

        // Verificar se a província existe
        const provinceExists = await Province.findById(province);
        if (!provinceExists) {
            return next(new ErrorResponse('Província não encontrada', 404));
        }

        // Verificar se já existe um distrito com o mesmo nome
        const existingDistrict = await District.findOne({ name: name.trim() });
        if (existingDistrict) {
            return next(new ErrorResponse('Já existe um distrito com este nome', 409));
        }

        // Validar população e área se fornecidos
        if (population && population < 0) {
            return next(new ErrorResponse('População não pode ser negativa', 400));
        }

        if (area && area < 0) {
            return next(new ErrorResponse('Área não pode ser negativa', 400));
        }

        // Criar distrito
        const district = await District.create({
            name: name.trim(),
            province,
            population: population || 0,
            area: area || 0
        });

        // Populate dos dados da província para retorno
        await district.populate('province', 'name');

        logger.logBusiness('district_created', {
            districtId: district._id,
            name: district.name,
            province: district.province.name
        });

        res.status(201).json({
            success: true,
            data: district,
            message: 'Distrito criado com sucesso'
        });

    } catch (error) {
        logger.logError(error, req);
        next(new ErrorResponse('Erro ao criar distrito', 500));
    }
});

// @desc    Buscar todos os distritos
// @route   GET /api/district/all
// @access  Private
exports.getAllDistricts = asyncHandler(async (req, res, next) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            sort = 'name', 
            province,
            search 
        } = req.query;

        const query = {};

        // Filtrar por província se fornecido
        if (province) {
            if (!mongoose.Types.ObjectId.isValid(province)) {
                return next(new ErrorResponse('ID da província inválido', 400));
            }
            query.province = province;
        }

        // Busca por nome se fornecido
        if (search) {
            query.name = { $regex: search, $options: 'i' };
        }

        // Contar total de registros
        const total = await District.countDocuments(query);

        // Buscar distritos com paginação e sistemas relacionados
        const districts = await District.find(query)
            .populate('province', 'name')
            .sort(sort)
            .skip((page - 1) * limit)
            .limit(limit);

        // Buscar sistemas relacionados para cada distrito
        const districtsWithSystems = await Promise.all(districts.map(async (district) => {
            const system = await mongoose.model('System').findOne({ districtId: district._id });
            return {
                ...district.toObject(),
                system: system || null
            };
        }));

        res.status(200).json({
            success: true,
            data: districtsWithSystems,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total
            }
        });

    } catch (error) {
        logger.logError(error, req);
        next(new ErrorResponse('Erro ao buscar distritos', 500));
    }
});

// @desc    Buscar distrito por ID
// @route   GET /api/district/:id
// @access  Private
exports.getDistrictById = asyncHandler(async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(new ErrorResponse('ID do distrito inválido', 400));
        }

        const district = await District.findById(id).populate('province', 'name');

        if (!district) {
            return next(new ErrorResponse('Distrito não encontrado', 404));
        }

        // Buscar o sistema relacionado ao distrito
        const system = await mongoose.model('System').findOne({ districtId: district._id });

        // Combinar os dados do distrito com o sistema
        const districtWithSystem = {
            ...district.toObject(),
            system: system || null
        };

        res.status(200).json({
            success: true,
            data: districtWithSystem
        });

    } catch (error) {
        logger.logError(error, req);
        next(new ErrorResponse('Erro ao buscar distrito', 500));
    }
});

// @desc    Atualizar distrito
// @route   PUT /api/district/:id
// @access  Private/Admin
exports.updateDistrict = asyncHandler(async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, province, population, area } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(new ErrorResponse('ID do distrito inválido', 400));
        }

        // Verificar se o distrito existe
        const district = await District.findById(id);
        if (!district) {
            return next(new ErrorResponse('Distrito não encontrado', 404));
        }

        // Se estiver alterando a província
        if (province) {
            if (!mongoose.Types.ObjectId.isValid(province)) {
                return next(new ErrorResponse('ID da província inválido', 400));
            }

            const provinceExists = await Province.findById(province);
            if (!provinceExists) {
                return next(new ErrorResponse('Província não encontrada', 404));
            }
        }

        // Se estiver alterando o nome, verificar duplicidade
        if (name && name !== district.name) {
            const existingDistrict = await District.findOne({ 
                name: name.trim(),
                _id: { $ne: id }
            });
            if (existingDistrict) {
                return next(new ErrorResponse('Já existe um distrito com este nome', 409));
            }
        }

        // Validar população e área se fornecidos
        if (population && population < 0) {
            return next(new ErrorResponse('População não pode ser negativa', 400));
        }

        if (area && area < 0) {
            return next(new ErrorResponse('Área não pode ser negativa', 400));
        }

        // Atualizar distrito
        const updatedDistrict = await District.findByIdAndUpdate(
            id,
            { 
                name: name?.trim(),
                province,
                population,
                area,
                updatedAt: new Date()
            },
            { new: true, runValidators: true }
        ).populate('province', 'name');

        logger.logBusiness('district_updated', {
            districtId: updatedDistrict._id,
            name: updatedDistrict.name,
            changes: req.body
        });

        res.status(200).json({
            success: true,
            data: updatedDistrict,
            message: 'Distrito atualizado com sucesso'
        });

    } catch (error) {
        logger.logError(error, req);
        next(new ErrorResponse('Erro ao atualizar distrito', 500));
    }
});

// @desc    Excluir distrito
// @route   DELETE /api/district/:id
// @access  Private/Admin
exports.deleteDistrict = asyncHandler(async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(new ErrorResponse('ID do distrito inválido', 400));
        }

        const district = await District.findById(id);

        if (!district) {
            return next(new ErrorResponse('Distrito não encontrado', 404));
        }

        // Verificar se existem dependências (bairros, clientes, etc.)
        // Você pode adicionar mais verificações conforme necessário
        const hasNeighborhoods = await mongoose.model('Neighborhood').exists({ district: id });
        if (hasNeighborhoods) {
            return next(new ErrorResponse('Não é possível excluir o distrito pois existem bairros vinculados', 400));
        }

        const hasCustomers = await mongoose.model('Customer').exists({ district: id });
        if (hasCustomers) {
            return next(new ErrorResponse('Não é possível excluir o distrito pois existem clientes vinculados', 400));
        }

        await district.remove();

        logger.logBusiness('district_deleted', {
            districtId: id,
            name: district.name
        });

        res.status(200).json({
            success: true,
            message: 'Distrito excluído com sucesso'
        });

    } catch (error) {
        logger.logError(error, req);
        next(new ErrorResponse('Erro ao excluir distrito', 500));
    }
});

// @desc    Listar distritos por província
// @route   GET /api/district/province/:provinceId
// @access  Private
exports.getDistrictsByProvince = asyncHandler(async (req, res, next) => {
    try {
        const { provinceId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(provinceId)) {
            return next(new ErrorResponse('ID da província inválido', 400));
        }

        const districts = await District.find({ province: provinceId })
            .populate('province', 'name')
            .sort('name');

        // Buscar bairros e sistemas para cada distrito
        const districtsWithDetails = await Promise.all(districts.map(async (district) => {
            const [neighborhoods, system] = await Promise.all([
                mongoose.model('Neighborhood').find({ district: district._id })
                    .select('name population area'),
                mongoose.model('System').findOne({ districtId: district._id })
            ]);

            return {
                ...district.toObject(),
                neighborhoods: neighborhoods || [],
                system: system || null
            };
        }));

        res.status(200).json({
            success: true,
            count: districtsWithDetails.length,
            data: districtsWithDetails
        });

    } catch (error) {
        logger.logError(error, req);
        next(new ErrorResponse('Erro ao buscar distritos da província', 500));
    }
}); 