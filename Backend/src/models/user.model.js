// Bảng users: tài khoản đăng nhập + vai trò (RBAC kiểm tra ở backend, trả 403 nếu không đủ quyền)
module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'User',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      username: { type: DataTypes.STRING(50), allowNull: false, unique: true },
      email: { type: DataTypes.STRING(255), allowNull: false, unique: true, validate: { isEmail: true } },
      passwordHash: { type: DataTypes.STRING(255), allowNull: false },
      fullName: { type: DataTypes.STRING(100), allowNull: false },
      role: { type: DataTypes.ENUM('admin', 'operator', 'viewer'), allowNull: false, defaultValue: 'viewer' },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      lastLoginAt: { type: DataTypes.DATE(3), allowNull: true },
      createdAt: { type: DataTypes.DATE(3), allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'users',
      timestamps: false,
      // Mặc định không trả passwordHash ra ngoài. Khi đăng nhập dùng User.scope('withPassword')
      defaultScope: { attributes: { exclude: ['passwordHash'] } },
      scopes: { withPassword: {} },
    }
  );
