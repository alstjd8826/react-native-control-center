import { useEffect, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ControlCenter, useControlState } from 'react-native-control-center';

// ─────────────────────────────────────────────────────────────────────────
//  QuickNoteExpo — react-native-control-center 예제 앱
//
//  src/controls.ts 에 선언한 두 컨트롤을 실제로 다룬다:
//   • quickNote (button) → 탭하면 ControlCenter.onAction 으로 잡아 로그에 남김
//   • vpnToggle (toggle, stateKey "vpnEnabled") → useControlState 로 양방향 동기화
// ─────────────────────────────────────────────────────────────────────────

export default function App() {
  // 토글 상태 — 제어센터에서 켜면 여기 Switch도 따라 켜지고, 반대도 마찬가지.
  const [vpnEnabled, setVpnEnabled] = useControlState<boolean>('vpnEnabled');

  // 버튼(quickNote) 탭 이력
  const [actionLog, setActionLog] = useState<string[]>([]);

  useEffect(() => {
    // 사용자가 제어센터에서 "빠른 메모" 버튼을 누르면 이 콜백이 실행된다.
    const unsubscribe = ControlCenter.onAction(({ id, deepLink, params }) => {
      const stamp = new Date().toLocaleTimeString();
      // dynamic 버튼이면 사용자가 고른 값이 params에 담겨 옴 (예: { place: 'work' })
      const extra = params
        ? `  ${JSON.stringify(params)}`
        : deepLink
          ? `  (${deepLink})`
          : '';
      setActionLog((prev) => [`${stamp}  ${id}${extra}`, ...prev]);
    });
    return unsubscribe; // 언마운트 시 구독 해제
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="auto" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Control Center 예제</Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>라이브러리 사용 가능 여부</Text>
          <Text style={styles.cardValue}>
            {ControlCenter.isAvailable()
              ? '✅ iOS 18+ · 네이티브 모듈 로드됨'
              : '⚠️ 미지원 환경'}
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.cardLabel}>VPN 토글 (vpnEnabled)</Text>
              <Text style={styles.hint}>제어센터의 토글과 양방향 동기화</Text>
            </View>
            <Switch value={vpnEnabled ?? false} onValueChange={setVpnEnabled} />
          </View>
          <Text style={styles.cardValue}>
            현재 값:{' '}
            {vpnEnabled === null ? '불러오는 중…' : vpnEnabled ? 'ON' : 'OFF'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>빠른 메모 버튼 탭 로그 (quickNote)</Text>
          <Text style={styles.hint}>
            제어센터에서 버튼을 누르면 여기에 기록됩니다
          </Text>
          {actionLog.length === 0 ? (
            <Text style={styles.empty}>아직 탭 없음</Text>
          ) : (
            actionLog.map((line, i) => (
              <Text key={i} style={styles.logLine}>
                {line}
              </Text>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f2f2f7' },
  container: { padding: 20, gap: 16 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 4 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowText: { flex: 1, paddingRight: 12 },
  cardLabel: { fontSize: 15, fontWeight: '600' },
  cardValue: { fontSize: 15, color: '#333' },
  hint: { fontSize: 12, color: '#888' },
  empty: { fontSize: 14, color: '#aaa', fontStyle: 'italic' },
  logLine: { fontSize: 13, color: '#444', fontFamily: 'Courier' },
});
