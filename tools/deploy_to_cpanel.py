"""
Deploy frontend/dist to the live cPanel server via FTP.

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
import ftplib
import time
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")
load_dotenv(Path(__file__).parent.parent / ".env.local", override=True)

CPANEL_USER = os.environ["CPANEL_USER"]
CPANEL_PASS = os.environ["CPANEL_PASS"]
CPANEL_HOST = os.environ["CPANEL_HOST"]
# havagr8day.com document root via FTP (absolute from FTP home = /home/falleng1/)
FTP_ROOT = os.environ.get("CPANEL_FTP_ROOT", "/havagr8day.com")

DIST_DIR = Path(__file__).parent.parent / "frontend" / "dist"


def connect_ftp() -> ftplib.FTP:
    ftp = ftplib.FTP()
    ftp.connect(CPANEL_HOST, 21, timeout=30)
    ftp.login(CPANEL_USER, CPANEL_PASS)
    ftp.set_pasv(True)
    return ftp


def ensure_dir(ftp: ftplib.FTP, path: str):
    try:
        ftp.mkd(path)
    except ftplib.error_perm:
        pass  # directory already exists


def upload_file(ftp: ftplib.FTP, local_path: Path, remote_dir: str) -> bool:
    try:
        ftp.cwd(remote_dir)
        with open(local_path, "rb") as f:
            ftp.storbinary(f"STOR {local_path.name}", f)
        print(f"  OK  {remote_dir}/{local_path.name}")
        return True
    except Exception as e:
        print(f"  FAIL  {local_path.name} → {e}")
        return False


def main():
    if not DIST_DIR.exists():
        print(f"ERROR: dist folder not found at {DIST_DIR}")
        print("Run:  cd frontend && pnpm build")
        sys.exit(1)

    print(f"Connecting to {CPANEL_HOST} via FTP as {CPANEL_USER}...")
    ftp = connect_ftp()
    print(f"Connected. Deploying to {FTP_ROOT}")

    ensure_dir(ftp, FTP_ROOT)
    ensure_dir(ftp, f"{FTP_ROOT}/assets")
    ensure_dir(ftp, f"{FTP_ROOT}/blog")

    succeeded = 0
    failed = 0

    print("\nUploading root files...")
    for fname in ["index.html", "robots.txt", "sitemap.xml", "favicon.svg"]:
        local = DIST_DIR / fname
        if local.exists():
            if upload_file(ftp, local, FTP_ROOT):
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
                if upload_file(ftp, f, f"{FTP_ROOT}/assets"):
                    succeeded += 1
                else:
                    failed += 1

    blog_dir = DIST_DIR / "blog"
    if blog_dir.exists():
        print("\nUploading blog/...")
        for f in blog_dir.iterdir():
            if f.is_file():
                if upload_file(ftp, f, f"{FTP_ROOT}/blog"):
                    succeeded += 1
                else:
                    failed += 1

    ftp.quit()
    print(f"\n{'='*40}")
    print(f"Done: {succeeded} succeeded, {failed} failed")
    if failed:
        print("WARNING: Some files failed. Check errors above.")
        sys.exit(1)


if __name__ == "__main__":
    main()
