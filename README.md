# 🎬 極致素材交易所 - 影片素材交易與帶貨平台

這是一個專為**手機與電腦跨端開啟**而優化的極簡白淨風格響應式網頁應用程式 (Responsive Web App, SPA)。

本平台為創作者提供了閒置物品拍攝變現的系統，並為帶貨主播（帶貨者）提供了一鍵下載分鏡、通過積分點數交易素材的管道。平台配備了**後台管理審核系統**與**三重嚴格影片安全防屏錄/防盜版機制**。

---

## ✨ 核心特色與亮點

1. **極致簡約白淨美學**：以純白和優雅灰為基調，無邊框圓角卡片與流暢 Hover 動畫，提供頂級的視覺體驗。
2. **行動端 APP 優先優化**：內建專為手機觸控與單手操作設計的「常駐式底部導覽列」，網頁在手機瀏覽器開啟時如同原生 APP 般順滑。
3. **三重影片防盜屏錄保護**：
   - **動態使用者浮水印**：畫面上會隨機浮動半透明的「登入會員姓名+電話號碼」，使截圖或錄影者無法規避責任。
   - **視窗失去焦點自動模糊**：當使用者切換分頁、離開視窗、打開開發者工具 (DevTools) 或按下擷圖快捷鍵時，影片自動暫停並進行高強度高斯模糊。
   - **防右鍵防下載層**：全面禁用右鍵選單、拖拽、複製等功能。
4. **健全的積分與等級分成體系**：
   - **創作者 10 個等級**：依上傳量及高品質量晉升，分成從「10次下載賺 $10 元」階梯式提升至「10次下載賺 $30 元」。
   - **帶貨者儲值扣點**：一鍵模擬儲值方案（2000, 5000送200, 10000送500），下載商品分鏡全套固定扣除 5 點。
5. **即時雲端同步接口**：代碼內預留了 Supabase Serverless 串接，可完美實現手機和電腦的「登入狀態、點數與素材」跨裝置實時同步。

---

## 🚀 快速本地預覽與手機測試

本專案為純前端單頁應用程式 (HTML5 + Vanilla CSS + ES6 JS)，**不需要任何編譯工具與依賴**，可極速啟動！

### 步驟 1：在本機啟動網頁服務
在專案根目錄下，使用您喜歡的任何方式啟動本地 Server。例如使用 Python：
```bash
# 如果是 Python 3
python -m http.server 8000

# 或者使用 Node.js 的 live-server
npm install -g live-server
live-server
```

### 步驟 2：手機連線開啟
1. 確保您的手機與電腦連接在**同一個 Wi-Fi 網絡**下。
2. 在電腦終端機查詢您的本地 IP 位址（Windows 輸入 `ipconfig`，Mac/Linux 輸入 `ifconfig`），例如為 `192.168.1.100`。
3. 用手機瀏覽器輸入 `http://192.168.1.100:8000` 即可直接開啟網頁 APP 進行完整觸控體驗！

---

## 🌐 部署到 Git 與外網網站 (不設定在本機內)

依照您的要求，這套程式可以立刻提交到 Git 並部署至外網伺服器，讓世界各地的人都能用手機直接輸入網址訪問。

### 1. 上傳代碼至您的 Git 倉庫
請在您的 GitHub / GitLab 建立一個新的 Blank Repository，並在電腦終端機運行：
```bash
# 初始化 git 並添加檔案
git init
git add .
git commit -m "feat: 影片素材交易與帶貨平台首發版本"

# 關聯至您的遠端 GitHub 倉庫並推送
git remote add origin <您的遠端倉庫網址, 例如 https://github.com/username/repo.git>
git branch -M main
git push -u origin main
```

### 2. 免費一鍵上線至外網託管平台
本專案為靜態網頁 SPA，極力推薦以下免費的外網託管平台（一鍵連動 Git，每次 Push 自動更新）：

*   **Vercel** (推薦)：
    1. 前往 [Vercel 官網](https://vercel.com/)，註冊/登入您的 GitHub 帳號。
    2. 點擊 "Add New" -> "Project"，選擇您剛才推送的 Git 倉庫。
    3. 點擊 "Deploy" 即可在 10 秒內獲得一個專屬的 `https://xxxx.vercel.app` 免費安全網址，手機可直接訪問！
*   **Netlify**：
    1. 前往 [Netlify 官網](https://www.netlify.com/)，連結 GitHub 導入專案。
    2. 點擊部署，亦可獲得免費二級網址。
*   **GitHub Pages**：
    1. 在 GitHub 倉庫的 "Settings" -> "Pages"。
    2. Build and deployment 選擇 "Deploy from a branch"，分支設定為 `main` 並儲存。
    3. 約 1 分鐘後即可開啟託管網頁。

---

## 🔄 跨裝置實時數據庫同步 (Supabase 串接指引)

為了實現「電腦和手機完美同步登入資訊與點數數據」，我們可以直接使用免費且強大的 **Supabase**。請按照下方步驟，僅需 3 分鐘即可將本網頁升級為「全功能雲端 real-time 同步應用程式」！

### 步驟 1：建立 Supabase 專案
1. 註冊並登入 [Supabase 官網](https://supabase.com/)。
2. 建立一個新專案 (New Project)，設定名稱與資料庫密碼。

### 步驟 2：執行 SQL 建立資料表結構
在 Supabase 控制面板的 **SQL Editor** 中，複製並執行以下程式碼，以建立雲端資料結構：

```sql
-- 1. 會員表
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('creator', 'seller', 'admin')),
  level INT DEFAULT 1,
  balance NUMERIC(12, 2) DEFAULT 0.00,
  total_earnings NUMERIC(12, 2) DEFAULT 0.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. 商品表
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id TEXT NOT NULL,
  creator_name TEXT NOT NULL,
  name TEXT NOT NULL,
  photo_url TEXT NOT NULL, -- Shopee 1:1 base64
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  downloads_count INT DEFAULT 0,
  is_quality BOOLEAN DEFAULT false,
  scenes JSONB DEFAULT '{}'::jsonb, -- 儲存各分鏡影片陣列
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. 提領紀錄表
CREATE TABLE withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id TEXT NOT NULL,
  creator_name TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  bank_info TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
```

### 步驟 3：修改 `app.js` 的 API 密鑰
在 [app.js](file:///c:/Users/baby7/OneDrive/桌面/素材交易所2/app.js) 的第 25-28 行，將您的 Supabase 網址與匿名公鑰替換進去：
```javascript
this.supabaseConfig = {
  url: "https://<您的專案代碼>.supabase.co",
  anonKey: "<您的 Supabase Anon Key>"
};
```
替換後，修改 `app.js` 中的 `loadState`/`saveUsers`/`saveProducts` 等本地 LocalStorage 存取方法，改用標準 `fetch` 或 `@supabase/supabase-js` 客戶端函式庫（專案已內建架構），即可完成全裝置實時連動！
