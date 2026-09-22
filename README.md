# Typing Recovery

修復忘記切換注音輸入法時打出的英文鍵位。目前完成英文鍵位轉注音、第一版音節解析、離線單字候選，以及詞彙與詞頻排序。尚未做完整語意理解或自動偵測誤打。

## 在 Chrome 使用

1. 開啟 `chrome://extensions/`，啟用開發人員模式。
2. 載入未封裝項目，選擇包含 `manifest.json` 的專案資料夾。
3. 開啟 `https://www.google.com/` 或 `https://www.google.com.tw/`。
4. 在搜尋框輸入 `su3cl3`，按 `Ctrl+Shift+Y`，結果為 `ㄋㄧˇㄏㄠˇ`。
5. 若要還原成中文，直接對原始鍵位 `su3cl3` 按 `Ctrl+Shift+U`，在候選視窗確認「你好」後點「套用替換」。也可以把「你」改選為「妳」。

兩個快捷鍵是不同入口，不需要先按 Y 再按 U；候選查詢需要原始英文鍵位。有反白時只處理選取範圍；沒有反白時處理整個輸入框。候選視窗按 Esc 或「取消」不會改動原文。

更新程式後，需重新載入擴充功能並重新整理 Google 頁面。Chrome 新分頁不在支援範圍內。支援可編輯的 textarea 與 text/search/url/tel input；密碼、唯讀、停用及不支援文字選取的欄位不處理，輸入法組字中也不觸發。

## Phase 4：詞彙候選與初步排序

`Ctrl+Shift+U` 現在會在逐字選單上方顯示最多五個「建議組合」，並以第一個建議填入預覽。點選建議會同步更新各字選單；也可手動改字、保留原文，或點「恢復逐字預設」回到 Phase 3 的字典順序。所有結果仍需按「套用替換」才會寫入輸入框。

| 原始鍵位 | 首選建議 |
| --- | --- |
| `su3cl3g4ru,4` | 你好世界 |
| `g4ru,4` | 世界 |
| `dl3g4` | 考試 |
| `cl3g4` | 好事 |
| `w961o3g45/4zj3` | 台北市政府 |
| `5j/ jp6` | 中文 |

這讓同樣的 `g4`（ㄕˋ）能在已收錄詞語中對應「世」「試」「事」「市」，不再只取單字表第一個字。仍有可能選錯，請確認預覽。

### 排序方式與範圍

- 離線詞庫包含 103,980 筆詞彙／讀音對應，長度為 2–6 個字，搭配單字與詞彙出現次數。來源、雜湊值與 MIT／libtabe 授權聲明見 [字典來源](third_party/mcbopomofo/README.md)。
- `src/core/ranker.js` 用動態規劃比較不同斷詞及字詞組合，每個位置保留最多五種不同輸出。單字可作為詞庫缺漏時的後備。
- 每個字詞的分數為 `log((count + 1) / total) + (字數 - 1) × log(3)`。`total` 是保留詞彙和單字去重後的加一平滑總數；後項是固定的詞內連續性加分。它是可調整的排序啟發式，不是使用者意圖的可信機率。
- 一般空白、標點、Emoji、原有中文、未收錄或未完成的音節會阻止跨界組詞；只允許跨過已辨識的一聲空白鍵。勾選「保留原始空白」仍會保留顯示中的空白。
- 排序使用**選取範圍內的鍵位音節與詞庫**，不讀取選取範圍外的上下文、不使用 AI 或網路，也不學習個人資料。
- 尚不推測省略的聲調、不改寫 Phase 2 的音節切分；專有名詞、低頻詞或詞庫外用語可能需要逐字修改。一般英文仍可能被當成鍵位解析，請只對想修復的文字手動觸發。
- 詞庫約 4.8 MB，隨 content script 載入；排序最多處理 120 個音節。

核心 API：

```js
const recovery = TypingRecovery.getCandidateRecovery("g4ru,4");
const suggestions = TypingRecovery.rankCandidates(recovery);
// suggestions[0].text === "世界"
// suggestions[0].choices: ["世", "界"]
// suggestions[0].phrases: ["世界"]
// 依原有 composeCandidates() 套用選擇並保留非鍵位字元。
```

## Phase 3：離線中文字候選

新增 `src/core/dictionary.js`、`src/core/candidates.js` 及 `src/candidate-panel.js`，由 manifest 依序載入。

- 字典採用小麥注音單字表的 Big5 漢字子集：1,343 種帶聲調讀音、14,324 筆字候選。來源版本、篩選方式與 MIT 授權保存在 [third_party/mcbopomofo](third_party/mcbopomofo/README.md)。不涵蓋所有罕用字與異體字。
- 依確切聲調查詢，候選依原始字典順序排列；不宣稱第一個候選就是語境中正確的字。
- 查不到候選、音節不完整、缺聲調或孤立聲調都保留原始鍵位。字典缺少某個讀音不代表該讀音必定非法。
- 每個音節都可改選候選或「保留原文」，確認預覽後才替換。
- 一聲必須有半形空白。例如 `5j/ jp6` 可選成「中文」；預設移除已轉換音節的一聲空白鍵。可勾選「保留原始空白」得到「中 文」。多餘空白及其他字元保留。
- 候選視窗一次最多處理 120 個音節；更長輸入請反白分段處理。開啟後若輸入框內容被改動，會拒絕覆蓋並提示重新開啟。
- 字典隨擴充功能載入，查詢不連線、不儲存輸入歷史，不新增網站權限。

核心 API 範例（需先載入 parser、dictionary、candidates）：

```js
const recovery = TypingRecovery.getCandidateRecovery("su3cl3");
// recovery.units[0].candidates 包含「你」「妳」等候選。
TypingRecovery.composeCandidates(recovery, ["妳", "好"]); // "妳好"
TypingRecovery.composeCandidates(recovery, ["", "好"]);   // "su3好"
```

可測試：`su3cl3` → 你好、`5j/ jp6` → 中文、`a87` → 嗎，以及反白部分文字後選字。

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

涵蓋音節邊界、聲調、不完整輸入、Unicode、原文重建、字典查詢、詞彙完整性、同音字排序、不同斷詞比較、候選組合與使用模擬輸入框的快捷鍵整合。

選用的瀏覽器整合測試需 Python 與 Playwright：

```sh
python -m pip install playwright
python -m playwright install chromium
python tests/browser_smoke.py
```

這會在全新的無頭 Chromium 設定檔載入真正的擴充功能，將 Google 網址攔截為本機測試頁，驗證詞彙建議、逐字覆寫及重設、取消、局部替換、游標、空白、過期輸入保護及窄視窗。它不使用你的 Chrome 設定檔，也不依賴 Google 現行版面；Google 真實搜尋框仍需手動驗收。

## 接下來

下一階段可建立誤打偵測與評估資料，區分正常英文、數字和疑似錯誤鍵位，再接即時提示。音節切分歧義、範圍外上下文排序、個人化仍待後續處理；目前不會自動改動輸入。
