const { MissingPageContentsEmbeddingError } = require("pdf-lib");

// Para resetar para começar do L001 novamente
db.counters.updateOne(
    { name: 'reading' },
    { $set: { seq: 0 } }
);

// Ou para remover completamente (próxima leitura começará do L001)
db.counters.deleteOne({ name: 'reading' });



ou por codigo 
// Adicione esta função ao readingController.js
const resetReadingCounter = async () => {
    try {
      await Counter.updateOne(
        { name: 'reading' },
        { $set: { seq: 0 } }
      );
      return { success: true, message: 'Contador de leituras resetado com sucesso' };
    } catch (error) {
      throw new Error('Erro ao resetar contador de leituras');
    }
  };
  
  // Ou para remover completamente
  const resetReadingCounter = async () => {
    try {
      await Counter.deleteOne({ name: 'reading' });
      return { success: true, message: 'Contador de leituras resetado com sucesso' };
    } catch (error) {
      throw new Error('Erro ao resetar contador de leituras');
    }
  };

  exports.createReading = asyncHandler(async (req, res, next) => {
    // Usar transação MongoDB para garantir operações atômicas
    const session = await mongoose.startSession();
    session.startTransaction();
  
    try {
      const { customerId, connectionId, currentReading, notes } = req.body;
      const date = new Date();
  
      // Validações
      if (!mongoose.Types.ObjectId.isValid(customerId)) {
        await session.abortTransaction();
        session.endSession();
        return next(new ErrorResponse('ID do cliente inválido', 400));
      }
  
      if (!mongoose.Types.ObjectId.isValid(connectionId)) {
        await session.abortTransaction();
        session.endSession();
        return next(new ErrorResponse('ID da ligação inválido', 400));
      }
  
      // Buscar entidades relacionadas
      const customer = await Customer.findById(customerId).session(session);
      if (!customer) {
        await session.abortTransaction();
        session.endSession();
        return next(new ErrorResponse('Cliente não encontrado', 404));
      }
  
      const connection = await Connection.findById(connectionId).session(session);
      if (!connection) {
        await session.abortTransaction();
        session.endSession();
        return next(new ErrorResponse('Ligação não encontrada', 404));
      }
  
      if (connection.customer.toString() !== customerId) {
        await session.abortTransaction();
        session.endSession();
        return next(new ErrorResponse('Esta ligação não pertence ao cliente informado', 400));
      }
  
      const lastReading = await Reading.findOne({ connectionId }).sort({ date: -1 });
      const previousReading = lastReading ? lastReading.currentReading : connection.initialReading;
  
      if (currentReading < previousReading) {
        await session.abortTransaction();
        session.endSession();
        return next(new ErrorResponse('A leitura atual não pode ser menor que a leitura anterior.', 400));
      }
  
      const consumption = currentReading - previousReading;
      const code = await getNextReadingCode();
  
      // Criar leitura com a sessão
      const reading = await Reading.create([{
        code,
        customerId,
        connectionId,
        company: customer.company,
        date,
        previousReading,
        currentReading,
        consumption,
        readingImage: req.file ? req.file.path : null,
        notes,
        createdBy: req.user._id
      }], { session });
  
      const system = await System.findById(connection.system).session(session);
      if (!system) {
        await session.abortTransaction();
        session.endSession();
        return next(new ErrorResponse('Sistema não encontrado para a leitura', 500));
      }
  
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
      const invoiceStatus = remainingDebt === 0 ? 'pago' : 'pago parcial';
  
      // Criar fatura com a sessão
      const invoice = await Invoice.create([{
        customer: customer._id,
        company: customer.company,
        reading: reading[0]._id, // Note o [0] porque create com sessão retorna um array
        connection: connection._id,
        baseAmount: totalAmount,
        taxAmount,
        totalAmount: remainingDebt,
        availableCreditUsed,
        remainingDebt,
        dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        invoiceYearMonth: date.toISOString().slice(0, 7),
        createdBy: req.user._id,
        status: invoiceStatus
      }], { session });
  
      // Criar pagamento se houver crédito usado
      if (availableCreditUsed > 0) {
        const payment = await Payment.create([{
          customerId: customer._id,
          invoiceId: invoice[0]._id, // Note o [0] porque create com sessão retorna um array
          amount: availableCreditUsed,
          date: new Date(),
          notes: 'Pagamento automático com crédito disponível'
        }], { session });
  
        // Registrar log de auditoria para o pagamento
        logAuditInfo('CREATE', 'Payment', payment[0]._id, req.user._id, null, {
          amount: availableCreditUsed,
          customerId: customer._id,
          invoiceId: invoice[0]._id
        });
      }
  
      // Registrar log de auditoria para a leitura
      logAuditInfo('CREATE', 'Reading', reading[0]._id, req.user._id, null, {
        code,
        currentReading,
        previousReading,
        consumption,
        customerId
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
  });