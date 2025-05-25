const Audit = require('../models/waterflow/audit/AuditModel');

exports.logAudit = async (action, entityType, entityId, userId, oldData, newData) => {
  return await Audit.create({
    action,
    entityType,
    entityId,
    userId,
    oldData,
    newData
  });
}; 