// ============================================================
// GASPOL V2 — Auth Middleware
// File   : middlewares/authMiddleware.js
// Fungsi : Validasi SSO token langsung dari MySQL (lokal)
//          Menghilangkan dependency ke GAS Portal
// ============================================================

const { portalPool } = require('../config/database');
const { TABLES, USER_STATUS, USER_ROLES, SSO_CONFIG } = require('../config/constants');
const { isExpired, formatDate, addHours } = require('../utils/helpers');

// ── In-Memory Token Cache (TTL 3 menit) ─────────────────────
// Mengurangi query MySQL untuk validasi berulang
const tokenCache = new Map();
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 menit
const CACHE_MAX_SIZE = 2000;

function getFromCache(key) {
  const entry = tokenCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    tokenCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  // Evict jika penuh — hapus entry terlama
  if (tokenCache.size >= CACHE_MAX_SIZE) {
    const firstKey = tokenCache.keys().next().value;
    tokenCache.delete(firstKey);
  }
  tokenCache.set(key, { data, ts: Date.now() });
}

function invalidateCache(token) {
  if (!token) return;
  // Hapus semua cache key yang mengandung token prefix
  const prefix = token.substring(0, 32);
  for (const key of tokenCache.keys()) {
    if (key.includes(prefix)) tokenCache.delete(key);
  }
}

// ── Core: Validasi token dari MySQL ─────────────────────────
async function validateTokenFromDB(token, appId) {
  try {
    if (!token) return { valid: false, error: 'Token tidak disertakan.' };

    // 1. Cari session
    const [sessions] = await portalPool.query(
      `SELECT token, userId, appId, isValid, expiresAt, lastActivity
       FROM ${TABLES.SESSIONS} WHERE token = ? LIMIT 1`, [token]
    );
    const session = sessions[0];
    if (!session) return { valid: false, error: 'Token tidak ditemukan.' };
    if (String(session.isValid) === 'false' || session.isValid === 0) {
      return { valid: false, error: 'Token sudah tidak valid.' };
    }
    if (isExpired(session.expiresAt)) {
      return { valid: false, error: 'Token sudah kedaluwarsa.' };
    }

    // 2. Cari user
    const [users] = await portalPool.query(
      `SELECT userId, username, email, fullName, role, status, whatsapp, lastLogin, createdAt, updatedAt
       FROM ${TABLES.USERS} WHERE userId = ? LIMIT 1`, [session.userId]
    );
    const user = users[0];
    if (!user) return { valid: false, error: 'User tidak ditemukan.' };
    if (user.status !== USER_STATUS.ACTIVE) return { valid: false, error: 'User tidak aktif.' };

    // 3. Cek akses ke aplikasi (jika appId disediakan)
    let appRole = null;
    if (appId) {
      const [accesses] = await portalPool.query(
        `SELECT * FROM ${TABLES.APP_ACCESS} WHERE userId = ? AND appId = ? LIMIT 1`,
        [user.userId, appId]
      );
      const appAccess = accesses[0];

      // Super Admin selalu punya akses
      if (user.role !== USER_ROLES.SUPER_ADMIN && !appAccess) {
        return { valid: false, error: 'User tidak memiliki akses ke aplikasi ini.' };
      }
      appRole = appAccess ? appAccess.appRole : 'admin';
    }

    // 4. Update lastActivity + perpanjang session jika perlu
    const sessionUpdates = { lastActivity: formatDate(new Date()) };
    const remaining = new Date(session.expiresAt) - new Date();
    if (remaining < 30 * 60 * 1000) {
      sessionUpdates.expiresAt = formatDate(addHours(new Date(), SSO_CONFIG.sessionDurationHours));
    }
    // Non-blocking update
    portalPool.query(
      `UPDATE ${TABLES.SESSIONS} SET lastActivity = ?, expiresAt = ? WHERE token = ?`,
      [sessionUpdates.lastActivity, sessionUpdates.expiresAt || session.expiresAt, token]
    ).catch(() => {}); // Jangan blok validasi

    // 5. Sanitize user (hapus data sensitif)
    const { passwordHash, salt, loginAttempts, lockedUntil, ...safeUser } = user;

    return {
      valid   : true,
      userId  : user.userId,
      user    : safeUser,
      appRole : (appRole || user.role).toUpperCase(),
    };
  } catch (err) {
    console.error('[authMiddleware] validateTokenFromDB error:', err.message);
    return { valid: false, error: 'Gagal memvalidasi token.' };
  }
}

// ── Express Middleware: verifySsoToken ───────────────────────
// Mengambil token dari: Header > Query > Body
// Jika valid, inject req.ssoUser
const verifySsoToken = async (req, res, next) => {
  const token = req.headers['x-sso-token']
             || req.query?.sso_token
             || req.body?.sso_token
             || req.query?.token;

  if (!token) {
    req.ssoUser = null;
    return next();
  }

  // Cek cache terlebih dahulu
  const appId = req.headers['x-app-id'] || '';
  const cacheKey = token.substring(0, 32) + (appId ? '_' + appId : '');
  const cached = getFromCache(cacheKey);
  if (cached) {
    req.ssoUser = cached;
    return next();
  }

  // Cache miss — query MySQL
  const result = await validateTokenFromDB(token, appId);
  if (result.valid) {
    setCache(cacheKey, result);
    req.ssoUser = result;
  } else {
    req.ssoUser = null;
  }

  next();
};

// ── Middleware: requireAuth — wajib login ────────────────────
const requireAuth = (req, res, next) => {
  if (!req.ssoUser || !req.ssoUser.valid) {
    return res.status(401).json({
      success: false,
      error: 'Autentikasi diperlukan. Silakan login melalui Portal GASPOL.',
    });
  }
  next();
};

// ── Middleware: requireRole — wajib role tertentu ────────────
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.ssoUser || !req.ssoUser.valid) {
      return res.status(401).json({ success: false, error: 'Autentikasi diperlukan.' });
    }
    if (!roles.includes(req.ssoUser.user.role)) {
      return res.status(403).json({ success: false, error: 'Tidak memiliki izin.' });
    }
    next();
  };
};

module.exports = {
  verifySsoToken,
  requireAuth,
  requireRole,
  validateTokenFromDB,
  invalidateCache,
};
