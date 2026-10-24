# 版本備份與修正紀錄

## 版本規則

依使用者指示，以 **V1.0.0** 保存目前遊戲；每完成並交付一次修正，增加最後一段：**V1.0.1 → V1.0.2 → V1.0.3**。這項規則也記錄於根目錄 `AGENTS.md`，供後續開發沿用。

版本標籤使用大寫 `V`；npm 套件版本不含 `V`。已發布的標籤不移動，保留每一版程式、素材及文件快照。GitHub Pages 顯示最新部署，舊版程式由標籤取得。

| 版本 | 日期（台灣） | 遊戲提交 | 內容 |
| --- | --- | --- | --- |
| [V1.0.2](https://github.com/youhong2006/world-trigger/tree/V1.0.2) | 2026-10-24 | 以 `V1.0.2` 標籤為準 | 恢復主世界開放中庭與原本外觀；室內設施仍在獨立基地世界，保留正門傳送。 |
| [V1.0.1](https://github.com/youhong2006/world-trigger/tree/V1.0.1) | 2026-10-24 | 以 `V1.0.1` 標籤為準 | 城市基地改為實心，正門雙向傳送至獨立 BORDER 世界；重要設施、專用碰撞、電梯及 SIM-01 保留。 |
| [V1.0.0](https://github.com/youhong2006/world-trigger/tree/V1.0.0) | 2026-10-24 | `505ce6c3192da3e7c544a5d7bb554738a9ba78d0` | 初始備份；包含單一大型地下機庫、特殊設施、四處獨立交通核心、中文導覽、問題位置紀錄與網格訓練場。159 項測試及瀏覽器操作檢查通過。 |

[下載最新 V1.0.2 ZIP](https://github.com/youhong2006/world-trigger/archive/refs/tags/V1.0.2.zip)；[下載 V1.0.0 ZIP](https://github.com/youhong2006/world-trigger/archive/refs/tags/V1.0.0.zip)。下載後依 README 安裝依賴及啟動。

## 下次修正的發布方式

1. 核對 GitHub 最新版本；下一版預定為 `V1.0.3`。
2. 完成修正，同步更新 `package.json` 及 `package-lock.json` 的套件版本，並在上表新增紀錄。
3. 完成相關驗證，提交程式後建立對應附註標籤，例如 `git tag -a V1.0.3 -m "V1.0.3: 修正內容"`。
4. 上傳提交與標籤，確認 GitHub 備份存在；若有更新網站，再確認 Pages 部署結果。

本次版本規則文件是後補的管理紀錄；`V1.0.0` 直接指向已驗證的遊戲提交 `505ce6c`。
