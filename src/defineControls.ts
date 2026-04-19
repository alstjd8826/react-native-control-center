import type { Control } from './types';

/**
 * 컨트롤 선언. 이 함수는 타입 헬퍼일 뿐, 런타임에 아무 동작도 하지 않습니다.
 * 실제 처리는 빌드 타임에 AST 파싱으로 이뤄집니다.
 */
export function defineControls<T extends Record<string, Control>>(controls: T): T {
  return controls;
}
