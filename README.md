# react-native-control-center

iOS 18+ Control Center custom controls for React Native — declare in TypeScript, zero Swift required.

![status](https://img.shields.io/badge/status-WIP_v0.0.1-orange) ![iOS](https://img.shields.io/badge/iOS-18%2B-blue) ![license](https://img.shields.io/badge/license-MIT-green)

> ⚠️ **Work in progress.** Swift code generation is complete; Xcode target wiring and the native module are in active development. See [Roadmap](#roadmap).

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

```
 src/controls.ts (TypeScript)
       │
       ▼
 Config Plugin          ← runs during `expo prebuild`
   ├── Babel AST parser extracts Control[] from the literal config
   ├── Handlebars renders Swift files (Bundle, Control, Intent, Store)
   ├── `xcode` npm package adds the Widget Extension target
   ├── pbxproj target-memberships the Intent into main app AND extension
   └── `@expo/config-plugins` injects entitlements + URL scheme
       │
       ▼
 ios/ControlCenterExtension/   ← fully-wired widget, ready to build
       │
       ▼
 Native Module bridges intent events + shared UserDefaults state to JS
```

---

## Status

Week 3 (May 2026) — **pbxproj wiring complete** ✅ &nbsp; · &nbsp; **99 tests passing**

Done so far:

- [x] Public TS types (`defineControls`, `ButtonControl`, `ToggleControl`, `SFSymbolName`)
- [x] SF Symbol literal union (curated ~200; full set in later)
- [x] Babel AST parser with literal-only policy and line-aware errors
- [x] Handlebars templates for **Button** + **Toggle** controls and their intents
- [x] `ControlStore.swift` runtime — App Group `UserDefaults` + Darwin notification
- [x] Widget Extension `Info.plist` generator
- [x] App Group entitlement generator (with merge into existing entitlements)
- [x] `generateNativeFiles()` — single entry point for all generated files, each tagged with target membership (`extension` / `app` / `shared`)
- [x] **`wireXcodeProject()`** — single entry point that mutates a user `project.pbxproj`:
  - adds the Widget Extension target (with auto-embed into main app)
  - links `WidgetKit` / `SwiftUI` / `AppIntents` into the right targets, reusing one `PBXFileReference` per framework across multiple `PBXBuildFile` memberships
  - registers a `PBXFileSystemSynchronizedRootGroup` for the extension folder and a `PBXFileSystemSynchronizedBuildFileExceptionSet` so shared files (Intents, `ControlStore.swift`) belong to both targets
  - sets all the build settings the extension needs (`IPHONEOS_DEPLOYMENT_TARGET=18.0`, `INFOPLIST_FILE`, `CODE_SIGN_ENTITLEMENTS`, `SWIFT_VERSION`, `PRODUCT_BUNDLE_IDENTIFIER`)
  - wires `CODE_SIGN_ENTITLEMENTS` for the main app target so App Group sharing works
  - verifies the extension is embedded before returning

Coming in Weeks 4–8: Expo Config Plugin + CLI entry points (so all of the above runs automatically during `expo prebuild` or `npx rn-control-center generate`), native module (Darwin observer + queue drain), full SF Symbol set, and example apps.

---

## Roadmap

| Week | Milestone | Status |
| ---- | --------- | ------ |
| 1 | Scaffold + AST parser + Button Swift templates | ✅ |
| 2 | Toggle template + ControlStore runtime + Info.plist / entitlement generation | ✅ |
| 3 | pbxproj target wiring (target add, framework link, membership, build settings) | ✅ |
| 4 | Expo Config Plugin + standalone CLI (`rn-control-center generate`) | — |
| 5 | Native Module (Darwin notifications + App Group UserDefaults) | — |
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
npm test            # jest, 99 tests
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
