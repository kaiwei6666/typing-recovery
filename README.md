# Typing Recovery

修復忘記切換注音輸入法時打出的英文鍵位。目前完成英文鍵位轉注音，以及第一版音節結構解析；尚未產生中文字候選或自動偵測誤打。

## 在 Chrome 使用

1. 開啟 `chrome://extensions/`，啟用開發人員模式。
2. 載入未封裝項目，選擇包含 `manifest.json` 的專案資料夾。
3. 開啟 `https://www.google.com/` 或 `https://www.google.com.tw/`。
4. 在搜尋框輸入 `su3cl3`，按 `Ctrl+Shift+Y`，結果為 `ㄋㄧˇㄏㄠˇ`。

有反白時只替換選取範圍；沒有反白時處理整個輸入框。更新程式後，需重新載入擴充功能並重新整理 Google 頁面。Chrome 新分頁不在支援範圍內。

## Phase 2：音節解析

依序載入 `src/core/keymap.js` 與 `src/core/syllable-parser.js` 後，可呼叫：

```js
const result = TypingRecovery.parseKeystrokes("su3cl3");
// result.raw: "su3cl3"
// result.zhuyin: "ㄋㄧˇㄏㄠˇ"
// result.syllables.map(s => s.zhuyin): ["ㄋㄧˇ", "ㄏㄠˇ"]
```

解析結果只存在函式回傳值中，不會記錄輸入歷史或傳送至伺服器。頁面的 `recoverCurrentInput()` 也會回傳解析結果。

| 欄位 | 意義 |
| --- | --- |
| `raw` | 原始文字，保留大小寫 |
| `zhuyin` | 鍵位映射後文字，保留空白與未映射字元 |
| `syllables` | 依聲母、介音、韻母順序切分出的暫定音節 |
| `segments` | 所有音節、原樣保留字元及無所屬聲調，依輸入順序排列 |
| `start` / `end` | 原始字串 UTF-16 範圍，end 不含在範圍內 |
| `tone` | 1–5；無法確認時為 `null` |
| `boundary` | `tone`、`space`、`structure`、`literal` 或 `end` |
| `issues` | `missing-tone`、`incomplete-body` 或 `orphan-tone` 等待處理情況 |

第一版規則：

- `6`、`3`、`4`、`7` 分別為二、三、四、輕聲，結束前面的音節。輕聲沿用鍵位輸入順序，顯示在音節後方。
- 半形空白可結束前面的音節並標記一聲；空白仍是獨立 segment，不會從輸出移除。
- 聲母／介音／韻母順序倒退或重複時，切出暫定邊界；未明示的聲調維持未知，不自行補成一聲。
- 不完整的聲母、缺少聲調、孤立聲調都保留並標記。`ㄓㄔㄕㄖㄗㄘㄙ` 可獨立構成音節主體。
- 大寫英文字母可映射，但 `raw` 保留原始大小寫；其他未映射字元原樣保留。

這是**結構解析器**，不是完整合法讀音驗證器。`issues: []` 不保證讀音合法，也不保證使用者原本想打中文；例如一般英文仍會照鍵位映射。缺少聲調與空白時的切分可能有歧義，後續需由合法音節表、字典與候選排序處理。

## 驗證

不需安裝套件，使用 Node.js 22 或以上執行：

```sh
node --test tests/recovery.test.cjs
```

涵蓋音節邊界、聲調、不完整輸入、Unicode、原文重建，以及使用模擬輸入框的快捷鍵整合。模擬測試不能取代 Chrome 實測。

## 接下來

補足合法讀音驗證與歧義處理，再接入繁體中文候選字典。保留原始鍵位及範圍，方便後續選字與局部修正。
