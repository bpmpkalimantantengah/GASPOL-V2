// ============================================================
// GASPOL V2 — App Controller
// File   : controllers/appController.js
// Fungsi : Registry aplikasi & kontrol akses per user
//          Port dari AppRegistry.js GAS (363 baris)
// ============================================================

const { portalPool } = require('../config/database');
const { TABLES, USER_ROLES, APP_STATUS } = require('../config/constants');
const { generateUuid, generateSalt } = require('../utils/crypto');
const { formatDate, sanitize } = require('../utils/helpers');
const { success, error } = require('../utils/response');
const { _writeAuditLog } = require('./authController');

// ── GET ALL APPS (Admin only) ───────────────────────────────
exports.getAllApps = async (req, res) => {
  try {
    const [apps] = await portalPool.query(`SELECT * FROM ${TABLES.APPS}`);
    return success(res, { apps });
  } catch (err) {
    console.error('[appController.getAllApps] Error:', err.message);
    return error(res, 'Gagal mengambil daftar aplikasi.', 500);
  }
};

// ── GET APPS FOR USER ───────────────────────────────────────
exports.getAppsForUser = async (req, res) => {
  try {
    const userId = req.ssoUser.userId;
    const userRole = req.ssoUser.user.role;

    const [allApps] = await portalPool.query(
      `SELECT * FROM ${TABLES.APPS} WHERE status != 'INACTIVE'`
    );

    if (userRole === USER_ROLES.SUPER_ADMIN) {
      return success(res, { apps: allApps.map(a => ({ ...a, appRole: 'admin' })) });
    }

    const [accesses] = await portalPool.query(
      `SELECT * FROM ${TABLES.APP_ACCESS} WHERE userId = ?`, [userId]
    );

    const accessMap = {};
    accesses.forEach(a => { accessMap[a.appId] = a; });

    const userApps = allApps
      .filter(a => accessMap[a.appId])
      .map(a => ({ ...a, appRole: accessMap[a.appId].appRole || 'user' }));

    return success(res, { apps: userApps });
  } catch (err) {
    console.error('[appController.getAppsForUser] Error:', err.message);
    return error(res, 'Gagal mengambil daftar aplikasi.', 500);
  }
};

// ── REGISTER APP ────────────────────────────────────────────
exports.registerApp = async (req, res) => {
  try {
    const caller = req.ssoUser;
    if (caller.user.role !== USER_ROLES.SUPER_ADMIN) {
      return error(res, 'Hanya Super Admin yang bisa mendaftarkan aplikasi.', 403);
    }

    const { appName, appUrl, description, appIcon, color } = req.body;
    if (!appName || !appUrl) {
      return error(res, 'Nama aplikasi dan URL wajib diisi.', 400);
    }

    const app = {
      appId       : 'APP_' + generateUuid().replace(/-/g, '').substring(0, 8).toUpperCase(),
      appName     : sanitize(appName),
      appUrl      : sanitize(appUrl),
      appIcon     : appIcon || 'ti-app',
      description : sanitize(description || ''),
      color       : color || '#1E90FF',
      status      : APP_STATUS.ACTIVE,
      secretKey   : generateSalt(),
      createdAt   : formatDate(new Date()),
      updatedAt   : formatDate(new Date()),
    };

    await portalPool.query(
      `INSERT INTO ${TABLES.APPS} (appId, appName, appUrl, appIcon, description, color, status, secretKey, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [app.appId, app.appName, app.appUrl, app.appIcon, app.description, app.color, app.status, app.secretKey, app.createdAt, app.updatedAt]
    );

    await _writeAuditLog(caller.userId, caller.user.username, 'REGISTER_APP', app.appId, 'Daftarkan app: ' + appName, 'SUCCESS');
    return success(res, { app }, 201);

  } catch (err) {
    console.error('[appController.registerApp] Error:', err.message);
    return error(res, 'Gagal mendaftarkan aplikasi.', 500);
  }
};

// ── UPDATE APP ──────────────────────────────────────────────
exports.updateApp = async (req, res) => {
  try {
    const caller = req.ssoUser;
    if (![USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN].includes(caller.user.role)) {
      return error(res, 'Tidak memiliki izin.', 403);
    }

    const { appId } = req.params;
    const data = req.body;

    const updates = {};
    if (data.appName !== undefined) updates.appName = sanitize(data.appName);
    if (data.appUrl !== undefined) updates.appUrl = sanitize(data.appUrl);
    if (data.appIcon !== undefined) updates.appIcon = data.appIcon;
    if (data.description !== undefined) updates.description = sanitize(data.description);
    if (data.color !== undefined) updates.color = data.color;
    if (data.status !== undefined) updates.status = data.status;
    updates.updatedAt = formatDate(new Date());

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const setValues = Object.values(updates);

    await portalPool.query(
      `UPDATE ${TABLES.APPS} SET ${setClauses} WHERE appId = ?`,
      [...setValues, appId]
    );

    await _writeAuditLog(caller.userId, caller.user.username, 'UPDATE_APP', appId, 'Update app', 'SUCCESS');
    return success(res, {});

  } catch (err) {
    console.error('[appController.updateApp] Error:', err.message);
    return error(res, 'Gagal memperbarui aplikasi.', 500);
  }
};

// ── DELETE APP ──────────────────────────────────────────────
exports.deleteApp = async (req, res) => {
  try {
    const caller = req.ssoUser;
    if (caller.user.role !== USER_ROLES.SUPER_ADMIN) {
      return error(res, 'Hanya Super Admin yang bisa menghapus aplikasi.', 403);
    }

    const { appId } = req.params;

    await portalPool.query(`DELETE FROM ${TABLES.APP_ACCESS} WHERE appId = ?`, [appId]);
    await portalPool.query(`DELETE FROM ${TABLES.APPS} WHERE appId = ?`, [appId]);

    await _writeAuditLog(caller.userId, caller.user.username, 'DELETE_APP', appId, 'Hapus app', 'SUCCESS');
    return success(res, {});

  } catch (err) {
    console.error('[appController.deleteApp] Error:', err.message);
    return error(res, 'Gagal menghapus aplikasi.', 500);
  }
};

// ── GRANT ACCESS ────────────────────────────────────────────
exports.grantAccess = async (req, res) => {
  try {
    const caller = req.ssoUser;
    if (![USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN].includes(caller.user.role)) {
      return error(res, 'Tidak memiliki izin.', 403);
    }

    const { userId, appId, appRole } = req.body;
    if (!userId || !appId) return error(res, 'userId dan appId wajib diisi.', 400);

    // Cek duplikasi
    const [existing] = await portalPool.query(
      `SELECT accessId FROM ${TABLES.APP_ACCESS} WHERE userId = ? AND appId = ? LIMIT 1`,
      [userId, appId]
    );

    if (existing.length > 0) {
      // Update role jika sudah ada
      await portalPool.query(
        `UPDATE ${TABLES.APP_ACCESS} SET appRole = ? WHERE userId = ? AND appId = ?`,
        [appRole || 'user', userId, appId]
      );
    } else {
      await portalPool.query(
        `INSERT INTO ${TABLES.APP_ACCESS} (accessId, userId, appId, appRole, grantedAt, grantedBy) VALUES (?, ?, ?, ?, ?, ?)`,
        [generateUuid(), userId, appId, appRole || 'user', formatDate(new Date()), caller.userId]
      );
    }

    await _writeAuditLog(caller.userId, caller.user.username, 'GRANT_ACCESS', appId, `Grant ${appRole || 'user'} to ${userId}`, 'SUCCESS');
    return success(res, {});

  } catch (err) {
    console.error('[appController.grantAccess] Error:', err.message);
    return error(res, 'Gagal memberikan akses.', 500);
  }
};

// ── REVOKE ACCESS ───────────────────────────────────────────
exports.revokeAccess = async (req, res) => {
  try {
    const caller = req.ssoUser;
    if (![USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN].includes(caller.user.role)) {
      return error(res, 'Tidak memiliki izin.', 403);
    }

    const { userId, appId } = req.body;
    await portalPool.query(
      `DELETE FROM ${TABLES.APP_ACCESS} WHERE userId = ? AND appId = ?`,
      [userId, appId]
    );

    await _writeAuditLog(caller.userId, caller.user.username, 'REVOKE_ACCESS', appId, `Revoke from ${userId}`, 'SUCCESS');
    return success(res, {});

  } catch (err) {
    console.error('[appController.revokeAccess] Error:', err.message);
    return error(res, 'Gagal mencabut akses.', 500);
  }
};

// ── UPDATE USER ACCESS (bulk per user) ──────────────────────
exports.updateUserAccess = async (req, res) => {
  try {
    const caller = req.ssoUser;
    if (![USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN].includes(caller.user.role)) {
      return error(res, 'Tidak memiliki izin.', 403);
    }

    const { targetUserId, appAccesses } = req.body;
    if (!targetUserId) return error(res, 'targetUserId wajib diisi.', 400);

    // Hapus semua akses lama
    await portalPool.query(`DELETE FROM ${TABLES.APP_ACCESS} WHERE userId = ?`, [targetUserId]);

    // Insert akses baru
    if (appAccesses && Array.isArray(appAccesses) && appAccesses.length > 0) {
      const values = appAccesses.map(a => [
        generateUuid(), targetUserId, a.appId, a.appRole || 'user',
        formatDate(new Date()), caller.userId
      ]);
      await portalPool.query(
        `INSERT INTO ${TABLES.APP_ACCESS} (accessId, userId, appId, appRole, grantedAt, grantedBy) VALUES ?`,
        [values]
      );
    }

    await _writeAuditLog(caller.userId, caller.user.username, 'UPDATE_USER_ACCESS', '', `Update akses ${targetUserId}: ${(appAccesses || []).length} apps`, 'SUCCESS');
    return success(res, {});

  } catch (err) {
    console.error('[appController.updateUserAccess] Error:', err.message);
    return error(res, 'Gagal memperbarui akses.', 500);
  }
};

// ── GET USER ACCESS ─────────────────────────────────────────
exports.getUserAccess = async (req, res) => {
  try {
    const { targetUserId } = req.params;
    const [accesses] = await portalPool.query(
      `SELECT * FROM ${TABLES.APP_ACCESS} WHERE userId = ?`, [targetUserId]
    );
    return success(res, { accesses });
  } catch (err) {
    console.error('[appController.getUserAccess] Error:', err.message);
    return error(res, 'Gagal mengambil akses user.', 500);
  }
};

// ── BULK UPDATE USER ACCESS (multi-user) ────────────────────
exports.bulkUpdateUserAccess = async (req, res) => {
  try {
    const caller = req.ssoUser;
    if (![USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN].includes(caller.user.role)) {
      return error(res, 'Tidak memiliki izin.', 403);
    }

    const { userIds, appAccesses, replace } = req.body;
    if (!userIds || !Array.isArray(userIds)) return error(res, 'userIds wajib array.', 400);

    let updated = 0;
    for (const uid of userIds) {
      if (replace) {
        await portalPool.query(`DELETE FROM ${TABLES.APP_ACCESS} WHERE userId = ?`, [uid]);
      }
      if (appAccesses && Array.isArray(appAccesses) && appAccesses.length > 0) {
        for (const a of appAccesses) {
          await portalPool.query(
            `INSERT IGNORE INTO ${TABLES.APP_ACCESS} (accessId, userId, appId, appRole, grantedAt, grantedBy) VALUES (?, ?, ?, ?, ?, ?)`,
            [generateUuid(), uid, a.appId, a.appRole || 'user', formatDate(new Date()), caller.userId]
          );
        }
      }
      updated++;
    }

    await _writeAuditLog(caller.userId, caller.user.username, 'BULK_UPDATE_ACCESS', '', `Bulk update akses: ${updated} users`, 'SUCCESS');
    return success(res, { updated });

  } catch (err) {
    console.error('[appController.bulkUpdateUserAccess] Error:', err.message);
    return error(res, 'Gagal bulk update akses.', 500);
  }
};
