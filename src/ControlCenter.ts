import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

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
    }
  | undefined;

interface ControlActionEvent {
  id: string;
  deepLink?: string;
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
    if (Platform.OS === 'ios' && RNControlCenter) {
      // NativeEventEmitter는 NativeModule을 받아 startObserving/stopObserving을
      // 자동으로 호출해 준다. addListener가 첫 등록되는 순간 Swift의
      // startObserving이 발사되고, 마지막 listener가 제거되면 stopObserving이 발사된다.
      this.emitter = new NativeEventEmitter(NativeModules.RNControlCenter);
    } else {
      this.emitter = null;
    }
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
      return value as T;
    } catch {
      return null;
    }
  }

  /** App Group UserDefaults에 값 쓰기. iOS 외에선 no-op. */
  async setState<T>(key: string, value: T): Promise<void> {
    if (!RNControlCenter) return;
    await RNControlCenter.setState(key, value as unknown);
  }
}

export const ControlCenter = new ControlCenterAPI();
