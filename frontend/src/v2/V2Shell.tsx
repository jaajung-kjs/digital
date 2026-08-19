/**
 * V2Shell — v2 전용 최상위 레이아웃
 *
 * 구조:
 *   ┌── header (shrink-0, h-12) ──────────────────────────────────────────┐
 *   │  [Boxes] ICT 디지털 트윈  |  설비 관리  설비관리대장  |  사용자(역할) 로그아웃 │
 *   └─────────────────────────────────────────────────────────────────────┘
 *   ┌── <Outlet/> (flex-1, min-h-0) ─────────────────────────────────────┐
 *   │  v2 페이지가 자체 OrgTreePanel 보유 → 이중 사이드바 없음           │
 *   └─────────────────────────────────────────────────────────────────────┘
 */
import { Fragment } from 'react';
import { Outlet, Link, NavLink, useNavigate } from 'react-router-dom';
import { Boxes, LogOut } from 'lucide-react';
import { useV2AuthStore, isAdminRole } from './store/authStore';
import { useV2Notice } from './store/noticeStore';
import { ErrorStrip } from '../components/ui';
import { PRODUCT_NAME } from '../product';

/**
 * 최상위 화면 셋 — **다루는 것이 다르면 탭이 아니라 화면을 나눈다**.
 *
 * 기준정보는 대장의 「종류」 탭들과 성격이 다르다: 우리가 만드는 것이 아니라 바깥에서
 * 받아 오는 표다. 대장 안에 넣었더니 그 탭만 왼쪽 목록이 사라져 화면이 덜컹거렸다.
 */
/**
 * 상단 내비 — **일하는 곳 │ 정의하는 곳 │ 밖에서 받는 표**.
 *
 * 세 대장(설비·자산·케이블)은 서로의 보는 면이 아니라 각자 별개의 대장이라 각자 목적지를
 * 갖는다. 그래도 한 묶음이라는 것은 보여야 해서, 앞뒤로 옅은 구분선을 둔다.
 */
const MAIN_NAV = [
  { to: '/', label: '설비 관리', divideAfter: true },
  { to: '/assemblies', label: '설비 품목' },
  { to: '/assets', label: '장비 품목' },
  { to: '/cables', label: '케이블 품목', divideAfter: true },
  { to: '/standards', label: '기준정보' },
] as const;

export function V2Shell() {
  const user = useV2AuthStore((s) => s.user);
  const logout = useV2AuthStore((s) => s.logout);
  const navigate = useNavigate();

  const roleLabel = isAdminRole(user?.role) ? '관리자' : '조회';
  const notice = useV2Notice((st) => st.error);
  const success = useV2Notice((st) => st.success);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-screen flex-col">
      {/* ── 상단 헤더 ── */}
      <header className="shrink-0 flex h-12 items-center gap-4 border-b border-line bg-surface px-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
        {/* 타이틀 */}
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2 text-sm font-semibold text-content"
        >
          <Boxes size={20} className="text-primary" />
          {PRODUCT_NAME}
        </Link>

        {/* 내비게이션 링크 */}
        <nav className="flex items-center gap-1" aria-label="주요 메뉴">
          {MAIN_NAV.map((item) => (
            <Fragment key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `rounded px-3 py-1.5 text-sm transition-colors ${
                  isActive ? 'bg-surface-2 font-medium text-content' : 'text-content-muted hover:text-content'
                }`
              }
            >
              {item.label}
            </NavLink>
            {'divideAfter' in item && item.divideAfter && (
              <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-line" />
            )}
            </Fragment>
          ))}
        </nav>

        {/* 우측: 사용자 + 로그아웃 */}
        <div className="ml-auto flex shrink-0 items-center gap-3">
          {user && (
            <span className="text-sm text-content-muted">
              {user.username}
              <span className="ml-1 text-xs text-content-faint">({roleLabel})</span>
            </span>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm text-content-muted transition-colors hover:text-content"
          >
            <LogOut size={16} />
            로그아웃
          </button>
        </div>
      </header>

      {/* 전역 알림 — 조직·카탈로그 변경 실패가 여기로 온다(무음 실패 방지) */}
      <ErrorStrip
        message={notice}
        onDismiss={() => useV2Notice.getState().clearError()}
        className="shrink-0 border-b border-line bg-danger-bg px-4 py-1"
      />

      {/* 성공 알림 — 저장 바가 사라지는 것만으로는 저장 여부를 알 수 없다.
          오류와 달리 조치할 것이 없으므로 잠시 뒤 스스로 사라진다. */}
      {success && (
        <div
          role="status"
          className="shrink-0 border-b border-line bg-success-bg px-4 py-1 text-xs text-success"
        >
          {success}
        </div>
      )}

      {/* ── 콘텐츠 영역 ── */}
      <div className="flex min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}

export default V2Shell;
