// Mỗi Node có tối đa một provisioning token đang hiệu lực; chỉ lưu SHA-256 hash.
module.exports = (sequelize, DataTypes) =>
    sequelize.define(
        'ProvisioningToken',
        {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            nodeId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
            tokenHash: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
            expiresAt: { type: DataTypes.DATE(3), allowNull: false },
            usedAt: { type: DataTypes.DATE(3), allowNull: true },
            createdAt: { type: DataTypes.DATE(3), allowNull: false, defaultValue: DataTypes.NOW },
        },
        { tableName: 'provisioningTokens', timestamps: false }
    );
