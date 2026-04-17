// 관리자: CSV 일괄 업로드 (위하고/세무사랑 Export 대응)
// body: { rows: [ { company_name, business_number, ceo_name, industry, ... }, ... ], auto_approve: true }

function checkAuth(url, env) {
  const key = url.searchParams.get("key");
  return env.ADMIN_KEY && key === env.ADMIN_KEY;
}

async function ensureTables(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS client_profiles (
    user_id INTEGER PRIMARY KEY,
    company_name TEXT,
    business_number TEXT,
    ceo_name TEXT,
    industry TEXT,
    business_type TEXT,
    tax_type TEXT,
    establishment_date TEXT,
    address TEXT,
    phone TEXT,
    employee_count INTEGER,
    last_revenue INTEGER,
    vat_period TEXT,
    notes TEXT,
    updated_at TEXT,
    updated_by TEXT
  )`).run();

  // unbound 프로필 (아직 가입 전인 거래처) - 나중에 가입하면 자동 연결
  await db.prepare(`CREATE TABLE IF NOT EXISTS unbound_client_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT,
    business_number TEXT UNIQUE,
    ceo_name TEXT,
    industry TEXT,
    business_type TEXT,
    tax_type TEXT,
    establishment_date TEXT,
    address TEXT,
    phone TEXT,
    employee_count INTEGER,
    last_revenue INTEGER,
    vat_period TEXT,
    notes TEXT,
    created_at TEXT,
    matched_user_id INTEGER
  )`).run();
}

function normBizNo(v) {
  return (v || "").replace(/\D/g, "");
}

function normPhone(v) {
  const d = (v || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("010")) return `${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`;
  return v || null;
}

export async function onRequestPost(context) {
  const url = new URL(context.request.url);
  if (!checkAuth(url, context.env)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  await ensureTables(db);

  try {
    const body = await context.request.json();
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const autoApprove = body.auto_approve !== false; // 기본 true

    if (rows.length === 0) return Response.json({ error: "빈 CSV입니다" }, { status: 400 });
    if (rows.length > 2000) return Response.json({ error: "한 번에 최대 2000행까지 가능합니다" }, { status: 400 });

    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);

    let matchedApproved = 0; // 기존 가입자 프로필 연결 + 기장승격
    let unboundCreated = 0; // 미가입 거래처 프로필 저장
    let skipped = 0;
    const errors = [];

    for (const row of rows) {
      try {
        const biz = normBizNo(row.business_number);
        if (!biz || biz.length !== 10) {
          skipped++;
          continue;
        }

        const profile = {
          company_name: row.company_name || null,
          business_number: biz,
          ceo_name: row.ceo_name || null,
          industry: row.industry || null,
          business_type: row.business_type || null,
          tax_type: row.tax_type || null,
          establishment_date: row.establishment_date || null,
          address: row.address || null,
          phone: normPhone(row.phone),
          employee_count: row.employee_count != null && row.employee_count !== '' ? Number(row.employee_count) : null,
          last_revenue: row.last_revenue != null && row.last_revenue !== '' ? Number(row.last_revenue) : null,
          vat_period: row.vat_period || null,
          notes: row.notes || null,
        };

        // 1) 사업자번호 + 전화번호 기준으로 기존 users 매칭 시도
        let matchedUser = null;
        if (profile.phone) {
          matchedUser = await db.prepare(
            `SELECT id FROM users WHERE phone = ? LIMIT 1`
          ).bind(profile.phone).first();
        }

        if (matchedUser) {
          // 2-a) 기존 가입자 프로필 연결
          await db.prepare(`
            INSERT INTO client_profiles (
              user_id, company_name, business_number, ceo_name, industry,
              business_type, tax_type, establishment_date, address, phone,
              employee_count, last_revenue, vat_period, notes, updated_at, updated_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin-bulk')
            ON CONFLICT(user_id) DO UPDATE SET
              company_name = excluded.company_name,
              business_number = excluded.business_number,
              ceo_name = excluded.ceo_name,
              industry = excluded.industry,
              business_type = excluded.business_type,
              tax_type = excluded.tax_type,
              establishment_date = excluded.establishment_date,
              address = excluded.address,
              phone = COALESCE(excluded.phone, client_profiles.phone),
              employee_count = excluded.employee_count,
              last_revenue = excluded.last_revenue,
              vat_period = excluded.vat_period,
              notes = excluded.notes,
              updated_at = excluded.updated_at,
              updated_by = excluded.updated_by
          `).bind(
            matchedUser.id,
            profile.company_name, profile.business_number, profile.ceo_name,
            profile.industry, profile.business_type, profile.tax_type,
            profile.establishment_date, profile.address, profile.phone,
            profile.employee_count, profile.last_revenue, profile.vat_period,
            profile.notes, kst
          ).run();

          // 자동 기장거래처 승격
          if (autoApprove) {
            await db.prepare(
              `UPDATE users SET approval_status = 'approved_client', approved_at = ?, approved_by = 'admin-bulk' WHERE id = ?`
            ).bind(kst, matchedUser.id).run();
          }

          matchedApproved++;
        } else {
          // 2-b) 미가입 — unbound_client_profiles에 저장 (나중에 가입 시 자동 매칭)
          await db.prepare(`
            INSERT INTO unbound_client_profiles (
              company_name, business_number, ceo_name, industry,
              business_type, tax_type, establishment_date, address, phone,
              employee_count, last_revenue, vat_period, notes, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(business_number) DO UPDATE SET
              company_name = excluded.company_name,
              ceo_name = excluded.ceo_name,
              industry = excluded.industry,
              business_type = excluded.business_type,
              tax_type = excluded.tax_type,
              establishment_date = excluded.establishment_date,
              address = excluded.address,
              phone = excluded.phone,
              employee_count = excluded.employee_count,
              last_revenue = excluded.last_revenue,
              vat_period = excluded.vat_period,
              notes = excluded.notes
          `).bind(
            profile.company_name, profile.business_number, profile.ceo_name,
            profile.industry, profile.business_type, profile.tax_type,
            profile.establishment_date, profile.address, profile.phone,
            profile.employee_count, profile.last_revenue, profile.vat_period,
            profile.notes, kst
          ).run();

          unboundCreated++;
        }
      } catch (e) {
        errors.push({ row, error: e.message });
      }
    }

    return Response.json({
      ok: true,
      total: rows.length,
      matched_approved: matchedApproved,
      unbound_created: unboundCreated,
      skipped,
      error_count: errors.length,
      errors: errors.slice(0, 10),
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
