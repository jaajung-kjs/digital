/**
 * 새 id 한 개 — **보안 컨텍스트가 아니어도** 만들어진다.
 *
 * `crypto.randomUUID()` 는 https 나 localhost 에서만 있다. 개발은 `localhost:5173` 이라
 * 늘 있었지만, 사내망은 `http://twin.local:8080` 처럼 평문 주소로 연다 — 거기서는 이 함수가
 * **없다**. 그래서 배포본에서 층 추가·설비 배치·케이블 연결처럼 id 를 만드는 일이 전부
 * `crypto.randomUUID is not a function` 으로 죽었다(운영 이미지로 확인했다).
 *
 * `crypto.getRandomValues` 는 평문에서도 있다 — 그것으로 UUID v4 를 만든다. 그마저 없는
 * 아주 오래된 환경에서는 `Math.random` 으로 물러선다(서버가 id 를 검증만 하고 신뢰하지 않으므로
 * 추측 불가능성이 보안 요건은 아니다 — 다만 겹치지만 않으면 된다).
 */
export function newId(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();

  const bytes = new Uint8Array(16);
  if (typeof c?.getRandomValues === 'function') c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);

  /* UUID v4 규칙 — 버전(4)과 변형(10xx) 비트를 박는다. */
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
