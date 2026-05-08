import json, urllib.request

# 옆커폰 검색
req = urllib.request.Request(
    'https://sewmu-chatbot.pages.dev/api/admin-businesses?key=1111&search=' + urllib.parse.quote('옆커폰'),
    headers={'User-Agent': 'Mozilla/5.0'},
)
with urllib.request.urlopen(req, timeout=60) as r:
    d = json.loads(r.read().decode('utf-8'))
bizs = d.get('businesses', [])
print(f'옆커폰 검색: {len(bizs)}개')
for b in bizs[:20]:
    pid = b.get('parent_business_id')
    cn = b.get('corporate_number')
    pmark = f' (지점, parent={pid})' if pid else ''
    print(f"  id={b.get('id')} | {b.get('company_name','')[:50]} | corp={cn}{pmark}")

# 직접 id=3 확인
print('\n=== id=3 (주식회사 옆커폰(유킹본점)) ===')
req2 = urllib.request.Request(
    'https://sewmu-chatbot.pages.dev/api/admin-businesses?key=1111&id=3',
    headers={'User-Agent': 'Mozilla/5.0'},
)
with urllib.request.urlopen(req2, timeout=60) as r:
    d2 = json.loads(r.read().decode('utf-8'))
biz = d2.get('business', {})
print(f"company: {biz.get('company_name')}")
print(f"id: {biz.get('id')}, parent_business_id: {biz.get('parent_business_id')}")
print(f"corporate_number: {biz.get('corporate_number')}")
print(f"branches: {len(d2.get('branches', []))}")
print(f"parent: {d2.get('parent')}")

# 174811-0101397 그룹 모든 row
print('\n=== corporate_number=174811-0101397 모든 사업장 (재검색) ===')
req3 = urllib.request.Request(
    'https://sewmu-chatbot.pages.dev/api/admin-businesses?key=1111&search=' + urllib.parse.quote('유킹지점'),
    headers={'User-Agent': 'Mozilla/5.0'},
)
with urllib.request.urlopen(req3, timeout=60) as r:
    d3 = json.loads(r.read().decode('utf-8'))
bizs3 = d3.get('businesses', [])
for b in bizs3[:20]:
    pid = b.get('parent_business_id')
    print(f"  id={b.get('id')} | {b.get('company_name','')[:50]} | corp={b.get('corporate_number')} | parent={pid}")
