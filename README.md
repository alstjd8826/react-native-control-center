# react-native-control-center

iOS 18+ Control Center custom controls for React Native — declare in TypeScript, zero Swift required.

![status](https://img.shields.io/badge/status-v0.2.0-brightgreen) ![iOS](https://img.shields.io/badge/iOS-18%2B-blue) ![license](https://img.shields.io/badge/license-MIT-green)

> **v0.1.0.** Build-time pipeline (codegen + pbxproj wiring + Expo plugin + CLI) and runtime native module (Darwin observer → queue drain → JS events) are complete and compile end-to-end against the real iOS 18 SDK. The runtime hook gives synchronous initial state via a cache and re-renders Control Center on programmatic state change; a 5,000+ SF Symbol set backs build-time spell-check. See [Installation](#installation) and the [Roadmap](#roadmap).

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

## Requirements

| | Minimum |
| --- | --- |
| iOS (controls visible) | **18.0+** — on iOS 17 and below the library loads and no-ops; controls just don't appear |
| Xcode | **16+** (ships the iOS 18 SDK with `ControlWidget` / WidgetKit `ControlCenter`) |
| React Native | **0.74+** |
| Expo (optional) | **SDK 54+** if you use the config plugin |

Android is a safe no-op today; a Quick Settings Tiles backend is planned (see [Roadmap](#roadmap)).

## Installation

```bash
npm install react-native-control-center
```

**Expo** — add the config plugin to `app.json`, then prebuild:

```json
{ "expo": { "plugins": [["react-native-control-center", {
  "controls": "./src/controls.ts",
  "urlScheme": "myapp"
}]] } }
```

```bash
npx expo prebuild --clean && npx expo run:ios
```

**Bare React Native** — add a `rnControlCenter` block to `package.json`, then run the CLI:

```json
{ "rnControlCenter": { "controls": "./src/controls.ts", "urlScheme": "myapp" } }
```

```bash
npx rn-control-center generate && cd ios && pod install && cd .. && npx react-native run-ios
```

See runnable references in [`examples/expo`](examples/expo) and [`examples/bare-rn`](examples/bare-rn).

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

## API

### `defineControls(map)`

Build-time only. Declares your controls as a literal object (literal values
only — no variables or function calls, so codegen never runs your code).

```ts
defineControls({
  quickNote: { type: 'button', title: 'Quick Note', icon: 'square.and.pencil', deepLink?, tint?, description? },
  vpnToggle: { type: 'toggle', title: 'VPN', icons: { on, off }, stateKey: 'vpnEnabled', tint?, description? },
});
```

#### Dynamic (user-configurable) buttons

Add a `parameter` to a button and it becomes **configurable**: when the user
adds the control, iOS shows a picker of your declared `options`, and the chosen
value arrives in `onAction` as `params`. One declaration covers many variants —
the user can even add the same control multiple times with different values.

```ts
defineControls({
  openPlace: {
    type: 'button',
    title: 'Open Place',
    icon: 'mappin',
    parameter: {
      key: 'place',                 // arrives as params.place
      title: 'Place',               // label shown in the iOS config screen
      options: [
        { value: 'home', label: 'Home' },
        { value: 'work', label: 'Work' },
        { value: 'gym',  label: 'Gym'  },
      ],
    },
  },
});
```

```ts
ControlCenter.onAction(({ id, params }) => {
  if (id === 'openPlace') navigate(params?.place); // 'home' | 'work' | 'gym'
});
```

> Static vs dynamic: without `parameter` a button always does one thing; with
> it, the value is chosen by the user at add-time (a fixed list you declare —
> runtime/queried options are planned, not in 0.2.0).

### `ControlCenter`

Runtime singleton. Safe no-op off iOS 18.

| Member | Description |
| --- | --- |
| `isAvailable(): boolean` | `true` only on iOS 18+ with the native module loaded |
| `onAction(cb): () => void` | Fires when a **button** is tapped; `cb({ id, deepLink?, params?, t })`. `params` holds the chosen value for dynamic buttons. Returns an unsubscribe fn |
| `onStateChange<T>(key, cb): () => void` | Fires when a **toggle**'s `stateKey` changes. Returns an unsubscribe fn |
| `getState<T>(key): Promise<T \| null>` | Read App Group state (returns `null` off iOS) |
| `setState<T>(key, value): Promise<void>` | Write App Group state; reloads Control Center so the toggle re-renders |

### `useControlState<T>(stateKey)`

React hook over a toggle's state — `const [value, setValue] = useControlState<boolean>('vpnEnabled')`.
First render is synchronous from a cache (no `null` flicker on cold start), then
stays in sync with both in-app `setValue` calls and Control Center taps.

## Troubleshooting

- **Control doesn't appear in Control Center** — it's iOS 18+ only; add the
  control via Control Center's edit screen (`+`). Confirm `expo prebuild` /
  `rn-control-center generate` ran and the widget target is in your Xcode project.
- **Toggle doesn't sync with the app** — both targets must share the App Group.
  The plugin/CLI generate the entitlement and inject `RNControlCenterAppGroup`
  into the app `Info.plist`; if you changed the bundle id, re-run generation.
- **`cannot find 'ControlStore'` or App Group errors when building** — re-run
  generation after changing controls, then `pod install`.
- **An icon renders blank** — the build prints a warning for unknown SF Symbol
  names; check the spelling in SF Symbols.app.

## Status

Week 8 (May 2026) — **v0.1.0 release prep — docs, license, examples, slimmed package** ✅ &nbsp; · &nbsp; **138 tests passing**

What Week 8 added:

- [x] **Docs** — Requirements, Installation, full API reference, and Troubleshooting sections (above)
- [x] **`examples/bare-rn`** — RN CLI example mirroring the Expo one (`rnControlCenter` config + `rn-control-center generate`)
- [x] **MIT `LICENSE`** file (the `license` field had no accompanying file)
- [x] **Slimmer tarball** — `files` no longer ships the source `.ts` that the built `lib/` already provides (≈108 kB → 71 kB packed); native sources, templates, CLI bin, and types are all still included
- [x] **`v0.1.0`** — `npm run build` + `npm pack` verified; `prepublishOnly` runs typecheck + tests + build

> Publishing to npm (`npm publish`) is the one remaining manual, irreversible step — run it when you're logged in (`npm whoami`).

---

## Earlier status

Week 7 (May 2026) — **Expo example + xcodebuild compile E2E** ✅ — a real host-app compile caught three bugs the JS tests couldn't: a Swift module boundary (native module in the Pod couldn't see the app-generated `ControlStore` → fixed with a Pod-side [`ControlStoreRuntime`](ios/ControlStoreRuntime.swift) reading config from `Info.plist`), a non-existent `hasListeners` member, and a too-high podspec deployment target. Also fixed `package.json` `main`/`types`.

Week 6 (May 2026) — **runtime hook polished + full SF Symbol set with build-time validation** ✅ &nbsp; · &nbsp; **136 tests passing**

What works today:

- [x] `defineControls({...})` types + `~200` curated SF Symbols literal union (autocomplete)
- [x] **Full SF Symbol set** (5,359 names, generated from [symbolist](https://github.com/marcbouchenoire/symbolist), MIT) — build-time spell-check warns on typos like `lock.filll` without blocking the build
- [x] **`useControlState` polish** — synchronous initial value from a JS cache seeded by a native `initialState` constant (no first-render `null` flicker on cold start); programmatic `setState` calls `ControlCenter.shared.reloadAllControls()` so the Control Center toggle re-renders immediately
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

---

## Roadmap

| Week | Milestone | Status |
| ---- | --------- | ------ |
| 1 | Scaffold + AST parser + Button Swift templates | ✅ |
| 2 | Toggle template + ControlStore runtime + Info.plist / entitlement generation | ✅ |
| 3 | pbxproj target wiring (target add, framework link, membership, build settings) | ✅ |
| 4 | Expo Config Plugin + standalone CLI (`rn-control-center generate`) | ✅ |
| 5 | Native Module (Darwin notifications + App Group UserDefaults) | ✅ |
| 6 | Full SF Symbol set + validation + `useControlState` runtime (cache + reload) | ✅ |
| 7 | Expo example app + xcodebuild compile E2E (host app + extension link on real SDK) | ✅ |
| 8 | Documentation + RN CLI example + v0.1.0 release prep (publish = manual step) | ✅ |

**v0.2.0:** dynamic intents — user-configurable button controls (a `parameter` with selectable options; the choice arrives in `onAction.params`). ✅

Later: Android Quick Settings Tiles for a unified cross-platform API, Lock Screen and Action Button control targets, runtime/queried dynamic options.

---

## Development

```bash
git clone https://github.com/alstjd8826/react-native-control-center.git
cd react-native-control-center
npm install --legacy-peer-deps

npm run typecheck   # tsc --noEmit
npm test            # jest, 138 tests
```

The repo is structured as a publishable RN library plus the tooling that backs it:

```
src/      → public API shipped to consumers
core/     → parser + codegen (shared by Expo plugin and CLI)
plugin/   → Expo Config Plugin entry point
cli/      → standalone `rn-control-center` binary
ios/      → native module sources
scripts/  → tooling (e.g. gen-sf-symbols.mjs regenerates the symbol list)
```

---

## Design notes

- **Literal-only configs.** `defineControls({...})` must contain literal values only; variable references and function calls are rejected at parse time. This lets codegen run without ever executing user code.
- **Independent of `@bacons/apple-targets`.** Bacons is a great general-purpose target plugin, but was tripped up by `@expo/prebuild-config` path changes in Expo SDK 54 during early prototyping. This library talks to `pbxproj` directly through the `xcode` npm package for a narrower, more stable surface.
- **App Group–backed state.** Toggle state lives in a suite UserDefaults shared between the main app and the widget extension; the library generates the entitlement and provisions a sensible default group ID.

---

## License

MIT
