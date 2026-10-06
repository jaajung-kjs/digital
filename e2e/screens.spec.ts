import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

/**
 * 화면 스크린샷 — ②-b 정리 뒤 모든 화면을 두 폭(1280×800 · 1440×900)으로 찍어 `test-results/screens/` 에 남긴다.
 * 판정은 사람이(또는 검토자가) 그림을 열어 본다: 글자 세로 쪼개짐·도구줄 두 줄·겹침·잘림·금지어·빈 열.
 *
 * 읽기만 한다 — 아무것도 저장하지 않는다(열었던 대화상자는 닫는다). 기계로 잡을 수 있는 것
 * (도구줄 한 줄, 화면 글자 금지어)은 여기서도 함께 본다.
 */

const STATION_URL = '/n/12ed9894-1a1c-401e-be70-9ffd527d9d32'; // 강원본부 › 직할 › (구)춘천S/S
const STATION = '(구)춘천S/S';
const PANEL = '통신용 분전반'; // 차단기 22 · 연결 여럿
const RACK = 'ICT관제소 서버랙'; // 설비 여럿이 든 랙
const OUT = 'test-results/screens';

const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
] as const;

/** 화면 글자 금지어(CONVENTIONS §0) — 「판」·「키」는 홀로 쓴 낱말로만 본다(평면도·노임단가 같은 말은 된다). */
const FORBIDDEN = [/회로/, /안의 설비/, /종류/, /자산/, /(^|[\s·(])판($|[\s·)])/, /(^|\s)키($|\s)/];

const main = (page: Page) => page.getByTestId('v2-main');
const detail = (page: Page) => main(page).getByRole('complementary');

async function noForbiddenWords(page: Page, where: string) {
  const text = await page.locator('body').innerText();
  for (const re of FORBIDDEN) expect(text, `${where}: 금지어 ${re}`).not.toMatch(re);
}

/** 현황 도구줄(머리 띠)이 한 줄인가 — 줄이 넘치면 높이가 한 줄 높이를 넘는다. */
async function toolbarIsOneLine(page: Page) {
  const bar = main(page).getByRole('radiogroup', { name: '현황 보기' }).locator('xpath=../..');
  const box = (await bar.boundingBox())!;
  expect(box.height, '현황 도구줄 높이').toBeLessThanOrEqual(44);
}

for (const vp of VIEWPORTS) {
  test.describe(`화면 ${vp.width}`, () => {
    test.use({ viewport: vp });
    const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${vp.width}-${name}.png` });

    test('현황 · 상세 · 평면도', async ({ page }) => {
      await login(page);
      await page.goto(STATION_URL);
      await expect(page.getByRole('heading', { level: 1, name: STATION })).toBeVisible();

      // 현황 — 품목별
      await expect(main(page).getByRole('radio', { name: '품목별' })).toBeChecked();
      await expect(main(page).getByRole('row').nth(2)).toBeVisible();
      await toolbarIsOneLine(page);
      await noForbiddenWords(page, '현황 품목별');
      await shot(page, '01-status-by-type');

      // 현황 — 랙별
      await main(page).getByRole('radio', { name: '랙별' }).click();
      await expect(main(page).getByRole('radio', { name: '랙별' })).toBeChecked();
      await toolbarIsOneLine(page);
      await noForbiddenWords(page, '현황 랙별');
      await page.mouse.move(0, 0); // 갈래 단추의 호버·색 전환이 끝난 뒤에 찍는다
      await page.waitForTimeout(300);
      await shot(page, '02-status-by-rack');

      // 설비 상세 — 정보(차단기 요약 카드)
      await main(page).getByRole('row').filter({ hasText: PANEL }).last().click();
      await expect(detail(page).getByRole('textbox', { name: '이름' })).toHaveValue(PANEL);
      await noForbiddenWords(page, '설비 상세 정보');
      await shot(page, '03-equipment-info');

      // 설비 상세 — 연결(두 줄)
      await detail(page).getByRole('tab', { name: '연결' }).click();
      await expect(detail(page).getByTestId('link-far').first()).toBeVisible();
      await noForbiddenWords(page, '설비 상세 연결');
      await shot(page, '04-equipment-links');

      // 차단기 편집 창
      await detail(page).getByRole('tab', { name: '정보' }).click();
      await detail(page).getByRole('button', { name: '편집', exact: true }).click();
      const editor = page.getByRole('dialog', { name: `차단기 — ${PANEL}` });
      await expect(editor).toBeVisible();
      await expect(editor.getByTestId('circuit-no').first()).toBeVisible();
      await noForbiddenWords(page, '차단기 편집 창');
      await shot(page, '05-breaker-editor');
      await editor.getByRole('button', { name: '완료' }).click();
      await expect(editor).toHaveCount(0);

      // 설비 머리 — 항목 하나짜리 ⋯ 메뉴는 없다(차단기가 있으면 카드의 「추가」가 그 길)
      await expect(detail(page).getByRole('button', { name: '더 보기' })).toHaveCount(0);

      // 랙 상세 — 실장 설비
      await main(page).getByRole('row').filter({ hasText: RACK }).first().click();
      await expect(detail(page).getByText(/^실장 설비 \d+/)).toBeVisible();
      await noForbiddenWords(page, '랙 상세');
      await shot(page, '07-rack-detail');

      // 설비 추가
      await main(page).getByRole('button', { name: '설비 추가' }).first().click();
      const add = page.getByRole('dialog', { name: '설비 추가' });
      await expect(add).toBeVisible();
      await noForbiddenWords(page, '설비 추가');
      await shot(page, '08-add-equipment');
      await add.getByRole('button', { name: '취소' }).click();

      // 랙 추가
      await main(page).getByRole('button', { name: '랙 추가' }).click();
      const addRack = page.getByRole('dialog', { name: '랙 추가' });
      await expect(addRack).toBeVisible();
      await shot(page, '09-add-rack');
      await addRack.getByRole('button', { name: '취소' }).click();

      // 평면도
      await main(page).getByRole('tab', { name: '평면도' }).click();
      await expect(page.getByTestId('rackplan-canvas')).toBeVisible();
      await page.waitForTimeout(500); // 캔버스가 맞춰 그려질 때까지
      await noForbiddenWords(page, '평면도');
      await shot(page, '10-floor-plan');

      // 변경안이 없어야 한다 — 읽기만 했다
      await expect(page.getByRole('button', { name: '저장', exact: true })).toHaveCount(0);
    });

    test('품목 관리 · 기준정보', async ({ page }) => {
      await login(page);
      for (const [kind, label] of [['equipment', '설비 품목'], ['rack', '랙 품목'], ['cable', '케이블 품목'], ['category', '분야']] as const) {
        await page.goto(`/catalog?kind=${kind}`);
        await expect(page.getByRole('button', { name: new RegExp(`^${label}`) })).toHaveAttribute('aria-current', 'true');
        await expect(page.getByRole('table').getByRole('row').nth(1)).toBeVisible();
        await noForbiddenWords(page, `품목 관리 ${label}`);
        await shot(page, `11-catalog-${kind}`);
      }

      await page.goto('/standards');
      for (const [i, tab] of (['노임단가', '제비율', '올린 기록'] as const).entries()) {
        await page.getByRole('tab', { name: tab }).click();
        await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
        await page.waitForTimeout(300);
        await noForbiddenWords(page, `기준정보 ${tab}`);
        await shot(page, `12-standards-${i + 1}`);
      }
    });
  });
}
