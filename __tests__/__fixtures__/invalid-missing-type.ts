// @ts-expect-error type 필드 누락 — 파서 에러 유도용
import { defineControls } from 'react-native-control-center';

export default defineControls({
  quickNote: {
    title: '빠른 메모',
    icon: 'square.and.pencil',
  },
});
