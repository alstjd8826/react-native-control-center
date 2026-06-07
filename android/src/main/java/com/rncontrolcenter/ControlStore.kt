package com.rncontrolcenter

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

// ─────────────────────────────────────────────────────────────────────────
//  ControlStore — 앱 ↔ Quick Settings 타일 공유 저장소 + 이벤트 큐 (Android)
//
//  iOS와 달리 타일은 앱과 "같은 프로세스"에서 돌아가므로 App Group이 필요 없다.
//  앱-전용 SharedPreferences가 그대로 타일과 앱 양쪽에서 공유된다.
//
//  • 토글 상태: SharedPreferences의 Boolean
//  • 이벤트 큐: JSON 문자열로 직렬화해 보관 (SharedPreferences는 객체 배열을
//    직접 못 담으므로). 앱(Native Module)이 drain → JS로 발사.
// ─────────────────────────────────────────────────────────────────────────

object ControlStore {
    private const val PREFS = "rncontrolcenter"
    private const val ACTION_QUEUE = "__rncc.actionQueue"
    private const val STATE_QUEUE = "__rncc.stateChangeQueue"

    private fun prefs(ctx: Context) =
        ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    // ─── 토글 상태 R/W ───────────────────────────────────────────────────
    fun getBool(ctx: Context, key: String): Boolean = prefs(ctx).getBoolean(key, false)

    fun setBool(ctx: Context, key: String, value: Boolean) {
        prefs(ctx).edit().putBoolean(key, value).apply()
    }

    // ─── 이벤트 enqueue (타일 → 앱) ──────────────────────────────────────
    fun enqueueAction(ctx: Context, id: String, deepLink: String) {
        appendToQueue(
            ctx, ACTION_QUEUE,
            JSONObject()
                .put("id", id)
                .put("deepLink", deepLink)
                .put("t", System.currentTimeMillis() / 1000.0)
        )
    }

    fun enqueueStateChange(ctx: Context, key: String, value: Boolean) {
        appendToQueue(
            ctx, STATE_QUEUE,
            JSONObject()
                .put("key", key)
                .put("value", value)
                .put("t", System.currentTimeMillis() / 1000.0)
        )
    }

    // ─── drain (앱 Native Module이 호출) ─────────────────────────────────
    fun dequeueActionEvents(ctx: Context): JSONArray = drain(ctx, ACTION_QUEUE)
    fun dequeueStateChangeEvents(ctx: Context): JSONArray = drain(ctx, STATE_QUEUE)

    // ─── 내부 ────────────────────────────────────────────────────────────
    private fun appendToQueue(ctx: Context, key: String, event: JSONObject) {
        val arr = JSONArray(prefs(ctx).getString(key, "[]"))
        arr.put(event)
        prefs(ctx).edit().putString(key, arr.toString()).apply()
    }

    private fun drain(ctx: Context, key: String): JSONArray {
        val arr = JSONArray(prefs(ctx).getString(key, "[]"))
        prefs(ctx).edit().remove(key).apply()
        return arr
    }
}
