"""사용자 전체 중복 점검 — 사장님 명령 (2026-05-08): "전체 검증하고 이유 보고"

룰:
  - active user (deleted_at NULL + status NOT IN merged/deleted/withdrawn) 전체 fetch
  - 같은 real_name (또는 name) 인 user 2+ 인 케이스 list
  - 분류:
    a. 동명이인 (birth_date 둘 다 있고 다름) — 정상 (사장님 룰)
    b. 카톡 + manual (provider 다름) — 비정상 (merge 누락)
    c. 같은 provider 중복 — 비정상 (위하고 import 시 매칭 누락)
    d. 동일 user 가 여러 status 에 — 사장님 케이스 (예: id=8 도 archived)
"""
import json, urllib.request, urllib.parse
from collections import defaultdict

KEY = '1111'
BASE = 'https://sewmu-chatbot.pages.dev'

def fetch_status(status):
    req = urllib.request.Request(
        f'{BASE}/api/admin-approve?key={KEY}&status={status}',
        headers={'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        d = json.loads(r.read().decode('utf-8'))
    return d.get('users', []), d.get('counts', {})

# 모든 active status 카테고리
all_users = []
seen_ids = set()
status_list = ['pending', 'approved_client', 'approved_guest', 'rejected', 'terminated', 'rejoined', 'admin']
counts_total = {}

for st in status_list:
    us, counts = fetch_status(st)
    if not counts_total:
        counts_total = counts
    for u in us:
        if u.get('id') not in seen_ids:
            seen_ids.add(u.get('id'))
            u['_fetched_status'] = st
            all_users.append(u)

print(f'=== 전체 active user: {len(all_users)} 명 ===')
print(f'counts: {counts_total}\n')

# 같은 이름 group 만들기 (real_name 우선, 없으면 name)
def get_name(u):
    return (u.get('real_name') or u.get('name') or '').strip()

by_name = defaultdict(list)
for u in all_users:
    nm = get_name(u)
    if nm and nm != '닉네임을 등록해주세요':
        by_name[nm].append(u)

dup_groups = {nm: us for nm, us in by_name.items() if len(us) > 1}
print(f'=== 같은 이름 2명 이상 group: {len(dup_groups)}개 ===\n')

# 분류
homonyms = []  # 동명이인 (birth 둘 다 있고 다름) - 정상
kakao_manual_split = []  # 카톡 + manual 분리 - 비정상 (merge 필요)
same_provider_dup = []  # 같은 provider 중복 - 비정상
mixed = []

for nm, us in dup_groups.items():
    births = sorted({u.get('birth_date') for u in us if u.get('birth_date')})
    providers = sorted({u.get('provider') or 'unknown' for u in us})
    is_homonym = len(births) > 1
    has_kakao = any(u.get('provider') == 'kakao' for u in us)
    has_manual = any(u.get('provider') == 'manual' for u in us)
    if is_homonym:
        homonyms.append((nm, us, births, providers))
    elif has_kakao and has_manual:
        kakao_manual_split.append((nm, us, births, providers))
    elif len(providers) == 1 and providers[0] != 'unknown':
        same_provider_dup.append((nm, us, births, providers))
    else:
        mixed.append((nm, us, births, providers))

# 보고
print(f'\n[A] 동명이인 (정상 — birth 다름): {len(homonyms)}명')
for nm, us, bs, ps in homonyms:
    print(f'  · {nm}: birth={bs} ({len(us)} user, providers={ps})')

print(f'\n[B] 카톡 + manual 분리 (비정상 — merge 필요): {len(kakao_manual_split)}명')
for nm, us, bs, ps in kakao_manual_split:
    print(f'\n  ⚠️ {nm} ({len(us)} user):')
    for u in us:
        prof = '✓프사' if u.get('profile_image') else 'X'
        print(f"     id={u.get('id')} | {u.get('provider')} | status={u.get('approval_status')} | birth={u.get('birth_date')} | phone={u.get('phone')} | {prof} | last_login={u.get('last_login_at')}")

print(f'\n[C] 같은 provider 중복 (비정상 — 위하고 import 시 매칭 누락): {len(same_provider_dup)}명')
for nm, us, bs, ps in same_provider_dup[:30]:
    print(f'\n  ⚠️ {nm} ({len(us)} user, all provider={ps[0]}):')
    for u in us:
        print(f"     id={u.get('id')} | status={u.get('approval_status')} | birth={u.get('birth_date')} | phone={u.get('phone')} | last_login={u.get('last_login_at')}")
if len(same_provider_dup) > 30:
    print(f'  ... + {len(same_provider_dup)-30}명 더')

print(f'\n[D] 기타 (provider 모름 또는 mix): {len(mixed)}명')
for nm, us, bs, ps in mixed[:10]:
    print(f'  · {nm}: providers={ps}, birth={bs}')

# 합계
total_dup = sum(len(us)-1 for us, in [(us,) for nm, us, *_ in homonyms + kakao_manual_split + same_provider_dup + mixed])
print(f'\n=== 합계 ===')
print(f'  중복 group: {len(dup_groups)}개')
print(f'  중복으로 인한 잉여 user: {total_dup}명')
print(f'  분류: 동명이인 {len(homonyms)} / 카톡-manual 분리 {len(kakao_manual_split)} / 같은 provider 중복 {len(same_provider_dup)} / 기타 {len(mixed)}')
