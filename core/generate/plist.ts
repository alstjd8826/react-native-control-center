import plist, { type PlistValue } from 'plist';

export interface GeneratePlistOptions {
  /** Widget Extension의 bundle ID. 디스플레이 이름 보정에 쓰임. */
  extensionBundleName?: string;
  /** SDK 호환을 위한 추가 키. 사용자 커스텀 가능. */
  extra?: Record<string, unknown>;
}

/**
 * Widget Extension용 Info.plist 문자열 생성.
 *
 * NSExtensionPointIdentifier = com.apple.widgetkit-extension 이 핵심.
 * iOS가 이 값을 보고 ControlWidget으로 인식.
 */
export function generateExtensionInfoPlist(opts: GeneratePlistOptions = {}): string {
  // GENERATE_INFOPLIST_FILE=NO 일 때 Xcode가 표준 키를 자동 채워주지 않으므로
  // AppIntentsSSU 같은 후속 빌드 도구가 요구하는 최소 키들을 우리가 직접 넣어준다.
  const root: Record<string, unknown> = {
    CFBundleDevelopmentRegion: '$(DEVELOPMENT_LANGUAGE)',
    CFBundleExecutable: '$(EXECUTABLE_NAME)',
    CFBundleIdentifier: '$(PRODUCT_BUNDLE_IDENTIFIER)',
    CFBundleInfoDictionaryVersion: '6.0',
    CFBundleName: '$(PRODUCT_NAME)',
    CFBundlePackageType: '$(PRODUCT_BUNDLE_PACKAGE_TYPE)',
    CFBundleShortVersionString: '1.0',
    CFBundleVersion: '1',
    NSExtension: {
      NSExtensionPointIdentifier: 'com.apple.widgetkit-extension',
    },
  };

  if (opts.extensionBundleName) {
    root.CFBundleDisplayName = opts.extensionBundleName;
  }

  if (opts.extra) {
    Object.assign(root, opts.extra);
  }

  return plist.build(root as unknown as PlistValue, { indent: '  ' });
}
