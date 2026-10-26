module.exports = (sequelize, DataTypes) =>
    sequelize.define(
        'Device',
        {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            deviceCode: { type: DataTypes.STRING(50), allowNull: false, unique: true },
            name: { type: DataTypes.STRING(100), allowNull: false },
            // CAMERA được giữ trong ENUM để đọc dữ liệu cũ; API không cho tạo camera mới.
            type: { type: DataTypes.ENUM('PUMP', 'SENSOR', 'CAMERA'), allowNull: false },
            location: { type: DataTypes.STRING(150), allowNull: true },
            nodeId: { type: DataTypes.INTEGER, allowNull: true },
            gpioPin: { type: DataTypes.INTEGER, allowNull: true },
            lifecycle: {
                type: DataTypes.ENUM('REGISTERED', 'PROVISIONED', 'ACTIVE', 'FAULT', 'MAINTENANCE', 'DECOMMISSIONED'),
                allowNull: false,
                defaultValue: 'REGISTERED',
            },
            isOn: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
            // speedPercent: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 0, max: 100 } },
            stateChangedAt: { type: DataTypes.DATE(3), allowNull: true },
            config: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
            configVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
            configAppliedVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
            createdAt: { type: DataTypes.DATE(3), allowNull: false, defaultValue: DataTypes.NOW },
        },
        {
            tableName: 'devices',
            timestamps: false,
            validate: {
                // Giống CHECK của DB, để báo lỗi sớm ở backend
                onOffOnlyForActuator() {
                    if (!['PUMP'].includes(this.type) && this.isOn) {
                        throw new Error('Chỉ PUMP mới có trạng thái bật/tắt trong hệ thống hiện tại');
                    }
                },
                nodeRequiredAfterRegistered() {
                    if (!['REGISTERED', 'DECOMMISSIONED'].includes(this.lifecycle) && !this.nodeId) {
                        throw new Error('Thiết bị từ PROVISIONED trở đi phải gắn vào một node');
                    }
                },
            },
        }
    );