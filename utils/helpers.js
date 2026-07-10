// ============================================================
// GASPOL V2 — Helper Utilities
// File   : utils/helpers.js
// Fungsi : Port dari Utils.js GAS (sanitize, format, validasi)
// ============================================================

const { SSO_CONFIG } = require('../config/constants');

/**
 * Format tanggal ke string 'yyyy-MM-dd HH:mm:ss' di timezone WITA
 * Setara dengan Utilities.formatDate(d, 'Asia/Makassar', 'yyyy-MM-dd HH:mm:ss')
 * @param {Date} date
 * @returns {string}
 */
function formatDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  // Gunakan Intl.DateTimeFormat untuk timezone-aware formatting
  const options = {
    timeZone: SSO_CONFIG.timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  };
  const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(d);
  const p = {};
  parts.forEach(({ type, value }) => { p[type] = value; });
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/**
 * Cek apakah tanggal sudah kedaluwarsa
 * Port dari Utils.isExpired() GAS
 * @param {string} expiresAt - Format 'yyyy-MM-dd HH:mm:ss'
 * @returns {boolean}
 */
function isExpired(expiresAt) {
  if (!expiresAt) return true;
  const nowStr = formatDate(new Date());
  const nowSafe = new Date(nowStr.replace(/-/g, '/'));
  const expSafe = new Date(String(expiresAt).replace(/-/g, '/'));
  return nowSafe > expSafe;
}

/**
 * Tambahkan jam ke tanggal
 * @param {Date} date
 * @param {number} hours
 * @returns {Date}
 */
function addHours(date, hours) {
  return new Date(date.getTime() + hours * 3600000);
}

/**
 * Tambahkan menit ke tanggal
 * @param {Date} date
 * @param {number} minutes
 * @returns {Date}
 */
function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

/**
 * Sanitasi input — cegah injection
 * Port dari Utils.sanitize() GAS
 * @param {string} input
 * @returns {string}
 */
function sanitize(input) {
  if (typeof input !== 'string') return input;
  return input.replace(/[<>"'`]/g, '').trim().substring(0, 500);
}

/**
 * Validasi format email
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
}

/**
 * Format nomor WhatsApp ke format standar (awalan 0)
 * Port dari Utils.formatWhatsApp() GAS
 * @param {string} number
 * @returns {string}
 */
function formatWhatsApp(number) {
  if (!number) return '';
  let formatted = String(number).replace(/[^0-9]/g, '');

  // Hapus semua awalan 0
  formatted = formatted.replace(/^0+/, '');

  // Jika diawali 62, potong
  if (formatted.startsWith('62')) {
    formatted = formatted.slice(2);
  }

  // Bersihkan lagi jika setelah 62 masih ada 0
  formatted = formatted.replace(/^0+/, '');

  return formatted ? '0' + formatted : '';
}

module.exports = {
  formatDate,
  isExpired,
  addHours,
  addMinutes,
  sanitize,
  isValidEmail,
  formatWhatsApp,
};
