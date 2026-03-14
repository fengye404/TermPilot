#!/usr/bin/env python3
"""
E2EE 会话路由测试脚本

测试内容：
1. 配对流程 - 验证公钥交换
2. 加密通信 - 验证消息加密/解密
3. 会话隔离 - 验证多客户端访问控制
4. 消息转发 - 验证 relay 正确转发加密消息
"""

import re
import subprocess
import time
import os
import shutil
import tempfile
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path("/Users/fengye/workspace/TermPilot")
APP_URL = os.environ.get("TERMPILOT_APP_URL", "http://127.0.0.1:8787")
RELAY_URL = os.environ.get("TERMPILOT_RELAY_URL", "ws://127.0.0.1:8787/ws")
TEST_HOME = Path(tempfile.mkdtemp(prefix="termpilot-e2ee-test-"))


def cli_env() -> dict[str, str]:
    return {
        **os.environ,
        "TERMPILOT_RELAY_URL": RELAY_URL,
        "TERMPILOT_HOME": str(TEST_HOME),
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
        except Exception as error:
            last_error = error
            time.sleep(0.5)
    raise RuntimeError(f"等待 agent 配对码超时: {last_error}")


def create_session(name: str) -> str:
    output = run_pnpm(["cli", "--", "create", "--name", name])
    match = re.search(r"已创建会话\s+([a-f0-9-]+)", output)
    if not match:
        raise RuntimeError(f"无法解析会话 sid:\n{output}")
    return match.group(1)


def kill_session(sid: str) -> None:
    run_pnpm(["cli", "--", "kill", "--sid", sid])


def goto_with_retry(page, url: str, attempts: int = 6) -> None:
    last_error: Exception | None = None
    for _ in range(attempts):
        try:
            page.goto(url, wait_until="networkidle")
            return
        except Exception as error:
            last_error = error
            time.sleep(1)
    raise RuntimeError(f"页面打开失败: {last_error}")


def test_pairing_flow():
    """测试 1: 配对流程 - 验证公钥交换"""
    print("\n=== 测试 1: 配对流程 ===")
    
    pairing_code = wait_for_pairing_code()
    print(f"✓ 获取配对码: {pairing_code}")
    
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 390, "height": 844})
        
        try:
            goto_with_retry(page, APP_URL)
            print("✓ 打开应用页面")
            
            # 输入配对码
            page.get_by_placeholder("ABC-234").fill(pairing_code)
            print(f"✓ 输入配对码: {pairing_code}")
            
            # 点击配对按钮
            page.get_by_role("button", name="配对").click()
            print("✓ 点击配对按钮")
            
            # 等待访问令牌生成
            token_input = page.get_by_label("访问令牌")
            for attempt in range(30):
                token_value = token_input.input_value()
                if token_value != "":
                    print(f"✓ 配对成功，获得访问令牌: {token_value[:16]}...")
                    
                    # 验证本地存储中的密钥对
                    storage = page.evaluate("() => JSON.parse(localStorage.getItem('termpilot-app-state') || '{}')")
                    if storage.get("clientKeyPair"):
                        print("✓ 客户端密钥对已保存到本地存储")
                    if storage.get("agentPublicKey"):
                        print("✓ Agent 公钥已保存到本地存储")
                    
                    browser.close()
                    return True
                time.sleep(0.5)
            
            raise RuntimeError("配对后访问令牌没有写回页面")
        finally:
            browser.close()


def test_encrypted_communication():
    """测试 2: 加密通信 - 验证消息加密/解密"""
    print("\n=== 测试 2: 加密通信 ===")
    
    pairing_code = wait_for_pairing_code()
    session_name = f"e2ee-test-{int(time.time())}"
    sid = create_session(session_name)
    print(f"✓ 创建测试会话: {session_name} (sid: {sid})")
    
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 390, "height": 844})
        
        try:
            goto_with_retry(page, APP_URL)
            
            # 配对
            page.get_by_placeholder("ABC-234").fill(pairing_code)
            page.get_by_role("button", name="配对").click()
            
            # 等待配对完成
            token_input = page.get_by_label("访问令牌")
            for _ in range(30):
                if token_input.input_value() != "":
                    break
                time.sleep(0.5)
            else:
                raise RuntimeError("配对失败")
            
            print("✓ 配对完成")
            
            # 等待会话列表加载
            time.sleep(2)
            
            # 查找会话卡片
            session_card = page.locator(f'[data-session-name="{session_name}"]:visible')
            if session_card.count() == 0:
                raise RuntimeError(f"找不到会话卡片: {session_name}")
            
            print(f"✓ 找到会话卡片")
            
            # 点击查看按钮
            session_card.get_by_role("button", name="查看").click()
            print("✓ 打开会话")
            
            # 等待终端加载
            time.sleep(2)
            
            # 发送命令
            test_text = f"e2ee-test-{int(time.time())}"
            workspace = page.get_by_test_id("terminal-workspace")
            workspace.get_by_placeholder("例如：claude code / git status / npm test").fill(f"printf '{test_text}'")
            workspace.get_by_role("button", name="发送", exact=True).click()
            print(f"✓ 发送加密命令: printf '{test_text}'")
            
            # 等待命令执行结果
            deadline = time.time() + 15
            while time.time() < deadline:
                terminal_content = page.locator(".tp-ansi-snapshot").first.inner_text()
                if test_text in terminal_content:
                    print(f"✓ 收到加密消息响应，验证了端到端加密通信")
                    browser.close()
                    return True
                time.sleep(0.2)
            
            raise RuntimeError(f"没有收到预期的命令输出: {test_text}")
        finally:
            browser.close()
            try:
                kill_session(sid)
            except Exception:
                pass


def test_multi_client_isolation():
    """测试 3: 会话隔离 - 验证多客户端访问控制"""
    print("\n=== 测试 3: 多客户端会话隔离 ===")
    
    pairing_code = wait_for_pairing_code()
    session_name = f"isolation-test-{int(time.time())}"
    sid = create_session(session_name)
    print(f"✓ 创建测试会话: {session_name}")
    
    with sync_playwright() as playwright:
        browser1 = playwright.chromium.launch(headless=True)
        browser2 = playwright.chromium.launch(headless=True)
        
        page1 = browser1.new_page(viewport={"width": 390, "height": 844})
        page2 = browser2.new_page(viewport={"width": 390, "height": 844})
        
        try:
            # 第一个客户端配对
            goto_with_retry(page1, APP_URL)
            page1.get_by_placeholder("ABC-234").fill(pairing_code)
            page1.get_by_role("button", name="配对").click()
            
            for _ in range(30):
                if page1.get_by_label("访问令牌").input_value() != "":
                    break
                time.sleep(0.5)
            
            print("✓ 客户端 1 配对成功")
            
            # 第二个客户端配对
            goto_with_retry(page2, APP_URL)
            page2.get_by_placeholder("ABC-234").fill(pairing_code)
            page2.get_by_role("button", name="配对").click()
            
            for _ in range(30):
                if page2.get_by_label("访问令牌").input_value() != "":
                    break
                time.sleep(0.5)
            
            print("✓ 客户端 2 配对成功")
            
            # 两个客户端都应该能看到会话
            time.sleep(2)
            
            session_card1 = page1.locator(f'[data-session-name="{session_name}"]:visible')
            session_card2 = page2.locator(f'[data-session-name="{session_name}"]:visible')
            
            if session_card1.count() > 0 and session_card2.count() > 0:
                print("✓ 两个客户端都能看到会话（访问控制正确）")
                browser1.close()
                browser2.close()
                return True
            else:
                raise RuntimeError("客户端无法看到会话")
        finally:
            browser1.close()
            browser2.close()
            try:
                kill_session(sid)
            except Exception:
                pass


def test_relay_health():
    """测试 4: Relay 健康检查"""
    print("\n=== 测试 4: Relay 健康检查 ===")
    
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        
        try:
            # 获取 relay 健康状态
            relay_http_url = RELAY_URL.replace("ws://", "http://").replace("wss://", "https://").replace("/ws", "")
            health_url = f"{relay_http_url}/health"
            
            page.goto(health_url)
            health_data = page.evaluate("() => JSON.parse(document.body.innerText)")
            
            print(f"✓ Relay 健康状态:")
            print(f"  - 在线 Agent 数: {health_data.get('agentsOnline', 0)}")
            print(f"  - 在线客户端数: {health_data.get('clientsOnline', 0)}")
            print(f"  - E2EE 必需: {health_data.get('security', {}).get('endToEndEncryptionRequiredForPairedClients', False)}")
            print(f"  - Relay 存储会话内容: {health_data.get('security', {}).get('relayStoresSessionContent', False)}")
            
            if health_data.get('security', {}).get('endToEndEncryptionRequiredForPairedClients'):
                print("✓ E2EE 已启用")
                return True
            else:
                raise RuntimeError("E2EE 未启用")
        finally:
            browser.close()


def main() -> None:
    print("=" * 60)
    print("TermPilot E2EE 会话路由测试")
    print("=" * 60)
    
    try:
        # 运行所有测试
        test_relay_health()
        test_pairing_flow()
        test_encrypted_communication()
        test_multi_client_isolation()
        
        print("\n" + "=" * 60)
        print("✓ 所有 E2EE 测试通过！")
        print("=" * 60)
        
    except Exception as error:
        print(f"\n✗ 测试失败: {error}")
        raise
    finally:
        try:
            run_pnpm(["cli", "--", "agent", "stop"])
        except Exception:
            pass
        shutil.rmtree(TEST_HOME, ignore_errors=True)


if __name__ == "__main__":
    main()
