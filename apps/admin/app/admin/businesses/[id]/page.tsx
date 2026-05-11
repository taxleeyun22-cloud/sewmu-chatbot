/**
 * Phase Next-Day11 (2026-05-09): /admin/businesses/[id] — 업체 dashboard.
 */
'use client';

export const runtime = 'edge';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { trpcCall } from '@/lib/trpc';

interface Business {
  id: number;
  company_name: string | null;
  business_number: string | null;
  ceo_name: string | null;
  company_form: string | null;
  business_category: string | null;
  industry: string | null;
  tax_type: string | null;
  address: string | null;
  phone: string | null;
  establishment_date: string | null;
  fiscal_year_start: string | null;
  fiscal_year_end: string | null;
  fiscal_term: number | null;
  status: string | null;
  parent_business_id: number | null;
  notes: string | null;
}

export default function BusinessDetailPage() {
  const params = useParams();
  const id = parseInt(params.id as string, 10);
  const [data, setData] = useState<{
    business: Business | null;
    branches: Business[];
    parent: Business | null;
  } | null>(null);

  useEffect(() => {
    trpcCall<typeof data>('businesses.get', { id }).then(setData);
  }, [id]);

  if (!data) {
    return <div className="p-6 text-gray-400">불러오는 중...</div>;
  }

  if (!data.business) {
    return <div className="p-6 text-red-500">업체를 찾을 수 없습니다.</div>;
  }

  const b = data.business;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link href="/admin/businesses" className="text-brand-primary text-sm">
        ← 업체 list
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mt-2 mb-6">
        🏢 {b.company_name}
        {b.parent_business_id && (
          <span className="ml-2 text-sm bg-blue-100 text-blue-700 px-2 py-1 rounded">
            지점
          </span>
        )}
      </h1>

      {/* 본·지점 */}
      {data.parent && (
        <Link
          href={`/admin/businesses/${data.parent.id}`}
          className="block bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 hover:bg-blue-100"
        >
          <p className="text-xs text-blue-700 font-medium mb-1">🏢 본점</p>
          <p className="font-bold">{data.parent.company_name}</p>
        </Link>
      )}

      {data.branches.length > 0 && (
        <section className="bg-white rounded-2xl p-5 mb-4">
          <h2 className="font-bold mb-3">📍 지점 ({data.branches.length})</h2>
          <ul className="space-y-2">
            {data.branches.map((br) => (
              <li key={br.id}>
                <Link
                  href={`/admin/businesses/${br.id}`}
                  className="block p-3 border rounded hover:border-brand-primary"
                >
                  <p className="font-medium">{br.company_name}</p>
                  <p className="text-xs text-gray-500">
                    {br.business_number} · {br.ceo_name}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 위하고 14필드 */}
      <section className="bg-white rounded-2xl p-5 mb-4">
        <h2 className="font-bold mb-3">📋 기본 정보 (위하고 호환)</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Field label="회사명" value={b.company_name} />
          <Field label="회사구분" value={b.company_form} />
          <Field label="사업자번호" value={b.business_number} />
          <Field label="대표자" value={b.ceo_name} />
          <Field label="업태" value={b.business_category} />
          <Field label="업종" value={b.industry} />
          <Field label="과세유형" value={b.tax_type} />
          <Field label="개업일" value={b.establishment_date} />
          <Field label="사업장주소" value={b.address} className="col-span-2" />
          <Field label="사업장전화" value={b.phone} />
          <Field
            label="회계기간"
            value={
              b.fiscal_year_start && b.fiscal_year_end
                ? `${b.fiscal_year_start} ~ ${b.fiscal_year_end}`
                : null
            }
          />
          <Field label="기수" value={b.fiscal_term?.toString() || null} />
          <Field label="상태" value={b.status || 'active'} />
        </dl>
      </section>

      {/* 메모 */}
      <BusinessMemos businessId={id} />

      {/* 신고 검토표 */}
      <BusinessFilings businessId={id} />
    </div>
  );
}

function BusinessMemos({ businessId }: { businessId: number }) {
  const [memos, setMemos] = useState<
    { id: number; content: string; due_date: string | null }[]
  >([]);
  useEffect(() => {
    trpcCall<{ memos: typeof memos }>('memos.list', {
      scope: 'business_all',
      business_id: businessId,
      limit: 50,
    }).then((d) => setMemos(d.memos || []));
  }, [businessId]);

  return (
    <section className="bg-white rounded-2xl p-5 mb-4">
      <h2 className="font-bold mb-3">📒 메모 ({memos.length})</h2>
      {memos.length === 0 ? (
        <p className="text-sm text-gray-400">메모 없음</p>
      ) : (
        <ul className="space-y-2">
          {memos.map((m) => (
            <li key={m.id} className="text-sm border-b py-2 last:border-b-0">
              {m.content}
              {m.due_date && (
                <span className="text-xs text-gray-500 ml-2">📅 {m.due_date}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BusinessFilings({ businessId }: { businessId: number }) {
  const [filings, setFilings] = useState<
    {
      id: number;
      type: string | null;
      fiscal_year: number | string;
      review_status: string | null;
    }[]
  >([]);
  useEffect(() => {
    trpcCall<{ filings: typeof filings }>('filings.list', {
      owner_type: 'Business',
      owner_id: businessId,
    }).then((d) => setFilings(d.filings || []));
  }, [businessId]);

  return (
    <section className="bg-white rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold">📋 신고 검토표 ({filings.length})</h2>
        <button className="text-xs bg-brand-primary text-white px-3 py-1 rounded">
          + 새 Case
        </button>
      </div>
      {filings.length === 0 ? (
        <p className="text-sm text-gray-400">신고 Case 없음</p>
      ) : (
        <ul className="space-y-2">
          {filings.map((f) => (
            <li key={f.id} className="text-sm border-b py-2 last:border-b-0">
              [{f.fiscal_year}귀속] {f.type} —
              <span className="ml-2 text-xs bg-gray-100 px-2 py-0.5 rounded">
                {f.review_status || '작성중'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Field({
  label,
  value,
  className,
}: {
  label: string;
  value: string | null;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="font-medium mt-0.5">{value || '-'}</dd>
    </div>
  );
}
