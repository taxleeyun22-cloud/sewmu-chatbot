import json, urllib.request, urllib.parse

# 이동일 검색
req = urllib.request.Request(
    'https://sewmu-chatbot.pages.dev/api/admin-search?key=1111&q=' + urllib.parse.quote('이동일'),
    headers={'User-Agent': 'Mozilla/5.0'},
)
with urllib.request.urlopen(req, timeout=60) as r:
    d = json.loads(r.read().decode('utf-8'))

users = d.get('users') or d.get('results', {}).get('users') or []
print(f'=== 이동일 검색: {len(users)}명 ===')
for u in users:
    print(f"\n  id={u.get('id')}")
    print(f"  real_name: {u.get('real_name')}")
    print(f"  name: {u.get('name')}")
    print(f"  phone: {u.get('phone')}")
    print(f"  provider: {u.get('provider')}")
    print(f"  provider_id: {u.get('provider_id')}")
    print(f"  provider_user_id: {u.get('provider_user_id')}")
    print(f"  approval_status: {u.get('approval_status')}")
    print(f"  birth_date: {u.get('birth_date')}")
    print(f"  deleted_at: {u.get('deleted_at')}")
    print(f"  created_at: {u.get('created_at')}")
    print(f"  last_login_at: {u.get('last_login_at')}")
    print(f"  profile_image: {(u.get('profile_image') or '')[:60]}")

# 그리고 user_merges audit 확인
print('\n=== 최근 user_merges (이동일 관련) ===')
req2 = urllib.request.Request(
    'https://sewmu-chatbot.pages.dev/api/admin-users?key=1111&action=list_merges',
    headers={'User-Agent': 'Mozilla/5.0'},
)
try:
    with urllib.request.urlopen(req2, timeout=30) as r:
        d2 = json.loads(r.read().decode('utf-8'))
    print(json.dumps(d2, ensure_ascii=False, indent=2)[:3000])
except Exception as e:
    print(f'  list_merges 호출 실패 (action 미지원일 수도): {e}')
