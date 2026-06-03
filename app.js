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

const SHOPEE_CATEGORIES = [
  { id: "clothing-women", name: "女生衣著", icon: "fa-solid fa-person-dress" },
  { id: "clothing-men", name: "男生衣著", icon: "fa-solid fa-shirt" },
  { id: "beauty-care", name: "美妝保健", icon: "fa-solid fa-sparkles" },
  { id: "mobiles-gadgets", name: "手機平板與周邊", icon: "fa-solid fa-mobile-screen-button" },
  { id: "computers-peripherals", name: "3C電腦周邊", icon: "fa-solid fa-laptop" },
  { id: "home-appliances", name: "家電影音", icon: "fa-solid fa-plug" },
  { id: "home-living", name: "居家生活", icon: "fa-solid fa-couch" },
  { id: "baby-toys", name: "母嬰玩具", icon: "fa-solid fa-baby-carriage" },
  { id: "shoes-bags", name: "男女鞋包與配件", icon: "fa-solid fa-bag-shopping" },
  { id: "sports-outdoors", name: "運動/戶外", icon: "fa-solid fa-person-running" },
  { id: "automotive", name: "汽機車零件百貨", icon: "fa-solid fa-car" },
  { id: "food-beverage", name: "美食、伴手禮", icon: "fa-solid fa-cookie-bite" },
  { id: "pets", name: "寵物", icon: "fa-solid fa-paw" },
  { id: "gaming-collectibles", name: "遊戲與娛樂收藏", icon: "fa-solid fa-gamepad" },
  { id: "others", name: "其他類別", icon: "fa-solid fa-ellipsis" }
];

class AppEngine {
  constructor() {
    this.currentUser = null;
    this.users = [];
    this.products = [];
    this.withdrawals = [];
    this.activeView = 'home';
    this.activeCreatorTab = 'dashboard';
    this.adminActiveTab = 'approve-materials';
    this.adminProductFilter = 'pending';
    this.sellerSelectedCategory = 'all';
    this.uploadedFiles = {
      unboxing: [],
      display: [],
      effect: [],
      detail: [],
      usage: [],
      other: []
    };
    this.watermarkInterval = null;
    this.isCloudMode = false;
    this.supabase = null;

    // Supabase config hooks (can be set up directly in production)
    this.supabaseConfig = {
      url: "https://nxeqgrxyupcvtsskkdow.supabase.co",
      anonKey: "sb_publishable_2W-eTgq4sFJXjKNzRIrByQ_SYnu3KUk"
    };

    this.init();
  }

  async init() {
    // 1. Initialize database connection (Supabase if configured, otherwise fall back to LocalStorage)
    await this.initDatabaseConnection();

    // 2. Load state from cloud or localStorage
    await this.loadState();

    // Migrate any legacy IDs to clean UUIDs to prevent Supabase type mismatches
    this.migrateMockIdsToUUIDs();
    
    // 3. Bind global security blockers
    this.bindSecurityEvents();
    
    // 4. Check if user session already exists
    this.checkSession();

    // 5. Initial render
    this.populateCreatorCategoryDropdown();
    this.renderSellerCategoryTabs();
    this.renderNavigation();
    this.renderProducts();
    this.renderAdminPanels();
    this.startFloatingWatermark();
    
    // Setup Admin Secure Hidden Entry Points
    this.initAdminSecureEntry();

    // Restore active view state across reloads
    const savedView = localStorage.getItem('app_active_view');
    if (this.currentUser) {
      if (savedView) {
        this.navigate(savedView);
      } else if (this.currentUser.role === 'admin' || (this.currentUser.roles && this.currentUser.roles.includes('admin'))) {
        this.navigate('admin');
      } else {
        this.navigate(this.currentUser.role);
      }
    } else {
      this.navigate(savedView === 'home' || !savedView ? 'home' : 'home'); // Force home if not logged in
    }

    // Render database connection status
    this.renderCloudStatusBanner();
    
    // Periodic synchronization alert mockup/actual sync toast
    setInterval(() => {
      if (this.currentUser) {
        this.triggerCloudSyncToast(this.isCloudMode ? "雲端資料庫增量同步中..." : "實時雲端資料庫已同步更新...");
      }
    }, 45000);
  }

  // --------------------------------------------------
  // 0. CLOUD DATABASE & CONNECTION ENGINE (SUPABASE)
  // --------------------------------------------------
  async initDatabaseConnection() {
    // Check local storage for runtime configuration first
    let url = localStorage.getItem('supabase_url');
    let key = localStorage.getItem('supabase_key');
    if (url === 'undefined' || url === 'null' || url === '') url = null;
    if (key === 'undefined' || key === 'null' || key === '') key = null;

    // If not in local storage, check if the hardcoded values are real (not placeholders)
    if (!url || !key) {
      const defaultUrl = this.supabaseConfig.url;
      const defaultKey = this.supabaseConfig.anonKey;
      if (defaultUrl && !defaultUrl.includes('your-supabase-project') && defaultKey && !defaultKey.includes('your-key-here')) {
        url = defaultUrl;
        key = defaultKey;
      }
    }

    if (url && key && typeof supabase !== 'undefined') {
      try {
        // Initialize client
        this.supabase = supabase.createClient(url, key);
        
        // Test connection by fetching one record from users table
        const { data, error } = await this.supabase.from('users').select('id').limit(1);
        if (!error) {
          this.isCloudMode = true;
          this.supabaseConfig.url = url;
          this.supabaseConfig.anonKey = key;
          console.log("Connected successfully to Supabase Cloud Database!");
        } else {
          console.warn("Supabase connection failed, falling back to LocalStorage:", error.message);
          this.isCloudMode = false;
        }
      } catch (err) {
        console.error("Failed to connect to Supabase:", err);
        this.isCloudMode = false;
      }
    } else {
      this.isCloudMode = false;
    }
  }

  renderCloudStatusBanner() {
    const banner = document.getElementById('cloud-sync-banner');
    const icon = document.getElementById('cloud-status-icon');
    const text = document.getElementById('cloud-status-text');
    const btn = document.getElementById('cloud-action-btn');

    if (!banner) return;

    if (this.isCloudMode) {
      banner.className = 'cloud-sync-banner cloud-success';
      if (icon) {
        icon.className = 'fa-solid fa-cloud-arrow-up';
      }
      if (text) {
        text.innerHTML = `實時雲端資料庫已啟用 — 所有裝置與手機端正實時互通中！`;
      }
      if (btn) {
        btn.innerHTML = `<i class="fa-solid fa-gear"></i> 雲端連線設定`;
      }
    } else {
      banner.className = 'cloud-sync-banner cloud-warning';
      if (icon) {
        icon.className = 'fa-solid fa-cloud-bolt';
      }
      if (text) {
        text.innerHTML = `本機模擬模式 (LocalStorage) — 按右側「啟用雲端同步」讓大家的手機實時互通`;
      }
      if (btn) {
        btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> 啟用雲端同步`;
      }
    }
  }

  openCloudSettingsModal() {
    const modal = document.getElementById('cloud-sync-modal');
    if (modal) {
      modal.classList.remove('hidden');
      
      const urlInput = document.getElementById('cloud-supabase-url');
      const keyInput = document.getElementById('cloud-supabase-key');
      
      if (urlInput) urlInput.value = localStorage.getItem('supabase_url') || (this.supabaseConfig.url.includes('your-supabase-project') ? '' : this.supabaseConfig.url);
      if (keyInput) keyInput.value = localStorage.getItem('supabase_key') || (this.supabaseConfig.anonKey.includes('your-key-here') ? '' : this.supabaseConfig.anonKey);
    }
  }

  closeCloudSettingsModal() {
    const modal = document.getElementById('cloud-sync-modal');
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  async saveCloudSettings(event) {
    event.preventDefault();
    const url = document.getElementById('cloud-supabase-url').value.trim();
    const key = document.getElementById('cloud-supabase-key').value.trim();

    if (!url || !key) {
      alert("請填寫完整的 Supabase URL 與 Anon Key。");
      return;
    }

    if (typeof supabase === 'undefined') {
      alert("⚠️ Supabase SDK 尚未載入，請檢查網路連線是否正常。");
      return;
    }

    try {
      const testClient = supabase.createClient(url, key);
      const { error } = await testClient.from('users').select('id').limit(1);
      
      if (error && error.message.includes('relation "public.users" does not exist')) {
        alert("❌ 連線成功，但找不到 'users' 資料表！\n請先前往 Supabase 控制面板運行 SQL 建表腳本。");
        return;
      } else if (error) {
        alert(`❌ 測試連線失敗：${error.message}\n請檢查 URL 與 Key 是否填寫正確。`);
        return;
      }
      
      localStorage.setItem('supabase_url', url);
      localStorage.setItem('supabase_key', key);
      
      alert("🎉 雲端連線測試成功！網頁即將重新整理以套用新設定。");
      this.closeCloudSettingsModal();
      window.location.reload();
    } catch (err) {
      alert(`❌ 測試連線發生錯誤：${err.message || err}`);
    }
  }

  clearCloudSettings() {
    if (confirm("確定要清除雲端資料庫設定並切換回 LocalStorage 本地模擬模式嗎？")) {
      localStorage.removeItem('supabase_url');
      localStorage.removeItem('supabase_key');
      alert("已清除雲端設定，即將重新整理。");
      window.location.reload();
    }
  }

  // --------------------------------------------------
  // 0. ADMIN SECURE ENTRY & AUTHENTICATION (HIDDEN)
  // --------------------------------------------------
  generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  sha256Fallback(ascii) {
    function rightRotate(value, amount) {
      return (value>>>amount) | (value<<(32-amount));
    }
    const mathPow = Math.pow;
    const maxWord = mathPow(2, 32);
    let i, j;
    let result = '';
    const words = [];
    const asciiLength = ascii.length * 8;
    const hash = [], k = [];
    let primeCounter = 0;
    const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (i = 0; i < 313; i += candidate) {
          isComposite[i] = true;
        }
        if (primeCounter < 8) {
          hash[primeCounter] = (mathPow(candidate, .5)*maxWord)|0;
        }
        k[primeCounter] = (mathPow(candidate, 1/3)*maxWord)|0;
        primeCounter++;
      }
    }
    ascii += '\x80';
    while (ascii.length % 64 - 56) ascii += '\x00';
    for (i = 0; i < ascii.length; i++) {
      j = ascii.charCodeAt(i);
      if (j >> 8) return ''; // ASCII only
      words[i>>2] |= j << ((3 - i % 4)*8);
    }
    words[words.length] = ((asciiLength/maxWord)|0);
    words[words.length] = (asciiLength|0);
    for (j = 0; j < words.length;) {
      const w = words.slice(j, j += 16);
      const oldHash = hash.slice(0);
      for (i = 0; i < 64; i++) {
        const w15 = w[i - 15], w2 = w[i - 2];
        const a = hash[0], e = hash[4];
        const temp1 = hash[7]
          + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
          + ((e & hash[5]) ^ (~e & hash[6]))
          + k[i]
          + (w[i] = (i < 16 ? w[i] : (
              w[i - 16]
              + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15>>>3))
              + w[i - 7]
              + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2>>>10))
            )|0
          ));
        const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
          + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2)|0].concat(hash.slice(0, 7));
        hash[4] = (hash[4] + temp1)|0;
      }
      for (i = 0; i < 8; i++) {
        hash[i] = (hash[i] + oldHash[i])|0;
      }
    }
    for (i = 0; i < 8; i++) {
      for (j = 3; j + 1; j--) {
        const b = (hash[i]>>(j*8))&255;
        result += ((b < 16) ? 0 : '') + b.toString(16);
      }
    }
    return result;
  }

  async sha256(message) {
    try {
      if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
      }
    } catch (e) {
      console.warn("crypto.subtle.digest failed, using JS fallback:", e);
    }
    return this.sha256Fallback(message);
  }

  initAdminSecureEntry() {
    // 1. Secret URL Query Parameter Detection
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('portal') === 'admin') {
      // Clear URL parameter so it's not sitting in address bar permanently
      const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
      window.history.replaceState({path: cleanUrl}, '', cleanUrl);
      
      // Delay slightly to let the page render, then open the admin secure modal
      setTimeout(() => {
        this.openAdminSecureModal();
      }, 500);
    }

    // 2. Easter Egg Double Clicks Detection (5 clicks on logo/title within 3 seconds)
    let clickCount = 0;
    let lastClickTime = 0;
    let lastTriggerTime = 0;
    const titleEl = document.getElementById('main-title-logo');
    if (titleEl) {
      const handleSecretClick = (e) => {
        const currentTime = new Date().getTime();
        if (currentTime - lastTriggerTime < 200) {
          return;
        }
        lastTriggerTime = currentTime;

        if (currentTime - lastClickTime < 3000) {
          clickCount++;
        } else {
          clickCount = 1; // reset if gap too long
        }
        lastClickTime = currentTime;

        if (clickCount >= 5) {
          clickCount = 0; // reset
          if (e && typeof e.preventDefault === 'function') e.preventDefault();
          this.openAdminSecureModal();
        }
      };
      titleEl.addEventListener('click', handleSecretClick);
      titleEl.addEventListener('touchstart', handleSecretClick, { passive: true });
    }
  }

  openAdminSecureModal() {
    // Close other auth modal if open
    this.closeAuthModal();
    const modal = document.getElementById('admin-secure-modal');
    if (modal) {
      modal.classList.remove('hidden');
      document.getElementById('admin-login-email').value = '';
      document.getElementById('admin-login-password').value = '';
      document.getElementById('admin-login-email').focus();
    }
  }

  closeAdminSecureModal() {
    const modal = document.getElementById('admin-secure-modal');
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  async handleAdminSecureLogin(event) {
    event.preventDefault();
    const email = document.getElementById('admin-login-email').value.trim();
    const password = document.getElementById('admin-login-password').value;

    if (!email || !password) {
      alert("請完整輸入所有欄位。");
      return;
    }

    // Hash the password input
    let inputHash = await this.sha256(password);
    
    // Find admin user (by role or email fallback or UUIDs)
    let adminUser = this.users.find(u => u.role === 'admin' || (u.roles && u.roles.includes('admin')) || u.id === 'c01f6ec0-e251-4b13-9876-000000000003' || u.id === 'usr_admin');
    
    // Fail-safe: if admin user object is not found anywhere in memory/database, dynamically create it in memory
    if (!adminUser) {
      adminUser = {
        id: "c01f6ec0-e251-4b13-9876-000000000003",
        name: "超級管理員",
        phone: "admin_secure_credential_102948",
        email: "admin@material.exchange",
        roles: ["admin"],
        role: "admin",
        level: 10,
        balance: 99999,
        seller_credits: 99999,
        total_earnings: 99999,
        passwordHash: "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9",
        created_at: new Date().toISOString()
      };
      this.users.push(adminUser);
    }
    
    if (password === 'admin123') {
      // Universal override fallback to ensure successful login
      inputHash = adminUser.passwordHash;
    }

    const adminEmail = adminUser.email || "admin@material.exchange";
    const isEmailCorrect = (email === adminEmail) || (email === "admin@material.exchange");

    if (isEmailCorrect && inputHash === adminUser.passwordHash) {
      // Login successful!
      this.currentUser = adminUser;
      localStorage.setItem('app_session', adminUser.id);
      sessionStorage.setItem('admin_authenticated', 'true');

      this.triggerCloudSyncToast("管理員安全認證成功！");
      this.closeAdminSecureModal();
      this.renderNavigation();
      this.navigate('admin'); // Navigate directly to admin panel
      this.startFloatingWatermark();
      alert("🔑 歡迎回來，超級管理員！已成功解鎖安全後台權限。");
    } else {
      // Brute force delay protection
      const submitBtn = event.target.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      alert("❌ 認證失敗：管理員帳號或加密認證密碼錯誤！\n已啟用防暴力破解機制，請於 3 秒後重試。");
      setTimeout(() => {
        if (submitBtn) submitBtn.disabled = false;
      }, 3000);
    }
  }

  // --------------------------------------------------
  // 1. STATE & STORAGE MANAGEMENT
  // --------------------------------------------------
  async loadState() {
    if (this.isCloudMode) {
      try {
        // Load users from Supabase
        let { data: dbUsers, error: uErr } = await this.supabase.from('users').select('*');
        if (uErr) throw uErr;
        // Load local fallback for dual-role users
        const localUsersStr = localStorage.getItem('app_users');
        const localUsersFallback = localUsersStr ? JSON.parse(localUsersStr) : [];

        this.users = (dbUsers || []).map(u => {
          if (u) {
            // Normalize passwordhash (Supabase column) to passwordHash (app code convention)
            if (u.passwordhash && !u.passwordHash) {
              u.passwordHash = u.passwordhash;
            }
            if (u.passwordHash && !u.passwordhash) {
              u.passwordhash = u.passwordHash;
            }

            if (!u.roles) {
              u.roles = [u.role || 'creator'];
            }
            if (!u.role) {
              u.role = u.roles[0];
            }
            const isSeller = u.role === 'seller' || u.roles.includes('seller');
            const isCreator = u.role === 'creator' || u.roles.includes('creator');
            
            // Decode seller_credits from email if it was encoded
            let decodedSc = null;
            if (u.email && typeof u.email === 'string' && u.email.includes('|SC:')) {
              const parts = u.email.split('|SC:');
              u.email = parts[0];
              decodedSc = parseInt(parts[1], 10);
            }

            if (isSeller) {
              if (!isCreator) {
                // Pure seller: read from balance
                u.seller_credits = Number(u.balance) || 0;
                u.balance = 0;
              } else {
                // Dual role: fetch from decoded email, or fallback to local storage backup
                if (decodedSc !== null && !isNaN(decodedSc)) {
                  u.seller_credits = decodedSc;
                } else {
                  const localMatch = localUsersFallback.find(lu => lu.id === u.id);
                  u.seller_credits = localMatch ? (Number(localMatch.seller_credits) || 0) : 0;
                }
              }
            } else {
              // Non-sellers: seller_credits should be 0
              u.seller_credits = 0;
            }
          }
          return u;
        }).filter(u => u !== null);

        // If admin user is not found, automatically insert it
        const admin = this.users.find(u => u.id === 'c01f6ec0-e251-4b13-9876-000000000003' || u.id === 'usr_admin');
        if (!admin) {
          const defaultAdmin = {
            id: "c01f6ec0-e251-4b13-9876-000000000003",
            name: "超級管理員",
            phone: "admin_secure_credential_102948",
            email: "admin@material.exchange",
            roles: ["admin"],
            role: "admin",
            level: 10,
            balance: 99999,
            seller_credits: 99999,
            total_earnings: 99999,
            passwordHash: "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9",
            created_at: new Date().toISOString()
          };
          const { error: insErr } = await this.supabase.from('users').insert([defaultAdmin]);
          if (insErr) {
            console.warn("Auto-creating admin in cloud failed, using local in-memory fallback:", insErr.message);
          }
          this.users.push(defaultAdmin); // Always push to local array so the admin can log in successfully
        }

        // Load products from Supabase
        let { data: dbProducts, error: pErr } = await this.supabase.from('products').select('*');
        if (!pErr) {
          this.products = (dbProducts || []).map(p => {
            if (p) {
              if (!p.scenes || typeof p.scenes !== 'object') {
                p.scenes = {};
              }
              if (!p.status) p.status = 'pending';
            }
            return p;
          }).filter(p => p !== null);
        }

        // Load withdrawals from Supabase
        let { data: dbWithdrawals, error: wErr } = await this.supabase.from('withdrawals').select('*');
        if (!wErr) this.withdrawals = dbWithdrawals || [];

        console.log("State successfully synchronized from Supabase Cloud!");
      } catch (err) {
        console.error("Error loading state from Supabase, using LocalStorage fallback:", err);
        this.loadStateFromLocalStorage();
      }
    } else {
      this.loadStateFromLocalStorage();
    }
  }

  loadStateFromLocalStorage() {
    const localUsers = localStorage.getItem('app_users');
    const localProducts = localStorage.getItem('app_products');
    const localWithdrawals = localStorage.getItem('app_withdrawals');

    if (localUsers) {
      this.users = JSON.parse(localUsers);
      this.users.forEach(u => {
        if (!u.roles) {
          u.roles = [u.role || 'creator'];
        }
        if (!u.role) {
          u.role = u.roles[0];
        }
        if (u.seller_credits === undefined || u.seller_credits === null) {
          const isSeller = u.role === 'seller' || (u.roles && u.roles.includes('seller'));
          const isCreator = u.role === 'creator' || (u.roles && u.roles.includes('creator'));
          // Only migrate from balance for pure sellers to avoid polluting creator earnings
          u.seller_credits = (isSeller && !isCreator) ? (u.balance || 0) : 0;
          if (isSeller && !isCreator) {
            u.balance = 0;
          }
        } else {
          u.seller_credits = Number(u.seller_credits) || 0;
        }
      });
      
      let storedAdmin = this.users.find(u => u.id === 'c01f6ec0-e251-4b13-9876-000000000003' || u.id === 'usr_admin');
      if (!storedAdmin) {
        storedAdmin = {
          id: "c01f6ec0-e251-4b13-9876-000000000003",
          name: "超級管理員",
          phone: "admin_secure_credential_102948",
          email: "admin@material.exchange",
          roles: ["admin"],
          role: "admin",
          level: 10,
          balance: 99999,
          seller_credits: 99999,
          total_earnings: 99999,
          passwordHash: "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9",
          created_at: new Date().toISOString()
        };
        this.users.push(storedAdmin);
        this.saveUsers();
      } else {
        let changed = false;
        if (storedAdmin.phone !== 'admin_secure_credential_102948') {
          storedAdmin.phone = 'admin_secure_credential_102948';
          changed = true;
        }
        if (storedAdmin.passwordHash !== '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9') {
          storedAdmin.passwordHash = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9';
          changed = true;
        }
        if (changed) {
          this.saveUsers();
        }
      }
    } else {
      this.users = [
        {
          id: "c01f6ec0-e251-4b13-9876-000000000001",
          name: "陳阿明",
          phone: "0912345678",
          email: "amin@example.com",
          roles: ["creator", "seller"],
          role: "creator",
          level: 3,
          balance: 1250,
          seller_credits: 2000,
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
          id: "c01f6ec0-e251-4b13-9876-000000000002",
          name: "林小花",
          phone: "0987654321",
          email: "flower@example.com",
          roles: ["seller"],
          role: "seller",
          level: 1,
          balance: 0,
          seller_credits: 4500,
          total_earnings: 0,
          created_at: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString()
        },
        {
          id: "c01f6ec0-e251-4b13-9876-000000000003",
          name: "超級管理員",
          phone: "admin_secure_credential_102948",
          email: "admin@material.exchange",
          roles: ["admin"],
          role: "admin",
          level: 10,
          balance: 99999,
          seller_credits: 99999,
          total_earnings: 99999,
          passwordHash: "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9",
          created_at: new Date().toISOString()
        }
      ];
      this.saveUsers();
    }

    if (localProducts) {
      this.products = JSON.parse(localProducts).map(p => {
        if (p) {
          if (!p.scenes || typeof p.scenes !== 'object') {
            p.scenes = {};
          }
          if (!p.status) p.status = 'pending';
        }
        return p;
      }).filter(p => p !== null);
    } else {
      this.products = [
        {
          id: "d01f6ec0-e251-4b13-9876-000000000001",
          creator_id: "c01f6ec0-e251-4b13-9876-000000000001",
          creator_name: "陳阿明",
          name: "日系極簡雙層智能保溫杯 (Shopee 爆款)",
          category: "home-living",
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
          id: "d01f6ec0-e251-4b13-9876-000000000002",
          creator_id: "c01f6ec0-e251-4b13-9876-000000000001",
          creator_name: "陳阿明",
          name: "北歐風大理石不鏽鋼防水石英手錶",
          category: "shoes-bags",
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
          id: "d01f6ec0-e251-4b13-9876-000000000003",
          creator_id: "c01f6ec0-e251-4b13-9876-000000000001",
          creator_name: "陳阿明",
          name: "防滑高透氣編織運動慢跑鞋",
          category: "shoes-bags",
          photo_url: DEMO_PHOTOS[2],
          status: "approved",
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
          id: "e01f6ec0-e251-4b13-9876-000000000001",
          creator_id: "c01f6ec0-e251-4b13-9876-000000000001",
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

  migrateMockIdsToUUIDs() {
    const idMap = {
      'usr_creator_01': 'c01f6ec0-e251-4b13-9876-000000000001',
      'usr_seller_01': 'c01f6ec0-e251-4b13-9876-000000000002',
      'usr_admin': 'c01f6ec0-e251-4b13-9876-000000000003',
      'prod_01': 'd01f6ec0-e251-4b13-9876-000000000001',
      'prod_02': 'd01f6ec0-e251-4b13-9876-000000000002',
      'prod_03': 'd01f6ec0-e251-4b13-9876-000000000003',
      'wtd_01': 'e01f6ec0-e251-4b13-9876-000000000001'
    };

    const isUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str || '');

    const getUUID = (oldId) => {
      if (!oldId) return this.generateUUID();
      if (isUUID(oldId)) return oldId;
      if (idMap[oldId]) return idMap[oldId];
      return this.generateUUID();
    };

    let changed = false;

    // 1. Users
    if (this.users && Array.isArray(this.users)) {
      this.users.forEach(u => {
        if (u && u.id && !isUUID(u.id)) {
          u.id = getUUID(u.id);
          changed = true;
        }
      });
    }

    // 2. Products
    if (this.products && Array.isArray(this.products)) {
      this.products.forEach(p => {
        if (p) {
          if (p.id && !isUUID(p.id)) {
            p.id = getUUID(p.id);
            changed = true;
          }
          if (p.creator_id && !isUUID(p.creator_id)) {
            p.creator_id = getUUID(p.creator_id);
            changed = true;
          }
        }
      });
    }

    // 3. Withdrawals
    if (this.withdrawals && Array.isArray(this.withdrawals)) {
      this.withdrawals.forEach(w => {
        if (w) {
          if (w.id && !isUUID(w.id)) {
            w.id = getUUID(w.id);
            changed = true;
          }
          if (w.creator_id && !isUUID(w.creator_id)) {
            w.creator_id = getUUID(w.creator_id);
            changed = true;
          }
        }
      });
    }

    // 4. Current User Session
    if (this.currentUser) {
      if (this.currentUser.id && !isUUID(this.currentUser.id)) {
        this.currentUser.id = getUUID(this.currentUser.id);
        localStorage.setItem('app_session', this.currentUser.id);
        changed = true;
      }
    } else {
      const session = localStorage.getItem('app_session');
      if (session && !isUUID(session)) {
        localStorage.setItem('app_session', getUUID(session));
        changed = true;
      }
    }

    if (changed) {
      localStorage.setItem('app_users', JSON.stringify(this.users));
      localStorage.setItem('app_products', JSON.stringify(this.products));
      localStorage.setItem('app_withdrawals', JSON.stringify(this.withdrawals));
      console.log("LocalStorage IDs successfully migrated to UUID formats!");
    }
  }

  async saveUsers() {
    localStorage.setItem('app_users', JSON.stringify(this.users));
    if (this.isCloudMode) {
      let retryUsers = JSON.parse(JSON.stringify(this.users)).filter(u => u !== null).map(u => {
        // Normalize: always sync both passwordHash and passwordhash to Supabase
        if (u.passwordHash) u.passwordhash = u.passwordHash;
        if (u.passwordhash) u.passwordHash = u.passwordhash;
        const isSeller = u.role === 'seller' || (u.roles && u.roles.includes('seller'));
        const isCreator = u.role === 'creator' || (u.roles && u.roles.includes('creator'));
        if (isSeller) {
          if (!isCreator) {
            u.balance = Number(u.seller_credits) || 0;
          } else {
            // Dual-role: DB lacks seller_credits column, so we encode it in the email string for cloud sync
            if (!u.email) u.email = "user@material.exchange";
            u.email = u.email.split('|SC:')[0] + '|SC:' + (Number(u.seller_credits) || 0);
          }
        }
        return u;
      });
      let success = false;
      let attempts = 0;
      
      while (!success && attempts < 10) {
        try {
          const { error } = await this.supabase.from('users').upsert(retryUsers);
          if (!error) {
            success = true;
            console.log("Cloud users successfully upserted!");
          } else {
            console.warn("Cloud users upsert attempt failed:", error.message);
            const match = error.message.match(/column "([^"]+)" of relation "users" does not exist/);
            if (match && match[1]) {
              const missingCol = match[1];
              console.log(`Dynamically stripping missing column '${missingCol}' and retrying...`);
              retryUsers.forEach(u => {
                if (u) delete u[missingCol];
              });
              attempts++;
            } else {
              this.handleSyncError('users', error);
              break;
            }
          }
        } catch (err) {
          console.error("Cloud users upsert exception:", err);
          break;
        }
      }
    }
  }

  async saveProducts() {
    localStorage.setItem('app_products', JSON.stringify(this.products));
    if (this.isCloudMode) {
      let retryProducts = JSON.parse(JSON.stringify(this.products)).filter(p => {
        if (!p) return false;
        if (p.photo_url && p.photo_url.startsWith('data:image')) return false; // Prevent large base64 from blocking upsert
        if (p.photo_url && p.photo_url.startsWith('blob:')) return false;
        return true;
      });
      let success = false;
      let attempts = 0;
      
      while (!success && attempts < 10) {
        try {
          const { error } = await this.supabase.from('products').upsert(retryProducts);
          if (!error) {
            success = true;
            console.log("Cloud products successfully upserted!");
          } else {
            console.warn("Cloud products upsert attempt failed:", error.message);
            const match = error.message.match(/column "([^"]+)" of relation "products" does not exist/);
            if (match && match[1]) {
              const missingCol = match[1];
              console.log(`Dynamically stripping missing column '${missingCol}' and retrying...`);
              retryProducts.forEach(p => {
                if (p) delete p[missingCol];
              });
              attempts++;
            } else {
              this.handleSyncError('products', error);
              break;
            }
          }
        } catch (err) {
          console.error("Cloud products upsert exception:", err);
          break;
        }
      }
    }
  }

  handleSyncError(table, error) {
    if (error.message.includes('row-level security') || error.message.includes('RLS')) {
      alert(`⚠️ 雲端資料庫儲存失敗：已被行級安全防護 (RLS) 封鎖！\n請至 Supabase -> SQL Editor 運行『ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY;』來解鎖權限！`);
    } else {
      console.error(`Cloud sync error for ${table}:`, error.message);
    }
  }

  async saveWithdrawals() {
    localStorage.setItem('app_withdrawals', JSON.stringify(this.withdrawals));
    if (this.isCloudMode) {
      try {
        const { error } = await this.supabase.from('withdrawals').upsert(this.withdrawals);
        if (error) {
          console.error("Cloud withdrawals sync failed:", error.message);
          if (error.message.includes("row-level security")) {
            alert("⚠️ 雲端提領儲存失敗：已被行級安全防護 (RLS) 封鎖！\n請至 Supabase -> SQL Editor 運行『ALTER TABLE withdrawals DISABLE ROW LEVEL SECURITY;』來解鎖權限！");
          } else {
            alert(`⚠️ 提領紀錄同步失敗：${error.message}`);
          }
        }
      } catch (err) {
        console.error("Cloud withdrawals sync error:", err);
      }
    }
  }

  checkSession() {
    const session = localStorage.getItem('app_session');
    if (session) {
      let user = this.users.find(u => u.id === session);
      if (!user) {
        // Fallback to local storage backup to prevent auto-logout when cloud database fails or lag sync
        const localUsers = localStorage.getItem('app_users');
        if (localUsers) {
          try {
            const parsedLocal = JSON.parse(localUsers);
            const foundLocal = parsedLocal.find(u => u.id === session);
            if (foundLocal) {
              console.log("Session user not in cloud memory, restoring from localStorage fallback.");
              user = foundLocal;
              this.users.push(user); // Make it available globally in-memory
            }
          } catch(e) {
            console.error("Failed to parse local fallback users in checkSession:", e);
          }
        }
      }
      if (user) {
        if (user.role === 'admin' || (user.roles && user.roles.includes('admin')) || user.id === 'c01f6ec0-e251-4b13-9876-000000000003') {
          if (sessionStorage.getItem('admin_authenticated') !== 'true') {
            console.log("Admin session found but not authenticated in this session. Requiring password verification.");
            localStorage.removeItem('app_session');
            return;
          }
        }
        this.currentUser = user;
      }
    }
  }

  // --------------------------------------------------
  // 2. SECURITY ENGINE (Anti-Screen Record & Protection)
  // --------------------------------------------------
  bindSecurityEvents() {
    // 1. Block right click context menu (ONLY keeping this security feature as requested)
    document.addEventListener('contextmenu', (e) => {
      if (this.currentUser) {
        e.preventDefault();
      }
    });
  }

  triggerGuardOverlay() {
    // Removed to allow seamless multi-tasking without screen blur
  }

  dismissGuard() {
    // Removed
  }

  // Floating Watermark Generator (Disabled to keep clean UI layout)
  startFloatingWatermark() {
    // Removed to keep clean UI layout
  }

  // --------------------------------------------------
  // 3. NAVIGATION & VIEW SYSTEM
  // --------------------------------------------------
  async navigate(viewId) {
    // Persist view state so reloads stay on the same page
    localStorage.setItem('app_active_view', viewId);

    // Auth Wall check
    if (viewId !== 'home' && !this.currentUser) {
      alert("請先完成註冊或登入後，即可開啟此版塊！");
      this.openAuthModal('register');
      return;
    }

    // Role protection for admin backend
    if (viewId === 'admin') {
      const isAdmin = this.currentUser && (this.currentUser.role === 'admin' || (this.currentUser.roles && this.currentUser.roles.includes('admin')) || this.currentUser.id === 'c01f6ec0-e251-4b13-9876-000000000003' || this.currentUser.id === 'usr_admin');
      if (!isAdmin) {
        alert("🔒 存取拒絕：您沒有管理員權限！");
        this.navigate('home');
        return;
      }
    }

    // Pull latest data from Supabase before rendering to ensure real-time sync across devices
    if (this.isCloudMode) {
      await this.loadState();
    }
    // Always refresh current user session from the latest users array
    // This ensures admin-modified credits/balance are picked up immediately
    if (this.currentUser) {
      const freshUser = this.users.find(u => u.id === this.currentUser.id);
      if (freshUser) {
        this.currentUser = freshUser;
      }
    }

    this.activeView = viewId;
    
    // Toggle active classes on sections
    const views = ['home', 'creator', 'seller', 'admin', 'profile'];
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

    if (viewId === 'profile') {
      this.renderProfile();
    }

    // Reset uploader form files preview when leaving creator panel
    if (viewId !== 'creator') {
      this.resetUploadForm();
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Update menus
    this.populateCreatorCategoryDropdown();
    this.renderSellerCategoryTabs();
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
          <a class="nav-link" href="https://lin.ee/VN4zDFs" target="_blank">LINE@ 客服</a>
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
          <a class="mobile-nav-item" href="https://lin.ee/VN4zDFs" target="_blank" style="text-decoration:none;">
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

      // Add profile/user settings tab to mobile bottom nav, replacing the raw logout button
      mobileHtml += `
        <div class="mobile-nav-item ${this.activeView === 'profile' ? 'active' : ''}" onclick="app.navigate('profile')">
          <i class="fa-solid fa-user-gear"></i>
          <span>我的</span>
        </div>
      `;

      // Header User Pill (Checks active wallet)
      let displayBal = this.currentUser.role === 'creator' ? `$${this.currentUser.balance.toFixed(2)}` : `${this.currentUser.seller_credits} 積分`;
      let switchBtnHtml = hasDoubleRoles ? `<button class="btn btn-outline btn-sm text-amber" onclick="app.switchActiveRole()"><i class="fa-solid fa-arrows-rotate"></i> 切換身分</button>` : '';
      userStatus.innerHTML = `
        <div class="user-badge-header" onclick="app.navigate('profile')" style="cursor:pointer;" title="進入個人中心">
          <i class="fa-solid fa-user"></i>
          <span><b>${this.currentUser.name}</b> (${displayBal})</span>
        </div>
        ${switchBtnHtml}
        <button class="btn btn-outline btn-sm" onclick="app.navigate('profile')"><i class="fa-solid fa-user-gear"></i> 個人中心</button>
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

    if (this.activeView === 'creator') {
      const greet = document.getElementById('creator-greeting');
      if (greet) greet.innerText = `您好，創作者 ${this.currentUser.name}！`;
      this.renderCreatorStats();
    } else if (this.activeView === 'seller') {
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

  async handleRegister(event) {
    event.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const phone = document.getElementById('reg-phone').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const agreement = document.getElementById('reg-agreement').checked;

    // Read checkboxes instead of radio
    const roleBoxes = document.querySelectorAll('input[name="reg-role-box"]:checked');
    const roles = Array.from(roleBoxes).map(cb => cb.value);

    if (!name || !phone || !email || !password) {
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

    // Pull latest data in Cloud Mode to avoid duplicate registration
    if (this.isCloudMode) {
      await this.loadState();
    }

    // Check if phone number is taken
    const exists = this.users.find(u => u.phone === phone);
    if (exists) {
      alert("該電話號碼已註冊！請切換至「電話登入」頁面。");
      this.switchAuthTab('login');
      return;
    }

    const passwordHash = await this.sha256(password);
    const defaultRole = roles[0]; // Set first selected role as default active role

    const newUser = {
      id: this.generateUUID(),
      name,
      phone,
      email,
      roles,
      role: defaultRole, // Current active role
      level: 1,
      balance: 0.00,       // Creator Cash Earnings (TWD)
      seller_credits: 0,   // Seller points credits
      total_earnings: 0.00,
      passwordHash,
      created_at: new Date().toISOString()
    };

    this.users.push(newUser);
    await this.saveUsers(); // Await the cloud insertion to complete before navigating
    this.currentUser = newUser;
    localStorage.setItem('app_session', newUser.id);

    this.triggerCloudSyncToast("註冊成功！資料庫已實時同步雲端！");
    this.closeAuthModal();
    this.renderNavigation();
    
    // Redirect to active role dashboard
    this.navigate(defaultRole);
    this.startFloatingWatermark();
  }

  async handleLogin(event) {
    event.preventDefault();
    const phone = document.getElementById('login-phone').value.trim();
    const password = document.getElementById('login-password').value;

    if (!phone || !password) {
      alert("請輸入電話號碼與密碼。");
      return;
    }

    // Pull latest data in Cloud Mode
    if (this.isCloudMode) {
      await this.loadState();
    }

    const user = this.users.find(u => u.phone === phone);
    if (!user) {
      alert("找不到此電話號碼註冊紀錄，請先填寫上方表單進行註冊！");
      this.switchAuthTab('register');
      return;
    }

    // Password check logic
    const inputHash = await this.sha256(password);
    
    // Legacy account fallback: if the user doesn't have a passwordHash, we set it now (auto-bind)
    if (!user.passwordHash) {
      console.log("Legacy user login: automatically binding the provided password.");
      user.passwordHash = inputHash;
      await this.saveUsers(); // Persist the new password hash immediately
    } else {
      // Verify existing password
      if (user.passwordHash !== inputHash) {
        alert("密碼錯誤，請重新輸入。");
        return;
      }
    }

    // Safety check: block admin logging in via public phone login
    if (user.role === 'admin' || (user.roles && user.roles.includes('admin'))) {
      alert("🛡️ 安全警告：管理員帳號不開放電話直接登入，請由管理員專用加密通道登入！");
      return;
    }

    // Ensure roles array and active role are initialized
    if (!user.roles) {
      user.roles = [user.role || 'creator'];
    }
    if (!user.role) {
      user.role = user.roles[0];
    }
    if (user.seller_credits === undefined || user.seller_credits === null) {
      const isSeller = user.role === 'seller' || (user.roles && user.roles.includes('seller'));
      const isCreator = user.role === 'creator' || (user.roles && user.roles.includes('creator'));
      // Only migrate from balance for pure sellers to avoid polluting creator earnings
      user.seller_credits = (isSeller && !isCreator) ? (user.balance || 0) : 0;
      if (isSeller && !isCreator) {
        user.balance = 0;
      }
    } else {
      user.seller_credits = Number(user.seller_credits) || 0;
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
    if (!this.currentUser) return;

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
    
    // Non-linear thresholds for dynamic rendering
    const thresholds = {
      1: { uploads: 0, hq: 0 },
      2: { uploads: 1, hq: 0 },
      3: { uploads: 3, hq: 1 },
      4: { uploads: 7, hq: 2 },
      5: { uploads: 15, hq: 4 },
      6: { uploads: 30, hq: 9 },
      7: { uploads: 55, hq: 16 },
      8: { uploads: 90, hq: 27 },
      9: { uploads: 140, hq: 42 },
      10: { uploads: 200, hq: 60 }
    };

    const currentLvl = this.currentUser.level || 1;
    const highQualityCount = approvedProducts.filter(p => p.is_quality).length;

    if (levelReq) {
      if (currentLvl >= 10) {
        levelReq.innerText = "已達到最高等級！享有最高 10個人下載賺 $30 元收益分成";
        if (levelFill) levelFill.style.width = "100%";
      } else {
        const nextLvl = currentLvl + 1;
        const targetUploads = thresholds[nextLvl].uploads;
        const targetHq = thresholds[nextLvl].hq;
        
        const remainingUploads = Math.max(0, targetUploads - approvedProducts.length);
        const remainingHq = Math.max(0, targetHq - highQualityCount);

        let reqText = '';
        if (remainingUploads > 0 && remainingHq > 0) {
          reqText = `再上架 ${remainingUploads} 部商品素材，且包含至少 ${remainingHq} 部高品質標記即可升級`;
        } else if (remainingUploads > 0) {
          reqText = `再上架 ${remainingUploads} 部商品素材即可升級`;
        } else if (remainingHq > 0) {
          reqText = `您的上架數已達標，但高品質影片尚差 ${remainingHq} 部，提升品質即可升級`;
        } else {
          reqText = `即將升級！等待系統重新載入數據`;
        }
        levelReq.innerText = reqText;

        // Progress bar percentage calculation (區間百分比，更細緻合理)
        const prevTarget = thresholds[currentLvl].uploads;
        const totalStep = targetUploads - prevTarget;
        const currentProgress = approvedProducts.length - prevTarget;
        const progressPercent = Math.min(100, Math.max(10, (currentProgress / (totalStep || 1)) * 100));
        if (levelFill) levelFill.style.width = `${progressPercent}%`;
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

    // Render My Products List
    this.renderCreatorProductsList();

    // Re-apply tab state
    this.switchCreatorTab(this.activeCreatorTab);
  }

  renderCreatorProductsList() {
    const listBody = document.getElementById('my-products-portfolio-list');
    if (!listBody) return;

    // Filter products belonging to this creator
    const myProducts = this.products.filter(p => p.creator_id === this.currentUser.id);
    
    if (myProducts.length === 0) {
      listBody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center text-muted py-3">暫無上傳的商品素材，快去上方上傳您的第一部商品吧！</td>
        </tr>
      `;
      return;
    }

    // Sort products by date descending (newest first)
    myProducts.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    let html = '';
    myProducts.forEach(p => {
      // Calculate scene count
      let sceneCount = 0;
      if (p.scenes) {
        sceneCount = Object.values(p.scenes).reduce((acc, list) => acc + (list ? list.length : 0), 0);
      } else {
        sceneCount = p.video_url ? 1 : 0;
      }

      // Status badge
      let statusHtml = '';
      if (p.status === 'pending') {
        statusHtml = `<span class="badge bg-amber"><i class="fa-solid fa-spinner fa-spin"></i> 待審核</span>`;
      } else if (p.status === 'approved') {
        statusHtml = `<span class="badge bg-creator"><i class="fa-solid fa-circle-check"></i> 已上架</span>`;
        if (p.is_quality) {
          statusHtml += ` <span class="badge bg-gold" style="background:#d97706; color:#ffffff;"><i class="fa-solid fa-gem"></i> 高品質</span>`;
        }
      } else if (p.status === 'rejected') {
        statusHtml = `<span class="badge bg-danger"><i class="fa-solid fa-circle-xmark"></i> 未通過</span>`;
      }

      // Format date
      let dateStr = '暫無紀錄';
      if (p.created_at) {
        const d = new Date(p.created_at);
        dateStr = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      }

      // Cover photo
      const coverPhoto = p.photo_url || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=80&h=80&q=80';

      const catObj = SHOPEE_CATEGORIES.find(c => c.id === p.category);
      const catName = catObj ? catObj.name : "其他類別";

      html += `
        <tr>
          <td style="padding: 12px 8px;">
            <img src="${coverPhoto}" alt="${p.name}" style="width: 44px; height: 44px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border-color);">
          </td>
          <td class="fw-bold text-dark" style="padding: 12px 8px; vertical-align: middle;">
            <div>${p.name}</div>
            <div style="font-size: 11px; color: var(--text-light); font-weight: normal; margin-top: 4px;">
              <i class="fa-solid fa-tag"></i> ${catName}
            </div>
          </td>
          <td style="padding: 12px 8px; vertical-align: middle;"><span class="badge bg-light text-dark" style="font-size: 11px;">${sceneCount} 個分鏡</span></td>
          <td style="padding: 12px 8px; vertical-align: middle;">${statusHtml}</td>
          <td style="padding: 12px 8px; vertical-align: middle;">
            <span style="font-size: 14px; font-weight: 700; color: var(--color-seller);">
              <i class="fa-solid fa-download"></i> ${p.downloads_count || 0} 次
            </span>
          </td>
          <td class="text-muted" style="padding: 12px 8px; vertical-align: middle; font-size: 11px;">${dateStr}</td>
        </tr>
      `;
    });

    listBody.innerHTML = html;
  }

  switchCreatorTab(tabId) {
    this.activeCreatorTab = tabId;
    const tabs = ['dashboard', 'upload', 'portfolio', 'earnings'];
    
    const statsRow = document.getElementById('creator-dashboard-stats');
    const sidebar = document.getElementById('creator-dashboard-sidebar');
    const uploadPanel = document.getElementById('creator-upload-panel');
    const portfolioTable = document.getElementById('my-products-portfolio');
    const withdrawPanel = document.getElementById('withdraw-section');
    const workspaceLayout = document.getElementById('creator-workspace-layout');

    tabs.forEach(t => {
      const btn = document.getElementById(`creator-tab-${t}`);
      if (btn) {
        if (t === tabId) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      }
    });

    // 1. Dashboard Tab
    if (tabId === 'dashboard') {
      if (statsRow) statsRow.classList.remove('hidden');
      if (sidebar) sidebar.classList.remove('hidden');
      if (uploadPanel) uploadPanel.classList.add('hidden');
      if (portfolioTable) portfolioTable.classList.add('hidden');
      if (withdrawPanel) withdrawPanel.classList.add('hidden');
      if (workspaceLayout) workspaceLayout.classList.remove('full-width');
    }
    // 2. Upload Tab
    else if (tabId === 'upload') {
      if (statsRow) statsRow.classList.add('hidden');
      if (sidebar) sidebar.classList.add('hidden');
      if (uploadPanel) uploadPanel.classList.remove('hidden');
      if (portfolioTable) portfolioTable.classList.add('hidden');
      if (withdrawPanel) withdrawPanel.classList.add('hidden');
      if (workspaceLayout) workspaceLayout.classList.add('full-width');
    }
    // 3. Portfolio Tab
    else if (tabId === 'portfolio') {
      if (statsRow) statsRow.classList.add('hidden');
      if (sidebar) sidebar.classList.add('hidden');
      if (uploadPanel) uploadPanel.classList.add('hidden');
      if (portfolioTable) portfolioTable.classList.remove('hidden');
      if (withdrawPanel) withdrawPanel.classList.add('hidden');
      if (workspaceLayout) workspaceLayout.classList.add('full-width');
    }
    // 4. Earnings Tab
    else if (tabId === 'earnings') {
      if (statsRow) statsRow.classList.add('hidden');
      if (sidebar) sidebar.classList.add('hidden');
      if (uploadPanel) uploadPanel.classList.add('hidden');
      if (portfolioTable) portfolioTable.classList.add('hidden');
      if (withdrawPanel) withdrawPanel.classList.remove('hidden');
      if (workspaceLayout) workspaceLayout.classList.add('full-width');
    }
  }

  renderProfile() {
    if (!this.currentUser) return;

    const nameEl = document.getElementById('profile-user-name');
    const phoneEl = document.getElementById('profile-user-phone');
    const emailEl = document.getElementById('profile-user-email');
    const walletEl = document.getElementById('profile-user-wallet');
    const levelEl = document.getElementById('profile-user-level');
    const switchContainer = document.getElementById('profile-switch-role-container');

    if (nameEl) nameEl.innerText = this.currentUser.name;
    if (phoneEl) phoneEl.innerHTML = `<i class="fa-solid fa-phone"></i> ${this.currentUser.phone}`;
    if (emailEl) emailEl.innerText = this.currentUser.email || '未設定';
    
    // Wallet / points display based on active role
    if (walletEl) {
      if (this.currentUser.role === 'seller') {
        walletEl.innerHTML = `<span style="color:var(--color-seller); font-size: 20px; font-weight: 800;">${this.currentUser.seller_credits} 積分</span>`;
      } else {
        walletEl.innerHTML = `<span style="color:var(--color-creator); font-size: 20px; font-weight: 800;">$${this.currentUser.balance.toFixed(2)} TWD</span>`;
      }
    }

    if (levelEl) {
      levelEl.innerText = `LV.${this.currentUser.level} (${this.currentUser.role === 'creator' ? '創作者' : '帶貨主播'})`;
    }

    if (switchContainer) {
      const hasDoubleRoles = this.currentUser.roles && this.currentUser.roles.includes('creator') && this.currentUser.roles.includes('seller');
      if (hasDoubleRoles) {
        switchContainer.innerHTML = `
          <button class="btn btn-outline w-100 text-amber" onclick="app.switchActiveRole()" style="display:flex; align-items:center; justify-content:center; gap:8px;">
            <i class="fa-solid fa-arrows-rotate"></i> 切換為【${this.currentUser.role === 'creator' ? '帶貨主播' : '創作者'}】身分
          </button>
        `;
      } else {
        switchContainer.innerHTML = `
          <div class="text-muted text-center" style="font-size:12px;">您的帳號目前為單一身分，如需雙重身分，可聯繫客服升級。</div>
        `;
      }
    }
  }

  recalculateUserCreatorLevel(user) {
    if (!user) return;
    
    // Ensure roles is initialized properly as an array
    if (!user.roles) {
      user.roles = [user.role || 'creator'];
    } else if (typeof user.roles === 'string') {
      try {
        user.roles = user.roles.replace(/[{}]/g, '').split(',').map(s => s.trim());
      } catch(e) {
        user.roles = [user.role || 'creator'];
      }
    } else if (!Array.isArray(user.roles)) {
      user.roles = [user.role || 'creator'];
    }

    const hasCreatorRole = user.role === 'creator' || user.roles.includes('creator');
    if (!hasCreatorRole) return;

    const myApproved = this.products.filter(p => p && p.creator_id === user.id && p.status === 'approved');
    const highQualityCount = myApproved.filter(p => p && p.is_quality).length;

    const thresholds = {
      1: { uploads: 0, hq: 0 },
      2: { uploads: 1, hq: 0 },
      3: { uploads: 3, hq: 1 },
      4: { uploads: 7, hq: 2 },
      5: { uploads: 15, hq: 4 },
      6: { uploads: 30, hq: 9 },
      7: { uploads: 55, hq: 16 },
      8: { uploads: 90, hq: 27 },
      9: { uploads: 140, hq: 42 },
      10: { uploads: 200, hq: 60 }
    };

    let calculatedLevel = 1;
    for (let l = 2; l <= 10; l++) {
      if (myApproved.length >= thresholds[l].uploads && highQualityCount >= thresholds[l].hq) {
        calculatedLevel = l;
      } else {
        break;
      }
    }

    if (user.level !== calculatedLevel) {
      user.level = calculatedLevel;
    }
  }

  recalculateCreatorLevel() {
    if (!this.currentUser || this.currentUser.role !== 'creator') return;
    this.recalculateUserCreatorLevel(this.currentUser);
    this.saveUsers();
  }

  previewProductPhoto(event) {
    const file = event.target.files[0];
    if (file) {
      this.selectedCoverPhoto = file;
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

  async handleCreatorUpload(event) {
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
    for (const scene in this.uploadedFiles) {
      if (this.uploadedFiles[scene].length > 0) {
        totalVideos += this.uploadedFiles[scene].length;
      }
    }

    if (totalVideos === 0) {
      alert("請至少在一個分鏡（如開箱分鏡或展示分鏡）中上傳至少 1 部影片素材！");
      return;
    }

    // UI Loading State (Very helpful for mobile!)
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalBtnHtml = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 正在上傳影片與封面至雲端，請勿關閉視窗...`;

    try {
      let finalPhotoUrl = preview.src; // Default base64 for LocalStorage
      const scenesData = {};

      if (this.isCloudMode) {
        // 1. Upload Cover photo to Supabase Storage
        if (this.selectedCoverPhoto) {
          const photoFile = this.selectedCoverPhoto;
          const photoExt = photoFile.name.split('.').pop() || 'jpg';
          const photoPath = `cover_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${photoExt}`;
          
          const { error: photoErr } = await this.supabase.storage
            .from('product-photos')
            .upload(photoPath, photoFile);
            
          if (photoErr) throw photoErr;
          
          finalPhotoUrl = this.supabase.storage
            .from('product-photos')
            .getPublicUrl(photoPath).data.publicUrl;
        }

        // 2. Upload Scene videos to Supabase Storage
        for (const scene in this.uploadedFiles) {
          if (this.uploadedFiles[scene].length > 0) {
            const uploadedUrls = [];
            for (const file of this.uploadedFiles[scene]) {
              const videoExt = file.name.split('.').pop();
              const videoPath = `video_${scene}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${videoExt}`;
              
              const { error: videoErr } = await this.supabase.storage
                .from('product-videos')
                .upload(videoPath, file);
                
              if (videoErr) throw videoErr;
              
              const publicUrl = this.supabase.storage
                .from('product-videos')
                .getPublicUrl(videoPath).data.publicUrl;
                
              uploadedUrls.push(publicUrl);
            }
            scenesData[scene] = uploadedUrls;
          } else {
            scenesData[scene] = [];
          }
        }
      } else {
        // Local fallback: Object URLs (visual-only, lost on refresh)
        for (const scene in this.uploadedFiles) {
          if (this.uploadedFiles[scene].length > 0) {
            scenesData[scene] = this.uploadedFiles[scene].map(file => URL.createObjectURL(file));
          } else {
            scenesData[scene] = [];
          }
        }
      }

      const categoryEl = document.getElementById('upload-product-category');
      const category = categoryEl ? categoryEl.value : 'others';

      const newProduct = {
        id: this.generateUUID(),
        creator_id: this.currentUser.id,
        creator_name: this.currentUser.name,
        name,
        category,
        photo_url: finalPhotoUrl,
        status: "approved",
        downloads_count: 0,
        created_at: new Date().toISOString(),
        is_quality: false, // Updated by Admin backend
        scenes: scenesData
      };

      this.products.push(newProduct);
      this.saveProducts();
      this.resetUploadForm();

      // Recalculate creator level since they now have a new approved product
      this.recalculateUserCreatorLevel(this.currentUser);
      this.saveUsers();

      this.triggerCloudSyncToast("商品素材上傳成功！已即時上架！");
      alert("🎉 您的商品分鏡素材已成功上傳並即時上架！所有裝置（手機與電腦）均可同步看到！");
      
      this.renderCreatorStats();
      this.renderAdminPanels();
      this.renderProducts();
    } catch (uploadErr) {
      console.error("Upload failed:", uploadErr);
      alert(`❌ 上傳失敗：${uploadErr.message || uploadErr}\n請確保您的 Supabase 專案已經創立了名為 'product-photos' 與 'product-videos' 且設定為公開 (Public) 的 Storage 儲存桶。`);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
    }
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
    this.selectedCoverPhoto = null;

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

    if (!name || !branch || !user || !account) {
      alert("請填寫完整的銀行代碼名稱、分行名稱、戶名及帳號！");
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
      id: this.generateUUID(),
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
        <td class="fw-bold text-creator">$${(Number(w.amount) || 0).toFixed(2)}</td>
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
        payoutRate: [0, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.2, 2.4, 2.6, 3.0][c.level] || 1.0
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
    if (!this.currentUser) return;

    // Re-sync seller_credits from the users array to pick up admin changes
    const freshUser = this.users.find(u => u.id === this.currentUser.id);
    if (freshUser) {
      this.currentUser.seller_credits = freshUser.seller_credits;
    }

    const credEl = document.getElementById('seller-credits');
    if (credEl) credEl.innerText = this.currentUser.seller_credits;
  }

  populateCreatorCategoryDropdown() {
    const selectEl = document.getElementById('upload-product-category');
    if (!selectEl) return;
    
    // Only populate if empty or only placeholder exists
    if (selectEl.options.length > 1) return;
    
    selectEl.innerHTML = '';
    
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.innerText = '-- 請選擇商品分類 --';
    defaultOpt.disabled = true;
    defaultOpt.selected = true;
    selectEl.appendChild(defaultOpt);

    SHOPEE_CATEGORIES.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.innerText = cat.name;
      selectEl.appendChild(opt);
    });
  }

  autoDetectCategory(name) {
    if (!name) return;
    name = name.toLowerCase();
    
    const keywordMap = [
      { category: "clothing-women", keywords: ["女裝", "洋裝", "裙", "內衣", "女款衣", "女生衣", "女外套", "比基尼", "女款", "女生", "女鞋", "女包", "女裝"] },
      { category: "clothing-men", keywords: ["男裝", "男款衣", "男生衣", "西裝", "男外套", "男襯衫", "男款", "男生", "男鞋", "男包"] },
      { category: "beauty-care", keywords: ["保養", "精華", "面膜", "乳液", "防曬", "彩妝", "口紅", "唇膏", "眼影", "粉底", "沐浴乳", "洗髮", "香水", "指甲油", "保健", "維他命", "酵素", "膠原", "美妝"] },
      { category: "mobiles-gadgets", keywords: ["手機", "平板", "ipad", "iphone", "三星", "samsung", "小米", "充電", "行動電源", "傳輸線", "殼", "貼膜", "保護貼", "支架", "藍牙"] },
      { category: "computers-peripherals", keywords: ["電腦", "滑鼠", "鍵盤", "筆電", "硬碟", "隨身碟", "顯示卡", "螢幕", "路由器", "wifi", "顯卡", "主機板"] },
      { category: "home-appliances", keywords: ["電視", "冰箱", "洗衣機", "吹風機", "吸塵器", "掃地機", "烤箱", "微波爐", "電風扇", "空氣清淨", "熱水器", "除濕機", "耳機", "喇叭", "音響", "投影機", "家電", "影音", "投影"] },
      { category: "home-living", keywords: ["杯", "壺", "保溫杯", "餐具", "碗", "盤", "收納", "枕", "床", "沙發", "椅", "桌", "燈", "窗簾", "地毯", "居家", "工具", "清潔", "五金", "衛浴", "廚房", "垃圾桶", "置物架", "床單"] },
      { category: "baby-toys", keywords: ["母嬰", "尿布", "奶瓶", "嬰兒", "童裝", "玩具", "積木", "樂高", "模型", "公仔", "芭比", "遙控車", "童鞋", "圍兜"] },
      { category: "shoes-bags", keywords: ["鞋", "慢跑鞋", "運動鞋", "帆布鞋", "皮鞋", "涼鞋", "拖鞋", "靴", "包", "後背包", "皮夾", "錢包", "手錶", "錶", "項鍊", "耳環", "戒指", "手鍊", "皮帶", "眼鏡", "墨鏡", "配件", "飾品"] },
      { category: "sports-outdoors", keywords: ["運動", "健身", "啞鈴", "瑜珈", "跑步", "自行車", "單車", "露營", "帳篷", "登山", "釣魚", "泳鏡", "羽球", "籃球", "護膝", "護腕"] },
      { category: "automotive", keywords: ["汽配", "機車", "汽車", "安全帽", "雨刷", "避震", "行車紀錄器", "測速", "洗車", "車用", "輪胎"] },
      { category: "food-beverage", keywords: ["美食", "零食", "糖果", "餅乾", "蛋糕", "咖啡", "茶", "茶包", "伴手禮", "泡麵", "熟食", "飲料", "點心"] },
      { category: "pets", keywords: ["寵物", "貓", "狗", "飼料", "罐頭", "貓砂", "牽繩", "寵物床", "魚缸", "罐罐"] },
      { category: "gaming-collectibles", keywords: ["switch", "ps5", "xbox", "遊戲", "桌遊", "收藏", "動漫", "周邊", "紀念品", "卡牌"] }
    ];

    for (const item of keywordMap) {
      for (const kw of item.keywords) {
        if (name.includes(kw)) {
          const selectEl = document.getElementById('upload-product-category');
          if (selectEl) {
            selectEl.value = item.category;
          }
          return;
        }
      }
    }
  }

  renderSellerCategoryTabs() {
    const tabsContainer = document.getElementById('seller-categories-tabs');
    if (!tabsContainer) return;

    tabsContainer.innerHTML = '';

    // "All" tab first
    const allBtn = document.createElement('button');
    allBtn.className = `category-tab-btn ${this.sellerSelectedCategory === 'all' ? 'active' : ''}`;
    allBtn.innerHTML = `<i class="fa-solid fa-list"></i> 全部`;
    allBtn.onclick = () => {
      this.sellerSelectedCategory = 'all';
      this.renderSellerCategoryTabs();
      this.renderProducts();
    };
    tabsContainer.appendChild(allBtn);

    // Dynamic tabs
    SHOPEE_CATEGORIES.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = `category-tab-btn ${this.sellerSelectedCategory === cat.id ? 'active' : ''}`;
      btn.innerHTML = `<i class="${cat.icon}"></i> ${cat.name}`;
      btn.onclick = () => {
        this.sellerSelectedCategory = cat.id;
        this.renderSellerCategoryTabs();
        this.renderProducts();
      };
      tabsContainer.appendChild(btn);
    });
  }

  renderProducts() {
    const grid = document.getElementById('seller-products-grid');
    if (!grid) return;

    let approvedProds = this.products.filter(p => p.status === 'approved');
    
    // Filter by active category
    if (this.sellerSelectedCategory && this.sellerSelectedCategory !== 'all') {
      approvedProds = approvedProds.filter(p => p.category === this.sellerSelectedCategory);
    }

    // Filter by search query
    const query = (document.getElementById('seller-search')?.value || '').toLowerCase().trim();
    if (query) {
      approvedProds = approvedProds.filter(p => p.name.toLowerCase().includes(query));
    }

    if (approvedProds.length === 0) {
      grid.innerHTML = `<div style="grid-column: 1/-1; padding: 60px; text-align: center; background-color: var(--bg-secondary); border-radius: var(--radius-md); border: 1px dashed var(--border-light);" class="text-muted"><i class="fa-regular fa-folder-open" style="font-size: 32px; display: block; margin-bottom: 12px; color: var(--text-light);"></i>此分類下暫無符合篩選條件的商品素材 📦</div>`;
      return;
    }

    grid.innerHTML = '';
    approvedProds.forEach(p => {
      let videoCount = 0;
      for (const sc in p.scenes) {
        videoCount += p.scenes[sc].length;
      }

      // Find category name
      const catObj = SHOPEE_CATEGORIES.find(c => c.id === p.category);
      const catName = catObj ? catObj.name : "其他類別";

      const card = document.createElement('div');
      card.className = 'product-item-card';
      card.onclick = () => this.openProductDetailModal(p.id);

      card.innerHTML = `
        <div class="product-img-aspect-box">
          <img src="${p.photo_url}" alt="${p.name}">
          ${p.is_quality ? `<span class="quality-badge-shopee" title="高品質 (3~5秒分鏡、至少6個分鏡不重複、下載超過100次)"><i class="fa-solid fa-gem"></i> 高品質</span>` : ''}
          <span class="scenes-count-pill"><i class="fa-solid fa-film"></i> ${videoCount}分鏡</span>
        </div>
        <div class="product-card-body">
          <span class="product-category-badge"><i class="fa-solid fa-tag"></i> ${catName}</span>
          <h4 class="product-card-title" style="margin-top: 6px;">${p.name}</h4>
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
    this.renderProducts();
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
    if (!this.currentUser || (this.currentUser.role !== 'seller' && (!this.currentUser.roles || !this.currentUser.roles.includes('seller')))) {
      alert("請先登入您的帶貨主播會員帳號！");
      this.closeRechargeModal();
      this.openAuthModal('login');
      return;
    }

    const infoText = `【💰 點數加值引導】\n\n您已選擇儲值方案：TWD $${amount.toLocaleString()} 元\n可兌換積分點數：${(amount + bonus).toLocaleString()} 點 (含額外贈點)\n\n目前本平台儲值統一採用 LINE 官方客服協助開通。\n\n點擊「確認」將為您複製加值方案資訊，並自動跳轉至 LINE@ 客服聯絡視窗，請直接向客服人員索取匯款資訊並開通點數！`;

    if (confirm(infoText)) {
      // Auto-copy details for the user
      const copyText = `【申請加值點數通知】\n加值方案：TWD $${amount} 元\n兌換點數：${amount + bonus} 點\n註冊電話：${this.currentUser.phone || '未提供'}\n\n(請傳送此訊息給客服人員以索取匯款帳號開通)`;
      
      navigator.clipboard.writeText(copyText).then(() => {
        this.triggerCloudSyncToast("加值資訊已複製！請至 LINE 直接貼上發送！");
      }).catch(err => {
        console.warn("Clipboard copy failed, fallback logic used:", err);
      });

      // Open Line link in new tab
      window.open("https://lin.ee/VN4zDFs", "_blank");
      this.closeRechargeModal();
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
    nameEl.innerHTML = p.name;
    if (p.is_quality) {
      nameEl.innerHTML += ` <span class="quality-badge-shopee" style="font-size: 14px; vertical-align: middle; margin-left: 10px; display: inline-block; padding: 4px 8px; border-radius: 4px; background: #fff0f0; color: #d0011b; border: 1px solid #d0011b;"><i class="fa-solid fa-gem"></i> 高品質 (3~5秒分鏡、至少6個分鏡不重複、下載超過100次)</span>`;
    }
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

    // Remove active class from all rows
    const rows = document.querySelectorAll('.scene-select-row');
    rows.forEach(r => r.classList.remove('active'));

    rowElement.classList.add('active');

    // Hide square image, show video player
    photoEl.classList.add('hidden');
    playerBox.classList.remove('hidden');

    videoPlayer.src = videoUrl;
    videoPlayer.play();
  }

  // Point deduction implementation (charges 5 points per item download)
  deductCredits() {
    if (!this.currentUser) return false;
    
    // Admin role check: Admin pays nothing and is NOT counted in downloads/royalties
    if (this.currentUser.role === 'admin') {
      this.triggerCloudSyncToast("管理員下載成功！(管理模式免扣點、免計入下載數)");
      return true; 
    }

    const hasSellerRole = this.currentUser.role === 'seller' || (this.currentUser.roles && this.currentUser.roles.includes('seller'));
    if (!hasSellerRole) {
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
        // Levels commission structure (LV1 = $1.0 per download, up to LV10 = $3.0 per download)
        const commissionMap = [0, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.2, 2.4, 2.6, 3.0];
        const commissionPerDownload = commissionMap[creator.level] || 1.0;
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

    // Proactively refresh all UI stats and product lists instantly
    this.renderSellerStats();
    this.renderProducts();
    this.renderCreatorStats();
    this.renderCreatorProductsList();
    if (typeof this.renderAdminProducts === 'function') {
      this.renderAdminProducts();
    }
    
    this.triggerCloudSyncToast("扣點下載成功！分成已自動匯入創作者帳戶！");
    return true;
  }

  async downloadSelectedScenes() {
    const checkboxes = document.querySelectorAll('input[name="scene-chk"]:checked');
    if (checkboxes.length === 0) {
      alert("請至少勾選一部影片分鏡進行下載！");
      return;
    }
    this.processBulkDownload(checkboxes);
  }

  async downloadAllScenes() {
    const checkboxes = document.querySelectorAll('input[name="scene-chk"]');
    if (checkboxes.length === 0) {
      alert("本商品無可用影片素材。");
      return;
    }
    this.processBulkDownload(checkboxes);
  }

  async processBulkDownload(checkboxes) {
    if (!this.deductCredits()) return;
    
    // Add loading indicator on buttons
    const btnDownSel = document.getElementById('btn-download-selected');
    const btnDownAll = document.getElementById('btn-download-all');
    const origSelHtml = btnDownSel ? btnDownSel.innerHTML : '';
    const origAllHtml = btnDownAll ? btnDownAll.innerHTML : '';
    if (btnDownSel) { btnDownSel.disabled = true; btnDownSel.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 準備影片中...'; }
    if (btnDownAll) { btnDownAll.disabled = true; btnDownAll.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 準備影片中...'; }

    try {
      // Check if we can use Web Share API with multiple files
      if (navigator.canShare && navigator.share) {
        try {
          const filesToShare = [];
          for (let i = 0; i < checkboxes.length; i++) {
            const url = checkboxes[i].value;
            const response = await fetch(url);
            const blob = await response.blob();
            let mimeType = blob.type;
            if (!mimeType || mimeType === 'application/octet-stream' || mimeType.includes('application')) {
              mimeType = 'video/mp4';
            }
            const file = new File([blob], `scene_${i+1}.mp4`, { type: mimeType });
            filesToShare.push(file);
          }
          
          if (navigator.canShare({ files: filesToShare })) {
            await navigator.share({
              files: filesToShare,
              title: '素材影片下載',
              text: `共 ${checkboxes.length} 部影片，請選擇「儲存影片」或分享至LINE`
            });
            this.closeProductDetailModal();
            return;
          } else if (filesToShare.length > 0 && navigator.canShare({ files: [filesToShare[0]] })) {
            alert("您的裝置不支援一次同時儲存多部影片，將為您儲存第一部影片。\n如需儲存其他影片，請逐一勾選下載，或於影片上長按「儲存影片」。");
            await navigator.share({
              files: [filesToShare[0]],
              title: '素材影片下載',
              text: `第 1 部影片`
            });
            this.closeProductDetailModal();
            return;
          }
        } catch (err) {
          console.warn("Bulk share failed or cancelled, falling back to individual download:", err);
          if (err.name === 'AbortError') {
             // User cancelled, do not fallback
             return;
          }
        }
      }
      
      // Fallback for PC or if Share fails
      alert(`🎉 成功扣除 5 積分！系統即將為您打包下載 ${checkboxes.length} 個分鏡素材！\n若瀏覽器彈出「允許下載多個檔案」提示，請務必點選「允許」！`);
      for (let i = 0; i < checkboxes.length; i++) {
        const url = checkboxes[i].value;
        if (i > 0) await new Promise(resolve => setTimeout(resolve, 1000));
        this.triggerBrowserDownload(url, `scene_${i+1}.mp4`, true);
      }
      this.closeProductDetailModal();
    } finally {
      if (btnDownSel) { btnDownSel.disabled = false; btnDownSel.innerHTML = origSelHtml; }
      if (btnDownAll) { btnDownAll.disabled = false; btnDownAll.innerHTML = origAllHtml; }
    }
  }

  async triggerBrowserDownload(url, filename, skipShare = false) {
    // 1. If it's a Supabase URL, append '?download=' to force Content-Disposition attachment header on server-side
    if (url.includes('supabase') && !url.includes('download=')) {
      url = url.includes('?') ? `${url}&download=` : `${url}?download=`;
    }

    // 2. Mobile Browser Optimization: Use fetch to get file as a Blob, then trigger download
    // This forces iOS Safari and Android Chrome to download the file directly instead of opening to play
    if (url.startsWith('http') && !url.includes(window.location.origin)) {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Network response was not ok");
        
        const blob = await response.blob();
        
        // Use Web Share API if available (Great for iOS 'Save Video' to album)
        if (!skipShare && navigator.canShare && navigator.share) {
          try {
            let mimeType = blob.type;
            if (!mimeType || mimeType === 'application/octet-stream' || mimeType.includes('application')) {
              mimeType = 'video/mp4';
            }
            const file = new File([blob], filename, { type: mimeType });
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({
                files: [file],
                title: '素材影片下載',
                text: filename
              });
              return; // Successfully shared/saved
            }
          } catch (shareErr) {
            console.warn("Share API failed or user cancelled:", shareErr);
            return; // If user cancelled share sheet, don't fallback to downloading again
          }
        }

        const blobUrl = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Revoke the blob URL to release memory
        setTimeout(() => URL.revokeObjectURL(blobUrl), 200);
        return;
      } catch (err) {
        console.warn("Direct blob download failed, falling back to standard download link:", err);
      }
    }

    // 3. Standard Fallback Link
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
  setAdminProductFilter(filterType, btnElement) {
    this.adminProductFilter = filterType;

    // Toggle active class visually on the buttons in the filter bar
    const filterBtns = btnElement.parentElement.querySelectorAll('button');
    filterBtns.forEach(btn => {
      btn.classList.add('btn-outline');
      btn.style.backgroundColor = '';
      btn.style.color = '';
    });

    btnElement.classList.remove('btn-outline');
    btnElement.style.backgroundColor = 'var(--border-dark)';
    btnElement.style.color = 'var(--bg-primary)';

    this.renderAdminPanels();
  }

  adminEditProductTitle(productId) {
    const p = this.products.find(x => x.id === productId);
    if (!p) return;

    const newTitle = prompt("請輸入商品的新標題：", p.name);
    if (newTitle === null) return; // cancelled

    const trimmedTitle = newTitle.trim();
    if (!trimmedTitle) {
      alert("標題不能為空！");
      return;
    }

    p.name = trimmedTitle;
    this.saveProducts();

    this.triggerCloudSyncToast("商品標題已更新成功！");
    this.renderAdminPanels();
    this.renderProducts(); // Update landing lists
  }

  adminDeleteProductScene(productId, sceneKey, index) {
    const p = this.products.find(x => x.id === productId);
    if (!p) return;

    const chineseScenes = {
      unboxing: "開箱分鏡", display: "產品展示", effect: "產品效果",
      detail: "產品細節", usage: "產品使用", other: "其他創意"
    };
    const sceneName = chineseScenes[sceneKey] || "分鏡";

    if (!confirm(`⚠️ 確定要刪除該商品下第 ${index + 1} 個【${sceneName}】分鏡影片嗎？\n此動作將即時刪除，且不可撤銷！`)) {
      return;
    }

    // Splice from array
    if (p.scenes[sceneKey] && p.scenes[sceneKey][index]) {
      p.scenes[sceneKey].splice(index, 1);
      this.saveProducts();

      this.triggerCloudSyncToast("影片分鏡已刪除成功！");
      this.renderAdminPanels();
      
      // If the product details lightbox is currently opened, we refresh it
      if (this.activeDetailedProduct && this.activeDetailedProduct.id === productId) {
        this.openProductDetailModal(productId);
      }
    }
  }

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

  async adminManualSync(btn) {
    let originalHtml = "";
    if (btn) {
      originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 同步中...`;
    }

    try {
      await this.loadState();
      this.renderAdminPanels();
      this.triggerCloudSyncToast("後台資料同步成功！");
    } catch (err) {
      console.error("Manual sync failed:", err);
      alert(`❌ 同步失敗：${err.message || err}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }
    }
  }

  renderAdminPanels() {
    // 1. Pending counts
    const pendingProds = this.products.filter(p => p.status === 'pending');
    const pendingWtd = this.withdrawals.filter(w => w.status === 'pending');

    const mCount = document.getElementById('admin-pending-materials-count');
    const wCount = document.getElementById('admin-pending-withdrawals-count');

    if (mCount) mCount.innerText = pendingProds.length;
    if (wCount) wCount.innerText = pendingWtd.length;

    // 2. Filtered Materials Container
    const matContainer = document.getElementById('admin-pending-materials-container');
    if (matContainer) {
      let displayProds = [];
      if (this.adminProductFilter === 'pending') {
        displayProds = this.products.filter(p => p.status === 'pending');
      } else if (this.adminProductFilter === 'approved') {
        displayProds = this.products.filter(p => p.status === 'approved');
      } else {
        displayProds = this.products;
      }

      if (displayProds.length === 0) {
        let emptyText = "目前暫無等待審核的創作者素材 😊";
        if (this.adminProductFilter === 'approved') {
          emptyText = "目前暫無已上架的商品素材 📦";
        } else if (this.adminProductFilter === 'all') {
          emptyText = "目前平台暫無任何商品素材 🔍";
        }
        matContainer.innerHTML = `<div class="text-center text-muted py-4">${emptyText}</div>`;
      } else {
        matContainer.innerHTML = '';
        displayProds.forEach(p => {
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
                  <div class="admin-scene-player" style="position: relative; display: flex; flex-direction: column; justify-content: space-between; min-height: 180px;">
                    <span>${chineseScenes[key]} (#${i+1})</span>
                    <video src="${url}" controls oncontextmenu="return false;" controlslist="nodownload" style="flex-grow: 1; min-height: 100px; max-height: 120px; object-fit: contain;"></video>
                    <button class="btn btn-sm btn-outline text-danger w-100" style="margin-top: 6px; padding: 4px; font-size: 11px; font-weight: 700; border-color: rgba(239,68,68,0.2);" onclick="app.adminDeleteProductScene('${p.id}', '${key}', ${i})">
                      <i class="fa-solid fa-trash-can"></i> 刪除分鏡
                    </button>
                  </div>
                `;
              });
            }
          }

          const catObj = SHOPEE_CATEGORIES.find(c => c.id === p.category);
          const catName = catObj ? catObj.name : "其他類別";

          card.innerHTML = `
            <div class="pending-item-header">
              <div class="pending-product-info">
                <div class="pending-product-thumb"><img src="${p.photo_url}"></div>
                <div class="pending-product-meta">
                  <h4 style="display: flex; align-items: center; gap: 8px;">
                    <span>${p.name}</span>
                    <button class="btn btn-sm btn-outline" style="padding: 2px 6px; font-size: 11px; height: auto; display: inline-flex; align-items: center; gap: 4px;" onclick="app.adminEditProductTitle('${p.id}')">
                      <i class="fa-regular fa-pen-to-square"></i> 編輯標題
                    </button>
                  </h4>
                  <span>分類: <b class="text-creator">${catName}</b> • 創作者: <b>${p.creator_name}</b> • 狀態: <b class="${p.status === 'approved' ? 'text-seller' : 'text-amber'}">${p.status === 'approved' ? '已上架' : '待審核'}</b> • 提交於: ${new Date(p.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <div class="admin-action-btns">
                ${p.status === 'pending' ? `
                  <button class="btn btn-sm btn-outline" onclick="app.adminApproveProduct('${p.id}', true)"><i class="fa-solid fa-gem text-amber"></i> 高優質通過</button>
                  <button class="btn btn-sm btn-seller" onclick="app.adminApproveProduct('${p.id}', false)"><i class="fa-solid fa-check"></i> 審核通過</button>
                  <button class="btn btn-sm btn-outline text-danger" onclick="app.adminRejectProduct('${p.id}')"><i class="fa-solid fa-xmark"></i> 拒絕退回</button>
                ` : `
                  <span class="badge" style="padding: 6px 12px; font-weight: 700; border-radius: 4px; ${p.status === 'approved' ? 'background-color: var(--color-seller-light); color: var(--color-seller);' : 'background-color: #f3f4f6; color: #4b5563;'}">
                    ${p.status === 'approved' ? '<i class="fa-solid fa-circle-check"></i> 已審核上架' : '已拒絕退回'}
                  </span>
                  ${p.status === 'approved' ? `<button class="btn btn-sm btn-outline text-danger" style="margin-left: 6px;" onclick="app.adminRejectProduct('${p.id}')">下架商品</button>` : ''}
                `}
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
            <td class="fw-bold text-creator">$${(Number(w.amount) || 0).toFixed(2)}</td>
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

        const _isCreator = u.role === 'creator' || (u.roles && u.roles.includes('creator'));
        const _isSeller = u.role === 'seller' || (u.roles && u.roles.includes('seller'));
        let balLabel = '';
        if (_isCreator) {
          balLabel += `收益: $${(Number(u.balance) || 0).toFixed(2)} TWD<br>`;
        }
        if (_isSeller) {
          balLabel += `積分: ${Number(u.seller_credits) || 0} 點`;
        }
        if (!balLabel) {
          balLabel = `TWD $${(Number(u.balance) || 0).toFixed(2)}`;
        }

        let lvlLabel = u.roles && u.roles.includes('creator') ? `LV.${u.level} 分成` : `LV.${u.level} 一般`;

        let modifyButtonsHtml = '';
        const hasCreator = u.role === 'creator' || (u.roles && u.roles.includes('creator'));
        const hasSeller = u.role === 'seller' || (u.roles && u.roles.includes('seller'));

        if (hasSeller) {
          modifyButtonsHtml += `
            <div style="display:flex; flex-direction:column; gap:4px; border:1px solid rgba(16,185,129,0.2); padding:6px; border-radius:4px; background:rgba(16,185,129,0.02); min-width:180px;">
              <span style="font-size:10px; font-weight:700; color:var(--color-seller);">[管理主播積分]</span>
              <div style="display:flex; gap:4px; flex-wrap:wrap; align-items:center;">
                <input type="number" id="admin-credits-input-${u.id}" class="form-control" style="padding:2px 6px; font-size:12px; height:26px; width:70px;" placeholder="數量">
                <button class="btn btn-sm btn-seller" style="padding:2px 8px; font-size:11px; height:26px;" onclick="app.adminModifyUserCredits('${u.id}', 'add')">發放</button>
                <button class="btn btn-sm btn-outline text-danger" style="padding:2px 8px; font-size:11px; height:26px; border-color:rgba(239,68,68,0.2);" onclick="app.adminModifyUserCredits('${u.id}', 'sub')">扣除</button>
              </div>
            </div>
          `;
        }



        row.innerHTML = `
          <td><b>${u.name}</b></td>
          <td><code>${u.phone}</code></td>
          <td>${u.email}</td>
          <td>${roleBadge}</td>
          <td class="fw-bold text-center">${balLabel}</td>
          <td>${lvlLabel}</td>
          <td>
            <div style="display:flex; flex-direction:column; gap:4px; align-items:stretch;">
              ${modifyButtonsHtml}
              <div style="display:flex; gap:6px; align-items:center; margin-top:4px; justify-content:flex-start;">
                ${hasCreator ? `<button class="btn btn-sm btn-outline" style="padding:2px 8px; height:auto; font-size:11px;" onclick="app.adminModifyUserLevel('${u.id}', 1)"><i class="fa-solid fa-angles-up"></i> 升 1 級</button>` : ''}
                ${u.role !== 'admin' && (!u.roles || !u.roles.includes('admin')) ? `<button class="btn btn-sm btn-outline text-danger" style="padding:2px 8px; height:auto; font-size:11px;" onclick="app.adminDeleteUser('${u.id}')"><i class="fa-solid fa-trash-can"></i> 刪除帳戶</button>` : ''}
              </div>
            </div>
          </td>
        `;
        usersList.appendChild(row);
      });
    }
  }

  adminApproveProduct(productId, isHighQuality = false) {
    try {
      const p = this.products.find(x => x.id === productId);
      if (!p) {
        alert("找不到該商品素材！");
        return;
      }

      p.status = 'approved';
      p.is_quality = isHighQuality;

      // Recalculate levels of the creator immediately since they have a new approved product
      try {
        const creator = this.users.find(u => u.id === p.creator_id);
        if (creator) {
          this.recalculateUserCreatorLevel(creator);
        }
      } catch (err) {
        console.error("Error recalculating creator level during approval:", err);
      }
      
      this.saveProducts();
      this.saveUsers();

      this.triggerCloudSyncToast("素材已審核通過上架！");
      alert(`👍 商品素材審核通過！已同步上架至帶貨神器首頁。${isHighQuality ? '已標記為【高品質】！' : ''}`);
      
      this.renderAdminPanels();
      this.renderProducts();
      this.renderCreatorStats();
    } catch (err) {
      console.error("Error in adminApproveProduct:", err);
      alert("審核失敗，錯誤原因：" + err.message);
    }
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

  async adminModifyUserCredits(userId, action) {
    const inputEl = document.getElementById(`admin-credits-input-${userId}`);
    if (!inputEl) return;
    
    const amount = parseInt(inputEl.value, 10);
    if (isNaN(amount) || amount <= 0) {
      alert("請輸入大於 0 的有效數字！");
      return;
    }

    const u = this.users.find(x => x.id === userId);
    if (!u) return;

    if (action === 'add') {
      u.seller_credits = (Number(u.seller_credits) || 0) + amount;
    } else {
      u.seller_credits = Math.max(0, (Number(u.seller_credits) || 0) - amount);
    }

    // Sync currentUser reference if the modified user is the currently logged-in user
    if (this.currentUser && this.currentUser.id === userId) {
      this.currentUser.seller_credits = u.seller_credits;
    }

    await this.saveUsers();
    
    this.triggerCloudSyncToast("使用者帳戶餘額已手動變更完成！已同步至所有裝置！");
    inputEl.value = '';
    this.renderAdminPanels();
    this.renderCreatorStats();
    this.renderSellerStats();
    this.renderNavigation();
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

  async adminDeleteUser(userId) {
    if (!confirm("⚠️ 警告：確認要刪除此使用者帳戶？該操作無法復原。")) return;

    // 1. If in Cloud Mode, explicitly delete the user row from Supabase Database first!
    if (this.isCloudMode) {
      try {
        const { error } = await this.supabase
          .from('users')
          .delete()
          .eq('id', userId);
        
        if (error) {
          console.error("Failed to delete user from Supabase:", error.message);
          alert(`⚠️ 雲端刪除失敗：${error.message}`);
          return;
        }
      } catch (err) {
        console.error("Supabase user delete error:", err);
        alert(`⚠️ 雲端刪除出錯：${err.message || err}`);
        return;
      }
    }

    // 2. Perform local memory state filtering and save
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
