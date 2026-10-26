// Tạo tài khoản Admin đầu tiên khi database mới hoàn toàn.
// Đặt BOOTSTRAP_ADMIN_USERNAME/EMAIL/PASSWORD/FULL_NAME trong Backend/.env trước khi chạy.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sequelize, User } = require('../src/models');

async function main() {
  const username = String(process.env.BOOTSTRAP_ADMIN_USERNAME || '').trim();
  const email = String(process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim();
  const password = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || '');
  const fullName = String(process.env.BOOTSTRAP_ADMIN_FULL_NAME || 'System Administrator').trim();
  if (!username || !email || password.length < 12) {
    throw new Error('Cần BOOTSTRAP_ADMIN_USERNAME, BOOTSTRAP_ADMIN_EMAIL và BOOTSTRAP_ADMIN_PASSWORD tối thiểu 12 ký tự trong Backend/.env');
  }
  await sequelize.authenticate();
  // Safe sync chỉ tạo bảng thiếu, không xóa dữ liệu. Chạy đúng schema đã khai báo trong Sequelize models.
  await sequelize.sync();
  const existing = await User.findOne({ where: { role: 'admin' }, attributes: ['id', 'username', 'email'] });
  if (existing) {
    console.log(`Đã có tài khoản Admin (${existing.username}); không tạo thêm.`);
    return;
  }
  const dupe = await User.findOne({ where: { username } });
  if (dupe) throw new Error(`Username "${username}" đã tồn tại nhưng chưa phải Admin. Hãy chọn username khác hoặc nâng role qua quy trình quản trị đã xác thực.`);
  const user = await User.create({ username, email, fullName, role: 'admin', isActive: true, passwordHash: await bcrypt.hash(password, 12) });
  console.log(`Đã tạo tài khoản Admin đầu tiên: ${user.username} (${user.email}). Không in mật khẩu ra log.`);
}

main().catch((error) => { console.error('[seed-admin]', error.message); process.exitCode = 1; }).finally(async () => { await sequelize.close().catch(() => {}); });
