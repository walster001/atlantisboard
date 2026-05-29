#!/usr/bin/env bash
# fetch-download-data.sh — Pull latest GitHub release assets + npm version for the Download page.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${REPO_ROOT}/pages/_data/download.json"
GITHUB_REPO="${GITHUB_REPO:-walster001/atlantisboard}"
NPM_PACKAGE="${NPM_PACKAGE:-atlantisboard}"
export OUT GITHUB_REPO NPM_PACKAGE

python3 <<'PY'
import json
import os
import urllib.request
from datetime import datetime, timezone

github_repo = os.environ.get("GITHUB_REPO", "walster001/atlantisboard")
npm_package = os.environ.get("NPM_PACKAGE", "atlantisboard")
out_path = os.environ["OUT"]


def human_size(num: int) -> str:
    if num < 1024:
        return f"{num} B"
    if num < 1048576:
        return f"{num / 1024:.1f} KB"
    return f"{num / 1048576:.1f} MB"


def asset_kind(name: str) -> str:
    if name.endswith("-runtime.zip"):
        return "runtime"
    if name.endswith(".zip"):
        return "full"
    return "other"


def fetch(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


release = fetch(f"https://api.github.com/repos/{github_repo}/releases/latest")
npm = fetch(f"https://registry.npmjs.org/{npm_package}/latest")

tag = release.get("tag_name", "")
version = tag.removeprefix("v") if tag.startswith("v") else tag

assets = []
for asset in release.get("assets", []):
    name = asset.get("name", "")
    size_bytes = int(asset.get("size", 0))
    assets.append(
        {
            "name": name,
            "size_bytes": size_bytes,
            "size_human": human_size(size_bytes),
            "url": asset.get("browser_download_url", ""),
            "kind": asset_kind(name),
        }
    )

payload = {
    "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "github": {
        "tag": tag,
        "version": version,
        "name": release.get("name", ""),
        "html_url": release.get("html_url", ""),
        "published_at": release.get("published_at", ""),
        "assets": assets,
    },
    "npm": {
        "name": npm_package,
        "version": npm.get("version", ""),
        "description": npm.get("description", ""),
        "registry_url": f"https://www.npmjs.com/package/{npm_package}",
        "install_command": f"npm install -g {npm_package}",
    },
}

os.makedirs(os.path.dirname(out_path), exist_ok=True)
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(payload, f, indent=2)
    f.write("\n")

print(f"==> Wrote {out_path} (release {tag}, npm {npm.get('version', '')})")
PY
