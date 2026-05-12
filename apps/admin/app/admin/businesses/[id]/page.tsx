/**
 * Phase Next-Day28 (2026-05-11): /admin/businesses/[id] — customer.businessDashboard.
 * 사장님 명령: "여기도 개판" — 4 영역 (매핑사람/상담방/메모/사업장문서) 추가.
 */
'use client';

export const runtime = 'edge';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { trpcCall } from '@/lib/trpc';
import { toast } from '@/components/ui/toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Building2, MapPin, Users, MessageSquare, StickyNote, FileText, ClipboardList,
  ArrowLeft, Package, Ban, CheckCircle2, Crown, Phone, Mail,
} from 'lucide-react';

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
  fiscal_term: number | null;
  status: string | null;
  parent_business_id: number | null;
  notes: string | null;
}

interface Member {
  user_id: number;
  real_name: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  approval_status: string | null;
  is_admin: number | null;
  role: string | null;
  is_primary: number | null;
}

interface Room {
  id: string;
  name: string | null;
  status: string | null;
  ai_mode: string | null;
  priority: number | null;
  is_primary: number | null;
}

interface Memo {
  id: number;
  content: string;
  category: string | null;
  due_date: string | null;
  created_at: string | null;
}

interface Doc {
  id: number;
  doc_type: string | null;
  status: string | null;
  vendor: string | null;
  amount: number | null;
  receipt_date: string | null;
}

export default function BusinessDetailPage() {
  const params = useParams();
  const id = parseInt(params.id as string, 10);

  const { data, isLoading, error } = useQuery({
    queryKey: ['customer.businessDashboard', id],
    queryFn: () => trpcCall<{
      business: Business | null;
      members: Member[];
      rooms: Room[];
      memos: Memo[];
      docs: Doc[];
      branches: Business[];
      parent: Business | null;
    }>('customer.businessDashboard', { businessId: id }),
    enabled: Number.isFinite(id),
  });

  if (error) toast.error(`업체 로드 실패: ${(error as Error).message}`);

  if (isLoading) {
    return (
      <div className="p-4 space-y-3 max-w-6xl mx-auto">
        <Card><CardContent className="py-3"><Skeleton className="h-8 w-1/2" /></CardContent></Card>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="py-4"><Skeleton className="h-24" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  if (!data?.business) {
    return (
      <div className="p-4 max-w-3xl mx-auto">
        <Card className="bg-red-50 border-red-200">
          <CardContent className="py-6 text-center text-red-700 text-xs">업체를 찾을 수 없습니다.</CardContent>
        </Card>
      </div>
    );
  }

  const b = data.business;
  const branches = data.branches || [];

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-3">
      {/* 헤더 */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2 flex-wrap">
                {b.parent_business_id ? (
                  <MapPin size={16} strokeWidth={2} className="text-blue-500" />
                ) : (
                  <Building2 size={16} strokeWidth={2} className="text-gray-700" />
                )}
                {b.company_name}
                {b.parent_business_id && <Badge variant="primary">지점</Badge>}
                {b.status === 'closed' && <Badge variant="default"><Package size={9} strokeWidth={2} className="mr-0.5" />종료</Badge>}
                {b.status === 'terminated' && <Badge variant="danger"><Ban size={9} strokeWidth={2} className="mr-0.5" />이관</Badge>}
                {(!b.status || b.status === 'active') && <Badge variant="success"><CheckCircle2 size={9} strokeWidth={2} className="mr-0.5" />활성</Badge>}
              </h1>
              <p className="text-xs text-gray-500 mt-0.5 font-mono">
                {b.business_number} {b.ceo_name && `· 대표 ${b.ceo_name}`}
              </p>
            </div>
            <Link href="/admin/businesses">
              <Button size="sm" variant="outline"><ArrowLeft size={12} strokeWidth={2} className="mr-1" />목록</Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* 본·지점 */}
      {data.parent && (
        <Link href={`/admin/businesses/${data.parent.id}`}>
          <Card className="hover:bg-blue-50 border-blue-200 cursor-pointer transition-colors">
            <CardContent className="py-2.5 px-4">
              <p className="text-[10px] text-blue-700 font-medium flex items-center gap-1"><Building2 size={11} strokeWidth={2} />본점</p>
              <p className="text-sm font-bold mt-0.5">{data.parent.company_name}</p>
            </CardContent>
          </Card>
        </Link>
      )}

      {branches.length > 0 && (
        <Card>
          <CardHeader className="pb-1.5">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <MapPin size={12} strokeWidth={2} />지점 <Badge variant="primary">{branches.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {branches.map((br) => (
                <li key={br.id}>
                  <Link href={`/admin/businesses/${br.id}`}
                    className="block px-2 py-1.5 border border-gray-200 rounded hover:border-brand-primary hover:bg-gray-50 transition-colors">
                    <p className="text-xs font-medium">{br.company_name}</p>
                    <p className="text-[10px] text-gray-500 font-mono">{br.business_number} · {br.ceo_name}</p>
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
            <ClipboardList size={12} strokeWidth={2} />기본 정보 <Badge variant="default">위하고 호환</Badge>
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
            <Field label="회계기간" value={b.fiscal_year_start || null} mono />
            <Field label="기수" value={b.fiscal_term?.toString() || null} />
          </dl>
        </CardContent>
      </Card>

      {/* 매핑 사람 + 상담방 (2 column) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-1.5">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <Users size={12} strokeWidth={2} />매핑 사람 <Badge variant="default">{data.members.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.members.length === 0 ? (
              <EmptyState title="없음" className="py-2" />
            ) : (
              <ul className="divide-y divide-gray-100">
                {data.members.map((m) => (
                  <li key={m.user_id} className="py-1.5">
                    <Link href={`/admin/users/${m.user_id}`} className="block hover:bg-gray-50 px-1 -mx-1 rounded">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-xs font-medium">
                          {m.real_name || m.name || `#${m.user_id}`}
                          {m.is_admin === 1 && <Badge variant="secondary" className="ml-1"><Crown size={9} strokeWidth={2} />관리자</Badge>}
                          {m.is_primary === 1 && <Badge variant="warning" className="ml-1">★ 주</Badge>}
                        </span>
                        {m.role && <Badge variant="default">{m.role}</Badge>}
                      </div>
                      {(m.phone || m.email) && (
                        <p className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-2">
                          {m.phone && <span className="flex items-center gap-0.5"><Phone size={9} strokeWidth={2} />{m.phone}</span>}
                          {m.email && <span className="flex items-center gap-0.5"><Mail size={9} strokeWidth={2} />{m.email}</span>}
                        </p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1.5">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <MessageSquare size={12} strokeWidth={2} />매핑 상담방 <Badge variant="default">{data.rooms.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.rooms.length === 0 ? (
              <EmptyState title="없음" className="py-2" />
            ) : (
              <ul className="divide-y divide-gray-100">
                {data.rooms.map((r) => (
                  <li key={r.id} className="py-1.5">
                    <Link href={`/admin/rooms/${r.id}`} className="block hover:bg-gray-50 px-1 -mx-1 rounded">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-xs font-medium">
                          {r.name || `방 ${r.id}`}
                          {r.is_primary === 1 && <Badge variant="warning" className="ml-1">★ 주</Badge>}
                        </span>
                        <span className="flex gap-1">
                          {r.ai_mode === 'on' && <Badge variant="primary">AI</Badge>}
                          <Badge variant={r.status === 'active' ? 'success' : 'default'}>{r.status}</Badge>
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500 font-mono mt-0.5">{r.id}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 메모 + 사업장 문서 (2 column) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-1.5">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <StickyNote size={12} strokeWidth={2} />메모 <Badge variant="default">{data.memos.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.memos.length === 0 ? (
              <EmptyState title="메모 없음" className="py-2" />
            ) : (
              <ul className="divide-y divide-gray-100">
                {data.memos.map((m) => (
                  <li key={m.id} className="py-1.5 text-xs">
                    <p className="leading-snug whitespace-pre-wrap">{m.content}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {m.category && <Badge variant="default">{m.category}</Badge>}
                      {m.due_date && <span className="text-[10px] text-gray-500 font-mono">📅 {m.due_date}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1.5">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <FileText size={12} strokeWidth={2} />사업장 문서 <Badge variant="default">{data.docs.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.docs.length === 0 ? (
              <EmptyState title="문서 없음" className="py-2" />
            ) : (
              <ul className="divide-y divide-gray-100">
                {data.docs.slice(0, 20).map((d) => (
                  <li key={d.id} className="py-1.5 text-xs flex items-center justify-between">
                    <span>
                      <span className="font-medium">{d.doc_type}</span>
                      {d.vendor && <span className="text-gray-500 ml-1">· {d.vendor}</span>}
                      {d.amount && <span className="font-mono ml-1">· {d.amount.toLocaleString()}원</span>}
                    </span>
                    <Badge variant={d.status === 'approved' ? 'success' : d.status === 'rejected' ? 'danger' : 'warning'}>
                      {d.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value, className, mono }: { label: string; value: string | null; className?: string; mono?: boolean }) {
  return (
    <div className={className}>
      <dt className="text-[10px] text-gray-500">{label}</dt>
      <dd className={`font-medium ${mono ? 'font-mono' : ''}`}>{value || '-'}</dd>
    </div>
  );
}
