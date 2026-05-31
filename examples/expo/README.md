# Expo example

A minimal Expo app showing `react-native-control-center` end to end:

- `src/controls.ts` — declares a **button** (`quickNote`) and a **toggle** (`vpnToggle`)
- `app.json` — registers the config plugin with a `urlScheme`
- `App.tsx` — handles button taps with `ControlCenter.onAction` and binds the
  toggle with `useControlState('vpnEnabled')`

These are the only files unique to the integration; everything else is a stock
Expo app. To run it in a fresh project:

```bash
# 1. Create an Expo app (SDK 54+, iOS 18 controls require Xcode 16+)
npx create-expo-app@latest my-app
cd my-app

# 2. Add the library
npm install react-native-control-center

# 3. Copy these three files in
#    - app.json        (merge the "plugins" entry)
#    - src/controls.ts
#    - App.tsx

# 4. Generate the native widget extension and build
npx expo prebuild --clean
npx expo run:ios
```

Then open Control Center on the simulator/device, add the **Quick Note** and
**VPN** controls, and watch:

- tapping **Quick Note** opens the app and appends a line to the on-screen log
- flipping **VPN** in Control Center updates the in-app `Switch`, and vice-versa

> iOS 18+ only. On Android or older iOS the library no-ops safely, so the app
> still runs — it just won't show any controls.
