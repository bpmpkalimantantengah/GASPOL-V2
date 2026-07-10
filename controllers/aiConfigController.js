const fs = require('fs');
const path = require('path');
const { success, error } = require('../utils/response');
const { USER_ROLES } = require('../config/constants');
const { _writeAuditLog } = require('./authController');

const AI_CONFIG_PATH = path.join(__dirname, '../config/aiConfig.json');

// Helper untuk membaca file
function readAIConfig() {
  try {
    if (!fs.existsSync(AI_CONFIG_PATH)) {
      return [];
    }
    const data = fs.readFileSync(AI_CONFIG_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('[aiConfigController] Error reading AI config:', err);
    return [];
  }
}

// Helper untuk menyimpan file
function writeAIConfig(data) {
  try {
    fs.writeFileSync(AI_CONFIG_PATH, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[aiConfigController] Error writing AI config:', err);
    return false;
  }
}

exports.getAIConfig = (req, res) => {
  try {
    // Pastikan user adalah SUPER_ADMIN
    if (req.ssoUser.user.role !== USER_ROLES.SUPER_ADMIN) {
      return error(res, 'Akses ditolak. Hanya Super Admin yang dapat mengakses Konfigurasi AI.', 403);
    }

    const rawList = readAIConfig();
    const apiList = rawList.map(item => ({
      id: item.id,
      apiKey: item.apiKey,
      apiKeyHint: item.apiKey ? '••••••••' + item.apiKey.slice(-6) : '',
      models: item.models,
      allowedApps: item.allowedApps,
      maxTokens: item.maxTokens
    }));

    return success(res, { apiList });
  } catch (err) {
    console.error('[aiConfigController.getAIConfig] Error:', err.message);
    return error(res, 'Gagal mengambil konfigurasi AI.', 500);
  }
};

exports.saveAIConfigList = async (req, res) => {
  try {
    if (req.ssoUser.user.role !== USER_ROLES.SUPER_ADMIN) {
      return error(res, 'Hanya Super Admin yang dapat mengubah konfigurasi AI.', 403);
    }

    const { apiList } = req.body;
    if (!Array.isArray(apiList)) {
      return error(res, 'Format data tidak valid.', 400);
    }

    const saved = writeAIConfig(apiList);
    if (!saved) {
      return error(res, 'Gagal menyimpan konfigurasi ke file system.', 500);
    }

    await _writeAuditLog(req.ssoUser.userId, req.ssoUser.user.username, 'AI_CONFIG_UPDATED', 'GASPOL', 'Daftar API AI diperbarui', 'SUCCESS');

    return success(res, { message: 'Konfigurasi AI berhasil disimpan.' });
  } catch (err) {
    console.error('[aiConfigController.saveAIConfigList] Error:', err.message);
    return error(res, 'Gagal menyimpan konfigurasi AI.', 500);
  }
};
