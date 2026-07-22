// ============================================================
// GASPOL V2 — Auth Routes
// File   : routes/authRoutes.js
// Fungsi : Endpoint autentikasi (login, logout, validate, dll)
// ============================================================

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifySsoToken, requireAuth } = require('../middlewares/authMiddleware');
const { loginLimiter } = require('../middlewares/rateLimiter');

// ── Public Routes (tanpa auth) ──────────────────────────────
router.post('/login', loginLimiter, authController.login);
router.post('/login-google', loginLimiter, authController.loginWithGoogle);
router.post('/logout', authController.logout);
router.get('/logout', authController.logout);

// ── Token Validation (untuk child apps GAS yang masih aktif) ─
// Endpoint ini menggantikan hit ke GAS Portal doGet?action=validateToken
// Child apps GAS bisa diarahkan ke http://168.110.208.72:4000/auth/validate
router.get('/validate', authController.validateToken);
router.post('/validate', authController.validateToken);

// ── Protected Routes ────────────────────────────────────────
router.post('/change-password', verifySsoToken, requireAuth, authController.changePassword);
router.post('/heartbeat', authController.heartbeat);
router.get('/stats', verifySsoToken, requireAuth, authController.getStats);

module.exports = router;
