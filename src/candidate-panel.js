(() => {
  let closeActive = null;

  function openCandidatePanel(element, snapshot, apply) {
    if (closeActive) closeActive();
    const host = document.createElement("div");
    host.id = "typing-recovery-panel";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; }
      dialog { box-sizing: border-box; width: min(560px, calc(100vw - 32px));
        max-height: calc(100dvh - 40px); overflow: auto; border: 1px solid #cbd5e1;
        border-radius: 16px; padding: 24px; color: #172033; background: #fff;
        font: 15px/1.6 system-ui, sans-serif; box-shadow: 0 18px 60px #0f172a40; }
      dialog::backdrop { background: #0f172a55; }
      h2 { margin: 0 0 4px; font-size: 22px; }
      p { margin: 8px 0 16px; color: #475569; }
      .source, output { display: block; white-space: pre-wrap; overflow-wrap: anywhere;
        border-radius: 8px; padding: 12px; background: #f1f5f9; margin: 8px 0 16px; }
      output { background: #eef2ff; font-size: 22px; color: #312e81; }
      .row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 12px; align-items: center; padding: 10px 0; border-bottom: 1px solid #e2e8f0; }
      .row label { overflow-wrap: anywhere; }
      select { width: 100%; padding: 8px; font: inherit; color: #172033;
        background: white; border: 1px solid #94a3b8; border-radius: 6px; }
      .option { display: block; margin: 16px 0; }
      .actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px;
        position: sticky; bottom: -24px; padding: 14px 0; background: white;
        border-top: 1px solid #e2e8f0; }
      button { font: inherit; padding: 8px 18px; border-radius: 8px;
        border: 1px solid #94a3b8; background: white; color: #172033; cursor: pointer; }
      button.primary { background: #4338ca; border-color: #4338ca; color: white; }
      button:disabled { opacity: .45; cursor: default; }
      .suggestions { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; }
      .suggestions button { max-width: 100%; text-align: left; overflow-wrap: anywhere; }
      .suggestions button[aria-pressed="true"] { border-color: #4338ca; background: #eef2ff; color: #312e81; }
      .phrase-note { margin-bottom: 12px; }
      :focus-visible { outline: 3px solid #818cf8; outline-offset: 3px; }
      .status { color: #9a3412; }
      small { color: #64748b; display: block; }
    `;
    const dialog = document.createElement("dialog");
    dialog.setAttribute("aria-labelledby", "candidate-title");
    dialog.setAttribute("aria-describedby", "candidate-help");
    function make(tag, text, parent = dialog, className) {
      const node = document.createElement(tag);
      if (text !== undefined) node.textContent = text;
      if (className) node.className = className;
      parent.append(node);
      return node;
    }
    make("h2", "選擇中文字").id = "candidate-title";
    make("p", "先選擇建議組合，也可逐字調整。建議依離線詞庫與詞頻排序，請確認預覽後再替換。").id = "candidate-help";
    make("div", snapshot.raw, dialog, "source").setAttribute("aria-label", "原始文字");
    const status = make("p", "", dialog, "status");
    status.setAttribute("role", "status");
    const recovery = globalThis.TypingRecovery.getCandidateRecovery(snapshot.raw);
    const tooLong = recovery.units.length > 120;
    const suggestions = tooLong ? [] : globalThis.TypingRecovery.rankCandidates(recovery);
    const originalChoices = recovery.units.map((unit) => unit.candidates[0] ?? "");
    const choices = [...(suggestions[0]?.choices ?? originalChoices)];
    const selects = [];
    const suggestionButtons = [];
    let phraseNote;
    if (suggestions.length) {
      make("strong", "建議組合");
      const group = make("div", undefined, dialog, "suggestions");
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", "建議組合");
      for (const suggestion of suggestions) {
        const button = make("button", suggestion.text, group);
        button.type = "button";
        button.addEventListener("click", () => choose(suggestion.choices));
        suggestionButtons.push(button);
      }
      phraseNote = make("small", "", dialog, "phrase-note");
      const reset = make("button", "恢復逐字預設", dialog);
      reset.type = "button";
      reset.addEventListener("click", () => choose(originalChoices));
    }

    function choose(nextChoices) {
      choices.splice(0, choices.length, ...nextChoices);
      selects.forEach((select, index) => { select.value = choices[index]; });
      updatePreview();
    }
    const reasons = {
      "missing-tone": "缺少聲調；一聲請加半形空白",
      "incomplete-body": "音節尚未完整",
      "unlisted-reading": "字典未收錄此讀音",
    };
    if (!tooLong) {
      recovery.units.forEach((unit, index) => {
        const row = make("div", undefined, dialog, "row");
        const label = make("label", `${unit.zhuyin} · ${unit.raw}`, row);
        label.htmlFor = `candidate-${index}`;
        if (unit.status !== "ready") make("small", reasons[unit.status], label);
        const select = make("select", undefined, row);
        select.id = label.htmlFor;
        const original = make("option", `保留原文：${unit.raw}`, select);
        original.value = "";
        for (const candidate of unit.candidates) {
          make("option", candidate, select).value = candidate;
        }
        select.value = choices[index];
        selects.push(select);
        select.addEventListener("change", () => {
          choices[index] = select.value;
          updatePreview();
        });
      });
    }
    const spaceLabel = make("label", undefined, dialog, "option");
    const preserveSpaces = make("input", undefined, spaceLabel);
    preserveSpaces.type = "checkbox";
    spaceLabel.append(document.createTextNode(" 保留原始空白（未勾選時移除已轉換音節的一聲空白鍵）"));
    preserveSpaces.addEventListener("change", () => updatePreview());
    make("strong", "替換預覽");
    const preview = make("output", "");
    preview.setAttribute("aria-live", "polite");
    const actions = make("div", undefined, dialog, "actions");
    const cancel = make("button", "取消", actions);
    cancel.type = "button";
    const accept = make("button", "套用替換", actions, "primary");
    accept.type = "button";
    let stale = false;

    function updatePreview() {
      preview.textContent = tooLong ? snapshot.raw : globalThis.TypingRecovery.composeCandidates(recovery, choices, preserveSpaces.checked);
      accept.disabled = stale || tooLong || preview.textContent === snapshot.raw;
      let selected = null;
      suggestions.forEach((suggestion, index) => {
        const matches = suggestion.choices.every((choice, i) => choice === choices[i]);
        suggestionButtons[index].setAttribute("aria-pressed", String(matches));
        suggestionButtons[index].textContent = globalThis.TypingRecovery.composeCandidates(recovery, suggestion.choices, preserveSpaces.checked);
        if (matches) selected = suggestion;
      });
      if (phraseNote) {
        phraseNote.textContent = selected?.phrases.length
          ? `參考詞彙：${selected.phrases.join("、")}`
          : selected ? "依單字詞頻組合，請確認是否符合原意。" : "已逐字調整，保留你的選擇。";
      }
    }
    function markStale() {
      if (element.value !== snapshot.value) {
        stale = true;
        status.textContent = "輸入框內容已改變，請取消後重新開啟候選。";
        updatePreview();
      }
    }
    function close(caret) {
      element.removeEventListener("input", markStale);
      dialog.close();
      host.remove();
      if (closeActive === close) closeActive = null;
      if (element.isConnected) {
        element.focus();
        // Native dialog focus restoration may overwrite setRangeText's caret.
        if (typeof caret === "number" && element.selectionStart !== null) {
          element.setSelectionRange(caret, caret);
        }
      }
    }
    closeActive = close;
    cancel.addEventListener("click", close);
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
    dialog.addEventListener("keydown", (event) => event.stopPropagation());
    accept.addEventListener("click", () => {
      markStale();
      if (accept.disabled) return;
      if (!apply(preview.textContent)) {
        stale = true;
        status.textContent = "輸入框已改變或無法編輯，請取消後重試。";
        updatePreview();
        return;
      }
      close(snapshot.start + preview.textContent.length);
    });
    if (tooLong) status.textContent = "一次最多處理 120 個音節，請反白較短的文字後重試。";
    else if (!recovery.units.length) status.textContent = "找不到可查詢的音節，原文會保留。";
    else if (recovery.units.some((unit) => unit.status !== "ready") || recovery.segments.some((s) => s.type === "invalid")) {
      status.textContent = "部分輸入無法查到候選，會保留原文；請確認預覽。";
    }
    updatePreview();
    element.addEventListener("input", markStale);
    shadow.append(style, dialog);
    document.documentElement.append(host);
    dialog.showModal();
  }

  globalThis.TypingRecoveryUI = Object.freeze({ openCandidatePanel });
})();
