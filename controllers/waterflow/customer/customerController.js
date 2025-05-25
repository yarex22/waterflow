const Customer = require('../../../models/waterflow/customer/CustomerModel');
const District = require('../../../models/waterflow/district/DistrictModel');
const Neighborhood = require('../../../models/waterflow/neighborhood/NeighborhoodModel');
const ErrorResponse = require('../../../utils/ErrorResponse');
const asyncHandler = require('../../../middleware/asyncHandler');
const logger = require('../../../utils/logger');
const mongoose = require('mongoose');
const Connection = require('../../../models/waterflow/connection/ConnectionModel');

// Validações
const validatePhoneNumber = (phone) => /^\+?[1-9]\d{1,14}$/.test(phone);
const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validateCategory = (category) => {
  const validCategories = ["Doméstico", "Fontanário", "Município", "Comercial", "Industrial", "Público"];
  return validCategories.includes(category);
};

// Criar cliente
exports.createCustomer = asyncHandler(async (req, res, next) => {
  console.log("req.body", req.body);
  try {
    const {
      code,
      name,
      contact1,
      contact2,
      email,
      docNumber,
      nuit,
      company
    } = req.body;

    // const document = req.files?.document;
    // Validação dos campos obrigatórios
    const requiredFields = {
      code,
      name,
      contact1,
      email,
      docNumber,
      nuit,
      company
    };

    const missingFields = Object.entries(requiredFields)
      .filter(([_, value]) => !value)
      .map(([field]) => field);

    if (missingFields.length > 0) {
      return next(new ErrorResponse(`Campos obrigatórios faltando: ${missingFields.join(', ')}`, 400));
    }

    // Validar se o ID da empresa é válido
    if (!mongoose.Types.ObjectId.isValid(company)) {
      return next(new ErrorResponse('ID da empresa inválido', 400));
    }

    // Validações de formato
    if (!validatePhoneNumber(contact1)) {
      return next(new ErrorResponse('Formato de telefone principal inválido', 400));
    }

    if (contact2 && !validatePhoneNumber(contact2)) {
      return next(new ErrorResponse('Formato de telefone secundário inválido', 400));
    }

    if (!validateEmail(email)) {
      return next(new ErrorResponse('Formato de email inválido', 400));
    }

    // Verificar duplicidade
    const existingCustomer = await Customer.findOne({
      $or: [
        { code: code.trim() },
        { email: email.trim().toLowerCase() }
      ]
    });

    if (existingCustomer) {
      const duplicateField = existingCustomer.code === code.trim() ? 'código' : 'email';
      return next(new ErrorResponse(`Já existe um cliente com este ${duplicateField}`, 409));
    }

    // Criar cliente
    const customer = await Customer.create({
      code: code.trim(),
      name: name.trim(),
      contact1: contact1.trim(),
      contact2: contact2 ? contact2.trim() : undefined,
      email: email.trim().toLowerCase(),
      docNumber: docNumber.trim(),
      nuit: nuit.trim(),
      company,
      document: req.file ? req.file.path : null,
      status: 'Ativo'
    });

    // Populate dos dados da empresa para retorno
    await customer.populate('company', 'name');

    logger.logBusiness('customer_created', {
      customerId: customer._id,
      code: customer.code,
      name: customer.name,
      company: customer.company.name
    });

    res.status(201).json({
      success: true,
      data: customer,
      message: 'Cliente criado com sucesso'
    });

  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse('Erro ao criar cliente', 500));
  }
});

// Buscar cliente por ID
exports.getCustomerById = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new ErrorResponse('ID de cliente inválido', 400));
    }

    const customer = await Customer.findById(id)
      .select('-__v')
      .populate('company', 'name')
      .lean();

    if (!customer) {
      return next(new ErrorResponse('Cliente não encontrado', 404));
    }

    logger.logBusiness('customer_viewed', {
      customerId: customer._id,
      code: customer.code,
      name: customer.name
    });

    res.status(200).json({
      success: true,
      data: customer
    });

  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse('Erro ao buscar cliente', 500));
  }
});


// Listar todos os clientes
exports.getAllCustomers = asyncHandler(async (req, res, next) => {
  try {
    const {
      page = 1,
      pageSize = 10,
      searchTerm,
      startDate,
      endDate
    } = req.query;

    let query = {};
    if (req.user.role !== 'admin') {
      query.company = req.user.company;
    }

    // Adicionar filtro de texto se fornecido
    if (searchTerm) {
      query.$or = [
        { name: new RegExp(searchTerm, 'i') },
        { code: new RegExp(searchTerm, 'i') },
        { email: new RegExp(searchTerm, 'i') },
        { contact1: new RegExp(searchTerm, 'i') },
        { 'connections.address': new RegExp(searchTerm, 'i') }
      ];
    }

    // Filtrar por data de criação
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    // Log para debug
    console.log('Query parameters:', {
      searchTerm,
      startDate,
      endDate,
      query
    });

    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    
    // Executar queries em paralelo
    const [customers, total] = await Promise.all([
      Customer.find(query)
        .skip(skip)
        .limit(parseInt(pageSize))
        .select('name code email status connections contact1 contact2 createdAt company availableCredit nuit docNumber')
        .populate('company', 'name')
        .sort({ createdAt: -1 })
        .lean(),
      Customer.countDocuments(query)
    ]);

    // Log para debug
    console.log('Found customers:', customers.length);
    console.log('Total count:', total);

    return res.status(200).json({
      success: true,
      message: 'Clientes encontrados com sucesso',
      data: customers.map(customer => ({
        ...customer,
        createdAt: customer.createdAt, // Incluir a data de criação na resposta
        // ... outros campos
      })),
      pagination: {
        currentPage: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / parseInt(pageSize)),
        totalCount: total
      }
    });

  } catch (error) {
    console.error('Error in getAllCustomers:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar clientes. Por favor, tente novamente mais tarde.',
      error: error.message
    });
  }
});

// Atualizar cliente
exports.updateCustomer = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Validar ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new ErrorResponse('ID de cliente inválido', 400));
    }

    // Verificar se o cliente existe
    const existingCustomer = await Customer.findById(id);
    if (!existingCustomer) {
      return next(new ErrorResponse('Cliente não encontrado', 404));
    }

    // Validações de formato para campos atualizados
    if (updateData.contact1 && !validatePhoneNumber(updateData.contact1)) {
      return next(new ErrorResponse('Formato de telefone principal inválido', 400));
    }

    if (updateData.contact2 && !validatePhoneNumber(updateData.contact2)) {
      return next(new ErrorResponse('Formato de telefone secundário inválido', 400));
    }

    if (updateData.email && !validateEmail(updateData.email)) {
      return next(new ErrorResponse('Formato de email inválido', 400));
    }

    // Verificar duplicidade
    if (updateData.code || updateData.email) {
      const duplicateQuery = {
        _id: { $ne: id },
        $or: []
      };

      if (updateData.code) duplicateQuery.$or.push({ code: updateData.code.trim() });
      if (updateData.email) duplicateQuery.$or.push({ email: updateData.email.trim().toLowerCase() });

      const duplicateCheck = await Customer.findOne(duplicateQuery);

      if (duplicateCheck) {
        const duplicateField = duplicateCheck.code === updateData.code?.trim() ? 'código' : 'email';
        return next(new ErrorResponse(`Já existe outro cliente com este ${duplicateField}`, 409));
      }
    }

    // Preparar dados para atualização
    if (updateData.email) {
      updateData.email = updateData.email.trim().toLowerCase();
    }

    ['code', 'name', 'contact1', 'contact2', 'docNumber', 'nuit'].forEach(field => {
      if (updateData[field]) {
        updateData[field] = updateData[field].trim();
      }
    });

    // Atualizar cliente
    const updatedCustomer = await Customer.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .select('-__v')
      .populate('company', 'name');

    logger.logBusiness('customer_updated', {
      customerId: updatedCustomer._id,
      changes: {
        before: existingCustomer.toObject(),
        after: updatedCustomer.toObject()
      }
    });

    res.status(200).json({
      success: true,
      data: updatedCustomer,
      message: 'Cliente atualizado com sucesso'
    });

  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse('Erro ao atualizar cliente', 500));
  }
});

// Deletar cliente
exports.deleteCustomer = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validar ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new ErrorResponse('ID de cliente inválido', 400));
    }

    // Verificar se o cliente existe
    const customer = await Customer.findById(id);
    if (!customer) {
      return next(new ErrorResponse('Cliente não encontrado', 404));
    }

    // Remover imagem do medidor se existir
    if (customer.meterImage) {
      const fs = require('fs').promises;
      try {
        await fs.unlink(customer.meterImage);
      } catch (err) {
        logger.logError('Erro ao remover imagem do medidor', err);
        // Continua a execução mesmo se houver erro ao remover a imagem
      }
    }

    // TODO: Verificar se existem faturas ou leituras pendentes antes de deletar
    // Isso deve ser implementado quando os modelos de fatura e leitura estiverem disponíveis

    // Registrar informações antes de deletar
    const customerInfo = {
      id: customer._id,
      code: customer.code,
      name: customer.name,
      category: customer.category,
      meterNumber: customer.meterNumber,
      deletedAt: new Date()
    };

    // Deletar cliente
    await Customer.findByIdAndDelete(id);

    logger.logBusiness('customer_deleted', customerInfo);

    res.status(200).json({
      success: true,
      message: 'Cliente removido com sucesso',
      data: customerInfo
    });

  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse('Erro ao remover cliente', 500));
  }
});

// Estatísticas dos clientes
exports.getCustomersStats = asyncHandler(async (req, res, next) => {
  try {
    const [
      totalCustomers,
      activeCustomers,
      inactiveCustomers,
      customersByCategory,
      customersByDistrict,
      meterStatusStats,
      creditStats
    ] = await Promise.all([
      Customer.countDocuments(),
      Customer.countDocuments({ status: 'Ativo' }),
      Customer.countDocuments({ status: 'Inativo' }),
      Customer.aggregate([
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]),
      Customer.aggregate([
        {
          $group: {
            _id: '$district',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]),
      Customer.aggregate([
        {
          $group: {
            _id: '$meterStatus',
            count: { $sum: 1 }
          }
        }
      ]),
      Customer.aggregate([
        {
          $group: {
            _id: null,
            totalCredit: { $sum: '$availableCredit' },
            avgCredit: { $avg: '$availableCredit' },
            maxCredit: { $max: '$availableCredit' },
            minCredit: { $min: '$availableCredit' }
          }
        }
      ])
    ]);

    const stats = {
      totalCustomers,
      activeCustomers,
      inactiveCustomers,
      customersByCategory,
      customersByDistrict,
      meterStatusStats,
      creditStats: creditStats[0] || {
        totalCredit: 0,
        avgCredit: 0,
        maxCredit: 0,
        minCredit: 0
      },
      lastUpdated: new Date()
    };

    logger.logBusiness('customers_stats_viewed', stats);

    res.status(200).json({
      success: true,
      data: stats
    });

  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse('Erro ao obter estatísticas dos clientes', 500));
  }
});

exports.createConnection = asyncHandler(async (req, res, next) => {
  try {
    // Se o customerId vier do body, usamos ele, senão pegamos dos params
    const customerId = req.params.customerId || req.body.customerId;

    if (!customerId) {
      return next(new ErrorResponse('ID do cliente é obrigatório', 400));
    }

    // Verificar se o ID do cliente é válido
    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return next(new ErrorResponse('ID do cliente inválido', 400));
    }

    const {
      meterNumber,
      address,
      latitude,
      longitude,
      district,
      neighborhood,
      category,
      initialReading,
      meterStatus,
      availableCredit,
      contractDate,
      status
    } = req.body;

    // Verificar se o cliente existe
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return next(new ErrorResponse('Cliente não encontrado', 404));
    }

    // Tratamento do número do medidor
    if (!meterNumber || typeof meterNumber !== 'string' || meterNumber.trim() === '') {
      return next(new ErrorResponse('Número do medidor é obrigatório', 400));
    }

    // Tratamento do endereço
    const cleanAddress = address ? address.trim() : '';

    // Tratamento das coordenadas
    let lat, lon;

    // Função auxiliar para extrair número de string de coordenadas
    const extractCoordinate = (coord) => {
      if (typeof coord !== 'string') return parseFloat(coord);

      // Remove todos os caracteres exceto números, ponto decimal, sinal de menos e espaços
      const cleanCoord = coord.replace(/[^0-9.-\s]/g, '');
      // Pega o primeiro número válido da string
      const matches = cleanCoord.match(/-?\d+\.?\d*/);
      return matches ? parseFloat(matches[0]) : NaN;
    };

    lat = extractCoordinate(latitude);
    lon = extractCoordinate(longitude);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      return next(new ErrorResponse('Latitude inválida. Deve ser um número entre -90 e 90', 400));
    }

    if (isNaN(lon) || lon < -180 || lon > 180) {
      return next(new ErrorResponse('Longitude inválida. Deve ser um número entre -180 e 180', 400));
    }

    // Tratamento do distrito
    if (!mongoose.Types.ObjectId.isValid(district)) {
      return next(new ErrorResponse('ID do distrito inválido', 400));
    }

    // Tratamento do bairro
    if (!mongoose.Types.ObjectId.isValid(neighborhood)) {
      return next(new ErrorResponse('ID do bairro inválido', 400));
    }

    // Verificar se o distrito existe
    const districtExists = await District.findById(district);
    if (!districtExists) {
      return next(new ErrorResponse('Distrito não encontrado', 404));
    }

    // Verificar se o bairro existe e pertence ao distrito
    const neighborhoodExists = await Neighborhood.findOne({
      _id: neighborhood,
      district: district
    });

    if (!neighborhoodExists) {
      return next(new ErrorResponse('Bairro não encontrado ou não pertence ao distrito informado', 404));
    }

    // Normalização da categoria
    const normalizeText = (text) => {
      return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    };

    const validCategories = ["Doméstico", "Fontanário", "Município", "Comercial", "Industrial", "Público"];
    const normalizedInputCategory = normalizeText(category);
    const matchedCategory = validCategories.find(c => normalizeText(c) === normalizedInputCategory);

    if (!matchedCategory) {
      return next(new ErrorResponse(`Categoria inválida. Deve ser uma das seguintes: ${validCategories.join(', ')}`, 400));
    }

    // Tratamento da leitura inicial
    const initialReadingNum = parseFloat(initialReading);
    if (isNaN(initialReadingNum) || initialReadingNum < 0) {
      return next(new ErrorResponse('Leitura inicial deve ser um número não negativo', 400));
    }

    // Normalização do status
    const normalizeStatus = (statusStr) => {
      if (!statusStr) return 'Ativo';
      const normalized = normalizeText(statusStr);
      return normalized.includes('activ') || normalized.includes('ativ') ? 'Ativo' : 'Inativo';
    };

    const normalizedMeterStatus = normalizeStatus(meterStatus);
    const normalizedStatus = normalizeStatus(status);

    // Tratamento do crédito disponível
    const availableCreditNum = parseFloat(availableCredit);
    if (isNaN(availableCreditNum) || availableCreditNum < 0) {
      return next(new ErrorResponse('Crédito disponível deve ser um número não negativo', 400));
    }

    // Tratamento da data do contrato
    let validContractDate;
    if (contractDate) {
      // Tenta diferentes formatos de data
      const dateParts = contractDate.split(/[\/\-]/);
      if (dateParts.length === 3) {
        // Assume DD/MM/YYYY ou YYYY-MM-DD
        if (dateParts[0].length === 4) {
          // YYYY-MM-DD
          validContractDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
        } else {
          // DD/MM/YYYY
          validContractDate = new Date(dateParts[2], dateParts[1] - 1, dateParts[0]);
        }
      } else {
        validContractDate = new Date(contractDate);
      }

      if (isNaN(validContractDate.getTime())) {
        return next(new ErrorResponse('Data do contrato inválida. Use o formato DD/MM/YYYY ou YYYY-MM-DD', 400));
      }
    } else {
      validContractDate = new Date();
    }

    // Verificar duplicidade do número do medidor
    const existingMeter = await Connection.findOne({ meterNumber: meterNumber.trim() });
    if (existingMeter) {
      return next(new ErrorResponse('Número do medidor já existe', 400));
    }

    // Criar ligação com os dados normalizados
    const connection = await Connection.create({
      customer: customerId,
      meterNumber: meterNumber.trim(),
      address: cleanAddress,
      location: {
        latitude: lat,
        longitude: lon
      },
      district,
      neighborhood,
      category: matchedCategory,
      initialReading: initialReadingNum,
      meterImage: req.files?.meterImage?.[0]?.path,
      meterStatus: normalizedMeterStatus,
      status: normalizedStatus,
      contractDate: validContractDate,
      availableCredit: availableCreditNum
    });

    // Populate dos dados relacionados
    await connection.populate([
      { path: 'district', select: 'name' },
      { path: 'neighborhood', select: 'name' }
    ]);

    logger.logBusiness('connection_created', {
      customerId,
      connectionId: connection._id,
      meterNumber: connection.meterNumber
    });

    res.status(201).json({
      success: true,
      data: connection,
      message: 'Ligação criada com sucesso'
    });

  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse('Erro ao criar ligação', 500));
  }
});

// Método para obter todos os salários com filtros, ordenação e paginação
exports.getAllSalaries = asyncHandler(async (req, res, next) => {
  try {
    const {
      pageSize = 10,
      pageNumber = 1,
      searchTerm,
      sortBy = 'month', // ou outro campo que você deseja usar para ordenação
      sortOrder = 'asc',
      company
    } = req.query;

    // Construir query
    const query = {};

    // Adicionar filtros
    if (company) {
      if (!mongoose.Types.ObjectId.isValid(company)) {
        return next(new ErrorResponse('ID da empresa inválido', 400));
      }
      query.company = company;
    }

    // Adicionar critérios de busca
    if (searchTerm) {
      query.$or = [
        { 'employee.name': { $regex: searchTerm, $options: 'i' } },
        { 'employee.code': { $regex: searchTerm, $options: 'i' } },
        { month: { $regex: searchTerm, $options: 'i' } }
      ];
    }

    // Validar campo de ordenação
    const validSortFields = ['month', 'netSalary', 'baseSalary', 'totalTaxes', 'totalBenefits'];
    if (!validSortFields.includes(sortBy)) {
      return next(new ErrorResponse('Campo de ordenação inválido', 400));
    }

    // Configurar ordenação
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Contar total de documentos
    const totalCount = await Salary.countDocuments(query);

    // Buscar salários com paginação e incluir conexões
    const salaries = await Salary.find(query)
      .populate('employee company')
      .sort(sortOptions)
      .skip((pageNumber - 1) * pageSize)
      .limit(parseInt(pageSize))
      .lean();

    res.status(200).json({
      success: true,
      data: salaries,
      pagination: {
        total: totalCount,
        pageSize: parseInt(pageSize),
        currentPage: parseInt(pageNumber),
        totalPages: Math.ceil(totalCount / pageSize)
      }
    });

  } catch (error) {
    next(new ErrorResponse('Erro ao listar salários', 500));
  }
});

module.exports = exports;

