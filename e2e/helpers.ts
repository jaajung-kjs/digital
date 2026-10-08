import { expect, type Page } from '@playwright/test';
import { E2E_USER } from './support/dbSnapshot';

/**
 * E2E 도우미.
 *
 * **계정** — 시험은 개발 관리자(`admin`)가 아니라 **전용 계정 `e2e`(역할 admin)** 로 로그인한다. globalSetup
 * (`support/globalSetup.ts`)이 없으면 만들고, teardown 은 그 계정이 남긴 변경 이력만 걷는다 — 개발 DB 를 함께 쓰는
 * 사람·에이전트가 `admin` 으로 저장한 이력은 시험이 건드리지 않는다. 비밀번호는 `E2E_PASSWORD`(기본값은 dbSnapshot).
 * 시험 데이터 이름은 `E2E` 로 시작한다(끝에 남은 것이 있으면 teardown 이 실패한다).
 */
export async function login(page: Page) {
  await page.goto('/');
  // 이미 로그인돼 있으면 로그인 화면이 뜨지 않는다.
  const password = page.locator('input[type=password]');
  if (await password.count()) {
    await page.locator('input').first().fill(E2E_USER.username);
    await password.fill(E2E_USER.password);
    await password.press('Enter');
  }
  await expect(page.getByRole('navigation', { name: '주요 메뉴' })).toBeVisible();
}

/**
 * 조직 트리에서 본부 › 지사 › 국을 차례로 누른다. 트리는 평평한 treeitem 목록(aria-level)이라
 * 「직할」처럼 본부마다 겹치는 이름은 본부 바로 아래 것을 고른다.
 */
export async function openStation(page: Page, hq: string, branch: string, station: string) {
  await openBranch(page, hq, branch);
  await selectStation(page, station);
  await expect(page.getByRole('heading', { level: 1, name: station })).toBeVisible();
  await expect(page.getByTestId('v2-selected')).toHaveText(`${hq} › ${branch}`);
}

/** 조직 트리에서 본부 › 지사를 누른다 — 지사 판(현황·광 계통도)이 선다. 「직할」처럼 겹치는 이름은 그 본부 바로 아래 것. */
export async function openBranch(page: Page, hq: string, branch: string) {
  const tree = page.getByRole('tree', { name: '조직' });
  const items = tree.getByRole('treeitem');
  /* 트리가 다 서기 전에 읽으면 본부가 없다고 나온다 — 그 본부 줄이 설 때까지 기다린다. */
  await expect(tree.locator(`[role="treeitem"][aria-level="1"]`).filter({ hasText: new RegExp(`^${hq.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}`) }).first()).toBeVisible();
  const labels = await items.evaluateAll((els) => els.map((e) => `${e.getAttribute('aria-level')}:${e.textContent ?? ''}`));
  const hqIdx = labels.findIndex((l) => l.startsWith(`1:${hq}`));
  expect(hqIdx, `본부 ${hq}`).toBeGreaterThanOrEqual(0);
  const branchIdx = labels.findIndex((l, i) => i > hqIdx && l.startsWith(`2:${branch}`));
  expect(branchIdx, `지사 ${branch}`).toBeGreaterThan(hqIdx);
  await items.nth(branchIdx).click();
  await expect(page.getByRole('heading', { level: 1, name: branch })).toBeVisible();
}

/** 이미 펼쳐진 트리에서 국을 누른다(국 이름은 트리에서 유일하다고 본다). */
export async function selectStation(page: Page, station: string) {
  const tree = page.getByRole('tree', { name: '조직' });
  const escaped = station.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  await tree.getByRole('treeitem', { name: new RegExp(`^${escaped} `) }).click();
  await expect(page.getByRole('heading', { level: 1, name: station })).toBeVisible();
}

/**
 * 판 안의 표는 가로로 구르지 않는다(CONVENTIONS §1.7-e2) — 보이는 표 상자마다 `scrollWidth <= clientWidth`,
 * 가로로 구를 수 있는 상자(overflow-x auto/scroll)도, 문서도 넘치지 않는다. 넘친 것을 「어디 · 폭」으로 돌려준다.
 */
export async function horizontalOverflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const visible = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const name = (el: HTMLElement) => `${el.tagName.toLowerCase()}[${el.getAttribute('data-testid') ?? el.className.toString().slice(0, 40)}]`;
    document.querySelectorAll('table').forEach((t) => {
      const box = t.parentElement as HTMLElement | null;
      if (!box || !visible(t) || t.closest('[data-design-print]')) return;
      if (box.scrollWidth > box.clientWidth + 1) out.push(`table in ${name(box)} ${box.clientWidth}<${box.scrollWidth}`);
    });
    document.querySelectorAll<HTMLElement>('body *').forEach((el) => {
      if (!visible(el) || el.closest('[data-design-print]')) return;
      const x = getComputedStyle(el).overflowX;
      if ((x === 'auto' || x === 'scroll') && el.scrollWidth > el.clientWidth + 1) out.push(`scroll box ${name(el)} ${el.clientWidth}<${el.scrollWidth}`);
    });
    if (document.documentElement.scrollWidth > window.innerWidth + 1) out.push(`document ${window.innerWidth}<${document.documentElement.scrollWidth}`);
    return out;
  });
}
