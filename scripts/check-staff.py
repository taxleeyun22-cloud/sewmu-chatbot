import json, urllib.request, urllib.parse

for q in ['이재윤', '채승용']:
    req = urllib.request.Request(
        'https://sewmu-chatbot.pages.dev/api/admin-search?key=1111&q=' + urllib.parse.quote(q),
        headers={'User-Agent': 'Mozilla/5.0'},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        d = json.loads(r.read().decode('utf-8'))
    users = d.get('users') or []
    print(f'\n=== {q} 검색: {len(users)}명 ===')
    for u in users:
        print(f"  id={u.get('id')} | {u.get('real_name')} ({u.get('name')}) | {u.get('provider')} | status={u.get('approval_status')} | is_admin={u.get('is_admin')} | deleted_at={u.get('deleted_at')} | last_login={u.get('last_login_at')} | prof={'O' if u.get('profile_image') else 'X'}")
        print(f"     phone={u.get('phone')} | provider_user_id={u.get('provider_user_id')} | provider_id={u.get('provider_id')} | birth_date={u.get('birth_date')}")
