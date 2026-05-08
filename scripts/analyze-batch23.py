import json, urllib.request

req = urllib.request.Request(
    'https://sewmu-chatbot.pages.dev/api/admin-import-batches?id=23&key=1111',
    headers={'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json'},
)
with urllib.request.urlopen(req, timeout=60) as r:
    d = json.loads(r.read().decode('utf-8'))

b = d.get('batch', {})
preview = json.loads(b.get('preview_data', '{}'))

print('=== needs_decision groups ===')
needs = [g for g in preview.get('branch_group_list', []) if g['status'] != 'auto_ok']
print(f'count: {len(needs)}\n')
for grp in needs:
    print(f"  status={grp['status']} corp_no={grp['corp_no']} size={grp['group_size']}")
    if grp.get('main_row'):
        print(f"    추정 본점: {grp['main_row']['company']} ({grp['main_row']['biz_no']})")
    else:
        print(f"    본점 row 없음 (모두 [지점])")
    for r in grp.get('all_rows', []):
        print(f"    · {r['company']} ({r['biz_no']}) [{r.get('ceo','?')}]")
    print()

print('=== 기존 매칭 user (DB 에 이미 있어서 dedup) ===')
matched = [a for a in preview.get('details', []) if a['user'].get('action') == 'matched']
print(f'count: {len(matched)}\n')
for a in matched:
    print(f"  row {a['row_no']}: {a['row']['ceo']} ({a['row']['company']}) -> user_id={a['user']['existing_id']} match_by={a['user'].get('match_by')}")

print('\n=== summary ===')
print(json.dumps(json.loads(b.get('summary', '{}')), ensure_ascii=False, indent=2))
