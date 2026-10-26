// Bảng device_commands: lịch sử lệnh điều khiển và kết quả xác nhận từ thiết bị
module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'DeviceCommand',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      commandUuid: { type: DataTypes.UUID, allowNull: false, defaultValue: DataTypes.UUIDV4, unique: true },
      deviceId: { type: DataTypes.INTEGER, allowNull: false },
      turnOn: { type: DataTypes.BOOLEAN, allowNull: false },
      // speedPercent: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 0, max: 100 } },
      source: { type: DataTypes.ENUM('AUTO', 'MANUAL', 'ALERT'), allowNull: false },
      issuedBy: { type: DataTypes.INTEGER, allowNull: true },
      alertId: { type: DataTypes.INTEGER, allowNull: true },
      sensorValue: {
        type: DataTypes.DECIMAL(8, 2),
        allowNull: true,
        get() {
          const v = this.getDataValue('sensorValue');
          return v === null ? null : Number(v);
        },
      },
      status: {
        type: DataTypes.ENUM('PENDING', 'SENT', 'ACKED', 'FAILED', 'TIMEOUT'),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      resultMessage: { type: DataTypes.STRING(255), allowNull: true },
      createdAt: { type: DataTypes.DATE(3), allowNull: false, defaultValue: DataTypes.NOW },
      sentAt: { type: DataTypes.DATE(3), allowNull: true },
      ackedAt: { type: DataTypes.DATE(3), allowNull: true }, // ackedAt - createdAt = độ trễ lệnh
    },
    {
      tableName: 'deviceCommands',
      timestamps: false,
      validate: {
        manualNeedsUser() {
          if (this.source === 'MANUAL' && !this.issuedBy) {
            throw new Error('Lệnh MANUAL phải có issuedBy');
          }
        },
      },
    }
  );
