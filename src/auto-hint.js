(() => {
  const ignored = new WeakMap();
  const composing = new WeakSet();
  let timer = null;
  let current = null;

  function supported(element) {
    return isSupportedInput(element) &&
      (element instanceof HTMLTextAreaElement || ["text", "search"].includes(element.type));
  }

  function caretAtEnd(element) {
    return element.selectionStart === element.value.length && element.selectionEnd === element.value.length;
  }

  function acceptHint() {
    if (!current) return false;
    const { element, value, host, text } = current;
    const valid = element.isConnected && host.isConnected && supported(element) &&
      !document.hidden && !composing.has(element) && element.value === value && caretAtEnd(element) &&
      (document.activeElement === element || document.activeElement === host) &&
      !document.querySelector("#typing-recovery-panel");
    hide();
    if (!valid) return false;
    element.focus();
    return replaceInput(element, { value, raw: value, start: 0, end: value.length }, text);
  }

  function hide() {
    if (timer !== null) { clearTimeout(timer); timer = null; }
    if (!current) return;
    current.host.remove();
    window.removeEventListener("resize", position);
    window.removeEventListener("scroll", position, true);
    current = null;
  }

  function position() {
    if (!current) return;
    const { element, host } = current;
    const rect = element.getBoundingClientRect();
    if (!element.isConnected || rect.bottom <= 0 || rect.top >= window.innerHeight ||
      rect.right <= 0 || rect.left >= window.innerWidth || !rect.width || !rect.height) {
      hide();
      return;
    }
    const width = Math.min(400, window.innerWidth - 24);
    host.style.setProperty("width", `${width}px`, "important");
    const height = host.getBoundingClientRect().height;
    host.style.setProperty("left", `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`, "important");
    const below = rect.bottom + 8;
    host.style.setProperty("top", `${Math.max(12, Math.min(below + height <= window.innerHeight - 12
      ? below : rect.top - height - 8, window.innerHeight - height - 12))}px`, "important");
  }

  function show(element, value, detection) {
    const host = document.createElement("div");
    host.id = "typing-recovery-hint";
    // Inline important positioning prevents host-page rules from moving the hint.
    for (const [name, setting] of Object.entries({ all: "initial", position: "fixed", display: "block",
      "z-index": "2147483647", top: "12px", left: "12px" })) {
      host.style.setProperty(name, setting, "important");
    }
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      section { box-sizing: border-box; padding: 14px; border: 1px solid #c7d2fe;
        border-radius: 12px; background: #fff; color: #172033; box-shadow: 0 8px 24px #0f172a26;
        font: 14px/1.5 system-ui, sans-serif; overflow-wrap: anywhere; }
      p { margin: 0 0 8px; } strong { color: #3730a3; }
      .actions { display: flex; flex-wrap: wrap; gap: 8px; }
      button { padding: 6px 12px; border-radius: 6px; border: 1px solid #94a3b8;
        color: #172033; background: white; font: inherit; cursor: pointer; }
      .primary { background: #4338ca; color: white; border-color: #4338ca; }
      button:focus-visible { outline: 3px solid #818cf8; outline-offset: 2px; }
    `;
    const section = document.createElement("section");
    section.setAttribute("aria-label", "輸入法修復提示");
    const message = document.createElement("p");
    message.setAttribute("role", "status");
    message.append(document.createTextNode("可能忘記切換輸入法，想輸入「"));
    const text = document.createElement("strong");
    text.textContent = detection.text;
    message.append(text, document.createTextNode("」？"));
    const actions = document.createElement("div");
    actions.className = "actions";
    const view = document.createElement("button");
    view.type = "button";
    view.textContent = "查看候選";
    const accept = document.createElement("button");
    accept.type = "button";
    accept.className = "primary";
    accept.textContent = "套用（Tab）";
    accept.setAttribute("aria-keyshortcuts", "Tab");
    accept.addEventListener("click", acceptHint);
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.textContent = "忽略";
    actions.append(accept, view, dismiss);
    section.append(message, actions);
    shadow.append(style, section);
    // Mouse use should not move focus out of the user's input before the click.
    section.addEventListener("mousedown", (event) => event.preventDefault());
    view.addEventListener("click", () => {
      hide();
      if (!element.isConnected || !supported(element) || element.value !== value || composing.has(element)) return;
      ignored.set(element, value); // Do not repeat the same hint after canceling the review.
      const snapshot = { value, raw: value, start: 0, end: value.length };
      element.focus();
      globalThis.TypingRecoveryUI.openCandidatePanel(element, snapshot,
        (replacement) => replaceInput(element, snapshot, replacement));
    });
    dismiss.addEventListener("click", () => {
      ignored.set(element, value);
      hide();
      if (element.isConnected) element.focus();
    });
    current = { element, value, host, text: detection.text };
    document.documentElement.append(host);
    position();
    if (current) {
      window.addEventListener("resize", position);
      window.addEventListener("scroll", position, true);
    }
  }

  function schedule(element) {
    hide();
    if (!supported(element) || composing.has(element) || !caretAtEnd(element) || element.value.length > 160) return;
    const value = element.value;
    if (ignored.get(element) === value) return;
    timer = setTimeout(() => {
      timer = null;
      if (!element.isConnected || !supported(element) || composing.has(element) ||
        document.activeElement !== element || element.value !== value || !caretAtEnd(element) ||
        document.querySelector("#typing-recovery-panel")) return;
      const detection = globalThis.TypingRecovery.detectRecovery(value);
      if (detection.suggest) show(element, value, detection);
    }, 450);
  }

  document.addEventListener("input", (event) => {
    if (event.isComposing) { hide(); return; }
    schedule(event.target);
  });
  document.addEventListener("focusin", (event) => {
    if (current && event.target === current.host) return;
    schedule(event.target);
  });
  document.addEventListener("focusout", (event) => {
    if (current && (event.relatedTarget === current.host || event.relatedTarget === current.element)) return;
    hide();
  });
  document.addEventListener("compositionstart", (event) => { composing.add(event.target); hide(); });
  document.addEventListener("compositionend", (event) => { composing.delete(event.target); schedule(event.target); });
  document.addEventListener("keydown", (event) => {
    if (current && event.key === "Tab") {
      if (event.defaultPrevented || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey ||
        event.repeat || event.isComposing || event.keyCode === 229 || document.activeElement !== current.element) {
        return;
      }
      if (acceptHint()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    } else if (current && event.key === "Escape") {
      const element = current.element;
      ignored.set(current.element, current.value);
      hide();
      if (element.isConnected) element.focus();
      event.preventDefault();
    } else if (event.ctrlKey && event.shiftKey && ["KeyY", "KeyU"].includes(event.code)) hide();
  }, true);
  document.addEventListener("selectionchange", () => {
    if (current && !caretAtEnd(current.element)) hide();
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) hide(); });
})();
