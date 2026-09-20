console.log("Typing Recovery loaded!");

function convertToZhuyin(text) {
  return [...text.toLowerCase()]
    .map((char) => {
      return globalThis.ZHUYIN_KEY_MAP[char] ?? char;
    })
    .join("");
}

function isSupportedInput(element) {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  );
}

function recoverCurrentInput(element) {
  const start = element.selectionStart ?? 0;
  const end = element.selectionEnd ?? 0;

  let replaceStart;
  let replaceEnd;

  // 如果使用者有反白文字，就只轉換反白的部分
  if (start !== end) {
    replaceStart = start;
    replaceEnd = end;
  } else {
    // 第一版沒有反白時，直接處理整個輸入框
    replaceStart = 0;
    replaceEnd = element.value.length;
  }

  const originalText = element.value.slice(
    replaceStart,
    replaceEnd
  );

  const recoveredText = convertToZhuyin(originalText);

  element.setRangeText(
    recoveredText,
    replaceStart,
    replaceEnd,
    "end"
  );

  // 告訴網頁：「input 的內容改變了」
  element.dispatchEvent(
    new Event("input", {
      bubbles: true
    })
  );
}

document.addEventListener("keydown", (event) => {
  const isRecoveryShortcut =
    event.ctrlKey &&
    event.shiftKey &&
    event.code === "KeyY";

  if (!isRecoveryShortcut) {
    return;
  }

  const activeElement = document.activeElement;

  if (!isSupportedInput(activeElement)) {
    return;
  }

  event.preventDefault();

  recoverCurrentInput(activeElement);
});