import re
import subprocess
import time
import os
import shutil
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path("/Users/fengye/workspace/TermPilot")
APP_URL = os.environ.get("TERMPILOT_APP_URL", "http://127.0.0.1:8787")
RELAY_URL = os.environ.get("TERMPILOT_RELAY_URL", "ws://127.0.0.1:8787/ws")
SMOKE_HOME = Path(tempfile.mkdtemp(prefix="termpilot-ui-smoke-"))


def cli_env() -> dict[str, str]:
    return {
        **os.environ,
        "TERMPILOT_RELAY_URL": RELAY_URL,
        "TERMPILOT_HOME": str(SMOKE_HOME),
    }


def run_pnpm(args: list[str]) -> str:
    result = subprocess.run(
        ["pnpm", *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
        env=cli_env(),
        check=True,
    )
    return result.stdout


def create_session(name: str) -> str:
    output = run_pnpm(["cli", "--", "create", "--name", name])
    match = re.search(r"已创建会话\s+([a-f0-9-]+)", output)
    if not match:
        raise RuntimeError(f"无法解析会话 sid:\n{output}")
    return match.group(1)


def kill_session(sid: str) -> None:
    run_pnpm(["cli", "--", "kill", "--sid", sid])


def get_pairing_code() -> str:
    output = run_pnpm(["cli", "--", "agent"])
    match = re.search(r"配对码:\s*(\S+)", output)
    if not match:
        raise RuntimeError(f"无法解析配对码:\n{output}")
    return match.group(1)


def wait_for_pairing_code() -> str:
    last_error: Exception | None = None
    for _ in range(20):
        try:
            return get_pairing_code()
        except Exception as error:  # noqa: BLE001
            last_error = error
            time.sleep(0.5)
    raise RuntimeError(f"等待 agent 配对码超时: {last_error}")


def goto_with_retry(page, url: str, attempts: int = 6) -> None:
    last_error: Exception | None = None
    for _ in range(attempts):
        try:
            page.goto(url, wait_until="networkidle")
            return
        except Exception as error:  # noqa: BLE001
            last_error = error
            time.sleep(1)
    raise RuntimeError(f"页面打开失败: {last_error}")


def wait_for_workspace_in_viewport(page, timeout_seconds: float = 3) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        workspace_box = page.get_by_test_id("terminal-workspace").bounding_box()
        viewport = page.viewport_size
        if workspace_box and viewport and workspace_box["y"] < viewport["height"]:
            return
        time.sleep(0.1)
    raise RuntimeError("移动端查看会话后，终端区域没有滚动进入可视区")


def wait_for_terminal_text(page, text: str, timeout_seconds: float = 15) -> None:
    deadline = time.time() + timeout_seconds
    rows = page.locator(".xterm-rows").first
    while time.time() < deadline:
        content = rows.inner_text()
        if text in content:
            return
        time.sleep(0.2)
    raise RuntimeError(f"终端区域没有出现预期输出: {text}")


def visible_session(page, name: str):
    return page.locator(f'[data-session-name="{name}"]:visible')


def wait_for_session_text(page, name: str, text: str, timeout_seconds: float = 15) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        locator = visible_session(page, name)
        if locator.count() == 0:
            time.sleep(0.2)
            continue
        content = locator.first.text_content() or ""
        if text in content:
            return
        time.sleep(0.2)
    raise RuntimeError(f"等待会话 {name} 出现文本失败: {text}")


def main() -> None:
    session_one = f"ui-one-{subprocess.getoutput('date +%s')}"
    session_two = f"ui-two-{subprocess.getoutput('date +%s')}"
    sid_one = ""
    sid_two = ""

    try:
        pairing_code = wait_for_pairing_code()
        sid_one = create_session(session_one)
        sid_two = create_session(session_two)

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page(
                viewport={"width": 390, "height": 844},
                is_mobile=True,
            )
            errors: list[str] = []
            page.on("pageerror", lambda error: errors.append(f"pageerror: {error}"))

            goto_with_retry(page, APP_URL)
            page.get_by_placeholder("ABC-234").fill(pairing_code)
            page.get_by_role("button", name="配对").click()
            token_input = page.get_by_label("访问令牌")
            for _ in range(30):
                if token_input.input_value() != "":
                    break
                time.sleep(0.5)
            else:
                raise RuntimeError("配对后访问令牌没有写回页面")

            wait_for_session_text(page, session_one, "查看")
            visible_session(page, session_one).get_by_role("button", name="查看").click()
            page.get_by_text(session_one, exact=False).first.wait_for(timeout=15000)
            wait_for_workspace_in_viewport(page)
            terminal_text = f"ui-smoke-{int(time.time())}"
            workspace = page.get_by_test_id("terminal-workspace")
            workspace.get_by_placeholder("例如：claude code / git status / npm test").fill(f"printf '{terminal_text}'")
            workspace.get_by_role("button", name="发送", exact=True).click()
            wait_for_terminal_text(page, terminal_text)
            keyboard_text = f"kb-smoke-{int(time.time())}"
            workspace.get_by_placeholder("点这里唤起键盘，直接往当前光标输入").fill(f"printf '{keyboard_text}'")
            page.keyboard.press("Enter")
            wait_for_terminal_text(page, keyboard_text)
            page.get_by_role("button", name="返回会话列表").click()
            wait_for_session_text(page, session_two, "查看")
            visible_session(page, session_two).get_by_role("button", name="查看").click()
            page.get_by_text(session_two, exact=False).first.wait_for(timeout=15000)
            page.get_by_role("button", name="返回会话列表").click()

            visible_session(page, session_one).get_by_role("button", name="关闭").click()
            page.get_by_text("已发送关闭会话请求。", exact=False).wait_for(timeout=10000)

            page.locator("summary", has_text="连接与设备设置").click()
            page.get_by_role("button", name="清除本机绑定").click()
            page.get_by_text("已清除本机保存的访问令牌", exact=False).wait_for(timeout=10000)
            if token_input.input_value() != "":
                raise RuntimeError("清除本机绑定后，访问令牌没有被清空")

            page.screenshot(path="/tmp/termpilot-ui-smoke.png", full_page=True)
            browser.close()

            if errors:
                raise RuntimeError("\n".join(errors))
    finally:
        for sid in [sid_one, sid_two]:
            if sid:
                try:
                    kill_session(sid)
                except Exception:  # noqa: BLE001
                    pass
        try:
            run_pnpm(["cli", "--", "agent", "stop"])
        except Exception:  # noqa: BLE001
            pass
        shutil.rmtree(SMOKE_HOME, ignore_errors=True)

    print("ui smoke ok")


if __name__ == "__main__":
    main()
