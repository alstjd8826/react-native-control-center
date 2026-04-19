import * as path from 'node:path';
import { parseControlsFile, parseControlsSource } from '../core/parseControls';
import { ParseError } from '../core/types';

const fixture = (name: string) => path.join(__dirname, '__fixtures__', name);

describe('parseControls', () => {
  describe('valid inputs', () => {
    it('parses a single button control', () => {
      const controls = parseControlsFile(fixture('valid-single-button.ts'));
      expect(controls).toMatchInlineSnapshot(`
        [
          {
            "icon": "square.and.pencil",
            "id": "quickNote",
            "title": "빠른 메모",
            "type": "button",
          },
        ]
      `);
    });

    it('parses mixed button + toggle with all optional fields', () => {
      const controls = parseControlsFile(fixture('valid-mixed.ts'));
      expect(controls).toHaveLength(3);
      expect(controls[0]).toMatchObject({
        id: 'quickNote',
        type: 'button',
        title: '빠른 메모',
        icon: 'square.and.pencil',
        tint: '#FFCC00',
        description: '제어센터에서 바로 메모',
        deepLink: 'quicknote://new',
      });
      expect(controls[1]).toMatchObject({
        id: 'vpnToggle',
        type: 'toggle',
        title: 'VPN',
        icons: { on: 'lock.fill', off: 'lock.open' },
        tint: { on: '#00C853', off: '#888888' },
        stateKey: 'vpnEnabled',
      });
      expect(controls[2]).toMatchObject({
        id: 'flashlight',
        type: 'toggle',
        stateKey: 'flashlightOn',
      });
    });

    it('accepts inline source without file', () => {
      const source = `
        import { defineControls } from 'react-native-control-center';
        export default defineControls({
          test: { type: 'button', title: 'Test', icon: 'star' },
        });
      `;
      const controls = parseControlsSource(source);
      expect(controls).toEqual([
        { id: 'test', type: 'button', title: 'Test', icon: 'star' },
      ]);
    });

    it('accepts string literal keys', () => {
      const source = `
        export default defineControls({
          "my-control": { type: 'button', title: 'T', icon: 'star' },
        });
      `;
      const controls = parseControlsSource(source);
      expect(controls[0]?.id).toBe('my-control');
    });

    it('accepts template strings without interpolation', () => {
      const source =
        'export default defineControls({ t: { type: "button", title: `Hi`, icon: "star" } });';
      const controls = parseControlsSource(source);
      expect(controls[0]?.title).toBe('Hi');
    });
  });

  describe('invalid inputs', () => {
    it('rejects variable references', () => {
      expect(() => parseControlsFile(fixture('invalid-variable-ref.ts'))).toThrow(
        /Only literal values allowed.*variable reference "title"/
      );
    });

    it('rejects missing type field', () => {
      expect(() => parseControlsFile(fixture('invalid-missing-type.ts'))).toThrow(
        /invalid type "undefined"/
      );
    });

    it('rejects missing defineControls call', () => {
      const source = `export default { quickNote: { type: 'button' } };`;
      expect(() => parseControlsSource(source)).toThrow(
        /No defineControls\(\{\.\.\.\}\) call found/
      );
    });

    it('rejects non-object argument', () => {
      const source = `export default defineControls("nope");`;
      expect(() => parseControlsSource(source)).toThrow(
        /must receive an object literal/
      );
    });

    it('rejects function calls as values', () => {
      const source = `
        export default defineControls({
          t: { type: 'button', title: 'T', icon: getIcon() },
        });
      `;
      expect(() => parseControlsSource(source)).toThrow(/function call/);
    });

    it('rejects toggle without icons', () => {
      const source = `
        export default defineControls({
          t: { type: 'toggle', title: 'T', stateKey: 'k' },
        });
      `;
      expect(() => parseControlsSource(source)).toThrow(
        /requires icons\.on and icons\.off/
      );
    });

    it('rejects button missing icon', () => {
      const source = `
        export default defineControls({
          t: { type: 'button', title: 'T' },
        });
      `;
      expect(() => parseControlsSource(source)).toThrow(
        /missing required field "icon"/
      );
    });

    it('reports line/column in errors when available', () => {
      const source = `export default defineControls({\n  bad: { type: 'unknown', title: 'T', icon: 'star' }\n});`;
      try {
        parseControlsSource(source);
        fail('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(ParseError);
        expect((err as Error).message).toContain('invalid type');
      }
    });

    it('gives clear syntax error for malformed TS', () => {
      const source = `export default defineControls({{{`;
      expect(() => parseControlsSource(source)).toThrow(/Failed to parse TypeScript/);
    });
  });
});
