import Foundation
import React

// ─────────────────────────────────────────────────────────────────────────
//  📄  RNControlCenter.swift
//  Native Module — 위젯이 만든 이벤트를 JS로 배달하는 다리
// ─────────────────────────────────────────────────────────────────────────
//
//  두 가지 책임:
//   1. Darwin notification observer 등록/해제 (위젯이 "이벤트 있음!" 신호 보냈을 때 받기)
//   2. ControlStore의 큐를 drain해서 JS로 이벤트 발사
//
// ─────────────────────────────────────────────────────────────────────────

@objc(RNControlCenter)
class RNControlCenter: RCTEventEmitter {

  // MARK: - 이벤트 이름 등록
  //
  // RN에게 "이 모듈은 이런 이름의 이벤트를 발사한다"고 미리 알려준다.
  // 여기 없는 이름으로 sendEvent를 호출하면 RN이 경고를 찍고 JS는 못 받는다.

  override func supportedEvents() -> [String]! {
    return [
      "ControlAction",       // Button 탭됨 → { id, deepLink, t }
      "ControlStateChange",  // Toggle 바뀜 → { key, value, t }
    ]
  }

  // MARK: - 초기화 스레드 정책
  //
  // 이 모듈은 UI를 만지지 않으므로 백그라운드 스레드에서 init 가능.
  // false 명시 안 하면 RN 0.49+에서 콘솔 경고 + 메인 스레드로 강제됨.

  @objc override static func requiresMainQueueSetup() -> Bool {
    return false
  }

  // MARK: - Lifecycle hooks
  //
  // RN이 자동으로 호출:
  //   startObserving() — JS에서 첫 listener가 addListener() 했을 때
  //   stopObserving()  — JS에서 마지막 listener가 제거됐을 때
  //
  // 중간 listener 변동(2개째 추가, 1개 제거 후에도 남음 등)은 RN이 내부적으로 처리하고
  // 여기로 호출하지 않는다. 우리는 0→1, 1→0 전환만 신경 쓰면 됨.

  override func startObserving() {
    registerDarwinObserver()

    // ⚠️ 중요 — 앱이 죽어있다 위젯 탭으로 깬 시나리오를 위해 미리 한 번 drain.
    // 그때의 Darwin 신호는 이미 사라졌지만 큐(UserDefaults)엔 이벤트가 남아 있음.
    drainQueueAndSendEvents()
  }

  override func stopObserving() {
    unregisterDarwinObserver()
  }

  // MARK: - Darwin observer 등록/해제
  //
  // 위젯 익스텐션이 ControlStore.postDarwinNotification()으로 발사한 신호를 받기 위해
  // 커널 레벨 Darwin notification center에 observer를 등록한다.
  //
  // 까다로운 부분: CFNotificationCenterAddObserver는 C API라서 콜백을
  // "C 함수 포인터" 형태로만 받음. Swift 클래스 메서드를 직접 못 넘김.
  // 우회: self를 raw pointer로 변환해서 observer 인자로 넘기고,
  //       콜백 안에서 그 포인터를 다시 self로 복원한다.

  private var observerRegistered = false

  private func registerDarwinObserver() {
    guard !observerRegistered else { return }

    let center = CFNotificationCenterGetDarwinNotifyCenter()

    // self의 메모리 주소를 C가 이해할 raw pointer로 변환.
    // ARC 참조 카운트는 건드리지 않음 (Native Module은 앱 전체 수명 보장).
    let observer = Unmanaged.passUnretained(self).toOpaque()

    CFNotificationCenterAddObserver(
      center,
      observer,
      { _, observerPtr, _, _, _ in
        // 이 클로저는 캡처 없음 → C 함수 포인터로 변환됨.
        // observerPtr = 위에서 넘긴 self의 주소.
        guard let observerPtr = observerPtr else { return }
        let module = Unmanaged<RNControlCenter>
          .fromOpaque(observerPtr)
          .takeUnretainedValue()

        // C 콜백은 임의 스레드에서 발사. RN bridge 호출은 메인 스레드가 안전.
        DispatchQueue.main.async {
          module.drainQueueAndSendEvents()
        }
      },
      ControlStore.darwinNotificationName as CFString,  // 들을 채널 이름
      nil,                                              // object filter (안 씀)
      .deliverImmediately
    )

    observerRegistered = true
  }

  private func unregisterDarwinObserver() {
    guard observerRegistered else { return }

    let center = CFNotificationCenterGetDarwinNotifyCenter()
    let observer = Unmanaged.passUnretained(self).toOpaque()

    CFNotificationCenterRemoveObserver(
      center,
      observer,
      CFNotificationName(ControlStore.darwinNotificationName as CFString),
      nil
    )

    observerRegistered = false
  }

  // MARK: - JS가 부르는 메서드
  //
  // 이 영역의 @objc func들은 RNControlCenter.mm의 RCT_EXTERN_METHOD와 1:1 매칭.
  // 시그니처가 .mm 쪽과 어긋나면 RN이 런타임에 메서드를 못 찾고 호출 실패.

  /// JS에서 useControlState 훅이 초기값 읽을 때 사용.
  /// 예: const value = await RNControlCenter.getState('vpnEnabled')
  @objc func getState(_ key: String,
                      resolver resolve: @escaping RCTPromiseResolveBlock,
                      rejecter reject: @escaping RCTPromiseRejectBlock) {
    let value = ControlStore.shared.getBool(key)
    resolve(value)
  }

  /// JS에서 useControlState 훅이 setter로 호출할 때 사용.
  /// 예: await RNControlCenter.setState('vpnEnabled', true)
  /// App Group UserDefaults에 값을 쓰면 위젯이 다음 렌더링 때 그 값을 읽는다.
  @objc func setState(_ key: String,
                      value: Bool,
                      resolver resolve: @escaping RCTPromiseResolveBlock,
                      rejecter reject: @escaping RCTPromiseRejectBlock) {
    ControlStore.shared.setBool(key, value: value)
    resolve(nil)
  }

  // MARK: - 큐 비우기 + JS 발사
  //
  // ControlStore의 두 종류 큐(action / stateChange)를 비우고
  // 각 이벤트를 supportedEvents에 등록된 이름으로 JS에 발사.
  //
  // hasListeners 가드: JS가 안 듣고 있으면 큐를 만지지 않는다.
  // 안 만지면 다음 listener가 등록될 때 startObserving 안에서 drain됨.

  private func drainQueueAndSendEvents() {
    guard hasListeners else { return }

    // 1) Button 탭 큐
    let actions = ControlStore.shared.dequeueActionEvents()
    for action in actions {
      sendEvent(withName: "ControlAction", body: action)
    }

    // 2) Toggle 변경 큐
    let stateChanges = ControlStore.shared.dequeueStateChangeEvents()
    for change in stateChanges {
      sendEvent(withName: "ControlStateChange", body: change)
    }
  }
}
