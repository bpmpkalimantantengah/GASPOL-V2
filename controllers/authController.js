// ============================================================
// GASPOL V2 — Auth Controller
// File   : controllers/authController.js
// Fungsi : Login, Logout, Validate Token, Change Password
//          Port 1:1 dari Auth.js GAS (344 baris)
// ============================================================

const { portalPool } = require('../config/database');
const { TABLES, USER_STATUS, USER_ROLES, SSO_CONFIG } = require('../config/constants');
const { hashPassword, verifyPassword, hashLegacy, generateUuid, generateSalt } = require('../utils/crypto');
const { formatDate, isExpired, addHours, addMinutes } = require('../utils/helpers');
const { invalidateCache } = require('../middlewares/authMiddleware');
const { success, error } = require('../utils/response');

// ── LOGIN ───────────────────────────────────────────────────
// Port dari Auth.login() GAS — Auth.js line 12-113
exports.login = async (req, res) => {
  try {
    const { username, password, appId } = req.body;
    if (!username || !password) {
      return error(res, 'Username dan password wajib diisi.', 400);
    }

    const clean = String(username).replace(/[<>"'`]/g, '').trim();

    // 1. Cari user berdasarkan username atau email
    const [users] = await portalPool.query(
      `SELECT * FROM ${TABLES.USERS} WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?) LIMIT 1`,
      [clean, clean]
    );
    const user = users[0];

    if (!user) {
      await _writeAuditLog(null, null, 'LOGIN_FAILED', appId, 'User tidak ditemukan: ' + clean, 'FAILED');
      return error(res, 'Username atau password salah.', 401);
    }

    // 2. Cek status akun
    if (user.status === USER_STATUS.INACTIVE) {
      return error(res, 'Akun Anda belum aktif. Hubungi administrator.', 403);
    }
    if (user.status === USER_STATUS.SUSPENDED) {
      return error(res, 'Akun Anda disuspend. Hubungi administrator.', 403);
    }

    // 3. Cek lockout
    if (user.lockedUntil && new Date() < new Date(user.lockedUntil)) {
      const remaining = Math.ceil((new Date(user.lockedUntil) - new Date()) / 60000);
      return error(res, 'Akun dikunci. Coba lagi dalam ' + remaining + ' menit.', 423);
    }

    // 4. Verifikasi password
    let passwordOk = verifyPassword(password, user.passwordHash, user.salt);
    let isLegacy = false;

    // -- LEGACY SUPPORT (identik dengan Auth.js line 44-59) --
    if (!passwordOk) {
      if (user.salt === 'LEGACY_HUB_MITRA') {
        const legacyHash = hashLegacy(password, 'BPMP_KALTENG_SALT_2024');
        if (legacyHash === user.passwordHash) { passwordOk = true; isLegacy = true; }
      }
      else if (user.salt === 'LEGACY_ZOOM') {
        const legacyHash = hashLegacy(password, 'ZMM_SECURE_SALT_2026_', true);
        if (legacyHash === user.passwordHash) { passwordOk = true; isLegacy = true; }
      }
      else if (user.salt === 'LEGACY_ZOOM_PLAIN') {
        if (password === user.passwordHash) { passwordOk = true; isLegacy = true; }
      }
    }

    if (!passwordOk) {
      const attempts = parseInt(user.loginAttempts || 0) + 1;
      const updates = { loginAttempts: attempts, updatedAt: formatDate(new Date()) };

      if (attempts >= SSO_CONFIG.maxLoginAttempts) {
        updates.lockedUntil = formatDate(addMinutes(new Date(), SSO_CONFIG.lockoutMinutes));
        updates.loginAttempts = 0;
        await _writeAuditLog(user.userId, user.username, 'ACCOUNT_LOCKED', appId, 'Max percobaan login tercapai', 'FAILED');
      }

      await portalPool.query(
        `UPDATE ${TABLES.USERS} SET loginAttempts = ?, lockedUntil = ?, updatedAt = ? WHERE userId = ?`,
        [updates.loginAttempts, updates.lockedUntil || user.lockedUntil, updates.updatedAt, user.userId]
      );

      await _writeAuditLog(user.userId, user.username, 'LOGIN_FAILED', appId, 'Password salah (percobaan ke-' + attempts + ')', 'FAILED');
      return error(res, 'Username atau password salah.', 401);
    }

    // 5. Reset login attempts, update lastLogin
    const updateFields = {
      loginAttempts: 0,
      lockedUntil: null,
      lastLogin: formatDate(new Date()),
      updatedAt: formatDate(new Date()),
    };

    // Auto-upgrade legacy password ke standar GASPOL
    if (isLegacy) {
      const newSalt = generateSalt();
      updateFields.salt = newSalt;
      updateFields.passwordHash = hashPassword(password, newSalt);
    }

    await portalPool.query(
      `UPDATE ${TABLES.USERS} SET loginAttempts = ?, lockedUntil = ?, lastLogin = ?, updatedAt = ?${isLegacy ? ', salt = ?, passwordHash = ?' : ''} WHERE userId = ?`,
      isLegacy
        ? [updateFields.loginAttempts, updateFields.lockedUntil, updateFields.lastLogin, updateFields.updatedAt, updateFields.salt, updateFields.passwordHash, user.userId]
        : [updateFields.loginAttempts, updateFields.lockedUntil, updateFields.lastLogin, updateFields.updatedAt, user.userId]
    );

    // 5.5. Concurrent Login Control
    if (SSO_CONFIG.preventConcurrentLogins) {
      await portalPool.query(
        `UPDATE ${TABLES.SESSIONS} SET isValid = 0 WHERE userId = ? AND isValid = 1`,
        [user.userId]
      );
    }

    // 6. Buat session token
    const token = await _createSession(user.userId, appId);

    // 7. Ambil daftar aplikasi yang bisa diakses user
    const apps = await _getAppsForUser(user.userId, user.role);

    await _writeAuditLog(user.userId, user.username, 'LOGIN_SUCCESS', appId, 'Login berhasil', 'SUCCESS');

    // 8. Sanitize user
    const { passwordHash, salt, loginAttempts: la, lockedUntil: lu, ...safeUser } = user;
    safeUser.isDefaultPassword = verifyPassword(user.username + '12345', user.passwordHash, user.salt);

    return success(res, { token, user: safeUser, apps });

  } catch (err) {
    console.error('[authController.login] Error:', err.message);
    return error(res, 'Terjadi kesalahan sistem. Coba lagi.', 500);
  }
};

// ── LOGIN DENGAN GOOGLE JWT ─────────────────────────────────
// Port dari Auth.loginWithGoogleJWT() GAS — Auth.js line 270-326
exports.loginWithGoogle = async (req, res) => {
  try {
    const { credential, appId } = req.body;
    if (!credential) return error(res, 'Token Google tidak disertakan.', 400);

    // Verifikasi JWT via Google TokenInfo API
    const response = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + credential);
    if (!response.ok) {
      return error(res, 'Token Google tidak valid (Invalid Signature/Expired).', 401);
    }

    const payload = await response.json();
    const email = payload.email;
    if (!email) return error(res, 'Email tidak ditemukan dari akun Google.', 400);

    // Cari user berdasarkan email
    const [users] = await portalPool.query(
      `SELECT * FROM ${TABLES.USERS} WHERE LOWER(email) = LOWER(?) LIMIT 1`, [email]
    );
    const user = users[0];

    if (!user) {
      await _writeAuditLog(null, null, 'LOGIN_FAILED', appId, 'Login Google Gagal: Email tidak terdaftar (' + email + ')', 'FAILED');
      return error(res, 'Email Anda (' + email + ') belum terdaftar di sistem GASPOL.', 401);
    }

    if (user.status === USER_STATUS.INACTIVE) {
      return error(res, 'Akun Anda belum aktif. Hubungi administrator.', 403);
    }
    if (user.status === USER_STATUS.SUSPENDED) {
      return error(res, 'Akun Anda disuspend. Hubungi administrator.', 403);
    }

    // Update lastLogin
    await portalPool.query(
      `UPDATE ${TABLES.USERS} SET loginAttempts = 0, lockedUntil = NULL, lastLogin = ?, updatedAt = ? WHERE userId = ?`,
      [formatDate(new Date()), formatDate(new Date()), user.userId]
    );

    // Concurrent Login Control
    if (SSO_CONFIG.preventConcurrentLogins) {
      await portalPool.query(
        `UPDATE ${TABLES.SESSIONS} SET isValid = 0 WHERE userId = ? AND isValid = 1`,
        [user.userId]
      );
    }

    const token = await _createSession(user.userId, appId);
    const apps = await _getAppsForUser(user.userId, user.role);

    await _writeAuditLog(user.userId, user.username, 'LOGIN_SUCCESS', appId, 'Login Google berhasil', 'SUCCESS');

    const { passwordHash, salt, loginAttempts, lockedUntil, ...safeUser } = user;
    safeUser.isDefaultPassword = verifyPassword(user.username + '12345', user.passwordHash, user.salt);

    return success(res, { token, user: safeUser, apps });

  } catch (err) {
    console.error('[authController.loginWithGoogle] Error:', err.message);
    return error(res, 'Terjadi kesalahan sistem saat memvalidasi Google Login.', 500);
  }
};

// ── LOGOUT ──────────────────────────────────────────────────
// Port dari Auth.logout() GAS — Auth.js line 116-136
exports.logout = async (req, res) => {
  try {
    const token = req.headers['x-sso-token'] || req.body?.token || req.query?.token;
    if (!token) return error(res, 'Token tidak ditemukan.', 400);

    const [sessions] = await portalPool.query(
      `SELECT * FROM ${TABLES.SESSIONS} WHERE token = ? LIMIT 1`, [token]
    );
    const session = sessions[0];
    if (!session) return success(res, {}); // Sudah logout

    await portalPool.query(
      `UPDATE ${TABLES.SESSIONS} SET isValid = 0 WHERE token = ?`, [token]
    );

    // Invalidasi cache
    invalidateCache(token);

    const [users] = await portalPool.query(
      `SELECT username FROM ${TABLES.USERS} WHERE userId = ? LIMIT 1`, [session.userId]
    );
    await _writeAuditLog(session.userId, users[0]?.username || '', 'LOGOUT', session.appId, 'Logout berhasil', 'SUCCESS');

    return success(res, {});

  } catch (err) {
    console.error('[authController.logout] Error:', err.message);
    return error(res, 'Gagal logout.', 500);
  }
};

// ── VALIDATE TOKEN (untuk child apps / API) ─────────────────
// Port dari Auth.validateToken() GAS — Auth.js line 142-224
// Ini dipakai oleh child apps GAS yang masih aktif sebagai pengganti hit ke GAS Portal
exports.validateToken = async (req, res) => {
  try {
    const token = req.query?.token || req.body?.token || req.headers['x-sso-token'];
    const appId = req.query?.appId || req.body?.appId || '';

    const { validateTokenFromDB } = require('../middlewares/authMiddleware');
    const result = await validateTokenFromDB(token, appId);
    return res.json(result);

  } catch (err) {
    console.error('[authController.validateToken] Error:', err.message);
    return res.json({ valid: false, error: 'Gagal memvalidasi token.' });
  }
};

// ── HEARTBEAT (Update lastActivity untuk mencegah Idle Timeout) ─
exports.heartbeat = async (req, res) => {
  try {
    const token = req.query?.token || req.body?.token || req.headers['x-sso-token'];
    if (!token) return error(res, 'Token tidak disertakan.', 400);

    const { formatDate } = require('../utils/helpers');
    const [result] = await portalPool.query(
      `UPDATE ${TABLES.SESSIONS} SET lastActivity = ? WHERE token = ? AND isValid = 1`,
      [formatDate(new Date()), token]
    );

    if (result.affectedRows === 0) {
      return error(res, 'Sesi tidak aktif atau tidak ditemukan.', 401);
    }
    
    return success(res, { status: 'alive' });
  } catch (err) {
    console.error('[authController.heartbeat] Error:', err.message);
    return error(res, 'Gagal mengirim heartbeat.', 500);
  }
};

// ── CHANGE PASSWORD ─────────────────────────────────────────
// Port dari Auth.changePassword() GAS — Auth.js line 227-260
exports.changePassword = async (req, res) => {
  try {
    if (!req.ssoUser || !req.ssoUser.valid) {
      return error(res, 'Sesi tidak valid.', 401);
    }

    const { oldPassword, newPassword } = req.body;
    const userId = req.ssoUser.userId;

    const [users] = await portalPool.query(
      `SELECT * FROM ${TABLES.USERS} WHERE userId = ? LIMIT 1`, [userId]
    );
    const user = users[0];
    if (!user) return error(res, 'User tidak ditemukan.', 404);

    if (!verifyPassword(oldPassword, user.passwordHash, user.salt)) {
      return error(res, 'Password lama tidak benar.', 400);
    }

    if (!newPassword || newPassword.length < 8) {
      return error(res, 'Password baru minimal 8 karakter.', 400);
    }

    const newSalt = generateSalt();
    const newHash = hashPassword(newPassword, newSalt);

    await portalPool.query(
      `UPDATE ${TABLES.USERS} SET passwordHash = ?, salt = ?, updatedAt = ? WHERE userId = ?`,
      [newHash, newSalt, formatDate(new Date()), userId]
    );

    // Invalidasi semua session lain kecuali token saat ini
    const currentToken = req.headers['x-sso-token'] || req.body?.sso_token;
    await portalPool.query(
      `UPDATE ${TABLES.SESSIONS} SET isValid = 0 WHERE userId = ? AND token != ?`,
      [userId, currentToken || '']
    );

    await _writeAuditLog(userId, user.username, 'PASSWORD_CHANGED', '', 'Password berhasil diganti', 'SUCCESS');
    return success(res, {});

  } catch (err) {
    console.error('[authController.changePassword] Error:', err.message);
    return error(res, 'Gagal mengganti password.', 500);
  }
};

// ── GET SYSTEM STATS (Dashboard) ────────────────────────────
exports.getStats = async (req, res) => {
  try {
    const [userCount] = await portalPool.query(`SELECT COUNT(*) as total FROM ${TABLES.USERS}`);
    const [appCount] = await portalPool.query(`SELECT COUNT(*) as total FROM ${TABLES.APPS}`);
    const [sessionCount] = await portalPool.query(
      `SELECT COUNT(DISTINCT userId) as total FROM ${TABLES.SESSIONS} WHERE isValid = 1 AND expiresAt > NOW()`
    );
    const [recentLogs] = await portalPool.query(
      `SELECT * FROM ${TABLES.AUDIT_LOG} ORDER BY timestamp DESC LIMIT 10`
    );

    return success(res, {
      totalUsers: userCount[0].total,
      totalApps: appCount[0].total,
      activeSessions: sessionCount[0].total,
      recentLogs: recentLogs,
    });
  } catch (err) {
    console.error('[authController.getStats] Error:', err.message);
    return error(res, 'Gagal mengambil statistik.', 500);
  }
};

// ── HELPER: Buat Session ────────────────────────────────────
async function _createSession(userId, appId) {
  const token = generateUuid();
  const now = new Date();
  const expires = addHours(now, SSO_CONFIG.sessionDurationHours);

  await portalPool.query(
    `INSERT INTO ${TABLES.SESSIONS} (token, userId, appId, createdAt, expiresAt, lastActivity, userAgent, isValid) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [token, userId, appId || 'PORTAL', formatDate(now), formatDate(expires), formatDate(now), 'GASPOL-V2', 1]
  );

  return token;
}

// ── HELPER: Ambil daftar apps untuk user ────────────────────
async function _getAppsForUser(userId, userRole) {
  const [allApps] = await portalPool.query(
    `SELECT * FROM ${TABLES.APPS} WHERE status != 'INACTIVE'`
  );

  if (userRole === USER_ROLES.SUPER_ADMIN) {
    return allApps.map(a => ({ ...a, appRole: 'admin' }));
  }

  const [accesses] = await portalPool.query(
    `SELECT * FROM ${TABLES.APP_ACCESS} WHERE userId = ?`, [userId]
  );

  const accessMap = {};
  accesses.forEach(a => { accessMap[a.appId] = a; });

  return allApps
    .filter(a => accessMap[a.appId])
    .map(a => ({ ...a, appRole: accessMap[a.appId].appRole || 'user' }));
}

// ── HELPER: Tulis Audit Log ─────────────────────────────────
async function _writeAuditLog(userId, username, action, appId, detail, status) {
  try {
    await portalPool.query(
      `INSERT INTO ${TABLES.AUDIT_LOG} (logId, timestamp, userId, username, action, appId, detail, ipAddress, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [generateUuid(), formatDate(new Date()), userId || '', username || '', action || '', appId || '', detail || '', '', status || 'INFO']
    );
  } catch (err) {
    // Jangan sampai error logging merusak flow utama
    console.error('[AuditLog] Gagal menulis log:', err.message);
  }
}

// Expose helper untuk dipakai controller lain
exports._writeAuditLog = _writeAuditLog;
exports._createSession = _createSession;
exports._getAppsForUser = _getAppsForUser;
