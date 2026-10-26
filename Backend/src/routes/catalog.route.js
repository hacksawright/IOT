
const router = require('express').Router();
const wrap = require('../utils/wrap');
const catalog = require('../controllers/catalog.controller');
const { Disease, Treatment } = require('../models');
const { authenticate } = require('../middlewares/auth');
const { requireRole } = require('../middlewares/rbac');

// Danh mục tri thức AI: người dùng đăng nhập được xem,
// chỉ Admin được tạo, sửa, xóa.
const resources = {
  diseases: catalog(Disease, {
    label: 'disease',
    fields: [
      'modelLabel',
      'nameVi',
      'nameEn',
      'isHealthy',
    ],
    filters: ['isHealthy'],
    include: [{ association: 'treatments' }],
  }),

  treatments: catalog(Treatment, {
    label: 'treatment',
    fields: [
      'diseaseId',
      'type',
      'instructions',
      'activeIngredient',
      'dosageText',
      'intervalDays',
      'sourceReference',
    ],
    filters: ['diseaseId', 'type'],
  }),
};

router.use(authenticate);

for (const [path, raw] of Object.entries(resources)) {
  const c = wrap(raw);

  router.get(`/${path}`, c.list);
  router.get(`/${path}/:id`, c.get);

  router.post(`/${path}`, requireRole('admin'), c.create);
  router.patch(`/${path}/:id`, requireRole('admin'), c.update);
  router.delete(`/${path}/:id`, requireRole('admin'), c.remove);
}

module.exports = router;
