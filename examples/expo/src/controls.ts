import { defineControls } from 'react-native-control-center';

export default defineControls({
  quickNote: {
    type: 'button',
    title: '빠른 메모',
    icon: 'square.and.pencil',
  },
  vpnToggle: {
    type: 'toggle',
    title: 'VPN',
    icons: { on: 'lock.fill', off: 'lock.open' },
    stateKey: 'vpnEnabled',
  },
  // dynamic — 사용자가 추가할 때 Home/Work/Gym 중 고름
  openPlace: {
    type: 'button',
    title: 'Open Place',
    icon: 'mappin',
    parameter: {
      key: 'place',
      title: 'Place',
      options: [
        { value: 'home', label: 'Home' },
        { value: 'work', label: 'Work' },
        { value: 'gym', label: 'Gym' },
      ],
    },
  },
});
