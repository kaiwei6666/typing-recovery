"""Optional browser integration test: pip install playwright; playwright install chromium.

Loads the actual extension into a fresh Chromium profile. Google requests are
fulfilled with a local fixture so these checks do not depend on Google's UI.
"""
import argparse
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--screenshot", type=Path)
parser.add_argument("--hint-screenshot", type=Path)
args = parser.parse_args()

FIXTURE = """<!doctype html><html lang="zh-Hant"><meta charset="utf-8">
<title>Typing Recovery test</title><style>
body{font:18px system-ui;padding:60px;background:#f8fafc;color:#334155}
textarea{display:block;width:600px;height:100px;font:24px system-ui;margin-top:20px}
</style><h1>Typing Recovery 測試頁</h1><label for="query">搜尋文字</label>
<textarea id="query"></textarea><input id="password" type="password">
<script>window.inputEvents=0;document.querySelector('#query').addEventListener('input',()=>window.inputEvents++);</script>
</html>"""

with tempfile.TemporaryDirectory(prefix="typing-recovery-browser-") as profile:
    assert Path(profile).resolve().parent == Path(tempfile.gettempdir()).resolve()
    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            profile, channel="chromium", headless=True, viewport={"width": 1024, "height": 900},
            args=[f"--disable-extensions-except={ROOT}", f"--load-extension={ROOT}"],
        )
        context.route("**/*", lambda route: route.fulfill(content_type="text/html", body=FIXTURE))
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto("https://www.google.com/")
        query = page.locator("#query")
        panel = page.locator("#typing-recovery-panel")

        def open_candidates(raw):
            query.fill(raw)
            query.press("Control+Shift+U")
            expect(panel.locator("dialog")).to_be_visible()

        open_candidates("su3cl3")
        expect(query).to_have_value("su3cl3")
        expect(panel.locator("output")).to_have_text("你好")
        panel.locator("select").first.select_option("妳")
        expect(panel.locator("output")).to_have_text("妳好")
        if args.screenshot:
            page.screenshot(path=str(args.screenshot), full_page=True)
        events_before = page.evaluate("window.inputEvents")
        panel.get_by_role("button", name="套用替換").click()
        expect(query).to_have_value("妳好")
        expect(panel).to_have_count(0)
        expect(query).to_be_focused()
        assert page.evaluate("window.inputEvents") == events_before + 1
        print("PASS: actual extension injection, candidate selection, input event and focus")

        open_candidates("su3cl3")
        page.keyboard.press("Escape")
        expect(panel).to_have_count(0)
        expect(query).to_have_value("su3cl3")
        query.press("Control+Shift+U")
        panel.get_by_role("button", name="取消", exact=True).click()
        expect(query).to_have_value("su3cl3")
        print("PASS: Escape and Cancel preserve original input")

        query.fill("前🙂su3cl3後")
        query.evaluate("element => element.setSelectionRange(3, 9)")
        query.press("Control+Shift+U")
        expect(panel.locator("output")).to_have_text("你好")
        panel.get_by_role("button", name="套用替換").click()
        expect(query).to_have_value("前🙂你好後")
        assert query.evaluate("element => element.selectionStart") == 5
        print("PASS: selected range preserves surrounding Unicode text and cursor")

        open_candidates("5j/ jp6")
        expect(panel.locator("output")).to_have_text("中文")
        panel.get_by_role("checkbox").check()
        expect(panel.locator("output")).to_have_text("中 文")
        panel.get_by_role("checkbox").uncheck()
        panel.get_by_role("button", name="套用替換").click()
        expect(query).to_have_value("中文")
        print("PASS: first-tone spaces can be removed or retained")

        open_candidates("g4ru,4")
        expect(panel.locator("output")).to_have_text("世界")
        suggestions = panel.get_by_role("group", name="建議組合")
        expect(suggestions.get_by_role("button", name="世界", exact=True)).to_have_attribute("aria-pressed", "true")
        panel.get_by_role("button", name="恢復逐字預設").click()
        expect(panel.locator("#candidate-0")).to_have_value("市")
        suggestions.get_by_role("button", name="世界", exact=True).click()
        expect(panel.locator("#candidate-0")).to_have_value("世")
        expect(panel.locator("#candidate-1")).to_have_value("界")
        panel.locator("#candidate-0").select_option("")
        expect(panel.locator("output")).to_have_text("g4界")
        expect(suggestions.get_by_role("button", name="世界", exact=True)).to_have_attribute("aria-pressed", "false")
        suggestions.get_by_role("button", name="世界", exact=True).click()
        panel.get_by_role("button", name="套用替換").click()
        expect(query).to_have_value("世界")
        print("PASS: phrase ranking, manual override, raw preservation and reset")

        open_candidates("w961o3g45/4zj3")
        expect(panel.locator("output")).to_have_text("台北市政府")
        expect(panel.get_by_role("button", name="套用替換")).to_be_in_viewport()
        if args.screenshot:
            page.screenshot(path=str(args.screenshot), full_page=True)
        panel.get_by_role("button", name="套用替換").click()
        expect(query).to_have_value("台北市政府")
        open_candidates("su3cl3g4ru,4")
        expect(panel.locator("output")).to_have_text("你好世界")
        page.keyboard.press("Escape")
        expect(query).to_have_value("su3cl3g4ru,4")
        print("PASS: multiword suggestions still require confirmation")

        open_candidates("s")
        expect(panel.get_by_role("button", name="套用替換")).to_be_disabled()
        expect(panel.locator("output")).to_have_text("s")
        panel.get_by_role("button", name="取消", exact=True).click()
        open_candidates("su3@1m33🙂")
        expect(panel.locator("output")).to_have_text("你@1m33🙂")
        panel.get_by_role("button", name="套用替換").click()
        expect(query).to_have_value("你@1m33🙂")
        print("PASS: missing/unknown readings and orphan tones are not lost")

        for dispatch in (False, True):
            open_candidates("su3cl3")
            query.evaluate("""(element, dispatch) => {
                element.value = 'changed';
                if (dispatch) element.dispatchEvent(new Event('input', {bubbles:true}));
            }""", dispatch)
            if not dispatch:
                panel.get_by_role("button", name="套用替換").click()
            expect(panel.get_by_role("button", name="套用替換")).to_be_disabled()
            expect(query).to_have_value("changed")
            panel.get_by_role("button", name="取消", exact=True).click()
        print("PASS: stale input is protected with and without an input event")

        open_candidates("su3" * 121)
        expect(panel.get_by_role("button", name="套用替換")).to_be_disabled()
        expect(panel.locator("select")).to_have_count(0)
        panel.get_by_role("button", name="取消", exact=True).click()
        query.fill("su3cl3")
        query.press("Control+Shift+Y")
        expect(query).to_have_value("ㄋㄧˇㄏㄠˇ")
        password = page.locator("#password")
        password.fill("su3")
        password.press("Control+Shift+U")
        expect(panel).to_have_count(0)
        print("PASS: length limit, original shortcut and password exclusion")

        open_candidates("w961o3g45/4zj3")
        page.set_viewport_size({"width": 375, "height": 667})
        bounds = panel.locator("dialog").bounding_box()
        assert bounds["x"] >= 0 and bounds["x"] + bounds["width"] <= 375
        expect(panel.get_by_role("button", name="套用替換")).to_be_in_viewport()
        panel.get_by_role("button", name="取消", exact=True).click()

        page.set_viewport_size({"width": 1024, "height": 900})
        hint = page.locator("#typing-recovery-hint")
        query.fill("su3cl3")
        expect(hint).to_be_visible()
        expect(hint.locator("strong")).to_have_text("你好")
        expect(query).to_have_value("su3cl3")
        expect(query).to_be_focused()
        expect(panel).to_have_count(0)
        if args.hint_screenshot:
            page.screenshot(path=str(args.hint_screenshot), full_page=True)
        hint.get_by_role("button", name="查看候選").click()
        expect(hint).to_have_count(0)
        expect(panel.locator("output")).to_have_text("你好")
        expect(query).to_have_value("su3cl3")
        panel.get_by_role("button", name="套用替換").click()
        expect(query).to_have_value("你好")
        print("PASS: passive automatic hint opens candidates without changing input")

        query.fill("w96j0 ")
        expect(hint).to_be_visible()
        hint.get_by_role("button", name="查看候選").click()
        panel.get_by_role("button", name="取消", exact=True).click()
        page.wait_for_timeout(600)
        expect(hint).to_have_count(0)
        expect(query).to_have_value("w96j0 ")

        query.fill("g4ru,4")
        expect(hint).to_be_visible()
        query.press("Escape")
        expect(hint).to_have_count(0)
        expect(query).to_have_value("g4ru,4")
        password.focus()
        query.focus()
        page.wait_for_timeout(600)  # Beyond the detector's 450 ms debounce.
        expect(hint).to_have_count(0)
        query.fill("dl3g4")
        expect(hint).to_be_visible()
        hint.get_by_role("button", name="忽略", exact=True).click()
        page.wait_for_timeout(600)
        expect(hint).to_have_count(0)
        expect(query).to_have_value("dl3g4")
        print("PASS: Escape and Ignore suppress repeated hints for unchanged input")

        query.fill("w961o3g45/4zj3")
        expect(hint).to_be_visible()
        query.evaluate("element => { element.value = 'changed'; }")
        hint.get_by_role("button", name="查看候選").click()
        expect(panel).to_have_count(0)
        expect(query).to_have_value("changed")
        query.fill("su3cl3")
        query.fill("hello world")
        page.wait_for_timeout(600)
        expect(hint).to_have_count(0)
        print("PASS: stale hint and pending detection cannot use replaced input")

        for raw in ("gpt4", "1234567", "su3cl3@example.com", "su3cl", "我想su3cl3"):
            query.fill(raw)
            page.wait_for_timeout(600)
            expect(hint).to_have_count(0)
            expect(query).to_have_value(raw)
        print("PASS: normal and deliberately unsupported input stays quiet")

        query.fill("su3cl3a87")
        query.evaluate("""element => {
            element.dispatchEvent(new CompositionEvent('compositionstart', {bubbles:true}));
            element.dispatchEvent(new InputEvent('input', {bubbles:true, isComposing:true}));
        }""")
        page.wait_for_timeout(600)
        expect(hint).to_have_count(0)
        query.evaluate("element => element.dispatchEvent(new CompositionEvent('compositionend', {bubbles:true}))")
        expect(hint).to_be_visible()
        expect(hint.locator("strong")).to_have_text("你好嗎")
        password.focus()
        expect(hint).to_have_count(0)
        password.fill("su3cl3")
        page.wait_for_timeout(600)
        expect(hint).to_have_count(0)
        query.focus()
        query.evaluate("""element => {
            element.readOnly = true;
            element.dispatchEvent(new Event('input', {bubbles:true}));
        }""")
        page.wait_for_timeout(600)
        expect(hint).to_have_count(0)
        query.evaluate("element => { element.readOnly = false; }")
        print("PASS: composition, focus loss, passwords and readonly fields are respected")

        query.fill("2u04sl3")
        expect(hint).to_be_visible()
        events_before = page.evaluate("window.inputEvents")
        query.press("Tab")
        expect(query).to_be_focused()
        expect(query).to_have_value("電腦")
        assert query.evaluate("element => element.selectionStart") == 2
        assert page.evaluate("window.inputEvents") == events_before + 1
        expect(panel).to_have_count(0)
        expect(hint).to_have_count(0)
        query.press("Tab")
        expect(password).to_be_focused()
        print("PASS: Tab accepts once, preserves focus/caret, then resumes normal navigation")

        query.fill("su3cl3")
        expect(hint).to_be_visible()
        hint.get_by_role("button", name="套用（Tab）", exact=True).click()
        expect(query).to_have_value("你好")
        expect(query).to_be_focused()
        query.fill("5j/ jp6")
        expect(hint).to_be_visible()
        query.press("Shift+Tab")
        expect(query).to_have_value("5j/ jp6")
        query.fill("su3cl3")
        expect(hint).to_be_visible()
        query.evaluate("element => element.setSelectionRange(0, 3)")
        expect(hint).to_have_count(0)
        query.press("Tab")
        expect(query).to_have_value("su3cl3")
        expect(password).to_be_focused()
        print("PASS: click acceptance works; Shift+Tab and selections are not replaced")

        for changes in ("element.value = 'changed'", "element.readOnly = true"):
            query.fill("su3cl3")
            expect(hint).to_be_visible()
            query.evaluate(f"element => {{ {changes}; }}")
            query.press("Tab")
            expect(query).to_have_value("changed" if "value" in changes else "su3cl3")
            expect(password).to_be_focused()
            expect(hint).to_have_count(0)
            query.evaluate("element => { element.readOnly = false; }")
        print("PASS: stale and newly readonly hints do not intercept Tab")

        query.fill("su3cl3")
        expect(hint).to_be_visible()
        for properties in ({"ctrlKey": True}, {"altKey": True}, {"metaKey": True}, {"repeat": True}, {"isComposing": True}):
            canceled = query.evaluate("""(element, properties) => !element.dispatchEvent(
                new KeyboardEvent('keydown', {key:'Tab', code:'Tab', bubbles:true, cancelable:true, ...properties}))""", properties)
            assert not canceled
            expect(query).to_have_value("su3cl3")
        query.press("Escape")
        query.press("Tab")
        expect(password).to_be_focused()
        expect(query).to_have_value("su3cl3")
        print("PASS: modifiers, repeats, IME key events and dismissed hints never accept")

        page.set_viewport_size({"width": 375, "height": 667})
        query.fill("5j/ jp6")
        expect(hint).to_be_visible()
        bounds = hint.bounding_box()
        assert bounds["x"] >= 0 and bounds["x"] + bounds["width"] <= 375
        assert bounds["y"] >= 0 and bounds["y"] + bounds["height"] <= 667
        query.press("Control+Shift+U")
        expect(hint).to_have_count(0)
        expect(panel.locator("output")).to_have_text("中文")
        panel.get_by_role("button", name="取消", exact=True).click()
        print("PASS: hints fit narrow screens and coexist with manual shortcuts")

        assert not errors, errors
        print("PASS: narrow viewport; no page errors")
        context.close()
