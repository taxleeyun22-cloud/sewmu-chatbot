/**
 * Phase Next-Day28 (2026-05-11): /admin/businesses/[id] — shadcn/ui + Toast + 위하고 14 필드.
 * 사장님 명령 "구글직원처럼 + 50개 쪼개기".
 */
'use client';

export const runtime = 'edge';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { trpcCall } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/toast';

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
    trpcCall<typeof data>('businesses.get', { id })
      .then(setData)
      .catch((e) => toast.error(`업체 정보 로드 실패: ${e.message}`));
  }, [id]);

  if (!data) {
    return (
      <div className="p-4">
        <Card>
          <CardContent className="py-6 text-center text-gray-400 text-xs">불러오는 중...</CardContent>
        </Card>
      </div>
    );
  }

  if (!data.business) {
    return (
      <div className="p-4">
        <Card className="bg-red-50 border-red-200">
          <CardContent className="py-6 text-center text-red-700 text-xs">업체를 찾을 수 없습니다.</CardContent>
        </Card>
      </div>
    );
  }

  const b = data.business;

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-3">
      {/* 헤더 */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2 flex-wrap">
                <span>{b.parent_business_id ? '📍' : '🏢'}</span>
                {b.company_name}
                {b.parent_business_id && <Badge variant="primary">지점</Badge>}
                {b.status === 'closed' && <Badge variant="default">📦 종료</Badge>}
                {b.status === 'terminated' && <Badge variant="danger">🚫 이관</Badge>}
                {(!b.status || b.status === 'active') && <Badge variant="success">✓ 활성</Badge>}
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">
                {b.business_number} {b.ceo_name && `· 대표 ${b.ceo_name}`}
              </p>
            </div>
            <Link href="/admin/businesses">
              <Button size="sm" variant="outline">← 목록</Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* 본·지점 */}
      {data.parent && (
        <Link href={`/admin/businesses/${data.parent.id}`}>
          <Card className="hover:bg-blue-50 border-blue-200 cursor-pointer transition-colors">
            <CardContent className="py-2.5 px-4">
              <p className="text-[10px] text-blue-700 font-medium">🏢 본점</p>
              <p className="text-sm font-bold mt-0.5">{data.parent.company_name}</p>
            </CardContent>
          </Card>
        </Link>
      )}

      {data.branches.length > 0 && (
        <Card>
          <CardHeader className="pb-1.5">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <span>📍</span> 지점 <Badge variant="primary">{data.branches.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {data.branches.map((br) => (
                <li key={br.id}>
                  <Link
                    href={`/admin/businesses/${br.id}`}
                    className="block px-2 py-1.5 border border-gray-200 rounded hover:border-brand-primary hover:bg-gray-50 transition-colors"
                  >
                    <p className="text-xs font-medium">{br.company_name}</p>
                    <p className="text-[10px] text-gray-500">
                      {br.business_number} · {br.ceo_name}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* 위하고 14필드 */}
      <Card>
        <CardHeader className="pb-1.5">
          <CardTitle className="text-xs flex items-center gap-1.5">
            <span>📋</span> 기본 정보 <Badge variant="default">위하고 호환</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
            <Field label="회사명" value={b.company_name} />
            <Field label="회사구분" value={b.company_form} />
            <Field label="사업자번호" value={b.business_number} mono />
            <Field label="대표자" value={b.ceo_name} />
            <Field label="업태" value={b.business_category} />
            <Field label="업종" value={b.industry} />
            <Field label="과세유형" value={b.tax_type} />
            <Field label="개업일" value={b.establishment_date} mono />
            <Field label="사업장주소" value={b.address} className="col-span-2 md:col-span-3" />
            <Field label="사업장전화" value={b.phone} mono />
            <Field
              label="회계기간"
              value={
                b.fiscal_year_start && b.fiscal_year_end
                  ? `${b.fiscal_year_start} ~ ${b.fiscal_year_end}`
                  : null
              }
              mono
            />
            <Field label="기수" value={b.fiscal_term?.toString() || null} />
          </dl>
        </CardContent>
      </Card>

      {/* 메모 + 신고 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <BusinessMemos businessId={id} />
        <BusinessFilings businessId={id} />
      </div>
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
    })
      .then((d) => setMemos(d.memos || []))
      .catch(() => {});
  }, [businessId]);

  return (
    <Card>
      <CardHeader className="pb-1.5">
        <CardTitle className="text-xs flex items-center gap-1.5">
          <span>📒</span> 메모 <Badge variant="default">{memos.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {memos.length === 0 ? (
          <p className="text-[11px] text-gray-400">메모 없음</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {memos.map((m) => (
              <li key={m.id} className="py-1.5 text-xs">
                <p className="leading-snug">{m.content}</p>
                {m.due_date && (
                  <span className="text-[10px] text-gray-500 font-mono">📅 {m.due_date}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
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
    })
      .then((d) => setFilings(d.filings || []))
      .catch(() => {});
  }, [businessId]);

  return (
    <Card>
      <CardHeader className="pb-1.5">
        <CardTitle className="text-xs flex items-center justify-between gap-1.5">
          <span className="flex items-center gap-1.5">
            <span>📋</span> 신고 검토표 <Badge variant="default">{filings.length}</Badge>
          </span>
          <Button size="xs">+ 새 Case</Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {filings.length === 0 ? (
          <p className="text-[11px] text-gray-400">신고 Case 없음</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filings.map((f) => (
              <li key={f.id} className="py-1.5 text-xs flex items-center justify-between">
                <span>
                  [{f.fiscal_year}] {f.type}
                </span>
                <Badge variant="default">{f.review_status || '작성중'}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  className,
  mono,
}: {
  label: string;
  value: string | null;
  className?: string;
  mono?: boolean;
}) {
  return (
    <div className={className}>
      <dt className="text-[10px] text-gray-500">{label}</dt>
      <dd className={`font-medium ${mono ? 'font-mono' : ''}`}>{value || '-'}</dd>
    </div>
  );
}
