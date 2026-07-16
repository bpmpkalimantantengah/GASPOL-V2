const mysql = require('mysql2/promise');
require('dotenv').config();

async function createSsoIndexes() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'gaspol_portal'
  });

  try {
    console.log("Menambahkan index ke tabel Sessions...");
    await db.query("ALTER TABLE Sessions ADD INDEX idx_token (token);").catch(e => { 
      if(e.code !== 'ER_DUP_KEYNAME') throw e; 
      else console.log('Index idx_token sudah ada'); 
    });
    
    console.log("Menambahkan index ke tabel Users...");
    await db.query("ALTER TABLE Users ADD INDEX idx_userId (userId);").catch(e => { 
      if(e.code !== 'ER_DUP_KEYNAME') throw e; 
      else console.log('Index idx_userId sudah ada'); 
    });

    console.log("Indexing SSO selesai dengan sukses.");
    process.exit(0);
  } catch (error) {
    console.error("Gagal membuat index:", error);
    process.exit(1);
  }
}

createSsoIndexes();
