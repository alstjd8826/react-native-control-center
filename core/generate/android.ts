import * as fs from 'node:fs';
import * as path from 'node:path';
import Handlebars from 'handlebars';
import type { ParsedControl } from '../types';
import { pascalCase } from './swift';

// ─────────────────────────────────────────────────────────────────────────
//  Android codegen — defineControls → Kotlin TileService + Manifest <service>
//  iOS의 swift.ts 짝. 파라미터(dynamic)는 Android에서 다루지 않는다.
// ─────────────────────────────────────────────────────────────────────────

export interface GenerateAndroidOptions {
  controls: ParsedControl[];
  /** 앱 applicationId (= iOS bundleId). 예: "com.acme.app" */
  bundleId: string;
  /** 딥링크 scheme. 예: "acme" */
  urlScheme: string;
}

export interface AndroidFile {
  /** android/app/src/main/java/ 아래 상대 경로 */
  path: string;
  content: string;
}

export interface AndroidGenResult {
  /** 생성된 Kotlin 파일들 */
  files: AndroidFile[];
  /** AndroidManifest.xml <application> 안에 병합할 <service> 항목들 (A3에서 사용) */
  manifestServices: string;
}

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
const templateCache: Record<string, HandlebarsTemplateDelegate> = {};

let helpersRegistered = false;
function registerHelpers(): void {
  if (helpersRegistered) return;
  Handlebars.registerHelper('pascalCase', (str: string) => pascalCase(str));
  helpersRegistered = true;
}

function loadTemplate(name: string): HandlebarsTemplateDelegate {
  if (!templateCache[name]) {
    const source = fs.readFileSync(path.join(TEMPLATES_DIR, `${name}.hbs`), 'utf-8');
    templateCache[name] = Handlebars.compile(source, { noEscape: true });
  }
  return templateCache[name]!;
}

// Manifest <service> 항목 — 작아서 인라인 컴파일.
// QS_TILE 인텐트 필터 + BIND_QUICK_SETTINGS_TILE 권한이 타일의 필수 요건.
const SERVICE_TEMPLATE = Handlebars.compile(
  `        <service
            android:name=".tiles.{{pascalCase id}}TileService"
            android:exported="true"
            android:icon="{{iconRes}}"
            android:label="{{title}}"
            android:permission="android.permission.BIND_QUICK_SETTINGS_TILE">
            <intent-filter>
                <action android:name="android.service.quicksettings.action.QS_TILE" />
            </intent-filter>
        </service>`,
  { noEscape: true }
);

/** Kotlin tile 패키지 (앱 패키지 하위 .tiles). */
export function tilePackageName(bundleId: string): string {
  return `${bundleId}.tiles`;
}

export function generateAndroidFiles(opts: GenerateAndroidOptions): AndroidGenResult {
  registerHelpers();
  const packageName = tilePackageName(opts.bundleId);
  const pkgPath = packageName.replace(/\./g, '/');

  const tile = loadTemplate('TileService.kt');
  const files: AndroidFile[] = [];
  const services: string[] = [];

  for (const control of opts.controls) {
    const isToggle = control.type === 'toggle';
    const deepLink =
      control.type === 'button'
        ? control.deepLink ?? `${opts.urlScheme}://control/${control.id}`
        : '';

    // androidIcon 지정 시 @drawable/{name}, 없으면 앱 런처 아이콘 fallback.
    const iconRes = control.androidIcon
      ? `@drawable/${control.androidIcon}`
      : '@mipmap/ic_launcher';

    files.push({
      path: `${pkgPath}/${pascalCase(control.id)}TileService.kt`,
      content: tile({ ...control, packageName, isToggle, deepLink }),
    });
    services.push(SERVICE_TEMPLATE({ ...control, iconRes }));
  }

  return { files, manifestServices: services.join('\n') };
}
