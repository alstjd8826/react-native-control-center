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

      struct VpnToggleControl: ControlWidget {
          var body: some ControlWidgetConfiguration {
              StaticControlConfiguration(
                  kind: "com.acme.app.vpnToggle",
                  provider: VpnToggleProvider()
              ) { isOn in
                  ControlWidgetToggle(
                      "VPN",
                      isOn: isOn,
                      action: VpnToggleIntent()
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
              var previewValue: Bool { false }

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

      struct VpnToggleIntent: SetValueIntent {
          static let title: LocalizedStringResource = "VPN"

          @Parameter(title: "VPN")
          var value: Bool

          func perform() async throws -> some IntentResult {
              ControlStore.shared.setBool("vpnEnabled", value: value)
              ControlStore.shared.enqueueStateChange(
                  key: "vpnEnabled",
                  value: value
              )
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
