require('dotenv').config();
const fs = require('fs');
const { hashPassword, generateSalt } = require('./utils/crypto');

const csvData = fs.readFileSync('../missing_sekolah.csv', 'utf8');
const lines = csvData.split('\n');

let sqlUsersUpdate = 'USE gaspol_portal;\n';

for(let i=1; i<lines.length; i++) {
    const line = lines[i].trim();
    if(!line) continue;
    const parts = line.split(';');
    const npsn = parts[0].trim();
    
    // Generate new hash for password: NPSN + 12345
    const salt = generateSalt();
    const pwdText = npsn + '12345';
    const pwd = hashPassword(pwdText, salt);
    
    sqlUsersUpdate += `UPDATE Users SET passwordHash = '${pwd}', salt = '${salt}' WHERE username = '${npsn}';\n`;
}

fs.writeFileSync('update_passwords.sql', sqlUsersUpdate);
console.log('SQL generated to update_passwords.sql');
