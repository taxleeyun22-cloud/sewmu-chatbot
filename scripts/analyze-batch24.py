import json, urllib.request, sys
from collections import defaultdict

bid = sys.argv[1] if len(sys.argv) > 1 else '24'
req = urllib.request.Request(
    f'https://sewmu-chatbot.pages.dev/api/admin-import-batches?id={bid}&key=1111',
    headers={'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json'},
)
with urllib.request.urlopen(req, timeout=60) as r:
    d = json.loads(r.read().decode('utf-8'))

b = d.get('batch', {})
preview = json.loads(b.get('preview_data', '{}'))

print(f'=== batch {bid} status: {b.get("status")} ===')
print()

print('=== matched (DB 기존 user 매칭) ===')
matched_count = 0
for a in preview.get('details', []):
    if a['user'].get('action') == 'matched':
        matched_count += 1
        is_corp = a['user'].get('is_corp', False)
        ceo = a['row']['ceo']
        company = a['row']['company']
        uid = a['user']['existing_id']
        print(f'  row {a["row_no"]}: {ceo} ({company}) [{a["row"]["corp_or_indiv"]}] -> user_id={uid}')
print(f'matched count: {matched_count}\n')

print('=== 같은 이름 N+ row group (commit 시 1 user 또는 동명이인 분리) ===')
groups = defaultdict(list)
for a in preview.get('details', []):
    if a['user'].get('action') == 'new' and a['row'].get('ceo'):
        groups[a['row']['ceo']].append(a)

multi = {k: v for k, v in groups.items() if len(v) > 1}
print(f'  같은 이름 row 2+ 인 사람: {len(multi)} 명')
print()

# 동명이인 (birth 다름) + 한 사람 multi 사업장 분리
homonyms = []
multi_biz = []
for name, gs in multi.items():
    births = sorted(set(g['user'].get('birth_date') for g in gs if g['user'].get('birth_date')))
    if len(births) > 1:
        homonyms.append((name, gs, births))
    else:
        multi_biz.append((name, gs, births))

print(f'>> 동명이인 (birth_date 적혀있고 다름) — 별도 user: {len(homonyms)}명')
for name, gs, births in homonyms:
    print(f'  ⚠️ {name} ({len(gs)} row, 다른 birth: {births})')
    for g in gs:
        print(f'     · {g["row"]["company"]} (birth={g["user"].get("birth_date") or "X"})')

print(f'\n>> 같은 사람 multi 사업장 (1 user): {len(multi_biz)}명')
total_dedup = 0
for name, gs, births in multi_biz[:10]:
    eff_birth = births[0] if births else 'X'
    print(f'  ✅ {name} ({len(gs)} row, effectiveBirth={eff_birth}) → 1 user, {len(gs)-1} dedup')
    total_dedup += len(gs) - 1
for name, gs, births in multi_biz[10:]:
    total_dedup += len(gs) - 1
print(f'  ... + {len(multi_biz)-10}명 더')
print(f'  같은 사람 multi 총 dedup: {total_dedup} row 절약')

# 최종 예상 user
total_new_rows = sum(1 for a in preview.get('details', []) if a['user'].get('action') == 'new' and a['row'].get('ceo'))
unique_names = len(groups)
homonym_extra = sum(len(b) - 1 for _, _, b in homonyms)  # 동명이인 추가 user
expected_new_users = unique_names + homonym_extra
print(f'\n=== 308 row 예상 INSERT ===')
print(f'  new row 수: {total_new_rows}')
print(f'  unique 이름: {unique_names}')
print(f'  동명이인 추가 user: {homonym_extra}')
print(f'  예상 신규 user INSERT: {expected_new_users}')
print(f'  matched 기존 user: {matched_count}')
print(f'  총 user 처리: {expected_new_users + matched_count} → 308 row 매핑')
