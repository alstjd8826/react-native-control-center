import { generateAndroidFiles, tilePackageName } from '../core/generate/android';
import type { ParsedControl } from '../core/types';

const button: ParsedControl = {
  id: 'quickNote',
  type: 'button',
  title: 'Quick Note',
  icon: 'square.and.pencil',
};

const toggle: ParsedControl = {
  id: 'vpnToggle',
  type: 'toggle',
  title: 'VPN',
  icons: { on: 'lock.fill', off: 'lock.open' },
  stateKey: 'vpnEnabled',
};

describe('generateAndroidFiles', () => {
  it('derives the tile package from the applicationId', () => {
    expect(tilePackageName('com.acme.app')).toBe('com.acme.app.tiles');
  });

  it('emits one Kotlin file per control under the package path', () => {
    const { files } = generateAndroidFiles({
      controls: [button, toggle],
      bundleId: 'com.acme.app',
      urlScheme: 'acme',
    });
    expect(files.map((f) => f.path)).toEqual([
      'com/acme/app/tiles/QuickNoteTileService.kt',
      'com/acme/app/tiles/VpnToggleTileService.kt',
    ]);
  });

  it('button tile: opens app via deep link on click', () => {
    const { files } = generateAndroidFiles({
      controls: [button],
      bundleId: 'com.acme.app',
      urlScheme: 'acme',
    });
    const kt = files[0]!.content;
    expect(kt).toContain('class QuickNoteTileService : TileService()');
    expect(kt).toContain('ControlStore.enqueueAction(this, "quickNote", "acme://control/quickNote")');
    expect(kt).toContain('startActivityAndCollapse');
    // 토글 전용 코드는 없어야 함
    expect(kt).not.toContain('Tile.STATE_ACTIVE');
  });

  it('toggle tile: STATE_ACTIVE/INACTIVE based on shared state', () => {
    const { files } = generateAndroidFiles({
      controls: [toggle],
      bundleId: 'com.acme.app',
      urlScheme: 'acme',
    });
    const kt = files[0]!.content;
    expect(kt).toContain('class VpnToggleTileService : TileService()');
    expect(kt).toContain('Tile.STATE_ACTIVE');
    expect(kt).toContain('ControlStore.getBool(this, "vpnEnabled")');
    expect(kt).toContain('ControlStore.enqueueStateChange(this, "vpnEnabled", next)');
  });

  it('manifest services declare the QS_TILE filter + permission', () => {
    const { manifestServices } = generateAndroidFiles({
      controls: [button],
      bundleId: 'com.acme.app',
      urlScheme: 'acme',
    });
    expect(manifestServices).toContain('android:name=".tiles.QuickNoteTileService"');
    expect(manifestServices).toContain('android:permission="android.permission.BIND_QUICK_SETTINGS_TILE"');
    expect(manifestServices).toContain('android.service.quicksettings.action.QS_TILE');
  });
});

describe('generated Kotlin (snapshots for review)', () => {
  it('button TileService', () => {
    const { files } = generateAndroidFiles({
      controls: [{ id: 'openPlace', type: 'button', title: 'Open Place', icon: 'mappin' }],
      bundleId: 'com.acme.app',
      urlScheme: 'acme',
    });
    expect(files[0]!.content).toMatchInlineSnapshot(`
"package com.acme.app.tiles

import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import com.rncontrolcenter.ControlStore

// ─────────────────────────────────────────────────────────────────────────
//  📄  OpenPlaceTileService.kt
//  Quick Settings 타일 — iOS의 OpenPlaceControl 에 대응 (Android)
//  ⚠️ 자동 생성됨 — 직접 수정 금지. prebuild / \`rn-control-center generate\` 때 덮어써짐.
//
//  ControlStore(앱↔타일 공유 저장소 + 이벤트 큐)는 라이브러리 런타임에서 제공. (A2)
// ─────────────────────────────────────────────────────────────────────────

// 버튼 타일 — 클릭 시 액션을 큐에 넣고 앱을 연다 (iOS ControlWidgetButton 대응)
class OpenPlaceTileService : TileService() {

    override fun onClick() {
        super.onClick()

        // ① App↔타일 공유 큐에 이벤트 기록 (앱이 drain → JS onAction)
        ControlStore.enqueueAction(this, "openPlace", "acme://control/openPlace")

        // ② 앱 열기 (딥링크)
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("acme://control/openPlace")).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        if (Build.VERSION.SDK_INT >= 34) {
            // API 34+ 는 PendingIntent를 요구
            val pending = PendingIntent.getActivity(
                this, 0, intent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            startActivityAndCollapse(pending)
        } else {
            @Suppress("DEPRECATION")
            startActivityAndCollapse(intent)
        }
    }
}
"
`);
  });

  it('toggle TileService', () => {
    const { files } = generateAndroidFiles({
      controls: [
        { id: 'vpn', type: 'toggle', title: 'VPN', icons: { on: 'lock.fill', off: 'lock.open' }, stateKey: 'vpnEnabled' },
      ],
      bundleId: 'com.acme.app',
      urlScheme: 'acme',
    });
    expect(files[0]!.content).toMatchInlineSnapshot(`
"package com.acme.app.tiles

import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import com.rncontrolcenter.ControlStore

// ─────────────────────────────────────────────────────────────────────────
//  📄  VpnTileService.kt
//  Quick Settings 타일 — iOS의 VpnControl 에 대응 (Android)
//  ⚠️ 자동 생성됨 — 직접 수정 금지. prebuild / \`rn-control-center generate\` 때 덮어써짐.
//
//  ControlStore(앱↔타일 공유 저장소 + 이벤트 큐)는 라이브러리 런타임에서 제공. (A2)
// ─────────────────────────────────────────────────────────────────────────

// 토글 타일 — 켜짐/꺼짐 상태를 가진다 (iOS ControlWidgetToggle 대응)
class VpnTileService : TileService() {

    override fun onStartListening() {
        super.onStartListening()
        updateTile()
    }

    override fun onClick() {
        super.onClick()
        val next = !ControlStore.getBool(this, "vpnEnabled")
        ControlStore.setBool(this, "vpnEnabled", next)
        ControlStore.enqueueStateChange(this, "vpnEnabled", next)
        updateTile()
    }

    private fun updateTile() {
        val tile = qsTile ?: return
        tile.state = if (ControlStore.getBool(this, "vpnEnabled")) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
        tile.label = "VPN"
        tile.updateTile()
    }
}
"
`);
  });
});
