# 🚑 救護知識冒險島（104–114年高級救護技術員考古題闖關練習網站）

本專案為依「學員架站提示詞說明」規格打造的 **高級救護技術員（EMT-P）考古題互動闖關網站**，收錄 104–114 年度共 **916 題** 考古題（其中有效計分題 **876 題**，待確認／送分／缺選項或未附圖題 **40 題**）。

---

## 📂 專案檔案結構

```text
my-quiz-adventure/
├── index.html            # 網站主頁面（闖關首頁、作答區、結算報告、錯題複習本、待確認清單）
├── styles.css            # 明亮像素冒險風響應式樣式表（手機優先、無橫向溢出）
├── app.js                # 遊戲核心邏輯（篩選交集、10顆愛心、第5題寶箱、localStorage錯題本）
├── data/
│   └── questions.json    # 結構化完整題庫 JSON（916 題，含穩定 id、acceptedAnswers、reviewStatus）
├── images/               # 從 Excel 與 PDF 提取之 63 張試題與選項附圖（心電圖、超音波、毒蛇等）
│   ├── 104-107/
│   ├── 108-112/
│   ├── 113/
│   └── 114/
├── docs/                 # 整理完成之 104–114 年各年度 Markdown (.md) 題庫與盤點報告
└── README.md             # 專案說明、本機預覽與 GitHub Pages 部署指南
```

---

## 🎮 遊戲規則與個人特色

1. **年度與章節交集篩選**：
   - 支援 `104-107年`（合併年度）至 `114年` 及 `A-神經/腦/中風` 至 `N-其他` 與 `未分類` 章節自由勾選，即時顯示符合條件的「有效題數」與「待確認題數」。
2. **愛心與計分機制**：
   - 初始 **10 顆愛心**；每題答對 **+100 分**，答錯 **扣 1 顆愛心**（最低為 0）。
   - 遊戲積分與作答正確率（`答對題數 / 已作答題數`）分開獨立呈現。
3. **明確的寶箱獎勵規則**：
   - 每完成一組 **5 題**（第 5、10、15... 題），若該組 **第 5 題答對且愛心 > 0**，即可開啟一次補給寶箱。
   - 寶箱回復機率：**25% 回復 3 顆**、**35% 回復 2 顆**、**30% 回復 1 顆**、**10% 完全補滿**（上限 10 顆）。
4. **個人特色功能 — 錯題複習本（`localStorage`）**：
   - 自動記錄答錯題目的穩定 `id`、最後作答選項與累計錯誤次數。
   - 支援「針對錯題進行闖關複習」、「單題學會移出錯題本」與「一鍵清除全部紀錄（含確認視窗）」。
5. **資料品質控管（待確認清單）**：
   - 官方公告送分題、原始 Excel 缺 `(A)～(D)` 選項文字（4 題）、題幹提及圖片但原檔未附圖（4 題）及未加括號之多答案記法，均標記為 `review_needed`，排除於計分題池外，並可於頂部「🔍 待確認題目」分頁完整檢視。

---

## 💻 如何在本機預覽網站

由於瀏覽器安全限制（CORS），直接雙擊 `index.html`（`file://` 協定）無法透過 `fetch` 載入 `data/questions.json`。請使用本機 HTTP 伺服器預覽：

### 方法 A：使用內建的一鍵啟動腳本（Windows PowerShell）
在本資料夾開啟 PowerShell，執行：
```powershell
powershell -ExecutionPolicy Bypass -File .\start-server.ps1
```
接著開啟瀏覽器前往 `http://localhost:8080` 即可操作！

### 方法 B：使用 VS Code / Antigravity 擴充功能
安裝 **Live Server** 擴充套件，對 `index.html` 按右鍵選擇 **Open with Live Server**。

---

## 🚀 如何部署到 GitHub Pages（免指令網頁上傳教學）

1. 登入您的 [GitHub](https://github.com/) 帳號，點擊右上角 **`+`** → **`New repository`**。
2. **Repository name** 輸入例如 `emt-quiz-adventure`，勾選 **`Public`** 與 **`Add a README file`**，點擊 **`Create repository`**。
3. 進入剛建立好的 Repository 頁面，點擊 **`Add file`** → **`Upload files`**。
4. 打開您電腦上的 `my-quiz-adventure` 資料夾，**全選裡面的檔案與資料夾**（`index.html`、`styles.css`、`app.js`、`data`、`images`、`docs`、`README.md`），直接拖曳到 GitHub 網頁上傳區。
5. 等待檔案上傳進度條跑完後，在頁面下方點擊綠色的 **`Commit changes`** 按鈕。
6. 點擊 Repository 上方選單的 **`Settings`** → 左側選單找到 **`Pages`**。
7. 在 **Build and deployment** 下的 **Branch**，將 `None` 改為 **`main`**（資料夾保持 `/(root)`），點擊 **`Save`**。
8. 等待約 1～2 分鐘後重新整理該頁面，上方就會出現您的專屬網站網址：
   `https://<您的GitHub帳號>.github.io/emt-quiz-adventure/`
