# CLAUDE.md — taiwan-bird-atlas（台灣賞鳥地圖）

`taiwan-fish-atlas`（魚汛圖鑑）的姊妹專案，主題換成鳥類：動漫風 3D 台灣＋金門、馬祖、澎湖、蘭嶼等離島；41 個賞鳥熱點（賞鳥小屋）依「月份 × 棲地（濕地・海岸／平地・郊山／中高海拔山林）」顯示當月看得到的鳥，鳥在熱點附近依習性走動、浮游、盤旋或跳動；點鳥開圖鑑（**實景照片**＋辨識重點、棲地、行為叫聲、觀察小撇步、出現月曆、哪裡看得到、易混淆種、保育等級）。另有「🔭 賞鳥須知」與熱點卡片的「📌 這裡要注意」。無框架、無建置。2026-10-30 建立。

## 使用者指定的圖鑑規則（重要）
- 圖鑑彈窗的鳥**用實景照片，不用 3D**；照片找不到或載入失敗時**才退回 3D 模型**（`BirdScene.preview`）。
- 照片**只用允許再利用的授權**（CC0／公有領域／CC BY／CC BY-SA），**每張都要標示作者、授權、來源**：彈窗照片下方 `#phCredit`＋`manual.html#photos` 完整清單。不可改用來源不明或「僅供個人使用」的圖。
- `photos.js` 由建置腳本產生：查各物種英文維基條目的代表圖（`prop=pageimages&pilicense=free`）→ Commons `imageinfo extmetadata` 取作者／授權，授權不符就不收。圖直接連 Wikimedia 縮圖（960px，清單卡片換成 330px），**未下載進 repo**；新增鳥種要重跑同樣流程，重產 manual：`python tools/fetch_photos.py`（在本資料夾執行，會覆寫 photos.js）→ `node tools/build_manual.js . tools/manual_tpl.html`。**manual.html 是產出檔，要改說明文字請改 `tools/manual_tpl.html`**。

## 檔案
- `data.js`：`BA.HABITATS / REGIONS / SPOTS / ISLANDS / BIRDS / ETIQUETTE / PEAKS / SHAPES` 全部手寫。鳥 `at:[{h:'wet'|'low'|'mtn', r:'區域代碼', m:'月份區間（可跨年 10-4）', s:'限定熱點（選填）'}]`，`minE/maxE` 在熱點層級用海拔過濾，`hot` 代表熱點，`body`＋`sh` 決定 3D 外型，`c` 為 3D 顏色。`BA.birdsFor(region, hab, month, spotId)` 是唯一查詢入口。**季節分布為一般性參考、保育等級以農業部最新公告為準**，頁面、manual、警語都有註明。改資料後跑覆蓋檢查（每個熱點×其棲地×月份至少一種鳥，目前全滿）。
- `photos.js`：`BA.PHOTOS[id] = {src, file, page, author, license, licenseUrl, article}`。
- `scene.js`：`window.BirdScene`。地形／島嶼／距離場沿用魚汛圖鑑；陸地材質 `habPatch` 依高度打亮目前棲地（濕地 y<.1、平地 .06–.4、山林 >.42，KM=.42 → 1 公里＝.42）。鳥由 `birdParts` 依 `BA.SHAPES` 參數組成（身體＋收合翅膀＋尾巴整組依 tilt 旋轉、頭頸嘴眼冠、腳另一個 mesh、展開翅膀是肩膀樞紐上的平面），動作 `pose`：walk／float／soar／flyLow／hop／perch。內陸濕地熱點自動畫埤塘。3–4 月、9–10 月有「鷹河」（`setHawks`）。
- `app.js`：介面；測試 hook `window.__birdAtlas`（`state/setMonth/setHabitat/selectSpot/selectRegion/openBird/closeBird/listNow/groups3D/scene`）；`BirdScene.stats()`。
- `index.html`：版面、CSS、跑馬燈（共用 Apps Script 端點、滑鼠移入暫停）、PWA。`manual.html`：使用說明＋照片來源清單＋創作者。

## 踩坑
- 左翼是 `scale.z=-1` 的鏡像，拍翅與收合角度要跟右翼反號（`setWings`）。
- `#pv`／`#phImg` 有 `display:block` 會蓋掉 `hidden` 屬性，需要 `[hidden]{display:none!important}`。
- 標籤 `off` 初始必須為 true（沿用魚汛圖鑑的坑）。

## 配套
- ✅ 跑馬燈、manual、使用警語（頁面底部常駐一行＋首訪自動跳「關於／警語」，`birdAtlasSeenWarning`）、創作者資訊、RWD（375px 無橫向捲動）、⚙常用設定（`birdAtlasSettings`：預設棲地、鳥名標籤、動畫、配色、播放速度）、偏好 `birdAtlasPrefs`、PWA（`service-worker.js` network-first，改 js 記得 `CACHE_NAME` +1；`icons/` 用 PIL 自畫）、訪客計數器（`page_id=m255525.taiwanbirdatlas`）
- ❌ 序號授權（不需要）
- ⏳ GitHub Pages：尚未上線（依慣例先本機驗證，上線前先問使用者）；`.github/workflows/deploy-pages.yml` 已備好（`master` 分支）。

## Port／測試
- port **8841**（`.claude/launch.json` 的 `taiwan-bird-atlas`）。
- 驗證：開 `http://127.0.0.1:8841/`，`__birdAtlas.setMonth(12); selectSpot('qigu')` 應有黑面琵鷺；`setMonth(6); selectSpot('hehuan')` 自動切山林、有台灣朱雀與岩鷚；`setMonth(10); selectSpot('sheding')` 有鷹河（`scene.stats().hawks===22`）；`openBird('mikado')` 照片與授權標示正常；把某張 `BA.PHOTOS[id].src` 改成壞網址再開圖鑑應退回 3D。console 無錯誤；375px `scrollWidth===clientWidth`。
