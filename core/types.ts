// Parser가 추출한 Control 타입 — id 필드 포함
import type { ButtonControl, ToggleControl } from '../src/types';

export type ParsedButtonControl = ButtonControl & { id: string };
export type ParsedToggleControl = ToggleControl & { id: string };
export type ParsedControl = ParsedButtonControl | ParsedToggleControl;

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly line?: number,
    public readonly column?: number
  ) {
    const loc = line !== undefined ? ` (${filePath}:${line}:${column ?? 0})` : ` (${filePath})`;
    super(`${message}${loc}`);
    this.name = 'ParseError';
  }
}
