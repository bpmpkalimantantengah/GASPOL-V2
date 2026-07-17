const mysql = require('mysql2/promise');

async function main() {
    const pool = mysql.createPool({
        host: 'localhost',
        user: 'wasender',
        password: 'wasender2026',
        database: 'gaspol_portal'
    });

    try {
        const [rows] = await pool.query("SELECT DISTINCT bentuk_pendidikan FROM master_sekolah WHERE bentuk_pendidikan IS NOT NULL AND bentuk_pendidikan != '' ORDER BY bentuk_pendidikan ASC");
        
        console.log("=== Daftar Bentuk Pendidikan ===");
        rows.forEach(row => {
            console.log("- " + row.bentuk_pendidikan);
        });
        console.log("Total: " + rows.length);
        
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

main();
