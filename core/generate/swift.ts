import * as fs from 'node:fs';
import * as path from 'node:path';
import Handlebars from 'handlebars';
import type { ParsedControl } from '../types';

export interface GenerateOptions {
  controls: ParsedControl[];
  bundleId: string;           // 메인 앱 bundleId (예: "com.darby.quicknote")
  urlScheme: string;          // 딥링크 스킴 (예: "quicknote")
  appGroupId?: string;        // 기본: "group.{bundleId}.controls"
  bundleStructName?: string;  // 기본: "ControlCenterBundle"
}

export function defaultAppGroupId(bundleId: string): string {
  return `group.${bundleId}.controls`;
}

/**
 * 토글 컨트롤들의 stateKey 목록.
 * - 생성된 ControlStore.swift의 정적 화이트리스트로 박힘
 * - Native Module의 snapshot() 정제를 위해 메인 앱 Info.plist
 *   ("RNControlCenterStateKeys")로도 주입됨
 */
export function collectStateKeys(controls: ParsedControl[]): string[] {
  return controls
    .filter((c): c is Extract<ParsedControl, { type: 'toggle' }> => c.type === 'toggle')
    .map((c) => c.stateKey);
}

export interface GeneratedFile {
  path: string;     // 상대 경로 (예: "Controls/QuickNoteControl.swift")
  content: string;
}

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

const templateCache: Record<string, HandlebarsTemplateDelegate> = {};

function loadTemplate(name: string): HandlebarsTemplateDelegate {
  if (!templateCache[name]) {
    const filePath = path.join(TEMPLATES_DIR, `${name}.hbs`);
    const source = fs.readFileSync(filePath, 'utf-8');
    templateCache[name] = Handlebars.compile(source, { noEscape: true });
  }
  return templateCache[name]!;
}

// Handlebars 헬퍼 등록 (한 번만)
let helpersRegistered = false;
function registerHelpers() {
  if (helpersRegistered) return;
  Handlebars.registerHelper('pascalCase', (str: string) => pascalCase(str));
  helpersRegistered = true;
}

export function pascalCase(str: string): string {
  return str
    .replace(/[-_]/g, ' ')
    .replace(/(^|\s)(\w)/g, (_, __, c: string) => c.toUpperCase())
    .replace(/\s/g, '');
}

/**
 * option.value(임의 문자열)를 Swift enum case로 쓸 안전한 식별자로 변환.
 * 원래 value는 enum의 String raw value로 보존되므로 JS엔 그대로 전달된다.
 * 예: "my-place" → "myPlace", "home" → "home", "2nd" → "_2nd"
 */
export function swiftCaseName(value: string): string {
  let s = value
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/\s/g, '');
  if (!s) s = 'option';
  s = s.charAt(0).toLowerCase() + s.slice(1);
  if (/^[0-9]/.test(s)) s = `_${s}`;
  return s;
}

interface ParameterModel {
  enumName: string;
  key: string;
  title: string;
  defaultCase: string;
  options: { caseName: string; value: string; label: string }[];
}

/** dynamic intents — button.parameter를 템플릿이 쓰기 좋은 Swift 모델로 변환. */
function buildParameterModel(control: ParsedControl): ParameterModel | undefined {
  if (control.type !== 'button' || !control.parameter) return undefined;
  const p = control.parameter;
  const options = p.options.map((o) => ({
    caseName: swiftCaseName(o.value),
    value: o.value,
    label: o.label,
  }));
  return {
    enumName: `${pascalCase(control.id)}Option`,
    key: p.key,
    title: p.title,
    defaultCase: options[0]!.caseName,
    options,
  };
}

export function generateSwiftFiles(opts: GenerateOptions): GeneratedFile[] {
  registerHelpers();
  const bundleStructName = opts.bundleStructName ?? 'ControlCenterBundle';
  const appGroupId = opts.appGroupId ?? defaultAppGroupId(opts.bundleId);
  const files: GeneratedFile[] = [];

  // 1. Bundle
  files.push({
    path: 'ControlBundle.swift',
    content: loadTemplate('ControlBundle.swift')({
      bundleStructName,
      controls: opts.controls,
    }),
  });

  // 1b. ControlStore (shared between targets)
  //  토글의 stateKey 목록을 정적으로 박아넣어, snapshot()이 시스템 전역 키를
  //  긁지 않고 우리가 관리하는 상태 키만 정확히 반환하게 한다. (Week 6)
  const stateKeys = collectStateKeys(opts.controls);
  files.push({
    path: 'ControlStore.swift',
    content: loadTemplate('ControlStore.swift')({ appGroupId, stateKeys }),
  });

  // 2. Controls + Intents (컨트롤당 2파일)
  for (const control of opts.controls) {
    if (control.type === 'button') {
      const parameterModel = buildParameterModel(control);
      files.push({
        path: `Controls/${pascalCase(control.id)}Control.swift`,
        content: loadTemplate('ButtonControl.swift')({
          ...control,
          bundleId: opts.bundleId,
          parameterModel,
        }),
      });
      files.push({
        path: `Intents/${pascalCase(control.id)}Intent.swift`,
        content: loadTemplate('ButtonIntent.swift')({
          ...control,
          deepLink: control.deepLink ?? `${opts.urlScheme}://control/${control.id}`,
          parameterModel,
        }),
      });
    } else if (control.type === 'toggle') {
      files.push({
        path: `Controls/${pascalCase(control.id)}Control.swift`,
        content: loadTemplate('ToggleControl.swift')({
          ...control,
          bundleId: opts.bundleId,
        }),
      });
      files.push({
        path: `Intents/${pascalCase(control.id)}Intent.swift`,
        content: loadTemplate('ToggleIntent.swift')({
          ...control,
        }),
      });
    }
  }

  return files;
}
