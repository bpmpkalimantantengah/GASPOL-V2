// ============================================================
// GASPOL V2 — Response Utilities
// File   : utils/response.js
// Fungsi : Standar format JSON response untuk API
// ============================================================

/**
 * Response sukses standar
 * @param {object} res - Express response
 * @param {*} data - Data payload
 * @param {number} status - HTTP status code (default 200)
 */
function success(res, data, status = 200) {
  return res.status(status).json({ success: true, ...data });
}

/**
 * Response error standar
 * @param {object} res - Express response
 * @param {string} message - Pesan error
 * @param {number} status - HTTP status code (default 400)
 */
function error(res, message, status = 400) {
  return res.status(status).json({ success: false, error: message });
}

module.exports = { success, error };
