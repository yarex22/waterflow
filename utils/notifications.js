const Notification = require('../models/waterflow/notification/NotificationModel');

exports.createNotification = async (type, title, message, severity, targetUser, relatedEntity) => {
  return await Notification.create({
    type,
    title,
    message,
    severity,
    targetUser,
    relatedEntity
  });
};

exports.checkAbnormalConsumption = async (consumption, averageConsumption, threshold = 3) => {
  return consumption > (averageConsumption * threshold);
};

exports.sendNotification = async (notification) => {
  // Implementar lógica de envio (email, push, etc)
  console.log('Sending notification:', notification);
}; 