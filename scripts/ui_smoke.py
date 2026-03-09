import re
import subprocess
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path("/Users/fengye/workspace/TermPilot")


def run_pnpm(args: list[str]) -> str:
    result = subprocess.run(
        ["pnpm", *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=True,
    )
    return result.stdout


def create_session(name: str) -> str:
    output = run_pnpm(["agent:create", "--", "--name", name])
    match = re.search(r"已创建会话\s+([a-f0-9-]+)", output)
    if not match:
        raise RuntimeError(f"无法解析会话 sid:\n{output}")
    return match.group(1)


def kill_session(sid: str) -> None:
    run_pnpm(["agent:kill", "--", "--sid", sid])


def get_pairing_code() -> str:
    output = run_pnpm(["agent:pair"])
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


def goto_with_retry(page, url: str, attempts: int = 3) -> None:
    last_error: Exception | None = None
    for _ in range(attempts):
        try:
            page.goto(url, wait_until="networkidle")
            return
        except Exception as error:  # noqa: BLE001
            last_error = error
            time.sleep(0.5)
    raise RuntimeError(f"页面打开失败: {last_error}")


def main() -> None:
    session_one = f"ui-one-{subprocess.getoutput('date +%s')}"
    session_two = f"ui-two-{subprocess.getoutput('date +%s')}"
    sid_one = ""
    sid_two = ""
    agent = subprocess.Popen(
        ["pnpm", "dev:agent"],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    try:
        sid_one = create_session(session_one)
        sid_two = create_session(session_two)
        pairing_code = wait_for_pairing_code()

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page()
            errors: list[str] = []
            page.on("pageerror", lambda error: errors.append(f"pageerror: {error}"))

            goto_with_retry(page, "http://127.0.0.1:5173")
            page.get_by_placeholder("ABC-234").fill(pairing_code)
            page.get_by_role("button", name="配对").click()
            page.get_by_text("已绑定设备", exact=False).wait_for(timeout=15000)

            page.locator(f'[data-session-name="{session_one}"]').get_by_role("button", name="查看").click()
            page.get_by_text(session_one, exact=False).first.wait_for(timeout=15000)
            page.locator(f'[data-session-name="{session_two}"]').get_by_role("button", name="查看").click()
            page.get_by_text(session_two, exact=False).first.wait_for(timeout=15000)

            page.locator(f'[data-session-name="{session_one}"]').get_by_role("button", name="关闭").click()
            page.locator(f'[data-session-name="{session_one}"]').get_by_text("已退出").wait_for(timeout=15000)

            token_input = page.get_by_label("访问令牌")
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
        agent.terminate()
        try:
            agent.wait(timeout=5)
        except subprocess.TimeoutExpired:
            agent.kill()

    print("ui smoke ok")


if __name__ == "__main__":
    main()
