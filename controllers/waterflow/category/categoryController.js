const Category = require('../../../models/waterflow/category/CategoryModel');
const ErrorResponse = require('../../../utils/ErrorResponse');
const asyncHandler = require('../../../middleware/asyncHandler');
const logger = require('../../../utils/logger');
const mongoose = require('mongoose');

// Criar categoria
exports.createCategory = asyncHandler(async (req, res, next) => {
  try {
    const { name, description } = req.body;

    // Validação dos campos obrigatórios
    if (!name) {
      return next(new ErrorResponse('Nome da categoria é obrigatório', 400));
    }

    // Verificar duplicidade
    const existingCategory = await Category.findOne({ name: name.trim() });
    if (existingCategory) {
      return next(new ErrorResponse('Já existe uma categoria com este nome', 409));
    }

    // Criar categoria
    const category = await Category.create({
      name: name.trim(),
      description: description ? description.trim() : ''
    });

    logger.logBusiness('category_created', {
      categoryId: category._id,
      name: category.name
    });

    res.status(201).json({
      success: true,
      data: category,
      message: 'Categoria criada com sucesso'
    });

  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse('Erro ao criar categoria', 500));
  }
});

// Buscar categoria por ID
exports.getCategoryById = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new ErrorResponse('ID de categoria inválido', 400));
    }

    const category = await Category.findById(id).select('-__v');

    if (!category) {
      return next(new ErrorResponse('Categoria não encontrada', 404));
    }

    logger.logBusiness('category_viewed', {
      categoryId: category._id,
      name: category.name
    });

    res.status(200).json({
      success: true,
      data: category
    });

  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse('Erro ao buscar categoria', 500));
  }
});

// Listar todas as categorias
exports.getAllCategories = asyncHandler(async (req, res, next) => {
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
        { description: { $regex: searchTerm, $options: 'i' } }
      ];
    }

    // Configurar ordenação
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Contar total de documentos
    const totalCount = await Category.countDocuments(query);

    // Buscar categorias com paginação
    const categories = await Category.find(query)
      .select('-__v')
      .sort(sortOptions)
      .skip((pageNumber - 1) * pageSize)
      .limit(parseInt(pageSize));

    logger.logBusiness('categories_listed', {
      page: pageNumber,
      pageSize,
      totalCount,
      searchTerm: searchTerm || 'none'
    });

    res.status(200).json({
      success: true,
      data: categories,
      pagination: {
        total: totalCount,
        pageSize: parseInt(pageSize),
        currentPage: parseInt(pageNumber),
        totalPages: Math.ceil(totalCount / pageSize)
      }
    });

  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse('Erro ao listar categorias', 500));
  }
});

// Atualizar categoria
exports.updateCategory = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    // Validar ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new ErrorResponse('ID de categoria inválido', 400));
    }

    // Verificar se a categoria existe
    const existingCategory = await Category.findById(id);
    if (!existingCategory) {
      return next(new ErrorResponse('Categoria não encontrada', 404));
    }

    // Verificar duplicidade (excluindo a categoria atual)
    const duplicateCheck = await Category.findOne({
      _id: { $ne: id },
      name: name.trim()
    });

    if (duplicateCheck) {
      return next(new ErrorResponse('Já existe outra categoria com este nome', 409));
    }

    // Atualizar categoria
    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      {
        name: name.trim(),
        description: description ? description.trim() : '',
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    ).select('-__v');

    logger.logBusiness('category_updated', {
      categoryId: updatedCategory._id,
      changes: {
        before: {
          name: existingCategory.name,
          description: existingCategory.description
        },
        after: {
          name: updatedCategory.name,
          description: updatedCategory.description
        }
      }
    });

    res.status(200).json({
      success: true,
      data: updatedCategory,
      message: 'Categoria atualizada com sucesso'
    });

  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse('Erro ao atualizar categoria', 500));
  }
});

// Deletar categoria
exports.deleteCategory = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validar ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new ErrorResponse('ID de categoria inválido', 400));
    }

    // Verificar se a categoria existe
    const category = await Category.findById(id);
    if (!category) {
      return next(new ErrorResponse('Categoria não encontrada', 404));
    }

    // Registrar informações antes de deletar
    const categoryInfo = {
      id: category._id,
      name: category.name,
      description: category.description,
      deletedAt: new Date()
    };

    // Deletar categoria
    await Category.findByIdAndDelete(id);

    logger.logBusiness('category_deleted', categoryInfo);

    res.status(200).json({
      success: true,
      message: 'Categoria removida com sucesso',
      data: categoryInfo
    });

  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse('Erro ao remover categoria', 500));
  }
});

// Estatísticas das categorias
exports.getCategoriesStats = asyncHandler(async (req, res, next) => {
  try {
    const totalCategories = await Category.countDocuments();
    
    // Você pode adicionar mais estatísticas aqui conforme necessário
    const stats = {
      totalCategories,
      lastUpdated: new Date()
    };

    logger.logBusiness('categories_stats_viewed', stats);

    res.status(200).json({
      success: true,
      data: stats
    });

  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse('Erro ao obter estatísticas das categorias', 500));
  }
});

module.exports = exports;
