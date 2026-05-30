"""
Deploy frontend/dist to the live cPanel server via FTP (using curl).

Uses curl instead of Python ftplib because ftplib's passive mode is
unreliable through NAT — connections drop mid-transfer on large files.
curl handles FTP passive mode correctly through NAT.

Usage:
    python tools/deploy_to_cpanel.py

Requires in .env (project root):
    CPANEL_USER=falleng1
    CPANEL_PASS=your_password
    CPANEL_HOST=your_host_or_ip
    CPANEL_FTP_ROOT=/havagr8day.com   # FTP absolute path for havagr8day.com doc root
"""
import os
import sys
import subprocess
import time
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")
load_dotenv(Path(__file__).parent.parent / ".env.local", override=True)

CPANEL_USER = os.environ["CPANEL_USER"]
CPANEL_PASS = os.environ["CPANEL_PASS"]
CPANEL_HOST = os.environ["CPANEL_HOST"]
FTP_ROOT    = os.environ.get("CPANEL_FTP_ROOT", "/havagr8day.com")

DIST_DIR = Path(__file__).parent.parent / "frontend" / "dist"


def ftp_url(remote_path: str) -> str:
    return f"ftp://{CPANEL_USER}:{CPANEL_PASS}@{CPANEL_HOST}{remote_path}"


def upload(local_path: Path, remote_dir: str) -> bool:
    """Upload a single file via curl FTP. Retries once on failure."""
    url = ftp_url(f"{remote_dir}/")
    for attempt in range(2):
        r = subprocess.run(
            [
                "curl", "--ftp-pasv", "--ftp-create-dirs",
                "--silent", "--show-error",
                "-T", str(local_path), url,
                "--connect-timeout", "30",
                "--max-time", "120",
            ],
            capture_output=True, text=True, timeout=130,
        )
        if r.returncode == 0:
            print(f"  OK  {remote_dir}/{local_path.name}")
            return True
        if attempt == 0:
            time.sleep(2)
    print(f"  FAIL  {local_path.name} -> {r.stderr.strip()[-200:]}")
    return False


def main():
    if not DIST_DIR.exists():
        print(f"ERROR: dist folder not found at {DIST_DIR}")
        print("Run:  cd frontend && pnpm build")
        sys.exit(1)

    print(f"Deploying to {CPANEL_HOST}{FTP_ROOT} via FTP (curl)...")

    succeeded = 0
    failed = 0

    print("\nUploading root files...")
    for fname in ["index.html", "robots.txt", "sitemap.xml", "favicon.svg"]:
        local = DIST_DIR / fname
        if local.exists():
            if upload(local, FTP_ROOT):
                succeeded += 1
            else:
                failed += 1
        else:
            print(f"  SKIP (not found): {fname}")

    assets_dir = DIST_DIR / "assets"
    if assets_dir.exists():
        print("\nUploading assets/...")
        for f in sorted(assets_dir.iterdir()):
            if f.is_file():
                if upload(f, f"{FTP_ROOT}/assets"):
                    succeeded += 1
                else:
                    failed += 1

    blog_dir = DIST_DIR / "blog"
    if blog_dir.exists():
        print("\nUploading blog/...")
        for f in blog_dir.iterdir():
            if f.is_file():
                if upload(f, f"{FTP_ROOT}/blog"):
                    succeeded += 1
                else:
                    failed += 1

    print(f"\n{'='*40}")
    print(f"Done: {succeeded} succeeded, {failed} failed")
    if failed:
        print("WARNING: Some files failed. Check errors above.")
        sys.exit(1)


if __name__ == "__main__":
    main()
