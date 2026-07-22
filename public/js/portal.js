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
    setTopbarDate();
    const p = URL_PARAMS;

    // Tambahkan listener untuk Cross-Tab Single Sign-Out (SLO)
    window.addEventListener('storage', (e) => {
      if (e.key === 'gaspol_token' && e.oldValue && !e.newValue) {
        // Token dihapus dari tab lain (Logout / Timeout)
        forceLogout('Sesi Anda diakhiri dari tab lain.');
      }
    });

    if (p.error) {
      const errEl = document.getElementById('err-login');
      if (errEl) { errEl.textContent = decodeURIComponent(p.error); errEl.style.display = 'block'; }
    }

    // Cek token tersimpan di localStorage
    const saved = localStorage.getItem('gaspol_token');
    if (saved) {
      _token = saved;
      try {
        const r = await apiPost({ action: 'validateToken', token: _token });
        if (r.valid) {
          _user = r.user; _apps = r.apps;
          await _loadPostLogin();
          _startHeartbeat(); // Mulai heartbeat
          return;
        }
      } catch (e) { console.error('Validate err:', e); }
      // Token tidak valid -> buang
      localStorage.removeItem('gaspol_token');
      _token = '';
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

    _user = r.user;
    _apps = r.apps || [];
    _token = r.token;
    localStorage.setItem('gaspol_token', _token);
    
    // Paksa update event untuk tab lain agar refresh sesi jika sebelumnya error
    localStorage.setItem('gaspol_sess_state', JSON.stringify({ state: 'login', ts: Date.now() }));

    // Cek ganti password default
    if (_user.isDefaultPassword) {
      showView('view-profile', document.getElementById('nav-profile'));
      setTimeout(showEditProfileModal, 500);
    }

    // Jika ada redirect (dari child app), kembalikan ke sana
    if (redirect && appId) {
      const targetUrl = redirect.split('?')[0] + '?token=' + _token + '&appId=' + appId;
      window.location.replace(targetUrl);
      return;
    }

    await _loadPostLogin();
    _startHeartbeat(); // Mulai heartbeat
    showApp();
    resetSlider();
    toast('Selamat datang, ' + _user.fullName + '!', 'success');
  }

  function loginWithGoogle() {
    toast('Login Google Workspace dalam pengembangan.', 'info');
  }

  // ── LOGOUT ─────────────────────────────────────────────
  async function logout() {
    if (!_token) return;
    try { await apiPost({ action: 'logout', token: _token }); } catch(e) {}
    localStorage.removeItem('gaspol_token');
    localStorage.setItem('gaspol_sess_state', JSON.stringify({ state: 'logout', ts: Date.now() }));
    // Hapus session cookie jika ada
    document.cookie = "gaspol_token=; path=/; max-age=0;";
    _stopHeartbeat();
    window.location.href = window.location.pathname;
  }

  let _isLoggingOut = false;

  async function forceLogout(message) {
    if (_isLoggingOut) return;
    _isLoggingOut = true;
    
    if (message) toast(message, 'error');
    
    if (_token) {
        apiGet('logout', { token: _token }, false).catch(() => {});
    }
    _token = null; _user = null; _apps = [];
    localStorage.removeItem('gaspol_token');
    // Hapus session cookie
    document.cookie = "gaspol_token=; path=/; max-age=0;";
    _stopHeartbeat();
    try {
      localStorage.setItem('gaspol_sess_state', JSON.stringify({ state: 'logout', ts: Date.now() }));
      new BroadcastChannel('gaspol_sso_channel').postMessage({ type: 'LOGOUT', reason: 'portal_logout' });
    } catch(e) {}
    
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
    if (_user.role === 'USER' && _user.unit_kerja && _user.unit_kerja.toUpperCase() === 'SATUAN PENDIDIKAN' && ppkpspApp) {
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

    if (viewId === 'admin') { resetUsersFilter(); _loadAdminData(); }
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

  const JENJANG_BENTUK_MAP = {
    'SD': ['SD'],
    'SMP': ['SMP'],
    'SMA': ['SMA'],
    'SMK': ['SMK'],
    'SLB': ['SLB'],
    'PAUD': ['TK', 'KB', 'TPA', 'SPS'],
    'Dikmas': ['PKBM', 'SKB']
  };

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
      
      // Update Bentuk Pendidikan options dynamically
      let allowedBentuk = [];
      if (checkedVals.includes('ALL')) {
        allowedBentuk = 'ALL';
      } else {
        checkedVals.forEach(j => {
          if (JENJANG_BENTUK_MAP[j]) {
            allowedBentuk = allowedBentuk.concat(JENJANG_BENTUK_MAP[j]);
          }
        });
      }
      
      const ddBentuk = document.getElementById('dd-bentuk');
      const bentukLabels = ddBentuk.querySelectorAll('label');
      let checkedBentuk = [];
      bentukLabels.forEach(lbl => {
        const cb = lbl.querySelector('input');
        if (!cb) return;
        const val = cb.value;
        if (val === 'ALL') return;
        
        if (allowedBentuk === 'ALL' || allowedBentuk.includes(val)) {
          lbl.style.display = 'flex';
          if (cb.checked) checkedBentuk.push(val);
        } else {
          lbl.style.display = 'none';
          cb.checked = false;
        }
      });
      
      // Update Bentuk Filter state if any selected shapes were hidden and unchecked
      if (!checkedBentuk.length && !_usersBentukFilter.includes('ALL')) {
        const allBcb = ddBentuk.querySelector('input[value="ALL"]');
        if (allBcb) allBcb.checked = true;
        _usersBentukFilter = ['ALL'];
        document.getElementById('label-bentuk').innerText = 'Semua Bentuk';
      } else if (checkedBentuk.length > 0) {
        _usersBentukFilter = checkedBentuk;
        document.getElementById('label-bentuk').innerText = checkedBentuk.join(', ');
      }
      
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
    _usersPerPage = 10;
    document.getElementById('filter-user-perpage').value = '10';
    
    document.querySelectorAll('.multi-select-dropdown input[type="checkbox"]').forEach(cb => cb.checked = (cb.value === 'ALL'));
    document.getElementById('label-jenjang').innerText = 'Semua Jenjang';
    document.getElementById('label-bentuk').innerText = 'Semua Bentuk';
    document.getElementById('label-instansi').innerText = 'Semua Instansi';
    
    // Reset Bentuk Pendidikan visibility
    const ddBentuk = document.getElementById('dd-bentuk');
    if (ddBentuk) {
      ddBentuk.querySelectorAll('label').forEach(lbl => lbl.style.display = 'flex');
    }
    
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
        <td><div style="max-width:140px; word-break:break-word; white-space:normal;"><strong>${u.fullName}</strong></div></td>
        <td><div style="max-width:100px; word-break:break-word; white-space:normal;">${u.username}</div></td>
        <td><div style="max-width:130px; word-break:break-word; white-space:normal; font-size:11px; line-height:1.4;">${u.email || ''} ${u.email && u.whatsapp ? '<br>' : ''} ${u.whatsapp || ''}</div></td>
        <td style="font-size:12px;"><div style="max-width:120px; word-break:break-word; white-space:normal;">${u.instansi || '<span style="color:var(--text3)">-</span>'}</div></td>
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
        <td style="font-size:11px;color:var(--text);line-height:1.4;white-space:nowrap;">${u.role === 'SUPER_ADMIN' ? '<span style="color:var(--gs);font-weight:600;"><i class="ti ti-apps"></i> Semua Aplikasi</span>' : ((u.apps && u.apps.length > 0) ? [...u.apps].sort((a, b) => a.localeCompare(b)).join('<br>') : '<span style="color:var(--text3)">—</span>')}</td>
        <td style="font-size:11px;color:var(--text3);line-height:1.4;">${formatDateID(u.lastLogin, true)}</td>
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
    _allAdminApps = (r.apps || []).sort((a, b) => a.appName.localeCompare(b.appName));
    
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
        <td><strong style="display:flex;align-items:center;gap:6px;"><i class="ti ${a.appIcon||'ti-app'}" style="color:${a.color};font-size:18px;"></i>${a.appName}</strong></td>
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





