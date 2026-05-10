import { generateSwiftFiles } from '../core/generate/swift';
import type { ParsedControl } from '../core/types';

describe('generateSwiftFiles — Toggle', () => {
  const baseToggle: ParsedControl = {
    id: 'vpnToggle',
    type: 'toggle',
    title: 'VPN',
    icons: { on: 'lock.fill', off: 'lock.open' },
    stateKey: 'vpnEnabled',
  };

  it('generates control + intent for a toggle', () => {
    const files = generateSwiftFiles({
      controls: [baseToggle],
      bundleId: 'com.acme.app',
      urlScheme: 'acme',
    });
    expect(files.map((f) => f.path)).toEqual([
      'ControlBundle.swift',
      'ControlStore.swift',
      'Controls/VpnToggleControl.swift',
      'Intents/VpnToggleIntent.swift',
    ]);
  });

  it('ToggleControl.swift renders provider + on/off icons', () => {
    const files = generateSwiftFiles({
      controls: [baseToggle],
      bundleId: 'com.acme.app',
      urlScheme: 'acme',
    });
    const control = files.find((f) => f.path === 'Controls/VpnToggleControl.swift')!;
    expect(control.content).toMatchInlineSnapshot(`
"import AppIntents
import SwiftUI
import WidgetKit

// ─────────────────────────────────────────────────────────────────────────
//  📄  VpnToggleControl.swift   (Controls/VpnToggleControl.swift)
//  Toggle 표시 흐름 (제어센터를 열 때마다)
// ─────────────────────────────────────────────────────────────────────────
//
//  ① 사용자가 제어센터를 열거나 토글이 화면에 보이려 함
//        ↓
//  ② iOS가 Provider.currentValue() 호출 → "지금 ON 인지 OFF 인지?" 질의
//        ↓
//  ③ Provider가 ControlStore.shared.getBool("vpnEnabled") 호출
//        → App Group UserDefaults에서 현재 값 읽음
//        ↓
//  ④ iOS가 그 값(isOn)으로 ControlWidgetToggle을 그림
//        - on이면 icons.on, off면 icons.off
//        - on/off 색상도 분기
//
// ─────────────────────────────────────────────────────────────────────────

struct VpnToggleControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(
            kind: "com.acme.app.vpnToggle",
            provider: VpnToggleProvider()       // ② 상태 질의 대상
        ) { isOn in
            ControlWidgetToggle(
                "VPN",
                isOn: isOn,                              // ④ Provider가 답한 값
                action: VpnToggleIntent()        // 사용자가 탭하면 이게 실행
            ) { isOn in
                Label(
                    "VPN",
                    systemImage: isOn ? "lock.fill" : "lock.open"
                )
            }
        }
        .displayName("VPN")
    }
}

extension VpnToggleControl {
    struct VpnToggleProvider: ControlValueProvider {
        // 미리보기/플레이스홀더용 기본값
        var previewValue: Bool { false }

        // ③ iOS가 토글을 그릴 때마다 호출. 공유 저장소에서 현재 상태를 읽어 반환.
        func currentValue() async throws -> Bool {
            return ControlStore.shared.getBool("vpnEnabled")
        }
    }
}
"
`);
  });

  it('ToggleIntent.swift uses SetValueIntent with state sync', () => {
    const files = generateSwiftFiles({
      controls: [baseToggle],
      bundleId: 'com.acme.app',
      urlScheme: 'acme',
    });
    const intent = files.find((f) => f.path === 'Intents/VpnToggleIntent.swift')!;
    expect(intent.content).toMatchInlineSnapshot(`
"import AppIntents

// ─────────────────────────────────────────────────────────────────────────
//  📄  VpnToggleIntent.swift   (Intents/VpnToggleIntent.swift)
//  Toggle 탭 → 상태 변경 흐름
// ─────────────────────────────────────────────────────────────────────────
//
//  ① 사용자가 제어센터에서 "VPN" 토글을 탭함
//        ↓
//  ② iOS가 새 값을 결정 (현재 OFF면 true, ON이면 false)
//        ↓
//  ③ iOS가 VpnToggleIntent를 인스턴스화하고 self.value에 새 값 주입
//        ↓
//  ④ perform() 호출:
//       (a) ControlStore.shared.setBool("vpnEnabled", value)
//             → App Group UserDefaults에 새 상태 저장 (먼저!)
//       (b) ControlStore.shared.enqueueStateChange()
//             → JS에 알릴 이벤트 큐에 기록
//             → Darwin Notification 발송 (앱이 살아있으면 즉시 깨움)
//        ↓
//  ⑤ return .result() — perform 종료
//        ↓
//  ⑥ iOS가 토글을 새 값으로 다시 그림 (Provider 재호출)
//        ↓
//  ⑦ (앱이 실행 중이면) Native Module이 ④(b) 큐 drain → JS의
//     ControlCenter.onStateChange("vpnEnabled", v => ...) 콜백 발화 (Week 5)
//
// ─────────────────────────────────────────────────────────────────────────

struct VpnToggleIntent: SetValueIntent {
    static let title: LocalizedStringResource = "VPN"

    @Parameter(title: "VPN")
    var value: Bool                                  // ③ iOS가 자동 주입

    func perform() async throws -> some IntentResult {
        // ④ (a): 새 상태를 공유 저장소에 먼저 저장 (순서 중요)
        ControlStore.shared.setBool("vpnEnabled", value: value)

        // ④ (b): JS 측에 변화를 알릴 이벤트 큐에 기록 + Darwin 알림 발송
        ControlStore.shared.enqueueStateChange(
            key: "vpnEnabled",
            value: value
        )

        // ⑤ 끝
        return .result()
    }
}
"
`);
  });

  it('renders tint when provided as on/off pair', () => {
    const files = generateSwiftFiles({
      controls: [{ ...baseToggle, tint: { on: '#00C853', off: '#888888' } }],
      bundleId: 'com.acme.app',
      urlScheme: 'acme',
    });
    const control = files.find((f) => f.path === 'Controls/VpnToggleControl.swift')!;
    expect(control.content).toContain(
      '.tint(Color(hex: isOn ? "#00C853" : "#888888"))'
    );
  });

  it('omits tint when not provided', () => {
    const files = generateSwiftFiles({
      controls: [baseToggle],
      bundleId: 'com.acme.app',
      urlScheme: 'acme',
    });
    const control = files.find((f) => f.path === 'Controls/VpnToggleControl.swift')!;
    expect(control.content).not.toContain('.tint(');
  });

  it('renders description when provided', () => {
    const files = generateSwiftFiles({
      controls: [{ ...baseToggle, description: 'Quickly toggle VPN' }],
      bundleId: 'com.acme.app',
      urlScheme: 'acme',
    });
    const control = files.find((f) => f.path === 'Controls/VpnToggleControl.swift')!;
    expect(control.content).toContain('.description("Quickly toggle VPN")');
  });

  it('handles mixed Button + Toggle in same bundle', () => {
    const files = generateSwiftFiles({
      controls: [
        {
          id: 'quickNote',
          type: 'button',
          title: 'Quick Note',
          icon: 'square.and.pencil',
        },
        baseToggle,
      ],
      bundleId: 'com.acme.app',
      urlScheme: 'acme',
    });
    expect(files.map((f) => f.path)).toEqual([
      'ControlBundle.swift',
      'ControlStore.swift',
      'Controls/QuickNoteControl.swift',
      'Intents/QuickNoteIntent.swift',
      'Controls/VpnToggleControl.swift',
      'Intents/VpnToggleIntent.swift',
    ]);

    const bundle = files.find((f) => f.path === 'ControlBundle.swift')!;
    expect(bundle.content).toContain('QuickNoteControl()');
    expect(bundle.content).toContain('VpnToggleControl()');
  });
});
