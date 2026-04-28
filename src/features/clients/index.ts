/**
 * features/clients 공개 API
 *
 * Phase 2 진행 동안 admin.js 의 거래처 함수들이 점진적으로 여기로 이전됨.
 * 외부(features/rooms, pages/admin 등) 는 이 파일만 import.
 *
 * Stage 2-2 현재: api 만 노출. dashboard, list, labels, modal-new, modal-edit
 * 등은 다음 작업에서 채워짐.
 */

// API wrapper (이미 구현)
export {
  listClients,
  getClient,
  listBusinesses,
  getBusiness,
  saveBusiness,
  deleteBusiness,
  listBizDocs,
  listFinance,
  getFinanceSummary,
  upsertFinance,
  deleteFinance,
  listMemos,
  addMemo,
  updateMemo,
  deleteMemo,
} from './api';

// Stage 2-2 다음 작업에서 추가될 export 들 (placeholder):
// export { openCustomerDashboard } from './dashboard';
// export { loadBusinessList } from './list';
// export { setClientTabMode } from './tabs';
// export { openProfileModal, saveProfile, deleteProfile } from './profile';
// export { openLabelManageModal, addLabel, deleteLabel } from './labels';
// export { openNewBusinessModal, submitNewFiling } from './modal-new';
// export { openCsSidePanel } from './side-panel';
