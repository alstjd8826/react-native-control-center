import { defineControls } from 'react-native-control-center';

export default defineControls({
  quickNote: {
    type: 'button',
    title: '빠른 메모',
    icon: 'square.and.pencil',
    tint: '#FFCC00',
    description: '제어센터에서 바로 메모',
    deepLink: 'quicknote://new',
  },
  vpnToggle: {
    type: 'toggle',
    title: 'VPN',
    icons: { on: 'lock.fill', off: 'lock.open' },
    tint: { on: '#00C853', off: '#888888' },
    stateKey: 'vpnEnabled',
  },
  flashlight: {
    type: 'toggle',
    title: '손전등',
    icons: { on: 'flashlight.on.fill', off: 'flashlight.off.fill' },
    stateKey: 'flashlightOn',
  },
});
