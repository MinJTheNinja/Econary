"""Supabase 계정에 관리자 역할을 준다 (관리자 웹 로그인용).

먼저 Supabase Dashboard → Authentication → Users → Add user 로 이메일/비밀번호 계정을 만든 뒤:
    py pipeline/scripts/make_admin.py you@example.com                 # 콘텐츠 관리자
    py pipeline/scripts/make_admin.py you@example.com quality_admin   # 품질 관리자
    py pipeline/scripts/make_admin.py you@example.com learner         # 관리자 해제
"""
from __future__ import annotations

import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config  # noqa: E402

ROLES = ("content_admin", "quality_admin", "learner")


def call(method: str, path: str, body=None):
    key = config.SUPABASE_SERVICE_ROLE_KEY
    req = urllib.request.Request(
        f"{config.SUPABASE_URL.rstrip('/')}{path}",
        data=None if body is None else json.dumps(body).encode(),
        method=method,
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json",
                 "Prefer": "return=representation"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


def find_user_id(email: str) -> str | None:
    page = 1
    while True:
        res = call("GET", f"/auth/v1/admin/users?page={page}&per_page=200")
        users = res.get("users", []) if isinstance(res, dict) else res
        for u in users:
            if (u.get("email") or "").lower() == email.lower():
                return u["id"]
        if len(users) < 200:
            return None
        page += 1


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")  # sys.exit 메시지가 콘솔에서 깨지지 않도록
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    email = sys.argv[1]
    role = sys.argv[2] if len(sys.argv) > 2 else "content_admin"
    if role not in ROLES:
        sys.exit(f"역할은 {ROLES} 중 하나")
    uid = find_user_id(email)
    if not uid:
        sys.exit(f"{email} 계정이 없습니다. Supabase Dashboard → Authentication → Users → Add user 로 먼저 만드세요.")
    rows = call("PATCH", f"/rest/v1/profiles?user_id=eq.{urllib.parse.quote(uid)}", {"role": role})
    if not rows:  # 트리거 이전에 만든 계정이면 프로필이 없을 수 있다
        rows = call("POST", "/rest/v1/profiles", {"user_id": uid, "role": role})
    print(f"{email} → {role}")


if __name__ == "__main__":
    main()
