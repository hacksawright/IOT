const { Op } = require('sequelize');
const { Device, DeviceCommand } = require('../models');
const { AUTO_ACTUATORS } = require('../constants');
const commandService = require('./command.service');

const OPS = {
  lt: (v, t) => v < t,
  lte: (v, t) => v <= t,
  gt: (v, t) => v > t,
  gte: (v, t) => v >= t,
};

/**
 * config.auto example:
 * { enabled: true, sourceDeviceCode: 'SOIL-01', metric: 'SOIL_MOISTURE',
 *   onOp: 'lt', onValue: 30, offOp: 'gt', offValue: 60, cooldownSec: 30 }
 * Legacy sourceDeviceId is still read for old stored config, but new config uses sourceDeviceCode.
 * There is intentionally no AUTO/MANUAL control mode: a manual command acts immediately,
 * and enabled threshold automation remains active on subsequent fresh telemetry.
 */
exports.evaluate = async (reading) => {
  const actuators = await Device.findAll({
    where: { type: { [Op.in]: AUTO_ACTUATORS }, lifecycle: 'ACTIVE' },
  });

  for (const actuator of actuators) {
    const auto = actuator.config && actuator.config.auto;
    if (!auto || auto.enabled !== true) continue;

    const sourceMatches = typeof auto.sourceDeviceCode === 'number'
      ? Number(auto.sourceDeviceCode) === Number(reading.deviceId) // legacy draft stored a DB ID in this field
      : auto.sourceDeviceCode
        ? String(auto.sourceDeviceCode).trim() === String(reading.deviceCode || '').trim()
        : auto.sourceDeviceId !== undefined && auto.sourceDeviceId !== null
          ? Number(auto.sourceDeviceId) === Number(reading.deviceId)
          : false;
    if (!sourceMatches || auto.metric !== reading.metric) continue;

    const cooldownSec = Number(auto.cooldownSec ?? 30);
    const cooldown = (Number.isFinite(cooldownSec) && cooldownSec >= 0 ? cooldownSec : 30) * 1000;
    const last = await DeviceCommand.findOne({
      where: { deviceId: actuator.id, source: 'AUTO' },
      order: [['id', 'DESC']],
    });
    if (last && Date.now() - new Date(last.createdAt).getTime() < cooldown) continue;
    if (await commandService.hasInFlight(actuator.id)) continue;

    const value = Number(reading.value);
    if (!Number.isFinite(value)) continue;
    if (!actuator.isOn && OPS[String(auto.onOp || '').toLowerCase()]?.(value, Number(auto.onValue))) {
      await commandService.issue({ device: actuator, turnOn: true, source: 'AUTO', sensorValue: value });
    } else if (actuator.isOn && OPS[String(auto.offOp || '').toLowerCase()]?.(value, Number(auto.offValue))) {
      await commandService.issue({ device: actuator, turnOn: false, source: 'AUTO', sensorValue: value });
    }
  }
};
