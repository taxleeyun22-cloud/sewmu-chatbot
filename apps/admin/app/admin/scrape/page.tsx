/**
 * Phase 신고서스크래핑-5 (2026-06-17): /admin/scrape — 신고서 스크래핑 관리.
 *
 * 세무대리 수임동의 기반 무인 자동 조회. 거래처 인증정보 저장 안 함 — 세무대리인 권한으로 조회.
 * 흐름: 수임 거래처 연동 → 스크래핑 요청(enqueue) → cron worker 처리 → 검증 큐 승인 → 챗봇 노출.
 * 백엔드: /api/admin-scrape-trigger (연동·요청), /api/admin-scrape-review (검증 큐).
 * 현재 SCRAPE_PROVIDER=mock — 제공사 선정·법무 통과 후 어댑터 교체.
 */
'use client';
export const runtime = 'edge';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

const FILING_TYPES = ['부가세', '종소세', '법인세'] as const;
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3];

interface Connection {
  id: number;
  user_id: number;
  provider: string;
  consent_status: string;
  status: string;
  last_synced_at: string | null;
  real_name?: string | null;
  name?: string | null;
}
interface Job {
  job_id: number;
  status: string;
  filing_type: string;
  fiscal_year: number;
  period_label: string | null;
  user_id: number;
  attempts: number;
  last_error: string | null;
  raw_id: number | null;
  updated_at: string | null;
  normalized: string | null;
  provider: string | null;
}

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: 'same-origin' });
  if (!r.ok) {
    const e = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(e.error || `HTTP ${r.status}`);
  }
  return r.json();
}
async function postJSON(url: string, body: unknown): Promise<any> {
  const r = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const d = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}

export default function ScrapePage() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const connQ = useQuery({
    queryKey: ['scrape.connections'],
    queryFn: () => getJSON<{ connections: Connection[] }>('/api/admin-scrape-trigger'),
  });
  const jobsQ = useQuery({
    queryKey: ['scrape.jobs'],
    queryFn: () => getJSON<{ jobs: Job[] }>('/api/admin-scrape-review'),
    refetchInterval: 15_000,
  });

  const connections = connQ.data?.connections ?? [];
  const jobs = jobsQ.data?.jobs ?? [];

  function flash(kind: 'ok' | 'err', text: string) {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 4000);
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); } catch (e) { flash('err', (e as Error).message); } finally { setBusy(false); }
  }

  /* 연동 추가 폼 */
  const [newUserId, setNewUserId] = useState('');
  async function addConnection() {
    const uid = Number(newUserId);
    if (!uid) return flash('err', '사용자 ID를 입력하세요');
    await run(async () => {
      await postJSON('/api/admin-scrape-trigger?action=create_connection', { user_id: uid, consent_source: '세무대리_수임동의' });
      setNewUserId('');
      flash('ok', `수임 연동 추가됨 (user #${uid})`);
      connQ.refetch();
    });
  }

  /* 스크래핑 요청 폼 */
  const [reqConn, setReqConn] = useState('');
  const [reqType, setReqType] = useState<(typeof FILING_TYPES)[number]>('부가세');
  const [reqYear, setReqYear] = useState(String(CURRENT_YEAR - 1));
  async function enqueue() {
    const cid = Number(reqConn);
    if (!cid) return flash('err', '연동 거래처를 선택하세요');
    await run(async () => {
      const d = await postJSON('/api/admin-scrape-trigger', {
        connection_id: cid, filing_type: reqType, fiscal_year: Number(reqYear),
      });
      flash('ok', `스크래핑 요청 큐 적재됨 (job #${d.job_id}) — 워커가 처리합니다`);
      jobsQ.refetch();
    });
  }

  async function approve(rawId: number, force = false) {
    await run(async () => {
      await postJSON(`/api/admin-scrape-review?action=approve&raw_id=${rawId}`, { force });
      flash('ok', '검증 승인 — 거래처 챗봇에 노출됩니다');
      jobsQ.refetch();
    });
  }
  async function reject(rawId: number) {
    await run(async () => {
      await postJSON(`/api/admin-scrape-review?action=reject&raw_id=${rawId}`, {});
      flash('ok', '반려 처리됨');
      jobsQ.refetch();
    });
  }

  const connName = (c: Connection) => c.real_name || c.name || `user #${c.user_id}`;

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-5 space-y-5">
      <div>
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">신고서 스크래핑</h1>
        <p className="text-sm text-gray-500 mt-1">
          세무대리 수임동의 기반 자동 조회 · 거래처 인증정보 미저장 · 직원 검증 후 거래처 챗봇 노출
        </p>
        <span className="inline-block mt-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
          현재 Mock 모드 — 제공사 선정·법무 통과 후 실제 연동
        </span>
      </div>

      {msg && (
        <div className={`rounded-lg p-3 text-sm ${msg.kind === 'ok' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {msg.text}
        </div>
      )}

      {/* 1) 수임 거래처 연동 */}
      <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center gap-2">
          <span className="font-bold text-gray-900 dark:text-gray-100 text-sm">① 수임 거래처 연동</span>
          <span className="text-xs text-gray-500">({connections.length})</span>
          <div className="ml-auto flex items-center gap-2">
            <input
              type="number"
              placeholder="사용자 ID"
              value={newUserId}
              onChange={(e) => setNewUserId(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm w-28 bg-white dark:bg-gray-800"
            />
            <button type="button" disabled={busy} onClick={addConnection}
              className="text-sm bg-brand-primary text-white rounded px-3 py-1 disabled:opacity-50 hover:opacity-90">
              + 수임 연동 추가
            </button>
          </div>
        </div>
        {connQ.isLoading ? (
          <div className="p-6 text-sm text-gray-500">불러오는 중…</div>
        ) : connections.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">연동된 수임 거래처가 없습니다. 위에서 사용자 ID로 추가하세요.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-300">
              <tr className="text-left">
                <th className="px-4 py-2 font-medium">거래처</th>
                <th className="px-4 py-2 font-medium w-24">제공사</th>
                <th className="px-4 py-2 font-medium w-28">동의(수임)</th>
                <th className="px-4 py-2 font-medium w-28">상태</th>
                <th className="px-4 py-2 font-medium w-36">마지막 동기</th>
              </tr>
            </thead>
            <tbody>
              {connections.map((c) => (
                <tr key={c.id} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="px-4 py-2 font-semibold text-gray-900 dark:text-gray-100">{connName(c)} <span className="text-gray-400 font-normal">#{c.user_id}</span></td>
                  <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{c.provider}</td>
                  <td className="px-4 py-2"><ConsentChip status={c.consent_status} /></td>
                  <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{c.status}</td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{c.last_synced_at ? c.last_synced_at.slice(0, 16) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* 2) 스크래핑 요청 */}
      <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <div className="font-bold text-gray-900 dark:text-gray-100 text-sm mb-3">② 스크래핑 요청 (수동)</div>
        <div className="flex items-end gap-2 flex-wrap">
          <label className="text-xs text-gray-500">
            거래처
            <select value={reqConn} onChange={(e) => setReqConn(e.target.value)}
              className="block border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm mt-1 bg-white dark:bg-gray-800 min-w-[180px]">
              <option value="">선택…</option>
              {connections.filter((c) => c.consent_status === 'granted' && c.status === 'active').map((c) => (
                <option key={c.id} value={c.id}>{connName(c)} (#{c.user_id})</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-500">
            세목
            <select value={reqType} onChange={(e) => setReqType(e.target.value as any)}
              className="block border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm mt-1 bg-white dark:bg-gray-800">
              {FILING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-500">
            귀속연도
            <select value={reqYear} onChange={(e) => setReqYear(e.target.value)}
              className="block border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm mt-1 bg-white dark:bg-gray-800">
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <button type="button" disabled={busy} onClick={enqueue}
            className="text-sm bg-brand-primary text-white rounded px-4 py-1.5 disabled:opacity-50 hover:opacity-90">
            스크래핑 요청
          </button>
          <span className="text-xs text-gray-400">요청은 큐에 적재 → 워커(cron)가 처리</span>
        </div>
      </section>

      {/* 3) 검증 큐 */}
      <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center gap-2">
          <span className="font-bold text-gray-900 dark:text-gray-100 text-sm">③ 검증 큐</span>
          <span className="text-xs text-gray-500">({jobs.length})</span>
          <button type="button" onClick={() => jobsQ.refetch()} className="ml-auto text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-800">↻ 새로고침</button>
        </div>
        {jobsQ.isLoading ? (
          <div className="p-6 text-sm text-gray-500">불러오는 중…</div>
        ) : jobs.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">요청 내역이 없습니다.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-300">
              <tr className="text-left">
                <th className="px-4 py-2 font-medium w-16">job</th>
                <th className="px-4 py-2 font-medium w-20">거래처</th>
                <th className="px-4 py-2 font-medium w-20">세목</th>
                <th className="px-4 py-2 font-medium w-20">연도</th>
                <th className="px-4 py-2 font-medium w-24">상태</th>
                <th className="px-4 py-2 font-medium">조회값(정규화)</th>
                <th className="px-4 py-2 font-medium w-40">검증</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => {
                let norm: any = null;
                try { norm = j.normalized ? JSON.parse(j.normalized) : null; } catch {}
                return (
                  <tr key={j.job_id} className="border-t border-gray-100 dark:border-gray-800 align-top">
                    <td className="px-4 py-2 text-gray-400">#{j.job_id}</td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-300">#{j.user_id}</td>
                    <td className="px-4 py-2 text-gray-700 dark:text-gray-200">{j.filing_type}</td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{j.fiscal_year}</td>
                    <td className="px-4 py-2"><JobChip status={j.status} /></td>
                    <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300">
                      {norm ? (
                        <span>
                          {norm.revenue != null && <>수입 {Number(norm.revenue).toLocaleString('ko-KR')}원</>}
                          {norm.decisive_tax != null && <> · 세액 {Number(norm.decisive_tax).toLocaleString('ko-KR')}원</>}
                          {typeof norm.submitted === 'boolean' && <> · {norm.submitted ? '신고완료' : '미신고'}</>}
                        </span>
                      ) : j.last_error ? <span className="text-red-600">⚠ {j.last_error}</span> : '—'}
                    </td>
                    <td className="px-4 py-2">
                      {j.status === 'success' && j.raw_id ? (
                        <div className="flex gap-1.5">
                          <button type="button" disabled={busy} onClick={() => approve(j.raw_id!)}
                            className="text-xs bg-brand-success text-white rounded px-2 py-1 disabled:opacity-50 hover:opacity-90">승인</button>
                          <button type="button" disabled={busy} onClick={() => reject(j.raw_id!)}
                            className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-800">반려</button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">{j.status === 'queued' || j.status === 'running' ? '처리 대기' : '—'}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function ConsentChip({ status }: { status: string }) {
  if (status === 'granted') return <Chip cls="bg-green-100 text-green-800">수임 동의</Chip>;
  if (status === 'revoked') return <Chip cls="bg-red-100 text-red-800">해지</Chip>;
  return <Chip cls="bg-gray-100 text-gray-700">대기</Chip>;
}
function JobChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    success: 'bg-blue-100 text-blue-800',
    queued: 'bg-gray-100 text-gray-700',
    running: 'bg-amber-100 text-amber-800',
    failed: 'bg-red-100 text-red-800',
    cancelled: 'bg-gray-100 text-gray-500',
  };
  return <Chip cls={map[status] || 'bg-gray-100 text-gray-700'}>{status}</Chip>;
}
function Chip({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>{children}</span>;
}
