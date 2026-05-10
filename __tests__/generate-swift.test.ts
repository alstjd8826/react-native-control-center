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

  it('generates four files (bundle + store + control + intent)', () => {
    const files = generateSwiftFiles({
      controls: [buttonControl],
      bundleId: 'com.darby.quicknote',
      urlScheme: 'quicknote',
    });
    expect(files.map((f) => f.path)).toEqual([
      'ControlBundle.swift',
      'ControlStore.swift',
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

// ─────────────────────────────────────────────────────────────────────────
//  📄  ControlBundle.swift
//  위젯 익스텐션 진입점 — iOS가 이 @main 구조체를 통해 모든 컨트롤을 인식.
//  controls.ts에 선언된 모든 컨트롤이 여기 등록됨.
// ─────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────
//  📄  QuickNoteControl.swift   (Controls/QuickNoteControl.swift)
//  Button 컨트롤의 표시 정의 — 제어센터에 어떤 모양으로 보일지
//  (탭했을 때 일어나는 일은 Intents/QuickNoteIntent.swift 참조)
// ─────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────
//  📄  QuickNoteIntent.swift   (Intents/QuickNoteIntent.swift)
//  Button 탭 → 앱 열림까지의 흐름
// ─────────────────────────────────────────────────────────────────────────
//
//  ① 사용자가 제어센터에서 "빠른 메모" 버튼을 탭함
//        ↓
//  ② iOS가 위젯 익스텐션 프로세스를 깨워서 perform() 호출
//        ↓
//  ③ perform() 안에서:
//       (a) ControlStore.shared.enqueueAction() 호출
//             → App Group UserDefaults 큐에 이벤트 저장 (영구)
//             → Darwin Notification 발송 (앱이 살아있으면 즉시 알림)
//       (b) return .result()
//        ↓
//  ④ openAppWhenRun = true 이므로 iOS가 메인 앱을 포어그라운드로 띄움
//        ↓
//  ⑤ 메인 앱 시작/복귀 후 Native Module이 큐를 drain (Week 5에서 구현)
//        ↓
//  ⑥ JS의 ControlCenter.onAction((id) => { ... }) 콜백 발화
//
// ─────────────────────────────────────────────────────────────────────────

struct QuickNoteIntent: AppIntent {
    static let title: LocalizedStringResource = "빠른 메모"
    static let openAppWhenRun: Bool = true   // ④ 이 플래그가 메인 앱을 깨움

    func perform() async throws -> some IntentResult {
        // ③ (a): App Group 큐에 이벤트 기록 + Darwin 알림 발송
        ControlStore.shared.enqueueAction(
            id: "quickNote",
            deepLink: "quicknote://control/quickNote"
        )
        // ③ (b): perform 종료. 이후 ④(앱 열기)는 iOS가 자동 처리
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
