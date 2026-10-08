import { expect, test, type Page } from '@playwright/test';
import { login, openBranch, openStation } from './helpers';

/**
 * ⑤ 광 계통·중계경로 한 바퀴 — 강원본부 직할 시드(`npm run db:next:seed`) 위에서. **읽기만 한다**(저장 없음).
 *
 * 직할 지사 → 광 계통도 → 회선 하나 선택(지나는 광선로에 겹침) → 이중화 경고 선택(함께 지나는 광선로 띠) →
 * 국 마디를 눌러 그 국으로 / 북춘천 선번장 → 판 2 코어 9 「중계경로」 → 요약이 SCADA 회선현황(「회선현황」 G7)
 * 「북춘천(OFD:9)-춘천HP(OFD:20)-화천HP(OFD:1)-화천(OFD:37)-철원」 과 같은 꼴로, 구간마다 같다 — 단 화천은 OFD 선번장이
 * 철원 쪽 판을 1–24 로 적으므로 어댑터 13(사용자 결정 2026-10-08: G7 의 37 은 현장 문서 사이의 불일치로 기록).
 */

/** 찍은 그림 — 기본은 test-results, 검토 때는 `STAGE5_SHOTS` 로 다른 곳에. */
const SHOTS = process.env.STAGE5_SHOTS ?? 'test-results/stage5';
/** 시드 — 북춘천 OFD 슬롯 2(↔ 춘천H/P, 154kV 춘천수력T/L)의 코어 9 = 「RTU 예비회선용 광스위치 북춘천-철원」. */
const RTU_LINE = '154kV 춘천수력T/L';
const RTU_CORE = 9;
/**
 * 그 회선의 중계경로 요약 — 국(떠나는 끝의 접속 설비:어댑터 번호). 화천의 중계 패치(판 1 코어 1 ↔ 판 2 코어 13)는
 * 엑셀 근거로 시드에 실었다(`EXCEL_RELAY_PATCHES`).
 */
const RTU_SUMMARY = '북춘천(OFD:9)-춘천HP(OFD:20)-화천HP(OFD:1)-화천(OFD:13)-철원';
/** 통합PTP 북춘천-춘천H/P — 주 1·2 와 예비 7·8 이 같은 광선로(이중화 경고 1 건). */
const PTP = '통합PTP 북춘천-춘천H/P';

const main = (page: Page) => page.getByTestId('v2-main');
const panel = (page: Page) => main(page).getByTestId('path-panel');
const map = (page: Page) => main(page).getByTestId('optical-map');
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/t5-${name}.png` });

async function openBranchMap(page: Page) {
  await login(page);
  await openBranch(page, '강원본부', '직할');
  await main(page).getByRole('tab', { name: '광 계통도' }).click();
  await expect(map(page)).toBeVisible();
  await expect(panel(page)).toBeVisible();
}

test('⑤ 광 계통도 — 회선 선택·이중화 경고·국으로 이동 (읽기 전용)', async ({ page }) => {
  await openBranchMap(page);
  // 1. 범례 — 주회선·예비회선이 실제로 있다(코어 주/예비 시드)
  const legend = main(page).getByTestId('map-legend');
  await expect(legend).toContainText('주회선');
  await expect(legend).toContainText('예비회선');
  await page.mouse.move(0, 0);
  await shot(page, '01-map');

  // 2. 회선 하나 선택 — 북춘천 RTU 예비회선(광선로 4개를 지난다) → 그 4 광선로마다 예비회선 점선이 겹친다
  /* 회선 목록의 방향은 화면이 정한다 — 두 끝이 다 범위 안이면 국 이름이 앞서는 끝(북춘천)부터. 한 방향만 받는다. */
  await panel(page).getByRole('textbox', { name: '회선 검색' }).fill('RTU');
  const rtu = panel(page).getByTestId('bundle-list').getByText(`${RTU_SUMMARY} · 광선로 4개`, { exact: true });
  await expect(rtu).toBeVisible();
  await rtu.click();
  const overlay = map(page).locator('[data-overlay]');
  await expect(overlay).toHaveCount(4);
  expect(await overlay.evaluateAll((els) => els.map((e) => e.getAttribute('data-duty')))).toEqual(['backup', 'backup', 'backup', 'backup']);
  await expect(panel(page).getByTestId('bundle-list').getByText(/^RTU 광스위치 · 북춘천 ↔ 철원$/)).toBeVisible();
  await page.mouse.move(0, 0);
  await shot(page, '02-bundle-picked');
  await panel(page).getByRole('button', { name: '선택 해제' }).click();
  await expect(overlay).toHaveCount(0);
  await panel(page).getByRole('textbox', { name: '회선 검색' }).fill('');

  // 3. 이중화 경고 — 통합PTP 북춘천-춘천H/P 주(1·2)·예비(7·8)가 같은 광선로
  const warnings = panel(page).getByTestId('warning-list');
  /* 직할 국 그래프는 나무다(링 0) — 다만 경로 미완결이 남아 있으니 「링이 없다」고 단정하지 않는다. */
  await expect(panel(page).getByTestId('ring-list')).toContainText(/완결된 회선으로는 링이 나타나지 않습니다 \(경로 미완결 \d+\)/);
  await expect(panel(page).getByTestId('incomplete-list').getByRole('button').first()).toBeVisible();
  const warn = warnings.getByText(new RegExp(PTP.replace(/[()/]/g, '\\$&'))).first();
  await expect(warn).toBeVisible();
  await warn.click();
  await expect(map(page).locator('[data-warned]')).toHaveCount(1);
  const roles = await map(page).locator('[data-overlay]').evaluateAll((els) => els.map((e) => e.getAttribute('data-duty')));
  expect(new Set(roles)).toEqual(new Set(['main', 'backup']));
  await page.mouse.move(0, 0);
  await shot(page, '03-warning-picked');

  // 4. 국 마디를 누르면 그 국으로 — 화천S/S
  const hwacheon = await map(page).locator('[data-station]').filter({ has: page.locator('text', { hasText: /^화천S\/S$/ }) }).getAttribute('data-station');
  await map(page).locator(`[data-station-hit="${hwacheon}"]`).click();
  await expect(page.getByRole('heading', { level: 1, name: '화천S/S' })).toBeVisible();

  // 읽기만 했다 — 변경안이 없다
  await expect(page.getByRole('button', { name: '저장', exact: true })).toHaveCount(0);
});

test('⑤ 중계경로 — 북춘천 RTU 예비회선(판 2 코어 9)이 SCADA 회선현황과 구간마다 같다 (읽기 전용)', async ({ page }) => {
  await login(page);
  await openStation(page, '강원본부', '직할', '북춘천S/S');
  await main(page).getByRole('tab', { name: '선번장' }).click();
  const block = main(page).getByTestId('sheet-block').filter({ has: page.getByTestId('sheet-block-head').filter({ hasText: RTU_LINE }) }).first();
  await expect(block).toBeVisible();
  const row = block.getByTestId(`sheet-row-${RTU_CORE}`);
  await row.scrollIntoViewIfNeeded();
  await row.hover();
  await row.getByRole('button', { name: `코어 ${RTU_CORE} 중계경로` }).click();
  const dialog = page.getByRole('dialog');
  const summary = dialog.getByTestId('path-summary');
  await expect(summary).toBeVisible();
  const text = (await summary.innerText()).replace(/\s+/g, '');
  /* 「회선현황」 G7 — 북춘천(OFD:9)-춘천HP(OFD:20)-화천HP(OFD:1)-화천(OFD:37)-철원. 앞 세 구간은 글자 그대로 같고,
     화천은 선번장 번호(판 2 No.13)를 따른다 — G7 의 37 은 현장 문서 불일치. */
  expect(text.startsWith('북춘천(OFD:9)-춘천HP(OFD:20)-화천HP(OFD:1)-화천')).toBe(true);
  expect(text).toBe(RTU_SUMMARY);
  await expect(dialog.getByTestId('path-step').first()).toHaveText('북춘천S/S · RTU 광스위치 · FX-TX:2');
  await expect(dialog.getByTestId('path-step').last()).toHaveText('철원S/S · RTU 광스위치 · FX-TX:2');
  await expect(dialog.getByText('경로 미완결')).toHaveCount(0);
  await expect(dialog.getByText('예비회선', { exact: true })).toBeVisible();
  await page.mouse.move(0, 0);
  await shot(page, '04-trace');
  await dialog.getByRole('button', { name: '닫기', exact: true }).last().click();
  await expect(page.getByRole('button', { name: '저장', exact: true })).toHaveCount(0);
});
