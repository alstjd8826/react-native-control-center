import { defineControls } from 'react-native-control-center';

const title = 'Quick Note';

export default defineControls({
  quickNote: {
    type: 'button',
    title: title, // ❌ 변수 참조 허용 안 함
    icon: 'square.and.pencil',
  },
});
