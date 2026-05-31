// ─────────────────────────────────────────────────────────────────────────
//  scripts/gen-sf-symbols.mjs
//
//  전체 SF Symbol 이름 목록을 가져와 core/sf-symbols-data.ts 를 재생성한다.
//  데이터 출처: marcbouchenoire/symbolist (MIT). JSON의 "키"가 심볼 이름.
//
//  실행:  node scripts/gen-sf-symbols.mjs
//  (Apple이 새 SF Symbols 버전을 내면 다시 돌려 목록을 갱신)
// ─────────────────────────────────────────────────────────────────────────

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SOURCE =
  'https://raw.githubusercontent.com/marcbouchenoire/symbolist/main/packages/symbolist/src/data/symbols.json';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'core', 'sf-symbols-data.ts');

const res = await fetch(SOURCE);
if (!res.ok) {
  throw new Error(`Failed to fetch symbol list: ${res.status} ${res.statusText}`);
}
const data = await res.json();
const names = Object.keys(data).sort();

const header = `// ─────────────────────────────────────────────────────────────────────────
//  core/sf-symbols-data.ts   ⚠️ AUTO-GENERATED — do not edit by hand.
//
//  전체 SF Symbol 이름 목록 (검증용). 자동완성 타입은 src/sf-symbols.ts 참고.
//  Source: marcbouchenoire/symbolist (MIT) — ${names.length} symbols.
//  Regenerate: node scripts/gen-sf-symbols.mjs
// ─────────────────────────────────────────────────────────────────────────

export const SF_SYMBOL_NAMES: readonly string[] = [
${names.map((n) => `  ${JSON.stringify(n)},`).join('\n')}
];

/** 빠른 멤버십 검사를 위한 Set. 빌드타임 심볼 검증에서 사용. */
export const SF_SYMBOLS: ReadonlySet<string> = new Set(SF_SYMBOL_NAMES);
`;

writeFileSync(OUT, header, 'utf-8');
console.log(`Wrote ${names.length} symbols to ${OUT}`);
