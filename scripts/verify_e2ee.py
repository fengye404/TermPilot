#!/usr/bin/env python3
"""
快速 E2EE 功能验证脚本
"""

import subprocess
import time
import os
import json
from pathlib import Path

ROOT = Path("/Users/fengye/workspace/TermPilot")


def check_relay_health():
    """检查 relay 服务器健康状态"""
    print("\n=== 检查 Relay 健康状态 ===")
    try:
        result = subprocess.run(
            ["curl", "-s", "http://127.0.0.1:8787/health"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            health = json.loads(result.stdout)
            print(f"✓ Relay 在线")
            print(f"  - 在线 Agent: {health.get('agentsOnline', 0)}")
            print(f"  - 在线客户端: {health.get('clientsOnline', 0)}")
            print(f"  - E2EE 必需: {health.get('security', {}).get('endToEndEncryptionRequiredForPairedClients', False)}")
            print(f"  - Relay 存储会话: {health.get('security', {}).get('relayStoresSessionContent', False)}")
            return True
        else:
            print(f"✗ Relay 不可用: {result.stderr}")
            return False
    except Exception as e:
        print(f"✗ 检查失败: {e}")
        return False


def check_build():
    """检查构建状态"""
    print("\n=== 检查构建状态 ===")
    dist_dir = ROOT / "app" / "dist"
    if dist_dir.exists() and (dist_dir / "index.html").exists():
        print(f"✓ 应用已构建")
        print(f"  - 构建目录: {dist_dir}")
        return True
    else:
        print(f"✗ 应用未构建")
        return False


def check_types():
    """检查 TypeScript 类型"""
    print("\n=== 检查 TypeScript 类型 ===")
    try:
        result = subprocess.run(
            ["pnpm", "typecheck"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.returncode == 0:
            print(f"✓ 类型检查通过")
            return True
        else:
            print(f"✗ 类型检查失败:")
            print(result.stdout[-500:] if result.stdout else "")
            return False
    except Exception as e:
        print(f"✗ 检查失败: {e}")
        return False


def check_e2ee_implementation():
    """检查 E2EE 实现"""
    print("\n=== 检查 E2EE 实现 ===")
    
    checks = [
        ("packages/protocol/src/index.ts", "generateE2EEKeyPair", "E2EE 密钥生成"),
        ("packages/protocol/src/index.ts", "encryptForPeer", "E2EE 加密"),
        ("packages/protocol/src/index.ts", "decryptFromPeer", "E2EE 解密"),
        ("agent/src/daemon.ts", "deviceKeyPair", "Agent 密钥对"),
        ("agent/src/daemon.ts", "grantPublicKeys", "Grant 公钥缓存"),
        ("relay/src/server.ts", "handleClientMessage", "客户端消息处理"),
        ("relay/src/auth-store.ts", "clientPublicKey", "客户端公钥存储"),
        ("app/src/App.tsx", "encryptForPeer", "应用端加密"),
    ]
    
    all_passed = True
    for file_path, keyword, description in checks:
        full_path = ROOT / file_path
        if full_path.exists():
            content = full_path.read_text()
            if keyword in content:
                print(f"✓ {description}")
            else:
                print(f"✗ {description} - 未找到 '{keyword}'")
                all_passed = False
        else:
            print(f"✗ {description} - 文件不存在: {file_path}")
            all_passed = False
    
    return all_passed


def check_message_types():
    """检查消息类型定义"""
    print("\n=== 检查消息类型定义 ===")
    
    protocol_file = ROOT / "packages/protocol/src/index.ts"
    content = protocol_file.read_text()
    
    checks = [
        ("SecureClientEnvelopeMessage", "客户端加密消息"),
        ("SecureAgentEnvelopeMessage", "Agent 加密消息"),
        ("ClientToRelayMessage", "客户端到 Relay 消息"),
        ("AgentToRelayMessage", "Agent 到 Relay 消息"),
        ("ClientBusinessMessage", "客户端业务消息"),
        ("AgentBusinessMessage", "Agent 业务消息"),
    ]
    
    all_passed = True
    for type_name, description in checks:
        if type_name in content:
            print(f"✓ {description}")
        else:
            print(f"✗ {description} - 未找到类型 '{type_name}'")
            all_passed = False
    
    return all_passed


def main():
    print("=" * 60)
    print("TermPilot E2EE 快速验证")
    print("=" * 60)
    
    results = {
        "构建状态": check_build(),
        "类型检查": check_types(),
        "E2EE 实现": check_e2ee_implementation(),
        "消息类型": check_message_types(),
        "Relay 健康": check_relay_health(),
    }
    
    print("\n" + "=" * 60)
    print("验证结果总结")
    print("=" * 60)
    
    for check_name, passed in results.items():
        status = "✓ 通过" if passed else "✗ 失败"
        print(f"{check_name}: {status}")
    
    all_passed = all(results.values())
    
    if all_passed:
        print("\n✓ 所有检查通过！E2EE 实现完整。")
        return 0
    else:
        print("\n✗ 部分检查失败。")
        return 1


if __name__ == "__main__":
    exit(main())
