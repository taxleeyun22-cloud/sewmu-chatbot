/**
 * Phase 3.4.C (2026-05-08): 거래처 dashboard 기본 정보 (cdBasic) React.
 *
 * 표시:
 *   - 헤더: "기본 정보" + ✏️ 수정 버튼 (openEditUserInfoModal)
 *   - 이름 / 연락처 / 생년월일 / 이메일 (있으면) / 가입일
 *
 * 자동 reactive:
 *   - $dashboard 변경 (mutation 후 setLoaded 또는 다른 데서 update) → 자동 갱신
 *   - 사장님이 사용자 정보 수정 시 store.update 호출하면 즉시 반영
 */
import { useStore } from '@nanostores/react';
import { $dashboard } from '../../admin/state/dashboard-store';

declare global {
  interface Window {
    openEditUserInfoModal?: (userId: number) => void;
  }
}

function handleEditClick(userId: number) {
  if (typeof window.openEditUserInfoModal === 'function') {
    window.openEditUserInfoModal(userId);
  }
}

export function CdBasic() {
  const s = useStore($dashboard);

  if (s.loading) {
    return <div style={{ color: '#8b95a1' }}>…</div>;
  }
  if (s.error) {
    return <div style={{ color: '#f04452' }}>로드 실패: {s.error}</div>;
  }

  const u = s.user;
  const userId = u?.id || s.userId || 0;
  const nm = (u?.real_name || u?.name || (s.userId ? `#${s.userId}` : '')) as string;
  const phone = u?.phone || '미등록';
  const birth = u?.birth_date ? String(u.birth_date).slice(0, 10) : '미등록';
  const created = u?.created_at ? String(u.created_at).slice(0, 10) : '';

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontSize: '.78em', color: '#6b7280' }}>기본 정보</span>
        <button
          onClick={() => handleEditClick(userId)}
          style={{
            background: '#eff6ff',
            color: '#1e40af',
            border: '1px solid #3b82f6',
            padding: '3px 10px',
            borderRadius: '6px',
            fontSize: '.74em',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          ✏️ 수정
        </button>
      </div>
      <div>이름: <b>{nm}</b></div>
      <div>연락처: {phone}</div>
      <div>생년월일: {birth}</div>
      {u?.email ? <div>이메일: {u.email}</div> : null}
      <div>가입: {created}</div>
    </>
  );
}
