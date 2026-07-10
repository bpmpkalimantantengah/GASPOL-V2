// ============================================================
// GASPOL V2 — Server Entry Point
// File   : server.js
// Fungsi : Express server utama (port 4000)
//          Terpisah dari WA Sender (port 3000)
// ============================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const cron = require('node-cron');

const { generalLimiter } = require('./middlewares/rateLimiter');
const { verifySsoToken } = require('./middlewares/authMiddleware');
const authRoutes = require('./routes/authRoutes');
const portalApiRoutes = require('./routes/portalApiRoutes');
const { cleanExpiredSessions } = require('./controllers/sessionController');

const app = express();
const PORT = parseInt(process.env.PORT) || 4000;

// ── Security Headers ────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",                    // Diperlukan untuk inline event handlers di Portal.html
        "https://accounts.google.com",        // Google Identity Services
        "https://cdn.jsdelivr.net",           // Bootstrap JS
      ],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://fonts.googleapis.com",
        "https://cdn.jsdelivr.net",
      ],
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com",
        "https://cdn.jsdelivr.net",
      ],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://accounts.google.com", "https://oauth2.googleapis.com"],
      frameSrc: ["https://accounts.google.com"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'", "https://accounts.google.com"],
      upgradeInsecureRequests: null,  // PENTING: Nonaktifkan karena server HTTP-only
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
}));

// ── Rate Limiting ───────────────────────────────────────────
app.use(generalLimiter);

// ── CORS ────────────────────────────────────────────────────
const corsOptions = {
  origin: function (origin, callback) {
    // Izinkan: no-origin (server-to-server), localhost, IP VM
    if (!origin ||
        origin === 'null' ||
        origin.startsWith('http://localhost') ||
        origin.startsWith('http://127.0.0.1') ||
        origin.includes('.nip.io') ||
        origin.startsWith('http://168.110.208.72') ||
        origin.startsWith('https://168.110.208.72')) {
      callback(null, true);
    } else {
      console.warn('[CORS] Ditolak untuk origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};
app.use(cors(corsOptions));

// ── Body Parsers ────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cookieParser());

// ── Serve Static Files ──────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Routes ──────────────────────────────────────────────────

// Auth routes (login, logout, validate token)
app.use('/auth', authRoutes);

// Portal API routes (users, apps, sessions, logs)
app.use('/api/portal', portalApiRoutes);

// Portal HTML — serve the SPA
app.get('/portal', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'portal', 'index.html'));
});
app.get('/portal/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'portal', 'index.html'));
});


// ── Health Check ────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '2.0.0', uptime: process.uptime() });
});

// ── Root redirect ───────────────────────────────────────────
app.get('/', (req, res) => {
  res.redirect('/portal');
});

// ── Cron Job: Bersihkan sesi expired setiap jam ─────────────
// Menggantikan GAS trigger harian — lebih sering agar lebih bersih
cron.schedule('0 * * * *', () => {
  console.log('[Cron] Menjalankan cleanup sesi expired...');
  cleanExpiredSessions();
});

// ── Start Server ────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║     GASPOL V2 — Portal BPMP Kalteng          ║');
  console.log('║     🚀 Server berjalan di Port ' + PORT + '            ║');
  console.log('║     📡 http://168.110.208.72:' + PORT + '             ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
});

// ── Graceful Shutdown ───────────────────────────────────────
process.on('SIGINT', () => {
  console.log('\n🛑 Server dimatikan dengan aman.');
  process.exit(0);
});
