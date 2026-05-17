# react-native-control-center

iOS 18+ Control Center custom controls for React Native — declare in TypeScript, zero Swift required.

![status](https://img.shields.io/badge/status-WIP_v0.0.1-orange) ![iOS](https://img.shields.io/badge/iOS-18%2B-blue) ![license](https://img.shields.io/badge/license-MIT-green)

> ⚠️ **Work in progress.** Build-time pipeline (codegen + pbxproj wiring + Expo plugin + CLI) **and** runtime native module (Darwin observer → queue drain → JS events) are both complete. End-to-end validated. Remaining for v0.1: full SF Symbol set, `useControlState` polish, example apps. See [Roadmap](#roadmap).

---

## What it does

Declare controls in TypeScript:

```ts
// src/controls.ts
import { defineControls } from 'react-native-control-center';

export default defineControls({
  quickNote: {
    type: 'button',
    title: 'Quick Note',
    icon: 'square.and.pencil',
  },
  vpnToggle: {
    type: 'toggle',
    title: 'VPN',
    icons: { on: 'lock.fill', off: 'lock.open' },
    stateKey: 'vpnEnabled',
  },
});
```

Add one line to `app.json`:

```json
{
  "expo": {
    "plugins": [
      ["react-native-control-center", {
        "controls": "./src/controls.ts",
        "urlScheme": "myapp"
      }]
    ]
  }
}
```

Run `npx expo prebuild` and the library:

- generates a Widget Extension target
- writes the `ControlWidget` + `AppIntent` Swift files
- links `AppIntents.framework` and `WidgetKit.framework`
- wires up App Group entitlement for two-way state sync
- registers a URL scheme for deep linking

React to taps in your app:

```ts
import { ControlCenter, useControlState } from 'react-native-control-center';

// Button taps
ControlCenter.onAction(({ id }) => {
  if (id === 'quickNote') navigation.navigate('NewNote');
});

// Bidirectional toggle state
const [isVPN, setVPN] = useControlState<boolean>('vpnEnabled');
```

---

## Why this exists

Apple's iOS 18 Control Widgets are powerful, but wiring them up from React Native currently means:

1. Opening Xcode
2. Adding a Widget Extension target
3. Writing SwiftUI `ControlWidget` by hand
4. Defining an `AppIntent`
5. Configuring an App Group
6. Setting up a URL scheme
7. Bridging taps back to JS

`@bacons/apple-targets` solves step 1 — but leaves you with Swift, plists, and entitlements to manage yourself.

This library takes a declarative TypeScript config and generates the full native extension, including the pieces needed for two-way state sync with your React Native app.

---

## How it works

There are two distinct flows worth understanding: what happens **at build time**
when you run `expo prebuild` (or `rn-control-center generate`), and what happens
**at runtime** when a user taps a control in Control Center.

### Build-time pipeline

```
[ npx expo prebuild ]                      [ npx rn-control-center generate ]
        │                                              │
        ▼                                              ▼
 Expo reads app.json plugins              cli/bin reads package.json
        │                                              │
        ▼                                              ▼
 plugin/index.ts                          cli/runGenerate.ts
   withControlCenter(config, props)         runGenerate({ projectRoot })
        │                                              │
        ├── validateProps()                            │
        │                                              │
        ├── withDangerousMod(...) ────────┐            │
        │       parseControlsFile()       │            │
        │       generateNativeFiles()     │            │
        │       fs.writeFileSync(...)     │            │
        │                                 │            │
        └── withXcodeProject(...) ────────┘            │
                wireXcodeProject(project, opts)        │
                                                       │
                                                       ▼
        ┌──── parseControlsFile()  ◄────  reads ./src/controls.ts and turns
        │                                  the defineControls({...}) literal
        │                                  into ParsedControl[] (Babel AST)
        │
        ├──── generateNativeFiles()  ──►  emits 8 NativeFile records:
        │                                  • ControlBundle.swift
        │                                  • ControlStore.swift
        │                                  • Controls/<Name>Control.swift × N
        │                                  • Intents/<Name>Intent.swift × N
        │                                  • Info.plist
        │                                  • <ext>.entitlements (widget)
        │                                  • MainApp.entitlements (main app)
        │
        ├──── fs.writeFileSync(...)  ──►  writes the eight files into
        │                                  ios/ControlCenterExtension/
        │
        └──── wireXcodeProject(...)  ──►  mutates project.pbxproj:
                  ├── addWidgetExtensionTarget()       app-extension target
                  │                                    + auto PBXCopyFilesBuildPhase
                  │                                      embedding the .appex
                  ├── linkFrameworks(widget,           one PBXFileReference,
                  │     ['WidgetKit','SwiftUI',         one PBXBuildFile per
                  │      'AppIntents'])                 target's Frameworks phase
                  ├── linkFrameworks(mainApp,
                  │     ['AppIntents'])
                  ├── addSyncedSourceFolder()          PBXFileSystemSynchronizedRootGroup
                  │                                    + 2 ExceptionSets:
                  │                                      • shared files → main app
                  │                                      • plist/entitlements → exclude widget
                  ├── setTargetBuildSettings(widget,   IPHONEOS_DEPLOYMENT_TARGET=18.0,
                  │     {...})                          INFOPLIST_FILE,
                  │                                     CODE_SIGN_ENTITLEMENTS,
                  │                                     GENERATE_INFOPLIST_FILE=NO, ...
                  ├── setTargetBuildSettings(mainApp,  CODE_SIGN_ENTITLEMENTS,
                  │     {...})                          IPHONEOS_DEPLOYMENT_TARGET≥16.0
                  └── verifyEmbedded()                  sanity check
                                                       │
                                                       ▼
                                                 project.writeSync()
                                                       │
                                                       ▼
                                                 CocoaPods install
                                                       │
                                                       ▼
                                                 ios/ ready to xcodebuild
```

### Runtime — Button tap (e.g. "Quick Note")

```
①  user taps "Quick Note" in Control Center
        │
        ▼
②  iOS wakes the widget extension process
        │
        ▼
③  QuickNoteIntent.perform() runs (in widget process)
        │   ControlStore.shared.enqueueAction(id, deepLink)
        │     └── push event to App Group UserDefaults queue
        │     └── post a Darwin notification
        │   return .result()
        │
        ▼
④  iOS sees `static let openAppWhenRun: Bool = true`
        └── brings the main app to the foreground
        │
        ▼
⑤  Main app starts/resumes
        └── (Week 5) Native Module observes the Darwin notification,
            drains the App Group queue, emits a JS event
        │
        ▼
⑥  ControlCenter.onAction(({ id }) => ...) fires in JS
```

### Runtime — Toggle tap (e.g. "VPN")

Two phases interleave: **rendering** (whenever Control Center asks the widget
to draw itself) and **action** (when the user actually taps the toggle).

```
[ rendering ]
①  Control Center asks the widget for its current state
        │
        ▼
②  Provider.currentValue() runs
        └── ControlStore.shared.getBool('vpnEnabled')
              └── reads from App Group UserDefaults
        │
        ▼
③  iOS draws the toggle with the returned value
        └── on-icon vs off-icon, on-tint vs off-tint

[ action ]
①  user taps the toggle (currently OFF)
        │
        ▼
②  iOS computes the new value (true) and injects into VpnToggleIntent.value
        │
        ▼
③  VpnToggleIntent.perform() runs
        │   ControlStore.shared.setBool('vpnEnabled', true)
        │     └── write to App Group UserDefaults FIRST
        │   ControlStore.shared.enqueueStateChange('vpnEnabled', true)
        │     └── push event to queue + post Darwin notification
        │   return .result()
        │
        ▼
④  iOS re-runs the rendering flow above; toggle visually flips to ON
        │
        ▼
⑤  (Week 5) Native Module drains the queue, emits a JS event
        └── useControlState('vpnEnabled') hook updates → UI rerenders
```

---

## Status

Week 5 (May 2026) — **runtime native module complete; build + runtime now connected end-to-end** ✅ &nbsp; · &nbsp; **120 tests passing**

What works today:

- [x] `defineControls({...})` types + `~200` curated SF Symbols literal union
- [x] Babel AST parser with literal-only policy and line-aware errors
- [x] Handlebars templates for **Button** + **Toggle** controls, intents, and `ControlStore.swift`
- [x] `generateNativeFiles()` — emits 8 Swift/plist/entitlement files tagged with target membership
- [x] `wireXcodeProject()` — mutates `project.pbxproj` to add the widget target, link frameworks, register the synced folder + ExceptionSets, and apply build settings on both targets
- [x] **Expo Config Plugin** (`plugin/index.ts`) wires the entire pipeline into `expo prebuild`
- [x] **Standalone CLI** (`npx rn-control-center generate`) runs the same pipeline for bare RN CLI projects
- [x] **End-to-end build validated:** in a real Expo app, `expo prebuild` produces a project that builds with `xcodebuild`, the control shows up in iOS Control Center, and tapping it opens the main app — the failure mode that bacons-based setups hit because they couldn't put the AppIntent in both targets is solved here by the ExceptionSet flow
- [x] **Native Module** (`ios/RNControlCenter.swift` + `.mm`) — Darwin notification observer with `Unmanaged` pointer trick, cold-start queue drain, App Group `UserDefaults` get/set exposed to JS via Promise. Legacy Bridge (`RCT_EXTERN_MODULE`); TurboModule migration planned for v0.2
- [x] **`.podspec`** — CocoaPods integration; library autolinks into a consumer RN app's `pod install`
- [x] **JS wrapper** (`src/ControlCenter.ts`) — `NativeEventEmitter` over the native module; `onAction` / `onStateChange` event subscriptions, `getState` / `setState` Promise-based; safe no-op on Android and pre-iOS-18

Coming in Weeks 6–8: full SF Symbol set, `useControlState` polish (sync initial via cache + widget reload via `WidgetCenter.reloadControls`), example apps, simulator tests, and v0.1 publish.

---

## Roadmap

| Week | Milestone | Status |
| ---- | --------- | ------ |
| 1 | Scaffold + AST parser + Button Swift templates | ✅ |
| 2 | Toggle template + ControlStore runtime + Info.plist / entitlement generation | ✅ |
| 3 | pbxproj target wiring (target add, framework link, membership, build settings) | ✅ |
| 4 | Expo Config Plugin + standalone CLI (`rn-control-center generate`) | ✅ |
| 5 | Native Module (Darwin notifications + App Group UserDefaults) | ✅ |
| 6 | Full SF Symbol set + `useControlState` runtime | — |
| 7 | Example apps (Expo + RN CLI) and end-to-end simulator tests | — |
| 8 | Documentation + npm publish (v0.1) | — |

v0.2+: Android Quick Settings Tiles for a unified cross-platform API, Lock Screen and Action Button control targets, dynamic intents.

---

## Development

```bash
git clone https://github.com/alstjd8826/react-native-control-center.git
cd react-native-control-center
npm install --legacy-peer-deps

npm run typecheck   # tsc --noEmit
npm test            # jest, 120 tests
```

The repo is structured as a publishable RN library plus the tooling that backs it:

```
src/      → public API shipped to consumers
core/     → parser + codegen (shared by Expo plugin and CLI)
plugin/   → Expo Config Plugin entry point
cli/      → standalone `rn-control-center` binary
ios/      → native module sources
```

---

## Design notes

- **Literal-only configs.** `defineControls({...})` must contain literal values only; variable references and function calls are rejected at parse time. This lets codegen run without ever executing user code.
- **Independent of `@bacons/apple-targets`.** Bacons is a great general-purpose target plugin, but was tripped up by `@expo/prebuild-config` path changes in Expo SDK 54 during early prototyping. This library talks to `pbxproj` directly through the `xcode` npm package for a narrower, more stable surface.
- **App Group–backed state.** Toggle state lives in a suite UserDefaults shared between the main app and the widget extension; the library generates the entitlement and provisions a sensible default group ID.

---

## License

MIT
