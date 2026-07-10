// ============================================================
// GASPOL V2 — Database Configuration
// File   : config/database.js
// Fungsi : Connection pool MySQL untuk semua database
// ============================================================

const mysql = require('mysql2/promise');
require('dotenv').config();

// ── Pool Database Portal (Users, Sessions, Apps, AppAccess, AuditLog) ──
const portalPool = mysql.createPool({
  host: process.env.DB_PORTAL_HOST || 'localhost',
  user: process.env.DB_PORTAL_USER || 'root',
  password: process.env.DB_PORTAL_PASSWORD || '',
  database: process.env.DB_PORTAL_NAME || 'gaspol_portal',
  waitForConnections: true,
  connectionLimit: 150,
  queueLimit: 0,
  dateStrings: true,
  // Timezone WITA
  timezone: '+08:00',
});

// ── Pool Database Evaluasi ──────────────────────────────────
const evaluasiPool = mysql.createPool({
  host: process.env.DB_EVALUASI_HOST || 'localhost',
  user: process.env.DB_EVALUASI_USER || 'root',
  password: process.env.DB_EVALUASI_PASSWORD || '',
  database: process.env.DB_EVALUASI_NAME || 'bpmp_evaluasi',
  waitForConnections: true,
  connectionLimit: 50,
  queueLimit: 0,
  dateStrings: true,
  timezone: '+08:00',
});

// ── Pool Database Cendekia ──────────────────────────────────
const cendekiaPool = mysql.createPool({
  host: process.env.DB_CENDEKIA_HOST || 'localhost',
  user: process.env.DB_CENDEKIA_USER || 'root',
  password: process.env.DB_CENDEKIA_PASSWORD || '',
  database: process.env.DB_CENDEKIA_NAME || 'bpmp_cendekia',
  waitForConnections: true,
  connectionLimit: 30,
  queueLimit: 0,
  dateStrings: true,
  timezone: '+08:00',
});

// ── Pool Database Hub Mitra ─────────────────────────────────
const hubMitraPool = mysql.createPool({
  host: process.env.DB_HUBMITRA_HOST || 'localhost',
  user: process.env.DB_HUBMITRA_USER || 'root',
  password: process.env.DB_HUBMITRA_PASSWORD || '',
  database: process.env.DB_HUBMITRA_NAME || 'bpmp_hub_mitra',
  waitForConnections: true,
  connectionLimit: 30,
  queueLimit: 0,
  dateStrings: true,
  timezone: '+08:00',
});

// ── Pool Database PPKPSP ────────────────────────────────────
const ppkpspPool = mysql.createPool({
  host: process.env.DB_PPKPSP_HOST || 'localhost',
  user: process.env.DB_PPKPSP_USER || 'root',
  password: process.env.DB_PPKPSP_PASSWORD || '',
  database: process.env.DB_PPKPSP_NAME || 'gaspol_ppkpsp',
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  dateStrings: true,
  timezone: '+08:00',
});

module.exports = {
  portalPool,
  evaluasiPool,
  cendekiaPool,
  hubMitraPool,
  ppkpspPool,
};
