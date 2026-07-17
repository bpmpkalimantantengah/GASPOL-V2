const mysql = require('mysql2/promise');

async function main() {
    const pool = mysql.createPool({
        host: 'localhost',
        user: 'wasender',
        password: 'wasender2026',
        database: 'gaspol_portal'
    });

    const query = `
        UPDATE Users u
        JOIN master_sekolah s ON u.username = s.npsn
        SET u.instansi = 'Satuan Pendidikan'
    `;
    
    try {
        const [result] = await pool.execute(query);
        console.log("Berhasil mengubah instansi menjadi 'Satuan Pendidikan' untuk " + result.affectedRows + " pengguna.");
    } catch (e) {
        console.error("Gagal melakukan update:", e);
    }
    process.exit(0);
}

main();
