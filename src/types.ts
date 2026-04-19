import type { KnownSFSymbol } from './sf-symbols';

export type HexColor = `#${string}`;

/**
 * 유연 모드: 큐레이션된 ~200개는 자동완성 + 그 외 문자열도 허용.
 * TypeScript 트릭: `(string & {})` 는 자동완성을 비활성화하지 않으면서
 * 임의 문자열을 받게 해줌.
 */
export type SFSymbolName = KnownSFSymbol | (string & {});

/**
 * 엄격 모드: 큐레이션 리스트에 있는 심볼만 허용.
 * 오타/잘못된 이름 방지가 중요할 때 사용.
 */
export type StrictSFSymbolName = KnownSFSymbol;

export interface ButtonControl {
  type: 'button';
  title: string;
  icon: SFSymbolName;
  tint?: HexColor;
  description?: string;
  deepLink?: string;
}

export interface ToggleControl {
  type: 'toggle';
  title: string;
  icons: { on: SFSymbolName; off: SFSymbolName };
  tint?: { on: HexColor; off: HexColor };
  stateKey: string;
  description?: string;
}

export type Control = ButtonControl | ToggleControl;
