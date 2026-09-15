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
import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useV2AuthStore, isAdminRole } from './store/authStore';
import { useV2Notice } from './store/noticeStore';
import { useUnsaved, unsavedGuard } from './store/unsavedStore';
import { confirmDiscard, unsavedPrompt } from './leaveGuard';
import { AppBar, ErrorStrip, MenuBar, useConfirm, type MenuBarItem } from '../components/ui';
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
const MAIN_NAV: readonly MenuBarItem[] = [
  { key: '/', label: '설비 현황', divideAfter: true },
  { key: '/assemblies', label: '설비 관리' },
  { key: '/assets', label: '장비 관리' },
  { key: '/cables', label: '케이블 관리', divideAfter: true },
  { key: '/standards', label: '기준정보' },
];

/**
 * 지금 어느 메뉴에 있나 — **가장 긴 접두사**가 이긴다.
 *
 * `/` 는 모든 경로의 접두사라 그것만으로 고르면 늘 「설비 현황」이 켜진다. 길이로 정렬해
 * 먼저 맞는 것을 쓰면 `/assemblies` 는 제 것을 켜고 `/n/:id` 는 `/` 로 떨어진다.
 */
function navKeyOf(pathname: string): string {
  const hit = [...MAIN_NAV]
    .sort((a, b) => b.key.length - a.key.length)
    .find((m) => m.key !== '/' && pathname.startsWith(m.key));
  return hit?.key ?? '/';
}

export function V2Shell() {
  const user = useV2AuthStore((s) => s.user);
  const logout = useV2AuthStore((s) => s.logout);
  const navigate = useNavigate();

  const roleLabel = isAdminRole(user?.role) ? '관리자' : '조회';
  const { confirm, confirmDialog } = useConfirm();
  /**
   * **떠나기 전에 묻는 자리는 하나다.**
   *
   * 편집 중인 화면이 「안 저장된 것이 몇 건」인지 손을 들고(`useUnsaved`), 막는 일은 여기서
   * 한다. 화면마다 라우터를 가로채면 새 화면이 생길 때마다 빠뜨린다 — 실제로 위쪽 메뉴로
   * 넘어가는 길에는 아무 데도 물음이 없어서, 고치던 것이 아무 말 없이 사라졌다.
   *
   * **묻고 버리는 일은 함께 간다**(`confirmDiscard` — 변전소를 바꿀 때와 같은 함수다).
   * 여기가 묻기만 하던 동안, 「변경 N건이 사라집니다」에 「이동」을 눌러도 워킹 카피는 그대로
   * 남아 있었다. 그래서 설비 관리와 설비 품목 사이를 오갈 때마다 같은 상자가 다시 떴다 —
   * 사라진 적이 없으니 물을 것도 계속 남는다.
   */
  const unsaved = useUnsaved((s) => s.count);
  const mayLeave = () => confirmDiscard(unsavedGuard, (dirty) => confirm(unsavedPrompt(dirty)));
  /* 창을 닫거나 새로 고칠 때는 브라우저가 대신 묻는다 — 우리 상자를 띄울 수 없는 자리다. */
  useEffect(() => {
    if (unsaved === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  const notice = useV2Notice((st) => st.error);
  /**
   * 화면을 옮기면 **그 화면의 오류는 두고 간다.**
   *
   * 띠는 「사용자가 닫을 때까지 남는다」가 규칙인데, 그것이 화면 밖까지 따라다니면 아무
   * 상관없는 곳에서 「'구조' 분류가 이미 있습니다」를 계속 보게 된다 — 조치할 자리가 없는
   * 곳에 남은 경고는 읽히지 않고, 읽히지 않는 경고는 다음 경고까지 가린다.
   */
  const { pathname } = useLocation();
  const activeNav = navKeyOf(pathname);
  useEffect(() => {
    useV2Notice.getState().clearError();
  }, [pathname]);
  const success = useV2Notice((st) => st.success);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-screen flex-col">
      {/* ── 상단 띠 + 메뉴바 ──
          공기업 업무 시스템의 관용구다: 기관 색 띠 한 줄, 그 아래 회색 메뉴 한 줄.
          두 줄을 각각 공용 컴포넌트로 뽑아 두면 화면이 늘어도 머리는 한 곳에서만 바뀐다. */}
      <AppBar
        title={PRODUCT_NAME}
        subtitle="전력ICT 설비관리시스템"
        onTitleClick={() => { void mayLeave().then((ok) => { if (ok) navigate('/'); }); }}
      >
        {user && (
          <span className="text-xs text-appbar-fg/85">
            {user.username}
            <span className="ml-1 text-appbar-fg/65">({roleLabel})</span>
          </span>
        )}
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-1.5 border border-appbar-fg/35 px-2 py-0.5 text-xs text-appbar-fg transition-colors hover:bg-appbar-fg/10"
        >
          <LogOut size={13} />
          로그아웃
        </button>
      </AppBar>

      <MenuBar
        items={MAIN_NAV}
        activeKey={activeNav}
        onSelect={(to) => { void mayLeave().then((ok) => { if (ok) navigate(to); }); }}
      />

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

      {confirmDialog}

      {/* ── 콘텐츠 영역 ── */}
      <div className="flex min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}

export default V2Shell;
