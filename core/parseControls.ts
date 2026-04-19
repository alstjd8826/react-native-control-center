import * as fs from 'node:fs';
import { parse } from '@babel/parser';
import traverseDefault from '@babel/traverse';
import type { NodePath } from '@babel/traverse';
import type {
  ObjectExpression,
  ObjectProperty,
  Node,
  CallExpression,
} from '@babel/types';
import { ParseError, type ParsedControl } from './types';

// @babel/traverse는 ESM/CJS 혼합 때문에 .default가 있을 수 있음
const traverse =
  typeof traverseDefault === 'function' ? traverseDefault : (traverseDefault as any).default;

/**
 * TS 파일을 읽어 defineControls({...}) 호출을 찾고 컨트롤 배열을 추출.
 */
export function parseControlsFile(filePath: string): ParsedControl[] {
  const source = fs.readFileSync(filePath, 'utf-8');
  return parseControlsSource(source, filePath);
}

/**
 * 소스 문자열을 받아 파싱 (테스트에 편리).
 */
export function parseControlsSource(source: string, filePath = '<source>'): ParsedControl[] {
  let ast: ReturnType<typeof parse>;
  try {
    ast = parse(source, {
      sourceType: 'module',
      plugins: ['typescript'],
    });
  } catch (err) {
    throw new ParseError(
      `Failed to parse TypeScript: ${(err as Error).message}`,
      filePath
    );
  }

  let defineCallArg: ObjectExpression | null = null;

  traverse(ast, {
    CallExpression(path: NodePath<CallExpression>) {
      const callee = path.node.callee;
      if (callee.type !== 'Identifier' || callee.name !== 'defineControls') return;

      const firstArg = path.node.arguments[0];
      if (!firstArg || firstArg.type !== 'ObjectExpression') {
        throw new ParseError(
          'defineControls() must receive an object literal as its first argument.',
          filePath,
          path.node.loc?.start.line,
          path.node.loc?.start.column
        );
      }
      defineCallArg = firstArg;
      path.stop();
    },
  });

  if (!defineCallArg) {
    throw new ParseError(
      'No defineControls({...}) call found in file.',
      filePath
    );
  }

  return extractControls(defineCallArg, filePath);
}

function extractControls(obj: ObjectExpression, filePath: string): ParsedControl[] {
  const controls: ParsedControl[] = [];

  for (const prop of obj.properties) {
    if (prop.type !== 'ObjectProperty') {
      throw new ParseError(
        `Unsupported property kind "${prop.type}" inside defineControls. Use plain key: value pairs only.`,
        filePath,
        prop.loc?.start.line,
        prop.loc?.start.column
      );
    }

    const id = getKeyName(prop, filePath);
    if (prop.value.type !== 'ObjectExpression') {
      throw new ParseError(
        `Control "${id}" must be an object literal.`,
        filePath,
        prop.value.loc?.start.line,
        prop.value.loc?.start.column
      );
    }

    const configRaw = objectExpressionToLiteral(prop.value, filePath) as Record<string, unknown>;
    controls.push(validateControl(id, configRaw, filePath));
  }

  return controls;
}

function getKeyName(prop: ObjectProperty, filePath: string): string {
  if (prop.key.type === 'Identifier') return prop.key.name;
  if (prop.key.type === 'StringLiteral') return prop.key.value;
  throw new ParseError(
    `Control key must be a plain identifier or string literal.`,
    filePath,
    prop.key.loc?.start.line,
    prop.key.loc?.start.column
  );
}

/**
 * ObjectExpression / ArrayExpression / Literal을 일반 JS 값으로 재귀 변환.
 * literal 값만 허용 — 변수 참조/함수 호출 발견 시 에러.
 */
function objectExpressionToLiteral(node: Node, filePath: string): unknown {
  switch (node.type) {
    case 'StringLiteral':
    case 'NumericLiteral':
    case 'BooleanLiteral':
      return node.value;
    case 'NullLiteral':
      return null;
    case 'TemplateLiteral':
      if (node.expressions.length > 0) {
        throw literalOnly(node, filePath, 'template string with ${} interpolation');
      }
      return node.quasis.map((q) => q.value.cooked).join('');
    case 'ArrayExpression':
      return node.elements.map((el) => {
        if (el === null) return null;
        if (el.type === 'SpreadElement') throw literalOnly(el, filePath, 'spread element');
        return objectExpressionToLiteral(el, filePath);
      });
    case 'ObjectExpression': {
      const out: Record<string, unknown> = {};
      for (const prop of node.properties) {
        if (prop.type !== 'ObjectProperty') {
          throw literalOnly(prop, filePath, prop.type);
        }
        const key =
          prop.key.type === 'Identifier'
            ? prop.key.name
            : prop.key.type === 'StringLiteral'
              ? prop.key.value
              : null;
        if (key === null) {
          throw literalOnly(prop.key, filePath, 'computed key');
        }
        out[key] = objectExpressionToLiteral(prop.value, filePath);
      }
      return out;
    }
    case 'Identifier':
      throw literalOnly(node, filePath, `variable reference "${node.name}"`);
    case 'CallExpression':
      throw literalOnly(node, filePath, 'function call');
    case 'MemberExpression':
      throw literalOnly(node, filePath, 'member access');
    default:
      throw literalOnly(node, filePath, node.type);
  }
}

function literalOnly(node: Node, filePath: string, kind: string): ParseError {
  return new ParseError(
    `Only literal values allowed — found ${kind}.`,
    filePath,
    node.loc?.start.line,
    node.loc?.start.column
  );
}

// 최소 검증 — 더 엄격한 검증은 validateControls 단계에서
function validateControl(
  id: string,
  raw: Record<string, unknown>,
  filePath: string
): ParsedControl {
  const type = raw['type'];

  if (type === 'button') {
    if (typeof raw['title'] !== 'string') throw missingField(id, 'title', filePath);
    if (typeof raw['icon'] !== 'string') throw missingField(id, 'icon', filePath);
    return {
      id,
      type: 'button',
      title: raw['title'] as string,
      icon: raw['icon'] as string,
      ...(raw['tint'] !== undefined && { tint: raw['tint'] as `#${string}` }),
      ...(raw['description'] !== undefined && { description: raw['description'] as string }),
      ...(raw['deepLink'] !== undefined && { deepLink: raw['deepLink'] as string }),
    };
  }

  if (type === 'toggle') {
    if (typeof raw['title'] !== 'string') throw missingField(id, 'title', filePath);
    if (typeof raw['stateKey'] !== 'string') throw missingField(id, 'stateKey', filePath);
    const icons = raw['icons'] as { on?: unknown; off?: unknown } | undefined;
    if (!icons || typeof icons.on !== 'string' || typeof icons.off !== 'string') {
      throw new ParseError(
        `Toggle "${id}" requires icons.on and icons.off as strings.`,
        filePath
      );
    }
    return {
      id,
      type: 'toggle',
      title: raw['title'] as string,
      icons: { on: icons.on, off: icons.off },
      stateKey: raw['stateKey'] as string,
      ...(raw['tint'] !== undefined && { tint: raw['tint'] as { on: `#${string}`; off: `#${string}` } }),
      ...(raw['description'] !== undefined && { description: raw['description'] as string }),
    };
  }

  throw new ParseError(
    `Control "${id}" has invalid type "${String(type)}". Expected "button" or "toggle".`,
    filePath
  );
}

function missingField(id: string, field: string, filePath: string): ParseError {
  return new ParseError(`Control "${id}" is missing required field "${field}".`, filePath);
}
