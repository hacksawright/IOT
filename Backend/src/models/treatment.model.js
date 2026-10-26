// Bảng treatments: phác đồ điều trị (sinh học + hóa học) cho bệnh
module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'Treatment',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      diseaseId: { type: DataTypes.INTEGER, allowNull: true },
      deficiencyId: { type: DataTypes.INTEGER, allowNull: true },
      type: { type: DataTypes.ENUM('BIOLOGICAL', 'CHEMICAL'), allowNull: false },
      instructions: { type: DataTypes.TEXT, allowNull: false },
      activeIngredient: { type: DataTypes.STRING(120), allowNull: true }, // bắt buộc khi CHEMICAL
      dosageText: { type: DataTypes.STRING(150), allowNull: true },
      intervalDays: { type: DataTypes.INTEGER, allowNull: true },
      sourceReference: { type: DataTypes.TEXT, allowNull: false }, // trích nguồn khuyến nông
    },
    {
      tableName: 'treatments',
      timestamps: false,
      validate: {
        chemicalNeedsIngredient() {
          if (this.type === 'CHEMICAL' && !this.activeIngredient) {
            throw new Error('Phác đồ hóa học phải có hoạt chất');
          }
        },
      },
    }
  );
