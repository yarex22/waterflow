const asyncHandler = require('../../../middleware/asyncHandler');
const ErrorResponse = require('../../../utils/ErrorResponse');
const Notification = require('../../../models/waterflow/notification/NotificationModel');

exports.getNotifications = asyncHandler(async (req, res, next) => {
  const notifications = await Notification.find({ targetUser: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50);

  res.status(200).json({
    success: true,
    data: notifications
  });
});

exports.markNotificationAsRead = asyncHandler(async (req, res, next) => {
  const notification = await Notification.findByIdAndUpdate(
    req.params.id,
    { status: 'read' },
    { new: true }
  );

  if (!notification) {
    return next(new ErrorResponse('Notificação não encontrada', 404));
  }

  res.status(200).json({
    success: true,
    data: notification
  });
}); 

// utils/notifications.js

const Notification = require('../models/waterflow/notification/NotificationModel');
const User = require('../models/waterflow/user/UserModel');
const Invoice = require('../models/waterflow/invoice/InvoiceModel');
const Reading = require('../models/waterflow/reading/ReadingModel');

// Função para criar e enviar notificação
exports.createNotification = async (type, title, message, severity, targetUser, relatedEntity) => {
  const notification = await Notification.create({
    type,
    title,
    message,
    severity,
    targetUser,
    relatedEntity
  });

  // Enviar notificação pelos canais configurados
  await this.sendNotification(notification);

  return notification;
};

// Verificar consumo anormal
exports.checkAbnormalConsumption = async (consumption, averageConsumption, threshold = 3) => {
  return consumption > (averageConsumption * threshold);
};

// Enviar notificação pelos canais configurados
exports.sendNotification = async (notification) => {
  const user = await User.findById(notification.targetUser);
  
  // Email (se configurado)
  if (user.emailNotifications) {
    await sendEmail(user.email, notification);
  }
  
  // Push notification (se configurado)
  if (user.pushNotifications) {
    await sendPushNotification(user.deviceToken, notification);
  }
  
  // SMS (se configurado para notificações de alta prioridade)
  if (notification.severity === 'high' && user.smsNotifications) {
    await sendSMS(user.phone, notification);
  }
};

// Verificar faturas vencidas e criar notificações
exports.checkOverdueInvoices = async () => {
  const overdueInvoices = await Invoice.find({
    dueDate: { $lt: new Date() },
    status: { $in: ['não pago', 'pago parcial'] }
  });

  for (const invoice of overdueInvoices) {
    await this.createNotification(
      'invoice_overdue',
      'Fatura Vencida',
      `A fatura ${invoice._id} está vencida. Valor pendente: ${invoice.remainingDebt}`,
      'high',
      invoice.createdBy,
      { type: 'invoice', id: invoice._id }
    );
  }
};

// Verificar leituras pendentes
exports.checkPendingReadings = async () => {
  const connections = await Connection.find({ active: true });
  const currentDate = new Date();
  
  for (const connection of connections) {
    const lastReading = await Reading.findOne({ connectionId: connection._id })
      .sort({ date: -1 });
      
    if (!lastReading || daysSince(lastReading.date) > 30) {
      await this.createNotification(
        'reading_pending',
        'Leitura Pendente',
        `A ligação ${connection.code} está com leitura pendente`,
        'medium',
        connection.createdBy,
        { type: 'connection', id: connection._id }
      );
    }
  }
};

// Verificar créditos próximos de expirar
exports.checkExpiringCredits = async () => {
  const customers = await Customer.find({
    'availableCredit.expiryDate': {
      $gt: new Date(),
      $lt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000) // 15 dias
    }
  });

  for (const customer of customers) {
    await this.createNotification(
      'credit_expiring',
      'Crédito a Expirar',
      `O cliente ${customer.name} tem ${customer.availableCredit} MT em créditos que expiram em ${customer.availableCredit.expiryDate}`,
      'medium',
      customer.createdBy,
      { type: 'customer', id: customer._id }
    );
  }
};

// scheduler.js
const cron = require('node-cron');
const notifications = require('./utils/notifications');

// Verificar faturas vencidas diariamente às 8h
cron.schedule('0 8 * * *', async () => {
  await notifications.checkOverdueInvoices();
});

// Verificar leituras pendentes diariamente às 9h
cron.schedule('0 9 * * *', async () => {
  await notifications.checkPendingReadings();
});

// Verificar créditos a expirar diariamente às 10h
cron.schedule('0 10 * * *', async () => {
  await notifications.checkExpiringCredits();
});