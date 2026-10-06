/**
 * 아직 저장하지 않은 사진의 **파일** — 브라우저가 들고 있는다.
 *
 * 사진도 다른 고침과 같아야 한다: 고른 것은 워킹 카피에 담기고, 서버로 가는 일은 저장이
 * 한 번에 한다. 예전에는 파일만 고르는 즉시 올라갔다 — 저장하지 않고 떠나면 그 파일이
 * 디스크에 남았고, 화면에는 아무 흔적이 없었다.
 *
 * 파일은 **상태가 아니라 짐**이라 스토어 밖에 둔다. 되돌리기는 상태를 통째로 스냅샷하는데
 * 거기에 파일이 실리면 물릴 때마다 사진을 복사하게 된다. 대신 스토어를 지켜보다가, 담아
 * 둔 줄이 사라지면(지웠거나·되돌렸거나·저장했거나) 들고 있던 것도 놓는다.
 */
import { workingCopyStore } from '../model/store/workingCopy';

interface Held {
  file: File;
  /** 화면이 볼 미리보기 — 저장 전에는 서버에 없으니 브라우저 안의 것을 본다. */
  url: string;
}

const held = new Map<string, Held>();

/** 고른 파일을 그 사진 id 로 들고 있는다. */
export function holdPhotoFile(photoId: string, file: File): void {
  held.get(photoId)?.url && URL.revokeObjectURL(held.get(photoId)!.url);
  held.set(photoId, { file, url: URL.createObjectURL(file) });
}

/** 저장 전 사진의 미리보기 주소 — 들고 있는 것이 없으면 null(서버의 것을 본다). */
export function pendingPhotoUrl(photoId: string): string | null {
  return held.get(photoId)?.url ?? null;
}

/** 저장이 실어 보낼 파일들 — 아직 서버에 없는 사진만. */
export function pendingPhotoFiles(): Map<string, File> {
  return new Map([...held].map(([id, h]) => [id, h.file]));
}

function release(photoId: string): void {
  const h = held.get(photoId);
  if (!h) return;
  URL.revokeObjectURL(h.url);
  held.delete(photoId);
}

/**
 * 담아 둔 줄이 사라지면 들고 있던 파일도 놓는다.
 *
 * 지우기·되돌리기(⌘Z)·되돌리기 단추·저장 — 어느 길로 사라지든 같은 자리에서 알아챈다.
 * 길마다 「여기서도 놓아 주기」를 적으면 반드시 하나를 빠뜨린다.
 */
workingCopyStore.subscribe((s) => {
  if (held.size === 0) return;
  const creates = s.overlays.photos.creates;
  for (const id of [...held.keys()]) if (!(id in creates)) release(id);
});
