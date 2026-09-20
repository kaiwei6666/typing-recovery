console.log("Typing Recovery loaded!");

function convertToZhuyin(text) {
  return globalThis.TypingRecovery.parseKeystrokes(text).zhuyin;
}

function isSupportedInput(element) {
  return (
    (element instanceof HTMLTextAreaElement ||
      (element instanceof HTMLInputElement &&
        ["text", "search", "url", "tel"].includes(element.type))) &&
    !element.readOnly && !element.disabled
  );
}

function captureInput(element) {
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

  return { value: element.value, start: replaceStart, end: replaceEnd,
    raw: element.value.slice(replaceStart, replaceEnd) };
}

function replaceInput(element, snapshot, text) {
  if (!element.isConnected || !isSupportedInput(element) || element.value !== snapshot.value) return false;

  element.setRangeText(
    text,
    snapshot.start,
    snapshot.end,
    "end"
  );

  // 告訴網頁：「input 的內容改變了」
  element.dispatchEvent(
    new Event("input", {
      bubbles: true
    })
  );

  return true;
}

function recoverCurrentInput(element) {
  const snapshot = captureInput(element);
  const recovery = globalThis.TypingRecovery.parseKeystrokes(snapshot.raw);
  replaceInput(element, snapshot, recovery.zhuyin);
  return recovery;
}

document.addEventListener("keydown", (event) => {
  const isRecoveryShortcut =
    event.ctrlKey &&
    event.shiftKey &&
    !event.altKey && !event.metaKey &&
    (event.code === "KeyY" || event.code === "KeyU");

  if (!isRecoveryShortcut || event.isComposing || event.repeat) {
    return;
  }

  const activeElement = document.activeElement;

  if (!isSupportedInput(activeElement)) {
    return;
  }

  event.preventDefault();

  if (event.code === "KeyY") {
    recoverCurrentInput(activeElement);
  } else {
    const snapshot = captureInput(activeElement);
    globalThis.TypingRecoveryUI.openCandidatePanel(activeElement, snapshot,
      (text) => replaceInput(activeElement, snapshot, text));
  }
});
