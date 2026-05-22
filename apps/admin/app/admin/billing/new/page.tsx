/**
 * Phase D4-2 (2026-05-21): /admin/billing/new — 새 청구서 발행 page.
 *
 * URL 파라미터 자동 진입:
 *   ?business_id=N — 그 사업장 자동 선택
 *   ?user_id=N — 그 거래처 자동 선택 (매핑 사업장 picker)
 *   ?filing_id=N — 검토표 데이터 자동 prefill
 *
 * 흐름:
 *   1. 사업장/사람 선택 (URL 또는 picker)
 *   2. 최신 검토표 자동 fetch → 수입금액·s3 자동 채움
 *   3. 사장님이 S2 (활증업무) / 할인액 수기 입력
 *   4. 미리보기 갱신
 *   5. "💾 발행" → POST /api/trpc/billing.create → D1 저장 → /admin/billing 로 이동
 *
 * 사장님 룰: 할인액 절대 자동 X — 수기만.
 */
'use client';
export const runtime = 'edge';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import { trpcCall } from '@/lib/trpc';
import { S2PickerModal, type S2Item as S2ItemType } from '@/components/billing/S2PickerModal';
import { S3PickerModal, type S3Item as S3ItemType } from '@/components/billing/S3PickerModal';
import { InvoicePreview } from '@/components/billing/InvoicePreview';
import { BusinessCombobox } from '@/components/billing/BusinessCombobox';
import { PersonCombobox } from '@/components/billing/PersonCombobox';
/* 사장님 명령 (2026-05-21): 계산·룰 단일 진실 (SSoT) — inline 중복 제거, 전부 이 모듈에서 */
import {
  formatWon,
  calcGain,
  calcInvoice,
  normalizeCatalogItem,
  type S2Item,
  type S3Item,
  type CatalogItem,
  type FeeRuleRow,
} from '@/lib/billing-calc';

interface BusinessRow {
  id: number;
  company_name: string | null;
  company_form: string | null;
  tax_type: string | null;
  ceo_name: string | null;
  business_number: string | null;
}

interface S2OptionTpl {
  name: string;
  type?: 'unit' | 'rate' | 'direct';
  val?: number;
  desc?: string;
}
interface FeeRuleTpl {
  tariff?: number[][];
  s2_options?: S2OptionTpl[];
}
interface TemplateData {
  greeting?: string;
  bank_info?: string;
  office_address?: string;
  office_phone?: string;
  signature_text?: string;
  firm_name?: string;
  fee_rule_corp?: FeeRuleTpl;
  fee_rule_indv?: FeeRuleTpl;
}

export default function NewInvoicePage() {
  const router = useRouter();
  const sp = useSearchParams();
  const preBizId = Number(sp.get('business_id') || 0);
  const preUserId = Number(sp.get('user_id') || 0);
  const preFilingId = Number(sp.get('filing_id') || 0);

  /* Form state */
  const [bizId, setBizId] = useState<number>(preBizId);
  const [userId, setUserId] = useState<number>(preUserId);
  const [userLabel, setUserLabel] = useState<string>('');
  /* 사장님 명령 (2026-05-21): "사람이랑 업체가있어야하는거 아님" — 모드 토글.
   * URL ?user_id=N 으로 들어오면 person, ?business_id=N 이면 business, 둘 다 없으면 person default
   * (billing-preview.html v-cust 의 setCustMode('person') 와 동일) */
  const [mode, setMode] = useState<'person' | 'business'>(
    preUserId ? 'person' : preBizId ? 'business' : 'person',
  );
  /* 사장님 명령 (2026-05-21): "소득세 검토표는 원래 개인에 있잖아" — person 모드는 종소세,
   * business 모드는 법인세 기본. taxType 자동 동기. */
  useEffect(() => {
    if (mode === 'person') {
      setTaxType('종소세');
      setBasicType('개인장부대행 및 개인조정');
    } else {
      setTaxType('법인세');
      setBasicType('법인장부대행 및 법인조정');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  const [year, setYearRaw] = useState<number>(new Date().getFullYear());
  /* 사장님 보고 (2026-05-21): "received: nan" tRPC 400 — setYear 가 NaN/string 받지 않게 wrap */
  function setYear(v: unknown) {
    const n = Number(v);
    setYearRaw(Number.isFinite(n) && n >= 2000 && n <= 2100 ? n : new Date().getFullYear());
  }
  const [taxType, setTaxType] = useState<'법인세' | '종소세' | '부가세'>('법인세');
  const [basicType, setBasicType] = useState<string>('법인장부대행 및 법인조정');
  const [revenue, setRevenue] = useState<number>(0);
  const [asset, setAsset] = useState<number>(0);
  const [bizType, setBizType] = useState<string>('제조');
  const [discount, setDiscount] = useState<string>(''); // 빈 칸 default — 사장님 룰
  const [s2Items, setS2Items] = useState<S2Item[]>([]);
  const [s3Items, setS3Items] = useState<S3Item[]>([]);
  const [s2ModalOpen, setS2ModalOpen] = useState(false);
  const [s3ModalOpen, setS3ModalOpen] = useState(false);
  const [note, setNote] = useState<string>('');
  /* 사장님 명령 (2026-05-21): "내가 몇년도 검토표꺼 땡길지 정하는거도 해야되고" — 사장님이 직접
   * 연도 선택. null 이면 최신 (default). dropdown 으로 매칭된 filings 의 연도 list 표시. */
  const [pickedFiscalYear, setPickedFiscalYear] = useState<number | null>(null);
  /* 사장님 명령: "양식에 이거있는데 왜 새청구서발행가면 따로 없어 그냥 넣어져있되" —
   * Section 2 활증업무 자동 prefill 표식 (taxType 별로 1회) */
  const s2PrefilledRef = useRef<string>('');

  /* 사업장 단건 fetch (URL ?business_id=N 또는 picker 선택 후) */
  const bizQuery = useQuery<{ businesses: BusinessRow[] }>({
    queryKey: ['businesses.list', { limit: 1000 }],
    queryFn: () => trpcCall('businesses.list', { limit: 1000, status: 'active' }),
  });
  const allBiz = bizQuery.data?.businesses ?? [];
  const selectedBiz = allBiz.find((b) => b.id === bizId) || null;

  /* 사장님 명령: 사람 선택 → 그 사람의 매핑 사업장 picker (billing-preview.html v-cust 흐름).
   * person mode + userId 있을 때만 fetch. 1개면 자동 setBizId. */
  const personBizQuery = useQuery<{ businesses: BusinessRow[] }>({
    queryKey: ['businesses.list', { user_id: userId }],
    queryFn: () =>
      trpcCall('businesses.list', { user_id: userId, limit: 50, status: 'all' }),
    enabled: mode === 'person' && userId > 0,
  });
  const mappedBizs = personBizQuery.data?.businesses ?? [];
  /* 매핑 사업장 1개 면 자동 선택 — 사장님 흐름 단축 */
  useEffect(() => {
    if (mode === 'person' && mappedBizs.length === 1 && !bizId) {
      setBizId(mappedBizs[0].id);
    }
  }, [mode, mappedBizs, bizId]);

  /* 양식 (Template) — 인삿말 / 계좌 / 사무실 / 서명 미리보기 prefill */
  const templateQuery = useQuery<{ template: TemplateData | null }>({
    queryKey: ['billing.templateGet'],
    queryFn: () => trpcCall('billing.templateGet'),
  });
  const template = templateQuery.data?.template || null;

  /* 사장님 명령 (2026-05-21): 양식 s2_options → s2Items 자동 prefill (taxType 별 1회).
   * 사장님이 단가 0 인 항목은 청구서 미리보기·발행에서 자동 제외 (calcS2Tot 가 0 = 합계 0).
   * cust-page2 (Section 2 산출근거) 도 val>0 만 표시. */
  useEffect(() => {
    if (!template) return;
    const key = taxType;
    if (s2PrefilledRef.current === key) return;
    s2PrefilledRef.current = key;
    const rule = taxType === '법인세' ? template.fee_rule_corp : template.fee_rule_indv;
    const opts = rule?.s2_options || [];
    setS2Items(opts.map((o) => ({ name: o.name || '', val: 0, qty: 1 })));
  }, [template, taxType]);

  /* 사장님 보고 (2026-05-21): 사업장 진입 시 종소세 검토표 "안땡겨와지는데" — 개인사업자
   * 종소세 검토표는 Person owner_type 으로 저장됨. business 의 주 사용자 (대표) 의
   * user_id 를 가져와 setUserId → Person fallback 자동 활성. */
  const bizDetailQuery = useQuery<{ primary_user_id: number | null }>({
    queryKey: ['businesses.get', { id: bizId }],
    queryFn: () => trpcCall('businesses.get', { id: bizId }),
    enabled: bizId > 0,
  });
  useEffect(() => {
    /* business mode 일 때만 primary_user_id 자동 적용. person mode 는 사용자가 명시 선택. */
    if (mode !== 'business') return;
    const pid = bizDetailQuery.data?.primary_user_id;
    if (pid && !userId) {
      setUserId(pid);
    }
  }, [bizDetailQuery.data, userId, mode]);

  /* 카탈로그 fetch — billable filter 용 (검토표 자동 prefill 시 신고서 본문 자연발생 자동 제외).
   * 사장님 보고 (2026-05-21): "기장세액공제 이런거 다빼라햇잖아" — catalog.json 항목엔
   * billable 필드 없음. billing-preview.js line 987 룰 그대로 cat 기반 계산:
   *   - cat 'general'(배당·기장·근로·자녀·연금) / 'special'(보험·의료비·교육비·기부금·표준) → billable=false (청구 제외)
   *   - 그 외 (credit_invest/rnd/employee/general, exemption) → billable=true (사장님 노력 가산)
   *   - 중특(중소기업특별세액감면, code 112/JTL_7/이름·별칭 매칭) → rule=flat_5, 나머지 billable → U자 */
  const catalogQuery = useQuery<CatalogItem[]>({
    queryKey: ['filing-tax-credit-catalog'],
    queryFn: async () => {
      const r = await fetch('/filing-tax-credit-catalog.json', { cache: 'force-cache' });
      if (!r.ok) return [];
      const j = (await r.json()) as
        | Array<Record<string, unknown>>
        | { items?: Array<Record<string, unknown>>; catalog?: Array<Record<string, unknown>> };
      const arr = Array.isArray(j) ? j : j.items || j.catalog || [];
      /* SSoT: normalizeCatalogItem 가 billable/rule 계산 (billing-preview.js 동일 룰) */
      return arr.map((c) => normalizeCatalogItem(c));
    },
    staleTime: 60 * 60 * 1000,
  });
  const catalog = catalogQuery.data || [];

  /* taxType 자동 결정 (사업장 form 기반) */
  useEffect(() => {
    if (!selectedBiz) return;
    const form = selectedBiz.company_form;
    const isCorp = form === '법인' || form === 'corp' || /\(주\)|㈜|주식회사/.test(selectedBiz.company_name || '');
    setTaxType(isCorp ? '법인세' : '종소세');
    setBasicType(isCorp ? '법인장부대행 및 법인조정' : '개인장부대행 및 개인조정');
  }, [selectedBiz]);

  /* 검토표 자동 prefill — Business owner_type 우선, 없으면 Person fallback (개인사업자 종소세).
   * 사장님 명령 (2026-05-21): "자동으로 검토표 연동안되노?"
   * → billing-preview.js 의 prefillFromFiling 패턴 그대로 (Business → Person 폴백). */
  const filingBizQuery = useQuery<{ filings: Array<{ id: number; type: string; fiscal_year: number; auto_fields: string | null }> }>({
    queryKey: ['filings.list', { owner_type: 'Business', owner_id: bizId }],
    queryFn: () =>
      trpcCall('filings.list', { owner_type: 'Business', owner_id: bizId, limit: 50 }),
    enabled: bizId > 0,
  });
  /* Person fallback — userId 있으면 항상 (taxType 조건 제거 — 사장님 보고 2026-05-21:
   * 박창범 24/25 검토표 2건인데 1건만 뜸. taxType 타이밍 때문에 Person 검토표 누락.
   * userId 있으면 무조건 fetch, matched 단계에서 type 필터. */
  const filingPersonQuery = useQuery<{ filings: Array<{ id: number; type: string; fiscal_year: number; auto_fields: string | null }> }>({
    queryKey: ['filings.list', { owner_type: 'Person', owner_id: userId }],
    queryFn: () =>
      trpcCall('filings.list', { owner_type: 'Person', owner_id: userId, limit: 50 }),
    enabled: userId > 0,
  });

  /* 통합 filings — Business 우선, 없거나 종소세인데 비었으면 Person 추가 */
  const allFilings = useMemo(() => {
    const biz = filingBizQuery.data?.filings || [];
    const per = filingPersonQuery.data?.filings || [];
    /* 중복 제거 (id 기준) */
    const seen = new Set<number>();
    return [...biz, ...per].filter((f) => {
      if (seen.has(f.id)) return false;
      seen.add(f.id);
      return true;
    });
  }, [filingBizQuery.data, filingPersonQuery.data]);

  useEffect(() => {
    /* 사장님 보고 (2026-05-21): "Section 3 저번에 프리뷰할때 개고생했는데" — catalog
     * 로딩 전 prefill 되면 표준세액공제 같은 billable=false 자연발생 자동 제외 안됨.
     * → catalog 로딩 끝나면 (또는 명시적으로 0 건이면) 실행. */
    if (catalogQuery.isLoading) return;
    if (!allFilings.length) return;
    const matched = allFilings
      .filter((f) => f.type === taxType)
      .sort((a, b) => (b.fiscal_year || 0) - (a.fiscal_year || 0));
    if (!matched.length) return;
    /* 사장님 명령 (2026-05-21): "몇년도 검토표꺼 땡길지 정하는거" — pickedFiscalYear 우선,
     * 없으면 최신 (matched[0]) */
    const latest =
      (pickedFiscalYear !== null && matched.find((m) => m.fiscal_year === pickedFiscalYear)) ||
      matched[0];
    let af: Record<string, unknown> = {};
    try {
      af = JSON.parse(latest.auto_fields || '{}');
    } catch {}
    if (af.revenue) setRevenue(Number(af.revenue) || 0);
    if (af.asset) setAsset(Number(af.asset) || 0);
    /* fiscal_year — D1 column 이 TEXT 일 경우 string("2025") 으로 옴. setYear wrapper 가 coerce */
    if (latest.fiscal_year) setYear(latest.fiscal_year);
    if (af.업종 || af.industry) setBizType(String(af.업종 || af.industry));
    /* deductions → s3_items — 카탈로그 매칭해서 billable=true 만 자동 추가 (신고서 본문 자연발생 자동 제외) */
    const dedList = (af.deductions || af.공제감면) as Array<{ code?: string; name?: string; amount?: number; 금액?: number }> | undefined;
    if (Array.isArray(dedList)) {
      const items: S3Item[] = dedList
        .filter((d) => d.code)
        .filter((d) => {
          if (!catalog.length) return true; // 카탈로그 미로딩 시 일단 통과 — 사장님 수기 삭제 가능
          const cat = catalog.find((c) => c.code === d.code);
          /* billable=false (신고서 본문 자연발생) 자동 제외. billable 미정의면 true 로 fallback */
          return cat ? cat.billable !== false : true;
        })
        .map((d) => {
          const cat = catalog.find((c) => c.code === d.code);
          const rule = cat?.rule || (d.code === '112' || d.code === 'JTL_7' ? 'flat_5' : 'progressive_u');
          return {
            code: d.code!,
            name: d.name || cat?.name || d.code!,
            amt: Number(d.amount || d.금액 || 0),
            rule,
          };
        });
      setS3Items(items);
    }
  }, [allFilings, taxType, catalog, pickedFiscalYear, catalogQuery.isLoading]);

  /* 검토표 매칭 list (사장님 선택용 + prefill 메시지). 같은 taxType 내림차순. */
  const matchedFilings = useMemo(
    () =>
      allFilings
        .filter((f) => f.type === taxType)
        .sort((a, b) => (b.fiscal_year || 0) - (a.fiscal_year || 0)),
    [allFilings, taxType],
  );
  const matchedFiling =
    (pickedFiscalYear !== null && matchedFilings.find((m) => m.fiscal_year === pickedFiscalYear)) ||
    matchedFilings[0] ||
    null;
  const filingPrefillActive = !!matchedFiling;

  /* 금액 계산 (실시간) */
  /* SSoT — apps/admin/lib/billing-calc.calcInvoice. inline 계산 제거 (사장님: 단일 진실).
   * 사장님 보고 (2026-05-21): "기본세무조정료 바꿔라" — 양식(template) 의 누진표를
   * 계산에 반영 (안 넘기면 DEFAULT 로 계산 → 양식 값과 달라짐). */
  const calc = useMemo(
    () =>
      calcInvoice({
        revenue,
        asset,
        taxType,
        basicType,
        s2Items,
        s3Items,
        discount: parseFloat(discount) || 0,
        tariffCorp: template?.fee_rule_corp?.tariff as FeeRuleRow[] | undefined,
        tariffIndv: template?.fee_rule_indv?.tariff as FeeRuleRow[] | undefined,
      }),
    [revenue, asset, taxType, basicType, s2Items, s3Items, discount, template],
  );

  /* Publish — POST tRPC billing.create
   * 사장님 보고 (2026-05-21): 발행 시 'year: undefined' tRPC 400.
   * 원인: 검토표 prefill 의 fiscal_year 가 string("2025") 일 수 있고, NaN/empty 시 undefined.
   * 3중 방어: publish-time Number() coerce + Zod schema coerce + 친절 에러 메시지. */
  const publishMut = useMutation({
    mutationFn: () => {
      /* 모든 숫자 필드 finite 보장 — undefined/NaN/string 모두 안전 처리 */
      const yr = Number(year);
      const rev = Number(revenue);
      const ast = Number(asset);
      const safeYear = Number.isFinite(yr) && yr >= 2000 && yr <= 2100 ? yr : new Date().getFullYear();
      const safeRev = Number.isFinite(rev) && rev >= 0 ? rev : 0;
      const safeAsset = Number.isFinite(ast) && ast >= 0 ? ast : 0;
      return trpcCall<{ ok: boolean; id?: number }>('billing.create', {
        business_id: bizId || undefined,
        user_id: userId || undefined,
        filing_id: preFilingId || undefined,
        year: safeYear,
        tax_type: taxType,
        revenue: safeRev,
        asset: safeAsset,
        biz_type: bizType,
        basic_type: basicType,
        base_fee: Number(calc.base) || 0,
        s2_addition: Number(calc.s2Tot) || 0,
        s3_addition: Number(calc.s3Tot) || 0,
        discount: Number(calc.disc) || 0,
        total_fee: Number(calc.total) || 0,
        /* 사장님 룰 (2026-05-21): "안적으면 청구서에 없음" — val/amt 0 인 항목은 발행 X.
         * (양식 자동 prefill 된 활증업무 중 단가 안 적은 것 자동 제외 → 400 빈 name 방지) */
        s2_items: s2Items
          .filter((it) => (Number(it.val) || 0) > 0 && String(it.name || '').trim().length > 0)
          .map((it) => ({
            name: String(it.name).trim(),
            val: Number(it.val) || 0,
            qty: Number(it.qty) || 1,
          })),
        s3_items: s3Items
          .filter((it) => (Number(it.amt) || 0) > 0 && String(it.name || '').trim().length > 0)
          .map((it) => ({
            code: String(it.code || 'CUSTOM').trim(),
            name: String(it.name).trim(),
            amt: Number(it.amt) || 0,
            rule: it.rule || 'progressive_u',
          })),
        staff_override: false,
        note: note || undefined,
      });
    },
    onSuccess: (d) => {
      if (d.ok) {
        router.push('/admin/billing');
      }
    },
  });

  /* 발행 에러 친절 표시 — 긴 tRPC JSON 대신 사람말 */
  function formatPublishError(err: unknown): string {
    const msg = (err as Error)?.message || String(err);
    /* tRPC 400 → 어느 필드인지 추출 */
    const pathMatch = msg.match(/"path":\s*\[\s*"([^"]+)"/);
    if (pathMatch) {
      const f = pathMatch[1];
      const label: Record<string, string> = {
        year: '귀속연도',
        tax_type: '세금구분',
        revenue: '수입금액',
        asset: '자산총액',
        business_id: '사업장',
        user_id: '거래처',
        s2_items: 'Section 2 활증업무',
        s3_items: 'Section 3 세액공제·감면',
      };
      return `⚠️ ${label[f] || f} 값을 확인해주세요. (${msg.includes('Required') ? '필수' : '형식 오류'})`;
    }
    if (msg.includes('refine') || msg.includes('하나 필수'))
      return '⚠️ 거래처/사업장을 먼저 선택해주세요.';
    if (msg.includes('400')) return '⚠️ 입력값 형식 오류 — 귀속연도 / 수입금액 / 항목 확인';
    if (msg.includes('401')) return '⚠️ 인증 만료 — 새로고침 후 다시 시도';
    if (msg.includes('500')) return '⚠️ 서버 오류 — 잠시 후 다시 시도';
    return `발행 실패: ${msg.slice(0, 200)}`;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* 좌측 — 입력 폼 */}
      <section className="space-y-4">
        {/* 거래처/사업장 선택 — 사장님 명령 (2026-05-21): "사람이랑 업체가있어야하는거 아님"
            billing-preview.html v-cust 의 person/business 토글 그대로 */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setMode('person');
                /* 모드 전환 시 선택 reset (사람 선택부터 다시) */
                if (!preUserId) {
                  setUserId(0);
                  setUserLabel('');
                }
                if (!preBizId) setBizId(0);
              }}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold ${
                mode === 'person'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              👤 거래처 (개인)
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('business');
                if (!preUserId) {
                  setUserId(0);
                  setUserLabel('');
                }
                if (!preBizId) setBizId(0);
              }}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold ${
                mode === 'business'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              🏢 사업장 (법인)
            </button>
            <span className="ml-auto text-xs text-gray-400">
              개인 = 종소세 거래처 · 사업장 = 법인세 거래처
            </span>
          </div>

          {mode === 'person' ? (
            <>
              <label className="block text-sm font-semibold text-gray-700">
                👤 거래처 선택
                <span className="ml-2 text-xs text-gray-400 font-normal">
                  (이름·전화·이메일 검색 — 사람 선택 후 매핑 사업장 자동 표시)
                </span>
              </label>
              <PersonCombobox
                selectedId={userId}
                selectedLabel={userLabel}
                onChange={(id, label) => {
                  setUserId(id);
                  setUserLabel(label);
                  if (id !== userId) setBizId(0); // 사람 변경 시 매핑 사업장 reset
                }}
              />

              {/* 매핑 사업장 picker (사람 선택 후) */}
              {userId > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="text-xs font-semibold text-gray-600 mb-2">
                    🏢 매핑된 사업장
                    {personBizQuery.isFetching ? (
                      <span className="ml-2 text-gray-400 font-normal">불러오는 중…</span>
                    ) : (
                      <span className="ml-2 text-gray-400 font-normal">
                        ({mappedBizs.length}개)
                      </span>
                    )}
                  </div>
                  {mappedBizs.length === 0 && !personBizQuery.isFetching ? (
                    <div className="bg-blue-50 border border-blue-200 rounded px-3 py-2 text-xs text-blue-900">
                      💡 매핑된 사업장이 없습니다. <b>개인사업자 종소세</b> 는 사람 단위 검토표·발행 가능 (사업장 선택 X).
                      <br />법인세 / 매출 큰 거래처는 거래처 dashboard 에서 사업장 추가 후 진행하세요.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {mappedBizs.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setBizId(b.id)}
                          className={`text-left p-2.5 border rounded transition ${
                            b.id === bizId
                              ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                              : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-gray-900 truncate">
                              {b.company_name || '(이름없음)'}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0 ${
                                /\(주\)|㈜|주식회사|법인/.test(b.company_form || b.company_name || '')
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {/\(주\)|㈜|주식회사|법인/.test(b.company_form || b.company_name || '') ? '법인' : '개인'}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5 truncate">
                            {b.ceo_name && `대표 ${b.ceo_name}`}
                            {b.business_number && ` · ${b.business_number}`}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <label className="block text-sm font-semibold text-gray-700">
                🏢 사업장 선택
                <span className="ml-2 text-xs text-gray-400 font-normal">
                  ({allBiz.length}개 — 회사명·사업자번호·대표자 검색)
                </span>
              </label>
              <BusinessCombobox
                businesses={allBiz}
                selectedId={bizId}
                onChange={setBizId}
                isLoading={bizQuery.isLoading}
              />
            </>
          )}
        </div>

        {/* 발행 입력 */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-semibold text-gray-900">💰 발행 입력</span>
            {filingPrefillActive && matchedFiling ? (
              <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded">
                ✅
                {matchedFilings.length > 1 ? (
                  <select
                    value={pickedFiscalYear ?? matchedFiling.fiscal_year ?? ''}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setPickedFiscalYear(Number.isFinite(v) ? v : null);
                    }}
                    className="bg-white border border-green-300 rounded px-1 py-0.5 text-xs font-semibold text-green-700"
                    title="다른 연도 검토표 선택 — 사장님 명령 (2026-05-21)"
                  >
                    {matchedFilings.map((m) => (
                      <option key={m.id} value={m.fiscal_year}>
                        {m.fiscal_year}년
                      </option>
                    ))}
                  </select>
                ) : (
                  <span>{matchedFiling.fiscal_year}년</span>
                )}
                {taxType} 검토표 자동 prefill ({matchedFilings.length}건 中)
              </span>
            ) : (bizId > 0 || userId > 0) ? (
              <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                🔍 {taxType} 검토표 없음 — 수기 입력
              </span>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="귀속연도">
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value) || new Date().getFullYear())}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
              />
            </Field>
            <Field label="세금구분">
              <select
                value={taxType}
                onChange={(e) => setTaxType(e.target.value as '법인세' | '종소세' | '부가세')}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white"
              >
                <option>법인세</option>
                <option>종소세</option>
                <option>부가세</option>
              </select>
            </Field>
            <Field label="업무구분">
              <select
                value={basicType}
                onChange={(e) => setBasicType(e.target.value)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white"
              >
                <option>법인장부대행 및 법인조정</option>
                <option>법인조정</option>
                <option>개인장부대행 및 개인조정</option>
                <option>개인조정</option>
              </select>
            </Field>
            <Field label="업종">
              <select
                value={bizType}
                onChange={(e) => setBizType(e.target.value)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white"
              >
                {['제조', '도소매업', '건설', '운수', '금융보험업', '부동산임대', '전문과학기술', '교육서비스', '보건의료', '개인서비스', '기타'].map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </Field>
            <Field label="수입금액 (원)">
              <input
                type="number"
                value={revenue}
                onChange={(e) => setRevenue(Number(e.target.value) || 0)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
              />
            </Field>
            <Field label="자산총액 (원)">
              <input
                type="number"
                value={asset}
                onChange={(e) => setAsset(Number(e.target.value) || 0)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
              />
            </Field>
          </div>
        </div>

        {/* Section 2 — 활증업무. 사장님 명령 (2026-05-21): "양식에 이거있는데 왜 새청구서발행가면
            따로 없어 그냥 넣어져있되 내가 뭐 안적으면 2page에서는 사라지게" — 양식 옵션 자동
            row + inline 단가/건수 입력. val=0 인 행은 청구서 미리보기 cust-page2 에서 자동 hide. */}
        <SectionEditor
          title="📞 Section 2 — 활증업무 (양식 자동 + 단가 0 이면 청구서 미표시)"
          items={s2Items}
          onAdd={() => setS2ModalOpen(true)}
          onRemove={(i) => setS2Items(s2Items.filter((_, idx) => idx !== i))}
          renderRow={(it, i) => (
            <>
              <td className="px-2 py-1.5 text-sm font-medium text-gray-900">{it.name}</td>
              <td className="px-2 py-1.5">
                <input
                  type="number"
                  value={it.val || ''}
                  placeholder="0"
                  onChange={(e) => {
                    const v = Number(e.target.value) || 0;
                    setS2Items(s2Items.map((x, idx) => (idx === i ? { ...x, val: v } : x)));
                  }}
                  className="w-24 border border-gray-300 rounded px-2 py-1 text-sm text-right"
                />
              </td>
              <td className="px-2 py-1.5">
                <input
                  type="number"
                  value={it.qty || ''}
                  placeholder="1"
                  onChange={(e) => {
                    const v = Number(e.target.value) || 1;
                    setS2Items(s2Items.map((x, idx) => (idx === i ? { ...x, qty: v } : x)));
                  }}
                  className="w-16 border border-gray-300 rounded px-2 py-1 text-sm text-right"
                />
              </td>
              <td
                className={`px-2 py-1.5 text-sm text-right font-semibold ${
                  it.val > 0 ? 'text-blue-700' : 'text-gray-300'
                }`}
              >
                {formatWon(it.val * it.qty)}원
              </td>
            </>
          )}
          headers={['항목', '단가', '건수', '가산액']}
        />

        {/* Section 3 — 세액공제·감면 */}
        <SectionEditor
          title="💸 Section 3 — 세액공제·감면"
          items={s3Items}
          onAdd={() => setS3ModalOpen(true)}
          onRemove={(i) => setS3Items(s3Items.filter((_, idx) => idx !== i))}
          renderRow={(it, i) => {
            const gain = calcGain(it.amt, it.rule);
            return (
              <>
                <td className="px-2 py-1.5 text-sm">{it.name}</td>
                <td className="px-2 py-1.5 text-sm text-right">{formatWon(it.amt)}원</td>
                <td className="px-2 py-1.5 text-xs">
                  {it.rule === 'flat_5' ? '5%' : 'U자'}
                </td>
                <td className="px-2 py-1.5 text-sm text-right font-semibold text-blue-700">
                  {formatWon(gain)}원
                </td>
              </>
            );
          }}
          headers={['항목', '감면액', '룰', '가산액']}
        />

        {/* 할인액 — 사장님 룰: 수기 */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <label className="block text-xs font-bold text-amber-900 mb-1.5">
            ✏️ 할인액 (수기 입력 — 자동화 절대 X)
          </label>
          <input
            type="number"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            placeholder="비워두면 청구서에 표시 X"
            className="w-full border border-amber-300 rounded px-2 py-1.5 text-sm bg-white"
          />
          <div className="text-xs text-amber-900 mt-1">
            📝 수입금액·공제감면은 검토표 자동 prefill, 할인액만 사장님 수기.
          </div>
        </div>

        {/* 비고 */}
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">📝 비고</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            placeholder="옵션 — 청구서 메모"
          />
        </div>

        {/* 발행 버튼 */}
        <div className="flex items-center gap-3 sticky bottom-4 bg-white border border-gray-200 rounded-lg p-3 shadow-lg">
          <Link
            href="/admin/billing"
            className="text-sm text-gray-500 hover:text-gray-900"
          >
            ← 취소
          </Link>
          <button
            type="button"
            onClick={() => publishMut.mutate()}
            /* 사장님 명령 (2026-05-21): "개인도 당연 매핑되야지... 소득세 검토표는 원래 개인에 있잖아"
             * → person 종소세는 매핑 사업장 없어도 발행 가능 (사용자 단위) */
            disabled={
              publishMut.isPending ||
              (!bizId && !(mode === 'person' && userId > 0 && taxType === '종소세'))
            }
            className="ml-auto bg-blue-600 text-white px-6 py-2 rounded font-bold text-sm hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {publishMut.isPending ? '발행 중…' : `💾 발행 (${formatWon(calc.total)}원)`}
          </button>
        </div>
        {publishMut.isError && (
          <div className="bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm">
            {formatPublishError(publishMut.error)}
            <details className="mt-2 text-xs text-red-500">
              <summary className="cursor-pointer hover:underline">기술 상세 (개발자용)</summary>
              <pre className="mt-1 whitespace-pre-wrap break-all">{(publishMut.error as Error).message}</pre>
            </details>
          </div>
        )}
      </section>

      {/* 우측 — A4 청구서 미리보기 (billing-preview.html 톤) */}
      <section className="lg:sticky lg:top-20 lg:self-start space-y-3">
        <InvoicePreview
          companyName={selectedBiz?.company_name}
          ceoName={selectedBiz?.ceo_name}
          year={year}
          taxType={taxType}
          bizType={bizType}
          revenue={revenue}
          baseFee={calc.baseFee}
          s2Total={calc.s2Tot}
          s3Total={calc.s3Tot}
          discount={calc.disc}
          total={calc.total}
          s2Items={s2Items}
          s3Items={s3Items}
          template={template}
        />
      </section>

      {/* S2/S3 Picker 모달 — Phase D4-4 (2026-05-21) */}
      <S2PickerModal
        open={s2ModalOpen}
        onClose={() => setS2ModalOpen(false)}
        onAdd={(item: S2ItemType) => setS2Items([...s2Items, item])}
        form={taxType === '법인세' ? 'corp' : 'indv'}
        base={calc.base}
      />
      <S3PickerModal
        open={s3ModalOpen}
        onClose={() => setS3ModalOpen(false)}
        onAdd={(item: S3ItemType) => setS3Items([...s3Items, { ...item, rule: item.rule === 'none' ? 'progressive_u' : item.rule }])}
      />
    </div>
  );
}

/* ─── 작은 컴포넌트 ─────────────────────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function SectionEditor<T>({
  title,
  items,
  onAdd,
  onRemove,
  renderRow,
  headers,
}: {
  title: string;
  items: T[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  renderRow: (it: T, i: number) => React.ReactNode;
  headers: string[];
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <div className="flex items-center mb-2">
        <span className="text-sm font-semibold text-gray-900">{title}</span>
        <span className="ml-2 text-xs text-gray-500">({items.length})</span>
        <button
          type="button"
          onClick={onAdd}
          className="ml-auto text-xs border border-gray-300 rounded px-2 py-1 hover:bg-gray-50"
        >
          + 항목
        </button>
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-gray-400 text-center py-3">
          + 항목으로 추가
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-xs text-gray-600">
              {headers.map((h, i) => (
                <th key={i} className="px-2 py-1.5 font-medium text-left">
                  {h}
                </th>
              ))}
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-t border-gray-100">
                {renderRow(it, i)}
                <td className="text-center">
                  <button
                    type="button"
                    onClick={() => onRemove(i)}
                    className="text-red-600 hover:bg-red-50 px-1 rounded text-xs"
                    title="삭제"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
