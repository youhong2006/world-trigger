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

- 點擊「開始漫遊」進入街道，WASD／方向鍵移動，按住 Shift 跑步。
- 滑鼠環顧四周；未取得游標鎖定時可按住畫面拖曳。
- **V** 一鍵切換第一／第三人稱；第三人稱可用滾輪調整鏡頭距離。
- **Space** 跳躍，**C** 切換蹲下／站立；蹲下時降低視線並慢行。
- **R** 返回本次漫遊起點；**Esc** 離開漫遊並返回探索介面。
- **Tab** 釋放游標操作下方按鈕；點擊場景繼續環顧。
- 地點卡片切換住宅街、BORDER 本部、河川敷與山丘公園；右上按鈕可切換日夜、合成風聲與城市總覽。
- 角色支援斜向移動、加減速、空中方向微調、落地、緩坡與低路緣；第三人稱鏡頭會避讓牆面。

畫面下方提供視角切換、蹲下與返回起點按鈕，並顯示目前移動狀態。完整操作與移動範圍見 [角色操作說明](docs/player-controls.md)。免費角色模型來源、授權及檔案說明見 [模型授權紀錄](public/models/avatar/ATTRIBUTION.md)。

角色採用 Kay Lousberg 的 [KayKit Adventurers](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0) Rogue 人形（CC0），包含骨架與原生移動、跳躍動畫，蹲下／蹲走以骨架姿勢混合完成。模型約 619 KiB，由本站提供；載入失敗時保留本地骨架人形以繼續操作。

需要支援 WebGL 的瀏覽器與硬體加速；步行操作以桌面鍵盤與滑鼠為主。字型服務不可用時會自動使用系統字型。場景並非原作城市的精確復刻。

## GitHub Pages

部署網址：`https://youhong2006.github.io/world-trigger/`（完成 Pages 部署後才可使用）。

推送至 `main` 會啟動 `.github/workflows/pages.yml`，安裝、建置並部署網站。
儲存庫 Settings → Pages → Build and deployment 的 Source 應為 **GitHub Actions**。
若首次自動啟用 Pages 權限不足，請先在該處選擇 GitHub Actions，再到 Actions 重新執行部署工作流程。
Vite 的 `base` 已設定為 `/world-trigger/`，以正確載入專案網站的資源。

## 大範圍城市配置

城市主要聚落已擴展為約 7 × 6 公里的不規則盆地，以中央 BORDER、向外移動的彎曲河道、三座橋梁、密集住宅區及四周山群為骨架。住宅會逐漸過渡為農地、林地與山坡，整體地形使用一張連續網格，沒有方形城市底板。進入頁面會顯示城市總覽，可拖曳旋轉、滾輪縮放；右上「城市總覽」可隨時返回鳥瞰。建築與樹木使用實例化渲染以減少繪圖呼叫。

[城市配置與推定範圍](docs/city-plan.md) 記錄參考圖的配置、座標與配色，供後續圖片持續校正。

配置與碰撞測試：`node --test src/city-layout.test.js`。

住宅採用日式動畫風格：分層滑窗、瓦屋頂、米白／灰藍／淡綠外牆，以及近景門廊、陽台、雨槽與冷氣外機。房屋長寬在前次放大 35% 後再增加 1.25 倍，人物視線為 1.68 公尺，門高 2.1 公尺，每層樓高 3.3 公尺。「住宅街」提供近距離屋頂預覽與步行入口。

住宅街採連續沿街地塊與背靠背住宅列，核心區填滿可建用地，外緣逐步淡出。住宅巷寬 5 公尺、支路 6 公尺、幹道 12 公尺，兩側有白色邊線；宅前以 3.8 公尺鋪面、低圍牆、植栽、車格與小型車取代大片草坪。房屋及停車設施都有碰撞避讓。

建築比例、街廓密度與碰撞測試：`node --test src/*.test.js`。


移動、鏡頭、街廓與碰撞回歸測試：`npm test`。GitHub Pages 發布前也會執行這些檢查。
