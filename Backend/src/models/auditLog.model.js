// Bảng audit_logs: nhật ký thao tác (userId = null nghĩa là hệ thống tự thực hiện)
module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'AuditLog',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      userId: { type: DataTypes.INTEGER, allowNull: true },
      action: { type: DataTypes.STRING(60), allowNull: false }, // LOGIN, PUMP_ON, DEVICE_LIFECYCLE_CHANGE, 403_DENIED...
      entityType: { type: DataTypes.STRING(40), allowNull: true },
      entityId: { type: DataTypes.INTEGER, allowNull: true },
      detail: { type: DataTypes.JSON, allowNull: true },
      success: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: DataTypes.DATE(3), allowNull: false, defaultValue: DataTypes.NOW },
    },
    { tableName: 'auditLogs', timestamps: false }
  );
