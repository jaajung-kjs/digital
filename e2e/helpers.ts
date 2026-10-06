import { expect, type Page } from '@playwright/test';

/** 시드 관리자 계정 — 개발 DB 기준. */
export const ADMIN = { username: 'admin', password: 'admin123' };

export async function login(page: Page) {
  await page.goto('/');
  // 이미 로그인돼 있으면 로그인 화면이 뜨지 않는다.
  const password = page.locator('input[type=password]');
  if (await password.count()) {
    await page.locator('input').first().fill(ADMIN.username);
    await password.fill(ADMIN.password);
    await password.press('Enter');
  }
  await expect(page.getByRole('navigation', { name: '주요 메뉴' })).toBeVisible();
}

/**
 * 조직 트리에서 본부 › 지사 › 국을 차례로 누른다. 트리는 평평한 treeitem 목록(aria-level)이라
 * 「직할」처럼 본부마다 겹치는 이름은 본부 바로 아래 것을 고른다.
 */
export async function openStation(page: Page, hq: string, branch: string, station: string) {
  const tree = page.getByRole('tree', { name: '조직' });
  const items = tree.getByRole('treeitem');
  const labels = await items.evaluateAll((els) => els.map((e) => `${e.getAttribute('aria-level')}:${e.textContent ?? ''}`));
  const hqIdx = labels.findIndex((l) => l.startsWith(`1:${hq}`));
  expect(hqIdx, `본부 ${hq}`).toBeGreaterThanOrEqual(0);
  const branchIdx = labels.findIndex((l, i) => i > hqIdx && l.startsWith(`2:${branch}`));
  expect(branchIdx, `지사 ${branch}`).toBeGreaterThan(hqIdx);
  await items.nth(branchIdx).click();
  await selectStation(page, station);
  await expect(page.getByRole('heading', { level: 1, name: station })).toBeVisible();
  await expect(page.getByTestId('v2-selected')).toHaveText(`${hq} › ${branch}`);
}

/** 이미 펼쳐진 트리에서 국을 누른다(국 이름은 트리에서 유일하다고 본다). */
export async function selectStation(page: Page, station: string) {
  const tree = page.getByRole('tree', { name: '조직' });
  const escaped = station.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  await tree.getByRole('treeitem', { name: new RegExp(`^${escaped} `) }).click();
  await expect(page.getByRole('heading', { level: 1, name: station })).toBeVisible();
}
