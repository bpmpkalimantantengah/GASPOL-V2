// ============================================================
// GASPOL V2 — Session Controller
// File   : controllers/sessionController.js
// Fungsi : Session management — Port dari SessionManager.js GAS
// ============================================================

const { portalPool } = require('../config/database');
const { TABLES, USER_ROLES } = require('../config/constants');
const { isExpired, formatDate } = require('../utils/helpers');
const { success, error } = require('../utils/response');

// ── GET ACTIVE SESSIONS COUNT ───────────────────────────────
exports.getActiveSessions = async (req, res) => {
  try {
    const [result] = await portalPool.query(
      `SELECT COUNT(DISTINCT userId) as total FROM ${TABLES.SESSIONS} WHERE isValid = 1 AND expiresAt > NOW()`
    );
    return success(res, { count: result[0].total });
  } catch (err) {
    console.error('[sessionController.getActiveSessions] Error:', err.message);
    return error(res, 'Gagal menghitung sesi aktif.', 500);
  }
};

// ── GET ONLINE USERS (Admin panel) ──────────────────────────
// Port dari SessionManager.getOnlineUsers() GAS
exports.getOnlineUsers = async (req, res) => {
  try {
    if (![USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN].includes(req.ssoUser.user.role)) {
      return error(res, 'Tidak memiliki izin.', 403);
    }

    // Query langsung JOIN — jauh lebih efisien daripada GAS yang harus getAll 3 tabel
    const [onlineUsers] = await portalPool.query(`
      SELECT 
        s.token, s.userId, s.appId, s.lastActivity, s.createdAt as sessionCreatedAt, s.userAgent,
        u.username, u.fullName, u.role,
        a.appName
      FROM ${TABLES.SESSIONS} s
      LEFT JOIN ${TABLES.USERS} u ON s.userId = u.userId
      LEFT JOIN ${TABLES.APPS} a ON s.appId = a.appId
      WHERE s.isValid = 1 AND s.expiresAt > NOW()
      ORDER BY s.lastActivity DESC
    `);

    // Kelompokkan per userId — ambil sesi terbaru per user
    const uniqueMap = {};
    onlineUsers.forEach(s => {
      if (!uniqueMap[s.userId] || new Date(s.lastActivity) > new Date(uniqueMap[s.userId].lastActivity)) {
        uniqueMap[s.userId] = {
          token: s.token,
          userId: s.userId,
          username: s.username || 'Unknown',
          fullName: s.fullName || 'Unknown',
          role: s.role || 'USER',
          appId: s.appId,
          appName: s.appName || s.appId || 'PORTAL',
          lastActivity: s.lastActivity || s.sessionCreatedAt,
          createdAt: s.sessionCreatedAt,
          userAgent: s.userAgent,
          isIdle: false,
        };
      }
    });

    return success(res, { onlineUsers: Object.values(uniqueMap) });

  } catch (err) {
    console.error('[sessionController.getOnlineUsers] Error:', err.message);
    return error(res, 'Gagal mengambil daftar user online.', 500);
  }
};

// ── INVALIDATE SESSION (Kick user) ──────────────────────────
exports.invalidateSession = async (req, res) => {
  try {
    if (![USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN].includes(req.ssoUser.user.role)) {
      return error(res, 'Tidak memiliki izin.', 403);
    }

    const { token } = req.body;
    if (!token) return error(res, 'Token wajib diisi.', 400);

    await portalPool.query(
      `UPDATE ${TABLES.SESSIONS} SET isValid = 0 WHERE token = ?`, [token]
    );

    return success(res, { message: 'Sesi berhasil diinvalidasi.' });

  } catch (err) {
    console.error('[sessionController.invalidateSession] Error:', err.message);
    return error(res, 'Gagal menginvalidasi sesi.', 500);
  }
};

// ── CLEAN EXPIRED SESSIONS (dipanggil oleh cron job) ────────
// Port dari SessionManager.cleanExpiredSessions() GAS
async function cleanExpiredSessions() {
  try {
    const [result] = await portalPool.query(
      `UPDATE ${TABLES.SESSIONS} SET isValid = 0 WHERE isValid = 1 AND expiresAt < NOW()`
    );
    console.log(`[SessionCron] Membersihkan ${result.affectedRows} sesi kedaluwarsa.`);
    return result.affectedRows;
  } catch (err) {
    console.error('[SessionCron] Error:', err.message);
    return 0;
  }
}

// Expose untuk cron job
module.exports.cleanExpiredSessions = cleanExpiredSessions;
