const { Op } = require('sequelize');
const ApiError = require('./apiError');

exports.userView = (user) => {
    const o = user.toJSON ? user.toJSON() : { ...user };
    delete o.passwordHash;
    return o;
};

exports.pick = (obj = {}, keys = []) =>
    keys.reduce((acc, k) => (obj[k] !== undefined ? { ...acc, [k]: obj[k] } : acc), {});

// Tạo điều kiện khoảng thời gian cho ?from=&to=
exports.dateRange = (query, field) => {
    const cond = {};
    if (query.from) {
        const d = new Date(query.from);
        if (isNaN(d)) throw ApiError.badRequest('from không hợp lệ');
        cond[Op.gte] = d;
    }
    if (query.to) {
        const d = new Date(query.to);
        if (isNaN(d)) throw ApiError.badRequest('to không hợp lệ');
        cond[Op.lte] = d;
    }
    return Reflect.ownKeys(cond).length ? { [field]: cond } : {};
};

exports.toBool = (v) =>
    v === true || v === 'true' || v === '1' ? true : v === false || v === 'false' || v === '0' ? false : undefined;
