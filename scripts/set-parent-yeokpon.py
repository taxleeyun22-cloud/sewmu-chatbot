"""주식회사 옆커폰(유킹본점) 을 174811-0101397 그룹 14개 옆커폰 지점의 본점으로 일괄 매핑."""
import json, urllib.request, urllib.error, time, sys

BASE = 'https://sewmu-chatbot.pages.dev'
KEY = '1111'

def call(path, method='GET', body=None):
    url = f'{BASE}{path}'
    if '?' in path:
        url += f'&key={KEY}'
    else:
        url += f'?key={KEY}'
    data = json.dumps(body, ensure_ascii=False).encode('utf-8') if body else None
    headers = {'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json'}
    if body:
        headers['Content-Type'] = 'application/json; charset=utf-8'
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8') if e.fp else ''
        return {'ok': False, 'error': f'HTTP {e.code}: {body[:500]}'}
    except Exception as e:
        return {'ok': False, 'error': f'fetch fail: {e}'}

# 1. 본점 검색 — "유킹본점" 키워드
print('=== 1. 사장님 본점 검색 ("유킹본점" 또는 "옆커폰") ===')
search_keywords = ['유킹본점', '주식회사 옆커폰(유킹본점)', '주식회사 옆커폰']
for kw in search_keywords:
    print(f'\n>>> "{kw}" 검색:')
    r = call(f'/api/admin-businesses?search={urllib.request.quote(kw)}', 'GET')
    bizs = r.get('businesses', [])[:10] if isinstance(r, dict) else []
    for b in bizs:
        print(f'   id={b.get("id")} | {b.get("company_name")} | 사업자={b.get("business_number")} | 법인={b.get("corporate_number")} | 대표={b.get("ceo_name")}')

# 2. 사장님 본점 결정 — 가장 정확한 후보
print('\n=== 2. set_parent_for_corp 호출 시도 (main_keyword="유킹본점") ===')
r = call('/api/admin-bulk-import-clients?action=set_parent_for_corp', 'POST', {
    'corp_no': '174811-0101397',
    'main_keyword': '유킹본점',
})
print(json.dumps(r, ensure_ascii=False, indent=2))
