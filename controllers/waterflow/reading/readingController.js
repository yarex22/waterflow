const mongoose = require('mongoose');
const asyncHandler = require('../../../middleware/asyncHandler');
const ErrorResponse = require('../../../utils/ErrorResponse');
const Reading = require('../../../models/waterflow/reading/ReadingModel');
const Customer = require('../../../models/waterflow/customer/CustomerModel');
const Connection = require('../../../models/waterflow/connection/ConnectionModel');
const Invoice = require('../../../models/waterflow/invoice/InvoiceModel');
const Config = require('../../../models/waterflow/tariff/TariffModel');
const Counter = require('../../../models/waterflow/conter/CounterModel');
const System = require('../../../models/waterflow/system/SystemModel');
const Payment = require('../../../models/waterflow/payment/PaymentModel');
const cache = require('../../../utils/cache');
const Notification = require('../../../models/waterflow/notification/NotificationModel');
const ReadingHistory = require('../../../models/waterflow/reading/ReadingHistoryModel');
const { calculateAverageConsumption } = require('../../../utils/readings');
const { createNotification, checkAbnormalConsumption } = require('../../../utils/notifications');
const { exportToExcel, exportToPDF, exportToCSV } = require('../../../utils/export');

/**
 * Função utilitária para arredondar valores monetários para 2 casas decimais
 * @param {number} value - Valor a ser arredondado
 * @returns {number} - Valor arredondado com 2 casas decimais
 */
const roundMoney = (value) => {
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

/**
 * Função utilitária para calcular o valor da tarifa com base na categoria e consumo
 * @param {Object} connection - Objeto de conexão com informações de categoria
 * @param {Object} system - Objeto de sistema com informações de tarifas
 * @param {number} consumption - Consumo calculado
 * @returns {number} - Valor total calculado, arredondado para 2 casas decimais
 */
const calculateTariff = (connection, system, consumption) => {
  let totalAmount = 0;

  console.log('Calculando tarifa para:', {
    categoria: connection.category,
    consumo: consumption,
    sistema: system
  });

  if (connection.category === "Fontanarios") {
    totalAmount = consumption * (system.fontanarios?.valor || 0);
    console.log('Tarifa Fontanarios:', { consumo: consumption, valor: system.fontanarios?.valor, total: totalAmount });
  }
  else if (connection.category === "Domestico") {
    totalAmount = system.taxaDisponibilidade || 0;
    const tarifa = system.domestico;

    console.log('Tarifa Doméstica:', { 
      taxaDisponibilidade: system.taxaDisponibilidade,
      escaloes: tarifa,
      consumo: consumption 
    });

    if (consumption > 0 && tarifa?.escalao1) {
      const consumo1 = Math.min(consumption, tarifa.escalao1.max || 0) - (tarifa.escalao1.min || 0);
      if (consumo1 > 0) {
        totalAmount += consumo1 * (tarifa.escalao1.valor || 0);
        console.log('Escalão 1:', { consumo: consumo1, valor: tarifa.escalao1.valor, subtotal: consumo1 * tarifa.escalao1.valor });
      }
    }

    if (consumption > (tarifa?.escalao2?.min || 0)) {
      const consumo2 = Math.min(consumption, tarifa.escalao2.max || 0) - (tarifa.escalao2.min || 0);
      if (consumo2 > 0) {
        totalAmount += consumo2 * (tarifa.escalao2.valor || 0);
        console.log('Escalão 2:', { consumo: consumo2, valor: tarifa.escalao2.valor, subtotal: consumo2 * tarifa.escalao2.valor });
      }
    }

    if (consumption > (tarifa?.escalao3?.min || 0)) {
      const consumo3 = consumption - (tarifa.escalao3.min || 0);
      if (consumo3 > 0) {
        totalAmount += consumo3 * (tarifa.escalao3.valor || 0);
        console.log('Escalão 3:', { consumo: consumo3, valor: tarifa.escalao3.valor, subtotal: consumo3 * tarifa.escalao3.valor });
      }
    }
  }
  else if (connection.category === "Municipio") {
    totalAmount = system.taxaDisponibilidade || 0;
    const tarifa = system.municipio;

    console.log('Tarifa Municipal:', {
      taxaDisponibilidade: system.taxaDisponibilidade,
      config: tarifa,
      consumo: consumption
    });

    if (tarifa?.useEscaloes) {
      if (consumption > 0 && tarifa?.escalao1) {
        const consumo1 = Math.min(consumption, tarifa.escalao1.max || 0) - (tarifa.escalao1.min || 0);
        if (consumo1 > 0) {
          totalAmount += consumo1 * (tarifa.escalao1.valor || 0);
          console.log('Escalão 1:', { consumo: consumo1, valor: tarifa.escalao1.valor, subtotal: consumo1 * tarifa.escalao1.valor });
        }
      }

      if (consumption > (tarifa?.escalao2?.min || 0)) {
        const consumo2 = Math.min(consumption, tarifa.escalao2.max || 0) - (tarifa.escalao2.min || 0);
        if (consumo2 > 0) {
          totalAmount += consumo2 * (tarifa.escalao2.valor || 0);
          console.log('Escalão 2:', { consumo: consumo2, valor: tarifa.escalao2.valor, subtotal: consumo2 * tarifa.escalao2.valor });
        }
      }

      if (consumption > (tarifa?.escalao3?.min || 0)) {
        const consumo3 = consumption - (tarifa.escalao3.min || 0);
        if (consumo3 > 0) {
          totalAmount += consumo3 * (tarifa.escalao3.valor || 0);
          console.log('Escalão 3:', { consumo: consumo3, valor: tarifa.escalao3.valor, subtotal: consumo3 * tarifa.escalao3.valor });
        }
      }
    } else {
      totalAmount += consumption * (tarifa?.taxaFixa || 0);
      console.log('Taxa Fixa:', { consumo: consumption, valor: tarifa?.taxaFixa, total: consumption * (tarifa?.taxaFixa || 0) });
    }
  }
  else if (connection.category === "Comercial") {
    const tarifa = system.comercioPublico;
    totalAmount = tarifa?.taxaBase || 0;

    console.log('Tarifa Comercial:', {
      taxaBase: tarifa?.taxaBase,
      consumoMinimo: tarifa?.consumoMinimo,
      tarifaAcimaMinimo: tarifa?.tarifaAcimaMinimo,
      consumo: consumption
    });

    if (consumption > (tarifa?.consumoMinimo || 0)) {
      const consumoExtra = consumption - (tarifa?.consumoMinimo || 0);
      totalAmount += consumoExtra * (tarifa?.tarifaAcimaMinimo || 0);
      console.log('Consumo acima do mínimo:', { 
        consumoExtra, 
        valor: tarifa?.tarifaAcimaMinimo, 
        subtotal: consumoExtra * (tarifa?.tarifaAcimaMinimo || 0)
      });
    }
  }
  else if (connection.category === "Comercio Publico") {
    const tarifa = system.comercioPublico;
    totalAmount = tarifa?.taxaBase || 0;

    console.log('Tarifa Comércio Público:', {
      taxaBase: tarifa?.taxaBase,
      consumoMinimo: tarifa?.consumoMinimo,
      tarifaAcimaMinimo: tarifa?.tarifaAcimaMinimo,
      consumo: consumption
    });

    if (consumption > (tarifa?.consumoMinimo || 0)) {
      const consumoExtra = consumption - (tarifa?.consumoMinimo || 0);
      totalAmount += consumoExtra * (tarifa?.tarifaAcimaMinimo || 0);
      console.log('Consumo acima do mínimo:', { 
        consumoExtra, 
        valor: tarifa?.tarifaAcimaMinimo, 
        subtotal: consumoExtra * (tarifa?.tarifaAcimaMinimo || 0)
      });
    }
  }
  else if (connection.category === "Industria") {
    const tarifa = system.industria;
    totalAmount = tarifa?.taxaBase || 0;

    console.log('Tarifa Industrial:', {
      taxaBase: tarifa?.taxaBase,
      consumoMinimo: tarifa?.consumoMinimo,
      tarifaAcimaMinimo: tarifa?.tarifaAcimaMinimo,
      consumo: consumption
    });

    if (consumption > (tarifa?.consumoMinimo || 0)) {
      const consumoExtra = consumption - (tarifa?.consumoMinimo || 0);
      totalAmount += consumoExtra * (tarifa?.tarifaAcimaMinimo || 0);
      console.log('Consumo acima do mínimo:', { 
        consumoExtra, 
        valor: tarifa?.tarifaAcimaMinimo, 
        subtotal: consumoExtra * (tarifa?.tarifaAcimaMinimo || 0)
      });
    }
  }

  console.log('Total calculado:', totalAmount);
  return roundMoney(totalAmount);
};

/**
 * Função para registrar informações de auditoria
 * @param {string} action - Ação realizada (CREATE, UPDATE, DELETE)
 * @param {string} entityType - Tipo de entidade (Reading, Invoice, Payment)
 * @param {string} entityId - ID da entidade
 * @param {string} userId - ID do usuário que realizou a ação
 * @param {Object} oldData - Dados antigos (para UPDATE)
 * @param {Object} newData - Novos dados
 */
const logAuditInfo = (action, entityType, entityId, userId, oldData, newData) => {
  console.log(`[AUDIT] ${action} - ${entityType} ${entityId} by user ${userId}`);
  if (oldData) console.log(`[AUDIT] Old data: ${JSON.stringify(oldData)}`);
  if (newData) console.log(`[AUDIT] New data: ${JSON.stringify(newData)}`);
  // Em uma implementação completa, você salvaria essas informações em uma coleção de auditoria
};

const getNextReadingCode = async () => {
  const counter = await Counter.findOneAndUpdate(
    { name: 'reading' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const paddedCode = String(counter.seq).padStart(3, '0');
  return `L${paddedCode}`;
};

const getNextInvoiceNumber = async () => {
  const counter = await Counter.findOneAndUpdate(
    { name: 'invoice' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const paddedCode = String(counter.seq).padStart(6, '0');
  return `INV${paddedCode}`;
};

// Função auxiliar para converter DMS para decimal
function parseDMSString(dmsStr) {
  if (!dmsStr) return null;

  const cleaned = dmsStr
    .replace(/[˚º]/g, '°')
    .replace(/[´'’]/g, "'")
    .replace(/[ʺ"“”]/g, '"')
    .replace(/,/g, '.'); // permitir vírgulas como separador decimal

  // Regex para DMS completo
  const regex = /^\s*([NSEW])?\s*(\d{1,3})°(?:\s*(\d{1,2})')?(?:\s*(\d{1,2}(?:\.\d+)?)[ʺ"]?)?\s*([NSEW])?\s*$/i;
  const match = cleaned.match(regex);

  if (match) {
    let [, dir1, deg, min, sec, dir2] = match;
    const direction = (dir1 || dir2 || '').toUpperCase();
    deg = parseFloat(deg);
    min = parseFloat(min || 0);
    sec = parseFloat(sec || 0);

    let decimal = deg + min / 60 + sec / 3600;
    if (['S', 'W'].includes(direction)) decimal *= -1;

    return decimal;
  }

  // Regex para valor decimal com direção
  const decimalRegex = /^\s*([NSEW])?\s*(-?\d+(?:\.\d+)?)°?\s*([NSEW])?\s*$/i;
  const decimalMatch = cleaned.match(decimalRegex);
  if (decimalMatch) {
    let [, d1, val, d2] = decimalMatch;
    const dir = (d1 || d2 || '').toUpperCase();
    let result = parseFloat(val);
    if (['S', 'W'].includes(dir)) result *= -1;
    return result;
  }

  return null; // não conseguiu interpretar
}

/**
 * Calcula a distância em metros entre duas coordenadas geográficas usando a fórmula de Haversine
 * @param {number} lat1 - Latitude do primeiro ponto
 * @param {number} lon1 - Longitude do primeiro ponto
 * @param {number} lat2 - Latitude do segundo ponto
 * @param {number} lon2 - Longitude do segundo ponto
 * @returns {number} - Distância em metros
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Raio da Terra em metros
  const φ1 = lat1 * Math.PI/180; // φ, λ em radianos
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // em metros
};

exports.createReading = asyncHandler(async (req, res, next) => {
  try {
    console.log('Dados recebidos no createReading:');
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('File:', req.file);
    console.log('User:', req.user);
    console.log('Query:', req.query);
    console.log('Params:', req.params);

    const session = await mongoose.startSession();
    session.startTransaction();

    if (!req.user) {
      return next(new ErrorResponse('Usuário não autenticado', 401));
    }

    try {
      const { connectionId, notes, latitude, longitude } = req.body;
      const currentReading = parseFloat(req.body.currentReading);
      const date = new Date();
      const currentYearMonth = date.toISOString().slice(0, 7);

      let parsedLatitude = parseDMSString(latitude);
      let parsedLongitude = parseDMSString(longitude);

      // Validações de coordenadas existentes...
      if (parsedLatitude === null || parsedLongitude === null) {
        console.error("Coordenadas inválidas: Latitude ou Longitude é null");
        return res.status(400).json({ message: 'Coordenadas inválidas' });
      }

      // Validações de range de coordenadas existentes...
      if (typeof parsedLatitude !== 'number' || isNaN(parsedLatitude) || parsedLatitude < -90 || parsedLatitude > 90) {
        console.error("Latitude inválida:", parsedLatitude);
        return next(new ErrorResponse('Latitude inválida', 400));
      }

      if (typeof parsedLongitude !== 'number' || isNaN(parsedLongitude) || parsedLongitude < -180 || parsedLongitude > 180) {
        console.error("Longitude inválida:", parsedLongitude);
        return next(new ErrorResponse('Longitude inválida', 400));
      }

      // Validar connectionId
      if (!mongoose.Types.ObjectId.isValid(connectionId)) {
        console.error("ID da ligação inválido:", connectionId);
        await session.abortTransaction();
        session.endSession();
        return next(new ErrorResponse('ID da ligação inválido', 400));
      }

      // Buscar a conexão para validar a localização
      const connection = await Connection.findById(connectionId).session(session);
      if (!connection) {
        console.error("Ligação não encontrada:", connectionId);
        await session.abortTransaction();
        session.endSession();
        return next(new ErrorResponse('Ligação não encontrada', 404));
      }

      // Nova validação de localização
      if (connection.location && connection.location.latitude && connection.location.longitude) {
        const distance = calculateDistance(
          parsedLatitude,
          parsedLongitude,
          connection.location.latitude,
          connection.location.longitude
        );

        const MAX_ALLOWED_DISTANCE = 100; // Aumentado para 100 metros temporariamente

        if (distance > MAX_ALLOWED_DISTANCE) {
          console.error("Leitor muito distante do local da conexão:", {
            distancia: Math.round(distance),
            maxPermitida: MAX_ALLOWED_DISTANCE,
            unidade: "metros",
            coordenadasLeitor: { latitude: parsedLatitude, longitude: parsedLongitude },
            coordenadasConexao: { latitude: connection.location.latitude, longitude: connection.location.longitude }
          });
          await session.abortTransaction();
          session.endSession();
          return next(new ErrorResponse(
            `Você precisa estar no local da conexão para efetuar a leitura. Distância atual: ${Math.round(distance)} metros (máximo permitido: ${MAX_ALLOWED_DISTANCE} metros)`,
            400
          ));
        }

        console.log("Validação de localização OK - Distância:", Math.round(distance), "metros");
      } else {
        console.warn("Conexão não possui localização cadastrada. Ignorando validação de distância.");
      }

      // Buscar o cliente através da conexão
      const customer = await Customer.findById(connection.customer).session(session);
      if (!customer) {
        console.error("Cliente não encontrado para a conexão:", connection.customer);
        await session.abortTransaction();
        session.endSession();
        return next(new ErrorResponse('Cliente não encontrado', 404));
      }

      // Verificar se já existe uma leitura para este mês
      const existingReading = await Reading.findOne({
        connectionId,
        date: {
          $gte: new Date(currentYearMonth + '-01'),
          $lt: new Date(currentYearMonth + '-31')
        }
      }).session(session);

      // if (existingReading) {
      //   console.error(`Já existe uma leitura registrada para esta ligação no mês ${currentYearMonth}`);
      //   await session.abortTransaction();
      //   session.endSession();
      //   return next(new ErrorResponse(`Já existe uma leitura registrada para esta ligação no mês ${currentYearMonth}`, 400));
      // }

      const lastReading = await Reading.findOne({ connectionId }).sort({ date: -1 });
      const previousReading = lastReading ? lastReading.currentReading : connection.initialReading;

      if (currentReading < previousReading) {
        console.error("A leitura atual não pode ser menor que a leitura anterior.");
        await session.abortTransaction();
        session.endSession();
        return next(new ErrorResponse('A leitura atual não pode ser menor que a leitura anterior.', 400));
      }

      // Adicionar validação para garantir que as leituras sejam sequenciais
      if (lastReading && date <= lastReading.date) {
        console.error("A data da nova leitura deve ser posterior à última leitura");
        return next(new ErrorResponse('A data da nova leitura deve ser posterior à última leitura', 400));
      }

      const consumption = currentReading - previousReading;
      const code = await getNextReadingCode();

      // Implementar cache para consultas frequentes
      const cacheKey = `reading:${connectionId}:${currentYearMonth}`;
      const cachedReading = await cache.get(cacheKey);
      if (cachedReading) {
        console.log("Leitura encontrada no cache:", cachedReading);
        return cachedReading;
      }

      // Criar leitura com a sessão
      const reading = await Reading.create([{
        code,
        customerId: connection.customer,
        connectionId,
        company: customer.company,
        date,
        previousReading,
        currentReading,
        consumption,
        readingImage: req.file ? req.file.path : null,
        notes,
        location: { latitude: parsedLatitude, longitude: parsedLongitude },
        createdBy: req.user._id
      }], { session });

      const system = await System.findById(connection.system).session(session);
      if (!system) {
        console.error('Sistema não encontrado:', connection.system);
        await session.abortTransaction();
        session.endSession();
        return next(new ErrorResponse('Sistema não encontrado para a leitura', 500));
      }

      console.log('Dados da conexão:', {
        id: connection._id,
        category: connection.category,
        system: connection.system
      });

      console.log('Dados do sistema:', {
        id: system._id,
        fontanarios: system.fontanarios,
        taxaDisponibilidade: system.taxaDisponibilidade,
        domestico: system.domestico,
        municipio: system.municipio,
        comercioPublico: system.comercioPublico,
        industria: system.industria
      });

      // Cálculo da tarifa usando a função utilitária
      const totalAmount = calculateTariff(connection, system, consumption);

      // Cálculo do imposto
      const taxAmount = roundMoney(totalAmount * 0.12);
      const totalAmountWithTax = roundMoney(totalAmount + taxAmount);

      console.log('Consumo:', consumption);
      console.log('Total Amount:', roundMoney(totalAmount));
      console.log('Tax Amount:', roundMoney(taxAmount));
      console.log('Total Amount with Tax:', roundMoney(totalAmountWithTax));

      let availableCreditUsed = 0;
      let remainingDebt = totalAmountWithTax;

      // Lógica de crédito disponível
      if (customer.availableCredit && customer.availableCredit > 0) {
        if (totalAmountWithTax <= customer.availableCredit) {
          // Pagamento total com crédito disponível
          availableCreditUsed = roundMoney(totalAmountWithTax);
          remainingDebt = 0;
          customer.availableCredit = roundMoney(customer.availableCredit - availableCreditUsed);
        } else {
          // Pagamento parcial com crédito disponível
          availableCreditUsed = roundMoney(customer.availableCredit);
          remainingDebt = roundMoney(totalAmountWithTax - availableCreditUsed);
          customer.availableCredit = 0;
        }
        await customer.save({ session });
      }

      // Definir o status da fatura com base no valor de remainingDebt
      const invoiceStatus = remainingDebt === 0 ? 'Pago' : 'Pendente';

      // Gerar número da fatura
      const invoiceNumber = await getNextInvoiceNumber();

      // Criar fatura com a sessão
      const invoice = await Invoice.create([{
        customer: connection.customer,
        company: customer.company,
        reading: reading[0]._id, // Note o [0] porque create com sessão retorna um array
        connection: connection._id,
        baseAmount: totalAmount,
        taxAmount,
        amount: totalAmountWithTax, // Adicionando amount obrigatório
        totalAmount: remainingDebt,
        availableCreditUsed,
        remainingDebt,
        dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        invoiceYearMonth: date.toISOString().slice(0, 7),
        createdBy: req.user._id,
        status: invoiceStatus,
        invoiceType: 'reading',
        invoiceNumber: invoiceNumber // Adicionando invoiceNumber obrigatório
      }], { session });

      // Criar pagamento se houver crédito usado
      if (availableCreditUsed > 0) {
        const payment = await Payment.create([{
          customerId: connection.customer,
          invoiceId: invoice[0]._id, // Note o [0] porque create com sessão retorna um array
          amount: availableCreditUsed,
          date: new Date(),
          notes: 'Pagamento automático com crédito disponível'
        }], { session });

        // Registrar log de auditoria para o pagamento
        logAuditInfo('CREATE', 'Payment', payment[0]._id, req.user._id, null, {
          amount: availableCreditUsed,
          customerId: connection.customer,
          invoiceId: invoice[0]._id
        });
      }

      // Registrar log de auditoria para a leitura
      logAuditInfo('CREATE', 'Reading', reading[0]._id, req.user._id, null, {
        code,
        currentReading,
        previousReading,
        consumption,
        customerId: connection.customer
      });

      // Validar consumo anormal
      const averageConsumption = await calculateAverageConsumption(connectionId);
      if (await checkAbnormalConsumption(consumption, averageConsumption)) {
        await createNotification(
          'abnormal_consumption',
          'Consumo Anormal Detectado',
          `Consumo atual (${consumption}) muito acima da média (${averageConsumption.toFixed(2)})`,
          'high',
          req.user._id,
          { type: 'reading', id: reading[0]._id }
        );
      }

      // Registrar histórico
      await ReadingHistory.create({
        readingId: reading[0]._id,
        userId: req.user._id,
        changeType: 'CREATE',
        newValue: {
          currentReading,
          consumption,
          notes
        }
      });

      // Commit da transação
      await session.commitTransaction();
      session.endSession();

      res.status(201).json({
        success: true,
        data: reading[0],
        message: 'Leitura criada com sucesso e fatura gerada'
      });
    } catch (error) {
      // Em caso de erro, abortar a transação
      await session.abortTransaction();
      session.endSession();
      console.error('ERRO:', error);
      next(new ErrorResponse('Erro ao criar leitura', 500));
    }
  } catch (error) {
    console.error('Erro ao criar leitura:', error);
    next(new ErrorResponse('Erro ao criar leitura', 500));
  }
});

exports.getReadings = asyncHandler(async (req, res, next) => {
  try {
    const {
      page = 1,
      pageSize = 10,
      searchTerm,
      startDate,
      endDate,
      sortBy = 'date',
      sortOrder = 'asc'
    } = req.query;

    // Construir a query do MongoDB
    const query = {};

    // Filtro de empresa para não-admin
    if (req.user.role !== 'admin') {
      query.company = req.user.company;
    }

    // Melhorar a lógica de busca com searchTerm
    if (searchTerm) {
      // Primeiro, buscar clientes que correspondam ao termo de pesquisa
      const customers = await Customer.find({
        name: { $regex: searchTerm, $options: 'i' }
      }).select('_id');
      
      const customerIds = customers.map(c => c._id);

      // Buscar conexões que correspondam ao termo de pesquisa
      const connections = await Connection.find({
        $or: [
          { code: { $regex: searchTerm, $options: 'i' } },
          { meterNumber: { $regex: searchTerm, $options: 'i' } }
        ]
      }).select('_id');
      
      const connectionIds = connections.map(c => c._id);

      // Construir condições de busca
      query.$or = [
        { code: { $regex: searchTerm, $options: 'i' } },           // Buscar por código da leitura
        { notes: { $regex: searchTerm, $options: 'i' } },          // Buscar nas notas
        { customerId: { $in: customerIds } },                      // Buscar por IDs dos clientes encontrados
        { connectionId: { $in: connectionIds } }                   // Buscar por IDs das conexões encontradas
      ];

      // Se o termo de busca for um número, incluir busca por valores numéricos
      const numericSearch = parseFloat(searchTerm);
      if (!isNaN(numericSearch)) {
        query.$or.push(
          { currentReading: numericSearch },
          { previousReading: numericSearch },
          { consumption: numericSearch }
        );
      }
    }

    // Filtrar por data
    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        query.date.$gte = new Date(startDate);
      }
      if (endDate) {
        query.date.$lte = new Date(endDate);
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

    // Validar e sanitizar campos de ordenação
    const validSortFields = ['date', 'currentReading', 'code', 'consumption', 'updatedAt'];
    const sanitizedSortBy = validSortFields.includes(sortBy) ? sortBy : 'updatedAt';
    const sanitizedSortOrder = ['asc', 'desc'].includes(sortOrder.toLowerCase()) ? sortOrder : 'desc';

    // Executar queries em paralelo com melhor população de dados
    const [readings, total] = await Promise.all([
      Reading.find(query)
        .populate({
          path: 'customerId',
          select: 'name code company'
        })
        .populate({
          path: 'connectionId',
          select: 'system category code meterNumber meterStatus address connectionType contractDate initialReading',
          populate: {
            path: 'system',
            select: 'name code category taxaDisponibilidade domestico municipio comercioPublico industria'
          }
        })
        .populate({
          path: 'company',
          select: 'name code'
        })
        .populate({
          path: 'createdBy',
          select: 'name email'
        })
        .sort({ updatedAt: -1 }) // Primeiro ordenar por updatedAt decrescente
        .sort({ [sanitizedSortBy]: sanitizedSortOrder === 'desc' ? -1 : 1 }) // Depois aplicar a ordenação solicitada
        .skip(skip)
        .limit(parseInt(pageSize))
        .lean(),
      Reading.countDocuments(query)
    ]);

    // Log para debug com mais informações
    console.log('Search Results:', {
      searchTerm,
      totalFound: readings.length,
      totalInDatabase: total,
      currentPage: page,
      resultsPerPage: pageSize
    });

    return res.status(200).json({
      success: true,
      message: 'Leituras encontradas com sucesso',
      data: readings,
      pagination: {
        currentPage: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / parseInt(pageSize)),
        totalCount: total
      },
      filters: {
        searchTerm,
        startDate,
        endDate,
        sortBy: sanitizedSortBy,
        sortOrder: sanitizedSortOrder
      }
    });

  } catch (error) {
    console.error('Error in getReadings:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar leituras. Por favor, tente novamente mais tarde.',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

exports.getReadingById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new ErrorResponse('ID inválido', 400));
  }

  const reading = await Reading.findById(id)
    .populate('customerId', 'name')
    .populate('company', 'name')
    .populate('createdBy', 'name');
  if (!reading) {
    return next(new ErrorResponse('Leitura não encontrada', 404));
  }

  res.status(200).json({ success: true, data: reading });
});

exports.updateReading = asyncHandler(async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    console.log('Request Body:', req.body); // Log completo do body
    console.log('Current Reading Value:', req.body.currentReading); // Log específico do currentReading
    console.log('Current Reading Type:', typeof req.body.currentReading); // Log do tipo do currentReading

    // Extrair dados com validação mais robusta
    const currentReading = req.body.currentReading;
    const notes = req.body.notes;
    const connectionId = req.body.connectionId;

    // Validação mais detalhada do currentReading
    if (currentReading === undefined || currentReading === null || currentReading === '') {
      console.log('Current Reading is invalid:', currentReading);
      return next(new ErrorResponse('A leitura atual é obrigatória', 400));
    }

    // Converter para número e validar
    const parsedReading = parseFloat(currentReading);
    if (isNaN(parsedReading)) {
      console.log('Failed to parse currentReading:', currentReading);
      return next(new ErrorResponse('A leitura atual deve ser um número válido', 400));
    }

    // Validação do ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new ErrorResponse('ID da leitura inválido', 400));
    }

    // Buscar leitura existente
    const reading = await Reading.findById(id).session(session);
    if (!reading) {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse('Leitura não encontrada', 404));
    }

    // Buscar entidades relacionadas com validação
    const connection = await Connection.findById(reading.connectionId).session(session);
    if (!connection) {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse('Conexão não encontrada', 404));
    }

    // Agora que temos a conexão, podemos buscar o sistema
    const system = await System.findById(connection.system).session(session);
    if (!system) {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse('Sistema não encontrado', 404));
    }

    // Buscar o cliente e a fatura em paralelo, já que não dependem um do outro
    const [customer, invoice] = await Promise.all([
      Customer.findById(reading.customerId).session(session),
      Invoice.findOne({ reading: reading._id }).session(session)
    ]);

    // Validar cliente
    if (!customer) {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse('Cliente não encontrado', 404));
    }

    // Validar fatura
    if (!invoice) {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse('Fatura não encontrada', 404));
    }

    // Guardar dados antigos para auditoria
    const oldReadingData = {
      currentReading: reading.currentReading,
      consumption: reading.consumption,
      notes: reading.notes,
      createdBy: req.user?._id
    };

    // Validação da leitura anterior
    const previousReading = reading.previousReading;
    const consumption = parsedReading - previousReading;

    if (consumption < 0) {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse('A leitura atual não pode ser menor que a leitura anterior', 400));
    }

    // Validar valores negativos ou zerados
    if (parsedReading <= 0) {
      return next(new ErrorResponse('A leitura atual deve ser maior que zero', 400));
    }

    // Validar consumo anormal
    const averageConsumption = await calculateAverageConsumption(connectionId);
    if (consumption > averageConsumption * 3) {
      // Registrar alerta de consumo anormal
      logAuditInfo('ALERT', 'Reading', reading._id, req.user._id, null, {
        message: 'Consumo muito acima da média',
        consumption,
        averageConsumption
      });
    }

    // Cálculo atualizado usando a função utilitária
    const totalAmount = calculateTariff(connection, system, consumption);
    const taxAmount = roundMoney(totalAmount * 0.12);
    const totalAmountWithTax = roundMoney(totalAmount + taxAmount);

    console.log('Valor base calculado:', roundMoney(totalAmount));
    console.log('Imposto calculado (12%):', roundMoney(taxAmount));
    console.log('Valor total com imposto:', roundMoney(totalAmountWithTax));

    // Verifica diferença de crédito usado antes
    const previousCreditUsed = roundMoney(invoice.availableCreditUsed);
    let newCreditUsed = 0;
    let newRemainingDebt = totalAmountWithTax;
    console.log('Crédito usado na fatura anterior:', roundMoney(previousCreditUsed));

    if (previousCreditUsed > 0) {
      console.log('== Processando ajuste de crédito ==');

      // Buscar o valor real do pagamento
      const payment = await Payment.findOne({ invoiceId: invoice._id }).session(session);
      const realPreviousCreditUsed = payment ? roundMoney(payment.amount) : roundMoney(previousCreditUsed);

      console.log('Valor real do pagamento anterior:', roundMoney(realPreviousCreditUsed));
      console.log('Crédito disponível antes do ajuste:', roundMoney(customer.availableCredit));

      // Se o novo valor total for menor que o crédito usado anteriormente
      if (totalAmountWithTax < realPreviousCreditUsed) {
        // Calculamos a diferença a ser devolvida ao cliente
        const creditToReturn = roundMoney(realPreviousCreditUsed - totalAmountWithTax);
        console.log('Novo valor menor que crédito anterior. Diferença a devolver:', roundMoney(creditToReturn));

        newCreditUsed = roundMoney(totalAmountWithTax);
        newRemainingDebt = 0;

        // Devolvemos o crédito excedente
        const oldCredit = roundMoney(customer.availableCredit);
        customer.availableCredit = roundMoney(customer.availableCredit + creditToReturn);
        console.log('Crédito atualizado após devolução:', roundMoney(oldCredit), '+', roundMoney(creditToReturn), '=', roundMoney(customer.availableCredit));
      } else if (Math.abs(totalAmountWithTax - realPreviousCreditUsed) < 0.01) {
        // Tolerância para problemas de arredondamento
        console.log('Valores iguais, mantendo mesmo crédito usado');
        newCreditUsed = roundMoney(totalAmountWithTax);
        newRemainingDebt = 0;
      } else {
        console.log('Novo valor maior que crédito anterior');
        // Calcular a diferença adicional a ser paga
        const valorAdicional = roundMoney(totalAmountWithTax - realPreviousCreditUsed);
        console.log('Valor adicional necessário:', roundMoney(valorAdicional));

        // Usar todo o crédito anterior
        newCreditUsed = roundMoney(realPreviousCreditUsed);

        // Se o cliente tem crédito disponível, usar para cobrir o valor adicional
        if (customer.availableCredit > 0) {
          console.log('Cliente tem crédito disponível:', roundMoney(customer.availableCredit));

          // Calcular quanto do crédito disponível será usado
          const creditoAdicionalUsado = roundMoney(Math.min(valorAdicional, customer.availableCredit));
          console.log('Usando crédito adicional:', roundMoney(creditoAdicionalUsado));

          // Adicionar ao crédito usado e subtrair do crédito disponível
          newCreditUsed = roundMoney(newCreditUsed + creditoAdicionalUsado);
          customer.availableCredit = roundMoney(customer.availableCredit - creditoAdicionalUsado);

          console.log('Crédito disponível após uso:', roundMoney(customer.availableCredit));
          console.log('Total de crédito usado na fatura:', roundMoney(newCreditUsed));
        }

        // Calcular valor restante a pagar
        newRemainingDebt = roundMoney(totalAmountWithTax - newCreditUsed);
        console.log('Valor restante a pagar:', roundMoney(newRemainingDebt));
      }

      await customer.save({ session });
      console.log('Crédito após salvar:', roundMoney(customer.availableCredit));
    } else {
      console.log('Não havia crédito usado na fatura anterior');
    }

    // Atualizar leitura com validação
    try {
      reading.currentReading = parsedReading;
      reading.consumption = consumption;
      reading.notes = notes || reading.notes; // Manter notas antigas se não fornecidas
      await reading.save({ session });
    } catch (validationError) {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse(`Erro de validação: ${validationError.message}`, 400));
    }

    // Atualizar fatura
    console.log('Atualizando fatura. Valores antigos:', {
      baseAmount: roundMoney(invoice.baseAmount),
      taxAmount: roundMoney(invoice.taxAmount),
      totalAmount: roundMoney(invoice.totalAmount),
      availableCreditUsed: roundMoney(invoice.availableCreditUsed),
      remainingDebt: roundMoney(invoice.remainingDebt),
      status: invoice.status
    });

    invoice.baseAmount = totalAmount;
    invoice.taxAmount = taxAmount;
    invoice.totalAmount = newRemainingDebt;
    invoice.availableCreditUsed = newCreditUsed;
    invoice.remainingDebt = newRemainingDebt;
    invoice.status = newRemainingDebt === 0 ? 'Pago' : 'Pago parcial';

    console.log('Novos valores da fatura:', {
      baseAmount: roundMoney(invoice.baseAmount),
      taxAmount: roundMoney(invoice.taxAmount),
      totalAmount: roundMoney(invoice.totalAmount),
      availableCreditUsed: roundMoney(invoice.availableCreditUsed),
      remainingDebt: roundMoney(invoice.remainingDebt),
      status: invoice.status
    });

    await invoice.save({ session });

    // Atualizar pagamento, se houver
    const payment = await Payment.findOne({ invoiceId: invoice._id }).session(session);
    if (payment) {
      const oldPaymentAmount = roundMoney(payment.amount);
      console.log('Pagamento encontrado. Valor antigo:', roundMoney(payment.amount));
      payment.amount = newCreditUsed;
      console.log('Novo valor de pagamento:', roundMoney(payment.amount));
      await payment.save({ session });

      // Registrar log de auditoria para o pagamento
      logAuditInfo('UPDATE', 'Payment', payment._id, req.user._id,
        { amount: oldPaymentAmount },
        { amount: roundMoney(payment.amount) }
      );
    } else {
      console.log('Nenhum pagamento encontrado para atualizar');
    }

    // Registrar logs de auditoria
    logAuditInfo('UPDATE', 'Reading', reading._id, req.user._id, oldReadingData, {
      currentReading,
      consumption,
      notes
    });

    logAuditInfo('UPDATE', 'Customer', customer._id, req.user._id,
      { availableCredit: roundMoney(customer.availableCredit) },
      { availableCredit: roundMoney(customer.availableCredit) }
    );

    logAuditInfo('UPDATE', 'Invoice', invoice._id, req.user._id,
      {
        baseAmount: roundMoney(invoice.baseAmount),
        taxAmount: roundMoney(invoice.taxAmount),
        totalAmount: roundMoney(invoice.totalAmount),
        availableCreditUsed: roundMoney(invoice.availableCreditUsed),
        remainingDebt: roundMoney(invoice.remainingDebt),
        status: invoice.status
      },
      {
        baseAmount: roundMoney(invoice.baseAmount),
        taxAmount: roundMoney(invoice.taxAmount),
        totalAmount: roundMoney(invoice.totalAmount),
        availableCreditUsed: roundMoney(invoice.availableCreditUsed),
        remainingDebt: roundMoney(invoice.remainingDebt),
        status: invoice.status
      }
    );

    // Adicionar sistema de versionamento para rastrear mudanças
    const readingHistory = {
      readingId: reading._id,
      userId: req.user._id,
      changeType: 'UPDATE',
      oldValue: oldReadingData,
      newValue: {
        currentReading,
        consumption,
        notes
      },
      timestamp: new Date()
    };

    console.log('=== FIM DOS CÁLCULOS DE ATUALIZAÇÃO ===');

    // Commit da transação
    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: 'Leitura, fatura e pagamento atualizados com sucesso',
      data: reading
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Erro detalhado:', error);
    
    // Melhor tratamento de erros específicos
    if (error.name === 'ValidationError') {
      return next(new ErrorResponse(`Erro de validação: ${error.message}`, 400));
    }
    if (error.name === 'CastError') {
      return next(new ErrorResponse('Formato de dados inválido', 400));
    }
    
    next(new ErrorResponse('Erro ao atualizar leitura. Por favor, tente novamente.', 500));
  }
});

exports.deleteReading = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  // Validar ID
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new ErrorResponse('ID inválido', 400));
  }

  // Iniciar uma sessão para a transação
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Buscar leitura
    const reading = await Reading.findById(id).session(session);
    if (!reading) {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse('Leitura não encontrada', 404));
    }

    // Buscar fatura associada
    const invoice = await Invoice.findOne({ reading: reading._id }).session(session);
    if (invoice) {
      // Verificar pagamentos existentes
      const payments = await Payment.find({ invoiceId: invoice._id }).session(session);

      // Cancelar pagamentos, se existirem
      for (const payment of payments) {
        // Lógica para estornar o pagamento ou ajustar o crédito do cliente
        const customer = await Customer.findById(payment.customerId).session(session);
        if (customer) {
          const oldCredit = roundMoney(customer.availableCredit);
          const paymentAmount = roundMoney(payment.amount);
          customer.availableCredit = roundMoney(customer.availableCredit + paymentAmount); // Reverter o crédito

          console.log(`Estornando pagamento: ${paymentAmount} para o cliente ${customer.name}`);
          console.log(`Crédito antes: ${oldCredit}, Crédito depois: ${roundMoney(customer.availableCredit)}`);

          await customer.save({ session }); // Salvar com a sessão

          // Registrar log de auditoria para o cliente
          logAuditInfo('UPDATE', 'Customer', customer._id, req.user ? req.user._id : 'system',
            { availableCredit: oldCredit },
            { availableCredit: roundMoney(customer.availableCredit) }
          );
        }

        // Registrar log de auditoria para o pagamento
        logAuditInfo('DELETE', 'Payment', payment._id, req.user ? req.user._id : 'system',
          { amount: roundMoney(payment.amount), customerId: payment.customerId },
          null
        );

        await payment.remove({ session }); // Remover o pagamento com a sessão
      }

      // Registrar log de auditoria para a fatura
      logAuditInfo('DELETE', 'Invoice', invoice._id, req.user ? req.user._id : 'system',
        {
          baseAmount: roundMoney(invoice.baseAmount),
          taxAmount: roundMoney(invoice.taxAmount),
          totalAmount: roundMoney(invoice.totalAmount)
        },
        null
      );

      await invoice.remove({ session }); // Remover a fatura com a sessão
    }

    // Registrar log de auditoria para a leitura
    logAuditInfo('DELETE', 'Reading', reading._id, req.user ? req.user._id : 'system',
      {
        code: reading.code,
        currentReading: reading.currentReading,
        consumption: reading.consumption
      },
      null
    );

    await reading.remove({ session }); // Remover a leitura com a sessão

    // Confirmar a transação
    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: 'Leitura, fatura e pagamentos cancelados com sucesso'
    });
  } catch (error) {
    // Se ocorrer um erro, abortar a transação
    await session.abortTransaction();
    session.endSession();
    console.error('ERRO:', error);
    next(new ErrorResponse('Erro ao cancelar leitura', 500));
  }
});

exports.getReadingsByCompany = asyncHandler(async (req, res, next) => {
  try {
    const { companyId } = req.params; // Obter companyId dos parâmetros da URL
    const pageSize = req.query.pageSize || 10;
    const pageNumber = req.query.pageNumber || 1;
    const searchTerm = req.query.searchTerm;
    const sortBy = req.query.sortBy || 'date';
    const sortOrder = req.query.sortOrder || 'asc';

    // Verificar se o ID da empresa é válido
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      return next(new ErrorResponse('ID da empresa inválido', 400));
    }

    // Construir query
    const query = { company: companyId }; // Filtrar por empresa

    // Adicionar critérios de busca
    if (searchTerm) {
      query.$or = [
        { notes: { $regex: searchTerm, $options: 'i' } },
        { currentReading: { $regex: searchTerm, $options: 'i' } }
      ];
    }

    // Validar campo de ordenação
    const validSortFields = ['date', 'currentReading', 'customerId'];
    if (!validSortFields.includes(sortBy)) {
      return next(new ErrorResponse('Campo de ordenação inválido', 400));
    }

    // Configurar ordenação
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Contar total de documentos
    const totalCount = await Reading.countDocuments(query);

    // Buscar leituras com paginação
    const readings = await Reading.find(query)
      .populate('customerId', 'name')
      .populate('company', 'name')
      .populate('createdBy', 'name')
      .sort(sortOptions)
      .skip((pageNumber - 1) * pageSize)
      .limit(parseInt(pageSize))
      .lean();

    res.status(200).json({
      success: true,
      data: readings,
      pagination: {
        total: totalCount,
        pageSize: parseInt(pageSize),
        currentPage: parseInt(pageNumber),
        totalPages: Math.ceil(totalCount / pageSize)
      }
    });
  } catch (error) {
    console.error(error);
    next(new ErrorResponse('Erro ao listar leituras por empresa', 500));
  }
});

exports.getReadingsByCustomer = asyncHandler(async (req, res, next) => {
  try {
    const { customerId } = req.params; // Obter customerId dos parâmetros da URL
    const pageSize = req.query.pageSize || 10;
    const pageNumber = req.query.pageNumber || 1;
    const searchTerm = req.query.searchTerm;
    const sortBy = req.query.sortBy || 'date';
    const sortOrder = req.query.sortOrder || 'asc';

    // Verificar se o ID do cliente é válido
    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return next(new ErrorResponse('ID do cliente inválido', 400));
    }

    // Construir query
    const query = { customerId }; // Filtrar por cliente

    // Adicionar critérios de busca
    if (searchTerm) {
      query.$or = [
        { notes: { $regex: searchTerm, $options: 'i' } },
        { currentReading: { $regex: searchTerm, $options: 'i' } }
      ];
    }

    // Validar campo de ordenação
    const validSortFields = ['date', 'currentReading', 'customerId'];
    if (!validSortFields.includes(sortBy)) {
      return next(new ErrorResponse('Campo de ordenação inválido', 400));
    }

    // Configurar ordenação
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Contar total de documentos
    const totalCount = await Reading.countDocuments(query);

    // Buscar leituras com paginação
    const readings = await Reading.find(query)
      .populate('customerId', 'name')
      .populate('company', 'name')
      .populate('createdBy', 'name')
      .sort(sortOptions)
      .skip((pageNumber - 1) * pageSize)
      .limit(parseInt(pageSize))
      .lean();

    res.status(200).json({
      success: true,
      data: readings,
      pagination: {
        total: totalCount,
        pageSize: parseInt(pageSize),
        currentPage: parseInt(pageNumber),
        totalPages: Math.ceil(totalCount / parseInt(pageSize))
      }
    });
  } catch (error) {
    console.error(error);
    next(new ErrorResponse('Erro ao listar leituras por cliente', 500));
  }
});

exports.cancelReading = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  // Validar ID
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new ErrorResponse('ID inválido', 400));
  }

  // Iniciar uma sessão para a transação
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Buscar leitura
    const reading = await Reading.findById(id).session(session);
    if (!reading) {
      return next(new ErrorResponse('Leitura não encontrada', 404));
    }

    // Buscar fatura associada
    const invoice = await Invoice.findOne({ reading: reading._id }).session(session);
    if (invoice) {
      // Verificar pagamentos existentes
      const payments = await Payment.find({ invoiceId: invoice._id }).session(session);

      // Cancelar pagamentos, se existirem
      for (const payment of payments) {
        // Lógica para estornar o pagamento ou ajustar o crédito do cliente
        const customer = await Customer.findById(payment.customerId).session(session);
        if (customer) {
          customer.availableCredit += payment.amount; // Reverter o crédito
          await customer.save({ session }); // Salvar com a sessão
        }
        await payment.remove({ session }); // Remover o pagamento com a sessão
      }

      await invoice.remove({ session }); // Remover a fatura com a sessão
    }

    await reading.remove({ session }); // Remover a leitura com a sessão

    // Confirmar a transação
    await session.commitTransaction();
    res.status(200).json({ success: true, message: 'Leitura, fatura e pagamentos cancelados com sucesso' });
  } catch (error) {
    // Se ocorrer um erro, abortar a transação
    await session.abortTransaction();
    console.error(error);
    next(new ErrorResponse('Erro ao cancelar leitura', 500));
  } finally {
    // Encerrar a sessão
    session.endSession();
  }
});

// Adicionar nova função de exportação
exports.exportReadings = asyncHandler(async (req, res, next) => {
  try {
    const { format, dateRange, customerId, connectionId } = req.query;
    
    // Construir query
    const query = {};
    if (customerId) query.customerId = customerId;
    if (connectionId) query.connectionId = connectionId;
    if (dateRange) {
      const [startDate, endDate] = dateRange.split(',');
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Buscar dados
    const readings = await Reading.find(query)
      .populate('customerId', 'name')
      .populate('connectionId', 'category')
      .lean();

    // Definir campos para exportação
    const fields = [
      { label: 'Código', value: 'code' },
      { label: 'Cliente', value: 'customerId.name' },
      { label: 'Leitura Atual', value: 'currentReading' },
      { label: 'Consumo', value: 'consumption' },
      { label: 'Data', value: 'date' }
    ];

    let result;
    let contentType;
    let fileName;

    switch (format.toLowerCase()) {
      case 'excel':
        result = await exportToExcel(readings, fields);
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        fileName = 'readings.xlsx';
        break;
      case 'pdf':
        result = await exportToPDF(readings, fields);
        contentType = 'application/pdf';
        fileName = 'readings.pdf';
        break;
      case 'csv':
        result = await exportToCSV(readings, fields);
        contentType = 'text/csv';
        fileName = 'readings.csv';
        break;
      default:
        return next(new ErrorResponse('Formato de exportação inválido', 400));
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    res.send(result);
  } catch (error) {
    console.error(error);
    next(new ErrorResponse('Erro ao exportar leituras', 500));
  }
});

exports.getAllInvoices = asyncHandler(async (req, res, next) => {
  try {
    const {
      page = 1,
      pageSize = 10,
      searchTerm,
      startDate,
      endDate,
      status,
      sortBy = 'updatedAt',
      sortOrder = 'desc'
    } = req.query;

    // Construir a query do MongoDB
    const query = {};

    // Filtro de empresa para não-admin
    if (req.user.role !== 'admin') {
      query.company = req.user.company;
    }

    // Melhorar a lógica de busca com searchTerm
    if (searchTerm) {
      // Primeiro, buscar clientes que correspondam ao termo de pesquisa
      const customers = await Customer.find({
        name: { $regex: searchTerm, $options: 'i' }
      }).select('_id');
      
      const customerIds = customers.map(c => c._id);

      // Construir condições de busca
      query.$or = [
        { invoiceNumber: { $regex: searchTerm, $options: 'i' } },  // Buscar por número da fatura
        { status: { $regex: searchTerm, $options: 'i' } },         // Buscar por status
        { customer: { $in: customerIds } }                         // Buscar por IDs dos clientes encontrados
      ];

      // Se o termo de busca for um número, incluir busca por valores numéricos
      const numericSearch = parseFloat(searchTerm);
      if (!isNaN(numericSearch)) {
        query.$or.push(
          { amount: numericSearch }
        );
      }
    }

    // Validar campos de ordenação
    const validSortFields = ['createdAt', 'dueDate', 'amount', 'status', 'invoiceNumber'];
    const sanitizedSortBy = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sanitizedSortOrder = ['asc', 'desc'].includes(sortOrder.toLowerCase()) ? sortOrder : 'desc';

    // Executar queries em paralelo
    const [invoices, total] = await Promise.all([
      Invoice.find(query)
        .populate('customer', 'name code phone email')
        .populate({
          path: 'customerInfraction',
          populate: {
            path: 'infractionType',
            select: 'reason defaultValue'
          }
        })
        .populate('company', 'name')
        .populate('createdBy', 'name email')
        .sort({ [sanitizedSortBy]: sanitizedSortOrder === 'desc' ? -1 : 1 })
        .skip((parseInt(page) - 1) * parseInt(pageSize))
        .limit(parseInt(pageSize))
        .lean(),
      Invoice.countDocuments(query)
    ]);

    // Formatar os dados das faturas
    const formattedInvoices = invoices.map(invoice => ({
      id: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      customer: {
        name: invoice.customer?.name,
        code: invoice.customer?.code,
        phone: invoice.customer?.phone,
        email: invoice.customer?.email
      },
      infraction: {
        type: invoice.customerInfraction?.infractionType?.reason,
        value: invoice.customerInfraction?.infractionType?.defaultValue
      },
      amount: invoice.amount,
      status: invoice.status,
      dueDate: invoice.dueDate,
      paymentDate: invoice.paymentDate,
      paymentMethod: invoice.paymentMethod,
      observations: invoice.observations,
      createdBy: {
        name: invoice.createdBy?.name,
        email: invoice.createdBy?.email
      },
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt
    }));

    return res.status(200).json({
      success: true,
      data: formattedInvoices,
      pagination: {
        currentPage: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / parseInt(pageSize)),
        totalCount: total
      }
    });

  } catch (error) {
    console.error('Error in getAllInvoices:', error);
    return next(new ErrorResponse('Erro ao buscar faturas', 500));
  }
});

exports.getUnpaidInvoicesByCustomer = asyncHandler(async (req, res, next) => {
  try {
    const { customerId } = req.params;
    const {
      page = 1,
      pageSize = 10,
      searchTerm,
      startDate,
      endDate,
      sortBy = 'dueDate',
      sortOrder = 'asc'
    } = req.query;

    // Validar ID do cliente
    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return next(new ErrorResponse('ID do cliente inválido', 400));
    }

    // Construir query base
    const baseQuery = {
      customer: customerId,
      status: { $ne: 'pago' },
      remainingDebt: { $gt: 0 }
    };

    // Adicionar filtros de pesquisa
    if (searchTerm) {
      const connections = await Connection.find({
        $or: [
          { code: { $regex: searchTerm, $options: 'i' } },
          { meterNumber: { $regex: searchTerm, $options: 'i' } }
        ]
      }).select('_id');
      
      const connectionIds = connections.map(c => c._id);

      baseQuery.$or = [
        { invoiceYearMonth: { $regex: searchTerm, $options: 'i' } },
        { status: { $regex: searchTerm, $options: 'i' } },
        { connection: { $in: connectionIds } }
      ];

      // Se o termo de busca for um número, incluir busca por valores
      const numericSearch = parseFloat(searchTerm);
      if (!isNaN(numericSearch)) {
        baseQuery.$or.push(
          { totalAmount: numericSearch },
          { baseAmount: numericSearch },
          { taxAmount: numericSearch },
          { remainingDebt: numericSearch }
        );
      }
    }

    // Filtrar por data
    if (startDate || endDate) {
      baseQuery.dateIssued = {};
      if (startDate) {
        baseQuery.dateIssued.$gte = new Date(startDate);
      }
      if (endDate) {
        baseQuery.dateIssued.$lte = new Date(endDate);
      }
    }

    // Validar campos de ordenação
    const validSortFields = ['dueDate', 'totalAmount', 'status', 'invoiceYearMonth', 'remainingDebt'];
    const sanitizedSortBy = validSortFields.includes(sortBy) ? sortBy : 'dueDate';
    const sanitizedSortOrder = ['asc', 'desc'].includes(sortOrder.toLowerCase()) ? sortOrder : 'asc';

    // Calcular skip para paginação
    const skip = (parseInt(page) - 1) * parseInt(pageSize);

    // Executar queries em paralelo
    const [unpaidInvoices, total] = await Promise.all([
      Invoice.find(baseQuery)
        .populate({
          path: 'customer',
          select: 'name code phone email address'
        })
        .populate({
          path: 'connection',
          select: 'category code meterNumber address'
        })
        .populate({
          path: 'reading',
          select: 'currentReading previousReading consumption date code'
        })
        .populate({
          path: 'payments',
          select: 'amount date paymentMethod status'
        })
        .sort({ [sanitizedSortBy]: sanitizedSortOrder === 'desc' ? -1 : 1 })
        .skip(skip)
        .limit(parseInt(pageSize))
        .lean(),
      Invoice.countDocuments(baseQuery)
    ]);

    // Calcular estatísticas
    const statistics = {
      totalUnpaidInvoices: total,
      totalDebt: roundMoney(unpaidInvoices.reduce((sum, invoice) => sum + invoice.remainingDebt, 0)),
      byCategory: unpaidInvoices.reduce((acc, invoice) => {
        const category = invoice.connection.category;
        if (!acc[category]) {
          acc[category] = {
            count: 0,
            total: 0
          };
        }
        acc[category].count++;
        acc[category].total = roundMoney(acc[category].total + invoice.remainingDebt);
        return acc;
      }, {})
    };

    // Formatar os dados das faturas
    const formattedInvoices = unpaidInvoices.map(invoice => ({
      id: invoice._id,
      invoiceNumber: invoice.code,
      customer: {
        name: invoice.customer.name,
        code: invoice.customer.code,
        phone: invoice.customer.phone,
        email: invoice.customer.email,
        address: invoice.customer.address
      },
      connection: {
        code: invoice.connection.code,
        category: invoice.connection.category,
        meterNumber: invoice.connection.meterNumber,
        address: invoice.connection.address
      },
      reading: {
        code: invoice.reading.code,
        date: invoice.reading.date,
        consumption: invoice.reading.consumption,
        currentReading: invoice.reading.currentReading,
        previousReading: invoice.reading.previousReading
      },
      amount: roundMoney(invoice.totalAmount),
      remainingDebt: roundMoney(invoice.remainingDebt),
      status: invoice.status,
      dueDate: invoice.dueDate,
      invoiceYearMonth: invoice.invoiceYearMonth,
      daysPastDue: Math.max(0, Math.floor((new Date() - new Date(invoice.dueDate)) / (1000 * 60 * 60 * 24))),
      payments: invoice.payments.map(payment => ({
        amount: roundMoney(payment.amount),
        date: payment.date,
        method: payment.paymentMethod,
        status: payment.status
      }))
    }));

    // Log para debug
    console.log('Search Results:', {
      customerId,
      searchTerm,
      totalFound: unpaidInvoices.length,
      totalInDatabase: total,
      currentPage: page,
      resultsPerPage: pageSize
    });

    return res.status(200).json({
      success: true,
      message: 'Faturas não pagas encontradas com sucesso',
      data: formattedInvoices,
      statistics,
      pagination: {
        currentPage: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / parseInt(pageSize)),
        totalCount: total
      },
      filters: {
        searchTerm,
        startDate,
        endDate,
        sortBy: sanitizedSortBy,
        sortOrder: sanitizedSortOrder
      }
    });

  } catch (error) {
    console.error('Erro ao buscar faturas não pagas:', error);
    return next(new ErrorResponse('Erro ao buscar faturas não pagas', 500));
  }
});

// Método para obter histórico de consumo
exports.getConsumptionHistory = asyncHandler(async (req, res, next) => {
  try {
    const { customerId } = req.params;
    const {
      page = 1,
      pageSize = 12, // Padrão de 12 para mostrar um ano
      searchTerm,
      startDate,
      endDate,
      sortBy = 'date',
      sortOrder = 'desc',
      connectionId // Opcional, para filtrar por conexão específica
    } = req.query;

    // Validar ID do cliente
    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return next(new ErrorResponse('ID do cliente inválido', 400));
    }

    // Construir query base
    const baseQuery = {
      customerId: customerId
    };

    // Adicionar filtro de conexão se fornecido
    if (connectionId) {
      if (!mongoose.Types.ObjectId.isValid(connectionId)) {
        return next(new ErrorResponse('ID da conexão inválido', 400));
      }
      baseQuery.connectionId = connectionId;
    }

    // Adicionar filtros de data
    if (startDate || endDate) {
      baseQuery.date = {};
      if (startDate) {
        baseQuery.date.$gte = new Date(startDate);
      }
      if (endDate) {
        baseQuery.date.$lte = new Date(endDate);
      }
    }

    // Adicionar filtros de pesquisa
    if (searchTerm) {
      const numericSearch = parseFloat(searchTerm);
      if (!isNaN(numericSearch)) {
        baseQuery.$or = [
          { currentReading: numericSearch },
          { previousReading: numericSearch },
          { consumption: numericSearch }
        ];
      }
    }

    // Validar campos de ordenação
    const validSortFields = ['date', 'consumption', 'currentReading', 'previousReading'];
    const sanitizedSortBy = validSortFields.includes(sortBy) ? sortBy : 'date';
    const sanitizedSortOrder = ['asc', 'desc'].includes(sortOrder.toLowerCase()) ? sortOrder : 'desc';

    // Calcular skip para paginação
    const skip = (parseInt(page) - 1) * parseInt(pageSize);

    // Executar queries em paralelo
    const [readings, total] = await Promise.all([
      Reading.find(baseQuery)
        .populate({
          path: 'connectionId',
          select: 'category code meterNumber address'
        })
        .populate({
          path: 'company',
          select: 'name code'
        })
        .sort({ [sanitizedSortBy]: sanitizedSortOrder === 'desc' ? -1 : 1 })
        .skip(skip)
        .limit(parseInt(pageSize))
        .lean(),
      Reading.countDocuments(baseQuery)
    ]);

    // Calcular estatísticas de consumo
    const consumptionStats = {
      average: readings.length > 0 
        ? roundMoney(readings.reduce((sum, r) => sum + r.consumption, 0) / readings.length)
        : 0,
      highest: readings.length > 0 
        ? Math.max(...readings.map(r => r.consumption))
        : 0,
      lowest: readings.length > 0 
        ? Math.min(...readings.map(r => r.consumption))
        : 0,
      total: readings.length > 0 
        ? readings.reduce((sum, r) => sum + r.consumption, 0)
        : 0
    };

    // Formatar os dados das leituras
    const formattedReadings = readings.map(reading => ({
      id: reading._id,
      date: reading.date,
      previousReading: reading.previousReading,
      currentReading: reading.currentReading,
      consumption: reading.consumption,
      connection: {
        code: reading.connectionId.code,
        category: reading.connectionId.category,
        meterNumber: reading.connectionId.meterNumber,
        address: reading.connectionId.address
      },
      notes: reading.notes,
      monthYear: reading.date.toISOString().slice(0, 7)
    }));

    return res.status(200).json({
      success: true,
      message: 'Histórico de consumo encontrado com sucesso',
      data: formattedReadings,
      statistics: consumptionStats,
      pagination: {
        currentPage: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / parseInt(pageSize)),
        totalCount: total
      },
      filters: {
        searchTerm,
        startDate,
        endDate,
        connectionId,
        sortBy: sanitizedSortBy,
        sortOrder: sanitizedSortOrder
      }
    });

  } catch (error) {
    console.error('Erro ao buscar histórico de consumo:', error);
    return next(new ErrorResponse('Erro ao buscar histórico de consumo', 500));
  }
});

// Método para obter histórico de pagamentos
exports.getPaymentHistory = asyncHandler(async (req, res, next) => {
  try {
    const { customerId } = req.params;
    const {
      page = 1,
      pageSize = 10,
      searchTerm,
      startDate,
      endDate,
      sortBy = 'date',
      sortOrder = 'desc',
      paymentMethod, // Opcional, para filtrar por método de pagamento
      status // Opcional, para filtrar por status
    } = req.query;

    // Validar ID do cliente
    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return next(new ErrorResponse('ID do cliente inválido', 400));
    }

    // Construir query base
    const baseQuery = {
      customerId: customerId
    };

    // Adicionar filtros de método de pagamento e status
    if (paymentMethod) {
      baseQuery.paymentMethod = paymentMethod;
    }
    if (status) {
      baseQuery.status = status;
    }

    // Adicionar filtros de data
    if (startDate || endDate) {
      baseQuery.date = {};
      if (startDate) {
        baseQuery.date.$gte = new Date(startDate);
      }
      if (endDate) {
        baseQuery.date.$lte = new Date(endDate);
      }
    }

    // Adicionar filtros de pesquisa
    if (searchTerm) {
      const numericSearch = parseFloat(searchTerm);
      if (!isNaN(numericSearch)) {
        baseQuery.$or = [
          { amount: numericSearch }
        ];
      } else {
        baseQuery.$or = [
          { paymentMethod: { $regex: searchTerm, $options: 'i' } },
          { notes: { $regex: searchTerm, $options: 'i' } }
        ];
      }
    }

    // Validar campos de ordenação
    const validSortFields = ['date', 'amount', 'paymentMethod', 'status'];
    const sanitizedSortBy = validSortFields.includes(sortBy) ? sortBy : 'date';
    const sanitizedSortOrder = ['asc', 'desc'].includes(sortOrder.toLowerCase()) ? sortOrder : 'desc';

    // Calcular skip para paginação
    const skip = (parseInt(page) - 1) * parseInt(pageSize);

    // Executar queries em paralelo
    const [payments, total] = await Promise.all([
      Payment.find(baseQuery)
        .populate({
          path: 'invoiceId',
          select: 'code baseAmount taxAmount totalAmount dueDate invoiceYearMonth',
          populate: {
            path: 'reading',
            select: 'consumption date code'
          }
        })
        .sort({ [sanitizedSortBy]: sanitizedSortOrder === 'desc' ? -1 : 1 })
        .skip(skip)
        .limit(parseInt(pageSize))
        .lean(),
      Payment.countDocuments(baseQuery)
    ]);

    // Calcular estatísticas de pagamento
    const paymentStats = {
      totalAmount: roundMoney(payments.reduce((sum, p) => sum + p.amount, 0)),
      averageAmount: payments.length > 0 
        ? roundMoney(payments.reduce((sum, p) => sum + p.amount, 0) / payments.length)
        : 0,
      byMethod: payments.reduce((acc, payment) => {
        const method = payment.paymentMethod;
        if (!acc[method]) {
          acc[method] = {
            count: 0,
            total: 0
          };
        }
        acc[method].count++;
        acc[method].total = roundMoney(acc[method].total + payment.amount);
        return acc;
      }, {}),
      byStatus: payments.reduce((acc, payment) => {
        const status = payment.status;
        if (!acc[status]) {
          acc[status] = {
            count: 0,
            total: 0
          };
        }
        acc[status].count++;
        acc[status].total = roundMoney(acc[status].total + payment.amount);
        return acc;
      }, {})
    };

    // Formatar os dados dos pagamentos
    const formattedPayments = payments.map(payment => ({
      id: payment._id,
      date: payment.date,
      amount: roundMoney(payment.amount),
      paymentMethod: payment.paymentMethod,
      status: payment.status,
      notes: payment.notes,
      invoice: payment.invoiceId ? {
        code: payment.invoiceId.code,
        baseAmount: roundMoney(payment.invoiceId.baseAmount),
        taxAmount: roundMoney(payment.invoiceId.taxAmount),
        totalAmount: roundMoney(payment.invoiceId.totalAmount),
        dueDate: payment.invoiceId.dueDate,
        invoiceYearMonth: payment.invoiceId.invoiceYearMonth,
        reading: payment.invoiceId.reading ? {
          code: payment.invoiceId.reading.code,
          consumption: payment.invoiceId.reading.consumption,
          date: payment.invoiceId.reading.date
        } : null
      } : null
    }));

    return res.status(200).json({
      success: true,
      message: 'Histórico de pagamentos encontrado com sucesso',
      data: formattedPayments,
      statistics: paymentStats,
      pagination: {
        currentPage: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / parseInt(pageSize)),
        totalCount: total
      },
      filters: {
        searchTerm,
        startDate,
        endDate,
        paymentMethod,
        status,
        sortBy: sanitizedSortBy,
        sortOrder: sanitizedSortOrder
      }
    });

  } catch (error) {
    console.error('Erro ao buscar histórico de pagamentos:', error);
    return next(new ErrorResponse('Erro ao buscar histórico de pagamentos', 500));
  }
});

// Método para obter histórico de consumo por conexão
exports.getConsumptionHistoryByConnection = asyncHandler(async (req, res, next) => {
  try {
    const { connectionId } = req.params;
    const {
      page = 1,
      pageSize = 12,
      searchTerm,
      startDate,
      endDate,
      sortBy = 'date',
      sortOrder = 'desc'
    } = req.query;

    // Validar ID da conexão
    if (!mongoose.Types.ObjectId.isValid(connectionId)) {
      return next(new ErrorResponse('ID da conexão inválido', 400));
    }

    // Construir query base
    const baseQuery = {
      connectionId: connectionId
    };

    // Adicionar filtros de data
    if (startDate || endDate) {
      baseQuery.date = {};
      if (startDate) {
        baseQuery.date.$gte = new Date(startDate);
      }
      if (endDate) {
        baseQuery.date.$lte = new Date(endDate);
      }
    }

    // Adicionar filtros de pesquisa
    if (searchTerm) {
      const numericSearch = parseFloat(searchTerm);
      if (!isNaN(numericSearch)) {
        baseQuery.$or = [
          { currentReading: numericSearch },
          { previousReading: numericSearch },
          { consumption: numericSearch }
        ];
      }
    }

    // Validar campos de ordenação
    const validSortFields = ['date', 'consumption', 'currentReading', 'previousReading'];
    const sanitizedSortBy = validSortFields.includes(sortBy) ? sortBy : 'date';
    const sanitizedSortOrder = ['asc', 'desc'].includes(sortOrder.toLowerCase()) ? sortOrder : 'desc';

    // Calcular skip para paginação
    const skip = (parseInt(page) - 1) * parseInt(pageSize);

    // Executar queries em paralelo
    const [readings, total, connection] = await Promise.all([
      Reading.find(baseQuery)
        .populate({
          path: 'customerId',
          select: 'name code phone email'
        })
        .populate({
          path: 'company',
          select: 'name code'
        })
        .sort({ [sanitizedSortBy]: sanitizedSortOrder === 'desc' ? -1 : 1 })
        .skip(skip)
        .limit(parseInt(pageSize))
        .lean(),
      Reading.countDocuments(baseQuery),
      Connection.findById(connectionId)
        .select('category code meterNumber address initialReading')
        .lean()
    ]);

    if (!connection) {
      return next(new ErrorResponse('Conexão não encontrada', 404));
    }

    // Calcular estatísticas de consumo
    const consumptionStats = {
      average: readings.length > 0 
        ? roundMoney(readings.reduce((sum, r) => sum + r.consumption, 0) / readings.length)
        : 0,
      highest: readings.length > 0 
        ? Math.max(...readings.map(r => r.consumption))
        : 0,
      lowest: readings.length > 0 
        ? Math.min(...readings.map(r => r.consumption))
        : 0,
      total: readings.length > 0 
        ? readings.reduce((sum, r) => sum + r.consumption, 0)
        : 0,
      monthlyAverages: readings.reduce((acc, reading) => {
        const monthYear = reading.date.toISOString().slice(0, 7);
        if (!acc[monthYear]) {
          acc[monthYear] = {
            count: 0,
            total: 0,
            average: 0
          };
        }
        acc[monthYear].count++;
        acc[monthYear].total += reading.consumption;
        acc[monthYear].average = roundMoney(acc[monthYear].total / acc[monthYear].count);
        return acc;
      }, {})
    };

    // Formatar os dados das leituras
    const formattedReadings = readings.map(reading => ({
      id: reading._id,
      date: reading.date,
      previousReading: reading.previousReading,
      currentReading: reading.currentReading,
      consumption: reading.consumption,
      customer: {
        name: reading.customerId.name,
        code: reading.customerId.code,
        phone: reading.customerId.phone,
        email: reading.customerId.email
      },
      notes: reading.notes,
      monthYear: reading.date.toISOString().slice(0, 7),
      createdAt: reading.createdAt
    }));

    return res.status(200).json({
      success: true,
      message: 'Histórico de consumo encontrado com sucesso',
      connection: {
        ...connection,
        totalReadings: total
      },
      data: formattedReadings,
      statistics: consumptionStats,
      pagination: {
        currentPage: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / parseInt(pageSize)),
        totalCount: total
      },
      filters: {
        searchTerm,
        startDate,
        endDate,
        sortBy: sanitizedSortBy,
        sortOrder: sanitizedSortOrder
      }
    });

  } catch (error) {
    console.error('Erro ao buscar histórico de consumo por conexão:', error);
    return next(new ErrorResponse('Erro ao buscar histórico de consumo por conexão', 500));
  }
});

// Método para obter histórico de pagamentos por conexão
exports.getPaymentHistoryByConnection = asyncHandler(async (req, res, next) => {
  try {
    const { connectionId } = req.params;
    const {
      page = 1,
      pageSize = 10,
      searchTerm,
      startDate,
      endDate,
      sortBy = 'date',
      sortOrder = 'desc',
      paymentMethod,
      status
    } = req.query;

    // Validar ID da conexão
    if (!mongoose.Types.ObjectId.isValid(connectionId)) {
      return next(new ErrorResponse('ID da conexão inválido', 400));
    }

    // Primeiro, buscar as faturas relacionadas à conexão
    const invoices = await Invoice.find({ connection: connectionId })
      .select('_id')
      .lean();

    const invoiceIds = invoices.map(inv => inv._id);

    // Construir query base para pagamentos
    const baseQuery = {
      invoiceId: { $in: invoiceIds }
    };

    // Adicionar filtros de método de pagamento e status
    if (paymentMethod) {
      baseQuery.paymentMethod = paymentMethod;
    }
    if (status) {
      baseQuery.status = status;
    }

    // Adicionar filtros de data
    if (startDate || endDate) {
      baseQuery.date = {};
      if (startDate) {
        baseQuery.date.$gte = new Date(startDate);
      }
      if (endDate) {
        baseQuery.date.$lte = new Date(endDate);
      }
    }

    // Adicionar filtros de pesquisa
    if (searchTerm) {
      const numericSearch = parseFloat(searchTerm);
      if (!isNaN(numericSearch)) {
        baseQuery.$or = [
          { amount: numericSearch }
        ];
      } else {
        baseQuery.$or = [
          { paymentMethod: { $regex: searchTerm, $options: 'i' } },
          { notes: { $regex: searchTerm, $options: 'i' } }
        ];
      }
    }

    // Validar campos de ordenação
    const validSortFields = ['date', 'amount', 'paymentMethod', 'status'];
    const sanitizedSortBy = validSortFields.includes(sortBy) ? sortBy : 'date';
    const sanitizedSortOrder = ['asc', 'desc'].includes(sortOrder.toLowerCase()) ? sortOrder : 'desc';

    // Calcular skip para paginação
    const skip = (parseInt(page) - 1) * parseInt(pageSize);

    // Executar queries em paralelo
    const [payments, total, connection] = await Promise.all([
      Payment.find(baseQuery)
        .populate({
          path: 'customerId',
          select: 'name code phone email'
        })
        .populate({
          path: 'invoiceId',
          select: 'code baseAmount taxAmount totalAmount dueDate invoiceYearMonth reading',
          populate: {
            path: 'reading',
            select: 'consumption date code currentReading previousReading'
          }
        })
        .sort({ [sanitizedSortBy]: sanitizedSortOrder === 'desc' ? -1 : 1 })
        .skip(skip)
        .limit(parseInt(pageSize))
        .lean(),
      Payment.countDocuments(baseQuery),
      Connection.findById(connectionId)
        .select('category code meterNumber address')
        .lean()
    ]);

    if (!connection) {
      return next(new ErrorResponse('Conexão não encontrada', 404));
    }

    // Calcular estatísticas de pagamento
    const paymentStats = {
      totalAmount: roundMoney(payments.reduce((sum, p) => sum + p.amount, 0)),
      averageAmount: payments.length > 0 
        ? roundMoney(payments.reduce((sum, p) => sum + p.amount, 0) / payments.length)
        : 0,
      byMethod: payments.reduce((acc, payment) => {
        const method = payment.paymentMethod;
        if (!acc[method]) {
          acc[method] = {
            count: 0,
            total: 0
          };
        }
        acc[method].count++;
        acc[method].total = roundMoney(acc[method].total + payment.amount);
        return acc;
      }, {}),
      byMonth: payments.reduce((acc, payment) => {
        const monthYear = payment.date.toISOString().slice(0, 7);
        if (!acc[monthYear]) {
          acc[monthYear] = {
            count: 0,
            total: 0
          };
        }
        acc[monthYear].count++;
        acc[monthYear].total = roundMoney(acc[monthYear].total + payment.amount);
        return acc;
      }, {}),
      byStatus: payments.reduce((acc, payment) => {
        const status = payment.status;
        if (!acc[status]) {
          acc[status] = {
            count: 0,
            total: 0
          };
        }
        acc[status].count++;
        acc[status].total = roundMoney(acc[status].total + payment.amount);
        return acc;
      }, {})
    };

    // Formatar os dados dos pagamentos
    const formattedPayments = payments.map(payment => ({
      id: payment._id,
      date: payment.date,
      amount: roundMoney(payment.amount),
      paymentMethod: payment.paymentMethod,
      status: payment.status,
      notes: payment.notes,
      customer: {
        name: payment.customerId.name,
        code: payment.customerId.code,
        phone: payment.customerId.phone,
        email: payment.customerId.email
      },
      invoice: payment.invoiceId ? {
        code: payment.invoiceId.code,
        baseAmount: roundMoney(payment.invoiceId.baseAmount),
        taxAmount: roundMoney(payment.invoiceId.taxAmount),
        totalAmount: roundMoney(payment.invoiceId.totalAmount),
        dueDate: payment.invoiceId.dueDate,
        invoiceYearMonth: payment.invoiceId.invoiceYearMonth,
        reading: payment.invoiceId.reading ? {
          code: payment.invoiceId.reading.code,
          consumption: payment.invoiceId.reading.consumption,
          date: payment.invoiceId.reading.date,
          currentReading: payment.invoiceId.reading.currentReading,
          previousReading: payment.invoiceId.reading.previousReading
        } : null
      } : null
    }));

    return res.status(200).json({
      success: true,
      message: 'Histórico de pagamentos encontrado com sucesso',
      connection: {
        ...connection,
        totalPayments: total
      },
      data: formattedPayments,
      statistics: paymentStats,
      pagination: {
        currentPage: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / parseInt(pageSize)),
        totalCount: total
      },
      filters: {
        searchTerm,
        startDate,
        endDate,
        paymentMethod,
        status,
        sortBy: sanitizedSortBy,
        sortOrder: sanitizedSortOrder
      }
    });

  } catch (error) {
    console.error('Erro ao buscar histórico de pagamentos por conexão:', error);
    return next(new ErrorResponse('Erro ao buscar histórico de pagamentos por conexão', 500));
  }
});

// Método para obter histórico de faturas por conexão
exports.getInvoiceHistoryByConnection = asyncHandler(async (req, res, next) => {
  try {
    const { connectionId } = req.params;
    const {
      page = 1,
      pageSize = 10,
      searchTerm,
      startDate,
      endDate,
      status,
      sortBy = 'dueDate',
      sortOrder = 'desc'
    } = req.query;

    // Validar ID da conexão
    if (!mongoose.Types.ObjectId.isValid(connectionId)) {
      return next(new ErrorResponse('ID da conexão inválido', 400));
    }

    // Construir query base
    const baseQuery = {
      connection: connectionId
    };

    // Adicionar filtro de status se fornecido
    if (status) {
      baseQuery.status = status;
    }

    // Adicionar filtros de data
    if (startDate || endDate) {
      baseQuery.dateIssued = {};
      if (startDate) {
        baseQuery.dateIssued.$gte = new Date(startDate);
      }
      if (endDate) {
        baseQuery.dateIssued.$lte = new Date(endDate);
      }
    }

    // Adicionar filtros de pesquisa
    if (searchTerm) {
      const numericSearch = parseFloat(searchTerm);
      if (!isNaN(numericSearch)) {
        baseQuery.$or = [
          { totalAmount: numericSearch },
          { baseAmount: numericSearch },
          { taxAmount: numericSearch },
          { remainingDebt: numericSearch }
        ];
      } else {
        baseQuery.$or = [
          { status: { $regex: searchTerm, $options: 'i' } },
          { invoiceYearMonth: { $regex: searchTerm, $options: 'i' } }
        ];
      }
    }

    // Validar campos de ordenação
    const validSortFields = ['dueDate', 'dateIssued', 'totalAmount', 'status', 'invoiceYearMonth', 'remainingDebt'];
    const sanitizedSortBy = validSortFields.includes(sortBy) ? sortBy : 'dueDate';
    const sanitizedSortOrder = ['asc', 'desc'].includes(sortOrder.toLowerCase()) ? sortOrder : 'desc';

    // Calcular skip para paginação
    const skip = (parseInt(page) - 1) * parseInt(pageSize);

    // Executar queries em paralelo
    const [invoices, total, connection] = await Promise.all([
      Invoice.find(baseQuery)
        .populate({
          path: 'customer',
          select: 'name code phone email address'
        })
        .populate({
          path: 'reading',
          select: 'currentReading previousReading consumption date code notes'
        })
        .populate({
          path: 'payments',
          select: 'amount date paymentMethod status notes'
        })
        .sort({ [sanitizedSortBy]: sanitizedSortOrder === 'desc' ? -1 : 1 })
        .skip(skip)
        .limit(parseInt(pageSize))
        .lean(),
      Invoice.countDocuments(baseQuery),
      Connection.findById(connectionId)
        .select('category code meterNumber address system')
        .populate('system', 'name code')
        .lean()
    ]);

    if (!connection) {
      return next(new ErrorResponse('Conexão não encontrada', 404));
    }

    // Calcular estatísticas das faturas
    const invoiceStats = {
      totalInvoices: total,
      totalAmount: roundMoney(invoices.reduce((sum, inv) => sum + inv.totalAmount, 0)),
      totalPaid: roundMoney(invoices.reduce((sum, inv) => 
        inv.status === 'pago' ? sum + inv.totalAmount : sum + (inv.totalAmount - inv.remainingDebt), 0
      )),
      totalPending: roundMoney(invoices.reduce((sum, inv) => sum + inv.remainingDebt, 0)),
      byStatus: invoices.reduce((acc, invoice) => {
        if (!acc[invoice.status]) {
          acc[invoice.status] = {
            count: 0,
            total: 0,
            pending: 0
          };
        }
        acc[invoice.status].count++;
        acc[invoice.status].total = roundMoney(acc[invoice.status].total + invoice.totalAmount);
        acc[invoice.status].pending = roundMoney(acc[invoice.status].pending + invoice.remainingDebt);
        return acc;
      }, {}),
      byMonth: invoices.reduce((acc, invoice) => {
        const monthYear = invoice.dateIssued.toISOString().slice(0, 7);
        if (!acc[monthYear]) {
          acc[monthYear] = {
            count: 0,
            total: 0,
            paid: 0,
            pending: 0
          };
        }
        acc[monthYear].count++;
        acc[monthYear].total = roundMoney(acc[monthYear].total + invoice.totalAmount);
        acc[monthYear].paid = roundMoney(acc[monthYear].paid + (invoice.totalAmount - invoice.remainingDebt));
        acc[monthYear].pending = roundMoney(acc[monthYear].pending + invoice.remainingDebt);
        return acc;
      }, {}),
      averageAmount: total > 0 ? 
        roundMoney(invoices.reduce((sum, inv) => sum + inv.totalAmount, 0) / total) : 0,
      paymentPerformance: {
        onTime: invoices.filter(inv => 
          inv.status === 'pago' && new Date(inv.payments[0]?.date) <= new Date(inv.dueDate)
        ).length,
        late: invoices.filter(inv => 
          inv.status === 'pago' && new Date(inv.payments[0]?.date) > new Date(inv.dueDate)
        ).length,
        pending: invoices.filter(inv => inv.status !== 'pago').length
      }
    };

    // Formatar os dados das faturas
    const formattedInvoices = invoices.map(invoice => ({
      id: invoice._id,
      code: invoice.code,
      dateIssued: invoice.dateIssued,
      dueDate: invoice.dueDate,
      customer: {
        name: invoice.customer.name,
        code: invoice.customer.code,
        phone: invoice.customer.phone,
        email: invoice.customer.email,
        address: invoice.customer.address
      },
      reading: {
        code: invoice.reading.code,
        date: invoice.reading.date,
        previousReading: invoice.reading.previousReading,
        currentReading: invoice.reading.currentReading,
        consumption: invoice.reading.consumption,
        notes: invoice.reading.notes
      },
      amounts: {
        base: roundMoney(invoice.baseAmount),
        tax: roundMoney(invoice.taxAmount),
        total: roundMoney(invoice.totalAmount),
        remaining: roundMoney(invoice.remainingDebt),
        paid: roundMoney(invoice.totalAmount - invoice.remainingDebt)
      },
      status: invoice.status,
      invoiceYearMonth: invoice.invoiceYearMonth,
      payments: invoice.payments.map(payment => ({
        id: payment._id,
        amount: roundMoney(payment.amount),
        date: payment.date,
        method: payment.paymentMethod,
        status: payment.status,
        notes: payment.notes
      })),
      daysPastDue: invoice.status !== 'pago' ? 
        Math.max(0, Math.floor((new Date() - new Date(invoice.dueDate)) / (1000 * 60 * 60 * 24))) : 0
    }));

    return res.status(200).json({
      success: true,
      message: 'Histórico de faturas encontrado com sucesso',
      connection: {
        ...connection,
        totalInvoices: total
      },
      data: formattedInvoices,
      statistics: invoiceStats,
      pagination: {
        currentPage: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / parseInt(pageSize)),
        totalCount: total
      },
      filters: {
        searchTerm,
        startDate,
        endDate,
        status,
        sortBy: sanitizedSortBy,
        sortOrder: sanitizedSortOrder
      }
    });

  } catch (error) {
    console.error('Erro ao buscar histórico de faturas por conexão:', error);
    return next(new ErrorResponse('Erro ao buscar histórico de faturas por conexão', 500));
  }
});

exports.getPaymentHistoryByConnection = asyncHandler(async (req, res, next) => {
  try {
    const { connectionId } = req.params;
    const {
      page = 1,
      pageSize = 10,
      searchTerm,
      startDate,
      endDate,
      sortBy = 'date',
      sortOrder = 'desc',
      paymentMethod,
      status
    } = req.query;

    // Validar ID da conexão
    if (!mongoose.Types.ObjectId.isValid(connectionId)) {
      return next(new ErrorResponse('ID da conexão inválido', 400));
    }

    // Primeiro, verificar se a conexão existe
    const connection = await Connection.findById(connectionId)
      .select('category code meterNumber address')
      .lean();

    if (!connection) {
      return next(new ErrorResponse('Conexão não encontrada', 404));
    }

    // Buscar IDs das faturas em uma única query
    const invoiceIds = await Invoice.distinct('_id', { connection: connectionId });

    if (!invoiceIds.length) {
      return res.status(200).json({
        success: true,
        message: 'Nenhum pagamento encontrado para esta conexão',
        connection: {
          ...connection,
          totalPayments: 0
        },
        data: [],
        statistics: {
          totalAmount: 0,
          averageAmount: 0,
          byMethod: {},
          byMonth: {},
          byStatus: {}
        },
        pagination: {
          currentPage: parseInt(page),
          pageSize: parseInt(pageSize),
          totalPages: 0,
          totalCount: 0
        }
      });
    }

    // Construir query base para pagamentos
    const baseQuery = {
      invoiceId: { $in: invoiceIds }
    };

    // Adicionar filtros
    if (paymentMethod) baseQuery.paymentMethod = paymentMethod;
    if (status) baseQuery.status = status;
    if (startDate || endDate) {
      baseQuery.date = {};
      if (startDate) baseQuery.date.$gte = new Date(startDate);
      if (endDate) baseQuery.date.$lte = new Date(endDate);
    }

    // Adicionar filtros de pesquisa
    if (searchTerm) {
      const numericSearch = parseFloat(searchTerm);
      baseQuery.$or = !isNaN(numericSearch) 
        ? [{ amount: numericSearch }]
        : [
            { paymentMethod: { $regex: searchTerm, $options: 'i' } },
            { notes: { $regex: searchTerm, $options: 'i' } }
          ];
    }

    // Validar e sanitizar campos de ordenação
    const validSortFields = ['date', 'amount', 'paymentMethod', 'status'];
    const sanitizedSortBy = validSortFields.includes(sortBy) ? sortBy : 'date';
    const sanitizedSortOrder = sortOrder === 'desc' ? -1 : 1;
    const sortOptions = { [sanitizedSortBy]: sanitizedSortOrder };

    // Calcular skip para paginação
    const skip = (parseInt(page) - 1) * parseInt(pageSize);

    // Executar queries em paralelo com agregação otimizada
    const [payments, total] = await Promise.all([
      Payment.aggregate([
        { $match: baseQuery },
        { $sort: sortOptions },
        { $skip: skip },
        { $limit: parseInt(pageSize) },
        {
          $lookup: {
            from: 'customers',
            localField: 'customerId',
            foreignField: '_id',
            as: 'customer'
          }
        },
        {
          $lookup: {
            from: 'invoices',
            localField: 'invoiceId',
            foreignField: '_id',
            as: 'invoice'
          }
        },
        { $unwind: '$customer' },
        { $unwind: '$invoice' },
        {
          $lookup: {
            from: 'readings',
            localField: 'invoice.reading',
            foreignField: '_id',
            as: 'reading'
          }
        },
        { $unwind: '$reading' },
        {
          $project: {
            _id: 1,
            date: 1,
            amount: 1,
            paymentMethod: 1,
            status: 1,
            notes: 1,
            'customer.name': 1,
            'customer.code': 1,
            'customer.phone': 1,
            'customer.email': 1,
            'invoice.code': 1,
            'invoice.baseAmount': 1,
            'invoice.taxAmount': 1,
            'invoice.totalAmount': 1,
            'invoice.dueDate': 1,
            'invoice.invoiceYearMonth': 1,
            'reading.code': 1,
            'reading.consumption': 1,
            'reading.date': 1,
            'reading.currentReading': 1,
            'reading.previousReading': 1
          }
        }
      ]),
      Payment.countDocuments(baseQuery)
    ]);

    // Calcular estatísticas com os dados já filtrados
    const allPayments = await Payment.find(baseQuery).select('amount paymentMethod status date').lean();
    
    const paymentStats = {
      totalAmount: roundMoney(allPayments.reduce((sum, p) => sum + p.amount, 0)),
      averageAmount: allPayments.length > 0 
        ? roundMoney(allPayments.reduce((sum, p) => sum + p.amount, 0) / allPayments.length)
        : 0,
      byMethod: {},
      byMonth: {},
      byStatus: {}
    };

    // Calcular estatísticas em uma única iteração
    allPayments.forEach(payment => {
      // Por método
      if (!paymentStats.byMethod[payment.paymentMethod]) {
        paymentStats.byMethod[payment.paymentMethod] = { count: 0, total: 0 };
      }
      paymentStats.byMethod[payment.paymentMethod].count++;
      paymentStats.byMethod[payment.paymentMethod].total = roundMoney(
        paymentStats.byMethod[payment.paymentMethod].total + payment.amount
      );

      // Por mês
      const monthYear = payment.date.toISOString().slice(0, 7);
      if (!paymentStats.byMonth[monthYear]) {
        paymentStats.byMonth[monthYear] = { count: 0, total: 0 };
      }
      paymentStats.byMonth[monthYear].count++;
      paymentStats.byMonth[monthYear].total = roundMoney(
        paymentStats.byMonth[monthYear].total + payment.amount
      );

      // Por status
      if (!paymentStats.byStatus[payment.status]) {
        paymentStats.byStatus[payment.status] = { count: 0, total: 0 };
      }
      paymentStats.byStatus[payment.status].count++;
      paymentStats.byStatus[payment.status].total = roundMoney(
        paymentStats.byStatus[payment.status].total + payment.amount
      );
    });

    // Formatar os dados dos pagamentos
    const formattedPayments = payments.map(payment => ({
      id: payment._id,
      date: payment.date,
      amount: roundMoney(payment.amount),
      paymentMethod: payment.paymentMethod,
      status: payment.status,
      notes: payment.notes,
      customer: {
        name: payment.customer.name,
        code: payment.customer.code,
        phone: payment.customer.phone,
        email: payment.customer.email
      },
      invoice: {
        code: payment.invoice.code,
        baseAmount: roundMoney(payment.invoice.baseAmount),
        taxAmount: roundMoney(payment.invoice.taxAmount),
        totalAmount: roundMoney(payment.invoice.totalAmount),
        dueDate: payment.invoice.dueDate,
        invoiceYearMonth: payment.invoice.invoiceYearMonth,
        reading: {
          code: payment.reading.code,
          consumption: payment.reading.consumption,
          date: payment.reading.date,
          currentReading: payment.reading.currentReading,
          previousReading: payment.reading.previousReading
        }
      }
    }));

    return res.status(200).json({
      success: true,
      message: 'Histórico de pagamentos encontrado com sucesso',
      connection: {
        ...connection,
        totalPayments: total
      },
      data: formattedPayments,
      statistics: paymentStats,
      pagination: {
        currentPage: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / parseInt(pageSize)),
        totalCount: total
      },
      filters: {
        searchTerm,
        startDate,
        endDate,
        paymentMethod,
        status,
        sortBy: sanitizedSortBy,
        sortOrder: sortOrder === 'desc' ? 'desc' : 'asc'
      }
    });

  } catch (error) {
    console.error('Erro ao buscar histórico de pagamentos por conexão:', error);
    return next(new ErrorResponse('Erro ao buscar histórico de pagamentos por conexão', 500));
  }
});

exports.getInvoicePaymentHistory = asyncHandler(async (req, res, next) => {
  try {
    const { invoiceId } = req.params;
    const {
      page = 1,
      pageSize = 10,
      sortBy = 'date',
      sortOrder = 'desc'
    } = req.query;

    // Validar ID da fatura
    if (!mongoose.Types.ObjectId.isValid(invoiceId)) {
      return next(new ErrorResponse('ID da fatura inválido', 400));
    }

    // Verificar se a fatura existe e buscar informações relevantes
    const invoice = await Invoice.findById(invoiceId)
      .populate({
        path: 'customer',
        select: 'name code phone email address'
      })
      .populate({
        path: 'connection',
        select: 'category code meterNumber address'
      })
      .populate({
        path: 'reading',
        select: 'currentReading previousReading consumption date code'
      })
      .lean();

    if (!invoice) {
      return next(new ErrorResponse('Fatura não encontrada', 404));
    }

    // Validar campos de ordenação
    const validSortFields = ['date', 'amount', 'paymentMethod', 'status'];
    const sanitizedSortBy = validSortFields.includes(sortBy) ? sortBy : 'date';
    const sanitizedSortOrder = sortOrder === 'desc' ? -1 : 1;
    const sortOptions = { [sanitizedSortBy]: sanitizedSortOrder };

    // Calcular skip para paginação
    const skip = (parseInt(page) - 1) * parseInt(pageSize);

    // Buscar pagamentos relacionados à fatura
    const [payments, total] = await Promise.all([
      Payment.find({ invoiceId })
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(pageSize))
        .lean(),
      Payment.countDocuments({ invoiceId })
    ]);

    // Calcular estatísticas dos pagamentos
    const paymentStats = {
      totalPaid: roundMoney(payments.reduce((sum, p) => sum + p.amount, 0)),
      remainingDebt: roundMoney(invoice.totalAmount - payments.reduce((sum, p) => sum + p.amount, 0)),
      paymentCount: total,
      byMethod: payments.reduce((acc, payment) => {
        if (!acc[payment.paymentMethod]) {
          acc[payment.paymentMethod] = {
            count: 0,
            total: 0
          };
        }
        acc[payment.paymentMethod].count++;
        acc[payment.paymentMethod].total = roundMoney(acc[payment.paymentMethod].total + payment.amount);
        return acc;
      }, {}),
      byStatus: payments.reduce((acc, payment) => {
        if (!acc[payment.status]) {
          acc[payment.status] = {
            count: 0,
            total: 0
          };
        }
        acc[payment.status].count++;
        acc[payment.status].total = roundMoney(acc[payment.status].total + payment.amount);
        return acc;
      }, {}),
      timeline: payments.reduce((acc, payment) => {
        const date = payment.date.toISOString().split('T')[0];
        if (!acc[date]) {
          acc[date] = {
            count: 0,
            total: 0
          };
        }
        acc[date].count++;
        acc[date].total = roundMoney(acc[date].total + payment.amount);
        return acc;
      }, {})
    };

    // Formatar os dados da fatura
    const formattedInvoice = {
      id: invoice._id,
      code: invoice.code,
      dateIssued: invoice.dateIssued,
      dueDate: invoice.dueDate,
      customer: invoice.customer,
      connection: invoice.connection,
      reading: invoice.reading,
      amounts: {
        base: roundMoney(invoice.baseAmount),
        tax: roundMoney(invoice.taxAmount),
        total: roundMoney(invoice.totalAmount),
        paid: roundMoney(paymentStats.totalPaid),
        remaining: roundMoney(paymentStats.remainingDebt)
      },
      status: invoice.status,
      invoiceYearMonth: invoice.invoiceYearMonth,
      daysPastDue: Math.max(0, Math.floor((new Date() - new Date(invoice.dueDate)) / (1000 * 60 * 60 * 24)))
    };

    // Formatar os dados dos pagamentos
    const formattedPayments = payments.map(payment => ({
      id: payment._id,
      date: payment.date,
      amount: roundMoney(payment.amount),
      paymentMethod: payment.paymentMethod,
      status: payment.status,
      notes: payment.notes,
      receiptNumber: payment.receiptNumber,
      paymentLocation: payment.paymentLocation,
      processedBy: payment.processedBy,
      metadata: payment.metadata
    }));

    return res.status(200).json({
      success: true,
      message: 'Histórico de pagamentos da fatura encontrado com sucesso',
      invoice: formattedInvoice,
      data: formattedPayments,
      statistics: {
        ...paymentStats,
        paymentProgress: {
          percentage: roundMoney((paymentStats.totalPaid / invoice.totalAmount) * 100),
          isPaid: paymentStats.remainingDebt <= 0,
          isPartiallyPaid: paymentStats.totalPaid > 0 && paymentStats.remainingDebt > 0,
          isOverpaid: paymentStats.totalPaid > invoice.totalAmount
        },
        paymentTiming: {
          onTime: payments.filter(p => new Date(p.date) <= new Date(invoice.dueDate)).length,
          late: payments.filter(p => new Date(p.date) > new Date(invoice.dueDate)).length
        }
      },
      pagination: {
        currentPage: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / parseInt(pageSize)),
        totalCount: total
      },
      filters: {
        sortBy: sanitizedSortBy,
        sortOrder: sortOrder === 'desc' ? 'desc' : 'asc'
      }
    });

  } catch (error) {
    console.error('Erro ao buscar histórico de pagamentos da fatura:', error);
    return next(new ErrorResponse('Erro ao buscar histórico de pagamentos da fatura', 500));
  }
});