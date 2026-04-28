/**
 * Phase 0 — SPA 라우터 골격 (Phase 2 에서 채움)
 *
 * office.html 안에서 `/clients/:id`, `/tasks`, `/admin/users` 같은
 * URL 변경을 popstate 로 처리할 예정.
 */

export type Route = {
  path: string;
  render: () => void;
};

export function navigate(_path: string): void {
  // Phase 2 에서 구현
}

export function startRouter(_routes: Route[]): void {
  // Phase 2 에서 구현
}
