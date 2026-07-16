-- ============================================================
-- GASPOL V2 — Script Pembuatan Index MySQL Komprehensif
-- Database: gaspol_portal
-- Jalankan di VM: mysql -u root -p gaspol_portal < create_all_indexes.sql
-- ============================================================

USE gaspol_portal;

-- ── Index yang sudah ada (skip jika duplikat) ──────────────
-- idx_token di Sessions → sudah ada via create_sso_indexes.js
-- idx_userId di Users   → sudah ada via create_sso_indexes.js

-- ── Index BARU yang ditambahkan ────────────────────────────

-- Sessions: Query validasi token paling sering hit kolom ini
ALTER TABLE Sessions
  ADD INDEX idx_isValid_expiresAt (isValid, expiresAt),
  ADD INDEX idx_userId_isValid (userId, isValid);

-- AppAccess: Dicek setiap request untuk validasi hak akses app
ALTER TABLE AppAccess
  ADD INDEX idx_userId_appId (userId, appId);

-- Users: Login query pakai email dan username
ALTER TABLE Users
  ADD INDEX idx_email (email),
  ADD INDEX idx_status (status),
  ADD INDEX idx_username (username);

-- AuditLog: Dashboard query sort by timestamp, filter by userId
ALTER TABLE AuditLog
  ADD INDEX idx_timestamp (timestamp),
  ADD INDEX idx_userId_timestamp (userId, timestamp),
  ADD INDEX idx_action (action);

SELECT 'Index gaspol_portal selesai!' AS status;

-- ── Index untuk database PPKPSP ────────────────────────────
USE gaspol_ppkpsp;

ALTER TABLE ppkpsp_submissions
  ADD INDEX idx_npsn (npsn),
  ADD INDEX idx_status_pengisian (status_pengisian);

ALTER TABLE ppkpsp_g7_stats
  ADD INDEX idx_submission_id (submission_id),
  ADD INDEX idx_jenis_kebiasaan (jenis_kebiasaan);

ALTER TABLE ppkpsp_pustaka
  ADD INDEX idx_aktif_urutan (aktif, urutan),
  ADD INDEX idx_kategori (kategori);

SELECT 'Index gaspol_ppkpsp selesai!' AS status;

-- ── Index untuk database Evaluasi ──────────────────────────
USE bpmp_evaluasi;

ALTER TABLE kegiatan_meta
  ADD INDEX idx_tahun (tahun),
  ADD INDEX idx_tim_kerja (tim_kerja);

ALTER TABLE evaluasi_respons
  ADD INDEX idx_kegiatan_tipe (nama_kegiatan, tipe_evaluasi),
  ADD INDEX idx_created_at (created_at);

SELECT 'Index bpmp_evaluasi selesai!' AS status;
