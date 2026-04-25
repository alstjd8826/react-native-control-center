import { defineControls } from 'react-native-control-center';

export default defineControls({
  quickNote: {
    type: 'button',
    title: 'Quick Note',
    icon: 'square.and.pencil',
    tint: '#FFCC00',
  },
  vpn: {
    type: 'toggle',
    title: 'VPN',
    icons: { on: 'lock.fill', off: 'lock.open' },
    tint: { on: '#00C853', off: '#888888' },
    stateKey: 'vpnEnabled',
    description: 'Toggle the VPN connection.',
  },
});
