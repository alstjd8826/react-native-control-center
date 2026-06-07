import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import { getCachedState, setCachedState, seedCache } from './stateCache';

// ─────────────────────────────────────────────────────────────────────────
//  ControlCenter — Native Module JS wrapper
//
//  Swift의 RNControlCenter가 발사하는 이벤트를 받고,
//  메서드 호출(getState/setState)을 Promise로 노출한다.
//
//  iOS 외 플랫폼 또는 Native Module 미설치 시 모든 메서드는 no-op.
// ─────────────────────────────────────────────────────────────────────────

const RNControlCenter = NativeModules.RNControlCenter as
  | {
      getState(key: string): Promise<unknown>;
      setState(key: string, value: unknown): Promise<void>;
      // 네이티브가 모듈 등록 시점에 동기로 넘겨주는 상수.
      // 콜드 스타트 직후에도 첫 렌더에서 바로 쓸 수 있는 초기 상태 스냅샷. (iOS만)
      initialState?: Record<string, unknown>;
      // Android: 타일이 쌓아둔 이벤트 큐를 비워 JS로 발사하도록 요청. (iOS엔 없음)
      drain?(): Promise<void>;
    }
  | undefined;

interface ControlActionEvent {
  id: string;
  deepLink?: string;
  /** dynamic intent에서 사용자가 고른 값. 정적 버튼은 없음(undefined). */
  params?: Record<string, string>;
  t: number;
}

interface ControlStateChangeEvent {
  key: string;
  value: unknown;
  t: number;
}

type Unsubscribe = () => void;

class ControlCenterAPI {
  private emitter: NativeEventEmitter | null;

  constructor() {
    const supported = Platform.OS === 'ios' || Platform.OS === 'android';
    if (supported && RNControlCenter) {
      // iOS: addListener 첫 등록 시 Swift startObserving이 자동 호출됨.
      // Android: 이벤트는 RCTDeviceEventEmitter로 오고, 큐 비우기는 drain()으로.
      this.emitter = new NativeEventEmitter(NativeModules.RNControlCenter);

      // 콜드 스타트 시드 — iOS는 네이티브 initialState 상수로 캐시를 미리 채운다.
      // (Android 모듈은 이 상수가 없어 undefined → seedCache가 no-op)
      seedCache(RNControlCenter.initialState);

      // 모든 ControlStateChange 이벤트를 캐시에 반영하는 내부 리스너.
      // 키별 구독(onStateChange)과 별개로, 어떤 키가 바뀌든 캐시는 항상 최신.
      this.emitter.addListener(
        'ControlStateChange',
        (event: ControlStateChangeEvent) => {
          setCachedState(event.key, event.value);
        }
      );

      // Android: JS 리스너가 붙은 지금, 타일이 앱 실행 전에 쌓아둔 이벤트를 흘려보낸다.
      // (iOS엔 drain이 없어 optional chaining으로 no-op)
      void RNControlCenter.drain?.();
    } else {
      this.emitter = null;
    }
  }

  /**
   * 캐시된 마지막 값을 동기로 반환. 모르면 undefined.
   * useControlState 훅이 첫 렌더 초기값으로 사용 (깜빡임 방지).
   */
  getCachedState<T>(key: string): T | undefined {
    return getCachedState<T>(key);
  }

  /** 라이브러리가 현재 환경에서 실제로 동작 가능한지 (iOS + Native Module 로드됨). */
  isAvailable(): boolean {
    return this.emitter !== null;
  }

  /**
   * 사용자가 제어센터의 Button을 탭했을 때 발사되는 이벤트 구독.
   * @returns unsubscribe 함수
   */
  onAction(cb: (event: ControlActionEvent) => void): Unsubscribe {
    if (!this.emitter) return () => {};
    const sub = this.emitter.addListener('ControlAction', cb);
    return () => sub.remove();
  }

  /**
   * 특정 stateKey의 값이 바뀌었을 때 발사되는 이벤트 구독.
   * Swift는 모든 키를 하나의 이벤트로 발사하므로 여기서 키 필터링.
   * @returns unsubscribe 함수
   */
  onStateChange<T>(key: string, cb: (value: T) => void): Unsubscribe {
    if (!this.emitter) return () => {};
    const sub = this.emitter.addListener(
      'ControlStateChange',
      (event: ControlStateChangeEvent) => {
        if (event.key === key) cb(event.value as T);
      }
    );
    return () => sub.remove();
  }

  /** App Group UserDefaults에서 값 읽기. iOS 외에선 null. */
  async getState<T>(key: string): Promise<T | null> {
    if (!RNControlCenter) return null;
    try {
      const value = await RNControlCenter.getState(key);
      setCachedState(key, value); // 응답을 캐시에 반영
      return value as T;
    } catch {
      return null;
    }
  }

  /** App Group UserDefaults에 값 쓰기. iOS 외에선 no-op. */
  async setState<T>(key: string, value: T): Promise<void> {
    setCachedState(key, value); // optimistic — 네이티브 왕복 전에 캐시 먼저 갱신
    if (!RNControlCenter) return;
    await RNControlCenter.setState(key, value as unknown);
  }
}

export const ControlCenter = new ControlCenterAPI();
