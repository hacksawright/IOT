const provisioningService = require('../services/provisioning.service');

exports.claim = async (req, res) => {
    const result = await provisioningService.claim(req.body?.provisioningToken);
    res.json({
        success: true,
        data: result,
        message: 'Provisioning thành công. Hãy lưu MQTT credential vào vùng lưu trữ bảo mật của thiết bị.',
    });
};
