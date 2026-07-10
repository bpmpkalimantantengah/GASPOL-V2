// ============================================================
// GASPOL V2 — Rate Limiter Middleware
// File   : middlewares/rateLimiter.js
// Fungsi : Pembatasan request per-IP untuk mencegah abuse/DDoS
// ============================================================

const rateLimit = require('express-rate-limit');

// ── Limiter Umum: 300 req/menit per IP ──────────────────────
const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 300,
  message: { success: false, error: 'Terlalu banyak permintaan. Silakan coba lagi beberapa saat.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Limiter Login: 10 percobaan/menit per IP ────────────────
const loginLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  message: { success: false, error: 'Terlalu banyak percobaan login. Silakan tunggu 1 menit.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Limiter AI: 20 req/menit per IP ─────────────────────────
const aiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  message: { success: false, error: 'Kuota AI tercapai. Silakan tunggu 1 menit.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { generalLimiter, loginLimiter, aiLimiter };
