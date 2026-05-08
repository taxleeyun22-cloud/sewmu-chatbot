import json, urllib.request, urllib.parse

# 박승호 검색
req = urllib.request.Request(
    'https://sewmu-chatbot.pages.dev/api/admin-search?key=1111&q=' + urllib.parse.quote('박승호'),
    headers={'User-Agent': 'Mozilla/5.0'},
)
with urllib.request.urlopen(req, timeout=60) as r:
    d = json.loads(r.read().decode('utf-8'))

users = d.get('users') or d.get('results', {}).get('users') or []
print(f'=== 박승호 검색: {len(users)}명 ===')
for u in users:
    print(f"\n  id={u.get('id')}")
    print(f"  real_name: '{u.get('real_name')}'")
    print(f"  name: '{u.get('name')}'")
    print(f"  phone: '{u.get('phone')}'")
    print(f"  provider: {u.get('provider')}")
    print(f"  provider_id: {u.get('provider_id')}")
    print(f"  provider_user_id: {u.get('provider_user_id')}")
    print(f"  approval_status: {u.get('approval_status')}")
    print(f"  birth_date: {u.get('birth_date')}")
    print(f"  resident_back_hash 채움?: {bool(u.get('resident_back_hash'))}")
    print(f"  deleted_at: {u.get('deleted_at')}")
    print(f"  is_admin: {u.get('is_admin')}")
    print(f"  last_login_at: {u.get('last_login_at')}")
    print(f"  profile_image: {(u.get('profile_image') or '')[:60]}")
    print(f"  import_batch_id: {u.get('import_batch_id')}")

# 위하고 import 안 같은 이름 multi user 케이스 — name 별 그룹
print('\n=== batch_24 안 + 기존 DB 같은 이름 user 가 분리된 케이스 점검 ===')
# 모든 user 한꺼번에 fetch (일부)
req2 = urllib.request.Request(
    'https://sewmu-chatbot.pages.dev/api/admin-approve?key=1111&status=approved_client',
    headers={'User-Agent': 'Mozilla/5.0'},
)
with urllib.request.urlopen(req2, timeout=60) as r:
    d2 = json.loads(r.read().decode('utf-8'))
users_all = d2.get('users') or []
print(f'전체 approved_client: {len(users_all)} 명')

# 같은 real_name (또는 name) 으로 그룹화 → 카톡 + manual 분리된 케이스 찾기
from collections import defaultdict
by_name = defaultdict(list)
for u in users_all:
    nm = (u.get('real_name') or u.get('name') or '').strip()
    if nm:
        by_name[nm].append(u)

split_cases = []
for nm, us in by_name.items():
    if len(us) < 2:
        continue
    has_kakao = any(u.get('provider') == 'kakao' for u in us)
    has_manual = any(u.get('provider') == 'manual' for u in us)
    if has_kakao and has_manual:
        split_cases.append((nm, us))

print(f'\n분리된 케이스 (같은 이름 + kakao 1+ + manual 1+): {len(split_cases)} 명')
for nm, us in split_cases[:30]:
    print(f'\n  📌 {nm} ({len(us)} user)')
    for u in us:
        prov = u.get('provider') or '?'
        bid = u.get('import_batch_id')
        prof = '카톡프사✓' if u.get('profile_image') else ''
        print(f"     id={u.get('id')} | {prov} | batch={bid} | {prof} | last_login={u.get('last_login_at')}")
