// ============================================================
// GASPOL V2 — Audit Controller
// File   : controllers/auditController.js
// Fungsi : Audit log — Port dari AuditLog.js GAS
// ============================================================

const { portalPool } = require('../config/database');
const { TABLES, USER_ROLES } = require('../config/constants');
const { success, error } = require('../utils/response');

// ── GET LOGS (Admin only) ───────────────────────────────────
exports.getLogs = async (req, res) => {
  try {
    if (![USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN].includes(req.ssoUser.user.role)) {
      return error(res, 'Akses ditolak.', 403);
    }

    const limit = parseInt(req.query?.limit || req.body?.limit) || 100;
    const [logs] = await portalPool.query(
      `SELECT * FROM ${TABLES.AUDIT_LOG} ORDER BY timestamp DESC LIMIT ?`, [limit]
    );

    return success(res, { logs });
  } catch (err) {
    console.error('[auditController.getLogs] Error:', err.message);
    return error(res, 'Gagal mengambil log.', 500);
  }
};

// ── GET USER LOGS ───────────────────────────────────────────
exports.getUserLogs = async (req, res) => {
  try {
    const { targetUserId } = req.params;
    const isSelf = req.ssoUser.userId === targetUserId;
    const isAdmin = [USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN].includes(req.ssoUser.user.role);

    if (!isSelf && !isAdmin) {
      return error(res, 'Akses ditolak.', 403);
    }

    const limit = parseInt(req.query?.limit) || 100;
    const [logs] = await portalPool.query(
      `SELECT * FROM ${TABLES.AUDIT_LOG} WHERE userId = ? ORDER BY timestamp DESC LIMIT ?`,
      [targetUserId, limit]
    );

    return success(res, { logs });
  } catch (err) {
    console.error('[auditController.getUserLogs] Error:', err.message);
    return error(res, 'Gagal mengambil log user.', 500);
  }
};
