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
  files.push({
    path: 'ControlStore.swift',
    content: loadTemplate('ControlStore.swift')({ appGroupId }),
  });

  // 2. Controls + Intents (컨트롤당 2파일)
  for (const control of opts.controls) {
    if (control.type === 'button') {
      files.push({
        path: `Controls/${pascalCase(control.id)}Control.swift`,
        content: loadTemplate('ButtonControl.swift')({
          ...control,
          bundleId: opts.bundleId,
        }),
      });
      files.push({
        path: `Intents/${pascalCase(control.id)}Intent.swift`,
        content: loadTemplate('ButtonIntent.swift')({
          ...control,
          deepLink: control.deepLink ?? `${opts.urlScheme}://control/${control.id}`,
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
