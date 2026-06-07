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
import WidgetKit

// ─────────────────────────────────────────────────────────────────────────
//  📄  QuickNoteIntent.swift   (Intents/QuickNoteIntent.swift)
//  Button 탭 → 앱 열림까지의 흐름
// ─────────────────────────────────────────────────────────────────────────
//
//  ① 사용자가 제어센터에서 "빠른 메모" 버튼을 탭함
//  ② iOS가 위젯 익스텐션 프로세스를 깨워서 perform() 호출
//  ③ perform(): enqueueAction() → App Group 큐 저장 + Darwin 알림, return .result()
//  ④ openAppWhenRun = true 이므로 iOS가 메인 앱을 포어그라운드로 띄움
//  ⑤ 메인 앱 Native Module이 큐를 drain → JS onAction 콜백 발화
// ─────────────────────────────────────────────────────────────────────────

struct QuickNoteIntent: AppIntent {
    static let title: LocalizedStringResource = "빠른 메모"
    static let openAppWhenRun: Bool = true   // ④ 이 플래그가 메인 앱을 깨움

    func perform() async throws -> some IntentResult {
        // ③: App Group 큐에 이벤트 기록 + Darwin 알림 발송
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

describe('generateSwiftFiles — dynamic button (parameter)', () => {
  const files = generateSwiftFiles({
    controls: [
      {
        id: 'openPlace',
        type: 'button',
        title: 'Open Place',
        icon: 'mappin',
        parameter: {
          key: 'place',
          title: 'Place',
          options: [
            { value: 'home', label: 'Home' },
            { value: 'work', label: 'Work' },
          ],
        },
      },
    ],
    bundleId: 'com.acme.app',
    urlScheme: 'acme',
  });

  it('intent file: AppEnum + ConfigIntent + Provider + ActionIntent', () => {
    const intent = files.find((f) => f.path === 'Intents/OpenPlaceIntent.swift')!;
    expect(intent.content).toMatchInlineSnapshot(`
"import AppIntents
import WidgetKit

// ─────────────────────────────────────────────────────────────────────────
//  📄  OpenPlaceIntent.swift   (Intents/OpenPlaceIntent.swift)
//  Button 탭 → 앱 열림까지의 흐름
// ─────────────────────────────────────────────────────────────────────────
//  이 버튼은 "사용자 구성" 컨트롤이다 (dynamic intent). 4부품:
//    ① AppEnum         — 고를 수 있는 선택지
//    ② ConfigIntent    — 제어센터 추가 시 사용자가 고르는 @Parameter
//    ③ Provider        — 고른 값을 컨트롤 표시로 전달
//    ④ ActionIntent    — 탭 시 실행, 고른 값을 enqueue → JS onAction.params 로 도착
// ─────────────────────────────────────────────────────────────────────────

// ① 선택지 — raw String 값이 JS로 그대로 전달된다
enum OpenPlaceOption: String, AppEnum {
    case home = "home"
    case work = "work"

    static var typeDisplayRepresentation: TypeDisplayRepresentation { "Place" }
    static var caseDisplayRepresentations: [OpenPlaceOption: DisplayRepresentation] {
        [
            .home: "Home",
            .work: "Work",
        ]
    }
}

// ② 설정용 인텐트 — 사용자가 제어센터에 컨트롤 추가할 때 이 값을 고른다
struct OpenPlaceConfigIntent: ControlConfigurationIntent {
    static let title: LocalizedStringResource = "Open Place"

    @Parameter(title: "Place", default: .home)
    var place: OpenPlaceOption

    init() {}
}

// ③ 프로바이더 — 고른 값을 컨트롤 content 클로저로 넘긴다
struct OpenPlaceProvider: AppIntentControlValueProvider {
    func previewValue(configuration: OpenPlaceConfigIntent) -> OpenPlaceOption {
        configuration.place
    }

    func currentValue(configuration: OpenPlaceConfigIntent) async throws -> OpenPlaceOption {
        configuration.place
    }
}

// ④ 액션 인텐트 — 탭 시 실행. 고른 값을 params에 실어 enqueue.
struct OpenPlaceIntent: AppIntent {
    static let title: LocalizedStringResource = "Open Place"
    static let openAppWhenRun: Bool = true

    @Parameter(title: "Place")
    var place: OpenPlaceOption

    init() {}
    init(place: OpenPlaceOption) {
        self.place = place
    }

    func perform() async throws -> some IntentResult {
        ControlStore.shared.enqueueAction(
            id: "openPlace",
            deepLink: "acme://control/openPlace",
            params: ["place": place.rawValue]
        )
        return .result()
    }
}
"
`);
  });

  it('control file: AppIntentControlConfiguration', () => {
    const control = files.find((f) => f.path === 'Controls/OpenPlaceControl.swift')!;
    expect(control.content).toMatchInlineSnapshot(`
"import AppIntents
import SwiftUI
import WidgetKit

// ─────────────────────────────────────────────────────────────────────────
//  📄  OpenPlaceControl.swift   (Controls/OpenPlaceControl.swift)
//  Button 컨트롤의 표시 정의 — 제어센터에 어떤 모양으로 보일지
//  (탭했을 때 일어나는 일은 Intents/OpenPlaceIntent.swift 참조)
// ─────────────────────────────────────────────────────────────────────────

struct OpenPlaceControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        // 사용자 구성 컨트롤 — 추가 시 iOS가 설정 화면을 띄우고,
        // Provider가 고른 값(selection)을 여기로 넘겨 액션 인텐트에 주입한다.
        AppIntentControlConfiguration(
            kind: "com.acme.app.openPlace",
            provider: OpenPlaceProvider()
        ) { selection in
            ControlWidgetButton(action: OpenPlaceIntent(place: selection)) {
                Label("Open Place", systemImage: "mappin")
            }
        }
        .displayName("Open Place")
        .promptsForUserConfiguration()
    }
}
"
`);
  });
});
