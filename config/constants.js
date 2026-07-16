// ============================================================
// GASPOL V2 — Constants & Configuration
// File   : config/constants.js
// Fungsi : Nama tabel, role, status — port dari Config.js GAS
// ============================================================

require('dotenv').config();

// ── Nama tabel di MySQL (identik dengan SHEETS di GAS) ──────
const TABLES = {
  USERS      : 'Users',
  SESSIONS   : 'Sessions',
  APPS       : 'Apps',
  APP_ACCESS : 'AppAccess',
  AUDIT_LOG  : 'AuditLog',
};

// ── Status dan role yang valid ─────────────────────────────
const USER_STATUS = {
  ACTIVE    : 'ACTIVE',
  INACTIVE  : 'INACTIVE',
  SUSPENDED : 'SUSPENDED',
};

const USER_ROLES = {
  SUPER_ADMIN : 'SUPER_ADMIN',
  ADMIN       : 'ADMIN',
  USER        : 'USER',
};

const APP_STATUS = {
  ACTIVE      : 'ACTIVE',
  INACTIVE    : 'INACTIVE',
  MAINTENANCE : 'MAINTENANCE',
};

// ── Konfigurasi SSO ─────────────────────────────────────────
const SSO_CONFIG = {
  secretKey: process.env.SSO_SECRET_KEY || (() => {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[FATAL] SSO_SECRET_KEY wajib diset di .env untuk production!');
    }
    console.warn('[WARNING] SSO_SECRET_KEY tidak diset. Menggunakan nilai default (TIDAK AMAN untuk production).');
    return 'gaspol-secret-dev-only';
  })(),
  sessionDurationHours : parseInt(process.env.SESSION_DURATION_HOURS || '8'),
  maxLoginAttempts     : parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5'),
  lockoutMinutes       : parseInt(process.env.LOCKOUT_DURATION_MINUTES || '30'),
  timezone             : process.env.TZ || 'Asia/Makassar',
  appName              : 'GASPOL',
  version              : '2.0.0',
  orgName              : 'BPMP Kalimantan Tengah',
};

// ── Daftar tabel yang valid untuk operasi CRUD portal ───────
// Digunakan untuk validasi whitelist agar aman dari SQL injection
const VALID_TABLES = [
  'Users', 'Sessions', 'Apps', 'AppAccess', 'AuditLog',
  'gaspol_ppkpsp.vw_ppkpsp_skor',
];

module.exports = {
  TABLES,
  USER_STATUS,
  USER_ROLES,
  APP_STATUS,
  SSO_CONFIG,
  VALID_TABLES,
};
