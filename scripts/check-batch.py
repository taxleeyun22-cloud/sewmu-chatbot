import json, urllib.request, sys
bid = sys.argv[1] if len(sys.argv) > 1 else '23'
req = urllib.request.Request(
    f'https://sewmu-chatbot.pages.dev/api/admin-import-batches?id={bid}&key=1111',
    headers={'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json'},
)
with urllib.request.urlopen(req, timeout=60) as r:
    d = json.loads(r.read().decode('utf-8'))
b = d.get('batch', {})
print(f"id: {b.get('id')}")
print(f"status: {b.get('status')}")
print(f"committed_at: {b.get('committed_at')}")
print(f"rolled_back_at: {b.get('rolled_back_at')}")
print(f"inserted_users: {b.get('inserted_users')}")
print(f"inserted_businesses: {b.get('inserted_businesses')}")
print(f"inserted_members: {b.get('inserted_members')}")
print(f"enriched_users: {b.get('enriched_users')}")
audit = b.get('audit_log')
if audit:
    try:
        a = json.loads(audit)
        print(f"audit_log entries: {len(a) if isinstance(a, list) else 'object'}")
        if isinstance(a, list):
            errors = [e for e in a if 'error' in str(e).lower()]
            print(f"errors in audit: {len(errors)}")
            for e in errors[:5]:
                print(f"  {e}")
    except:
        print(f"audit_log raw: {audit[:500]}")
