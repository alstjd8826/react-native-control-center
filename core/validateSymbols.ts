import type { ParsedControl } from './types';
import { SF_SYMBOLS } from './sf-symbols-data';

// ─────────────────────────────────────────────────────────────────────────
//  validateSymbols — 컨트롤이 참조하는 SF Symbol 이름이 실재하는지 검사.
//
//  목적: "lock.filll" 같은 오타를 빌드 단계에서 잡아 사용자가 빈 아이콘과
//  씨름하는 걸 막는다.
//
//  정책: 에러가 아니라 "경고"로 다룬다. Apple이 iOS 버전마다 새 심볼을
//  추가하므로, 우리 스냅샷에 없다고 무조건 틀린 건 아니다. 빌드를 막지 않고
//  사람이 확인하도록 알려주기만 한다.
// ─────────────────────────────────────────────────────────────────────────

export interface UnknownSymbol {
  controlId: string;
  field: string; // 'icon' | 'icons.on' | 'icons.off'
  name: string;
}

/** 알려진 SF Symbol인지 검사. */
export function isKnownSymbol(name: string): boolean {
  return SF_SYMBOLS.has(name);
}

/** 컨트롤 목록에서 알 수 없는 심볼 참조를 모두 수집. */
export function collectUnknownSymbols(controls: ParsedControl[]): UnknownSymbol[] {
  const unknown: UnknownSymbol[] = [];

  for (const control of controls) {
    if (control.type === 'button') {
      if (!isKnownSymbol(control.icon)) {
        unknown.push({ controlId: control.id, field: 'icon', name: control.icon });
      }
    } else if (control.type === 'toggle') {
      if (!isKnownSymbol(control.icons.on)) {
        unknown.push({ controlId: control.id, field: 'icons.on', name: control.icons.on });
      }
      if (!isKnownSymbol(control.icons.off)) {
        unknown.push({ controlId: control.id, field: 'icons.off', name: control.icons.off });
      }
    }
  }

  return unknown;
}

/**
 * 알 수 없는 심볼을 console.warn으로 보고. (plugin/CLI가 빌드 중 호출)
 * 하나도 없으면 아무것도 출력하지 않는다.
 */
export function warnUnknownSymbols(controls: ParsedControl[]): UnknownSymbol[] {
  const unknown = collectUnknownSymbols(controls);
  for (const u of unknown) {
    console.warn(
      `[react-native-control-center] Control "${u.controlId}" uses "${u.name}" ` +
        `for ${u.field}, which is not a known SF Symbol. ` +
        `Check the spelling in SF Symbols.app — if it's a newer symbol this warning is safe to ignore.`
    );
  }
  return unknown;
}
