import Foundation

// ─────────────────────────────────────────────────────────────────────────
//  📄  ControlStoreRuntime.swift   (라이브러리가 Pod으로 배송 — 메인 앱 쪽)
//
//  왜 이게 따로 있나:
//   위젯 익스텐션에는 codegen이 만든 `ControlStore.swift`가 들어간다. 하지만 그
//   파일은 "앱/위젯 타겟"에 속하고, Native Module(RNControlCenter)은 별도의
//   "Pod 모듈"로 컴파일되기 때문에 서로의 클래스를 볼 수 없다
//   (Swift 모듈 경계). 그래서 메인 앱 쪽에서 쓸 런타임 스토어를 라이브러리가
//   직접 배송한다.
//
//  생성된 ControlStore와 "같은 사물함"을 바라봐야 하므로:
//   • App Group ID  → 메인 앱 Info.plist의 "RNControlCenterAppGroup" 에서 읽음
//                     (Expo 플러그인 / CLI가 codegen과 동일한 값으로 주입)
//   • Darwin 이름   → "<appGroup>.event"  (생성 코드와 동일 규칙)
//   • 큐 키         → "__rncc.actionQueue" / "__rncc.stateChangeQueue" (동일 상수)
//   • stateKeys     → Info.plist "RNControlCenterStateKeys" (snapshot 정제용)
// ─────────────────────────────────────────────────────────────────────────

public final class ControlStoreRuntime {
    public static let shared = ControlStoreRuntime()

    // 생성된 ControlStore와 반드시 일치해야 하는 큐 키.
    private static let actionQueueKey = "__rncc.actionQueue"
    private static let stateChangeQueueKey = "__rncc.stateChangeQueue"

    public let appGroupId: String
    public let darwinNotificationName: String
    public let stateKeys: [String]

    private let defaults: UserDefaults

    private init() {
        let info = Bundle.main.infoDictionary
        let group = (info?["RNControlCenterAppGroup"] as? String) ?? ""
        self.appGroupId = group
        self.stateKeys = (info?["RNControlCenterStateKeys"] as? [String]) ?? []
        self.darwinNotificationName = group.isEmpty ? "rncc.event" : "\(group).event"

        // App Group이 비어있거나 entitlement 미설정이면 표준 defaults로 폴백.
        // (위젯이 안 보이는 환경 등 — 라이브러리가 크래시 없이 no-op 되도록)
        self.defaults = UserDefaults(suiteName: group) ?? .standard
    }

    // ─── Toggle 상태 R/W (useControlState 훅이 사용) ──────────────────────

    public func getBool(_ key: String) -> Bool {
        return defaults.bool(forKey: key)
    }

    public func setBool(_ key: String, value: Bool) {
        defaults.set(value, forKey: key)
    }

    /// 선언된 stateKey들의 현재 값 스냅샷. constantsToExport(initialState)로 전달돼
    /// JS 캐시를 콜드 스타트 시점에 채운다.
    public func snapshot() -> [String: Any] {
        var out: [String: Any] = [:]
        for key in stateKeys {
            if let value = defaults.object(forKey: key) {
                out[key] = value
            }
        }
        return out
    }

    // ─── 이벤트 큐 drain (위젯이 enqueue → 앱이 dequeue) ──────────────────

    public func dequeueActionEvents() -> [[String: Any]] {
        let events = (defaults.array(forKey: Self.actionQueueKey) as? [[String: Any]]) ?? []
        defaults.removeObject(forKey: Self.actionQueueKey)
        return events
    }

    public func dequeueStateChangeEvents() -> [[String: Any]] {
        let events = (defaults.array(forKey: Self.stateChangeQueueKey) as? [[String: Any]]) ?? []
        defaults.removeObject(forKey: Self.stateChangeQueueKey)
        return events
    }
}
