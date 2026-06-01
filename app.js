/* ----------------------------------------------------
   影片素材交易與帶貨平台 - 核心邏輯引擎 (app.js)
   功能：狀態管理、多端同步模擬、防螢幕錄影、儲值、下載、後台審核
---------------------------------------------------- */

// Mock Stock video links to populate beautiful defaults
const DEMO_VIDEOS = [
  "https://assets.mixkit.co/videos/preview/mixkit-coffee-maker-dripping-coffee-into-glass-pot-40763-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-holding-a-small-smart-speaker-with-one-hand-42006-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-skin-cream-being-applied-to-a-womans-hand-42289-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-hand-holding-a-glass-of-water-with-lemon-41973-large.mp4"
];

const DEMO_PHOTOS = [
  "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3", // Headphones
  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3", // Watch
  "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3"  // Shoes
];

class AppEngine {
  constructor() {
    this.currentUser = null;
    this.users = [];
    this.products = [];
    this.withdrawals = [];
    this.activeView = 'home';
    this.adminActiveTab = 'approve-materials';
    this.uploadedFiles = {
      unboxing: [],
      display: [],
      effect: [],
      detail: [],
      usage: [],
      other: []
    };
    this.watermarkInterval = null;

    // Supabase config hooks (can be set up directly in production)
    this.supabaseConfig = {
      url: "https://your-supabase-project.supabase.co",
      anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your-key-here"
    };

    this.init();
  }

  init() {
    // Load state from localStorage or populate mock database defaults
    this.loadState();
    
    // Bind global security blockers
    this.bindSecurityEvents();
    
    // Check if user session already exists
    this.checkSession();

    // Initial render
    this.renderNavigation();
    this.renderProducts();
    this.renderAdminPanels();
    this.startFloatingWatermark();
    
    // Periodic synchronization alert mockup
    setInterval(() => {
      if (this.currentUser) {
        this.triggerCloudSyncToast("實時雲端資料庫已同步更新...");
      }
    }, 45000);
  }

  // --------------------------------------------------
  // 1. STATE & STORAGE MANAGEMENT
  // --------------------------------------------------
  loadState() {
    const localUsers = localStorage.getItem('app_users');
    const localProducts = localStorage.getItem('app_products');
    const localWithdrawals = localStorage.getItem('app_withdrawals');

    if (localUsers) {
      this.users = JSON.parse(localUsers);
      // Migration Helper: convert old schema users to multi-role schema
      this.users.forEach(u => {
        if (!u.roles) {
          u.roles = [u.role || 'creator'];
        }
        if (!u.role) {
          u.role = u.roles[0];
        }
        if (u.seller_credits === undefined) {
          u.seller_credits = u.role === 'seller' ? (u.balance || 0) : 0;
          if (u.role === 'seller') {
            u.balance = 0; // Separate cash balance from points
          }
        }
      });
    } else {
      // Default Mock Users
      this.users = [
        {
          id: "usr_creator_01",
          name: "陳阿明",
          phone: "0912345678",
          email: "amin@example.com",
          roles: ["creator", "seller"], // Dual Roles!
          role: "creator", // Current Active Role
          level: 3,
          balance: 1250, // Creator Earnings (TWD Cash)
          seller_credits: 2000, // Seller Point Credits
          total_earnings: 1250,
          created_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
          bank_info: {
            name: "822 中國信託商業銀行",
            branch: "敦北分行",
            user: "陳阿明",
            account: "123456789012"
          }
        },
        {
          id: "usr_seller_01",
          name: "林小花",
          phone: "0987654321",
          email: "flower@example.com",
          roles: ["seller"],
          role: "seller",
          level: 1,
          balance: 0,
          seller_credits: 4500, // Points
          total_earnings: 0,
          created_at: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString()
        },
        {
          id: "usr_admin",
          name: "超級管理員",
          phone: "0900000000",
          email: "admin@material.exchange",
          roles: ["admin"],
          role: "admin",
          level: 10,
          balance: 99999,
          seller_credits: 99999,
          total_earnings: 99999,
          created_at: new Date().toISOString()
        }
      ];
      this.saveUsers();
    }

    if (localProducts) {
      this.products = JSON.parse(localProducts);
    } else {
      // Default Mock Products
      this.products = [
        {
          id: "prod_01",
          creator_id: "usr_creator_01",
          creator_name: "陳阿明",
          name: "日系極簡雙層智能保溫杯 (Shopee 爆款)",
          photo_url: DEMO_PHOTOS[0],
          status: "approved",
          downloads_count: 72,
          created_at: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
          is_quality: true,
          scenes: {
            unboxing: [DEMO_VIDEOS[0]],
            display: [DEMO_VIDEOS[1]],
            effect: [DEMO_VIDEOS[2]],
            detail: [DEMO_VIDEOS[3]],
            usage: [DEMO_VIDEOS[0]],
            other: []
          }
        },
        {
          id: "prod_02",
          creator_id: "usr_creator_01",
          creator_name: "陳阿明",
          name: "北歐風大理石不鏽鋼防水石英手錶",
          photo_url: DEMO_PHOTOS[1],
          status: "approved",
          downloads_count: 24,
          created_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
          is_quality: false,
          scenes: {
            unboxing: [DEMO_VIDEOS[2]],
            display: [DEMO_VIDEOS[3]],
            effect: [],
            detail: [DEMO_VIDEOS[1]],
            usage: [],
            other: []
          }
        },
        {
          id: "prod_03",
          creator_id: "usr_creator_01",
          creator_name: "陳阿明",
          name: "防滑高透氣編織運動慢跑鞋",
          photo_url: DEMO_PHOTOS[2],
          status: "pending",
          downloads_count: 0,
          created_at: new Date().toISOString(),
          is_quality: false,
          scenes: {
            unboxing: [DEMO_VIDEOS[1]],
            display: [DEMO_VIDEOS[0]],
            effect: [DEMO_VIDEOS[3]],
            detail: [],
            usage: [],
            other: []
          }
        }
      ];
      this.saveProducts();
    }

    if (localWithdrawals) {
      this.withdrawals = JSON.parse(localWithdrawals);
    } else {
      this.withdrawals = [
        {
          id: "wtd_01",
          creator_id: "usr_creator_01",
          creator_name: "陳阿明",
          amount: 1500,
          bank_info: "822 中國信託商業銀行 (戶名: 陳阿明 帳號: ***9012)",
          status: "approved",
          created_at: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString()
        }
      ];
      this.saveWithdrawals();
    }
  }

  saveUsers() {
    localStorage.setItem('app_users', JSON.stringify(this.users));
  }

  saveProducts() {
    localStorage.setItem('app_products', JSON.stringify(this.products));
  }

  saveWithdrawals() {
    localStorage.setItem('app_withdrawals', JSON.stringify(this.withdrawals));
  }

  checkSession() {
    const session = localStorage.getItem('app_session');
    if (session) {
      const user = this.users.find(u => u.id === session);
      if (user) {
        this.currentUser = user;
      }
    }
  }

  // --------------------------------------------------
  // 2. SECURITY ENGINE (Anti-Screen Record & Protection)
  // --------------------------------------------------
  bindSecurityEvents() {
    // 1. Block right click context menu
    document.addEventListener('contextmenu', (e) => {
      if (this.currentUser) {
        e.preventDefault();
        alert("🛡️ 安全防護提示：本平台已啟用原創素材防拷保護，禁止右鍵另存。");
      }
    });

    // 2. Block copy
    document.addEventListener('copy', (e) => {
      if (this.currentUser) {
        e.preventDefault();
        alert("🛡️ 安全防護提示：本平台禁止複製網頁素材內容。");
      }
    });

    // 3. Monitor key down events for PrintScreen, screenshot shortcuts or DevTools (F12, Ctrl+Shift+I)
    document.addEventListener('keydown', (e) => {
      if (!this.currentUser) return;
      
      // PrintScreen Key
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        this.triggerGuardOverlay();
      }

      // F12 or Ctrl+Shift+I (Mac: Cmd+Opt+I)
      if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I') || (e.metaKey && e.altKey && e.key === 'i')) {
        e.preventDefault();
        this.triggerGuardOverlay();
        alert("🛡️ 安全提示：偵測到嘗試開啟開發者工具。影片內容已被安全防護模糊。");
      }
    });

    // 4. Focus Loss & Tab switching detection (Page Visibility API)
    document.addEventListener('visibilitychange', () => {
      if (this.currentUser && document.hidden) {
        this.triggerGuardOverlay();
      }
    });

    window.addEventListener('blur', () => {
      if (this.currentUser) {
        this.triggerGuardOverlay();
      }
    });

    window.addEventListener('focus', () => {
      // Keep guard if screen recording is suspected, or let users manually dismiss
    });
  }

  triggerGuardOverlay() {
    const overlay = document.getElementById('screen-guard-overlay');
    if (overlay) {
      overlay.classList.remove('hidden');
    }
    // Blur active video players
    const videos = document.querySelectorAll('video');
    videos.forEach(v => {
      v.pause();
      v.classList.add('private-blur');
    });
  }

  dismissGuard() {
    const overlay = document.getElementById('screen-guard-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
    }
    const videos = document.querySelectorAll('video');
    videos.forEach(v => {
      v.classList.remove('private-blur');
    });
  }

  // Floating Watermark Generator (Name + Phone digits)
  startFloatingWatermark() {
    if (this.watermarkInterval) {
      clearInterval(this.watermarkInterval);
    }

    const container = document.getElementById('watermark-container');
    if (!container) return;
    
    container.innerHTML = '';
    if (!this.currentUser) return;

    const phoneStr = this.currentUser.phone;
    const maskedPhone = phoneStr.substring(0, 4) + "***" + phoneStr.substring(phoneStr.length - 4);
    const watermarkText = `${this.currentUser.name} (${maskedPhone}) 原創素材防盜版`;

    const createWatermarkNode = () => {
      const el = document.createElement('div');
      el.className = 'floating-watermark-text no-select';
      el.innerText = watermarkText;
      
      // Random coordinates
      const x = Math.random() * (window.innerWidth - 200);
      const y = Math.random() * (window.innerHeight - 50);
      
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      
      container.appendChild(el);

      // Fade out and remove
      setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 2000);
      }, 4000);
    };

    // Spawn initial watermarks
    for (let i = 0; i < 4; i++) {
      setTimeout(createWatermarkNode, i * 1000);
    }

    this.watermarkInterval = setInterval(() => {
      if (this.currentUser) {
        createWatermarkNode();
      }
    }, 2500);
  }

  // --------------------------------------------------
  // 3. NAVIGATION & VIEW SYSTEM
  // --------------------------------------------------
  navigate(viewId) {
    // Auth Wall check
    if (viewId !== 'home' && !this.currentUser) {
      alert("請先完成註冊或登入後，即可開啟此版塊！");
      this.openAuthModal('register');
      return;
    }

    this.activeView = viewId;
    
    // Toggle active classes on sections
    const views = ['home', 'creator', 'seller', 'admin'];
    views.forEach(v => {
      const el = document.getElementById(`view-${v}`);
      if (el) {
        if (v === viewId) {
          el.classList.remove('hidden');
        } else {
          el.classList.add('hidden');
        }
      }
    });

    // Reset uploader form files preview when leaving creator panel
    if (viewId !== 'creator') {
      this.resetUploadForm();
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Update menus
    this.renderNavigation();
    this.renderUserGreeters();
    this.dismissGuard();
  }

  renderNavigation() {
    const desktopNav = document.getElementById('desktop-nav');
    const mobileBottomNav = document.getElementById('mobile-bottom-nav');
    const userStatus = document.getElementById('header-user-status');
    const heroActions = document.getElementById('hero-actions-container');

    if (!desktopNav || !mobileBottomNav) return;

    desktopNav.innerHTML = '';
    mobileBottomNav.innerHTML = '';

    // Standard Landing Pages Links
    let desktopHtml = `<a class="nav-link ${this.activeView === 'home' ? 'active' : ''}" onclick="app.navigate('home')">首頁介紹</a>`;
    let mobileHtml = `
      <div class="mobile-nav-item ${this.activeView === 'home' ? 'active' : ''}" onclick="app.navigate('home')">
        <i class="fa-solid fa-house"></i>
        <span>首頁</span>
      </div>
    `;

    if (this.currentUser) {
      const hasDoubleRoles = this.currentUser.roles && this.currentUser.roles.includes('creator') && this.currentUser.roles.includes('seller');

      // logged in menu logic
      if (this.currentUser.role === 'creator') {
        desktopHtml += `
          <a class="nav-link ${this.activeView === 'creator' ? 'active' : ''}" onclick="app.navigate('creator')">創作者中心</a>
          ${hasDoubleRoles ? `<a class="nav-link text-amber" onclick="app.switchActiveRole()"><i class="fa-solid fa-arrows-rotate"></i> 切換為帶貨者</a>` : ''}
          <a class="nav-link" href="https://line.me/R/ti/p/@yourlineid" target="_blank">LINE@ 客服</a>
        `;
        mobileHtml += `
          <div class="mobile-nav-item ${this.activeView === 'creator' ? 'active-creator' : ''}" onclick="app.navigate('creator')">
            <i class="fa-solid fa-camera-retro"></i>
            <span>創作者中心</span>
          </div>
          ${hasDoubleRoles ? `
          <div class="mobile-nav-item" onclick="app.switchActiveRole()">
            <i class="fa-solid fa-arrows-rotate" style="color:var(--color-accent);"></i>
            <span>切換身分</span>
          </div>` : ''}
          <a class="mobile-nav-item" href="https://line.me/R/ti/p/@yourlineid" target="_blank" style="text-decoration:none;">
            <i class="fa-brands fa-line" style="color:#06c755;"></i>
            <span>LINE客服</span>
          </a>
        `;
      } else if (this.currentUser.role === 'seller') {
        desktopHtml += `
          <a class="nav-link ${this.activeView === 'seller' ? 'active' : ''}" onclick="app.navigate('seller')">帶貨神器</a>
          ${hasDoubleRoles ? `<a class="nav-link text-amber" onclick="app.switchActiveRole()"><i class="fa-solid fa-arrows-rotate"></i> 切換為創作者</a>` : ''}
          <a class="nav-link" onclick="app.openRechargeModal()">積分儲值</a>
          <a class="nav-link" onclick="app.scrollAndFocus('seller-tutorial-section')">帶貨教學</a>
        `;
        mobileHtml += `
          <div class="mobile-nav-item ${this.activeView === 'seller' ? 'active-seller' : ''}" onclick="app.navigate('seller')">
            <i class="fa-solid fa-wand-magic-sparkles"></i>
            <span>帶貨神器</span>
          </div>
          ${hasDoubleRoles ? `
          <div class="mobile-nav-item" onclick="app.switchActiveRole()">
            <i class="fa-solid fa-arrows-rotate" style="color:var(--color-accent);"></i>
            <span>切換身分</span>
          </div>` : ''}
          <div class="mobile-nav-item" onclick="app.openRechargeModal()">
            <i class="fa-solid fa-wallet"></i>
            <span>積分儲值</span>
          </div>
        `;
      } else if (this.currentUser.role === 'admin') {
        desktopHtml += `
          <a class="nav-link ${this.activeView === 'creator' ? 'active' : ''}" onclick="app.navigate('creator')">創作者板塊</a>
          <a class="nav-link ${this.activeView === 'seller' ? 'active' : ''}" onclick="app.navigate('seller')">帶貨神器</a>
          <a class="nav-link ${this.activeView === 'admin' ? 'active' : ''}" onclick="app.navigate('admin')">後台管理</a>
        `;
        mobileHtml += `
          <div class="mobile-nav-item ${this.activeView === 'creator' ? 'active' : ''}" onclick="app.navigate('creator')">
            <i class="fa-solid fa-video"></i>
            <span>創作者</span>
          </div>
          <div class="mobile-nav-item ${this.activeView === 'seller' ? 'active' : ''}" onclick="app.navigate('seller')">
            <i class="fa-solid fa-shop"></i>
            <span>帶貨神器</span>
          </div>
          <div class="mobile-nav-item ${this.activeView === 'admin' ? 'active' : ''}" onclick="app.navigate('admin')">
            <i class="fa-solid fa-user-gear"></i>
            <span>後台</span>
          </div>
        `;
      }

      // Add logout item to mobile bottom nav
      mobileHtml += `
        <div class="mobile-nav-item" onclick="app.logout()">
          <i class="fa-solid fa-right-from-bracket"></i>
          <span>登出</span>
        </div>
      `;

      // Header User Pill (Checks active wallet)
      let displayBal = this.currentUser.role === 'creator' ? `$${this.currentUser.balance.toFixed(2)}` : `${this.currentUser.seller_credits} 積分`;
      let switchBtnHtml = hasDoubleRoles ? `<button class="btn btn-outline btn-sm text-amber" onclick="app.switchActiveRole()"><i class="fa-solid fa-arrows-rotate"></i> 切換身分</button>` : '';
      userStatus.innerHTML = `
        <div class="user-badge-header">
          <i class="fa-solid fa-user"></i>
          <span><b>${this.currentUser.name}</b> (${displayBal})</span>
        </div>
        ${switchBtnHtml}
        <button class="btn btn-outline btn-sm" onclick="app.logout()"><i class="fa-solid fa-right-from-bracket"></i> 登出</button>
      `;

      // Hide Landing Page buttons if logged in
      if (heroActions) {
        heroActions.innerHTML = `
          <button class="btn btn-primary btn-lg" onclick="app.navigate('${this.currentUser.role === 'seller' ? 'seller' : 'creator'}')">進入我的主頁板塊 <i class="fa-solid fa-arrow-right"></i></button>
        `;
      }
    } else {
      // Not logged in Header & Landing actions
      userStatus.innerHTML = `
        <button class="btn btn-outline btn-sm" onclick="app.openAuthModal('login')">登入</button>
        <button class="btn btn-primary btn-sm" onclick="app.openAuthModal('register')">免費註冊</button>
      `;
      
      if (heroActions) {
        heroActions.innerHTML = `
          <button class="btn btn-primary btn-lg" onclick="app.openAuthModal('register')">立即註冊，解鎖完整功能</button>
          <button class="btn btn-outline btn-lg" onclick="app.openAuthModal('login')">已有帳號？快速登入</button>
        `;
      }
    }

    desktopNav.innerHTML = desktopHtml;
    mobileBottomNav.innerHTML = mobileHtml;
  }

  renderUserGreeters() {
    if (!this.currentUser) return;

    if (this.currentUser.role === 'creator') {
      const greet = document.getElementById('creator-greeting');
      if (greet) greet.innerText = `您好，創作者 ${this.currentUser.name}！`;
      this.renderCreatorStats();
    } else if (this.currentUser.role === 'seller') {
      const greet = document.getElementById('seller-greeting');
      if (greet) greet.innerText = `您好，帶貨主播 ${this.currentUser.name}！`;
      this.renderSellerStats();
    }
  }

  switchActiveRole() {
    if (!this.currentUser || !this.currentUser.roles || this.currentUser.roles.length < 2) {
      alert("您目前僅具備單一角色身分，無法進行切換。");
      return;
    }

    const nextRole = this.currentUser.role === 'creator' ? 'seller' : 'creator';
    this.currentUser.role = nextRole;

    // Save in user list
    const userIdx = this.users.findIndex(u => u.id === this.currentUser.id);
    if (userIdx !== -1) {
      this.users[userIdx] = this.currentUser;
      this.saveUsers();
    }

    this.triggerCloudSyncToast(`已切換為【${nextRole === 'creator' ? '創作者' : '帶貨主播'}】身分`);
    alert(`🔄 身份切換成功！您現在已切換為【${nextRole === 'creator' ? '創作者' : '帶貨主播'}】。`);

    // Redirect to respective module dashboard
    this.navigate(nextRole);
  }

  // --------------------------------------------------
  // 4. MEMBERSHIP & AUTHENTICATION (跨端/同裝置同步)
  // --------------------------------------------------
  openAuthModal(tab = 'register') {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.classList.remove('hidden');
    this.switchAuthTab(tab);
  }

  closeAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.classList.add('hidden');
  }

  switchAuthTab(tab) {
    const regForm = document.getElementById('auth-register-form');
    const logForm = document.getElementById('auth-login-form');
    const regTab = document.getElementById('auth-tab-register');
    const logTab = document.getElementById('auth-tab-login');
    const title = document.getElementById('auth-modal-title');

    if (tab === 'register') {
      regForm.classList.remove('hidden');
      logForm.classList.add('hidden');
      regTab.classList.add('active');
      logTab.classList.remove('active');
      title.innerText = "註冊素材交易會員";
    } else {
      regForm.classList.add('hidden');
      logForm.classList.remove('hidden');
      regTab.classList.remove('active');
      logTab.classList.add('active');
      title.innerText = "會員快速登入";
    }
  }

  handleRegister(event) {
    event.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const phone = document.getElementById('reg-phone').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const agreement = document.getElementById('reg-agreement').checked;

    // Read checkboxes instead of radio
    const roleBoxes = document.querySelectorAll('input[name="reg-role-box"]:checked');
    const roles = Array.from(roleBoxes).map(cb => cb.value);

    if (!name || !phone || !email) {
      alert("請填寫所有必要欄位。");
      return;
    }

    if (roles.length === 0) {
      alert("請至少選擇一種會員角色（創作者 或 帶貨主播）進行註冊！");
      return;
    }

    if (!agreement) {
      alert("您必須同意原創版權合規授權條款，方能使用本平台。");
      return;
    }

    // Check if phone number is taken
    const exists = this.users.find(u => u.phone === phone);
    if (exists) {
      alert("該電話號碼已註冊！請切換至「電話登入」頁面。");
      this.switchAuthTab('login');
      return;
    }

    const defaultRole = roles[0]; // Set first selected role as default active role

    const newUser = {
      id: "usr_" + Math.random().toString(36).substring(2, 11),
      name,
      phone,
      email,
      roles,
      role: defaultRole, // Current active role
      level: 1,
      balance: 0.00,       // Creator Cash Earnings (TWD)
      seller_credits: 0,   // Seller points credits
      total_earnings: 0.00,
      created_at: new Date().toISOString()
    };

    this.users.push(newUser);
    this.saveUsers();
    this.currentUser = newUser;
    localStorage.setItem('app_session', newUser.id);

    this.triggerCloudSyncToast("註冊成功！資料庫已實時同步雲端！");
    this.closeAuthModal();
    this.renderNavigation();
    
    // Redirect to active role dashboard
    this.navigate(defaultRole);
    this.startFloatingWatermark();
  }

  handleLogin(event) {
    event.preventDefault();
    const phone = document.getElementById('login-phone').value.trim();

    if (!phone) {
      alert("請輸入電話號碼。");
      return;
    }

    const user = this.users.find(u => u.phone === phone);
    if (!user) {
      alert("找不到此電話號碼註冊紀錄，請先填寫上方表單進行註冊！");
      this.switchAuthTab('register');
      return;
    }

    // Ensure roles array and active role are initialized
    if (!user.roles) {
      user.roles = [user.role || 'creator'];
    }
    if (!user.role) {
      user.role = user.roles[0];
    }
    if (user.seller_credits === undefined) {
      user.seller_credits = user.role === 'seller' ? (user.balance || 0) : 0;
      if (user.role === 'seller') {
        user.balance = 0;
      }
    }

    this.currentUser = user;
    localStorage.setItem('app_session', user.id);

    this.triggerCloudSyncToast("登入成功！多端裝置已完美同步狀態！");
    this.closeAuthModal();
    this.renderNavigation();

    // Redirect to active role dashboard
    this.navigate(user.role);
    this.startFloatingWatermark();
  }

  logout() {
    this.currentUser = null;
    localStorage.removeItem('app_session');
    this.navigate('home');
    this.renderNavigation();
    this.startFloatingWatermark();
    alert("您已安全登出本平台。");
  }

  // --------------------------------------------------
  // 5. CREATOR ECOSYSTEM (Uploads, Tiers, Leaderboard)
  // --------------------------------------------------
  renderCreatorStats() {
    if (!this.currentUser || this.currentUser.role !== 'creator') return;

    // Recalculate Creator Level dynamically
    this.recalculateCreatorLevel();

    // Stats variables
    const levelVal = document.getElementById('creator-level-val');
    const levelDesc = document.getElementById('creator-level-desc');
    const levelFill = document.getElementById('creator-level-progress-fill');
    const levelReq = document.getElementById('creator-level-req');

    const balVal = document.getElementById('creator-balance');
    const wthBalVal = document.getElementById('creator-withdraw-balance');
    const totEarnVal = document.getElementById('creator-total-earnings');

    const uploCount = document.getElementById('creator-upload-count');
    const downCount = document.getElementById('creator-download-count');
    const rankVal = document.getElementById('creator-download-rank');

    // Retrieve creator products list
    const myProducts = this.products.filter(p => p.creator_id === this.currentUser.id);
    const approvedProducts = myProducts.filter(p => p.status === 'approved');
    const totalDownloads = approvedProducts.reduce((acc, p) => acc + p.downloads_count, 0);

    // Levels metadata
    const levelsMap = [
      "新手創作者", "新秀創作者", "進階創作者", "銅牌創作者", "銀牌創作者",
      "金牌創作者", "白金創作者", "鑽石創作者", "大師創作者", "傳奇創作者"
    ];

    if (levelVal) levelVal.innerText = `LV.${this.currentUser.level}`;
    if (levelDesc) levelDesc.innerText = levelsMap[this.currentUser.level - 1] || "資深創作者";
    
    // Level progress calculations (5 uploads for 1 level)
    const nextLevelUploadCount = this.currentUser.level * 5;
    const prevLevelUploadCount = (this.currentUser.level - 1) * 5;
    const progressPercent = Math.min(100, Math.max(10, ((approvedProducts.length - prevLevelUploadCount) / 5) * 100));
    
    if (levelFill) levelFill.style.width = `${progressPercent}%`;
    if (levelReq) {
      if (this.currentUser.level >= 10) {
        levelReq.innerText = "已達到最高等級！享有最高 10個人下載賺 $10 元收益分成";
      } else {
        const remaining = nextLevelUploadCount - approvedProducts.length;
        levelReq.innerText = `再上架 ${remaining > 0 ? remaining : 1} 部商品素材，並保持高品質即可升級`;
      }
    }

    // Set balances
    if (balVal) balVal.innerText = this.currentUser.balance.toFixed(2);
    if (wthBalVal) wthBalVal.innerText = `$${this.currentUser.balance.toFixed(2)}`;
    if (totEarnVal) totEarnVal.innerText = `累積總收益: $${this.currentUser.total_earnings.toFixed(2)}`;

    if (uploCount) uploCount.innerText = approvedProducts.length;
    if (downCount) downCount.innerText = totalDownloads;

    // Enable/Disable withdrawal button based on min TWD 1000 limit
    const wthBtn = document.getElementById('btn-submit-withdrawal');
    const limitStatus = document.getElementById('withdraw-limit-status');
    if (wthBtn && limitStatus) {
      if (this.currentUser.balance >= 1000) {
        wthBtn.disabled = false;
        limitStatus.innerHTML = `<span style="color:var(--color-seller);"><i class="fa-solid fa-circle-check"></i> 已達 $1000 提領門檻！可以申請提領。</span>`;
      } else {
        wthBtn.disabled = true;
        limitStatus.innerHTML = `額度未達提領標準 (尚差 $${(1000 - this.currentUser.balance).toFixed(2)} 元)`;
      }
    }

    // Leaderboards
    this.renderLeaderboards();
    this.renderWithdrawalRecords();

    // Auto-fill bank fields if saved
    if (this.currentUser.bank_info) {
      document.getElementById('bank-name').value = this.currentUser.bank_info.name || '';
      document.getElementById('bank-branch').value = this.currentUser.bank_info.branch || '';
      document.getElementById('bank-user').value = this.currentUser.bank_info.user || '';
      document.getElementById('bank-account-num').value = this.currentUser.bank_info.account || '';
    }

    // Set Level highlights on Level Card
    for (let l = 1; l <= 10; l++) {
      const rankEl = document.getElementById(`rank-step-${l}`);
      if (rankEl) {
        if (l === this.currentUser.level) {
          rankEl.className = 'rank-step current-rank-step';
        } else {
          rankEl.className = 'rank-step';
        }
      }
    }
  }

  recalculateCreatorLevel() {
    if (!this.currentUser || this.currentUser.role !== 'creator') return;
    
    const myApproved = this.products.filter(p => p.creator_id === this.currentUser.id && p.status === 'approved');
    const highQualityCount = myApproved.filter(p => p.is_quality).length;

    // Formulas: LV 1 to 10
    // Every 5 uploads upgrades level, with a minimum required "high quality" tags
    let calculatedLevel = 1;
    for (let l = 2; l <= 10; l++) {
      const requiredUploads = (l - 1) * 5;
      const requiredHq = Math.floor(requiredUploads * 0.3); // 30% of uploads must be high quality
      if (myApproved.length >= requiredUploads && highQualityCount >= requiredHq) {
        calculatedLevel = l;
      } else {
        break;
      }
    }

    if (this.currentUser.level !== calculatedLevel) {
      this.currentUser.level = calculatedLevel;
      this.saveUsers();
    }
  }

  previewProductPhoto(event) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const preview = document.getElementById('photo-preview');
        const placeholder = document.getElementById('photo-placeholder-content');
        preview.src = e.target.result;
        preview.classList.remove('hidden');
        placeholder.classList.add('hidden');
      };
      reader.readAsDataURL(file);
    }
  }

  handleVideoChange(event, scene) {
    const files = event.target.files;
    const listContainer = document.getElementById(`file-list-${scene}`);
    if (!listContainer) return;

    if (files.length > 0) {
      this.uploadedFiles[scene] = Array.from(files);
      listContainer.innerHTML = '';

      this.uploadedFiles[scene].forEach((file, index) => {
        const row = document.createElement('div');
        row.className = 'video-file-row';
        row.innerHTML = `
          <span class="video-name"><i class="fa-solid fa-file-video text-creator"></i> ${file.name}</span>
          <button type="button" class="remove-file-btn" onclick="app.removeSelectedVideo('${scene}', ${index})">&times;</button>
        `;
        listContainer.appendChild(row);
      });
    }
  }

  removeSelectedVideo(scene, index) {
    this.uploadedFiles[scene].splice(index, 1);
    const listContainer = document.getElementById(`file-list-${scene}`);
    if (listContainer) {
      listContainer.innerHTML = '';
      this.uploadedFiles[scene].forEach((file, idx) => {
        const row = document.createElement('div');
        row.className = 'video-file-row';
        row.innerHTML = `
          <span class="video-name"><i class="fa-solid fa-file-video text-creator"></i> ${file.name}</span>
          <button type="button" class="remove-file-btn" onclick="app.removeSelectedVideo('${scene}', ${idx})">&times;</button>
        `;
        listContainer.appendChild(row);
      });
    }
  }

  handleCreatorUpload(event) {
    event.preventDefault();
    if (!this.currentUser) return;

    const name = document.getElementById('upload-product-name').value.trim();
    const photoInput = document.getElementById('upload-product-photo');
    const preview = document.getElementById('photo-preview');

    if (!name) {
      alert("請輸入商品產品名稱！");
      return;
    }

    if (!preview.src || preview.src.includes('window.location')) {
      alert("請上傳正方形商品封面照！");
      return;
    }

    // Verify if at least one scene video is uploaded
    let totalVideos = 0;
    const scenesData = {};

    for (const scene in this.uploadedFiles) {
      if (this.uploadedFiles[scene].length > 0) {
        totalVideos += this.uploadedFiles[scene].length;
        // Mock temporary blob URL for visual playback in the SPA
        scenesData[scene] = this.uploadedFiles[scene].map(file => URL.createObjectURL(file));
      } else {
        scenesData[scene] = [];
      }
    }

    if (totalVideos === 0) {
      alert("請至少在一個分鏡（如開箱分鏡或展示分鏡）中上傳至少 1 部影片素材！");
      return;
    }

    const newProduct = {
      id: "prod_" + Math.random().toString(36).substring(2, 11),
      creator_id: this.currentUser.id,
      creator_name: this.currentUser.name,
      name,
      photo_url: preview.src, // Base64
      status: "pending",
      downloads_count: 0,
      created_at: new Date().toISOString(),
      is_quality: false, // Updated by Admin backend
      scenes: scenesData
    };

    this.products.push(newProduct);
    this.saveProducts();
    this.resetUploadForm();

    this.triggerCloudSyncToast("商品素材上傳成功！已提交後台審核！");
    alert("您的商品分鏡素材已成功上傳，管理員將於 24 小時內完成質量審核！");
    
    this.renderCreatorStats();
    this.renderAdminPanels();
  }

  resetUploadForm() {
    document.getElementById('creator-upload-form').reset();
    const preview = document.getElementById('photo-preview');
    const placeholder = document.getElementById('photo-placeholder-content');
    if (preview && placeholder) {
      preview.src = '';
      preview.classList.add('hidden');
      placeholder.classList.remove('hidden');
    }

    this.uploadedFiles = {
      unboxing: [],
      display: [],
      effect: [],
      detail: [],
      usage: [],
      other: []
    };

    const scenes = ['unboxing', 'display', 'effect', 'detail', 'usage', 'other'];
    scenes.forEach(sc => {
      const list = document.getElementById(`file-list-${sc}`);
      if (list) list.innerHTML = '';
    });
  }

  saveBankInfo() {
    if (!this.currentUser) return;
    const name = document.getElementById('bank-name').value.trim();
    const branch = document.getElementById('bank-branch').value.trim();
    const user = document.getElementById('bank-user').value.trim();
    const account = document.getElementById('bank-account-num').value.trim();

    if (!name || !user || !account) {
      alert("請填寫完整的銀行代碼名稱、戶名及帳號！");
      return;
    }

    this.currentUser.bank_info = { name, branch, user, account };
    
    // Save to users array
    const userIdx = this.users.findIndex(u => u.id === this.currentUser.id);
    if (userIdx !== -1) {
      this.users[userIdx] = this.currentUser;
      this.saveUsers();
    }

    this.triggerCloudSyncToast("銀行資料已綁定成功！");
    alert("收款轉帳銀行資訊儲存成功！");
  }

  requestWithdrawal() {
    if (!this.currentUser || this.currentUser.role !== 'creator') return;

    const amount = parseFloat(document.getElementById('withdraw-amount').value);
    
    if (isNaN(amount) || amount < 1000) {
      alert("單筆提領金額不可低於 $1000 元！");
      return;
    }

    if (amount > this.currentUser.balance) {
      alert("提領金額超過您目前的可提領餘額！");
      return;
    }

    if (!this.currentUser.bank_info || !this.currentUser.bank_info.account) {
      alert("請先填寫並綁定左側的收款銀行轉帳資訊！");
      return;
    }

    // Deduct available balance
    this.currentUser.balance -= amount;
    
    // Save in user list
    const userIdx = this.users.findIndex(u => u.id === this.currentUser.id);
    if (userIdx !== -1) {
      this.users[userIdx] = this.currentUser;
      this.saveUsers();
    }

    // Create withdrawal log
    const newWithdrawal = {
      id: "wtd_" + Math.random().toString(36).substring(2, 11),
      creator_id: this.currentUser.id,
      creator_name: this.currentUser.name,
      amount,
      bank_info: `${this.currentUser.bank_info.name} (戶名: ${this.currentUser.bank_info.user} 帳號: ***${this.currentUser.bank_info.account.slice(-4)})`,
      status: "pending",
      created_at: new Date().toISOString()
    };

    this.withdrawals.push(newWithdrawal);
    this.saveWithdrawals();

    this.triggerCloudSyncToast("提領申請已成功派發！");
    alert("提領申請成功！後台管理員核對銀行匯款後將於 1-3 工作天內入帳。");

    document.getElementById('withdraw-amount').value = '';
    this.renderCreatorStats();
    this.renderAdminPanels();
  }

  renderWithdrawalRecords() {
    const list = document.getElementById('withdrawal-records-list');
    if (!list || !this.currentUser) return;

    const myWtd = this.withdrawals.filter(w => w.creator_id === this.currentUser.id);
    
    if (myWtd.length === 0) {
      list.innerHTML = `<tr><td colspan="4" class="text-center text-muted">暫無提領申請紀錄</td></tr>`;
      return;
    }

    list.innerHTML = '';
    myWtd.sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).forEach(w => {
      const row = document.createElement('tr');
      
      let badgeClass = 'status-pending';
      let badgeLabel = '審核中';
      if (w.status === 'approved') {
        badgeClass = 'status-approved';
        badgeLabel = '已匯款';
      } else if (w.status === 'rejected') {
        badgeClass = 'status-rejected';
        badgeLabel = '退回';
      }

      row.innerHTML = `
        <td>${new Date(w.created_at).toLocaleDateString()}</td>
        <td>${w.bank_info}</td>
        <td class="fw-bold text-creator">$${w.amount.toFixed(2)}</td>
        <td><span class="status-badge ${badgeClass}">${badgeLabel}</span></td>
      `;
      list.appendChild(row);
    });
  }

  renderLeaderboards() {
    const list = document.getElementById('creator-leaderboard-list');
    if (!list) return;

    // Sum downloads per creator
    const rankings = this.users.filter(u => u.role === 'creator').map(c => {
      const myProds = this.products.filter(p => p.creator_id === c.id && p.status === 'approved');
      const downloads = myProds.reduce((sum, p) => sum + p.downloads_count, 0);
      return {
        name: c.name,
        downloads,
        level: c.level,
        payoutRate: (c.level * 0.1) + 0.2 // Higher payout factor per download
      };
    });

    rankings.sort((a, b) => b.downloads - a.downloads);

    list.innerHTML = '';
    rankings.slice(0, 5).forEach((c, index) => {
      const row = document.createElement('div');
      row.className = 'leader-row';
      row.innerHTML = `
        <div class="leader-rank-badge">${index + 1}</div>
        <div class="leader-avatar">${c.name[0]}</div>
        <div class="leader-info">
          <span class="leader-name">${c.name} <span class="badge bg-creator">LV.${c.level}</span></span>
          <span class="leader-downloads">下載次數: ${c.downloads} 次</span>
        </div>
        <span class="leader-payout">TWD $${(c.downloads * c.payoutRate).toFixed(0)}元</span>
      `;
      list.appendChild(row);
    });

    // Update current creator ranking index on stats
    if (this.currentUser && this.currentUser.role === 'creator') {
      const myIndex = rankings.findIndex(r => r.name === this.currentUser.name);
      const rankVal = document.getElementById('creator-download-rank');
      if (rankVal) {
        if (myIndex !== -1) {
          rankVal.innerText = `目前排行榜名次：第 ${myIndex + 1} 名 / 共 ${rankings.length} 位創作者`;
        } else {
          rankVal.innerText = `目前排行榜名次：暫無排名`;
        }
      }
    }
  }

  // --------------------------------------------------
  // 6. SELLER PORTAL (帶貨神器: Download logic & top-up)
  // --------------------------------------------------
  renderSellerStats() {
    if (!this.currentUser || this.currentUser.role !== 'seller') return;

    const credEl = document.getElementById('seller-credits');
    if (credEl) credEl.innerText = this.currentUser.seller_credits;
  }

  renderProducts() {
    const grid = document.getElementById('seller-products-grid');
    if (!grid) return;

    const approvedProds = this.products.filter(p => p.status === 'approved');
    
    if (approvedProds.length === 0) {
      grid.innerHTML = `<div style="grid-column: 1/-1; padding: 40px; text-align: center;" class="text-muted">素材庫中暫無審核通過的商品。請切换至後台審核或創作者中心上傳！</div>`;
      return;
    }

    grid.innerHTML = '';
    approvedProds.forEach(p => {
      // Calculate scene count
      let videoCount = 0;
      for (const sc in p.scenes) {
        videoCount += p.scenes[sc].length;
      }

      const card = document.createElement('div');
      card.className = 'product-item-card';
      card.onclick = () => this.openProductDetailModal(p.id);

      card.innerHTML = `
        <div class="product-img-aspect-box">
          <img src="${p.photo_url}" alt="${p.name}">
          ${p.is_quality ? `<span class="quality-badge-shopee"><i class="fa-solid fa-gem"></i> 高品質</span>` : ''}
          <span class="scenes-count-pill"><i class="fa-solid fa-film"></i> ${videoCount}分鏡</span>
        </div>
        <div class="product-card-body">
          <h4 class="product-card-title">${p.name}</h4>
          <div class="product-card-meta">
            <span class="product-uploader-name"><i class="fa-solid fa-video"></i> ${p.creator_name}</span>
            <span class="product-cost-tag">扣 5 點</span>
          </div>
        </div>
      `;
      grid.appendChild(card);
    });

    this.renderSellerLeaderboards();
  }

  filterProducts() {
    const query = document.getElementById('seller-search').value.toLowerCase().trim();
    const cards = document.querySelectorAll('#seller-products-grid .product-item-card');

    cards.forEach(card => {
      const name = card.querySelector('.product-card-title').innerText.toLowerCase();
      if (name.includes(query)) {
        card.classList.remove('hidden');
      } else {
        card.classList.add('hidden');
      }
    });
  }

  renderSellerLeaderboards() {
    // 1. Trending Creators for Sellers panel
    const trendingCreators = document.getElementById('seller-trending-creators');
    if (trendingCreators) {
      const rankings = this.users.filter(u => u.role === 'creator').map(c => {
        const myProds = this.products.filter(p => p.creator_id === c.id && p.status === 'approved');
        const downloads = myProds.reduce((sum, p) => sum + p.downloads_count, 0);
        return { name: c.name, downloads, level: c.level };
      });
      rankings.sort((a,b) => b.downloads - a.downloads);
      
      trendingCreators.innerHTML = '';
      rankings.slice(0, 3).forEach(c => {
        const row = document.createElement('div');
        row.className = 'trend-row';
        row.innerHTML = `
          <div class="leader-avatar">${c.name[0]}</div>
          <div class="trend-info">
            <span class="trend-title">${c.name}</span>
            <span class="trend-sub">LV.${c.level} 創作者 • ${c.downloads}次被下載</span>
          </div>
        `;
        trendingCreators.appendChild(row);
      });
    }

    // 2. Hot downloads
    const trendingProds = document.getElementById('seller-trending-products');
    if (trendingProds) {
      const approved = [...this.products].filter(p => p.status === 'approved');
      approved.sort((a,b) => b.downloads_count - a.downloads_count);

      trendingProds.innerHTML = '';
      approved.slice(0, 3).forEach(p => {
        const row = document.createElement('div');
        row.className = 'trend-row';
        row.innerHTML = `
          <div class="trend-img-box"><img src="${p.photo_url}"></div>
          <div class="trend-info">
            <span class="trend-title">${p.name}</span>
            <span class="trend-sub">${p.downloads_count}次打包下載</span>
          </div>
        `;
        trendingProds.appendChild(row);
      });
    }
  }

  // Recharge points methods
  openRechargeModal() {
    const modal = document.getElementById('recharge-modal');
    if (modal) modal.classList.remove('hidden');
  }

  closeRechargeModal() {
    const modal = document.getElementById('recharge-modal');
    if (modal) modal.classList.add('hidden');
  }

  selectRechargeBundle(amount, bonus) {
    if (!this.currentUser || this.currentUser.role !== 'seller') {
      alert("請先登入您的帶貨主播會員帳號！");
      this.closeRechargeModal();
      this.openAuthModal('login');
      return;
    }

    const confirmPay = confirm(`【模擬金流付費】確認是否儲值 TWD $${amount} 元以兌換 ${amount + bonus} 點積分？`);
    if (confirmPay) {
      this.currentUser.seller_credits += (amount + bonus);
      
      const userIdx = this.users.findIndex(u => u.id === this.currentUser.id);
      if (userIdx !== -1) {
        this.users[userIdx] = this.currentUser;
        this.saveUsers();
      }

      this.triggerCloudSyncToast("儲值成功！積分點數已實時到帳！");
      alert(`🎉 儲值完成！成功到帳 ${amount + bonus} 點積分 (含額外贈送 $${bonus} 元點數)！現有積分：${this.currentUser.seller_credits} 點。`);
      
      this.closeRechargeModal();
      this.renderSellerStats();
      this.renderAdminPanels();
    }
  }

  // --------------------------------------------------
  // 7. PRODUCT LIGHTBOX & DOWNLOAD LOGIC
  // --------------------------------------------------
  openProductDetailModal(productId) {
    if (!this.currentUser) {
      alert("請註冊登入帶貨會員後以開啟下載下載！");
      this.openAuthModal('register');
      return;
    }

    const p = this.products.find(x => x.id === productId);
    if (!p) return;

    this.activeDetailedProduct = p;

    // Load elements
    const modal = document.getElementById('product-detail-modal');
    const nameEl = document.getElementById('modal-product-name');
    const photoEl = document.getElementById('modal-product-photo');
    const playerBox = document.getElementById('detail-video-player-box');
    const videoPlayer = document.getElementById('modal-video-player');
    const sceneList = document.getElementById('modal-scenes-list');

    // Populate data
    nameEl.innerText = p.name;
    photoEl.src = p.photo_url;
    photoEl.classList.remove('hidden');
    playerBox.classList.add('hidden');
    videoPlayer.src = '';

    // Populate scenes checklist
    sceneList.innerHTML = '';
    
    const chineseScenes = {
      unboxing: "📦 1. 開箱分鏡影片",
      display: "🔍 2. 產品展示影片",
      effect: "⚡ 3. 產品效果影片",
      detail: "💎 4. 產品細節影片",
      usage: "🎥 5. 產品使用影片",
      other: "⚙️ 6. 其他創意影片"
    };

    let count = 0;
    for (const key in chineseScenes) {
      const urls = p.scenes[key] || [];
      if (urls.length > 0) {
        count++;
        // Display each video file available
        urls.forEach((url, i) => {
          const row = document.createElement('div');
          row.className = 'scene-select-row';
          row.onclick = (e) => {
            if (e.target.tagName !== 'INPUT') {
              this.playDetailVideo(url, row);
            }
          };
          row.innerHTML = `
            <div class="scene-left-side">
              <span class="scene-play-icon"><i class="fa-solid fa-circle-play"></i></span>
              <span class="scene-lbl-name">${chineseScenes[key]} (#${i+1})</span>
            </div>
            <input type="checkbox" name="scene-chk" value="${url}" checked onclick="event.stopPropagation();">
          `;
          sceneList.appendChild(row);
        });
      }
    }

    if (count === 0) {
      sceneList.innerHTML = `<div class="text-center text-muted py-3">本商品無可用影片素材</div>`;
    }

    modal.classList.remove('hidden');
    this.dismissGuard();
  }

  closeProductDetailModal() {
    const modal = document.getElementById('product-detail-modal');
    if (modal) modal.classList.add('hidden');
    
    // Stop video playback
    const videoPlayer = document.getElementById('modal-video-player');
    if (videoPlayer) {
      videoPlayer.pause();
      videoPlayer.src = '';
    }
  }

  playDetailVideo(videoUrl, rowElement) {
    const playerBox = document.getElementById('detail-video-player-box');
    const photoEl = document.getElementById('modal-product-photo');
    const videoPlayer = document.getElementById('modal-video-player');
    const wmkOverlay = document.getElementById('video-watermark-overlay');

    // Remove active class from all rows
    const rows = document.querySelectorAll('.scene-select-row');
    rows.forEach(r => r.classList.remove('active'));

    rowElement.classList.add('active');

    // Hide square image, show video player
    photoEl.classList.add('hidden');
    playerBox.classList.remove('hidden');

    videoPlayer.src = videoUrl;
    videoPlayer.play();

    // Custom overlay identity text on player
    if (this.currentUser) {
      const phoneStr = this.currentUser.phone;
      wmkOverlay.innerText = `${this.currentUser.name} (${phoneStr.slice(0,4)}***${phoneStr.slice(-4)}) 安全防護中`;
    }
  }

  // Point deduction implementation (charges 5 points per item download)
  deductCredits() {
    if (!this.currentUser) return false;
    
    if (this.currentUser.role === 'admin') {
      return true; // Admin pays nothing
    }

    if (this.currentUser.role !== 'seller') {
      alert("限帶貨主播會員下載分鏡影片！");
      return false;
    }

    if (this.currentUser.seller_credits < 5) {
      alert("📥 下載失敗：您的積分點數餘額不足！請先儲存至少 5 點積分。");
      this.closeProductDetailModal();
      this.openRechargeModal();
      return false;
    }

    this.currentUser.seller_credits -= 5;
    
    // Save seller credits
    const sellerIdx = this.users.findIndex(u => u.id === this.currentUser.id);
    if (sellerIdx !== -1) {
      this.users[sellerIdx] = this.currentUser;
      this.saveUsers();
    }

    // Reward Creator! 10 downloads = 3 TWD standard, scaled by level!
    const product = this.activeDetailedProduct;
    if (product) {
      const creator = this.users.find(u => u.id === product.creator_id);
      if (creator) {
        // Levels commission structure (LV1 = $0.3 per download, up to LV10 = $1.0 per download)
        const commissionPerDownload = (creator.level * 0.1) + 0.2; 
        creator.balance += commissionPerDownload;
        creator.total_earnings += commissionPerDownload;
        this.saveUsers();

        // Increment download count on product
        product.downloads_count += 1;
        const prodIdx = this.products.findIndex(p => p.id === product.id);
        if (prodIdx !== -1) {
          this.products[prodIdx] = product;
          this.saveProducts();
        }
      }
    }

    this.renderSellerStats();
    this.renderProducts();
    this.triggerCloudSyncToast("扣點下載成功！分成已自動匯入創作者帳戶！");
    return true;
  }

  downloadSelectedScenes() {
    const checkboxes = document.querySelectorAll('input[name="scene-chk"]:checked');
    if (checkboxes.length === 0) {
      alert("請至少勾選一部影片分鏡進行下載！");
      return;
    }

    // Deduct 5 points
    if (!this.deductCredits()) return;

    checkboxes.forEach((cb, index) => {
      const url = cb.value;
      this.triggerBrowserDownload(url, `scene_material_${index + 1}.mp4`);
    });

    alert(`🎉 成功扣除 5 積分！已為您打包下載所選的 ${checkboxes.length} 個分鏡影片。`);
    this.closeProductDetailModal();
  }

  downloadAllScenes() {
    const checkboxes = document.querySelectorAll('input[name="scene-chk"]');
    if (checkboxes.length === 0) {
      alert("本商品無可用影片素材。");
      return;
    }

    // Deduct 5 points
    if (!this.deductCredits()) return;

    checkboxes.forEach((cb, index) => {
      const url = cb.value;
      this.triggerBrowserDownload(url, `scene_complete_material_${index + 1}.mp4`);
    });

    alert(`🎉 成功扣除 5 積分！已打包下載此商品之全部 ${checkboxes.length} 個分鏡素材！`);
    this.closeProductDetailModal();
  }

  triggerBrowserDownload(url, filename) {
    // Standard link download fallback for browser
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // --------------------------------------------------
  // 8. ADMIN BACKEND (Reviews & Payout Controls)
  // --------------------------------------------------
  switchAdminTab(tabId, btnElement) {
    this.adminActiveTab = tabId;

    // Toggle tabs UI
    const btns = document.querySelectorAll('.admin-tab-btn');
    btns.forEach(b => b.classList.remove('active'));
    btnElement.classList.add('active');

    // Toggle content panels
    const panels = ['approve-materials', 'approve-withdrawals', 'users-management'];
    panels.forEach(p => {
      const el = document.getElementById(`admin-tab-${p}`);
      if (el) {
        if (p === tabId) {
          el.classList.remove('hidden');
        } else {
          el.classList.add('hidden');
        }
      }
    });

    this.renderAdminPanels();
  }

  renderAdminPanels() {
    // 1. Pending counts
    const pendingProds = this.products.filter(p => p.status === 'pending');
    const pendingWtd = this.withdrawals.filter(w => w.status === 'pending');

    const mCount = document.getElementById('admin-pending-materials-count');
    const wCount = document.getElementById('admin-pending-withdrawals-count');
    const mBadgeCount = document.getElementById('admin-pending-materials-count');
    const wBadgeCount = document.getElementById('admin-pending-withdrawals-count');

    if (mCount) mCount.innerText = pendingProds.length;
    if (wCount) wCount.innerText = pendingWtd.length;

    // 2. Pending Materials Container
    const matContainer = document.getElementById('admin-pending-materials-container');
    if (matContainer) {
      if (pendingProds.length === 0) {
        matContainer.innerHTML = `<div class="text-center text-muted py-4">目前暫無等待審核的創作者素材 😊</div>`;
      } else {
        matContainer.innerHTML = '';
        pendingProds.forEach(p => {
          const card = document.createElement('div');
          card.className = 'pending-item-card';
          
          let scenesGridHtml = '';
          const chineseScenes = {
            unboxing: "📦 開箱", display: "🔍 展示", effect: "⚡ 效果",
            detail: "💎 細節", usage: "🎥 使用", other: "⚙️ 其他"
          };

          for (const key in chineseScenes) {
            const urls = p.scenes[key] || [];
            if (urls.length > 0) {
              urls.forEach((url, i) => {
                scenesGridHtml += `
                  <div class="admin-scene-player">
                    <span>${chineseScenes[key]} (#${i+1})</span>
                    <video src="${url}" controls oncontextmenu="return false;" controlslist="nodownload"></video>
                  </div>
                `;
              });
            }
          }

          card.innerHTML = `
            <div class="pending-item-header">
              <div class="pending-product-info">
                <div class="pending-product-thumb"><img src="${p.photo_url}"></div>
                <div class="pending-product-meta">
                  <h4>${p.name}</h4>
                  <span>創作者: <b>${p.creator_name}</b> • 提交於: ${new Date(p.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <div class="admin-action-btns">
                <button class="btn btn-sm btn-outline" onclick="app.adminApproveProduct('${p.id}', true)"><i class="fa-solid fa-gem text-amber"></i> 高優質通過</button>
                <button class="btn btn-sm btn-seller" onclick="app.adminApproveProduct('${p.id}', false)"><i class="fa-solid fa-check"></i> 審核通過</button>
                <button class="btn btn-sm btn-outline text-danger" onclick="app.adminRejectProduct('${p.id}')"><i class="fa-solid fa-xmark"></i> 拒絕退回</button>
              </div>
            </div>
            <div class="pending-scenes-admin-grid">${scenesGridHtml}</div>
          `;
          matContainer.appendChild(card);
        });
      }
    }

    // 3. Pending Withdrawals List
    const wtdList = document.getElementById('admin-withdrawals-list');
    if (wtdList) {
      if (pendingWtd.length === 0) {
        wtdList.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-3">目前暫無等待處理的提領款項</td></tr>`;
      } else {
        wtdList.innerHTML = '';
        pendingWtd.forEach(w => {
          const creatorUser = this.users.find(u => u.id === w.creator_id) || {};
          const row = document.createElement('tr');
          row.innerHTML = `
            <td><b>${w.creator_name}</b></td>
            <td>${creatorUser.phone || '無'} / ${creatorUser.email || '無'}</td>
            <td class="fw-bold text-creator">$${w.amount.toFixed(2)}</td>
            <td><code>${w.bank_info}</code></td>
            <td>${new Date(w.created_at).toLocaleString()}</td>
            <td>
              <button class="btn btn-sm btn-seller" onclick="app.adminApproveWithdrawal('${w.id}')"><i class="fa-solid fa-money-bill-wave"></i> 匯款確認通過</button>
              <button class="btn btn-sm btn-outline text-danger" onclick="app.adminRejectWithdrawal('${w.id}')">&times; 駁回</button>
            </td>
          `;
          wtdList.appendChild(row);
        });
      }
    }

    // 4. Users Table (for manual editing/demos)
    const usersList = document.getElementById('admin-users-list');
    if (usersList) {
      usersList.innerHTML = '';
      this.users.forEach(u => {
        const row = document.createElement('tr');
        
        let roleBadge = '';
        if (u.roles) {
          if (u.roles.includes('admin')) {
            roleBadge = `<span class="badge admin-badge"><i class="fa-solid fa-user-gear"></i> 管理員</span>`;
          } else {
            if (u.roles.includes('creator')) {
              roleBadge += `<span class="badge bg-creator" style="margin-right:4px;"><i class="fa-solid fa-video"></i> 創作者</span>`;
            }
            if (u.roles.includes('seller')) {
              roleBadge += `<span class="badge bg-seller"><i class="fa-solid fa-wand-magic-sparkles"></i> 帶貨主播</span>`;
            }
          }
        } else {
          roleBadge = u.role === 'seller' ? `<span class="badge bg-seller"><i class="fa-solid fa-wand-magic-sparkles"></i> 帶貨主播</span>` : `<span class="badge bg-creator"><i class="fa-solid fa-video"></i> 創作者</span>`;
        }

        let balLabel = '';
        if (u.roles && u.roles.includes('creator')) {
          balLabel += `收益: $${u.balance.toFixed(2)} TWD<br>`;
        }
        if (u.roles && u.roles.includes('seller')) {
          balLabel += `積分: ${u.seller_credits} 點`;
        }
        if (!balLabel) {
          balLabel = u.role === 'seller' ? `${u.seller_credits} 積分` : `TWD $${u.balance.toFixed(2)}`;
        }

        let lvlLabel = u.roles && u.roles.includes('creator') ? `LV.${u.level} 分成` : `LV.${u.level} 一般`;

        row.innerHTML = `
          <td><b>${u.name}</b></td>
          <td><code>${u.phone}</code></td>
          <td>${u.email}</td>
          <td>${roleBadge}</td>
          <td class="fw-bold text-center">${balLabel}</td>
          <td>${lvlLabel}</td>
          <td>
            <div style="display:flex; gap:6px;">
              <button class="btn btn-sm btn-outline" onclick="app.adminModifyUserCredits('${u.id}', 1000)">+1000 點</button>
              ${u.role === 'creator' ? `<button class="btn btn-sm btn-outline" onclick="app.adminModifyUserLevel('${u.id}', 1)">升 1 級</button>` : ''}
              ${u.role !== 'admin' ? `<button class="btn btn-sm btn-outline text-danger" onclick="app.adminDeleteUser('${u.id}')"><i class="fa-solid fa-trash-can"></i></button>` : ''}
            </div>
          </td>
        `;
        usersList.appendChild(row);
      });
    }
  }

  adminApproveProduct(productId, isHighQuality = false) {
    const p = this.products.find(x => x.id === productId);
    if (!p) return;

    p.status = 'approved';
    p.is_quality = isHighQuality;

    // Recalculate levels of the creator immediately since they have a new approved product
    const creator = this.users.find(u => u.id === p.creator_id);
    
    this.saveProducts();
    this.recalculateCreatorLevel();
    this.saveUsers();

    this.triggerCloudSyncToast("素材已審核通過上架！");
    alert(`👍 商品素材審核通過！已同步上架至帶貨神器首頁。${isHighQuality ? '已標記為【高品質】！' : ''}`);
    
    this.renderAdminPanels();
    this.renderProducts();
    this.renderCreatorStats();
  }

  adminRejectProduct(productId) {
    const p = this.products.find(x => x.id === productId);
    if (!p) return;

    p.status = 'rejected';
    this.saveProducts();

    this.triggerCloudSyncToast("素材已被駁回退回！");
    alert(`素材已被駁回退回！`);
    
    this.renderAdminPanels();
  }

  adminApproveWithdrawal(withdrawalId) {
    const w = this.withdrawals.find(x => x.id === withdrawalId);
    if (!w) return;

    w.status = 'approved';
    this.saveWithdrawals();

    this.triggerCloudSyncToast("提領申請審核通過！");
    alert(`💰 匯款確認成功！提領案件已結案，系統將自動通知創作者。`);
    
    this.renderAdminPanels();
    this.renderCreatorStats();
  }

  adminRejectWithdrawal(withdrawalId) {
    const w = this.withdrawals.find(x => x.id === withdrawalId);
    if (!w) return;

    w.status = 'rejected';
    
    // Return money to creator available balance
    const creator = this.users.find(u => u.id === w.creator_id);
    if (creator) {
      creator.balance += w.amount;
      this.saveUsers();
    }

    this.saveWithdrawals();

    this.triggerCloudSyncToast("提領已被駁回！");
    alert(`已駁回提領申請，點數已全額退回創作者餘額。`);
    
    this.renderAdminPanels();
    this.renderCreatorStats();
  }

  adminModifyUserCredits(userId, change) {
    const u = this.users.find(x => x.id === userId);
    if (!u) return;

    // If they have seller role, recharge points. Otherwise recharge cash.
    if (u.roles && u.roles.includes('seller')) {
      u.seller_credits += change;
    } else {
      u.balance += change;
    }
    this.saveUsers();
    
    this.triggerCloudSyncToast("使用者帳戶餘額已手動變更完成！");
    this.renderAdminPanels();
    this.renderCreatorStats();
    this.renderSellerStats();
  }

  adminModifyUserLevel(userId, change) {
    const u = this.users.find(x => x.id === userId);
    if (!u) return;

    u.level = Math.min(10, u.level + change);
    this.saveUsers();

    this.triggerCloudSyncToast("創作者等級已手動調整完成！");
    this.renderAdminPanels();
    this.renderCreatorStats();
  }

  adminDeleteUser(userId) {
    if (!confirm("⚠️ 警告：確認要刪除此使用者帳戶？該操作無法復原。")) return;

    this.users = this.users.filter(x => x.id !== userId);
    this.saveUsers();

    this.triggerCloudSyncToast("使用者帳戶已刪除。");
    this.renderAdminPanels();
  }

  // --------------------------------------------------
  // 9. DYNAMIC UTILITIES & DEPLOYMENT TOAST
  // --------------------------------------------------
  triggerCloudSyncToast(msg = "實時雲端資料庫已同步完成") {
    const toast = document.getElementById('cloud-sync-toast');
    if (!toast) return;

    toast.querySelector('span').innerText = msg;
    toast.classList.add('show');
    
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }

  scrollAndFocus(elementId) {
    const el = document.getElementById(elementId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
      // If it's a sidebar accordion or specific section, we can highlight it
      el.style.animation = 'pulseHighlight 1.5s ease-in-out';
      setTimeout(() => el.style.animation = '', 1500);
    }
  }

  toggleAccordion(headerEl) {
    const item = headerEl.parentElement;
    const isActive = item.classList.contains('active');

    // Close all other accordion items
    const items = document.querySelectorAll('.accordion-item');
    items.forEach(it => it.classList.remove('active'));

    if (!isActive) {
      item.classList.add('active');
    }
  }

  // Choose a role card from landing page and trigger auth modal
  selectRoleAndGo(role) {
    this.openAuthModal('register');
    const radio = document.querySelector(`input[name="reg-role"][value="${role}"]`);
    if (radio) {
      radio.checked = true;
    }
  }
}

// Attach to window so event listeners in HTML can trigger methods
window.app = new AppEngine();
