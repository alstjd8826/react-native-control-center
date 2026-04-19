import { generateSwiftFiles, pascalCase } from '../core/generate/swift';
import type { ParsedControl } from '../core/types';

describe('pascalCase helper', () => {
  it.each([
    ['quickNote', 'QuickNote'],
    ['quick-note', 'QuickNote'],
    ['quick_note', 'QuickNote'],
    ['QuickNote', 'QuickNote'],
    ['a', 'A'],
    ['abc', 'Abc'],
  ])('pascalCase(%p) === %p', (input, expected) => {
    expect(pascalCase(input)).toBe(expected);
  });
});

describe('generateSwiftFiles — Button', () => {
  const buttonControl: ParsedControl = {
    id: 'quickNote',
    type: 'button',
    title: '빠른 메모',
    icon: 'square.and.pencil',
  };

  it('generates three files (bundle + control + intent)', () => {
    const files = generateSwiftFiles({
      controls: [buttonControl],
      bundleId: 'com.darby.quicknote',
      urlScheme: 'quicknote',
    });
    expect(files.map((f) => f.path)).toEqual([
      'ControlBundle.swift',
      'Controls/QuickNoteControl.swift',
      'Intents/QuickNoteIntent.swift',
    ]);
  });

  it('ControlBundle.swift lists all controls', () => {
    const files = generateSwiftFiles({
      controls: [
        buttonControl,
        { ...buttonControl, id: 'quickShare', icon: 'square.and.arrow.up' },
      ],
      bundleId: 'com.darby.quicknote',
      urlScheme: 'quicknote',
    });
    const bundle = files.find((f) => f.path === 'ControlBundle.swift')!;
    expect(bundle.content).toMatchInlineSnapshot(`
      "import WidgetKit
      import SwiftUI

      @main
      struct ControlCenterBundle: WidgetBundle {
          var body: some Widget {
              QuickNoteControl()
              QuickShareControl()
          }
      }
      "
    `);
  });

  it('ButtonControl.swift matches Phase 2 golden reference', () => {
    const files = generateSwiftFiles({
      controls: [
        {
          ...buttonControl,
          description: '제어센터에서 바로 메모 앱을 엽니다.',
        },
      ],
      bundleId: 'com.darby.quicknote',
      urlScheme: 'quicknote',
    });
    const control = files.find((f) => f.path === 'Controls/QuickNoteControl.swift')!;
    expect(control.content).toMatchInlineSnapshot(`
      "import AppIntents
      import SwiftUI
      import WidgetKit

      struct QuickNoteControl: ControlWidget {
          var body: some ControlWidgetConfiguration {
              StaticControlConfiguration(
                  kind: "com.darby.quicknote.quickNote"
              ) {
                  ControlWidgetButton(action: QuickNoteIntent()) {
                      Label("빠른 메모", systemImage: "square.and.pencil")
                  }
              }
              .displayName("빠른 메모")
              .description("제어센터에서 바로 메모 앱을 엽니다.")
          }
      }
      "
    `);
  });

  it('ButtonIntent.swift generates correct intent', () => {
    const files = generateSwiftFiles({
      controls: [buttonControl],
      bundleId: 'com.darby.quicknote',
      urlScheme: 'quicknote',
    });
    const intent = files.find((f) => f.path === 'Intents/QuickNoteIntent.swift')!;
    expect(intent.content).toMatchInlineSnapshot(`
      "import AppIntents

      struct QuickNoteIntent: AppIntent {
          static let title: LocalizedStringResource = "빠른 메모"
          static let openAppWhenRun: Bool = true

          func perform() async throws -> some IntentResult {
              ControlStore.shared.enqueueAction(
                  id: "quickNote",
                  deepLink: "quicknote://control/quickNote"
              )
              return .result()
          }
      }
      "
    `);
  });

  it('uses custom deepLink when provided', () => {
    const files = generateSwiftFiles({
      controls: [{ ...buttonControl, deepLink: 'myapp://new-note' }],
      bundleId: 'com.darby.quicknote',
      urlScheme: 'quicknote',
    });
    const intent = files.find((f) => f.path === 'Intents/QuickNoteIntent.swift')!;
    expect(intent.content).toContain('"myapp://new-note"');
  });

  it('includes tint when provided', () => {
    const files = generateSwiftFiles({
      controls: [{ ...buttonControl, tint: '#FFCC00' }],
      bundleId: 'com.darby.quicknote',
      urlScheme: 'quicknote',
    });
    const control = files.find((f) => f.path === 'Controls/QuickNoteControl.swift')!;
    expect(control.content).toContain('.tint(Color(hex: "#FFCC00"))');
  });

  it('omits optional fields when not provided', () => {
    const files = generateSwiftFiles({
      controls: [buttonControl],
      bundleId: 'com.darby.quicknote',
      urlScheme: 'quicknote',
    });
    const control = files.find((f) => f.path === 'Controls/QuickNoteControl.swift')!;
    expect(control.content).not.toContain('.tint');
    expect(control.content).not.toContain('.description');
  });
});
