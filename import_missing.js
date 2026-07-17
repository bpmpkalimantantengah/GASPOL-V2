require('dotenv').config();
const fs = require('fs');
const { hashPassword, generateSalt, generateUuid } = require('./utils/crypto');

const csvData = fs.readFileSync('../missing_sekolah.csv', 'utf8');
const lines = csvData.split('\n');

let sqlMaster = '';
let sqlUsers = '';
let sqlPpkpsp = '';

for(let i=1; i<lines.length; i++) {
    const line = lines[i].trim();
    if(!line) continue;
    const parts = line.split(';');
    const npsn = parts[0].trim();
    const nama = parts[1].trim().replace(/'/g, "\\'");
    const bentuk = parts[2].trim();
    let jenjang = parts[3].trim();
    let status = parts[4].trim();
    const akreditasi = parts[5].trim();
    const ks = parts[6].trim().replace(/'/g, "\\'");
    const alamat = parts[7].trim().replace(/'/g, "\\'");
    const desa = parts[8].trim().replace(/'/g, "\\'");
    const kecamatan = parts[9].trim().replace(/'/g, "\\'");
    const kabupaten = parts[10].trim().replace(/'/g, "\\'");

    if(jenjang.includes('PAUD')) jenjang = 'PAUD';
    if(jenjang.includes('SD')) jenjang = 'SD';
    if(jenjang.includes('SMP')) jenjang = 'SMP';
    if(jenjang.includes('SMA')) jenjang = 'SMA';
    if(jenjang.includes('SMK')) jenjang = 'SMK';
    if(jenjang.includes('SLB')) jenjang = 'SLB';

    if(status.toLowerCase().includes('negeri')) status = 'Negeri';
    else if(status.toLowerCase().includes('swasta')) status = 'Swasta';
    else status = 'Negeri';

    // 1. master_sekolah
    sqlMaster += `INSERT IGNORE INTO master_sekolah (npsn, nama_sekolah, bentuk_pendidikan, jenjang, status_sekolah, akreditasi, alamat_jalan, desa_kelurahan, kecamatan, kabupaten, jumlah_guru, jumlah_siswa) VALUES ('${npsn}', '${nama}', '${bentuk}', '${jenjang}', '${status}', '${akreditasi}', '${alamat}', '${desa}', '${kecamatan}', '${kabupaten}', 0, 0);\n`;

    // 2. Users
    const userId = generateUuid();
    const salt = generateSalt();
    const pwd = hashPassword('123456', salt);
    sqlUsers += `INSERT IGNORE INTO Users (userId, username, passwordHash, salt, fullName, instansi, bentuk_pendidikan, role, status) VALUES ('${userId}', '${npsn}', '${pwd}', '${salt}', '${nama}', 'Satuan Pendidikan', '${bentuk}', 'USER', 'ACTIVE');\n`;

    // 3. ppkpsp_sekolah
    sqlPpkpsp += `INSERT IGNORE INTO gaspol_ppkpsp.ppkpsp_sekolah (npsn, nama_sekolah, jenjang, akreditasi, alamat, kecamatan, kabupaten, provinsi, kepala_sekolah, status_sekolah) VALUES ('${npsn}', '${nama}', '${jenjang}', '${akreditasi}', '${alamat}', '${kecamatan}', '${kabupaten}', 'Kalimantan Tengah', '${ks}', '${status}');\n`;
}

fs.writeFileSync('import_missing.sql', `
USE gaspol_portal;
${sqlMaster}
${sqlUsers}

USE gaspol_ppkpsp;
${sqlPpkpsp}
`);

console.log('SQL generated to import_missing.sql');
