"""batch_24 의 parent_business_id 자동 설정 결과 확인 (admin-businesses API)"""
import json, urllib.request, sys
from collections import defaultdict

# admin-import-batches?id=24 → preview_data 의 branch_group_list 분석
req = urllib.request.Request(
    'https://sewmu-chatbot.pages.dev/api/admin-import-batches?id=24&key=1111',
    headers={'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json'},
)
with urllib.request.urlopen(req, timeout=60) as r:
    d = json.loads(r.read().decode('utf-8'))
b = d.get('batch', {})
preview = json.loads(b.get('preview_data', '{}'))

groups = preview.get('branch_group_list', [])
print(f'=== batch 24 본점·지점 그룹 분석 ===')
print(f'총 그룹 수: {len(groups)}\n')

auto_ok = [g for g in groups if g['status'] == 'auto_ok']
multi_mains = [g for g in groups if g['status'] == 'multiple_mains']
no_main = [g for g in groups if g['status'] == 'no_main']

print(f'✅ auto_ok (1 main + N branches): {len(auto_ok)} 그룹')
solo = [g for g in auto_ok if g['group_size'] == 1]
multi_branch = [g for g in auto_ok if g['group_size'] > 1]
print(f'   · 단독 (1 사업장만): {len(solo)} 그룹 — parent 매핑 불필요')
print(f'   · 본점+지점 (2개 이상): {len(multi_branch)} 그룹')
for g in multi_branch:
    print(f'     - {g["main_row"]["company"]} (corp {g["corp_no"]}, {g["group_size"]}개)')
    for r in g['all_rows']:
        marker = '🏢 본점' if r['biz_no'] == g['main_row']['biz_no'] else '📍 지점'
        print(f'       {marker} {r["company"]} ({r["biz_no"]})')
    print()

print()
print(f'⚠️  multiple_mains (본점 후보 2+): {len(multi_mains)} 그룹')
for g in multi_mains:
    main = g.get('main_row')
    print(f'   · corp {g["corp_no"]} ({g["group_size"]}개) — 추정 본점: {main["company"] if main else "X"}')
    for r in g['all_rows']:
        marker = '🏢 본점' if main and r['biz_no'] == main['biz_no'] else '📍 지점'
        print(f'     {marker} {r["company"]} ({r["biz_no"]})')
    print()

print()
print(f'🚨 no_main (본점 row 없음): {len(no_main)} 그룹')
for g in no_main:
    print(f'   · corp {g["corp_no"]} ({g["group_size"]}개) — 본점 row 없음 → parent 매핑 X (모두 독립)')
    for r in g['all_rows']:
        print(f'     · {r["company"]} ({r["biz_no"]})')
    print()

# 실제 DB 의 parent_business_id 확인
print()
print('=== 실제 DB 의 parent_business_id 설정된 사업장 (batch_24 안) ===')
req2 = urllib.request.Request(
    'https://sewmu-chatbot.pages.dev/api/admin-businesses?key=1111&import_batch_id=24&with_parents=1',
    headers={'User-Agent': 'Mozilla/5.0'},
)
try:
    with urllib.request.urlopen(req2, timeout=60) as r:
        bd = json.loads(r.read().decode('utf-8'))
    bizs = bd.get('businesses', []) or []
    with_parent = [b for b in bizs if b.get('parent_business_id')]
    print(f'  batch_24 사업장: {len(bizs)} 개')
    print(f'  parent_business_id 설정된 사업장: {len(with_parent)} 개')
    if with_parent:
        # parent 별 그룹화
        by_parent = defaultdict(list)
        for b in with_parent:
            by_parent[b['parent_business_id']].append(b)
        for pid, branches in by_parent.items():
            parent = next((b for b in bizs if b.get('id') == pid), None)
            pname = parent.get('company_name') if parent else f'(외부 ID {pid})'
            print(f'  🏢 본점 ID {pid}: {pname} → 지점 {len(branches)}개')
            for br in branches[:5]:
                print(f'     · {br.get("company_name")} ({br.get("business_number")})')
except urllib.error.HTTPError as e:
    print(f'  admin-businesses 호출 실패 (HTTP {e.code}): admin UI 에서 직접 확인 필요')
except Exception as e:
    print(f'  admin-businesses 호출 실패: {e}')
