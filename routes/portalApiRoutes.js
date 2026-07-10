// ============================================================
// GASPOL V2 — Portal API Routes
// File   : routes/portalApiRoutes.js
// Fungsi : REST API untuk Portal Dashboard (users, apps, sessions, logs)
//          + unified /action endpoint untuk Portal SPA
// ============================================================

const express = require('express');
const router = express.Router();
const { verifySsoToken, requireAuth, requireRole } = require('../middlewares/authMiddleware');
const userController = require('../controllers/userController');
const appController = require('../controllers/appController');
const sessionController = require('../controllers/sessionController');
const auditController = require('../controllers/auditController');
const authController = require('../controllers/authController');

// ══════════════════════════════════════════════════════════════
// UNIFIED /action ENDPOINT — dipakai oleh portal.js fetch()
// Menggantikan google.script.run.processServerAction()
// Route ini HARUS didefinisikan SEBELUM middleware auth global
// karena beberapa action (login, validateToken, logout) TIDAK
// memerlukan sesi yang sudah aktif.
// ══════════════════════════════════════════════════════════════

router.post('/action', async (req, res) => {
  const { action } = req.body;
  
  const authHeader = req.headers.authorization;
  const token = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.split(' ')[1] : req.body.token;

  if (!action) {
    return res.status(400).json({ success: false, error: 'Action tidak disertakan.' });
  }

  // ── Daftar action yang TIDAK butuh auth ─────────────────
  const publicActions = ['login', 'loginWithGoogle', 'validateToken', 'logout'];

  if (publicActions.includes(action)) {
    try {
      switch (action) {
        case 'login':
          return authController.login(req, res);
        case 'loginWithGoogle':
          return authController.loginWithGoogle(req, res);
        case 'validateToken':
          return authController.validateToken(req, res);
        case 'logout':
          return authController.logout(req, res);
        default:
          return res.status(400).json({ success: false, error: 'Action tidak dikenal.' });
      }
    } catch (err) {
      console.error('[action/public] Error:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ── Action yang butuh auth: validasi token dulu ─────────
  if (!token) {
    return res.status(401).json({ success: false, error: 'Token tidak disertakan.' });
  }

  // Inject token ke header agar middleware bisa membacanya
  req.headers['x-sso-token'] = token;

  // Jalankan middleware auth secara manual
  try {
    await new Promise((resolve, reject) => {
      verifySsoToken(req, res, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    // Cek apakah req.ssoUser sudah terisi dan valid
    if (!req.ssoUser || !req.ssoUser.valid) {
      return res.status(401).json({ success: false, error: 'Sesi tidak valid atau telah kedaluwarsa.' });
    }
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Token tidak valid: ' + err.message });
  }

  // ── Dispatch ke controller yang sesuai ──────────────────
  try {
    switch (action) {
      // ── Auth / Session ──
      case 'changePassword':
        return authController.changePassword(req, res);
      case 'getStats':
        return authController.getStats(req, res);

      // ── User Management ──
      case 'getAllUsers':
        return userController.getAllUsers(req, res);
      case 'createUser':
        return userController.createUser(req, res);
      case 'updateUser':
        req.params.targetUserId = req.body.targetUserId;
        return userController.updateUser(req, res);
      case 'deleteUser':
        req.params.targetUserId = req.body.targetUserId;
        return userController.deleteUser(req, res);
      case 'resetPassword':
        req.params.targetUserId = req.body.targetUserId;
        return userController.resetPassword(req, res);
      case 'bulkCreateUsers':
        return userController.bulkCreateUsers(req, res);
      case 'bulkDeleteUser':
        return userController.bulkDeleteUser(req, res);
      case 'bulkResetPassword':
        return userController.bulkResetPassword(req, res);

      // ── App Management ──
      case 'getAllApps':
        return appController.getAllApps(req, res);
      case 'getApps':
        return appController.getAppsForUser(req, res);
      case 'registerApp':
        return appController.registerApp(req, res);
      case 'updateApp':
        req.params.appId = req.body.appId;
        return appController.updateApp(req, res);
      case 'deleteApp':
        req.params.appId = req.body.appId;
        return appController.deleteApp(req, res);
      case 'grantAccess':
        return appController.grantAccess(req, res);
      case 'revokeAccess':
        return appController.revokeAccess(req, res);
      case 'updateUserAccess':
        return appController.updateUserAccess(req, res);
      case 'getUserAccess':
        req.params.targetUserId = req.body.targetUserId;
        return appController.getUserAccess(req, res);
      case 'bulkUpdateUserAccess':
        return appController.bulkUpdateUserAccess(req, res);

      // ── Sessions ──
      case 'getActiveSessions':
        return sessionController.getActiveSessions(req, res);
      case 'getOnlineUsers':
        return sessionController.getOnlineUsers(req, res);

      // ── Audit Log ──
      case 'getLogs':
        return auditController.getLogs(req, res);

      // ── AI Config (jika controller tersedia) ──
      case 'getAIConfig':
      case 'saveAIConfigList': {
        try {
          const aiController = require('../controllers/aiConfigController');
          if (action === 'getAIConfig') return aiController.getAIConfig(req, res);
          if (action === 'saveAIConfigList') return aiController.saveAIConfigList(req, res);
        } catch (e) {
          // AI Controller belum ada — beri response fallback
          return res.json({ success: true, apiList: [] });
        }
        break;
      }

      // ── PPKPSP Stats (jika controller tersedia) ──
      case 'getPPKPSPStats': {
        try {
          const ppkpspController = require('../controllers/ppkpspController');
          return ppkpspController.getPPKPSPStats(req, res);
        } catch (e) {
          return res.json({ success: false, error: 'PPKPSP module belum tersedia.' });
        }
        break;
      }

      default:
        return res.status(400).json({ success: false, error: 'Action tidak dikenal: ' + action });
    }
  } catch (err) {
    console.error('[action/protected] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// REST API ROUTES — untuk akses langsung (dipakai oleh tools lain)
// Semua route di bawah ini memerlukan auth via middleware
// ══════════════════════════════════════════════════════════════

router.use(verifySsoToken);
router.use(requireAuth);

// ── User Management ─────────────────────────────────────────
router.get('/users', requireRole('SUPER_ADMIN', 'ADMIN'), userController.getAllUsers);
router.post('/users', requireRole('SUPER_ADMIN', 'ADMIN'), userController.createUser);
router.put('/users/:targetUserId', requireRole('SUPER_ADMIN', 'ADMIN'), userController.updateUser);
router.delete('/users/:targetUserId', requireRole('SUPER_ADMIN', 'ADMIN'), userController.deleteUser);
router.post('/users/:targetUserId/reset-password', requireRole('SUPER_ADMIN', 'ADMIN'), userController.resetPassword);
router.post('/users/bulk-create', requireRole('SUPER_ADMIN', 'ADMIN'), userController.bulkCreateUsers);
router.post('/users/bulk-delete', requireRole('SUPER_ADMIN'), userController.bulkDeleteUser);
router.post('/users/bulk-reset-password', requireRole('SUPER_ADMIN', 'ADMIN'), userController.bulkResetPassword);

// ── App Management ──────────────────────────────────────────
router.get('/apps', requireRole('SUPER_ADMIN', 'ADMIN'), appController.getAllApps);
router.get('/apps/my', appController.getAppsForUser);
router.post('/apps', requireRole('SUPER_ADMIN'), appController.registerApp);
router.put('/apps/:appId', requireRole('SUPER_ADMIN', 'ADMIN'), appController.updateApp);
router.delete('/apps/:appId', requireRole('SUPER_ADMIN'), appController.deleteApp);
router.post('/apps/grant-access', requireRole('SUPER_ADMIN', 'ADMIN'), appController.grantAccess);
router.post('/apps/revoke-access', requireRole('SUPER_ADMIN', 'ADMIN'), appController.revokeAccess);
router.post('/apps/update-user-access', requireRole('SUPER_ADMIN', 'ADMIN'), appController.updateUserAccess);
router.get('/apps/user-access/:targetUserId', requireRole('SUPER_ADMIN', 'ADMIN'), appController.getUserAccess);
router.post('/apps/bulk-update-access', requireRole('SUPER_ADMIN', 'ADMIN'), appController.bulkUpdateUserAccess);

// ── Session Management ──────────────────────────────────────
router.get('/sessions/count', sessionController.getActiveSessions);
router.get('/sessions/online', requireRole('SUPER_ADMIN', 'ADMIN'), sessionController.getOnlineUsers);
router.post('/sessions/invalidate', requireRole('SUPER_ADMIN', 'ADMIN'), sessionController.invalidateSession);

// ── Audit Log ───────────────────────────────────────────────
router.get('/logs', requireRole('SUPER_ADMIN', 'ADMIN'), auditController.getLogs);
router.get('/logs/user/:targetUserId', auditController.getUserLogs);

module.exports = router;
