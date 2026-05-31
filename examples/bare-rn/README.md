# Bare React Native (CLI) example

Same demo as [`../expo`](../expo), but for a **bare RN CLI** project — no Expo
config plugin. Instead of an `app.json` `plugins` entry, you add a
`rnControlCenter` block to `package.json` and run the bundled CLI.

The integration-specific files are identical to the Expo example:

- `src/controls.ts` — a button (`quickNote`) and a toggle (`vpnToggle`)
- `App.tsx` — `ControlCenter.onAction` + `useControlState('vpnEnabled')`

The only difference is configuration + how native files are generated:

```jsonc
// package.json
{
  "rnControlCenter": {
    "controls": "./src/controls.ts",
    "urlScheme": "ccexample"
  }
}
```

```bash
# 1. Create a bare RN app (RN 0.74+, iOS 18 controls need Xcode 16+)
npx @react-native-community/cli@latest init MyApp
cd MyApp

# 2. Add the library + copy src/controls.ts and App.tsx in
npm install react-native-control-center

# 3. Generate the widget extension into ios/ and wire up the Xcode project
npx rn-control-center generate

# 4. Install pods and build
cd ios && pod install && cd ..
npx react-native run-ios
```

`rn-control-center generate` does the same work the Expo plugin does at
`prebuild`: writes the Swift/plist/entitlement files, adds the widget target to
`project.pbxproj`, links frameworks, and injects `RNControlCenterAppGroup` /
`RNControlCenterStateKeys` into the app's `Info.plist` so the native module and
the widget share the same App Group.

> Re-run `npx rn-control-center generate` whenever you change `src/controls.ts`.
