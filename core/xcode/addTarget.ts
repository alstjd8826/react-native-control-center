import type { PBXProject, PBXNativeTarget } from 'xcode';
import './types';

export interface AddTargetOptions {
  /** 타겟 이름. 예: "ControlCenterExtension" → 빌드되면 ControlCenterExtension.appex */
  name: string;
  /** 위젯의 bundle id. 관례상 메인 앱 id 뒤에 부속 단어 붙임. */
  bundleId: string;
}

export interface AddTargetResult {
  uuid: string;
  target: PBXNativeTarget;
}

/**
 * 빈 사용자 Xcode 프로젝트에 Widget Extension 타겟을 1개 추가한다.
 *
 * 내부적으로 xcode 패키지의 addTarget()을 호출.
 * targetType="app_extension"을 주면 패키지가 알아서 productType을
 * "com.apple.product-type.app-extension"으로 매핑해줌.
 *
 * 주의: 이 함수는 타겟 노드만 만든다.
 *   - Frameworks 링크 → Day 3
 *   - Source 멤버십 → Day 4
 *   - 메인 앱에 임베드 → Day 5
 */
export function addWidgetExtensionTarget(
  project: PBXProject,
  options: AddTargetOptions
): AddTargetResult {
  const { name, bundleId } = options;

  const result = project.addTarget(
    name,           // 타겟 이름
    'app_extension', // → "com.apple.product-type.app-extension" 자동 매핑
    name,           // subfolder (=name으로 통일)
    bundleId        // 위젯 bundle id
  );

  // xcode 패키지의 addTarget()은 새 타겟에 빈 buildPhases 배열만 만들어준다.
  // Sources / Frameworks / Resources 페이즈는 우리가 직접 만들어 줘야
  // 나중에 framework이나 source 파일을 등록할 곳이 생긴다.
  project.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', result.uuid);
  project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', result.uuid);
  project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', result.uuid);

  return {
    uuid: result.uuid,
    target: result.pbxNativeTarget,
  };
}
