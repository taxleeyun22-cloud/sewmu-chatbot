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
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { trpcCall } from '@/lib/trpc';
import { S2PickerModal, type S2Item as S2ItemType } from '@/components/billing/S2PickerModal';
import { S3PickerModal, type S3Item as S3ItemType } from '@/components/billing/S3PickerModal';
import { InvoicePreview } from '@/components/billing/InvoicePreview';
import { BusinessCombobox } from '@/components/billing/BusinessCombobox';
/* 사장님 명령 (2026-05-21): 계산·룰 단일 진실 (SSoT) — inline 중복 제거, 전부 이 모듈에서 */
import {
  formatWon,
  calcGain,
  calcInvoice,
  isCorpBusiness,
  normalizeCatalogItem,
  DEFAULT_S2_CORP,
  DEFAULT_S2_INDV,
  type S2Item,
  type S3Item,
  type CatalogItem,
  type FeeRuleRow,
} from '@/lib/billing-calc';
/* 사장님 보고 (2026-05-22): 발행 400 — 발행 전 클라이언트 검증으로 정확한 필드 진단 */
import { NewInvoiceSchema } from '@sewmu/types';

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
  const queryClient = useQueryClient();
  const sp = useSearchParams();
  const preBizId = Number(sp.get('business_id') || 0);
  const preUserId = Number(sp.get('user_id') || 0);
  const preFilingId = Number(sp.get('filing_id') || 0);
  /* 사장님 명령 (2026-05-27): "조정료청구서 수정이 안된다" — 새 발행 폼 재활용 수정 모드.
   * ?edit=N 진입 시 billing.byId 로 모든 필드 prefill + publish 시 billing.update 호출. */
  const editId = Number(sp.get('edit') || 0);
  const editMode = editId > 0;

  /* Form state.
   * 사장님 명령 (2026-05-22): "개인은 빼버리자 어차피 사업자명도 같이찍히는게 맞다" —
   * person/business 토글 폐기. 사업장(개인사업자 포함) 단일 선택. 종소세 검토표는
   * 사업장 대표(primary_user_id)로 Person fallback fetch 유지. */
  const [bizId, setBizId] = useState<number>(preBizId);
  const [userId, setUserId] = useState<number>(preUserId);
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
  /* 사장님 결정 (2026-05-22): 결산(20%)·원가(10%) 체크박스 (원본 invoice.zip 방식).
   * 결산 default = 장부업무, 원가 default = off. */
  const [hasKet, setHasKet] = useState<boolean>(true);
  const [hasCost, setHasCost] = useState<boolean>(false);
  const [discount, setDiscount] = useState<string>(''); // 빈 칸 default — 사장님 룰
  /* 사장님 명령 (2026-05-22): "날짜도 넣도록" — 발행일 / 납기일 (청구서 표시). */
  const todayStr = new Date().toISOString().slice(0, 10);
  const [issueDate, setIssueDate] = useState<string>(todayStr);
  const [dueDate, setDueDate] = useState<string>('');
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

  /* 양식 (Template) — 인삿말 / 계좌 / 사무실 / 서명 미리보기 prefill */
  const templateQuery = useQuery<{ template: TemplateData | null }>({
    queryKey: ['billing.templateGet'],
    queryFn: () => trpcCall('billing.templateGet'),
  });
  const template = templateQuery.data?.template || null;

  /* 수정 모드 — editId>0 시 청구서 fetch + 모든 state 1회 prefill.
   * 자동 prefill useEffect 들은 editMode 가드로 차단 (검토표/사업장 자동 덮어쓰기 방지). */
  interface EditInvoice {
    id: number; business_id: number | null; user_id: number | null;
    year: number | null; tax_type: string | null;
    issue_date: string | null; due_date: string | null;
    revenue: number | null; asset: number | null;
    biz_type: string | null; basic_type: string | null;
    discount: number | null; status: string | null; note: string | null;
    s2_items_parsed: Array<{ name: string; val: number; qty: number }>;
    s3_items_parsed: Array<{ code: string; name: string; amt: number; rule: string }>;
    created_at: string | null;
    business_name?: string | null; user_name?: string | null; total_fee?: number | null;
  }
  const editQuery = useQuery<{ invoice: EditInvoice | null }>({
    queryKey: ['billing.byId', { id: editId }],
    queryFn: () => trpcCall('billing.byId', { id: editId }),
    enabled: editMode,
  });
  const editInv = editQuery.data?.invoice || null;
  const editPrefilledRef = useRef(false);
  useEffect(() => {
    if (!editMode || !editInv || editPrefilledRef.current) return;
    editPrefilledRef.current = true;
    if (editInv.business_id) setBizId(editInv.business_id);
    if (editInv.user_id) setUserId(editInv.user_id);
    if (editInv.year) setYear(editInv.year);
    if (editInv.tax_type) setTaxType(editInv.tax_type as '법인세' | '종소세' | '부가세');
    if (editInv.basic_type) setBasicType(editInv.basic_type);
    if (editInv.biz_type) setBizType(editInv.biz_type);
    if (editInv.issue_date) setIssueDate(editInv.issue_date);
    setDueDate(editInv.due_date || '');
    setRevenue(Number(editInv.revenue) || 0);
    setAsset(Number(editInv.asset) || 0);
    setDiscount(editInv.discount && editInv.discount > 0 ? String(editInv.discount) : '');
    setNote(editInv.note || '');
    setS2Items((editInv.s2_items_parsed || []).map((it) => ({
      name: String(it.name || ''), val: Number(it.val) || 0, qty: Number(it.qty) || 0,
    })));
    setS3Items((editInv.s3_items_parsed || []).map((it) => ({
      code: String(it.code || ''), name: String(it.name || ''),
      amt: Number(it.amt) || 0,
      rule: ((it.rule as 'flat_5' | 'progressive_u' | 'none') || 'progressive_u'),
    })));
    /* s2 자동 prefill 도 skip (이미 청구서 데이터로 채움) */
    s2PrefilledRef.current = 'edit';
  }, [editMode, editInv]);

  /* 사장님 명령 (2026-05-21):
   * ① "단가 후려치기 들어갔어 원래 내가 했던거" → 양식/원본 단가(o.val) 그대로 prefill (0 강제 X)
   * ② "업무구분에서 개인/법인 체크하면 섹션2 조정되는건 어떻노" → 분기를 업무구분(basicType) 으로
   * 건수(qty)는 0 으로 시작 → 사장님이 건수 입력 시 청구서 표시 (안 적으면 미표시 룰). 단가는 보임. */
  useEffect(() => {
    if (editMode) return; // 수정 모드: s2 자동 prefill 차단 (청구서 데이터로 채움)
    if (templateQuery.isLoading) return; // 양식 로딩 대기 (양식 우선)
    const isCorpWork = basicType.includes('법인');
    const key = isCorpWork ? 'corp' : 'indv';
    if (s2PrefilledRef.current === key) return;
    s2PrefilledRef.current = key;
    const rule = isCorpWork ? template?.fee_rule_corp : template?.fee_rule_indv;
    let opts: Array<{ name?: string; val?: number }> = rule?.s2_options || [];
    if (!opts.length) {
      /* 양식 미저장 → 코드 DEFAULT (사장님 원본 단가: 4대보험 1만·연말정산 2만·부가세수정 5만 등) */
      opts = isCorpWork ? DEFAULT_S2_CORP : DEFAULT_S2_INDV;
    }
    setS2Items(opts.map((o) => ({ name: o.name || '', val: Number(o.val) || 0, qty: 0 })));
  }, [templateQuery.isLoading, template, basicType]);

  /* 사장님 보고 (2026-05-21): 사업장 진입 시 종소세 검토표 "안땡겨와지는데" — 개인사업자
   * 종소세 검토표는 Person owner_type 으로 저장됨. business 의 주 사용자 (대표) 의
   * user_id 를 가져와 setUserId → Person fallback 자동 활성. */
  const bizDetailQuery = useQuery<{ primary_user_id: number | null }>({
    queryKey: ['businesses.get', { id: bizId }],
    queryFn: () => trpcCall('businesses.get', { id: bizId }),
    enabled: bizId > 0,
  });
  useEffect(() => {
    if (editMode) return; // 수정 모드: 사업장 자동 user_id 매칭 차단
    /* 사업장 선택 시 그 대표(primary_user_id) 자동 → Person 검토표 fallback 활성 */
    const pid = bizDetailQuery.data?.primary_user_id;
    if (pid && !userId) setUserId(pid);
  }, [bizDetailQuery.data, userId, editMode]);

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

  /* taxType 자동 결정 (사업장 form 기반).
   * SSoT — BusinessCombobox 와 동일 판정 (billing-calc.isCorpBusiness). 과거 drift:
   * 콤보박스는 '법인사업자' 도 법인으로 봤는데 여기선 ==='법인' 엄격이라 종소세(30만)로 갈림. */
  useEffect(() => {
    if (editMode) return; // 수정 모드: taxType/basicType 자동 결정 차단
    if (!selectedBiz) return;
    const isCorp = isCorpBusiness(selectedBiz.company_form, selectedBiz.company_name);
    setTaxType(isCorp ? '법인세' : '종소세');
    setBasicType(isCorp ? '법인장부대행 및 법인조정' : '개인장부대행 및 개인조정');
    setHasKet(true); // 장부대행 default → 결산 on
    setHasCost(false);
  }, [selectedBiz, editMode]);

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
    if (editMode) return; // 수정 모드: 검토표 자동 prefill 차단 (청구서 데이터 우선)
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
        hasKet,
        hasCost,
      }),
    [revenue, asset, taxType, basicType, s2Items, s3Items, discount, template, hasKet, hasCost],
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
      const payload = {
        business_id: bizId || undefined,
        user_id: userId || undefined,
        filing_id: preFilingId || undefined,
        year: safeYear,
        tax_type: taxType,
        issue_date: issueDate || undefined,
        due_date: dueDate || undefined,
        revenue: safeRev,
        asset: safeAsset,
        biz_type: bizType || undefined,
        basic_type: basicType || undefined,
        /* 사장님 보고 (2026-05-29): 발행하면 기본료가 결산 가산 전 값으로 표시됨.
         * 미리보기는 calc.baseFee(base+결산+원가)인데 저장은 calc.base(가산 전)였음 →
         * 미리보기와 동일하게 baseFee 로 저장 (SSoT: billing-calc.baseFee = 기본 세무조정료). */
        base_fee: Number(calc.baseFee) || 0,
        s2_addition: Number(calc.s2Tot) || 0,
        s3_addition: Number(calc.s3Tot) || 0,
        discount: Number(calc.disc) || 0,
        total_fee: Number(calc.total) || 0,
        /* 사장님 룰 (2026-05-21): "안적으면 청구서에 없음" — val/amt 0 인 항목은 발행 X. */
        s2_items: s2Items
          .filter(
            (it) =>
              (Number(it.val) || 0) > 0 &&
              (Number(it.qty) || 0) > 0 &&
              String(it.name || '').trim().length > 0,
          )
          .map((it) => ({ name: String(it.name).trim(), val: Number(it.val) || 0, qty: Number(it.qty) || 1 })),
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
      };
      /* 사장님 보고 (2026-05-22): 발행 400 — 서버 가기 전 클라 검증으로 정확한 필드 진단.
       * NewInvoiceSchema (서버와 동일) safeParse → 실패 시 어느 필드인지 한국어로. */
      const parsed = NewInvoiceSchema.safeParse(payload);
      if (!parsed.success) {
        const labelMap: Record<string, string> = {
          year: '귀속연도',
          tax_type: '세금구분',
          revenue: '수입금액',
          asset: '자산총액',
          business_id: '사업장',
          user_id: '거래처',
          s2_items: 'Section 2 활증업무',
          s3_items: 'Section 3 세액공제·감면',
          base_fee: '기본 세무조정료',
          total_fee: '최종 청구액',
        };
        const msgs = parsed.error.issues.map((iss) => {
          const top = String(iss.path[0] ?? '');
          return `· ${labelMap[top] || top || '청구서'} — ${iss.message}`;
        });
        throw new Error('VALIDATION:\n' + msgs.join('\n'));
      }
      /* 사장님 명령 (2026-05-27): 수정 모드 → billing.update (InvoiceUpdateSchema 호환 필드만).
       * year/tax_type/business_id 등 메타는 update 가 안 받음 → 무시 (UI 에 readonly 안내 권장). */
      if (editMode) {
        const updateData = {
          issue_date: parsed.data.issue_date,
          due_date: parsed.data.due_date,
          revenue: parsed.data.revenue,
          asset: parsed.data.asset,
          biz_type: parsed.data.biz_type,
          basic_type: parsed.data.basic_type,
          base_fee: parsed.data.base_fee,
          s2_addition: parsed.data.s2_addition,
          s3_addition: parsed.data.s3_addition,
          discount: parsed.data.discount,
          total_fee: parsed.data.total_fee,
          s2_items: parsed.data.s2_items,
          s3_items: parsed.data.s3_items,
          note: parsed.data.note,
        };
        return trpcCall<{ ok: boolean }>('billing.update', { id: editId, data: updateData });
      }
      return trpcCall<{ ok: boolean; id?: number }>('billing.create', parsed.data);
    },
    onSuccess: async (d) => {
      if (d.ok) {
        /* 사장님 보고 (2026-05-29): "수정발행눌러도 청구서는 그대로다 안바뀜".
         * 원인: QueryClient staleTime=30s. 수정 폼이 prefill 로 채운 billing.byId 캐시가
         * 아직 fresh → 상세 페이지가 옛 캐시를 그대로 보여주고 refetch 안 함 (DB 는 갱신됨).
         * 해결: 저장 성공 시 byId + list 캐시 무효화 → 상세 페이지 mount 시 새 데이터 fetch. */
        await queryClient.invalidateQueries({ queryKey: ['billing.byId', { id: editId }] });
        await queryClient.invalidateQueries({ queryKey: ['billing.list'] });
        /* 수정 모드: 상세 페이지로 복귀, 새 발행: 모아보기로 */
        router.push(editMode ? `/admin/billing/${editId}` : '/admin/billing');
      }
    },
  });

  /* 발행 에러 친절 표시 — 긴 tRPC JSON 대신 사람말 */
  function formatPublishError(err: unknown): string {
    const msg = (err as Error)?.message || String(err);
    /* 클라 사전 검증 실패 (NewInvoiceSchema safeParse) — 정확한 필드 한국어 표시 */
    if (msg.startsWith('VALIDATION:')) {
      return '⚠️ 발행 전 확인이 필요합니다:\n' + msg.replace('VALIDATION:\n', '');
    }
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
        {/* 사업장 선택 — 사장님 명령 (2026-05-22): "개인은 빼버리자 어차피 사업자명도 같이찍히는게 맞다".
            person 토글 폐기. 사업장(개인사업자 포함) 단일. 종소세 검토표는 대표(primary_user_id) Person fallback. */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <label className="block text-sm font-semibold text-gray-700">
            🏢 사업장 선택
            <span className="ml-2 text-xs text-gray-400 font-normal">
              ({allBiz.length}개 — 회사명·사업자번호·대표자 검색 · 법인/개인사업자 모두)
            </span>
          </label>
          <BusinessCombobox
            businesses={allBiz}
            selectedId={bizId}
            onChange={setBizId}
            isLoading={bizQuery.isLoading}
          />
        </div>

        {/* 발행 입력 */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-semibold text-gray-900">{editMode ? `✏️ 청구서 #${editId} 수정` : '💰 발행 입력'}</span>
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
            {/* 사장님 명령 (2026-05-22): "날짜도 넣도록" — 발행일 / 납기일 */}
            <Field label="발행일자">
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
              />
            </Field>
            <Field label="납부기한 (선택)">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
              />
            </Field>
          </div>
          {/* 사장님 결정 (2026-05-22): 결산(20%)·원가(10%) 체크박스 — 원본 invoice.zip 방식.
              둘 다 기본보수(base) 기준. 부가세는 최종 청구에만 별도 (여기 미포함). */}
          <div className="flex items-center gap-4 pt-1 border-t border-gray-100 mt-1">
            <span className="text-xs font-semibold text-gray-600">가산 옵션:</span>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={hasKet}
                onChange={(e) => setHasKet(e.target.checked)}
                className="w-4 h-4 accent-blue-600"
              />
              결산 (기본보수 × 20%) {hasKet && calc.ket > 0 && <span className="text-blue-700 font-semibold">+{formatWon(calc.ket)}원</span>}
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={hasCost}
                onChange={(e) => setHasCost(e.target.checked)}
                className="w-4 h-4 accent-blue-600"
              />
              원가계산 (기본보수 × 10%) {hasCost && calc.cst > 0 && <span className="text-blue-700 font-semibold">+{formatWon(calc.cst)}원</span>}
            </label>
          </div>
          <div className="text-[11px] text-gray-400">
            💡 기본 세무조정료 = 누진표 기본보수{hasKet ? ' + 결산 20%' : ''}{hasCost ? ' + 원가 10%' : ''}. 부가세(10%)는 최종 청구에만 별도.
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
                  it.val > 0 && it.qty > 0 ? 'text-blue-700' : 'text-gray-300'
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
            disabled={publishMut.isPending || !bizId}
            className="ml-auto bg-blue-600 text-white px-6 py-2 rounded font-bold text-sm hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {publishMut.isPending
              ? (editMode ? '수정 저장 중…' : '발행 중…')
              : `${editMode ? '✏️ 수정 저장' : '💾 발행'} (${formatWon(calc.total)}원)`}
          </button>
        </div>
        {publishMut.isError && (
          <div className="bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm">
            <div className="whitespace-pre-line">{formatPublishError(publishMut.error)}</div>
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
          issueDate={issueDate || undefined}
          dueDate={dueDate || undefined}
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
