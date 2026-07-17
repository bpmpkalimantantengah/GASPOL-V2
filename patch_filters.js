const fs = require('fs');

let index = fs.readFileSync('public/portal/index.html', 'utf8');
let portal = fs.readFileSync('public/js/portal.js', 'utf8');

// 1. Index.html: Add filters
const filterHtml = `
            <select class="form-input" style="width:140px; padding:8px 12px;" onchange="App.setUsersJenjangFilter(this.value)" id="filter-user-jenjang">
              <option value="ALL">Semua Jenjang</option>
              <option value="SD">SD</option>
              <option value="SMP">SMP</option>
              <option value="SMA">SMA</option>
              <option value="SMK">SMK</option>
              <option value="SLB">SLB</option>
              <option value="PAUD">PAUD</option>
            </select>
            <select class="form-input" style="width:140px; padding:8px 12px;" onchange="App.setUsersBentukFilter(this.value)" id="filter-user-bentuk">
              <option value="ALL">Semua Bentuk</option>
              <option value="KB">KB</option>
              <option value="PKBM">PKBM</option>
              <option value="SD">SD</option>
              <option value="SKB">SKB</option>
              <option value="SLB">SLB</option>
              <option value="SMA">SMA</option>
              <option value="SMK">SMK</option>
              <option value="SMP">SMP</option>
              <option value="SPS">SPS</option>
              <option value="TK">TK</option>
              <option value="TPA">TPA</option>
            </select>`;

index = index.replace('<select class="form-input" style="width:150px; padding:8px 12px;" onchange="App.setUsersInstansiFilter(this.value)" id="filter-user-instansi">', filterHtml + '\n            <select class="form-input" style="width:150px; padding:8px 12px;" onchange="App.setUsersInstansiFilter(this.value)" id="filter-user-instansi">');

// 2. Index.html: Add header
index = index.replace('<th>Instansi</th><th>Jenjang</th><th>Role</th>', '<th>Instansi</th><th>Jenjang</th><th>Bentuk</th><th>Role</th>');
index = index.replace('<td colspan="11"', '<td colspan="12"');

fs.writeFileSync('public/portal/index.html', index);

// 3. portal.js: Add state variables
portal = portal.replace("let _usersInstansiFilter = 'ALL';", "let _usersInstansiFilter = 'ALL';\n  let _usersJenjangFilter = 'ALL';\n  let _usersBentukFilter = 'ALL';");

// 4. portal.js: Add setters
portal = portal.replace("function setUsersInstansiFilter(v) { _usersInstansiFilter = v; _renderUsersTable(); }", "function setUsersInstansiFilter(v) { _usersInstansiFilter = v; _renderUsersTable(); }\n  function setUsersJenjangFilter(v) { _usersJenjangFilter = v; _renderUsersTable(); }\n  function setUsersBentukFilter(v) { _usersBentukFilter = v; _renderUsersTable(); }");

// 5. portal.js: Add filter logic
portal = portal.replace("if (_usersInstansiFilter !== 'ALL' && (u.instansi || '') !== _usersInstansiFilter) return false;", "if (_usersInstansiFilter !== 'ALL' && (u.instansi || '') !== _usersInstansiFilter) return false;\n      if (_usersJenjangFilter !== 'ALL' && (u.jenjang || 'Semua Jenjang') !== _usersJenjangFilter) return false;\n      if (_usersBentukFilter !== 'ALL' && (u.bentuk_pendidikan || 'Semua Bentuk') !== _usersBentukFilter) return false;");

// 6. portal.js: Render column
portal = portal.replace("<td style=\"font-size:12px;\">${u.jenjang || 'Semua Jenjang'}</td>", "<td style=\"font-size:12px;\">${u.jenjang || 'Semua Jenjang'}</td>\n        <td style=\"font-size:12px;\">${u.bentuk_pendidikan || 'Semua Bentuk'}</td>");

// 7. portal.js: Export functions
portal = portal.replace("setUsersSearch, setUsersRoleFilter, setUsersInstansiFilter, setUsersAppFilter,", "setUsersSearch, setUsersRoleFilter, setUsersInstansiFilter, setUsersJenjangFilter, setUsersBentukFilter, setUsersAppFilter,");

fs.writeFileSync('public/js/portal.js', portal);
console.log("Patched filters!");
