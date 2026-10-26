// Bảng nodes: bo mạch ESP32 (kết nối MQTT, firmware, online/offline, thu hồi kết nối)
module.exports = (sequelize, DataTypes) =>
    sequelize.define(
        'Node',
        {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            nodeCode: { type: DataTypes.STRING(50), allowNull: false, unique: true },
            name: { type: DataTypes.STRING(100), allowNull: false },
            firmwareVersion: { type: DataTypes.STRING(30), allowNull: true },
            hardwareVersion: { type: DataTypes.STRING(30), allowNull: true },
            isOnline: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
            onlineSince: { type: DataTypes.DATE(3), allowNull: true },
            lastHeartbeatAt: { type: DataTypes.DATE(3), allowNull: true },
            heartbeatTimeoutSec: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 60, validate: { min: 1 } },
            isRevoked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
            revokedAt: { type: DataTypes.DATE(3), allowNull: true },
            createdAt: { type: DataTypes.DATE(3), allowNull: false, defaultValue: DataTypes.NOW },
        },
        {
            tableName: 'nodes',
            timestamps: false,
        }
    );
