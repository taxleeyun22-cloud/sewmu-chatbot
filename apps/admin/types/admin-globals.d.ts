/**
 * 옛 admin.html 안 cross-script global 함수 type 정의.
 */
declare global {
  function openCustomerDashboard(userId: number): Promise<void> | void;
  function openRoom(roomId: string): Promise<void> | void;
  function tab(name: 'chat' | 'live' | 'rooms' | 'users' | 'docs' | 'anal' | 'review' | 'faq' | 'internal'): void;
  function setClientTabMode(mode: 'user' | 'business'): void;
  function loadUsers(status: string): void;
  function _roomFilterSet(priorities: Set<number>): void;
  function openMyTodos(): void;
  function openTerminationRequests(): void;
  function openSearch(): void;
  function openBulkSend(): void;
  function logout(): void;
  function mutationDone(opts?: Record<string, boolean>): void;
  function fetchAdmin(url: string, init?: RequestInit): Promise<Response>;
  var KEY: string | undefined;
  var IS_OWNER: boolean | undefined;
  var IS_MANAGER: boolean | undefined;
  var IS_STAFF: boolean | undefined;
  var currentRoomId: string | undefined;
  var _cdCurrentUserId: number | undefined;
  var _bdCurrent: { id: number; company_name?: string } | undefined;
  interface Window {
    __filingsStore?: { setList: (list: unknown[]) => void };
    __messagesStore?: { append: (msg: unknown) => void };
    __renderFilingCard?: (f: unknown, userId: number) => string;
    __reactCdHeaderMounted?: boolean;
    KEY?: string;
  }
}
export {};
