/**
 * Phase 0 — 타입 골격 (단일 진실의 원천)
 *
 * 각 인터페이스는 Phase 2 부터 실제 DB 스키마·API 응답에 맞춰 채움.
 * 모든 features/* 모듈이 이 파일에서 import 하므로 모양 변경 시
 * TypeScript 가 영향 범위를 자동 알림.
 *
 * 출처 매핑 (이전 plan 의 데이터 연결 지도):
 * - Client     ← chat_rooms (거래처)
 * - User       ← users
 * - Room       ← chat_rooms + room_members
 * - Message    ← conversations
 * - Document   ← documents
 * - Task       ← tasks (Phase 3 에서 신규 테이블)
 */

export interface User {
  id: number;
  real_name: string | null;
  is_admin: 0 | 1;
  staff_role: 'staff' | 'boss' | null;
  status: 'pending' | 'approved_guest' | 'approved_client' | 'rejected';
}

export interface Client {
  id: number;
  name: string;
  phone: string | null;
  priority: 1 | 2 | 3 | null;
  status: string | null;
  created_at: string;
}

export interface Room {
  id: number;
  name: string;
  max_members: number;
  created_at: string;
}

export interface Message {
  id: number;
  room_id: number;
  user_id: number;
  role: 'user' | 'assistant' | 'admin';
  content: string;
  created_at: string;
}

export interface Document {
  id: number;
  room_id: number;
  type: 'photo' | 'receipt' | 'pdf' | 'doc';
  url: string;
  ocr_text: string | null;
  created_at: string;
}

export interface Task {
  id: number;
  room_id: number;
  assigned_to: number;
  title: string;
  due_date: string | null;
  status: 'open' | 'done' | 'snoozed' | 'passed';
  created_at: string;
}
