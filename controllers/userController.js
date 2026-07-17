// ============================================================
// GASPOL V2 — User Controller
// File   : controllers/userController.js
// Fungsi : CRUD User — Port dari UserManager.js GAS (446 baris)
// ============================================================

const { portalPool } = require('../config/database');
const { TABLES, USER_STATUS, USER_ROLES } = require('../config/constants');
const { hashPassword, verifyPassword, generateUuid, generateSalt } = require('../utils/crypto');
const { formatDate, sanitize, isValidEmail, formatWhatsApp } = require('../utils/helpers');
const { success, error } = require('../utils/response');
const { _writeAuditLog } = require('./authController');

// ── GET ALL USERS ───────────────────────────────────────────
exports.getAllUsers = async (req, res) => {
  try {
    const [users] = await portalPool.query(`SELECT * FROM ${TABLES.USERS}`);
    const [allApps] = await portalPool.query(`SELECT * FROM ${TABLES.APPS} WHERE status != 'INACTIVE'`);
    const [allAccess] = await portalPool.query(`SELECT * FROM ${TABLES.APP_ACCESS}`);

    // Buat lookup maps O(1)
    const appsById = {};
    allApps.forEach(a => { appsById[a.appId] = a; });

    const accessByUser = {};
    allAccess.forEach(a => {
      if (!accessByUser[a.userId]) accessByUser[a.userId] = [];
      accessByUser[a.userId].push(a);
    });

    let result = users.map(u => {
      const { passwordHash, salt, loginAttempts, lockedUntil, ...safe } = u;
      safe.isDefaultPassword = verifyPassword(u.username + '12345', u.passwordHash, u.salt);
      const userAccess = accessByUser[u.userId] || [];
      safe.apps = userAccess
        .filter(a => appsById[a.appId])
        .map(a => `${appsById[a.appId].appName} (${a.appRole === 'admin' ? 'Admin' : 'User'})`);
      return safe;
    });

    // Filter berdasarkan wewenang caller (identik dengan Code.js line 376-388)
    const callerRole = req.ssoUser.user.role;
    if (callerRole === 'ADMIN') {
      const callerAccess = accessByUser[req.ssoUser.userId] || [];
      const callerAppNames = callerAccess
        .filter(a => appsById[a.appId])
        .map(a => appsById[a.appId].appName);

      result = result.filter(u => {
        if (u.userId === req.ssoUser.userId) return true;
        if (u.role === 'SUPER_ADMIN') return true;
        if (u.apps.length === 0) return true;
        return u.apps.some(appStr => callerAppNames.some(ca => appStr.startsWith(ca)));
      });
    }

    return success(res, { users: result });
  } catch (err) {
    console.error('[userController.getAllUsers] Error:', err.message);
    return error(res, 'Gagal mengambil data pengguna.', 500);
  }
};

// ── CREATE USER ─────────────────────────────────────────────
exports.createUser = async (req, res) => {
  try {
    let { username, email, whatsapp, fullName, password, role, instansi } = req.body;
    const caller = req.ssoUser;

    if (![USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN].includes(caller.user.role)) {
      return error(res, 'Tidak memiliki izin membuat pengguna.', 403);
    }

    // Default password: username + '12345'
    if (!password && username) password = username + '12345';

    if (!username || !fullName) return error(res, 'Username dan Nama Lengkap wajib diisi.', 400);
    if (!email && !whatsapp) return error(res, 'Minimal salah satu antara Email atau WhatsApp wajib diisi.', 400);
    if (email && !isValidEmail(email)) return error(res, 'Format email tidak valid.', 400);
    if (password.length < 8) return error(res, 'Password minimal 8 karakter.', 400);

    if (role === USER_ROLES.SUPER_ADMIN && caller.user.role !== USER_ROLES.SUPER_ADMIN) {
      return error(res, 'Hanya Super Admin yang bisa membuat akun Super Admin.', 403);
    }

    // Cek duplikasi
    const [existUser] = await portalPool.query(
      `SELECT userId FROM ${TABLES.USERS} WHERE LOWER(username) = LOWER(?) LIMIT 1`, [sanitize(username)]
    );
    if (existUser.length > 0) return error(res, 'Username sudah digunakan.', 409);

    if (email) {
      const [existEmail] = await portalPool.query(
        `SELECT userId FROM ${TABLES.USERS} WHERE LOWER(email) = LOWER(?) LIMIT 1`, [sanitize(email).toLowerCase()]
      );
      if (existEmail.length > 0) return error(res, 'Email sudah digunakan.', 409);
    }

    const salt = generateSalt();
    const now = formatDate(new Date());
    const userId = generateUuid();

    await portalPool.query(
      `INSERT INTO ${TABLES.USERS} (userId, username, email, whatsapp, passwordHash, salt, fullName, role, status, loginAttempts, lockedUntil, createdAt, updatedAt, lastLogin, instansi) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, sanitize(username), email ? sanitize(email).toLowerCase() : '', formatWhatsApp(sanitize(whatsapp || '')), hashPassword(password, salt), salt, sanitize(fullName), role || USER_ROLES.USER, USER_STATUS.ACTIVE, 0, null, now, now, '', sanitize(instansi || '')]
    );

    await _writeAuditLog(caller.userId, caller.user.username, 'CREATE_USER', '', 'Membuat user: ' + username, 'SUCCESS');
    return success(res, { userId, username: sanitize(username) }, 201);

  } catch (err) {
    console.error('[userController.createUser] Error:', err.message);
    return error(res, 'Gagal membuat pengguna.', 500);
  }
};

// ── UPDATE USER ─────────────────────────────────────────────
exports.updateUser = async (req, res) => {
  try {
    const { targetUserId } = req.params;
    const caller = req.ssoUser;
    const data = req.body;

    if (![USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN].includes(caller.user.role)) {
      return error(res, 'Tidak memiliki izin.', 403);
    }

    const [users] = await portalPool.query(
      `SELECT * FROM ${TABLES.USERS} WHERE userId = ? LIMIT 1`, [targetUserId]
    );
    if (users.length === 0) return error(res, 'User tidak ditemukan.', 404);
    const target = users[0];

    // Admin tidak bisa edit Super Admin
    if (target.role === USER_ROLES.SUPER_ADMIN && caller.user.role !== USER_ROLES.SUPER_ADMIN) {
      return error(res, 'Tidak bisa mengedit Super Admin.', 403);
    }

    const updates = {};
    if (data.fullName !== undefined) updates.fullName = sanitize(data.fullName);
    if (data.email !== undefined) updates.email = sanitize(data.email).toLowerCase();
    if (data.whatsapp !== undefined) updates.whatsapp = formatWhatsApp(sanitize(data.whatsapp));
    if (data.instansi !== undefined) updates.instansi = sanitize(data.instansi);
      if (data.role !== undefined) {
      if (data.role === USER_ROLES.SUPER_ADMIN && caller.user.role !== USER_ROLES.SUPER_ADMIN) {
        return error(res, 'Hanya Super Admin yang bisa menjadikan Super Admin.', 403);
      }
      updates.role = data.role;
    }
    if (data.status !== undefined) {
      updates.status = data.status;
      // Jika disuspend, invalidasi semua session
      if (data.status === USER_STATUS.SUSPENDED) {
        await portalPool.query(
          `UPDATE ${TABLES.SESSIONS} SET isValid = 0 WHERE userId = ?`, [targetUserId]
        );
      }
    }
    updates.updatedAt = formatDate(new Date());

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const setValues = Object.values(updates);

    await portalPool.query(
      `UPDATE ${TABLES.USERS} SET ${setClauses} WHERE userId = ?`,
      [...setValues, targetUserId]
    );

    await _writeAuditLog(caller.userId, caller.user.username, 'UPDATE_USER', '', 'Update user: ' + target.username, 'SUCCESS');
    return success(res, {});

  } catch (err) {
    console.error('[userController.updateUser] Error:', err.message);
    return error(res, 'Gagal memperbarui pengguna.', 500);
  }
};

// ── DELETE USER ─────────────────────────────────────────────
exports.deleteUser = async (req, res) => {
  try {
    const { targetUserId } = req.params;
    const caller = req.ssoUser;

    if (![USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN].includes(caller.user.role)) {
      return error(res, 'Tidak memiliki izin.', 403);
    }

    if (targetUserId === caller.userId) {
      return error(res, 'Tidak bisa menghapus akun sendiri.', 400);
    }

    const [users] = await portalPool.query(
      `SELECT * FROM ${TABLES.USERS} WHERE userId = ? LIMIT 1`, [targetUserId]
    );
    if (users.length === 0) return error(res, 'User tidak ditemukan.', 404);

    if (users[0].role === USER_ROLES.SUPER_ADMIN && caller.user.role !== USER_ROLES.SUPER_ADMIN) {
      return error(res, 'Tidak bisa menghapus Super Admin.', 403);
    }

    // Hapus session, akses, lalu user
    await portalPool.query(`DELETE FROM ${TABLES.SESSIONS} WHERE userId = ?`, [targetUserId]);
    await portalPool.query(`DELETE FROM ${TABLES.APP_ACCESS} WHERE userId = ?`, [targetUserId]);
    await portalPool.query(`DELETE FROM ${TABLES.USERS} WHERE userId = ?`, [targetUserId]);

    await _writeAuditLog(caller.userId, caller.user.username, 'DELETE_USER', '', 'Hapus user: ' + users[0].username, 'SUCCESS');
    return success(res, {});

  } catch (err) {
    console.error('[userController.deleteUser] Error:', err.message);
    return error(res, 'Gagal menghapus pengguna.', 500);
  }
};

// ── RESET PASSWORD ──────────────────────────────────────────
exports.resetPassword = async (req, res) => {
  try {
    const { targetUserId } = req.params;
    const { newPassword } = req.body;
    const caller = req.ssoUser;

    if (![USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN].includes(caller.user.role)) {
      return error(res, 'Tidak memiliki izin.', 403);
    }

    const [users] = await portalPool.query(
      `SELECT username FROM ${TABLES.USERS} WHERE userId = ? LIMIT 1`, [targetUserId]
    );
    if (users.length === 0) return error(res, 'User tidak ditemukan.', 404);

    const pwd = newPassword || (users[0].username + '12345');
    const newSalt = generateSalt();
    const newHash = hashPassword(pwd, newSalt);

    await portalPool.query(
      `UPDATE ${TABLES.USERS} SET passwordHash = ?, salt = ?, updatedAt = ? WHERE userId = ?`,
      [newHash, newSalt, formatDate(new Date()), targetUserId]
    );

    await _writeAuditLog(caller.userId, caller.user.username, 'RESET_PASSWORD', '', 'Reset password: ' + users[0].username, 'SUCCESS');
    return success(res, {});

  } catch (err) {
    console.error('[userController.resetPassword] Error:', err.message);
    return error(res, 'Gagal mereset password.', 500);
  }
};

// ── BULK CREATE USERS ───────────────────────────────────────
exports.bulkCreateUsers = async (req, res) => {
  try {
    const { usersData } = req.body;
    const caller = req.ssoUser;

    if (![USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN].includes(caller.user.role)) {
      return error(res, 'Tidak memiliki izin.', 403);
    }

    if (!usersData || !Array.isArray(usersData) || usersData.length === 0) {
      return error(res, 'Data users kosong.', 400);
    }

    let created = 0;
    const errors = [];

    for (const u of usersData) {
      try {
        const pwd = u.password || (u.username + '12345');
        const salt = generateSalt();
        const now = formatDate(new Date());

        await portalPool.query(
          `INSERT IGNORE INTO ${TABLES.USERS} (userId, username, email, whatsapp, passwordHash, salt, fullName, role, status, loginAttempts, lockedUntil, createdAt, updatedAt, lastLogin, instansi) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [generateUuid(), sanitize(u.username || ''), u.email ? sanitize(u.email).toLowerCase() : '', formatWhatsApp(sanitize(u.whatsapp || '')), hashPassword(pwd, salt), salt, sanitize(u.fullName || ''), u.role || USER_ROLES.USER, USER_STATUS.ACTIVE, 0, null, now, now, '', sanitize(u.instansi || '')]
        );
        created++;
      } catch (e) {
        errors.push({ username: u.username, error: e.message });
      }
    }

    await _writeAuditLog(caller.userId, caller.user.username, 'BULK_CREATE_USERS', '', `Bulk create: ${created}/${usersData.length}`, 'SUCCESS');
    return success(res, { created, total: usersData.length, errors });

  } catch (err) {
    console.error('[userController.bulkCreateUsers] Error:', err.message);
    return error(res, 'Gagal bulk create users.', 500);
  }
};

// ── BULK DELETE USERS ───────────────────────────────────────
exports.bulkDeleteUser = async (req, res) => {
  try {
    const { userIds } = req.body;
    const caller = req.ssoUser;

    if (caller.user.role !== USER_ROLES.SUPER_ADMIN) {
      return error(res, 'Hanya Super Admin yang bisa bulk delete.', 403);
    }

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return error(res, 'User IDs kosong.', 400);
    }

    // Jangan hapus diri sendiri
    const safeIds = userIds.filter(id => id !== caller.userId);
    if (safeIds.length === 0) return error(res, 'Tidak ada user yang valid untuk dihapus.', 400);

    await portalPool.query(`DELETE FROM ${TABLES.SESSIONS} WHERE userId IN (?)`, [safeIds]);
    await portalPool.query(`DELETE FROM ${TABLES.APP_ACCESS} WHERE userId IN (?)`, [safeIds]);
    const [result] = await portalPool.query(`DELETE FROM ${TABLES.USERS} WHERE userId IN (?)`, [safeIds]);

    await _writeAuditLog(caller.userId, caller.user.username, 'BULK_DELETE_USERS', '', `Bulk delete: ${result.affectedRows} users`, 'SUCCESS');
    return success(res, { deleted: result.affectedRows });

  } catch (err) {
    console.error('[userController.bulkDeleteUser] Error:', err.message);
    return error(res, 'Gagal bulk delete users.', 500);
  }
};

// ── BULK RESET PASSWORD ─────────────────────────────────────
exports.bulkResetPassword = async (req, res) => {
  try {
    const { userIds } = req.body;
    const caller = req.ssoUser;

    if (![USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN].includes(caller.user.role)) {
      return error(res, 'Tidak memiliki izin.', 403);
    }

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return error(res, 'User IDs kosong.', 400);
    }

    const [users] = await portalPool.query(
      `SELECT userId, username FROM ${TABLES.USERS} WHERE userId IN (?)`, [userIds]
    );

    const promises = users.map(u => {
      const pwd = u.username + '12345';
      const salt = generateSalt();
      return portalPool.query(
        `UPDATE ${TABLES.USERS} SET passwordHash = ?, salt = ?, updatedAt = ? WHERE userId = ?`,
        [hashPassword(pwd, salt), salt, formatDate(new Date()), u.userId]
      );
    });
    
    await Promise.all(promises);
    const count = users.length;

    await _writeAuditLog(caller.userId, caller.user.username, 'BULK_RESET_PASSWORD', '', `Bulk reset: ${count} users`, 'SUCCESS');
    return success(res, { reset: count });

  } catch (err) {
    console.error('[userController.bulkResetPassword] Error:', err.message);
    return error(res, 'Gagal bulk reset password.', 500);
  }
};
