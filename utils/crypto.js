// ============================================================
// GASPOL V2 — Crypto Utilities
// File   : utils/crypto.js
// Fungsi : Hashing password yang 100% kompatibel dengan GAS
//
// KRITIS: Fungsi hashPassword() di sini HARUS menghasilkan
// output yang identik dengan Utils.hashPassword() di GAS.
// Formula: SHA-256(password + salt + secretKey)
// ============================================================

const crypto = require('crypto');
const { SSO_CONFIG } = require('../config/constants');

/**
 * Hash password dengan SHA-256 — kompatibel 1:1 dengan GAS Utils.hashPassword()
 *
 * GAS Implementation (Utils.js line 20-30):
 *   const combined = password + salt + getConfig().secretKey;
 *   const bytes = Utilities.computeDigest(SHA_256, combined, UTF_8);
 *   return bytes.map(b => hex(b)).join('');
 *
 * @param {string} password - Password plaintext
 * @param {string} salt - Salt unik per-user
 * @returns {string} Hex string SHA-256 hash
 */
function hashPassword(password, salt) {
  const combined = password + salt + SSO_CONFIG.secretKey;
  return crypto.createHash('sha256').update(combined, 'utf8').digest('hex');
}

/**
 * Verifikasi password terhadap hash
 * @param {string} plainText - Password plaintext yang dimasukkan user
 * @param {string} hash - Hash tersimpan di database
 * @param {string} salt - Salt tersimpan di database
 * @returns {boolean}
 */
function verifyPassword(plainText, hash, salt) {
  return hashPassword(plainText, salt) === hash;
}

/**
 * Hash legacy — kompatibel dengan format lama Hub Mitra & Zoom
 *
 * GAS Implementation (Auth.js line 329-338):
 *   prepend=false: SHA-256(password + saltString)
 *   prepend=true:  SHA-256(saltString + password)
 *
 * @param {string} password
 * @param {string} saltString
 * @param {boolean} prepend - Jika true, salt di depan password
 * @returns {string} Hex string SHA-256 hash
 */
function hashLegacy(password, saltString, prepend = false) {
  const combined = prepend ? (saltString + password) : (password + saltString);
  return crypto.createHash('sha256').update(combined, 'utf8').digest('hex');
}

/**
 * Generate UUID v4
 * Setara dengan Utilities.getUuid() di GAS
 * @returns {string} UUID format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 */
function generateUuid() {
  return crypto.randomUUID();
}

/**
 * Generate salt acak 32 karakter hex
 * Setara dengan Utilities.getUuid().replace(/-/g, '') di GAS
 * @returns {string} 32 karakter hex string
 */
function generateSalt() {
  return crypto.randomUUID().replace(/-/g, '');
}

module.exports = {
  hashPassword,
  verifyPassword,
  hashLegacy,
  generateUuid,
  generateSalt,
};
