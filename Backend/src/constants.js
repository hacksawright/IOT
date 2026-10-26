module.exports = {
    ROLES: ['admin', 'operator', 'viewer'],

    DEVICE_TYPES: ['SENSOR', 'PUMP'],
    ACTUATOR_TYPES: ['PUMP'],
    AUTO_ACTUATORS: ['PUMP'],
    METRICS: ['SOIL_MOISTURE', 'AIR_TEMPERATURE', 'AIR_HUMIDITY'],

    // Vòng đời của Device; online/offline là trạng thái kết nối riêng của Node.
    LIFECYCLE: [
        'REGISTERED',
        'PROVISIONED',
        'ACTIVE',
        'FAULT',
        'MAINTENANCE',
        'DECOMMISSIONED'
    ],
    LIFECYCLE_TRANSITIONS: {
        REGISTERED: ['PROVISIONED', 'DECOMMISSIONED'],
        PROVISIONED: ['ACTIVE', 'DECOMMISSIONED'],
        ACTIVE: ['FAULT', 'MAINTENANCE', 'DECOMMISSIONED'],
        FAULT: ['ACTIVE', 'MAINTENANCE', 'DECOMMISSIONED'],
        MAINTENANCE: ['ACTIVE', 'DECOMMISSIONED'],
        DECOMMISSIONED: [],
    },

    COMMAND_SOURCES: ['MANUAL', 'AUTO', 'ALERT'],
    COMMAND_STATUS: ['PENDING', 'SENT', 'ACKED', 'FAILED', 'TIMEOUT'],

    ALERT_TYPES: ['disease', 'offline', 'fault', 'system', 'sensor_threshold'],
    SEVERITIES: ['CRITICAL', 'WARNING', 'INFO'],
    ALERT_STATUS: ['NEW', 'ACKNOWLEDGED', 'RESOLVED'],
};
