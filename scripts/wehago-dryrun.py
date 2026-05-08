#!/usr/bin/env python3
"""parse_xlsx + enrichment dry-run — 실제 엑셀 적용 후 결과 보고만 (API 호출 X)."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# wehago-import.py 의 함수 import (- 가 들어있어 importlib 필요)
import importlib.util
spec = importlib.util.spec_from_file_location("wehago_import", os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wehago-import.py'))
wi = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wi)

path = r'C:\Users\user\Desktop\taxtrade_최종정리.xlsx'
print(f'>> Dry-run: {path}\n')
rows = wi.parse_xlsx(path)
print()
print(f'>> 총 {len(rows)} row')

# 빈 법인번호 검사 (enrichment 후)
empty_after = [r for r in rows if r['corp_or_indiv'] == '법인' and not r['resident_or_corp_no']]
print(f'>> enrichment 후 법인+빈 법인번호 row: {len(empty_after)}건')
for r in empty_after:
    print(f'   - {r["company"]} (대표 {r["ceo"]}, 사업자번호 {r["biz_no"]})')

# 법인번호별 그룹 (enrichment 후)
print()
print('>> 법인번호별 그룹 (enrichment 후):')
corp_groups = {}
for r in rows:
    if r['corp_or_indiv'] == '법인' and r['resident_or_corp_no']:
        corp_groups.setdefault(r['resident_or_corp_no'], []).append(r)
multi_corp = {k: v for k, v in corp_groups.items() if len(v) > 1}
for cn, grp in sorted(multi_corp.items(), key=lambda x: -len(x[1])):
    print(f'   {cn} ({len(grp)}개 사업장):')
    for r in grp[:6]:
        print(f'     · {r["company"]} (사업자번호 {r["biz_no"]}, 대표 {r["ceo"]})')
    if len(grp) > 6:
        print(f'     · ... +{len(grp)-6}개 더')

# 개인 dedup 시뮬레이션 (이름+주민번호)
print()
print('>> 개인 dedup 시뮬레이션 (이름+주민번호 strict):')
indiv = [r for r in rows if r['corp_or_indiv'] != '법인' and r['ceo'] and r['resident_or_corp_no']]
print(f'   개인 row: {len(indiv)}건')
key_map = {}
for r in indiv:
    key = (r['ceo'], r['resident_or_corp_no'])
    key_map.setdefault(key, []).append(r)
unique_indiv = len(key_map)
multi = {k: v for k, v in key_map.items() if len(v) > 1}
print(f'   unique 개인 user: {unique_indiv}명')
print(f'   같은 사람 multi 사업장: {len(multi)}명')
homonyms_map = {}
for (name, rrn), rs in key_map.items():
    homonyms_map.setdefault(name, []).append(rrn)
homonyms = {k: v for k, v in homonyms_map.items() if len(v) > 1}
print(f'   동명이인 (같은 이름 다른 주민번호): {len(homonyms)}명')
for name, rrns in homonyms.items():
    print(f'     · {name}: {len(rrns)}개 주민번호 → {len(rrns)} user')

# 최종 예상
print()
print('=' * 70)
print('>> 308 row → 예상 결과:')
print('=' * 70)
print(f'   사업장 (business): {len(rows)}건 (사업자번호 unique)')
indiv_users = unique_indiv
corp_users = len(corp_groups)
print(f'   개인 user: {indiv_users}명')
print(f'   법인 user: {corp_users}명')
print(f'   합계 user: {indiv_users + corp_users}명 (308 row 대비 {(308-(indiv_users+corp_users))}row dedup 절약)')
