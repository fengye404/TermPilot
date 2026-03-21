#!/usr/bin/env python3

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    result = subprocess.run(["pnpm", "test:e2ee"], cwd=ROOT)
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
