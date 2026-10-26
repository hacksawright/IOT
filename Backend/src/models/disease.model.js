// Bảng diseases: danh mục bệnh theo cây. modelLabel khớp với nhãn class của model AI trên camera.
module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'Disease',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      modelLabel: { type: DataTypes.STRING(100), allowNull: false, unique: true }, // vd: Tomato___Late_blight
      nameVi: { type: DataTypes.STRING(120), allowNull: false },
      nameEn: { type: DataTypes.STRING(120), allowNull: true },
      isHealthy: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, // true: lá khỏe, không có phác đồ
      // symptoms: { type: DataTypes.TEXT, allowNull: true },
    },
    { tableName: 'diseases', timestamps: false }
  );
