// controllers/waterflow/connection/connectionController.js
const Connection = require('../../../models/waterflow/connection/ConnectionModel');
const Customer = require('../../../models/waterflow/customer/CustomerModel');
const District = require('../../../models/waterflow/district/DistrictModel');
const Neighborhood = require('../../../models/waterflow/neighborhood/NeighborhoodModel');
const ErrorResponse = require('../../../utils/ErrorResponse');
const asyncHandler = require('../../../middleware/asyncHandler');
const logger = require('../../../utils/logger');
const mongoose = require('mongoose');
const { page } = require('pdfkit');
const Invoice = require('../../../models/waterflow/invoice/InvoiceModel');
const Reading = require('../../../models/waterflow/reading/ReadingModel');

// Add this helper function at the top of your file with other imports
function dmsToDecimal(degrees, minutes, seconds, direction) {
  let decimal = degrees + (minutes / 60) + (seconds / 3600);
  if (direction === 'S' || direction === 'W') {
    decimal = -decimal;
  }
  return decimal;
}

// // Add this helper function to parse DMS string
// function parseDMSString(dmsStr) {
//   // Match pattern like "S 13° 28' 23.8"" or "E 036° 07' 05.9""
//   const regex = /([NSEW])\s*(\d+)°\s*(\d+)'\s*(\d+\.?\d*)"/;
//   const match = dmsStr.match(regex);

//   if (!match) {
//     return null;
//   }

//   const [_, direction, degrees, minutes, seconds] = match;
//   return dmsToDecimal(
//     parseFloat(degrees),
//     parseFloat(minutes),
//     parseFloat(seconds),
//     direction
//   );
// }

function parseDMSString(dmsStr) {
  if (!dmsStr) return null;

  // Substituir símbolos estranhos por equivalentes normais
  const cleaned = dmsStr
    .replace(/[˚º]/g, '°')   // grau
    .replace(/[´'']/g, "'") // minutos
    .replace(/[ʺ"″"]/g, '"') // segundos

  // Regex flexível
  const regex = /^\s*([NSEW])?\s*(\d{1,3})°\s*(\d{1,2})'\s*(\d{1,2}(?:\.\d+)?)"\s*([NSEW])?\s*$/i;
  const match = cleaned.match(regex);

  if (!match) return null;

  let [, dir1, deg, min, sec, dir2] = match;
  const direction = (dir1 || dir2 || '').toUpperCase();

  let decimal = parseFloat(deg) + parseFloat(min) / 60 + parseFloat(sec) / 3600;
  if (['S', 'W'].includes(direction)) decimal *= -1;

  return decimal;
}

// Criar ligação
exports.createConnection = asyncHandler(async (req, res, next) => {
  try {
    const {
      customerId,
      meterNumber,
      address,
      latitude,
      longitude,
      district,
      neighborhood,
      category,
      initialReading,
      system,
      meterStatus,
      contractDate,
      status
    } = req.body;

    // Garantir que o campo company seja preenchido
    let company;
    if (req.user.role !== 'admin') {
      company = req.user.company;
    } else {
      company = req.body.company || req.query.company || req.query._id;
    }

    if (!company) {
      return next(new ErrorResponse('Campo company é obrigatório', 400));
    }

    // Validar se o ID do distrito é válido
    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return next(new ErrorResponse('ID do cliente e inválido', 400));
    }

    // Validar se o ID do distrito é válido
    if (!mongoose.Types.ObjectId.isValid(system)) {
      return next(new ErrorResponse('ID do sistema e inválido', 400));
    }
    // Verificar se o cliente existe
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return next(new ErrorResponse('Cliente não encontrado', 404));
    }

    // Validar se o ID do distrito é válido
    if (!mongoose.Types.ObjectId.isValid(district)) {
      return next(new ErrorResponse('ID do distrito inválido', 400));
    }

    // // Validar se o ID do bairro é válido
    // if (!mongoose.Types.ObjectId.isValid(neighborhood)) {
    //   return next(new ErrorResponse('ID do bairro inválido', 400));
    // }

    // Verificar se o distrito existe
    const districtExists = await District.findById(district);
    if (!districtExists) {
      return next(new ErrorResponse('Distrito não encontrado', 404));
    }

    // Verificar se o bairro existe e pertence ao distrito
    // const neighborhoodWithDistrict = await Neighborhood.findOne({
    //   _id: neighborhood,
    //   district: district
    // });

    // if (!neighborhoodWithDistrict) {
    //   return next(new ErrorResponse('Bairro não encontrado ou não pertence ao distrito informado', 404));
    // }

    // Verificar duplicidade do número do medidor
    const existingMeter = await Connection.findOne({ meterNumber: meterNumber.trim() });
    if (existingMeter) {
      return next(new ErrorResponse('Número do medidor já existe', 400));
    }

    // Validar coordenadas
    let lat, lon;

    // Try parsing as DMS format first
    if (typeof latitude === 'string' && latitude.includes('°')) {
      lat = parseDMSString(latitude);
      if (lat === null) {
        return next(new ErrorResponse('Formato de latitude inválido. Use DMS (ex: S 13° 28\' 23.8") ou decimal', 400));
      }
    } else {
      lat = parseFloat(latitude);
    }

    if (typeof longitude === 'string' && longitude.includes('°')) {
      lon = parseDMSString(longitude);
      if (lon === null) {
        return next(new ErrorResponse('Formato de longitude inválido. Use DMS (ex: E 036° 07\' 05.9") ou decimal', 400));
      }
    } else {
      lon = parseFloat(longitude);
    }

    if (isNaN(lat) || lat < -90 || lat > 90) {
      return next(new ErrorResponse('Latitude inválida', 400));
    }

    if (isNaN(lon) || lon < -180 || lon > 180) {
      return next(new ErrorResponse('Longitude inválida', 400));
    }

    // Converter e validar leitura inicial
    const initialReadingNum = Number(initialReading);
    if (isNaN(initialReadingNum) || initialReadingNum < 0) {
      return next(new ErrorResponse('Leitura inicial deve ser um número não negativo', 400));
    }

    // Validar categoria
    const validCategories = ["Domestico", "Fontenario", "Municipio", "Comercial", "Industrial", "Publico"];
    if (!validCategories.includes(category)) {
      return next(new ErrorResponse('Categoria inválida', 400));
    }

    // Validar status do medidor
    const validMeterStatus = ['Activo', 'Inactivo'];
    if (meterStatus && !validMeterStatus.includes(meterStatus)) {
      return next(new ErrorResponse('Status do medidor inválido', 400));
    }

    // Validar status da ligação
    const validStatus = ['Activo', 'Inactivo'];
    if (status && !validStatus.includes(status)) {
      return next(new ErrorResponse('Status da ligação inválido', 400));
    }

    // Validar crédito disponível
    // const availableCreditNum = Number(availableCredit);
    // if (availableCredit !== undefined && (isNaN(availableCreditNum) || availableCreditNum < 0)) {
    //   return next(new ErrorResponse('Crédito disponível deve ser um número não negativo', 400));
    // }

    // Validar data do contrato
    let validContractDate = contractDate ? new Date(contractDate) : new Date();
    if (contractDate && isNaN(validContractDate.getTime())) {
      return next(new ErrorResponse('Data do contrato inválida', 400));
    }

    // Processar arquivo
    let meterImage;
    if (req.file) { // Assuming you're using multer and it stores the file in req.file
      meterImage = req.file.path; // Get the path of the uploaded file
    }

    // Criar ligação
    const connection = await Connection.create({
      customer: customerId,
      meterNumber: meterNumber.trim(),
      address: address.trim(),
      location: {
        latitude: lat,
        longitude: lon
      },
      system,
      district,
      neighborhood,
      category,
      initialReading: initialReadingNum,
      meterImage,
      meterStatus: meterStatus || 'Activo',
      status: status || 'Activo',
      contractDate: validContractDate,
      company
    });

    // Populate dos dados relacionados
    await connection.populate([
      { path: 'district', select: 'name' },
      { path: 'neighborhood', select: 'name' },
      { path: 'system', select: 'name' }
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

// Listar ligações de um cliente
exports.getCustomerConnections = asyncHandler(async (req, res, next) => {
  try {
    const { customerId } = req.params;
    const { page = 1, pageSize = 10 } = req.query; // Adicionando paginação

    // Verificar se o cliente existe
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return next(new ErrorResponse('Cliente não encontrado', 404));
    }

    const skip = (parseInt(page) - 1) * parseInt(pageSize); // Cálculo de skip

    const connections = await Connection.find({ customer: customerId })
      .populate([
        {
          path: 'customer',
          select: 'name contact1 address' // Added more customer fields
        },
        { path: 'district', select: 'name' },
        { path: 'neighborhood', select: 'name' }
      ])
      .skip(skip) // Aplicando skip
      .limit(parseInt(pageSize)) // Limitando o número de resultados
      .populate([
        { path: 'district', select: 'name' },
        { path: 'neighborhood', select: 'name' }
      ]);

    const total = await Connection.countDocuments({ customer: customerId }); // Contando total de conexões

    res.status(200).json({
      success: true,
      count: connections.length,
      data: connections,
      pagination: {
        currentPage: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / parseInt(pageSize)),
        totalCount: total
      }
    });
  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse('Erro ao listar ligações', 500));
  }
});

// Obter ligação específica
exports.getConnectionById = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params; // Only get the connection ID

    const connection = await Connection.findById(id); // Find by ID only

    if (!connection) {
      return next(new ErrorResponse('Ligação não encontrada', 404));
    }

    res.status(200).json({
      success: true,
      data: connection
    });
  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse('Erro ao buscar ligação', 500));
  }
});

// Atualizar ligação
// exports.updateConnection = asyncHandler(async (req, res, next) => {
//   try {
//     // Log the incoming request data
//     console.log('Received data for updateConnection:', req.body);

//     const { id } = req.params; // Removed customerId
//     const updateData = { ...req.body };

//     // Verificar se a ligação existe
//     const connection = await Connection.findById(id); // Only find by ID

//     if (!connection) {
//       return next(new ErrorResponse('Ligação não encontrada', 404));
//     }

//     // Check for references in other collections (e.g., Invoices, Readings)
//     const hasReferences = await Invoice.findOne({ connection: id }) || await Reading.findOne({ connection: id });
//     if (hasReferences) {
//       return next(new ErrorResponse('Não pode atualizar a ligação porque está em uso em outra tabela', 400));
//     }

//     // Validar coordenadas se fornecidas
//     if (!updateData.latitude || !updateData.longitude) {
//       return next(new ErrorResponse('Localização obrigatória. Por favor, informe a latitude e longitude.', 400));
//     }

//     // Validate DMS format for latitude and longitude
//     const latDMS = typeof updateData.latitude === 'string' && updateData.latitude.includes('°');
//     const lonDMS = typeof updateData.longitude === 'string' && updateData.longitude.includes('°');

//     if (!latDMS || !lonDMS) {
//       return next(new ErrorResponse('Por favor, informe a latitude e longitude no formato DMS (ex: S 13° 28\' 24.7").', 400));
//     }

//     // Parse DMS coordinates
//     const lat = parseDMSString(updateData.latitude);
//     const lon = parseDMSString(updateData.longitude);

//     if (lat === null || lon === null) {
//       return next(new ErrorResponse('Formato de latitude ou longitude inválido. Use DMS (ex: S 13° 28\' 24.7") ou decimal.', 400));
//     }

//     updateData.location = {
//       latitude: lat,
//       longitude: lon
//     };
//     delete updateData.latitude;
//     delete updateData.longitude;

//     // Validar data do contrato se fornecida
//     if (updateData.contractDate) {
//       const validContractDate = new Date(updateData.contractDate);
//       if (isNaN(validContractDate.getTime())) {
//         return next(new ErrorResponse('Data do contrato inválida', 400));
//       }
//       updateData.contractDate = validContractDate;
//     }

//     // Se houver nova imagem
//     if (req.file) {
//       if (connection.meterImage) {
//         const fs = require('fs').promises;
//         try {
//           await fs.unlink(connection.meterImage);
//         } catch (err) {
//           logger.logError('Erro ao remover imagem antiga', err);
//         }
//       }
//       updateData.meterImage = req.file.path;
//     }

//     // Atualizar ligação
//     const updatedConnection = await Connection.findByIdAndUpdate(
//       id,
//       {
//         ...updateData,
//         updatedAt: new Date()
//       },
//       { new: true, runValidators: true }
//     ).populate([
//       { path: 'district', select: 'name' },
//       { path: 'neighborhood', select: 'name' }
//     ]);

//     logger.logBusiness('connection_updated', {
//       connectionId: id,
//       changes: updateData
//     });

//     res.status(200).json({
//       success: true,
//       data: updatedConnection,
//       message: 'Ligação atualizada com sucesso'
//     });

//   } catch (error) {
//     logger.logError(error, req);
//     next(new ErrorResponse('Erro ao atualizar ligação', 500));
//   }
// });

exports.updateConnection = asyncHandler(async (req, res, next) => {
  try {
    console.log('Received data for updateConnection:', req.body);

    const { id } = req.params;
    const updateData = { ...req.body };

    const connection = await Connection.findById(id);
    if (!connection) {
      return next(new ErrorResponse('Ligação não encontrada', 404));
    }

    // Processamento de coordenadas
    let latitude = updateData.latitude;
    let longitude = updateData.longitude;

    if (!latitude || !longitude) {
      return next(new ErrorResponse('Localização obrigatória. Por favor, informe a latitude e longitude.', 400));
    }

    let latDecimal = parseDMSString(latitude);
    let lonDecimal = parseDMSString(longitude);

    // Caso não seja DMS, tentar converter diretamente como número decimal
    if (latDecimal === null) {
      const tryLat = parseFloat(latitude);
      if (!isNaN(tryLat)) latDecimal = tryLat;
    }

    if (lonDecimal === null) {
      const tryLon = parseFloat(longitude);
      if (!isNaN(tryLon)) lonDecimal = tryLon;
    }

    if (latDecimal === null || lonDecimal === null) {
      return next(new ErrorResponse('Latitude ou longitude inválida. Use DMS (ex: S 13° 28\' 24.7") ou decimal.', 400));
    }

    updateData.location = {
      latitude: latDecimal,
      longitude: lonDecimal
    };

    delete updateData.latitude;
    delete updateData.longitude;

    // Validação de data do contrato
    if (updateData.contractDate) {
      const validContractDate = new Date(updateData.contractDate);
      if (isNaN(validContractDate.getTime())) {
        return next(new ErrorResponse('Data do contrato inválida', 400));
      }
      updateData.contractDate = validContractDate;
    }

    // Atualização de imagem
    if (req.file) {
      if (connection.meterImage) {
        const fs = require('fs').promises;
        try {
          await fs.unlink(connection.meterImage);
        } catch (err) {
          logger.logError('Erro ao remover imagem antiga', err);
        }
      }
      updateData.meterImage = req.file.path;
    }

    // Atualizar ligação
    const updatedConnection = await Connection.findByIdAndUpdate(
      id,
      {
        ...updateData,
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    ).populate([
      { path: 'district', select: 'name' },
      { path: 'neighborhood', select: 'name' }
    ]);

    logger.logBusiness('connection_updated', {
      connectionId: id,
      changes: updateData
    });

    res.status(200).json({
      success: true,
      data: updatedConnection,
      message: 'Ligação atualizada com sucesso'
    });

  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse('Erro ao atualizar ligação', 500));
  }
});


// Deletar ligação
exports.deleteConnection = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check for references in other collections (e.g., Invoices, Readings)
    const hasReferences = await Invoice.findOne({ connection: id }) || await Reading.findOne({ connection: id });

    if (hasReferences) {
      return next(new ErrorResponse('Não pode apagar a ligação porque está em uso em outra tabela', 400));
    }

    // Verificar se a ligação existe
    const connection = await Connection.findById(id);
    if (!connection) {
      return next(new ErrorResponse('Ligação não encontrada', 404));
    }

    // Remover imagem se existir
    if (connection.meterImage) {
      const fs = require('fs').promises;
      try {
        await fs.unlink(connection.meterImage);
      } catch (err) {
        logger.logError('Erro ao remover imagem do medidor', err);
      }
    }

    await connection.remove();

    logger.logBusiness('connection_deleted', {
      connectionId: id,
      meterNumber: connection.meterNumber
    });

    res.status(200).json({
      success: true,
      message: 'Ligação removida com sucesso'
    });

  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse('Erro ao remover ligação', 500));
  }
});

// Listar todas as ligações
exports.getAllConnections = asyncHandler(async (req, res, next) => {
  try {
    const {
      page = 1,
      pageSize = 10,
      searchTerm,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      startDate,
      endDate,
      category,
      status,
      meterStatus,
      district,
      system
    } = req.query;

    // Construir query base
    let query = {};

    // Se não for admin, filtrar por company através do customer
    if (req.user.role !== 'admin') {
      // Primeiro encontrar todos os customers da company do usuário
      const customersOfCompany = await Customer.find({ company: req.user.company }).select('_id');
      const customerIds = customersOfCompany.map(c => c._id);
      
      // Filtrar conexões apenas desses customers
      query.customer = { $in: customerIds };
    }

    // Adicionar critérios de busca se houver searchTerm
    if (searchTerm) {
      const orConditions = [
        { meterNumber: { $regex: searchTerm, $options: 'i' } },
        { address: { $regex: searchTerm, $options: 'i' } }
      ];
    
      const customer = await Customer.findOne({ name: { $regex: searchTerm, $options: 'i' } });
      if (customer) {
        orConditions.push({ customer: customer._id });
      }
    
      query.$or = orConditions;
    }

    // Adicionar critérios de busca para district e system
    if (district) {
      const districtObj = await District.findOne({ name: { $regex: district, $options: 'i' } });
      if (districtObj) {
        query.district = districtObj._id;
      } else {
        query.district = { $in: [] };
      }
    }

    if (system) {
      const systemObj = await System.findOne({ name: { $regex: system, $options: 'i' } });
      if (systemObj) {
        query.system = systemObj._id;
      } else {
        query.system = { $in: [] };
      }
    }

    // Filtros opcionais
    if (category) {
      query.category = category;
    }

    if (status) {
      query.status = status;
    }

    if (meterStatus) {
      query.meterStatus = meterStatus;
    }

    // Filtro por data de criação
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    // Debug
    console.log('Query parameters:', {
      searchTerm,
      startDate,
      endDate,
      category,
      status,
      meterStatus,
      district,
      system,
      query,
      page,
      pageSize
    });

    const skip = (parseInt(page) - 1) * parseInt(pageSize);

    // Executar as queries em paralelo
    const [connections, total] = await Promise.all([
      Connection.find(query)
        .populate([
          { 
            path: 'customer',
            select: 'name contact1',
            populate: {
              path: 'company',
              select: '_id name'
            }
          },
          { path: 'district', select: 'name' },
          { path: 'neighborhood', select: 'name' },
          { path: 'system', select: 'name' }
        ])
        .select('meterNumber address location category initialReading meterStatus contractDate status createdAt meterImage')
        .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
        .skip(skip)
        .limit(parseInt(pageSize))
        .lean(),

      Connection.countDocuments(query)
    ]);

    // Debug
    console.log('Found connections:', connections.length);
    console.log('Total count:', total);

    return res.status(200).json({
      success: true,
      message: 'Ligações encontradas com sucesso',
      data: connections.map(conn => ({
        _id: conn._id,
        meterNumber: conn.meterNumber,
        address: conn.address,
        location: conn.location,
        category: conn.category,
        initialReading: conn.initialReading,
        meterStatus: conn.meterStatus,
        contractDate: conn.contractDate,
        status: conn.status,
        createdAt: conn.createdAt,
        meterImage: conn.meterImage,
        customer: {
          _id: conn.customer?._id,
          name: conn.customer?.name,
          contact1: conn.customer?.contact1,
          company: conn.customer?.company
        },
        district: {
          _id: conn.district?._id,
          name: conn.district?.name
        },
        neighborhood: {
          _id: conn.neighborhood?._id,
          name: conn.neighborhood?.name
        },
        system: {
          _id: conn.system?._id,
          name: conn.system?.name
        }
      })),
      pagination: {
        currentPage: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / parseInt(pageSize)),
        totalCount: total
      }
    });

  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse('Erro ao listar ligações', 500));
  }
});

exports.addConnection = asyncHandler(async (req, res, next) => {
    // Garantir que o campo company seja preenchido
    if (!req.user.role === 'admin') {
        req.body.company = req.user.company;
    } else if (!req.body.company) {
        req.body.company = req.query.company || req.query._id;
    }

    if (!req.body.company) {
        return next(new ErrorResponse('Campo company é obrigatório', 400));
    }

    const connection = await Connection.create(req.body);
    
    res.status(201).json({
        success: true,
        data: connection
    });
});

// Add new function to update existing connections
exports.updateConnectionsCompany = asyncHandler(async (req, res, next) => {
  try {
    // Find all connections without company
    const connectionsWithoutCompany = await Connection.find({ company: { $exists: false } });
    console.log(`Found ${connectionsWithoutCompany.length} connections without company`);

    let updatedCount = 0;
    let errorCount = 0;

    for (const connection of connectionsWithoutCompany) {
      try {
        // Try to find a reading for this connection
        const reading = await Reading.findOne({
          connection: connection._id,
          company: { $exists: true }
        });

        if (reading) {
          await Connection.findByIdAndUpdate(
            connection._id,
            { company: reading.company },
            { new: true }
          );
          updatedCount++;
          continue;
        }

        // If no reading found, try to find an invoice
        const invoice = await Invoice.findOne({
          connection: connection._id,
          company: { $exists: true }
        });

        if (invoice) {
          await Connection.findByIdAndUpdate(
            connection._id,
            { company: invoice.company },
            { new: true }
          );
          updatedCount++;
        } else {
          errorCount++;
        }
      } catch (err) {
        errorCount++;
        logger.logError(err, req);
      }
    }

    res.status(200).json({
      success: true,
      message: `Updated ${updatedCount} connections. ${errorCount} connections could not be updated.`
    });
  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse('Error updating connections', 500));
  }
});

// Obter ligações sem leituras no mês atual
exports.getConnectionsWithoutReadings = asyncHandler(async (req, res, next) => {
  try {
    const {
      page = 1,
      pageSize = 10,
      searchTerm,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      district,
      system,
      category,
      status
    } = req.query;

    // Obter o primeiro e último dia do mês atual
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    console.log('Período de busca:', {
      firstDayOfMonth,
      lastDayOfMonth
    });

    // Construir match stage inicial
    let matchStage = {
      status: 'Activo',
      meterStatus: 'Activo'
    };

    // Se não for admin, filtrar por company através do customer
    if (req.user.role !== 'admin') {
      const customersOfCompany = await Customer.find({ company: req.user.company }).select('_id');
      const customerIds = customersOfCompany.map(c => c._id);
      matchStage.customer = { $in: customerIds };
    }

    // Adicionar critérios de busca se houver searchTerm
    if (searchTerm) {
      const orConditions = [
        { meterNumber: { $regex: searchTerm, $options: 'i' } },
        { address: { $regex: searchTerm, $options: 'i' } }
      ];
    
      const customer = await Customer.findOne({ name: { $regex: searchTerm, $options: 'i' } });
      if (customer) {
        orConditions.push({ customer: customer._id });
      }
    
      matchStage.$or = orConditions;
    }

    // Adicionar critérios de busca para district e system
    if (district) {
      const districtObj = await District.findOne({ name: { $regex: district, $options: 'i' } });
      if (districtObj) {
        matchStage.district = districtObj._id;
      } else {
        matchStage.district = { $in: [] };
      }
    }

    if (system) {
      const systemObj = await System.findOne({ name: { $regex: system, $options: 'i' } });
      if (systemObj) {
        matchStage.system = systemObj._id;
      } else {
        matchStage.system = { $in: [] };
      }
    }

    // Filtros opcionais
    if (category) {
      matchStage.category = category;
    }

    if (status) {
      matchStage.status = status;
    }

    // Calcular skip para paginação
    const skip = (parseInt(page) - 1) * parseInt(pageSize);

    // Construir pipeline de agregação
    const pipeline = [
      // Match inicial com os filtros básicos
      { $match: matchStage },

      // Lookup para readings do mês atual
      {
        $lookup: {
          from: 'readings',
          let: { connectionId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$connectionId', '$$connectionId'] },
                    { $gte: ['$date', firstDayOfMonth] },
                    { $lte: ['$date', lastDayOfMonth] }
                  ]
                }
              }
            }
          ],
          as: 'monthReadings'
        }
      },

      // Adicionar campo para verificar se tem leitura no mês
      {
        $addFields: {
          hasReadingThisMonth: { $gt: [{ $size: '$monthReadings' }, 0] }
        }
      },

      // Filtrar apenas conexões sem leituras no mês
      {
        $match: {
          hasReadingThisMonth: false
        }
      },

      // Lookup para customer
      {
        $lookup: {
          from: 'customers',
          localField: 'customer',
          foreignField: '_id',
          as: 'customer'
        }
      },
      { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },

      // Lookup para company do customer
      {
        $lookup: {
          from: 'companies',
          localField: 'customer.company',
          foreignField: '_id',
          as: 'customer.company'
        }
      },
      { $unwind: { path: '$customer.company', preserveNullAndEmptyArrays: true } },

      // Lookup para district
      {
        $lookup: {
          from: 'districts',
          localField: 'district',
          foreignField: '_id',
          as: 'district'
        }
      },
      { $unwind: { path: '$district', preserveNullAndEmptyArrays: true } },

      // Lookup para neighborhood
      {
        $lookup: {
          from: 'neighborhoods',
          localField: 'neighborhood',
          foreignField: '_id',
          as: 'neighborhood'
        }
      },
      { $unwind: { path: '$neighborhood', preserveNullAndEmptyArrays: true } },

      // Lookup para system
      {
        $lookup: {
          from: 'systems',
          localField: 'system',
          foreignField: '_id',
          as: 'system'
        }
      },
      { $unwind: { path: '$system', preserveNullAndEmptyArrays: true } },

      // Projetar os campos necessários
      {
        $project: {
          _id: 1,
          meterNumber: 1,
          address: 1,
          location: 1,
          category: 1,
          initialReading: 1,
          meterStatus: 1,
          contractDate: 1,
          status: 1,
          createdAt: 1,
          meterImage: 1,
          customer: {
            _id: '$customer._id',
            name: '$customer.name',
            contact1: '$customer.contact1',
            company: {
              _id: '$customer.company._id',
              name: '$customer.company.name'
            }
          },
          district: {
            _id: '$district._id',
            name: '$district.name'
          },
          neighborhood: {
            _id: '$neighborhood._id',
            name: '$neighborhood.name'
          },
          system: {
            _id: '$system._id',
            name: '$system.name'
          }
        }
      },

      // Ordenação
      { $sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 } },

      // Facet para paginação
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [{ $skip: skip }, { $limit: parseInt(pageSize) }]
        }
      }
    ];

    const result = await Connection.aggregate(pipeline);

    const totalCount = result[0].metadata[0]?.total || 0;
    const connections = result[0].data;

    console.log('Resultado da busca:', {
      totalConnections: totalCount,
      connectionsWithoutReadings: connections.length,
      firstPage: connections.slice(0, 5).map(c => ({
        id: c._id,
        meter: c.meterNumber,
        customer: c.customer?.name
      }))
    });

    return res.status(200).json({
      success: true,
      message: 'Ligações sem leituras encontradas com sucesso',
      data: connections,
      pagination: {
        currentPage: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(totalCount / parseInt(pageSize)),
        totalCount: totalCount
      }
    });

  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse('Erro ao listar ligações sem leituras', 500));
  }
});

module.exports = exports;