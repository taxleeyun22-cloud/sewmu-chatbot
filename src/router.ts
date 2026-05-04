/**
 * src/router.ts — 자체 SPA Router (메타 12종 #7, Phase S3a, 2026-05-04)
 *
 * 사장님 명령: "S3 완전 SPA — 뒤로가기 누르면 바로 이전 화면"
 *
 * 의존성: 0 (라이브러리 X, 표준 history API 만)
 *
 * 핵심 API:
 * - defineRoute(pattern, viewFn) — path 패턴 + 렌더 함수 등록
 *   pattern 예: '/', '/admin', '/admin/:tab', '/business' (query string 은 별도)
 * - navigate(path, opts?) — pushState + render. opts.replace 면 replaceState.
 * - back() — history.back()
 * - getCurrent() — 현재 path + params
 * - onNavigate(cb) — 라우트 변화 콜백 (전역 listener)
 *
 * 사용:
 *   import { defineRoute, navigate, start } from './router';
 *   defineRoute('/', () => renderChat());
 *   defineRoute('/admin/:tab', ({ params }) => renderAdmin(params.tab));
 *   start();  // popstate 등록 + 첫 렌더
 *
 * Cloudflare Pages: _redirects 의 `/*  /index.html  200` 으로 모든 path → index.html.
 * 그 후 router.start() 가 location.pathname 매칭.
 */

export interface RouteContext {
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
}

export type RouteHandler = (ctx: RouteContext) => void | Promise<void>;

interface CompiledRoute {
  pattern: string;
  regex: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

const routes: CompiledRoute[] = [];
const listeners: Array<(ctx: RouteContext) => void> = [];

/* path pattern → regex 컴파일.
   '/admin/:tab' → /^\/admin\/([^/]+)$/  + paramNames = ['tab']
   '/' → /^\/$/  + paramNames = [] */
function compile(pattern: string): { regex: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
  const regexStr = pattern
    .replace(/\//g, '\\/')
    .replace(/:([a-zA-Z_]+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
  return { regex: new RegExp('^' + regexStr + '$'), paramNames };
}

export function defineRoute(pattern: string, handler: RouteHandler): void {
  const { regex, paramNames } = compile(pattern);
  routes.push({ pattern, regex, paramNames, handler });
}

function match(path: string): { route: CompiledRoute; params: Record<string, string> } | null {
  for (const route of routes) {
    const m = path.match(route.regex);
    if (m) {
      const params: Record<string, string> = {};
      route.paramNames.forEach((name, i) => {
        params[name] = decodeURIComponent(m[i + 1] || '');
      });
      return { route, params };
    }
  }
  return null;
}

async function render(path: string): Promise<void> {
  const url = new URL(path, location.origin);
  const matched = match(url.pathname);
  const ctx: RouteContext = {
    path: url.pathname,
    params: matched?.params || {},
    query: url.searchParams,
  };
  if (matched) {
    try {
      await matched.route.handler(ctx);
    } catch (e) {
      console.error('[router] handler error:', e);
    }
  } else {
    console.warn('[router] no route matched:', url.pathname);
  }
  /* 전역 listener (탭 active state 등) */
  for (const cb of listeners) {
    try {
      cb(ctx);
    } catch (e) {
      console.error('[router] listener error:', e);
    }
  }
}

export function navigate(path: string, opts?: { replace?: boolean }): void {
  const fullPath = path.startsWith('/') ? path : '/' + path;
  if (opts?.replace) {
    history.replaceState({ path: fullPath }, '', fullPath);
  } else {
    history.pushState({ path: fullPath }, '', fullPath);
  }
  render(fullPath);
}

export function back(): void {
  history.back();
}

export function getCurrent(): RouteContext {
  const url = new URL(location.href);
  const matched = match(url.pathname);
  return {
    path: url.pathname,
    params: matched?.params || {},
    query: url.searchParams,
  };
}

export function onNavigate(cb: (ctx: RouteContext) => void): () => void {
  listeners.push(cb);
  return () => {
    const i = listeners.indexOf(cb);
    if (i >= 0) listeners.splice(i, 1);
  };
}

let started = false;

/**
 * start() — popstate 등록 + 현재 URL 첫 렌더.
 * 모든 defineRoute 호출 후 한 번만 호출.
 */
export function start(): void {
  if (started) return;
  started = true;

  /* 브라우저 뒤로가기 / 앞으로가기 */
  window.addEventListener('popstate', () => {
    render(location.pathname + location.search);
  });

  /* SPA-내부 link 자동 가로채기:
     <a href="/admin"> 같은 기존 anchor 가 reload 안 하고 SPA navigate.
     단 외부 link (target=_blank, http://, mailto: 등) 는 그대로. */
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented) return;
    const target = e.target as HTMLElement;
    const a = target.closest('a') as HTMLAnchorElement | null;
    if (!a || !a.href) return;
    if (a.target && a.target !== '_self') return;
    if (a.hasAttribute('download')) return;
    if (a.dataset.spaSkip === '1') return;
    /* 외부 link skip */
    const url = new URL(a.href, location.origin);
    if (url.origin !== location.origin) return;
    /* mailto: / tel: / javascript: 는 origin 같지 않음, 자동 skip */
    e.preventDefault();
    navigate(url.pathname + url.search);
  });

  /* 첫 렌더 */
  render(location.pathname + location.search);
}
