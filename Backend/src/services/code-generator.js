const { randomBytes } = require('crypto');

/**
 * Create a record first so MySQL can allocate its AUTO_INCREMENT id, then use
 * that id as the human-readable business code (NODE-001, DEV-001, ...).
 * Both writes run in one transaction; the unique index remains the final guard.
 * Existing records are deliberately not rewritten by this helper.
 */
function formatSequentialCode(prefix, id) {
    if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw new Error('ID bản ghi không hợp lệ để tạo mã');
    return `${prefix}-${String(id).padStart(3, '0')}`;
}

async function createWithSequentialCode({ prefix, Model, field, values }) {
    if (!/^[A-Z]{2,10}$/.test(String(prefix))) throw new Error('Prefix mã không hợp lệ');
    if (!Model?.sequelize) throw new Error('Model chưa được gắn Sequelize instance');

    return Model.sequelize.transaction(async (transaction) => {
        const temporaryCode = `${prefix}-PENDING-${randomBytes(8).toString('hex').toUpperCase()}`;
        const record = await Model.create(
            { ...values, [field]: temporaryCode },
            { transaction }
        );
        const code = formatSequentialCode(prefix, record.id);
        await record.update({ [field]: code }, { transaction });
        return { record, code };
    });
}

module.exports = { createWithSequentialCode, formatSequentialCode };
