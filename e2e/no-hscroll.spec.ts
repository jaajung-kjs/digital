import { expect, test, type Page } from '@playwright/test';
import { horizontalOverflow, login, openStation } from './helpers';

/**
 * **판 안의 표는 가로로 구르지 않는다**(CONVENTIONS §1.7-e2) — 1280·1440 × 조직 트리 펼침/접힘 × 상세 레일 열림/닫힘에서
 * 보이는 표 상자마다 `scrollWidth <= clientWidth`. 표는 열 순위대로 병합·숨는다(`TableCard columns`).
 *
 * 읽기만 한다 — 설계서를 열려고 쌓은 변경 하나는 「변경 취소」로 물린다.
 */
const STATION = '(구)춘천S/S';
const SHEET_STATION = '북춘천S/S';
const PANEL = '통신용 분전반';
const VIEWPORTS = [{ width: 1280, height: 800 }, { width: 1440, height: 900 }] as const;

const main = (page: Page) => page.getByTestId('v2-main');
const detail = (page: Page) => main(page).getByRole('complementary');

/** 지금 화면 + 트리를 접은 화면 둘 다 넘치지 않는다. 트리는 펼친 채로 돌려놓는다. */
async function bothTrees(page: Page, where: string) {
  await page.mouse.move(0, 0);
  expect(await horizontalOverflow(page), `${where} · 트리 펼침`).toEqual([]);
  await page.getByRole('button', { name: '조직 접기' }).click();
  await expect(page.getByRole('button', { name: '조직 펼치기' })).toBeVisible();
  expect(await horizontalOverflow(page), `${where} · 트리 접음`).toEqual([]);
  await page.getByRole('button', { name: '조직 펼치기' }).click();
  await expect(page.getByRole('button', { name: '조직 접기' })).toBeVisible();
}

for (const vp of VIEWPORTS) {
  test.describe(`가로 스크롤 없음 ${vp.width}`, () => {
    test.use({ viewport: vp });

    test('현황 · 전원 계통(대장·편집 창) · 평면도', async ({ page }) => {
      await login(page);
      await openStation(page, '강원본부', '직할', STATION);

      // 현황 — 레일(빈 상세) · 설비 상세
      await expect(main(page).getByRole('row').nth(2)).toBeVisible();
      await bothTrees(page, '현황');
      await main(page).getByRole('radio', { name: '랙별' }).click();
      await main(page).getByRole('row').filter({ hasText: PANEL }).last().click();
      await expect(detail(page).getByRole('textbox', { name: '이름' })).toHaveValue(PANEL);
      await bothTrees(page, '현황 + 상세');

      // 차단기 편집 창 — 대장과 같은 열 선언, 전 열
      await detail(page).getByRole('button', { name: '차단기 수정', exact: true }).click();
      const editor = page.getByRole('dialog', { name: `차단기 — ${PANEL}` });
      await expect(editor.getByRole('columnheader')).toHaveText(['차단기', '표기', '교류/직류', '전압', '용량', '상', '개폐', '부하', '포트', '전원케이블', '길이(m)', '비고']);
      expect(await horizontalOverflow(page), '차단기 편집 창').toEqual([]);
      await editor.getByRole('button', { name: '닫기' }).last().click();

      // 전원 계통 차단기 대장 — 레일 닫힘 · 열림
      await main(page).getByRole('tab', { name: '전원 계통' }).click();
      await detail(page).getByRole('button', { name: '닫기', exact: true }).click().catch(() => undefined);
      const blocks = main(page).getByTestId('ledger-block');
      await expect(blocks.first()).toBeVisible();
      await expect(detail(page)).toHaveCount(0);
      await bothTrees(page, '차단기 대장');
      const head = blocks.getByTestId('ledger-block-head').getByRole('button', { name: PANEL, exact: true });
      await head.click();
      await expect(detail(page).getByRole('textbox', { name: '이름' })).toHaveValue(PANEL);
      await bothTrees(page, '차단기 대장 + 상세');

      // 평면도 — 트리는 잠기지 않는다(배경 도면 도구는 판 안). 상태표시줄 칸은 한 줄
      await main(page).getByRole('tab', { name: '평면도' }).click();
      await expect(page.getByTestId('rackplan-canvas')).toBeVisible();
      await bothTrees(page, '평면도');
      const tall = await main(page).locator('.status-bar > *').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height > 34).map((e) => e.textContent));
      expect(tall, '상태표시줄 칸이 두 줄로 서지 않는다').toEqual([]);

      await expect(page.getByRole('button', { name: '저장', exact: true })).toHaveCount(0);
    });

    test('선번장 · 측정 창', async ({ page }) => {
      await login(page);
      await openStation(page, '강원본부', '직할', SHEET_STATION);
      await main(page).getByRole('tab', { name: '선번장' }).click();
      const blocks = main(page).getByTestId('sheet-block');
      await expect(blocks.first()).toBeVisible();
      await bothTrees(page, '선번장');

      // 상세 레일 열림 — 자국 접속 설비 이름을 누른다
      await main(page).locator('td[data-col="near"] button[title]').first().click();
      await expect(detail(page)).toHaveCount(1);
      await bothTrees(page, '선번장 + 상세');
      await detail(page).getByRole('button', { name: '닫기', exact: true }).click();

      // 측정 등록 창 · 코어 측정 기록 창
      await blocks.first().getByRole('button', { name: '측정 등록' }).click();
      const measure = page.getByRole('dialog', { name: /^측정 등록/ });
      await expect(measure).toBeVisible();
      expect(await horizontalOverflow(page), '측정 등록 창').toEqual([]);
      await measure.getByRole('button', { name: '취소' }).click();
      await blocks.first().getByRole('button', { name: /측정 기록/ }).first().click();
      const history = page.getByRole('dialog', { name: /^코어 / });
      await expect(history).toBeVisible();
      expect(await horizontalOverflow(page), '코어 측정 이력 창').toEqual([]);
      await history.getByRole('button', { name: '닫기' }).last().click();

      await expect(page.getByRole('button', { name: '저장', exact: true })).toHaveCount(0);
    });

    test('설계서 · 품목 관리 · 기준정보', async ({ page }) => {
      await login(page);
      await openStation(page, '강원본부', '직할', STATION);
      // 설계서를 열 거리 — 랙 하나(저장하지 않는다)
      await main(page).getByRole('button', { name: '랙 추가' }).click();
      const addRack = page.getByRole('dialog', { name: '랙 추가' });
      await addRack.getByRole('textbox', { name: '이름' }).fill('가로검사랙');
      await addRack.getByRole('combobox', { name: '랙 품목' }).selectOption({ label: '19인치 통신랙' });
      await addRack.getByRole('button', { name: '추가' }).click();
      await page.getByRole('button', { name: '설계서', exact: true }).click();
      const design = page.getByRole('dialog', { name: '설계서' });
      await expect(design.getByRole('table').first()).toBeVisible();
      expect(await horizontalOverflow(page), '설계서').toEqual([]);
      await design.getByRole('button', { name: '닫기' }).last().click();
      await page.getByRole('button', { name: '변경 취소' }).click();
      await page.getByRole('alertdialog', { name: '변경 취소' }).getByRole('button', { name: '변경 취소' }).click();
      await expect(page.getByRole('button', { name: '저장', exact: true })).toHaveCount(0);

      for (const kind of ['equipment', 'rack', 'cable', 'category'] as const) {
        await page.goto(`/catalog?kind=${kind}`);
        await expect(page.getByRole('table')).toBeVisible();
        expect(await horizontalOverflow(page), `품목 관리 ${kind}`).toEqual([]);
      }
      await page.goto('/standards');
      for (const tab of ['노임단가', '제비율', '등록 이력'] as const) {
        await page.getByRole('tab', { name: tab }).click();
        await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
        await page.waitForTimeout(200);
        expect(await horizontalOverflow(page), `기준정보 ${tab}`).toEqual([]);
      }
    });
  });
}
