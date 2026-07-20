const fs = require('fs');
let code = fs.readFileSync('public/js/portal.js', 'utf8');

// Patch showView
code = code.replace(
  "if (viewId === 'admin') _loadAdminData();",
  "if (viewId === 'admin') { resetUsersFilter(); _loadAdminData(); }"
);

// Patch adminTab
code = code.replace(
  "if (tab === 'ai-config' && !_aiConfigLoaded) loadAIConfig();",
  "if (tab === 'ai-config' && !_aiConfigLoaded) loadAIConfig();\n    if (tab === 'users') resetUsersFilter();"
);

fs.writeFileSync('public/js/portal.js', code);
console.log('Patched portal.js');
