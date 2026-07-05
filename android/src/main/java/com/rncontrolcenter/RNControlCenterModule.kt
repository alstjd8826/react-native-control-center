package com.rncontrolcenter

import android.app.StatusBarManager
import android.content.ComponentName
import android.content.Context
import android.graphics.drawable.Icon
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONArray
import org.json.JSONObject
import java.util.function.Consumer

// ─────────────────────────────────────────────────────────────────────────
//  RNControlCenterModule — 타일 이벤트를 JS로 배달하는 다리 (iOS RNControlCenter 대응)
//
//  • getState/setState : useControlState 훅이 사용 (Promise)
//  • drain             : 공유 큐를 비우고 JS로 이벤트 발사
//  • onHostResume      : 타일 클릭으로 앱이 열리면(=포어그라운드 복귀) 자동 drain
//                        — iOS의 콜드스타트 drain에 대응
// ─────────────────────────────────────────────────────────────────────────

class RNControlCenterModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

    init {
        reactContext.addLifecycleEventListener(this)
    }

    override fun getName() = "RNControlCenter"

    @ReactMethod
    fun getState(key: String, promise: Promise) {
        promise.resolve(ControlStore.getBool(reactContext, key))
    }

    @ReactMethod
    fun setState(key: String, value: Boolean, promise: Promise) {
        ControlStore.setBool(reactContext, key, value)
        promise.resolve(null)
    }

    // ─── requestAddTile ──────────────────────────────────────────────────
    //  앱에서 "이 타일을 빠른설정에 추가할래요?" 시스템 팝업을 띄운다. (API 33+)
    //  iOS/구버전 Android에선 "unsupported"로 조용히 resolve (no-op 패턴).
    //
    //  result 값(Consumer<Int>): TILE_ADDED / TILE_NOT_ADDED / TILE_ALREADY_ADDED 등.
    @ReactMethod
    fun requestAddTile(id: String, label: String?, promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            promise.resolve("unsupported")
            return
        }
        // requestAddTileService는 포어그라운드 앱(액티비티)에서 호출해야 한다.
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.reject("no_activity", "requestAddTile must be called while the app is in the foreground.")
            return
        }

        val pkg = reactContext.packageName
        // codegen이 만든 클래스명 규칙과 일치해야 함: <pkg>.tiles.<PascalId>TileService
        val component = ComponentName(pkg, "$pkg.tiles.${toPascalCase(id)}TileService")
        // 아이콘: 지금은 앱 런처 아이콘 (SF Symbol→drawable 매핑은 별도 작업)
        val icon = Icon.createWithResource(reactContext, reactContext.applicationInfo.icon)

        val statusBar =
            activity.getSystemService(Context.STATUS_BAR_SERVICE) as StatusBarManager
        statusBar.requestAddTileService(
            component,
            label ?: id,
            icon,
            reactContext.mainExecutor,
            Consumer<Int> { result -> promise.resolve(result) }
        )
    }

    // core/generate/swift.ts 의 pascalCase 와 동일 규칙 (id → 클래스명).
    private fun toPascalCase(str: String): String =
        str.split(Regex("[-_ ]"))
            .filter { it.isNotEmpty() }
            .joinToString("") { it.replaceFirstChar { c -> c.uppercase() } }

    /** JS가 리스너를 붙인 뒤 호출 — 그 사이 쌓인 이벤트를 받기 위해. */
    @ReactMethod
    fun drain(promise: Promise) {
        drainAndEmit()
        promise.resolve(null)
    }

    // NativeEventEmitter가 요구하는 메서드 (없으면 RN이 경고). 실동작은 없음.
    @ReactMethod fun addListener(eventName: String) {}

    @ReactMethod fun removeListeners(count: Int) {}

    // ─── Lifecycle ───────────────────────────────────────────────────────
    override fun onHostResume() { drainAndEmit() }
    override fun onHostPause() {}
    override fun onHostDestroy() {}

    // ─── drain + emit ──────────────────────────────────────────────────────
    private fun drainAndEmit() {
        emitAll("ControlAction", ControlStore.dequeueActionEvents(reactContext))
        emitAll("ControlStateChange", ControlStore.dequeueStateChangeEvents(reactContext))
    }

    private fun emitAll(eventName: String, events: JSONArray) {
        if (!reactContext.hasActiveReactInstance()) return
        for (i in 0 until events.length()) {
            sendEvent(eventName, toWritableMap(events.getJSONObject(i)))
        }
    }

    private fun sendEvent(name: String, body: WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(name, body)
    }

    private fun toWritableMap(obj: JSONObject): WritableMap {
        val map = Arguments.createMap()
        for (key in obj.keys()) {
            when (val v = obj.get(key)) {
                is Boolean -> map.putBoolean(key, v)
                is Int -> map.putInt(key, v)
                is Double -> map.putDouble(key, v)
                is String -> map.putString(key, v)
                else -> map.putString(key, v.toString())
            }
        }
        return map
    }
}
