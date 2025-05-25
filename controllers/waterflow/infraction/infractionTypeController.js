// controllers/waterflow/infraccions/infraccionsController.js

const Infraction = require('../../../models/waterflow/infraction/InfractionTypeModel');
const Company = require('../../../models/waterflow/company/CompanyModel');
const ErrorResponse = require('../../../utils/ErrorResponse');
const asyncHandler = require('../../../middleware/asyncHandler');
const logger = require('../../../utils/logger');
const mongoose = require('mongoose');

// Criar infração
exports.createInfractionType = asyncHandler(async (req, res, next) => {
  try {
    const { reason, defaultValue } = req.body;

    // Validações
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return next(new ErrorResponse('O campo "nome" é obrigatório.', 400));
    }
    if (typeof defaultValue === 'undefined') {
      return next(new ErrorResponse('O campo "Valor" é obrigatório.', 400));
    }

    // Verificar se a infração já existe para a mesma empresa
    const existingInfraction = await Infraction.findOne({
      reason,
      company: req.user.company,
    });

    if (existingInfraction) {
      return next(new ErrorResponse('Já existe uma infração com este nome.', 400));
    }

    // Criar infração
    const infraccions = await Infraction.create({
      reason,
      defaultValue,
      company: req.user.company,
      createdBy: req.user.id,
    });

    logger.logBusiness('infraction_created', {
      infraccionsId: infraccions._id,
      reason,
      defaultValue,
      company: req.user.company,
      createdBy: req.user.id,
    });

    res.status(201).json({
      success: true,
      data: infraccions,
      message: 'Infração criada com sucesso',
    });
  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse('Erro ao criar infração', 500));
  }
});

// Buscar infração por ID
exports.getInfractionTypeById = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new ErrorResponse('ID de infração inválido', 400));
    }

    // Add company filter for non-admin users
    const query = { _id: id };
    if (req.user.role !== 'admin') {
      query.company = req.user.company;
    }

    const infraccions = await Infraction.findOne(query).populate('company', 'name').lean();

    if (!infraccions) {
      return next(new ErrorResponse('Infração não encontrada', 404));
    }

    res.status(200).json({
      success: true,
      data: infraccions,
    });
  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse('Erro ao buscar infração', 500));
  }
});

// Listar todas as infrações
exports.getAllInfractionTypes = asyncHandler(async (req, res, next) => {
  try {
    const { pageSize = 10, pageNumber = 1, searchTerm, sortBy = 'date', sortOrder = 'asc', status } = req.query;

    // Construir query base
    const query = {};

    // Add company filter for non-admin users
    if (req.user.role !== 'admin') {
      query.company = req.user.company;
    } else if (req.query.company) {
      query.company = req.query.company;
    }

    // Adicionar filtros
    if (status) {
      query.status = status;
    }

    // Adicionar critérios de busca
    if (searchTerm) {
      query.reason = { $regex: searchTerm, $options: 'i' };
    }

    // Validar campo de ordenação
    const validSortFields = ['date', 'status'];
    if (!validSortFields.includes(sortBy)) {
      return next(new ErrorResponse('Campo de ordenação inválido', 400));
    }

    // Configurar ordenação
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Contar total de documentos
    const totalCount = await Infraction.countDocuments(query);

    // Buscar infrações com paginação
    const infraccions = await Infraction.find(query)
      .populate('company', 'name')
      .sort(sortOptions)
      .skip((pageNumber - 1) * pageSize)
      .limit(parseInt(pageSize))
      .lean();

    res.status(200).json({
      success: true,
      data: infraccions,
      pagination: {
        total: totalCount,
        pageSize: parseInt(pageSize),
        currentPage: parseInt(pageNumber),
        totalPages: Math.ceil(totalCount / pageSize),
      },
    });
  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse('Erro ao listar infrações', 500));
  }
});

// Atualizar infração
exports.updateInfractionType = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Validar ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new ErrorResponse('ID de infração inválido', 400));
    }

    // Add company filter for non-admin users
    const query = { _id: id };
    if (req.user.role !== 'admin') {
      query.company = req.user.company;
    }

    // Verificar se a infração existe e pertence à empresa do usuário
    const existingInfraction = await Infraction.findOne(query);
    if (!existingInfraction) {
      return next(new ErrorResponse('Infração não encontrada', 404));
    }

    // Atualizar infração
    const updatedInfraction = await Infraction.findOneAndUpdate(
      query,
      updateData,
      { new: true, runValidators: true }
    ).populate('company', 'name');

    res.status(200).json({
      success: true,
      data: updatedInfraction,
      message: 'Infração atualizada com sucesso',
    });
  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse('Erro ao atualizar infração', 500));
  }
});

// Deletar infração
exports.deleteInfractionType = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validar ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new ErrorResponse('ID de infração inválido', 400));
    }

    // Add company filter for non-admin users
    const query = { _id: id };
    if (req.user.role !== 'admin') {
      query.company = req.user.company;
    }

    // Verificar se a infração existe e pertence à empresa do usuário
    const infraction = await Infraction.findOne(query);
    if (!infraction) {
      return next(new ErrorResponse('Infração não encontrada', 404));
    }

    // Deletar infração
    await Infraction.findOneAndDelete(query);

    res.status(200).json({
      success: true,
      message: 'Infração removida com sucesso',
    });
  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse('Erro ao remover infração', 500));
  }
});

module.exports = exports;