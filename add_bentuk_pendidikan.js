const mysql = require('mysql2/promise');

async function main() {
    const pool = mysql.createPool({
        host: 'localhost',
        user: 'wasender',
        password: 'wasender2026',
        database: 'gaspol_portal'
    });

    try {
        console.log("Menambahkan kolom bentuk_pendidikan pada tabel Users...");
        
        try {
            await pool.query("ALTER TABLE Users ADD COLUMN bentuk_pendidikan VARCHAR(50) NULL AFTER instansi");
            console.log("Kolom berhasil ditambahkan.");
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME' || e.message.includes('Duplicate column')) {
                console.log("Kolom bentuk_pendidikan sudah ada, melanjutkan ke update data...");
            } else {
                throw e;
            }
        }

        console.log("Melakukan pembaruan data...");
        
        const updateSatuanPendidikan = `
            UPDATE Users u
            JOIN master_sekolah s ON u.username = s.npsn
            SET u.bentuk_pendidikan = s.bentuk_pendidikan
            WHERE u.instansi = 'Satuan Pendidikan'
        `;
        const [res1] = await pool.query(updateSatuanPendidikan);
        console.log(`Berhasil memperbarui ${res1.affectedRows} data Satuan Pendidikan.`);

        const updateLainnya = `
            UPDATE Users
            SET bentuk_pendidikan = 'Semua Bentuk'
            WHERE (instansi != 'Satuan Pendidikan' OR instansi IS NULL)
        `;
        const [res2] = await pool.query(updateLainnya);
        console.log(`Berhasil memperbarui ${res2.affectedRows} data lainnya menjadi 'Semua Bentuk'.`);
        
    } catch (e) {
        console.error("Terjadi kesalahan:", e);
    }
    process.exit(0);
}

main();
