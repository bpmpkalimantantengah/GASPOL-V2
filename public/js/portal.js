// ============================================================
// GASPOL V2 — Portal Client JavaScript
// File   : public/js/portal.js
// Fungsi : Port 1:1 dari Portal.html <script> GAS
//          Konversi: google.script.run → fetch('/api/portal/action')
// ============================================================

// ── API Base URL (otomatis deteksi) ─────────────────────
const API_BASE = window.location.origin;
const PORTAL_URL = API_BASE + '/portal';

// ── URL Params (menggantikan GAS_PARAMS) ────────────────
const URL_PARAMS = (() => {
  const p = new URLSearchParams(window.location.search);
  return {
    token: p.get('token') || '',
    error: p.get('error') || '',
    appId: p.get('appId') || '',
    redirect: p.get('redirect') || '',
  };
})();

const App = (() => {
  let _token = null;
  let _user  = null;
  let _apps  = [];
  let _allUsers = [];
  let _allAdminApps = [];

  // ── SLIDER LOGIC ───────────────────────────────────────
  let sliderContainer, sliderThumb, sliderFill, sliderText;
  let isDragging = false, startX = 0, thumbMaxMove = 0, isMagnetized = false;

  function initSlider() {
    sliderContainer = document.getElementById('slide-login');
    if(!sliderContainer) return;
    sliderThumb = document.getElementById('slide-login-thumb');
    sliderFill = document.getElementById('slide-login-fill');
    sliderText = document.getElementById('slide-login-text');
    
    sliderThumb.addEventListener('mousedown', startDrag);
    sliderThumb.addEventListener('touchstart', startDrag, {passive: true});
    window.addEventListener('mouseup', stopDrag);
    window.addEventListener('touchend', stopDrag);
    window.addEventListener('mousemove', doDrag);
    window.addEventListener('touchmove', doDrag, {passive: false});
  }

  function startDrag(e) {
    if(sliderContainer.classList.contains('success') || sliderContainer.classList.contains('loading')) return;
    isDragging = true;
    isMagnetized = false;
    sliderThumb.style.transition = 'none';
    sliderFill.style.transition = 'none';
    startX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
    thumbMaxMove = sliderContainer.clientWidth - sliderThumb.clientWidth - 8;
  }

  function doDrag(e) {
    if (!isDragging) return;
    let currentX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
    let moveX = currentX - startX;
    if (moveX < 0) moveX = 0;
    if (moveX > thumbMaxMove) moveX = thumbMaxMove;
    
    if (moveX > thumbMaxMove - 30) {
      moveX = thumbMaxMove;
      if (!isMagnetized) {
        isMagnetized = true;
        sliderThumb.style.transition = 'left 0.15s ease-out';
        sliderFill.style.transition = 'width 0.15s ease-out';
      }
    } else {
      if (isMagnetized) {
        isMagnetized = false;
        sliderThumb.style.transition = 'none';
        sliderFill.style.transition = 'none';
      }
    }
    
    sliderThumb.style.left = (moveX + 4) + 'px';
    sliderFill.style.width = (moveX + 24) + 'px';
    
    let opacity = 1 - (moveX / (thumbMaxMove * 0.5));
    sliderText.style.opacity = opacity < 0 ? 0 : opacity;
  }

  function stopDrag(e) {
    if (!isDragging) return;
    isDragging = false;
    let currentX = parseFloat(sliderThumb.style.left) - 4;
    
    if (currentX >= thumbMaxMove * 0.95) {
      sliderContainer.classList.add('success');
      let lockIcon = document.getElementById('slide-lock-icon');
      if(lockIcon) lockIcon.innerHTML = '<i class="ti ti-lock-open"></i>';
      
      sliderThumb.style.transition = 'left 0.2s';
      sliderFill.style.transition = 'width 0.2s';
      sliderThumb.style.left = (thumbMaxMove + 4) + 'px';
      sliderFill.style.width = '100%';
      login();
    } else {
      resetSlider();
    }
  }

  function resetSlider() {
    if(!sliderContainer) return;
    isMagnetized = false;
    sliderThumb.style.transition = 'left 0.3s ease-out';
    sliderFill.style.transition = 'width 0.3s ease-out';
    sliderThumb.style.left = '4px';
    sliderFill.style.width = '0';
    sliderText.style.opacity = '1';
    sliderText.innerHTML = 'Geser untuk Masuk';
    sliderText.style.color = 'var(--text2)';
    sliderThumb.innerHTML = '<i class="ti ti-chevrons-right"></i>';
    sliderContainer.classList.remove('success', 'loading');
    
    let lockIcon = document.getElementById('slide-lock-icon');
    if(lockIcon) lockIcon.innerHTML = '<i class="ti ti-lock"></i>';
  }

  function setSliderLoading() {
    if(!sliderContainer) return;
    sliderContainer.classList.add('loading');
    sliderText.innerHTML = 'Memproses...';
    sliderText.style.opacity = '1';
    sliderText.style.zIndex = '4';
    sliderText.style.color = 'white';
    sliderFill.style.width = '100%';
    sliderThumb.style.left = (sliderContainer.clientWidth - sliderThumb.clientWidth - 4) + 'px';
    sliderThumb.innerHTML = '<div class="spinner" style="width:18px;height:18px;border-width:2px; border-top-color:white;"></div>';
  }

  // ── INIT ───────────────────────────────────────────────
  async function init() {
    initSlider();
    setTopbarDate();

    // Cek error dari redirect
    const urlError = URL_PARAMS.error;
    if (urlError) {
       const errEl = document.getElementById('err-login');
       errEl.textContent = urlError;
       errEl.style.display = 'block';
       try { window.history.replaceState({}, document.title, window.location.pathname); } catch(e){}
    }

    // Cek token tersimpan di localStorage
    const saved = localStorage.getItem('gaspol_token');
    if (saved) {
      const r = await apiGet('validateToken', { token: saved });
      if (r.valid) {
        _token = saved;
        _user  = r.user;
        await _loadPostLogin();
        
        // Redirect jika datang dari child app
        const redirect = URL_PARAMS.redirect;
        const appId    = URL_PARAMS.appId;
        if (redirect && appId) {
          const targetUrl = redirect.split('?')[0] + '?token=' + _token + '&appId=' + appId;
          window.location.replace(targetUrl);
          return;
        }

        showApp();
        return;
      }
      localStorage.removeItem('gaspol_token');
    }

    // Cek token dari URL param
    const urlToken = URL_PARAMS.token;
    if (urlToken) {
      const r = await apiGet('validateToken', { token: urlToken });
      if (r.valid) {
        _token = urlToken;
        _user  = r.user;
        localStorage.setItem('gaspol_token', _token);
        await _loadPostLogin();
        showApp();
        return;
      }
    }

    hideLoading();
    document.getElementById('page-login').classList.remove('hidden');
  }

  // ── LOGIN ──────────────────────────────────────────────
  async function login() {
    const username = document.getElementById('inp-username').value.trim();
    const password = document.getElementById('inp-password').value;
    const errEl    = document.getElementById('err-login');

    errEl.style.display = 'none';
    if (!username || !password) {
      errEl.textContent  = 'Harap isi username dan password.';
      errEl.style.display = 'block';
      resetSlider();
      return;
    }

    _isLoggingOut = false;
    setSliderLoading();

    const appId     = URL_PARAMS.appId || '';
    const redirect  = URL_PARAMS.redirect || '';

    // ── KONVERSI KRITIS: fetch() menggantikan google.script.run ──
    const r = await apiPost({ action: 'login', username, password, appId }, false);

    if (!r.success) {
      resetSlider();
      errEl.textContent  = r.error || 'Login gagal.';
      errEl.style.display = 'block';
      return;
    }

    _token = r.token;
    _user  = r.user;
    _apps  = r.apps || [];
    localStorage.setItem('gaspol_token', _token);

    // Jika ada redirect (dari child app), kembalikan ke sana
    if (redirect && appId) {
      const targetUrl = redirect.split('?')[0] + '?token=' + _token + '&appId=' + appId;
      window.location.replace(targetUrl);
      return;
    }

    await _loadPostLogin();
    showApp();
    resetSlider();
    toast('Selamat datang, ' + _user.fullName + '!', 'success');
  }

  function loginWithGoogle() {
    toast('Login Google Workspace dalam pengembangan.', 'info');
  }

  // ── LOGOUT ─────────────────────────────────────────────
  async function logout() {
    const ok = await showConfirm('Konfirmasi Keluar', 'Apakah Anda yakin ingin keluar dari sesi saat ini?', true);
    if (!ok) return;
    await forceLogout('Anda telah keluar dari GASPOL.');
  }

  let _isLoggingOut = false;
  let _heartbeatInterval = null;

  async function forceLogout(message) {
    if (_isLoggingOut) return;
    _isLoggingOut = true;
    
    if (_heartbeatInterval) { clearInterval(_heartbeatInterval); _heartbeatInterval = null; }
    
    if (_token) {
        apiGet('logout', { token: _token }, false).catch(() => {});
    }
    localStorage.removeItem('gaspol_token');
    try {
      localStorage.setItem('gaspol_sess_state', JSON.stringify({ state: 'logout', ts: Date.now() }));
      new BroadcastChannel('gaspol_sso_channel').postMessage({ type: 'LOGOUT', reason: 'portal_logout' });
    } catch(e) {}
    _token = null; _user = null; _apps = [];
    document.getElementById('page-app').classList.add('hidden');
    document.getElementById('page-login').classList.remove('hidden');
      
    const dashNav = document.querySelector('.nav-item[onclick*="dashboard"]');
    showView('dashboard', dashNav);

    const pwInputs = ['inp-username', 'inp-password', 'inp-old-pass', 'inp-new-pass', 'inp-confirm-pass'];
    pwInputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.value = '';
        if (el.type === 'text' && id.includes('pass')) {
          el.type = 'password';
          const icon = el.nextElementSibling;
          if (icon && icon.classList.contains('ti-eye-off')) {
            icon.classList.remove('ti-eye-off');
            icon.classList.add('ti-eye');
          }
        }
      }
    });

    toast(message || 'Anda telah keluar.', 'info');
    setTimeout(() => { _isLoggingOut = false; }, 3000);
  }

  // ── Post-login: load data yang dibutuhkan ─────────────
  async function _loadPostLogin() {
    if (!_apps.length) {
      const r = await apiGet('getApps', { token: _token });
      _apps = r.apps || [];
    }
    _renderSidebar();
    _renderDashboard();
    _renderProfileView();

    const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(_user.role);
    if (isAdmin) {
      document.getElementById('nav-admin').style.display = 'flex';
      document.getElementById('stat-card-users').style.display = 'flex';
      
      const isSuperAdmin = _user.role === 'SUPER_ADMIN';
      const btnRegApp = document.getElementById('btn-register-app');
      if (btnRegApp) btnRegApp.style.display = isSuperAdmin ? 'flex' : 'none';
      const btnBulkDel = document.getElementById('btn-bulk-delete');
      if (btnBulkDel) btnBulkDel.style.display = isSuperAdmin ? 'flex' : 'none';
      const tabAiBtn = document.getElementById('tab-ai-btn');
      if (tabAiBtn) tabAiBtn.style.display = isSuperAdmin ? 'flex' : 'none';
      const tabAppsMgmtBtn = document.getElementById('tab-apps-mgmt-btn');
      if (tabAppsMgmtBtn) tabAppsMgmtBtn.style.display = isSuperAdmin ? 'flex' : 'none';

      const tabOnlineBtn = document.getElementById('tab-online-users-btn');
      if (tabOnlineBtn) tabOnlineBtn.style.display = 'flex';
      document.getElementById('stat-card-sessions').style.display = 'flex';

      const stats = await apiGet('getStats', { token: _token });
      if (stats.success) {
        document.getElementById('stat-users').textContent    = stats.totalUsers    || 0;
        document.getElementById('stat-sessions').textContent = stats.activeSessions || 0;
      }
    } else {
      document.getElementById('nav-admin').style.display = 'none';
      const statUsers = document.getElementById('stat-card-users');
      if (statUsers) statUsers.style.display = 'none';
      const statSessions = document.getElementById('stat-card-sessions');
      if (statSessions) statSessions.style.display = 'none';
    }

    if (_heartbeatInterval) clearInterval(_heartbeatInterval);
    _heartbeatInterval = setInterval(() => {
      if (!_token) { clearInterval(_heartbeatInterval); _heartbeatInterval = null; return; }
      apiGet('getStats', { token: _token }, false).catch(() => {});
    }, 4 * 60 * 1000);
  }

  // ── Render sidebar info user ───────────────────────────
  function _renderSidebar() {
    const initials = _user.fullName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
    const avatarEl = document.getElementById('sidebar-avatar');
    if (_user.photo) {
      avatarEl.innerHTML = `<img src="${_user.photo}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;object-position:top;">`;
    } else {
      avatarEl.textContent = initials;
    }
    document.getElementById('sidebar-name').textContent   = _user.fullName;
    document.getElementById('sidebar-role').textContent   = _user.role;

    const greets = ['Selamat pagi', 'Selamat siang', 'Selamat sore', 'Selamat malam'];
    const h = new Date().getHours();
    const g = h < 11 ? 0 : h < 15 ? 1 : h < 18 ? 2 : 3;
    document.getElementById('topbar-greet').textContent = greets[g] + ', ' + _user.fullName + '!';
  }

  // ── Render dashboard app cards ─────────────────────────
  function _renderDashboard() {
    document.getElementById('stat-apps').textContent = _apps.length;
    document.getElementById('badge-apps').textContent = _apps.length;

    const activeApps = _apps.filter(a => a.status === 'ACTIVE');
    document.getElementById('stat-apps').textContent = activeApps.length;

    document.getElementById('dashboard-apps').innerHTML = _apps.length
      ? _apps.map(a => _appCardHTML(a)).join('')
      : '<p style="color:var(--text3);font-size:13px;">Belum ada aplikasi yang dapat diakses.</p>';

    document.getElementById('all-apps-grid').innerHTML = document.getElementById('dashboard-apps').innerHTML;

    // Load Capaian Program Prioritas
    const ppkpspApp = _apps.find(a => a.appName.toUpperCase().includes('PPKPSP'));
    if (_user.role === 'USER' && ppkpspApp) {
      document.getElementById('dashboard-priority-programs').style.display = 'block';
      const pGrid = document.getElementById('priority-programs-grid');
      pGrid.innerHTML = '<div style="color:var(--text3); font-size:13px;">Memuat data PPKPSP...</div>';
      
      apiPost({ action: 'getPPKPSPStats', token: _token }).then(r => {
        if (r.success && r.data) {
          let bColor = '', bText = '', iconHTML = '';
          if (r.data.status_dashboard.includes('Optimal')) {
            bColor = '#dcfce7'; bText = '#166534';
            iconHTML = '<i class="ti ti-leaf"></i>';
          } else if (r.data.status_dashboard.includes('Berkembang')) {
            bColor = '#fef9c3'; bText = '#854d0e';
            iconHTML = '<i class="ti ti-seeding"></i>';
          } else if (r.data.status_dashboard.includes('Mulai')) {
            bColor = '#ffedd5'; bText = '#9a3412';
            iconHTML = '<i class="ti ti-plant-2"></i>';
          } else {
            bColor = '#fee2e2'; bText = '#991b1b';
            iconHTML = '<i class="ti ti-alert-circle"></i>';
          }
          let htmlImpl = r.data.status_dashboard.replace('≡ƒî│ ', '').replace('≡ƒî┐ ', '').replace('≡ƒî▒ ', '').replace('≡ƒî░ ', '');
          pGrid.innerHTML = `
            <div style="display: flex; width: 100%; box-sizing: border-box; gap: 10px; align-items: flex-start; padding: 12px 14px; border-radius: 8px; background-color: ${bColor}; color: ${bText};">
              <div style="font-size: 20px; line-height: 1; width: 24px; text-align: center; margin-top: 2px;">${iconHTML}</div>
              <div style="display: flex; flex-direction: column; gap: 6px;">
                <div style="font-size: 16px; font-weight: 700; line-height: 1;">${htmlImpl} <span style="font-size:12px; font-weight:400; opacity:0.6;">(Nilai: ${r.data.nilai_akhir || 0})</span></div>
                <div style="font-size: 13px; font-style: italic; opacity: 0.9;">${r.data.keterangan || ''}</div>
              </div>
            </div>
          `;
        } else {
          pGrid.innerHTML = '<div style="color:var(--text3); font-size:13px;">Belum ada data implementasi PPKPSP.</div>';
        }
      });
    } else {
      document.getElementById('dashboard-priority-programs').style.display = 'none';
    }
  }

  function _appCardHTML(a) {
    const bgColor = (a.color || '#1E90FF') + '22';
    const statusMap = { ACTIVE: 'status-active', INACTIVE: 'status-inactive', MAINTENANCE: 'status-maintenance' };
    const statusLabel = { ACTIVE: 'Aktif', INACTIVE: 'Nonaktif', MAINTENANCE: 'Maintenance' };
    return `<div class="app-card" onclick="openApp('${a.appUrl}','${a.appId}')">
      <div class="app-card-head">
        <div class="app-card-icon" style="background:${bgColor}">
          <i class="ti ${a.appIcon || 'ti-app'}" style="color:${a.color || '#1E90FF'}"></i>
        </div>
        <div>
          <div class="app-card-name">${a.appName}</div>
          <div class="app-card-desc">${a.description || ''}</div>
        </div>
      </div>
      <div class="app-card-footer">
        <span class="status-badge ${statusMap[a.status] || ''}">${statusLabel[a.status] || a.status}</span>
        <span class="app-link"><i class="ti ti-external-link"></i> Buka</span>
      </div>
    </div>`;
  }

  // ── Render profil ──────────────────────────────────────
  function _renderProfileView() {
    const initials = _user.fullName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
    const avatarEl = document.getElementById('profile-avatar');
    if (_user.photo) {
      avatarEl.innerHTML = `<img src="${_user.photo}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;object-position:top;">`;
    } else {
      avatarEl.textContent = initials;
    }
    document.getElementById('profile-name').textContent    = _user.fullName;
    document.getElementById('profile-email').innerHTML     = '<i class="ti ti-mail"></i> ' + (_user.email || '-');
    document.getElementById('profile-whatsapp').innerHTML  = '<i class="ti ti-brand-whatsapp"></i> ' + (_user.whatsapp || '-');
    document.getElementById('profile-username').textContent = _user.username;
    document.getElementById('profile-role').textContent    = _user.role;
    document.getElementById('profile-status').textContent  = _user.status;
    document.getElementById('profile-lastlogin').textContent = _user.lastLogin ? formatDateID(_user.lastLogin) : '—';
    document.getElementById('profile-created').textContent  = _user.createdAt ? formatDateID(_user.createdAt) : '-';
  }

  // ── Navigasi antar view ────────────────────────────────
  function toggleSidebar(forceClose = false) {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const icon = document.getElementById('icon-sidebar-toggle');
    if (sidebar) {
      if (forceClose === true) {
        sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('open');
      } else {
        sidebar.classList.toggle('open');
        if (overlay) overlay.classList.toggle('open');
      }
      if (icon) {
        icon.className = sidebar.classList.contains('open') ? 'ti ti-chevron-left' : 'ti ti-chevron-right';
      }
    }
  }

  function showView(viewId, navEl) {
    document.querySelectorAll('.page-view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    document.getElementById('view-' + viewId).classList.add('active');
    if (navEl) navEl.classList.add('active');
    if (window.innerWidth <= 768) toggleSidebar(true);

    if (viewId === 'admin') _loadAdminData();
  }

  // ── Load data admin ────────────────────────────────────
  async function _loadAdminData() {
    await Promise.all([
      _loadUsers(),
      _loadAdminApps(),
      _loadLogs()
    ]);
  }

  async function _loadUsers() {
    document.getElementById('users-tbody').innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;"><div class="spinner" style="width:24px;height:24px;border-width:2px;margin:auto;"></div><div style="margin-top:10px;font-size:12px;color:var(--text3);">Memuat data...</div></td></tr>';
    const r = await apiGet('getAllUsers', { token: _token });
    _allUsers = r.users || [];
    _applyUsersFilter();
  }

  let _usersCurrentPage = 1;
  let _usersPerPage = 10;
  let _usersRoleFilter = 'ALL';
  let _usersInstansiFilter = ['ALL'];
  let _usersJenjangFilter = ['ALL'];
  let _usersBentukFilter = ['ALL'];
  let _usersAppFilter = 'ALL';
  let _usersSearchQuery = '';

  function setUsersSearch(q) { _usersSearchQuery = q; _usersCurrentPage = 1; _applyUsersFilter(); }
  function setUsersRoleFilter(r) { _usersRoleFilter = r; _usersCurrentPage = 1; _applyUsersFilter(); }
  function setUsersAppFilter(a) { _usersAppFilter = a; _usersCurrentPage = 1; _applyUsersFilter(); }
  function setUsersPerPage(p) { _usersPerPage = p; _usersCurrentPage = 1; _applyUsersFilter(); }
  function setUsersPage(p) { _usersCurrentPage = p; _applyUsersFilter(); }
  
  function toggleMultiSelect(id, event) {
    if(event) event.stopPropagation();
    document.querySelectorAll('.multi-select-dropdown').forEach(el => {
      if (el.id !== id) el.classList.remove('active');
    });
    document.getElementById(id).classList.toggle('active');
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.multi-select-wrap')) {
      document.querySelectorAll('.multi-select-dropdown').forEach(el => el.classList.remove('active'));
    }
  });

  function handleMultiSelectChange(type, clickedValue) {
    const cbs = Array.from(document.querySelectorAll(`.cb-${type}`));
    if (clickedValue === 'ALL') {
      cbs.forEach(cb => { if (cb.value !== 'ALL') cb.checked = false; });
    } else {
      const allCb = cbs.find(cb => cb.value === 'ALL');
      if (allCb) allCb.checked = false;
    }
    
    let checkedVals = cbs.filter(cb => cb.checked).map(cb => cb.value);
    if (checkedVals.length === 0) {
      const allCb = cbs.find(cb => cb.value === 'ALL');
      if (allCb) allCb.checked = true;
      checkedVals = ['ALL'];
    }
    
    if (type === 'jenjang') {
      _usersJenjangFilter = checkedVals;
      document.getElementById('label-jenjang').innerText = checkedVals.includes('ALL') ? 'Semua Jenjang' : checkedVals.join(', ');
    } else if (type === 'bentuk') {
      _usersBentukFilter = checkedVals;
      document.getElementById('label-bentuk').innerText = checkedVals.includes('ALL') ? 'Semua Bentuk' : checkedVals.join(', ');
    } else if (type === 'instansi') {
      _usersInstansiFilter = checkedVals;
      document.getElementById('label-instansi').innerText = checkedVals.includes('ALL') ? 'Semua Instansi' : checkedVals.join(', ');
    }
    
    _usersCurrentPage = 1;
    _applyUsersFilter();
  }

  function resetUsersFilter() {
    _usersSearchQuery = '';
    _usersRoleFilter = 'ALL';
    _usersInstansiFilter = ['ALL'];
    _usersJenjangFilter = ['ALL'];
    _usersBentukFilter = ['ALL'];
    _usersAppFilter = 'ALL';
    _usersCurrentPage = 1;
    document.getElementById('inp-search-user').value = '';
    document.getElementById('filter-user-role').value = 'ALL';
    document.getElementById('filter-user-app').value = 'ALL';
    
    document.querySelectorAll('.multi-select-dropdown input[type="checkbox"]').forEach(cb => cb.checked = (cb.value === 'ALL'));
    document.getElementById('label-jenjang').innerText = 'Semua Jenjang';
    document.getElementById('label-bentuk').innerText = 'Semua Bentuk';
    document.getElementById('label-instansi').innerText = 'Semua Instansi';
    
    _applyUsersFilter();
  }

    function _applyUsersFilter() {
    let filtered = _allUsers;
    
    if (_usersSearchQuery) {
      const q = _usersSearchQuery.toLowerCase();
      filtered = filtered.filter(u => 
        (u.fullName || '').toLowerCase().includes(q) || 
        (u.username || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
      );
    }
    if (!_usersInstansiFilter.includes('ALL')) {
      filtered = filtered.filter(u => _usersInstansiFilter.includes(u.instansi || 'Semua Instansi'));
    }
    if (!_usersJenjangFilter.includes('ALL')) {
      filtered = filtered.filter(u => _usersJenjangFilter.includes(u.jenjang || 'Semua Jenjang'));
    }
    if (!_usersBentukFilter.includes('ALL')) {
      filtered = filtered.filter(u => _usersBentukFilter.includes(u.bentuk_pendidikan || 'Semua Bentuk'));
    }
    if (_usersRoleFilter !== 'ALL') {
      filtered = filtered.filter(u => u.role === _usersRoleFilter);
    }
    if (_usersAppFilter !== 'ALL') {
      if (_usersAppFilter === 'NO_APP') {
        filtered = filtered.filter(u => !u.apps || u.apps.length === 0);
      } else {
        filtered = filtered.filter(u => u.apps && u.apps.some(a => a.startsWith(_usersAppFilter)));
      }
    }

    _renderUsersTable(filtered);
  }

  function _renderUsersTable(filtered) {
    const tbody = document.getElementById('users-tbody');
    const pageEl = document.getElementById('users-pagination');
    
    document.getElementById('cb-all-users').checked = false;
    document.getElementById('bulk-actions').style.display = 'none';
    
    if (!filtered || !filtered.length) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text3);padding:24px;">Tidak ada pengguna yang cocok.</td></tr>';
      if (pageEl) pageEl.innerHTML = '';
      return;
    }

    let toRender = filtered;
    let totalPages = 1;

    if (_usersPerPage !== 'all') {
      const limit = parseInt(_usersPerPage) || 10;
      totalPages = Math.ceil(filtered.length / limit);
      if (_usersCurrentPage > totalPages) _usersCurrentPage = Math.max(1, totalPages);
      const start = (_usersCurrentPage - 1) * limit;
      toRender = filtered.slice(start, start + limit);
    } else {
      _usersCurrentPage = 1;
    }

    tbody.innerHTML = toRender.map(u => {
      const isProtectedTarget = ((u.role === 'SUPER_ADMIN' || u.role === 'ADMIN') && _user.role !== 'SUPER_ADMIN');
      return `
      <tr>
        <td style="text-align:center;"><input type="checkbox" class="cb-user" value="${u.userId}" data-username="${u.username}" onchange="App.updateBulkActions()" ${isProtectedTarget ? 'disabled title="Admin tidak dapat mengedit sesama Admin"' : ''} /></td>
        <td><strong>${u.fullName}</strong></td>
        <td>${u.username}</td>
        <td>${u.email || ''} ${u.email && u.whatsapp ? '<br>' : ''} ${u.whatsapp || ''}</td>
        <td style="font-size:12px;">${u.instansi || '<span style="color:var(--text3)">—</span>'}</td>
        <td style="font-size:12px;">${u.jenjang || 'Semua Jenjang'}<br><span style="color:var(--text3);font-size:11px;">${u.bentuk_pendidikan || 'Semua Bentuk'}</span></td>
        <td>
          <div style="display:flex; flex-direction:column; gap:4px; align-items:flex-start;">
            <span class="role-badge role-${u.role.toLowerCase().replace('_','-')}">${u.role}</span>
            <div style="display:flex;align-items:center;gap:6px;">
              <span class="status-badge ${u.status === 'ACTIVE' ? 'status-active' : 'status-inactive'}">${u.status}</span>
              ${u.isDefaultPassword ? '<span style="color:var(--danger);font-size:14px;display:flex;align-items:center;" title="Password bawaan"><i class="ti ti-alert-triangle"></i></span>' : '<span style="color:var(--success);font-size:14px;display:flex;align-items:center;" title="Password sudah diubah"><i class="ti ti-shield-check"></i></span>'}
            </div>
          </div>
        </td>
        <td style="font-size:11px;color:var(--text);line-height:1.4;">${u.role === 'SUPER_ADMIN' ? '<span style="color:var(--gs);font-weight:600;"><i class="ti ti-apps"></i> Semua Aplikasi</span>' : ((u.apps && u.apps.length > 0) ? u.apps.join('<br>') : '<span style="color:var(--text3)">—</span>')}</td>
        <td style="font-size:11px;color:var(--text3);">${formatDateID(u.lastLogin)}</td>
        <td><div class="actions">
          ${isProtectedTarget ? '' : `
            <button class="action-btn" title="Edit" onclick="App.editUser('${u.userId}')"><i class="ti ti-edit"></i></button>
            <button class="action-btn" title="Reset PW" onclick="App.resetUserPassword('${u.userId}','${u.username}')"><i class="ti ti-key"></i></button>
          `}
          ${_user.role === 'SUPER_ADMIN' && u.role !== 'SUPER_ADMIN' ? `<button class="action-btn danger" title="Hapus" onclick="App.deleteUser('${u.userId}','${u.username}')"><i class="ti ti-trash"></i></button>` : ''}
        </div></td>
      </tr>
      `;
    }).join('');

    if (pageEl) {
      if (_usersPerPage === 'all' || totalPages <= 1) {
        pageEl.innerHTML = `<span style="font-size:12px;color:var(--text3);">Total: ${filtered.length} pengguna</span>`;
      } else {
        let btns = `<span style="font-size:12px;color:var(--text3);margin-right:auto;">Menampilkan ${toRender.length} dari ${filtered.length} pengguna</span>`;
        btns += `<button class="action-btn" ${_usersCurrentPage <= 1 ? 'disabled' : ''} onclick="App.setUsersPage(${_usersCurrentPage - 1})"><i class="ti ti-chevron-left"></i></button>`;
        for(let i=1; i<=totalPages; i++) {
          if (totalPages > 7) {
            if (i === 1 || i === totalPages || (i >= _usersCurrentPage - 1 && i <= _usersCurrentPage + 1)) {
              const active = i === _usersCurrentPage ? 'background:var(--gp);color:#fff;border-color:var(--gp);' : '';
              btns += `<button class="action-btn" style="width:28px;height:28px;padding:0;${active}" onclick="App.setUsersPage(${i})">${i}</button>`;
            } else if (i === 2 && _usersCurrentPage > 3) {
              btns += `<span style="color:var(--text3);padding:0 4px;">...</span>`;
            } else if (i === totalPages - 1 && _usersCurrentPage < totalPages - 2) {
              btns += `<span style="color:var(--text3);padding:0 4px;">...</span>`;
            }
          } else {
            const active = i === _usersCurrentPage ? 'background:var(--gp);color:#fff;border-color:var(--gp);' : '';
            btns += `<button class="action-btn" style="width:28px;height:28px;padding:0;${active}" onclick="App.setUsersPage(${i})">${i}</button>`;
          }
        }
        btns += `<button class="action-btn" ${_usersCurrentPage >= totalPages ? 'disabled' : ''} onclick="App.setUsersPage(${_usersCurrentPage + 1})"><i class="ti ti-chevron-right"></i></button>`;
        pageEl.innerHTML = btns;
      }
    }
  }

  async function _loadAdminApps() {
    document.getElementById('apps-tbody').innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;"><div class="spinner" style="width:24px;height:24px;border-width:2px;margin:auto;"></div></td></tr>';
    const r = await apiGet('getAllApps', { token: _token });
    _allAdminApps = r.apps || [];
    
    const filterAppEl = document.getElementById('filter-user-app');
    if (filterAppEl) {
      filterAppEl.innerHTML = '<option value="ALL">Semua Aplikasi</option><option value="NO_APP">Tanpa Akses Aplikasi</option>' + _allAdminApps.map(a => `<option value="${a.appName}">${a.appName}</option>`).join('');
    }
    const tbody = document.getElementById('apps-tbody');
    if (!_allAdminApps.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:24px;">Belum ada aplikasi.</td></tr>';
      return;
    }
    tbody.innerHTML = _allAdminApps.map(a => `
      <tr>
        <td><strong><i class="ti ${a.appIcon||'ti-app'}" style="color:${a.color};vertical-align:-2px;margin-right:6px;"></i>${a.appName}</strong></td>
        <td><div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:11px;color:var(--text3);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${a.appUrl}</span>
          <i class="ti ti-copy" style="cursor:pointer;color:var(--gs);font-size:14px;" title="Salin URL" onclick="App.copyText('${a.appUrl}')"></i>
        </div></td>
        <td><span class="status-badge ${a.status==='ACTIVE'?'status-active':a.status==='MAINTENANCE'?'status-maintenance':'status-inactive'}">${a.status}</span></td>
        <td><div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:11px;font-family:monospace;">${a.appId}</span>
          <i class="ti ti-copy" style="cursor:pointer;color:var(--gs);font-size:14px;" title="Salin App ID" onclick="App.copyText('${a.appId}')"></i>
        </div></td>
        <td><div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:11px;font-family:monospace;color:var(--gs);">${a.secretKey || '—'}</span>
          ${a.secretKey ? `<i class="ti ti-copy" style="cursor:pointer;color:var(--gs);font-size:14px;" title="Salin Secret Key" onclick="App.copyText('${a.secretKey}')"></i>` : ''}
        </div></td>
        <td><div class="actions">
          <button class="action-btn" title="Edit" onclick="App.editApp('${a.appId}')"><i class="ti ti-edit"></i></button>
          ${_user.role === 'SUPER_ADMIN' ? `<button class="action-btn danger" title="Hapus" onclick="App.deleteApp('${a.appId}','${a.appName}')"><i class="ti ti-trash"></i></button>` : ''}
        </div></td>
      </tr>
    `).join('');
  }

  function filterAdminApps(q) { /* filter placeholder */ }

  async function _loadLogs() {
    document.getElementById('logs-tbody').innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;"><div class="spinner" style="width:24px;height:24px;border-width:2px;margin:auto;"></div></td></tr>';
    const r = await apiGet('getLogs', { token: _token, limit: '50' });
    const tbody = document.getElementById('logs-tbody');
    const logs  = r.logs || [];
    if (!logs.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:24px;">Belum ada log.</td></tr>';
      return;
    }
    tbody.innerHTML = logs.map(l => `
      <tr>
        <td style="font-size:11px;white-space:nowrap;">${formatDateID(l.timestamp)}</td>
        <td>${l.username || '—'}</td>
        <td style="font-weight:500;">${l.action}</td>
        <td style="font-size:11px;color:var(--text3);">${l.detail}</td>
        <td><span class="log-status-${l.status}" style="font-size:11px;font-weight:600;">${l.status}</span></td>
      </tr>
    `).join('');
  }

  // ── Admin tabs ─────────────────────────────────────────
  function adminTab(tab, btn) {
    document.getElementById('admin-users').style.display       = tab === 'users'      ? 'block' : 'none';
    document.getElementById('admin-apps-mgmt').style.display   = tab === 'apps-mgmt'  ? 'block' : 'none';
    document.getElementById('admin-logs').style.display        = tab === 'logs'        ? 'block' : 'none';
    document.getElementById('admin-ai-config').style.display   = tab === 'ai-config'   ? 'block' : 'none';
    document.getElementById('admin-online-users').style.display = tab === 'online-users'? 'block' : 'none';

    document.querySelectorAll('#admin-tabs button').forEach(b => { b.className = 'btn-secondary'; });
    if (btn) btn.className = 'btn-add';

    if (tab === 'ai-config' && !_aiConfigLoaded) loadAIConfig();
    if (tab === 'online-users' && !_onlineUsersLoaded) loadOnlineUsers();
  }

  let _onlineUsersLoaded = false;
  let _onlineUsersList = [];

  async function loadOnlineUsers() {
    const tbody = document.getElementById('tbody-online-users');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;"><div class="spinner" style="width:20px;height:20px;border-width:2px;margin:auto;"></div></td></tr>';
    const r = await apiPost({ action: 'getOnlineUsers', token: _token });
    _onlineUsersLoaded = true;
    if (!r.success) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--danger);padding:20px;">Gagal memuat: ${r.error}</td></tr>`;
      return;
    }
    _onlineUsersList = r.onlineUsers || [];
    _renderOnlineUsersTable();
  }

  function _renderOnlineUsersTable() {
    const tbody = document.getElementById('tbody-online-users');
    if (_onlineUsersList.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;font-size:13px;color:var(--text3);">Tidak ada pengguna aktif.</td></tr>';
      return;
    }
    tbody.innerHTML = _onlineUsersList.map(s => {
      const statusHtml = s.isIdle ? '<span class="status-badge status-maintenance">Idle</span>' : '<span class="status-badge status-active">Aktif</span>';
      return `
        <tr>
          <td>
            <div style="font-weight:600;font-size:13px;color:var(--text);">${s.fullName}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px;">${s.username}</div>
          </td>
          <td><span class="role-badge role-user" style="background:#f1f5f9;color:var(--text2);">${s.appName}</span></td>
          <td style="font-size:12px;color:var(--text2);">${formatDateID(s.lastActivity)}</td>
          <td>${statusHtml}</td>
        </tr>
      `;
    }).join('');
  }

  let _aiConfigLoaded = false;
  let _aiApiList = [];

  async function loadAIConfig() {
    const tbody = document.getElementById('ai-api-list-tbody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;"><div class="spinner" style="width:20px;height:20px;border-width:2px;margin:auto;"></div></td></tr>';
    const r = await apiPost({ action: 'getAIConfig', token: _token });
    _aiConfigLoaded = true;
    if (!r.success) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--danger);padding:20px;">Gagal memuat konfigurasi.</td></tr>';
      return;
    }
    _aiApiList = r.apiList || [];
    _renderAIConfigTable();
  }

  function _renderAIConfigTable() {
    const tbody = document.getElementById('ai-api-list-tbody');
    if (_aiApiList.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;font-size:13px;color:var(--text3);">Belum ada konfigurasi API AI.</td></tr>';
      return;
    }
    tbody.innerHTML = _aiApiList.map(api => {
      let allowedAppsDisplay = '<span style="color:var(--text3);font-style:italic;">Tidak ada (Ditolak)</span>';
      if (api.allowedApps) {
        const appsIds = api.allowedApps.split(',').map(a => a.trim());
        allowedAppsDisplay = appsIds.map(id => {
          const app = _allAdminApps.find(a => a.appId === id);
          return app ? `<span style="background:var(--bg);padding:2px 6px;border-radius:4px;display:inline-block;margin-bottom:2px;"><i class="ti ${app.appIcon || 'ti-app'}" style="color:${app.color}"></i> ${app.appName}</span>` : `<span style="background:var(--bg);padding:2px 6px;border-radius:4px;display:inline-block;margin-bottom:2px;">${id}</span>`;
        }).join(' ');
      }
      return `
      <tr>
        <td style="font-weight:600; color:var(--gs);">Gemini (Otomatis)</td>
        <td><span style="font-family:monospace;background:#f0f4f8;padding:4px 8px;border-radius:4px;">${api.apiKeyHint || 'Tidak ada hint'}</span></td>
        <td style="font-size:12px;line-height:1.6;">${allowedAppsDisplay}</td>
        <td style="text-align:right;"><div class="actions" style="justify-content:flex-end;">
          <button class="action-btn" title="Edit" onclick="App.editAIModal('${api.id}')"><i class="ti ti-edit"></i></button>
          <button class="action-btn danger" title="Hapus" onclick="App.deleteAIConfig('${api.id}')"><i class="ti ti-trash"></i></button>
        </div></td>
      </tr>`;
    }).join('');
  }

  function showAddAIModal() {
    document.getElementById('m-ai-title').textContent = 'Tambah Konfigurasi AI';
    document.getElementById('m-ai-id').value = '';
    document.getElementById('m-ai-apikey').value = '';
    document.querySelectorAll('.cb-ai-model').forEach(cb => { cb.checked = cb.value === 'gemini-3-flash-preview'; });
    _renderAIAppChecklist([]);
    document.getElementById('modal-ai-config').classList.remove('hidden');
  }

  function editAIModal(id) {
    const api = _aiApiList.find(a => a.id === id);
    if (!api) return;
    document.getElementById('m-ai-title').textContent = 'Edit Konfigurasi AI';
    document.getElementById('m-ai-id').value = api.id;
    document.getElementById('m-ai-apikey').value = api.apiKey || '';
    const modelsArr = (api.models || '').split(',').map(m => m.trim());
    document.querySelectorAll('.cb-ai-model').forEach(cb => { cb.checked = modelsArr.includes(cb.value); });
    const allowedApps = (api.allowedApps || '').split(',').map(a => a.trim()).filter(a => a);
    _renderAIAppChecklist(allowedApps);
    document.getElementById('modal-ai-config').classList.remove('hidden');
  }
  
  function _renderAIAppChecklist(selectedApps) {
    const listEl = document.getElementById('m-ai-apps-list');
    if (_allAdminApps.length === 0) {
      listEl.innerHTML = '<div style="color:var(--text3);font-size:12px;">Belum ada aplikasi yang terdaftar.</div>';
      return;
    }
    listEl.innerHTML = _allAdminApps.map(app => {
      const checked = selectedApps.includes(app.appId) ? 'checked' : '';
      return `<label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;margin-bottom:6px;">
          <input type="checkbox" class="cb-ai-app" value="${app.appId}" ${checked} />
          <i class="ti ${app.appIcon || 'ti-app'}" style="color:${app.color}"></i>
          <span>${app.appName}</span>
        </label>`;
    }).join('');
  }

  async function saveAIModal() {
    const id = document.getElementById('m-ai-id').value;
    const apiKey = document.getElementById('m-ai-apikey').value.trim();
    const models = Array.from(document.querySelectorAll('.cb-ai-model:checked')).map(cb => cb.value).join(',');
    const allowedApps = Array.from(document.querySelectorAll('.cb-ai-app:checked')).map(cb => cb.value).join(',');

    if (!id && !apiKey) { toast('API Key wajib diisi untuk entri baru.', 'error'); return; }

    let newList = JSON.parse(JSON.stringify(_aiApiList));
    if (id) {
      const idx = newList.findIndex(a => a.id === id);
      if (idx !== -1) {
        if (apiKey) newList[idx].apiKey = apiKey;
        newList[idx].models = models;
        newList[idx].allowedApps = allowedApps;
      }
    } else {
      newList.push({ id: 'ai_' + new Date().getTime(), apiKey, models, allowedApps, maxTokens: 2048 });
    }

    const r = await apiPost({ action: 'saveAIConfigList', token: _token, apiList: newList });
    if (r.success) { toast('Konfigurasi AI berhasil disimpan!', 'success'); closeModal('modal-ai-config'); await loadAIConfig(); }
    else toast(r.error || 'Gagal menyimpan konfigurasi AI.', 'error');
  }

  async function deleteAIConfig(id) {
    const ok = await showConfirm('Hapus Konfigurasi AI', 'Yakin ingin menghapus konfigurasi API Key ini?', true);
    if (!ok) return;
    const r = await apiPost({ action: 'saveAIConfigList', token: _token, apiList: _aiApiList.filter(a => a.id !== id) });
    if (r.success) { toast('Konfigurasi berhasil dihapus.', 'success'); await loadAIConfig(); }
    else toast(r.error || 'Gagal menghapus.', 'error');
  }

  // ── Modals ─────────────────────────────────────────────
  function showCreateUserModal() {
    ['m-fullname','m-username','m-email','m-whatsapp','m-password'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('m-role').value = 'USER';
    document.getElementById('modal-create-user').classList.remove('hidden');
  }

  // ── Import Massal ──────────────────────────────────────
  let _importRows = [];

  function showImportModal() {
    _importRows = [];
    document.getElementById('import-result-box').style.display = 'none';
    document.getElementById('import-preview-stats').style.display = 'none';
    document.getElementById('inp-import-csv').value = '';
    _renderImportTable([{}, {}, {}]);
    document.getElementById('modal-import-users').classList.remove('hidden');
  }

  function _importRowHtml(idx, data) {
    const roles = ['USER','ADMIN','SUPER_ADMIN'];
    const rowBg = idx % 2 === 0 ? '#fff' : '#f8fafc';
    return `<tr style="background:${rowBg};" id="import-row-${idx}">
      <td style="padding:6px 10px;text-align:center;color:var(--text3);font-size:12px;">${idx+1}</td>
      <td style="padding:4px 6px;"><input class="form-input" type="text" placeholder="Nama Lengkap" value="${data.fullName||''}" oninput="App.updateImportCell(${idx},'fullName',this.value)" style="padding:6px 10px;font-size:12px;"/></td>
      <td style="padding:4px 6px;"><input class="form-input" type="text" placeholder="username" value="${data.username||''}" oninput="App.updateImportCell(${idx},'username',this.value)" style="padding:6px 10px;font-size:12px;"/></td>
      <td style="padding:4px 6px;"><input class="form-input" type="email" placeholder="email@..." value="${data.email||''}" oninput="App.updateImportCell(${idx},'email',this.value)" style="padding:6px 10px;font-size:12px;"/></td>
      <td style="padding:4px 6px;"><input class="form-input" type="text" placeholder="08xx..." value="${data.whatsapp||''}" oninput="App.updateImportCell(${idx},'whatsapp',this.value)" style="padding:6px 10px;font-size:12px;"/></td>
      <td style="padding:4px 6px;"><input class="form-input" type="text" placeholder="(def: user+12345)" value="${data.password||''}" oninput="App.updateImportCell(${idx},'password',this.value)" style="padding:6px 10px;font-size:12px;"/></td>
      <td style="padding:4px 6px;">
        <select class="form-input" style="padding:6px 10px;font-size:12px;" onchange="App.updateImportCell(${idx},'instansi',this.value)">
          <option value="" ${(data.instansi||'')===''?'selected':''}>-- Pilih --</option>
          <option value="BPMP" ${(data.instansi||'')==='BPMP'?'selected':''}>BPMP</option>
          <option value="Dinas Pendidikan" ${(data.instansi||'')==='Dinas Pendidikan'?'selected':''}>Dinas Pendidikan</option>
          <option value="Pengawas Sekolah" ${(data.instansi||'')==='Pengawas Sekolah'?'selected':''}>Pengawas Sekolah</option>
          <option value="Satuan Pendidikan" ${(data.instansi||'')==='Satuan Pendidikan'?'selected':''}>Satuan Pendidikan</option>
        </select>
      </td>
      <td style="padding:4px 6px;">
        <select class="form-input" style="padding:6px 10px;font-size:12px;" onchange="App.updateImportCell(${idx},'role',this.value)">
          ${roles.map(r => `<option value="${r}" ${(data.role||'USER')===r?'selected':''}>${r}</option>`).join('')}
        </select>
      </td>
      <td style="padding:4px 10px;text-align:center;">
        <button onclick="App.removeImportRow(${idx})" style="background:none;border:none;cursor:pointer;color:var(--danger);font-size:18px;" title="Hapus baris"><i class="ti ti-x"></i></button>
      </td>
    </tr>`;
  }

  function _renderImportTable(rows) {
    _importRows = rows.map(r => Object.assign({}, r));
    document.getElementById('import-users-tbody').innerHTML = _importRows.map((r, i) => _importRowHtml(i, r)).join('');
    _updateImportStats();
  }

  function _updateImportStats() {
    const filled = _importRows.filter(r => (r.fullName||'').trim() && (r.username||'').trim()).length;
    const statsEl = document.getElementById('import-preview-stats');
    const statsText = document.getElementById('import-stats-text');
    if (_importRows.length > 0) {
      statsEl.style.display = 'block';
      statsText.textContent = `${_importRows.length} baris total | ${filled} baris valid (Nama & Username terisi)`;
    } else {
      statsEl.style.display = 'none';
    }
  }

  function updateImportCell(idx, field, value) {
    if (_importRows[idx]) _importRows[idx][field] = value;
    _updateImportStats();
  }

  function addImportRow() {
    _importRows.push({});
    const tbody = document.getElementById('import-users-tbody');
    tbody.insertAdjacentHTML('beforeend', _importRowHtml(_importRows.length - 1, {}));
    _updateImportStats();
    tbody.parentElement.scrollTop = tbody.parentElement.scrollHeight;
  }

  function removeImportRow(idx) {
    _importRows.splice(idx, 1);
    _renderImportTable(_importRows);
  }

  function handleImportCSV(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      const text = e.target.result;
      const lines = text.split('\n').map(l => l.trim()).filter(l => l);
      if (lines.length < 2) { toast('File CSV kosong atau hanya berisi header.', 'error'); return; }
      const sep = lines[0].includes(';') ? ';' : ',';
      const headers = lines[0].split(sep).map(h => h.replace(/"/g,'').trim().toLowerCase());
      const rows = lines.slice(1).map(line => {
        const cols = line.split(sep).map(c => c.replace(/^"|"$/g,'').trim());
        const obj = {};
        headers.forEach((h, i) => { obj[h] = cols[i] || ''; });
        return {
          fullName : obj['nama lengkap'] || obj['fullname'] || obj['nama'] || '',
          username : obj['username'] || obj['npsn'] || '',
          email    : obj['email'] || '',
          whatsapp : obj['no hp'] || obj['whatsapp'] || obj['hp'] || obj['wa'] || '',
          password : obj['password'] || '',
          instansi : obj['instansi'] || '',
          role     : (obj['role'] || 'USER').toUpperCase(),
        };
      });
      if (rows.length > 500) { toast('Maksimal 500 baris per import.', 'error'); return; }
      _renderImportTable(rows);
      toast(`${rows.length} baris berhasil dimuat dari CSV.`, 'success');
    };
    reader.readAsText(file);
  }

  function downloadImportTemplate() {
    const header = 'Nama Lengkap,Username,Email,No HP,Password,Instansi,Role';
    const contoh = ['SDN 001 Palangka Raya,1023456789,,,,Satuan Pendidikan,USER','SDN 002 Palangka Raya,1023456790,,,,Satuan Pendidikan,USER','SMPN 1 Palangka Raya,1023456791,,,,Satuan Pendidikan,USER'].join('\n');
    const blob = new Blob([header + '\n' + contoh], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'template_import_pengguna.csv';
    a.click();
  }

  async function doImportUsers() {
    const valid = _importRows.filter(r => (r.fullName||'').trim() && (r.username||'').trim());
    if (valid.length === 0) { toast('Tidak ada data valid untuk diimpor.', 'error'); return; }

    const btn = document.getElementById('btn-do-import');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px;"></div> Memproses...';

    const resultBox = document.getElementById('import-result-box');
    resultBox.style.display = 'none';

    const r = await apiPost({ action: 'bulkCreateUsers', token: _token, usersData: valid });

    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-upload"></i> Proses Import';

    if (!r.success && !r.successCount) { toast(r.error || 'Gagal melakukan import.', 'error'); return; }

    const isFullSuccess = r.failCount === 0;
    resultBox.style.display = 'block';
    resultBox.style.background = isFullSuccess ? '#dcfce7' : (r.successCount > 0 ? '#fef3c7' : '#fee2e2');
    resultBox.style.borderLeft = `4px solid ${isFullSuccess ? '#22c55e' : (r.successCount > 0 ? '#f59e0b' : '#ef4444')}`;
    let html = `<strong>${r.message}</strong>`;
    if (r.errors && r.errors.length > 0) {
      html += '<ul style="margin:8px 0 0 16px;">' + r.errors.map(e => `<li>${e}</li>`).join('') + '</ul>';
    }
    resultBox.innerHTML = html;

    if (r.successCount > 0) { toast(`${r.successCount} pengguna berhasil diimpor!`, 'success'); await _loadUsers(); }
  }

  function showRegisterAppModal() {
    ['ra-name','ra-url','ra-desc','ra-icon'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('ra-color').value = '#1E90FF';
    document.getElementById('modal-register-app').classList.remove('hidden');
  }
  function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

  // ── CRUD Operations ────────────────────────────────────
  async function createUser() {
    const data = {
      action: 'createUser', token: _token,
      fullName: document.getElementById('m-fullname').value.trim(),
      username: document.getElementById('m-username').value.trim(),
      email: document.getElementById('m-email').value.trim(),
      whatsapp: document.getElementById('m-whatsapp').value.trim(),
      password: document.getElementById('m-password').value,
      role: document.getElementById('m-role').value,
      instansi: document.getElementById('m-instansi').value,
    };
    const r = await apiPost(data);
    if (r.success) { closeModal('modal-create-user'); toast('Pengguna berhasil dibuat.', 'success'); await _loadUsers(); }
    else toast(r.error || 'Gagal membuat pengguna.', 'error');
  }

  async function registerApp() {
    const data = {
      action: 'registerApp', token: _token,
      appName: document.getElementById('ra-name').value.trim(),
      appUrl: document.getElementById('ra-url').value.trim(),
      description: document.getElementById('ra-desc').value.trim(),
      appIcon: document.getElementById('ra-icon').value.trim() || 'ti-apps',
      color: document.getElementById('ra-color').value,
    };
    const r = await apiPost(data);
    if (r.success) { closeModal('modal-register-app'); toast('Aplikasi berhasil didaftarkan. Secret Key: ' + r.app.secretKey, 'success'); _apps = []; await _loadPostLogin(); await _loadAdminApps(); }
    else toast(r.error || 'Gagal mendaftarkan aplikasi.', 'error');
  }

  function handleProfilePhotoUpload(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast('Ukuran foto maksimal 2MB.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = async function() {
        const canvas = document.createElement('canvas');
        const maxSize = 250;
        let width = img.width, height = img.height;
        if (width > height) { if (width > maxSize) { height = Math.round((height * maxSize) / width); width = maxSize; } }
        else { if (height > maxSize) { width = Math.round((width * maxSize) / height); height = maxSize; } }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, width, height);
        const base64Photo = canvas.toDataURL('image/jpeg', 0.8);
        const r = await apiPost({ action: 'updateUser', token: _token, targetUserId: _user.userId, photo: base64Photo });
        if (r.success) { _user.photo = base64Photo; _renderSidebar(); _renderProfileView(); toast('Foto profil berhasil diperbarui.', 'success'); }
        else toast(r.error || 'Gagal menyimpan foto.', 'error');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    input.value = '';
  }

  function showEditProfileModal() {
    document.getElementById('ep-email').value = _user.email || '';
    document.getElementById('ep-whatsapp').value = _user.whatsapp || '';
    document.getElementById('modal-edit-profile').classList.remove('hidden');
  }

  async function saveEditProfile() {
    const data = { action: 'updateUser', token: _token, targetUserId: _user.userId, email: document.getElementById('ep-email').value.trim(), whatsapp: document.getElementById('ep-whatsapp').value.trim() };
    const r = await apiPost(data);
    if (r.success) { toast('Profil berhasil diperbarui.', 'success'); closeModal('modal-edit-profile'); _user.email = data.email; _user.whatsapp = data.whatsapp; _renderProfileView(); }
    else toast(r.error || 'Gagal menyimpan profil.', 'error');
  }

  async function changePassword() {
    const oldPass = document.getElementById('inp-old-pass').value;
    const newPass = document.getElementById('inp-new-pass').value;
    const confirmPass = document.getElementById('inp-confirm-pass').value;
    if (newPass !== confirmPass) { toast('Konfirmasi password tidak cocok.', 'error'); return; }
    if (newPass.length < 8) { toast('Password baru minimal 8 karakter.', 'error'); return; }
    const r = await apiPost({ action: 'changePassword', token: _token, oldPassword: oldPass, newPassword: newPass });
    if (r.success) { toast('Password berhasil diubah. Silakan login ulang.', 'success'); setTimeout(() => forceLogout('Sesi diakhiri karena password diubah.'), 2000); }
    else toast(r.error || 'Gagal mengganti password.', 'error');
  }

  async function deleteUser(userId, username) {
    const ok = await showConfirm('Hapus Pengguna', `Hapus pengguna "${username}"? Tindakan ini tidak dapat dibatalkan.`, true);
    if (!ok) return;
    const r = await apiPost({ action: 'deleteUser', token: _token, targetUserId: userId });
    if (r.success) { toast('Pengguna dihapus.', 'success'); await _loadUsers(); }
    else toast(r.error || 'Gagal menghapus pengguna.', 'error');
  }

  async function resetUserPassword(userId, username) {
    const ok = await showConfirm('Reset Password', `Reset password untuk "${username}"? Password baru: ${username}12345`, false);
    if (!ok) return;
    const r = await apiPost({ action: 'resetPassword', token: _token, targetUserId: userId, newPassword: username + '12345' });
    if (r.success) { toast('Password berhasil direset menjadi ' + username + '12345', 'success'); await _loadUsers(); }
    else toast(r.error || 'Gagal reset password.', 'error');
  }

  // ── Bulk Actions ───────────────────────────────────────
  function toggleAllUsers(checked) {
    document.querySelectorAll('.cb-user:not(:disabled)').forEach(cb => cb.checked = checked);
    updateBulkActions();
  }

  function updateBulkActions() {
    const checked = document.querySelectorAll('.cb-user:checked');
    const bulkDiv = document.getElementById('bulk-actions');
    const countEl = document.getElementById('bulk-count');
    if (checked.length > 0) { countEl.innerText = checked.length; bulkDiv.style.display = 'flex'; }
    else { bulkDiv.style.display = 'none'; document.getElementById('cb-all-users').checked = false; }
  }

  async function bulkResetPassword() {
    const checked = document.querySelectorAll('.cb-user:checked');
    if (checked.length === 0) return;
    const userIds = Array.from(checked).map(cb => cb.value);
    const usernames = Array.from(checked).map(cb => cb.getAttribute('data-username'));
    const ok = await showConfirm('Reset Sandi Massal', `Reset sandi untuk ${checked.length} pengguna terpilih?<br><br><span style="font-size:12px;color:var(--text3);">${usernames.slice(0, 5).join(', ')}${usernames.length > 5 ? ` dan ${usernames.length - 5} lainnya` : ''}</span><br><br>Sandi baru: [username]12345`, false);
    if (!ok) return;
    const r = await apiPost({ action: 'bulkResetPassword', token: _token, userIds });
    if (r.success) { toast(r.message || 'Sandi berhasil direset.', 'success'); await _loadUsers(); }
    else toast(r.error || 'Gagal mereset sandi massal.', 'error');
  }

  async function bulkDeleteUser() {
    const checked = document.querySelectorAll('.cb-user:checked');
    if (checked.length === 0) return;
    const userIds = Array.from(checked).map(cb => cb.value);
    const usernames = Array.from(checked).map(cb => cb.getAttribute('data-username'));
    const ok = await showConfirm('Hapus Pengguna Massal', `Hapus ${checked.length} pengguna secara permanen?<br><br><span style="font-size:12px;color:var(--text3);">${usernames.slice(0, 5).join(', ')}${usernames.length > 5 ? ` dan ${usernames.length - 5} lainnya` : ''}</span><br><br>Tindakan ini tidak dapat dibatalkan.`, true);
    if (!ok) return;
    const r = await apiPost({ action: 'bulkDeleteUser', token: _token, userIds });
    if (r.success) { toast(r.message || 'Pengguna berhasil dihapus.', 'success'); await _loadUsers(); }
    else toast(r.error || 'Gagal menghapus massal.', 'error');
  }

  async function bulkEditAccess() {
    const checked = document.querySelectorAll('.cb-user:checked');
    if (checked.length === 0) return;
    const usernames = Array.from(checked).map(cb => cb.getAttribute('data-username'));
    const descEl = document.getElementById('bulk-access-desc');
    if (descEl) descEl.textContent = `${checked.length} pengguna terpilih: ${usernames.slice(0,3).join(', ')}${usernames.length > 3 ? ` dan ${usernames.length - 3} lainnya` : ''}`;
    const modeReplace = document.getElementById('ba-mode-replace');
    if (modeReplace) modeReplace.checked = true;
    const appListEl = document.getElementById('bulk-access-apps-list');
    if (!appListEl) return;
    if (!_allAdminApps.length) {
      appListEl.innerHTML = '<div style="color:var(--text3);font-size:12px;">Belum ada aplikasi yang terdaftar.</div>';
    } else {
      appListEl.innerHTML = _allAdminApps.map(app => `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding:6px 8px;border-radius:6px;background:#fff;border:1px solid var(--border);">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;flex:1;">
            <input type="checkbox" class="cb-bulk-app" value="${app.appId}" data-appname="${app.appName}"
              onchange="document.getElementById('bulk-app-role-${app.appId}').disabled = !this.checked;" />
            <i class="ti ${app.appIcon || 'ti-app'}" style="color:${app.color};"></i>
            <span>${app.appName}</span>
          </label>
          <select id="bulk-app-role-${app.appId}" class="form-input" style="width:100px;padding:4px 8px;font-size:12px;" disabled>
            <option value="user">User</option><option value="admin">Admin</option><option value="viewer">Viewer</option>
          </select>
        </div>
      `).join('');
    }
    document.getElementById('modal-bulk-access').classList.remove('hidden');
  }

  async function saveBulkEditAccess() {
    const checkedUsers = document.querySelectorAll('.cb-user:checked');
    const checkedApps  = document.querySelectorAll('.cb-bulk-app:checked');
    if (checkedUsers.length === 0) { toast('Tidak ada pengguna terpilih.', 'error'); return; }
    const userIds = Array.from(checkedUsers).map(cb => cb.value);
    const appAccesses = Array.from(checkedApps).map(cb => {
      const roleEl = document.getElementById('bulk-app-role-' + cb.value);
      return { appId: cb.value, appRole: roleEl ? roleEl.value : 'user' };
    });
    const mode = document.querySelector('input[name="bulk-access-mode"]:checked');
    const replaceMode = mode ? mode.value === 'replace' : true;
    const ok = await showConfirm('Konfirmasi Edit Akses Massal', `Menerapkan akses ${checkedApps.length} aplikasi ke ${checkedUsers.length} pengguna?<br><br><span style="font-size:12px;color:var(--text3);">Mode: ${replaceMode ? 'Ganti Semua' : 'Tambah Saja'}</span>`, false);
    if (!ok) return;
    const r = await apiPost({ action: 'bulkUpdateUserAccess', token: _token, userIds, appAccesses, replace: replaceMode });
    if (r.success) { toast(r.message || `Akses berhasil diperbarui.`, 'success'); closeModal('modal-bulk-access'); await _loadUsers(); }
    else toast(r.error || 'Gagal memperbarui akses massal.', 'error');
  }

  async function editUser(userId) {
    const user = _allUsers.find(u => u.userId === userId);
    if (!user) return toast('User tidak ditemukan', 'error');
    document.getElementById('e-userid').value = user.userId;
    document.getElementById('e-fullname').value = user.fullName;
    document.getElementById('e-email').value = user.email;
    document.getElementById('e-whatsapp').value = user.whatsapp || '';
    document.getElementById('e-instansi').value = user.instansi || '';
    document.getElementById('e-role').value = user.role;
    document.getElementById('e-status').value = user.status;
    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    document.getElementById('e-status-wrapper').style.display = isSuperAdmin ? 'none' : 'flex';
    document.getElementById('e-apps-wrapper').style.display = isSuperAdmin ? 'none' : 'block';
    const appListEl = document.getElementById('e-apps-list');
    appListEl.innerHTML = '<div class="spinner" style="width:20px;height:20px;border-width:2px;margin:auto;"></div>';
    document.getElementById('modal-edit-user').classList.remove('hidden');
    const r = await apiGet('getUserAccess', { token: _token, targetUserId: userId });
    let userAccessMap = {};
    if (r.success) { r.accesses.forEach(a => { userAccessMap[a.appId] = a.appRole || 'user'; }); }
    if (_allAdminApps.length === 0) {
      appListEl.innerHTML = '<div style="color:var(--text3);font-size:12px;">Belum ada aplikasi.</div>';
    } else {
      appListEl.innerHTML = _allAdminApps.map(app => `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
            <input type="checkbox" class="cb-app-access" value="${app.appId}" ${userAccessMap[app.appId] ? 'checked' : ''} onchange="document.getElementById('app-role-${app.appId}').disabled = !this.checked;" />
            <i class="ti ${app.appIcon || 'ti-app'}" style="color:${app.color}"></i> ${app.appName}
          </label>
          <select id="app-role-${app.appId}" class="form-input" style="width:100px;padding:4px 8px;font-size:12px;" ${userAccessMap[app.appId] ? '' : 'disabled'}>
            <option value="user" ${userAccessMap[app.appId] === 'user' ? 'selected' : ''}>User</option>
            <option value="admin" ${userAccessMap[app.appId] === 'admin' ? 'selected' : ''}>Admin</option>
            <option value="viewer" ${userAccessMap[app.appId] === 'viewer' ? 'selected' : ''}>Viewer</option>
          </select>
        </div>
      `).join('');
    }
  }

  async function saveEditUser() {
    const userId = document.getElementById('e-userid').value;
    const data = { action: 'updateUser', token: _token, targetUserId: userId, fullName: document.getElementById('e-fullname').value.trim(), email: document.getElementById('e-email').value.trim(), whatsapp: document.getElementById('e-whatsapp').value.trim(), role: document.getElementById('e-role').value, instansi: document.getElementById('e-instansi').value, status: document.getElementById('e-status').value };
    const appAccesses = Array.from(document.querySelectorAll('.cb-app-access:checked')).map(cb => {
      const select = document.getElementById('app-role-' + cb.value);
      return { appId: cb.value, appRole: select ? select.value : 'user' };
    });
    const r = await apiPost(data);
    if (r.success) {
      await apiPost({ action: 'updateUserAccess', token: _token, targetUserId: userId, appAccesses });
      toast('Perubahan berhasil disimpan.', 'success'); closeModal('modal-edit-user'); await _loadUsers();
    } else toast(r.error || 'Gagal menyimpan.', 'error');
  }

  function editApp(appId) {
    const app = _allAdminApps.find(a => a.appId === appId);
    if (!app) return toast('Aplikasi tidak ditemukan', 'error');
    document.getElementById('ea-appid').value = app.appId;
    document.getElementById('ea-name').value = app.appName;
    document.getElementById('ea-url').value = app.appUrl;
    document.getElementById('ea-desc').value = app.description || '';
    document.getElementById('ea-icon').value = app.appIcon || 'ti-apps';
    document.getElementById('ea-color').value = app.color || '#1E90FF';
    document.getElementById('ea-status').value = app.status || 'ACTIVE';
    document.getElementById('modal-edit-app').classList.remove('hidden');
  }

  async function saveEditApp() {
    const data = { action: 'updateApp', token: _token, appId: document.getElementById('ea-appid').value, appName: document.getElementById('ea-name').value.trim(), appUrl: document.getElementById('ea-url').value.trim(), description: document.getElementById('ea-desc').value.trim(), appIcon: document.getElementById('ea-icon').value.trim() || 'ti-apps', color: document.getElementById('ea-color').value, status: document.getElementById('ea-status').value };
    const r = await apiPost(data);
    if (r.success) { toast('Perubahan aplikasi berhasil disimpan.', 'success'); closeModal('modal-edit-app'); _apps = []; await _loadPostLogin(); await _loadAdminApps(); }
    else toast(r.error || 'Gagal menyimpan aplikasi.', 'error');
  }

  async function deleteApp(appId, appName) {
    const ok = await showConfirm('Hapus Aplikasi', `Hapus aplikasi "${appName}" secara permanen?`, true);
    if (!ok) return;
    const r = await apiPost({ action: 'deleteApp', token: _token, appId });
    if (r.success) { toast('Aplikasi berhasil dihapus.', 'success'); _apps = []; await _loadPostLogin(); await _loadAdminApps(); }
    else toast(r.error || 'Gagal menghapus aplikasi.', 'error');
  }

  function showForgotPassword() { toast('Hubungi administrator untuk reset password.', 'info'); }
  function refresh() { _loadPostLogin(); toast('Data diperbarui.', 'info'); }

  // ══════════════════════════════════════════════════════
  // UI HELPERS
  // ══════════════════════════════════════════════════════

  function formatDateID(isoStr) {
    if (!isoStr || isoStr === '-') return '—';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      return new Intl.DateTimeFormat('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }).format(d).replace(/\./g, ':');
    } catch(e) { return isoStr; }
  }

  function showApp() {
    hideLoading();
    try { localStorage.setItem('gaspol_sess_state', JSON.stringify({ state: 'alive', ts: Date.now() })); } catch(e) {}
    document.getElementById('page-login').classList.add('hidden');
    document.getElementById('page-app').classList.remove('hidden');
  }

  function hideLoading() { document.getElementById('loading').style.display = 'none'; }

  function showConfirm(title, message, isDanger, okText, hideCancel) {
    return new Promise((resolve) => {
      document.getElementById('confirm-title').textContent = title;
      document.getElementById('confirm-msg').innerHTML = message;
      const btnOk = document.getElementById('btn-confirm-ok');
      const btnCancel = document.getElementById('btn-confirm-cancel');
      const iconWrap = document.getElementById('confirm-icon');
      btnOk.textContent = okText || 'Ya, Lanjutkan';
      btnCancel.style.display = hideCancel ? 'none' : 'inline-block';
      if (isDanger) { btnOk.style.background = 'var(--danger)'; iconWrap.style.color = 'var(--danger)'; iconWrap.innerHTML = '<i class="ti ti-alert-triangle"></i>'; }
      else { btnOk.style.background = 'var(--gp)'; iconWrap.style.color = 'var(--gs)'; iconWrap.innerHTML = '<i class="ti ti-info-circle"></i>'; }
      const modal = document.getElementById('modal-confirm');
      modal.classList.remove('hidden');
      const onCancel = () => { modal.classList.add('hidden'); cleanup(); resolve(false); };
      const onOk = () => { modal.classList.add('hidden'); cleanup(); resolve(true); };
      const cleanup = () => { btnCancel.removeEventListener('click', onCancel); btnOk.removeEventListener('click', onOk); };
      btnCancel.addEventListener('click', onCancel);
      btnOk.addEventListener('click', onOk);
    });
  }

  function setTopbarDate() {
    const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('topbar-date').textContent = new Date().toLocaleDateString('id-ID', opts);
  }

  // ══════════════════════════════════════════════════════
  // API LAYER — KONVERSI UTAMA: google.script.run → fetch()
  // ══════════════════════════════════════════════════════

  let _asyncLoaderCount = 0;
  function showAsyncLoader() {
    _asyncLoaderCount++;
    document.getElementById('global-async-loader').classList.remove('hidden');
  }
  function hideAsyncLoader() {
    _asyncLoaderCount--;
    if (_asyncLoaderCount <= 0) { _asyncLoaderCount = 0; document.getElementById('global-async-loader').classList.add('hidden'); }
  }

  /**
   * apiPost — Menggantikan google.script.run.processServerAction()
   * Mengirim data ke /api/portal/action via fetch()
   * Response format identik: { success, error, ...data }
   */
  async function apiPost(data, showLoader = true) {
    if (showLoader) showAsyncLoader();
    try {
      const resp = await fetch(API_BASE + '/api/portal/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(data.token ? { 'Authorization': 'Bearer ' + data.token } : {}),
        },
        body: JSON.stringify(data),
      });

      if (showLoader) hideAsyncLoader();

      const parsed = await resp.json();

      // Auto-logout jika session expired
      if (!parsed.success && parsed.error) {
        const errLower = String(parsed.error).toLowerCase();
        const isAuthError = errLower.includes('tidak terautentikasi') || errLower.includes('kedaluwarsa') || errLower.includes('token sudah tidak valid') || errLower.includes('token tidak valid') || errLower.includes('tidak aktif');
        if (isAuthError) {
          forceLogout('Sesi Anda telah berakhir.');
          return { success: false, error: parsed.error, _logoutTriggered: true };
        }
      }

      return parsed;
    } catch(err) {
      if (showLoader) hideAsyncLoader();
      return { success: false, error: 'Koneksi gagal: ' + err.message };
    }
  }

  function apiGet(action, params, showLoader = false) {
    return apiPost({ action, ...params }, showLoader);
  }

  // ── Open child app dengan SSO token ───────────────────
  function openApp(appUrl, appId) {
    if (!appUrl || appUrl.includes('GANTI_DEPLOYMENT')) {
      toast('URL aplikasi belum dikonfigurasi.', 'error');
      return;
    }
    // Set cookie untuk single sign-on cross-app di origin yang sama
    document.cookie = "gaspol_token=" + _token + "; path=/; max-age=86400; secure; samesite=strict";
    
    // Buka app tanpa parameter di URL
    window.open(appUrl, '_blank');
  }

  function togglePassword(inputId, iconEl) {
    const inp = document.getElementById(inputId);
    if (inp.type === 'password') { inp.type = 'text'; iconEl.classList.remove('ti-eye'); iconEl.classList.add('ti-eye-off'); }
    else { inp.type = 'password'; iconEl.classList.remove('ti-eye-off'); iconEl.classList.add('ti-eye'); }
  }

  function toast(msg, type) {
    const icons = { success: 'ti-check', error: 'ti-alert-circle', info: 'ti-info-circle' };
    const el = document.createElement('div');
    el.className = 'toast toast-' + (type || 'info');
    el.innerHTML = '<i class="ti ' + (icons[type] || 'ti-info-circle') + '"></i> ' + msg;
    document.getElementById('toast-wrap').appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  function copyText(text) {
    navigator.clipboard.writeText(text)
      .then(() => toast('Berhasil disalin!', 'success'))
      .catch(() => toast('Gagal menyalin.', 'error'));
  }

  // ── Enter key → slider hint ────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !document.getElementById('page-login').classList.contains('hidden')) {
      const errEl = document.getElementById('err-login');
      if(errEl) { errEl.textContent = 'Gunakan bilah geser (slider) untuk masuk.'; errEl.style.display = 'block'; }
    }
  });

  // Public API
  return {
    toggleSidebar, init, login, logout, loginWithGoogle, showView, showForgotPassword,
    adminTab, filterAdminApps,
    setUsersSearch, setUsersRoleFilter, setUsersAppFilter, setUsersPerPage, setUsersPage, resetUsersFilter, toggleMultiSelect, handleMultiSelectChange,
    showCreateUserModal, showRegisterAppModal, closeModal,
    createUser, registerApp, changePassword, editUser, saveEditUser,
    deleteUser, resetUserPassword, refresh, togglePassword,
    toggleAllUsers, updateBulkActions, bulkResetPassword, bulkDeleteUser,
    bulkEditAccess, saveBulkEditAccess,
    editApp, saveEditApp, deleteApp, copyText, openApp,
    loadAIConfig, showAddAIModal, editAIModal, saveAIModal, deleteAIConfig,
    loadOnlineUsers,
    showEditProfileModal, saveEditProfile, handleProfilePhotoUpload,
    showImportModal, handleImportCSV, downloadImportTemplate, addImportRow, removeImportRow, updateImportCell, doImportUsers
  };
})();

// ── Fungsi global untuk child app ───────────────────────
function openApp(url, appId) { App.openApp && App.openApp(url, appId); }

window.App = App; // EXPOSE KE GLOBAL UNTUK INLINE ONCLICK
window.addEventListener('load', App.init);
