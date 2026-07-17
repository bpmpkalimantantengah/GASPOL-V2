const { ppkpspPool } = require('../config/database');

exports.getPPKPSPStats = async (req, res) => {
    try {
        console.log('[DEBUG] getPPKPSPStats req.ssoUser:', JSON.stringify(req.ssoUser));
        const userObj = (req.ssoUser && req.ssoUser.user) ? req.ssoUser.user : (req.user || req.ssoUser || {});
        const npsn = userObj.npsn || userObj.username;
        console.log('[DEBUG] Extract NPSN:', npsn);
        if (!npsn) {
            return res.json({ success: false, error: 'NPSN tidak ditemukan' });
        }

        const [rows] = await ppkpspPool.query(
            `SELECT v.nilai_akhir, 
                   CASE WHEN COALESCE(i.status_pengisian, 'belum') = 'belum' OR COALESCE(i.persen_pengisian, 0) = 0 THEN 'Belum Mengisi' ELSE v.kategori END as kategori, 
                   CASE WHEN COALESCE(i.status_pengisian, 'belum') = 'belum' OR COALESCE(i.persen_pengisian, 0) = 0 THEN 'Belum Mengisi' ELSE v.status_dashboard END as status_dashboard, 
                   CASE WHEN COALESCE(i.status_pengisian, 'belum') = 'belum' OR COALESCE(i.persen_pengisian, 0) = 0 THEN 'Sekolah belum melakukan pengisian instrumen PPKPSP.' ELSE v.keterangan END as keterangan 
            FROM gaspol_ppkpsp.vw_ppkpsp_skor v 
            LEFT JOIN gaspol_ppkpsp.ppkpsp_submissions i ON v.npsn = i.npsn 
            WHERE v.npsn = ?`, 
            [npsn]
        );

        if (rows && rows.length > 0) {
            return res.json({ success: true, data: rows[0] });
        } else {
            return res.json({ 
                success: true, 
                data: {
                    nilai_akhir: 0,
                    kategori: 'Belum Mengisi',
                    status_dashboard: 'Belum Mengisi',
                    keterangan: 'Sekolah belum melakukan pengisian instrumen PPKPSP.'
                }
            });
        }
    } catch (e) {
        console.error('[ppkpspController] getPPKPSPStats error:', e.message);
        return res.json({ success: false, error: e.message });
    }
};
