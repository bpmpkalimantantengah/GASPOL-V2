const mysql = require('mysql2/promise');

async function main() {
    const pool = mysql.createPool({
        host: 'localhost',
        user: 'wasender',
        password: 'wasender2026',
        database: 'gaspol_portal'
    });

    try {
        console.log("=== Kolom di tabel Users ===");
        const [usersCols] = await pool.query("SHOW COLUMNS FROM Users");
        const uCols = usersCols.map(c => c.Field);
        console.log(uCols.join(', '));
        
        console.log("\n=== Kolom di tabel master_sekolah ===");
        const [sekolahCols] = await pool.query("SHOW COLUMNS FROM master_sekolah");
        const sCols = sekolahCols.map(c => c.Field);
        console.log(sCols.join(', '));
        
        const bentukPendidikanUsers = uCols.some(c => c.toLowerCase().includes('bentuk') && c.toLowerCase().includes('pendidikan'));
        const bentukPendidikanSekolah = sCols.some(c => c.toLowerCase().includes('bentuk') && c.toLowerCase().includes('pendidikan'));
        
        console.log("\n--- Hasil Pencarian ---");
        console.log("Ada di Users?", bentukPendidikanUsers ? "Ya" : "Tidak");
        console.log("Ada di master_sekolah?", bentukPendidikanSekolah ? "Ya" : "Tidak");
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

main();
