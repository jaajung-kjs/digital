import { clsx, type ClassValue } from 'clsx';

/** className 병합 헬퍼. clsx 래퍼(저장소에 tailwind-merge 미존재). */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
