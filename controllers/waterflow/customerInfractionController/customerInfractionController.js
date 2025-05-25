const asyncHandler = require('../../../middleware/asyncHandler');
const CustomerInfraction = require('../../../models/waterflow/customerInfraction/CustomerInfractionModel');
const InfractionType = require('../../../models/waterflow/infraction/InfractionTypeModel');
const Connection = require('../../../models/waterflow/connection/ConnectionModel');
const ErrorResponse = require('../../../utils/ErrorResponse');
const logger = require('../../../utils/logger');
const mongoose = require('mongoose');
const User = require('../../../models/userModel');

// Mensagens de erro
const ERROR_MESSAGES = {
  REQUIRED_FIELDS: 'Os campos connection e infractionType são obrigatórios',
  INFRACTION_NOT_FOUND: 'Infração não encontrada',
};

// @desc    Criar nova infração
// @route   POST /api/customer-infractions
exports.createCustomerInfraction = asyncHandler(async (req, res, next) => {
  const { connection, infractionType, comments } = req.body;

  // Log para debug
  logger.logBusiness('create_infraction_request', {
    requestBody: req.body,
    userRole: req.user.role,
    userCompany: req.user.company,
    userId: req.user.id
  });

  // Validações
  if (!connection || !infractionType) {
    return next(new ErrorResponse(ERROR_MESSAGES.REQUIRED_FIELDS, 400));
  }

  // Validate connection ID format
  if (!mongoose.Types.ObjectId.isValid(connection)) {
    return next(new ErrorResponse('ID da conexão inválido', 400));
  }

  // Acesse as imagens corretamente (agora opcional)
  const images = req.files;
  const imagePaths = images ? images.map(file => file.path) : [];

  // Check if connection exists and belongs to the user's company
  let connectionQuery = { _id: connection };
  if (req.user.role !== 'admin') {
    connectionQuery.company = req.user.company;
  }

  const existingConnection = await Connection.findOne(connectionQuery)
    .populate('customer', 'name status');
  
  if (!existingConnection) {
    logger.logError(`Conexão não encontrada${req.user.role !== 'admin' ? ' ou não pertence à empresa' : ''}: ${connection}`, {
      connectionId: connection,
      userRole: req.user.role,
      userCompany: req.user.company,
      query: connectionQuery
    });
    return next(new ErrorResponse(`Conexão não encontrada${req.user.role !== 'admin' ? ' ou não pertence à sua empresa' : ''}`, 404));
  }
  
  // Check if connection's customer is active
  if (existingConnection.customer.status === 'Inativo') {
    logger.logError(`Tentativa de criar infração para conexão de cliente inativo: ${connection}`, req);
    return next(new ErrorResponse('Não é possível dar multa a uma conexão de cliente inativo', 400));
  }

  // Check if infraction type exists and belongs to the user's company
  let infractionTypeQuery = { _id: infractionType };
  if (req.user.role !== 'admin') {
    infractionTypeQuery.company = req.user.company;
  }

  const existingInfractionType = await InfractionType.findOne(infractionTypeQuery);
  
  if (!existingInfractionType) {
    logger.logError(`Tipo de infração não encontrado${req.user.role !== 'admin' ? ' ou não pertence à sua empresa' : ''}: ${infractionType}`, {
      infractionTypeId: infractionType,
      userRole: req.user.role,
      userCompany: req.user.company,
      query: infractionTypeQuery
    });
    return next(new ErrorResponse(`Tipo de infração não encontrado${req.user.role !== 'admin' ? ' ou não pertence à sua empresa' : ''}`, 404));
  }

  try {
    // Criar a infração
    const infraction = await CustomerInfraction.create({
      connection,
      infractionType,
      images: imagePaths,
      company: req.user.company,
      createdBy: req.user.id,
      comments,
      status: 'Multa Aplicada'
    });

    logger.logBusiness('infraction_created', {
      infractionId: infraction._id,
      connection,
      infractionType,
      createdBy: req.user.id
    });

    // Retornar a infração criada
    res.status(201).json({ 
      success: true, 
      data: await infraction.populate([
        { 
          path: 'connection',
          populate: {
            path: 'customer',
            select: 'name email phone'
          }
        },
        { path: 'infractionType' },
        { path: 'company', select: 'name' },
        { path: 'createdBy', select: 'name email' }
      ]),
      message: 'Infração criada com sucesso'
    });
  } catch (error) {
    logger.logError('Erro ao criar infração', { 
      error: error.message,
      stack: error.stack,
      connection,
      infractionType,
      userRole: req.user.role 
    });
    return next(new ErrorResponse('Erro ao criar infração: ' + error.message, 500));
  }
});

// @desc    Listar todas as infrações com paginação, filtragem e ordenação
// @route   GET /api/customer-infractions
exports.getAllCustomerInfractions = asyncHandler(async (req, res, next) => {
  const {
    pageSize = 10,
    pageNumber = 1,
    searchTerm,
    sortBy = 'createdAt',
    sortOrder = 'asc'
  } = req.query;

  try {
    // Construir query base
    const query = {};

    // Add company filter for non-admin users
    if (req.user.role !== 'admin') {
      query.company = req.user.company;
    } else if (req.query.company) {
      query.company = req.query.company;
    }

    // Adicionar critérios de busca
    if (searchTerm) {
      query.$or = [
        { comments: { $regex: searchTerm, $options: 'i' } },
        { infractionDate: { $regex: searchTerm, $options: 'i' } },
        { status: { $regex: searchTerm, $options: 'i' } }
      ];
    }

    // Validar campo de ordenação
    const validSortFields = ['createdAt', 'connection', 'infractionType', 'status', 'infractionDate'];
    if (!validSortFields.includes(sortBy)) {
      return next(new ErrorResponse('Campo de ordenação inválido', 400));
    }

    // Configurar ordenação
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Contar total de documentos
    const totalCount = await CustomerInfraction.countDocuments(query);

    // Buscar infrações com paginação
    const infractions = await CustomerInfraction.find(query)
      .populate({
        path: 'connection',
        populate: {
          path: 'customer',
          select: 'name email phone status'
        }
      })
      .populate('infractionType')
      .populate('company', 'name')
      .populate('createdBy', 'name email role')
      .sort(sortOptions)
      .skip((pageNumber - 1) * pageSize)
      .limit(parseInt(pageSize));

    // Log infrações sem conexão
    const infractionsWithoutConnection = infractions.filter(inf => !inf.connection);
    if (infractionsWithoutConnection.length > 0) {
      logger.logError(`Encontradas ${infractionsWithoutConnection.length} infrações sem conexão associada`, {
        infractionIds: infractionsWithoutConnection.map(inf => inf._id)
      });
    }

    res.status(200).json({
      success: true,
      data: infractions,
      pagination: {
        total: totalCount,
        pageSize: parseInt(pageSize),
        currentPage: parseInt(pageNumber),
        totalPages: Math.ceil(totalCount / pageSize)
      }
    });
  } catch (error) {
    logger.logError('Erro ao buscar infrações', { 
      error: error.message,
      stack: error.stack,
      query,
      userRole: req.user.role
    });
    return next(new ErrorResponse('Erro ao buscar infrações: ' + error.message, 500));
  }
});

// @desc    Buscar infração por ID
// @route   GET /api/customer-infractions/:id
exports.getCustomerInfractionById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  // Add company filter for non-admin users
  const query = { _id: id };
  if (req.user.role !== 'admin') {
    query.company = req.user.company;
  }

  const infraction = await CustomerInfraction.findOne(query)
    .populate({
      path: 'connection',
      populate: {
        path: 'customer',
        select: 'name email phone status'
      }
    })
    .populate('infractionType')
    .populate('company', 'name')
    .populate('createdBy', 'name email role');

  if (!infraction) {
    logger.logError(`Infração não encontrada: ${id}`, req);
    return next(new ErrorResponse('Infração não encontrada', 404));
  }

  res.status(200).json({ success: true, data: infraction });
});

// @desc    Atualizar uma infração
// @route   PUT /api/customer-infractions/:id
exports.updateCustomerInfraction = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  
  // Processar dados do form-data ou JSON
  let updateData = {};
  
  // Se vier do form-data, os campos estarão diretamente no req.body
  if (req.headers['content-type']?.includes('multipart/form-data')) {
    const allowedFields = ['connection', 'status', 'comments', 'infractionType'];
    allowedFields.forEach(field => {
      if (req.body[field]) {
        updateData[field] = req.body[field];
      }
    });

    // Processar imagens se houver
    if (req.files && req.files.length > 0) {
      updateData.images = req.files.map(file => file.path);
    }
  } else {
    // Se for JSON, usar o body direto
    updateData = req.body;
  }

  // Log dos dados recebidos
  logger.logBusiness('update_infraction_request', {
    id,
    contentType: req.headers['content-type'],
    receivedBody: req.body,
    processedData: updateData,
    files: req.files,
    userRole: req.user.role
  });

  // Validar se há dados para atualizar
  if (!updateData || Object.keys(updateData).length === 0) {
    logger.logError('Tentativa de atualização sem dados', {
      id,
      contentType: req.headers['content-type'],
      body: req.body,
      files: req.files
    });
    return next(new ErrorResponse('Nenhum dado fornecido para atualização. Envie pelo menos um dos campos: connection, status, comments, infractionType ou imagens', 400));
  }

  // Validar campos permitidos
  const allowedFields = ['connection', 'status', 'comments', 'images', 'infractionType'];
  const invalidFields = Object.keys(updateData).filter(field => !allowedFields.includes(field));
  
  if (invalidFields.length > 0) {
    logger.logError('Campos inválidos na atualização', {
      invalidFields,
      receivedData: updateData
    });
    return next(new ErrorResponse(`Campos inválidos: ${invalidFields.join(', ')}. Campos permitidos: ${allowedFields.join(', ')}`, 400));
  }

  try {
    // Validar connection ID se estiver sendo atualizado
    if (updateData.connection) {
      if (!mongoose.Types.ObjectId.isValid(updateData.connection)) {
        logger.logError('ID da conexão inválido na atualização', {
          connectionId: updateData.connection
        });
        return next(new ErrorResponse('ID da conexão inválido', 400));
      }

      // Construir query para verificação da conexão
      const connectionQuery = { _id: updateData.connection };
      if (req.user.role !== 'admin') {
        connectionQuery.company = req.user.company;
      }

      // Verificar se a conexão existe (e pertence à empresa para não-admin)
      const existingConnection = await Connection.findOne(connectionQuery)
        .populate('customer', 'status');

      if (!existingConnection) {
        logger.logError(`Conexão não encontrada${req.user.role !== 'admin' ? ' ou não pertence à sua empresa' : ''}: ${updateData.connection}`, {
          connectionId: updateData.connection,
          userRole: req.user.role,
          company: req.user.company
        });
        return next(new ErrorResponse(`Conexão não encontrada${req.user.role !== 'admin' ? ' ou não pertence à sua empresa' : ''}`, 404));
      }

      if (existingConnection.customer.status === 'Inativo') {
        return next(new ErrorResponse('Não é possível associar a infração a uma conexão de cliente inativo', 400));
      }
    }

    // Validar infractionType se estiver sendo atualizado
    if (updateData.infractionType) {
      if (!mongoose.Types.ObjectId.isValid(updateData.infractionType)) {
        logger.logError('ID do tipo de infração inválido', {
          infractionTypeId: updateData.infractionType
        });
        return next(new ErrorResponse('ID do tipo de infração inválido', 400));
      }

      // Construir query para verificação do tipo de infração
      const infractionTypeQuery = { _id: updateData.infractionType };
      if (req.user.role !== 'admin') {
        infractionTypeQuery.company = req.user.company;
      }

      const existingInfractionType = await InfractionType.findOne(infractionTypeQuery);
      if (!existingInfractionType) {
        logger.logError(`Tipo de infração não encontrado${req.user.role !== 'admin' ? ' ou não pertence à sua empresa' : ''}`, {
          infractionTypeId: updateData.infractionType,
          userRole: req.user.role
        });
        return next(new ErrorResponse(`Tipo de infração não encontrado${req.user.role !== 'admin' ? ' ou não pertence à sua empresa' : ''}`, 404));
      }
    }

    // Validar status se estiver sendo atualizado
    if (updateData.status) {
      const validStatus = ['Pendente', 'Resolvida', 'Multa Aplicada'];
      if (!validStatus.includes(updateData.status)) {
        return next(new ErrorResponse(`Status inválido. Status permitidos: ${validStatus.join(', ')}`, 400));
      }
    }

    // Add company filter for non-admin users
    const query = { _id: id };
    if (req.user.role !== 'admin') {
      query.company = req.user.company;
    }

    // Primeiro, verificar se a infração existe
    const existingInfraction = await CustomerInfraction.findOne(query);
    if (!existingInfraction) {
      logger.logError(`Infração não encontrada para atualização: ${id}`, req);
      return next(new ErrorResponse('Infração não encontrada', 404));
    }

    // Se houver novas imagens, adicionar às existentes
    if (updateData.images) {
      updateData.images = [...(existingInfraction.images || []), ...updateData.images];
    }

    // Atualizar a infração
    const infraction = await CustomerInfraction.findOneAndUpdate(
      query,
      updateData,
      { 
        new: true, 
        runValidators: true 
      }
    )
    .populate({
      path: 'connection',
      populate: {
        path: 'customer',
        select: 'name email phone status'
      }
    })
    .populate('infractionType')
    .populate('company', 'name')
    .populate('createdBy', 'name email role');

    // Verificar se a atualização foi bem-sucedida
    if (!infraction) {
      logger.logError(`Falha ao atualizar infração: ${id}`, { updateData });
      return next(new ErrorResponse('Erro ao atualizar infração', 500));
    }

    // Log detalhado da atualização
    logger.logBusiness('infraction_updated', {
      infractionId: infraction._id,
      updates: updateData,
      previousConnection: existingInfraction.connection,
      newConnection: infraction.connection,
      previousInfractionType: existingInfraction.infractionType,
      newInfractionType: infraction.infractionType,
      updatedBy: req.user._id,
      userRole: req.user.role,
      hadNewImages: !!updateData.images
    });

    res.status(200).json({ 
      success: true, 
      data: infraction,
      message: 'Infração atualizada com sucesso'
    });

  } catch (error) {
    logger.logError('Erro ao atualizar infração', { 
      error: error.message,
      stack: error.stack,
      id, 
      updateData,
      userRole: req.user.role 
    });
    return next(new ErrorResponse('Erro ao atualizar infração: ' + error.message, 500));
  }
});

// @desc    Atualizar status de uma infração
// @route   PATCH /api/customer-infractions/:id/status
exports.updateInfractionStatus = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { status } = req.body;

  // Log para debug
  logger.logBusiness('update_infraction_status_request', {
    id,
    status,
    userRole: req.user.role,
    userCompany: req.user.company,
    userId: req.user.id
  });

  // Validar status
  if (!status) {
    return next(new ErrorResponse('O campo status é obrigatório', 400));
  }

  const validStatus = ['Pendente', 'Resolvida', 'Multa Aplicada'];
  if (!validStatus.includes(status)) {
    return next(new ErrorResponse(`Status inválido. Status permitidos: ${validStatus.join(', ')}`, 400));
  }

  try {
    // Add company filter for non-admin users
    const query = { _id: id };
    if (req.user.role !== 'admin') {
      query.company = req.user.company;
    }

    // Primeiro, verificar se a infração existe
    const existingInfraction = await CustomerInfraction.findOne(query);
    if (!existingInfraction) {
      logger.logError(`Infração não encontrada para atualização de status: ${id}`, req);
      return next(new ErrorResponse('Infração não encontrada', 404));
    }

    // Atualizar apenas o status
    const infraction = await CustomerInfraction.findOneAndUpdate(
      query,
      { status },
      { 
        new: true, 
        runValidators: true 
      }
    )
    .populate({
      path: 'connection',
      populate: {
        path: 'customer',
        select: 'name email phone status'
      }
    })
    .populate('infractionType')
    .populate('company', 'name')
    .populate('createdBy', 'name email role');

    // Verificar se a atualização foi bem-sucedida
    if (!infraction) {
      logger.logError(`Falha ao atualizar status da infração: ${id}`, { status });
      return next(new ErrorResponse('Erro ao atualizar status da infração', 500));
    }

    // Log detalhado da atualização
    logger.logBusiness('infraction_status_updated', {
      infractionId: infraction._id,
      previousStatus: existingInfraction.status,
      newStatus: status,
      updatedBy: req.user._id,
      userRole: req.user.role
    });

    res.status(200).json({ 
      success: true, 
      data: infraction,
      message: 'Status da infração atualizado com sucesso'
    });

  } catch (error) {
    logger.logError('Erro ao atualizar status da infração', { 
      error: error.message,
      stack: error.stack,
      id, 
      status,
      userRole: req.user.role 
    });
    return next(new ErrorResponse('Erro ao atualizar status da infração: ' + error.message, 500));
  }
});

// @desc    Deletar infração
// @route   DELETE /api/customer-infractions/:id
exports.deleteCustomerInfraction = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  // Add company filter for non-admin users
  const query = { _id: id };
  if (req.user.role !== 'admin') {
    query.company = req.user.company;
  }

  const infraction = await CustomerInfraction.findOneAndDelete(query);
  
  if (!infraction) {
    logger.logError(`Infração não encontrada para deletar: ${id}`, req);
    return next(new ErrorResponse('Infração não encontrada', 404));
  }

  logger.logBusiness('infraction_deleted', {
    infractionId: id
  });

  res.status(200).json({ success: true, data: {} });
});

// @desc    Buscar infrações por empresa
// @route   GET /api/customer-infractions/company/:companyId
exports.getInfractionsByCompany = asyncHandler(async (req, res, next) => {
  const { companyId } = req.params;
  const {
    pageSize = 10,
    pageNumber = 1,
    searchTerm,
    sortBy = 'createdAt',
    sortOrder = 'asc'
  } = req.query;

  try {
    // Validar ID da empresa
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      return next(new ErrorResponse('ID da empresa inválido', 400));
    }

    // Construir query base
    const query = { company: companyId };

    // Adicionar critérios de busca
    if (searchTerm) {
      query.$or = [
        { comments: { $regex: searchTerm, $options: 'i' } },
        { infractionDate: { $regex: searchTerm, $options: 'i' } },
        { status: { $regex: searchTerm, $options: 'i' } }
      ];
    }

    // Validar campo de ordenação
    const validSortFields = ['createdAt', 'connection', 'infractionType', 'status', 'infractionDate'];
    if (!validSortFields.includes(sortBy)) {
      return next(new ErrorResponse('Campo de ordenação inválido', 400));
    }

    // Configurar ordenação
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Contar total de documentos
    const totalCount = await CustomerInfraction.countDocuments(query);

    // Buscar infrações com paginação
    const infractions = await CustomerInfraction.find(query)
      .populate({
        path: 'connection',
        populate: {
          path: 'customer',
          select: 'name email phone status'
        }
      })
      .populate('infractionType')
      .populate('company', 'name')
      .populate('createdBy', 'name email role')
      .sort(sortOptions)
      .skip((pageNumber - 1) * pageSize)
      .limit(parseInt(pageSize));

    res.status(200).json({
      success: true,
      data: infractions,
      pagination: {
        total: totalCount,
        pageSize: parseInt(pageSize),
        currentPage: parseInt(pageNumber),
        totalPages: Math.ceil(totalCount / pageSize)
      }
    });
  } catch (error) {
    logger.logError('Erro ao buscar infrações por empresa', { 
      error: error.message,
      stack: error.stack,
      companyId,
      userRole: req.user.role 
    });
    return next(new ErrorResponse('Erro ao buscar infrações por empresa: ' + error.message, 500));
  }
});

// @desc    Buscar infrações por conexão
// @route   GET /api/customer-infractions/connection/:connectionId
exports.getInfractionsByConnection = asyncHandler(async (req, res, next) => {
  const { connectionId } = req.params;
  const {
    pageSize = 10,
    pageNumber = 1,
    searchTerm,
    sortBy = 'createdAt',
    sortOrder = 'asc'
  } = req.query;

  try {
    // Validar ID da conexão
    if (!mongoose.Types.ObjectId.isValid(connectionId)) {
      return next(new ErrorResponse('ID da conexão inválido', 400));
    }

    // Construir query base
    const query = { connection: connectionId };
    if (req.user.role !== 'admin') {
      query.company = req.user.company;
    }

    // Adicionar critérios de busca
    if (searchTerm) {
      query.$or = [
        { comments: { $regex: searchTerm, $options: 'i' } },
        { infractionDate: { $regex: searchTerm, $options: 'i' } },
        { status: { $regex: searchTerm, $options: 'i' } }
      ];
    }

    // Validar campo de ordenação
    const validSortFields = ['createdAt', 'connection', 'infractionType', 'status', 'infractionDate'];
    if (!validSortFields.includes(sortBy)) {
      return next(new ErrorResponse('Campo de ordenação inválido', 400));
    }

    // Configurar ordenação
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Contar total de documentos
    const totalCount = await CustomerInfraction.countDocuments(query);

    // Buscar infrações com paginação
    const infractions = await CustomerInfraction.find(query)
      .populate({
        path: 'connection',
        populate: {
          path: 'customer',
          select: 'name email phone status'
        }
      })
      .populate('infractionType')
      .populate('company', 'name')
      .populate('createdBy', 'name email role')
      .sort(sortOptions)
      .skip((pageNumber - 1) * pageSize)
      .limit(parseInt(pageSize));

    res.status(200).json({
      success: true,
      data: infractions,
      pagination: {
        total: totalCount,
        pageSize: parseInt(pageSize),
        currentPage: parseInt(pageNumber),
        totalPages: Math.ceil(totalCount / pageSize)
      }
    });
  } catch (error) {
    logger.logError('Erro ao buscar infrações por conexão', { 
      error: error.message,
      stack: error.stack,
      connectionId,
      userRole: req.user.role 
    });
    return next(new ErrorResponse('Erro ao buscar infrações por conexão: ' + error.message, 500));
  }
});

// @desc    Buscar infrações do usuário logado
// @route   GET /api/customer-infractions/me
exports.getMyInfractions = asyncHandler(async (req, res, next) => {
  const {
    pageSize = 10,
    pageNumber = 1,
    searchTerm,
    sortBy = 'createdAt',
    sortOrder = 'asc',
    status
  } = req.query;

  try {
    // Construir query base
    const query = { createdBy: req.user.id };

    // Adicionar filtro por status se fornecido
    if (status) {
      query.status = status;
    }

    // Adicionar critérios de busca
    if (searchTerm) {
      query.$or = [
        { comments: { $regex: searchTerm, $options: 'i' } },
        { infractionDate: { $regex: searchTerm, $options: 'i' } },
        { status: { $regex: searchTerm, $options: 'i' } }
      ];
    }

    // Validar campo de ordenação
    const validSortFields = ['createdAt', 'connection', 'infractionType', 'status', 'infractionDate'];
    if (!validSortFields.includes(sortBy)) {
      return next(new ErrorResponse('Campo de ordenação inválido', 400));
    }

    // Configurar ordenação
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Contar total de documentos
    const totalCount = await CustomerInfraction.countDocuments(query);

    // Buscar infrações com paginação
    const infractions = await CustomerInfraction.find(query)
      .populate({
        path: 'connection',
        populate: {
          path: 'customer',
          select: 'name email phone status'
        }
      })
      .populate('infractionType')
      .populate('company', 'name')
      .populate('createdBy', 'name email role')
      .sort(sortOptions)
      .skip((pageNumber - 1) * pageSize)
      .limit(parseInt(pageSize));

    // Agrupar estatísticas por status
    const statusStats = await CustomerInfraction.aggregate([
      { $match: { createdBy: mongoose.Types.ObjectId(req.user.id) } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Formatar estatísticas
    const statistics = {
      total: totalCount,
      byStatus: statusStats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {})
    };

    res.status(200).json({
      success: true,
      data: infractions,
      statistics,
      pagination: {
        total: totalCount,
        pageSize: parseInt(pageSize),
        currentPage: parseInt(pageNumber),
        totalPages: Math.ceil(totalCount / pageSize)
      }
    });
  } catch (error) {
    logger.logError('Erro ao buscar minhas infrações', { 
      error: error.message,
      stack: error.stack,
      userId: req.user.id,
      userRole: req.user.role 
    });
    return next(new ErrorResponse('Erro ao buscar minhas infrações: ' + error.message, 500));
  }
}); 