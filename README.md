# 三門市 · Mikado City Explorer

以《境界觸發者》為靈感的非官方原創 3D 城市探索網頁。使用 Three.js 與 Vite，無需 API 金鑰或後端服務。

## 開發

需要 Node.js 22.12+（目前使用 24）。

```sh
npm ci --cache /workspace/.npm-cache
npm run dev -- --port 5173
```

正式建置：`npm run build`。預覽建置：`npm run preview -- --port 4173`。

## 操作

- 點擊「開始漫遊」進入街道，WASD／方向鍵移動，Shift 衝刺。
- 滑鼠環顧四周；未取得游標鎖定時可按住畫面拖曳。
- Esc 返回探索介面。地點卡片切換住宅街、BORDER 本部、河川敷與山丘公園。
- 右上按鈕可切換日夜、合成風聲與重設視角。
- 包含建築碰撞、河流通行限制、橋梁與即時位置小地圖。

需要支援 WebGL 的瀏覽器與硬體加速；步行操作以桌面鍵盤與滑鼠為主。字型服務不可用時會自動使用系統字型。場景並非原作城市的精確復刻。

## GitHub Pages

部署網址：`https://youhong2006.github.io/world-trigger/`（完成 Pages 部署後才可使用）。

推送至 `main` 會啟動 `.github/workflows/pages.yml`，安裝、建置並部署網站。
儲存庫 Settings → Pages → Build and deployment 的 Source 應為 **GitHub Actions**。
若首次自動啟用 Pages 權限不足，請先在該處選擇 GitHub Actions，再到 Actions 重新執行部署工作流程。
Vite 的 `base` 已設定為 `/world-trigger/`，以正確載入專案網站的資源。

## 大範圍城市配置

城市已擴展為約 2.2 × 2.2 公里的場景，以中央 BORDER、前景橫向河流、三座橋梁、密集住宅區及外圍綠丘為骨架。進入頁面會顯示城市總覽，可拖曳旋轉、滾輪縮放；右上「城市總覽」可隨時返回鳥瞰。建築與樹木使用實例化渲染以減少繪圖呼叫。

[城市配置與推定範圍](docs/city-plan.md) 記錄參考圖的配置、座標與配色，供後續圖片持續校正。

配置與碰撞測試：`node --test src/city-layout.test.js`。
