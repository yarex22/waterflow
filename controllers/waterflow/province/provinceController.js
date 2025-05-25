const Province = require('../../../models/waterflow/province/ProvinceModel');
const Company = require('../../../models/waterflow/company/CompanyModel');
const ErrorResponse = require('../../../utils/errorResponse');
const asyncHandler = require('../../../middleware/asyncHandler');
const logger = require('../../../utils/logger');
const mongoose = require('mongoose');

// Criar província
exports.createProvince = asyncHandler(async (req, res, next) => {
  try {
    const { name,  population, capital, area } = req.body;

    // Validação dos campos obrigatórios
    // if (!name || !code) {
    //   return next(new ErrorResponse('Nome e código da província são obrigatórios', 400));
    // }

    // Validar formato do código (assumindo que deve ser 2-3 caracteres maiúsculos)
    // if (!/^[A-Z]{2,3}$/.test(code)) {
    //   return next(new ErrorResponse('Código da província deve ter 2-3 letras maiúsculas', 400));
    // }

    // Verificar duplicidade
    const existingProvince = await Province.findOne({
      $or: [
        { name: name.trim() },
        // { code: code.toUpperCase() }
      ]
    });

    if (existingProvince) {
      return next(new ErrorResponse(
        'Já existe uma província com este nome',
        409
      ));
    }

    // Criar província
    const province = await Province.create({
      name: name.trim(),
      // code: code.toUpperCase(),
      population,
      capital,
      area
    });

    logger.logBusiness('province_created', {
      provinceId: province._id,
      name: province.name,
      // code: province.code
    });

    res.status(201).json({
      success: true,
      data: province,
      message: 'Província criada com sucesso'
    });

  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse('Erro ao criar província', 500));
  }
});

// Buscar província por ID
exports.getProvinceById = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new ErrorResponse('ID de província inválido', 400));
    }

    const province = await Province.findById(id).select('-__v');

    if (!province) {
      return next(new ErrorResponse('Província não encontrada', 404));
    }

    // Contar empresas associadas
    const companiesCount = await Company.countDocuments({ provinces: id });

    logger.logBusiness('province_viewed', {
      provinceId: province._id,
      name: province.name
    });

    res.status(200).json({
      success: true,
      data: {
        ...province.toObject(),
        companiesCount
      }
    });

  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse('Erro ao buscar província', 500));
  }
});

// Listar todas as províncias
exports.getAllProvinces = asyncHandler(async (req, res, next) => {
  console.log("getAllProvinces");
  try {
    const { 
      pageSize = 10, 
      pageNumber = 1, 
      searchTerm,
      sortBy = 'name',
      sortOrder = 'asc'
    } = req.query;

    // Construir query
    const query = {};

    // Adicionar critérios de busca
    if (searchTerm) {
      query.$or = [
        { name: { $regex: searchTerm, $options: 'i' } },
        // { code: { $regex: searchTerm, $options: 'i' } }
      ];
    }

    // Configurar ordenação
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Contar total de documentos
    const totalCount = await Province.countDocuments(query);

    // Buscar províncias com paginação
    const provinces = await Province.find(query)
      .select('-__v')
      .sort(sortOptions)
      .skip((pageNumber - 1) * pageSize)
      .limit(parseInt(pageSize));

    // Buscar contagem de empresas para cada província
    const provincesWithStats = await Promise.all(
      provinces.map(async (province) => {
        const companiesCount = await Company.countDocuments({ provinces: province._id });
        return {
          ...province.toObject(),
          companiesCount
        };
      })
    );

    logger.logBusiness('provinces_listed', {
      page: pageNumber,
      pageSize,
      totalCount,
      searchTerm: searchTerm || 'none'
    });

    res.status(200).json({
      success: true,
      data: provincesWithStats,
      pagination: {
        total: totalCount,
        pageSize: parseInt(pageSize),
        currentPage: parseInt(pageNumber),
        totalPages: Math.ceil(totalCount / pageSize)
      }
    });

  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse('Erro ao listar províncias', 500));
  }
});

// Atualizar província
exports.updateProvince = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name,  } = req.body;

    // Validar ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new ErrorResponse('ID de província inválido', 400));
    }

    // Verificar se a província existe
    const existingProvince = await Province.findById(id);
    if (!existingProvince) {
      return next(new ErrorResponse('Província não encontrada', 404));
    }

    // Validar campos obrigatórios
    if (!name ) {
      return next(new ErrorResponse('Nome e código da província são obrigatórios', 400));
    }

    // Validar formato do código
    // if (!/^[A-Z]{2,3}$/.test(code)) {
    //   return next(new ErrorResponse('Código da província deve ter 2-3 letras maiúsculas', 400));
    // }

    // Verificar duplicidade (excluindo a província atual)
    const duplicateCheck = await Province.findOne({
      _id: { $ne: id },
      $or: [
        { name: name.trim() },
        // { code: code.toUpperCase() }
      ]
    });

    if (duplicateCheck) {
      return next(new ErrorResponse(
        'Já existe outra província com este nome ou código',
        409
      ));
    }

    // Atualizar província
    const updatedProvince = await Province.findByIdAndUpdate(
      id,
      {
        name: name.trim(),
        // code: code.toUpperCase(),
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    ).select('-__v');

    logger.logBusiness('province_updated', {
      provinceId: updatedProvince._id,
      changes: {
        before: {
          name: existingProvince.name,
          // code: existingProvince.code
        },
        after: {
          name: updatedProvince.name,
          //  code: updatedProvince.code
        }
      }
    });

    res.status(200).json({
      success: true,
      data: updatedProvince,
      message: 'Província atualizada com sucesso'
    });

  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse('Erro ao atualizar província', 500));
  }
});

// Deletar província
exports.deleteProvince = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validar ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new ErrorResponse('ID de província inválido', 400));
    }

    // Verificar se a província existe
    const province = await Province.findById(id);
    if (!province) {
      return next(new ErrorResponse('Província não encontrada', 404));
    }

    // Verificar se existem empresas associadas
    const companiesCount = await Company.countDocuments({ provinces: id });
    if (companiesCount > 0) {
      return next(new ErrorResponse(
        'Não é possível excluir a província pois existem empresas vinculadas',
        400
      ));
    }

    // Registrar informações antes de deletar
    const provinceInfo = {
      id: province._id,
      name: province.name,
      population: province.population,
      capital: province.capital,
      area: province.area,
      deletedAt: new Date()
    };

    // Deletar província
    await Province.findByIdAndDelete(id);

    logger.logBusiness('province_deleted', provinceInfo);

    res.status(200).json({
      success: true,
      message: 'Província removida com sucesso',
      data: provinceInfo
    });

  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse('Erro ao remover província', 500));
  }
});

// Buscar estatísticas das províncias
exports.getProvincesStats = asyncHandler(async (req, res, next) => {
  try {
    // Buscar todas as províncias
    const provinces = await Province.find().select('-__v');

    // Calcular estatísticas para cada província
    const stats = await Promise.all(
      provinces.map(async (province) => {
        const companiesCount = await Company.countDocuments({ provinces: province._id });
        
        // Você pode adicionar mais estatísticas aqui conforme necessário
        // Por exemplo, número de usuários, transações, etc.

        return {
          _id: province._id,
          name: province.name,
          population: province.population,
          capital: province.capital,
          area: province.area,
          stats: {
            companiesCount,
            // Adicione mais estatísticas aqui
          }
        };
      })
    );

    logger.logBusiness('provinces_stats_viewed', {
      totalProvinces: provinces.length
    });

    res.status(200).json({
      success: true,
      data: stats
    });

  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse('Erro ao buscar estatísticas das províncias', 500));
  }
});
