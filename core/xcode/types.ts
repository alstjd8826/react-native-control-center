/**
 * xcode npm 패키지(@3.0.1)는 자체 타입 선언을 제공하지 않으므로
 * 우리가 사용하는 표면만 최소한으로 모델링.
 *
 * 패키지의 실제 모양은 lib/pbxProject.js (1700+ 줄) 참조.
 */

declare module 'xcode' {
  export interface PBXObject {
    isa: string;
    [key: string]: unknown;
  }

  export interface PBXNativeTarget extends PBXObject {
    isa: 'PBXNativeTarget';
    name: string;
    productName: string;
    productType: string;
    productReference?: string;
    buildPhases: Array<{ value: string; comment?: string }>;
    buildConfigurationList: string;
    dependencies: Array<{ value: string; comment?: string }>;
  }

  export interface PBXFileReference extends PBXObject {
    isa: 'PBXFileReference';
    name?: string;
    path?: string;
    sourceTree: string;
    lastKnownFileType?: string;
    explicitFileType?: string;
    fileEncoding?: number;
    includeInIndex?: number | string;
  }

  export interface PBXBuildFile extends PBXObject {
    isa: 'PBXBuildFile';
    fileRef: string;
    settings?: { ATTRIBUTES?: string[] };
  }

  export interface PBXGroup extends PBXObject {
    isa: 'PBXGroup';
    children: Array<{ value: string; comment?: string }>;
    name?: string;
    path?: string;
    sourceTree: string;
  }

  export interface PBXBuildPhase extends PBXObject {
    isa:
      | 'PBXFrameworksBuildPhase'
      | 'PBXSourcesBuildPhase'
      | 'PBXResourcesBuildPhase'
      | 'PBXCopyFilesBuildPhase'
      | 'PBXShellScriptBuildPhase';
    files: Array<{ value: string; comment?: string }>;
    buildActionMask: number;
    runOnlyForDeploymentPostprocessing: number;
    name?: string;
    dstPath?: string;
    dstSubfolderSpec?: number;
  }

  export interface PBXProjectInternals {
    objects: Record<string, Record<string, PBXObject | string>>;
    rootObject: string;
  }

  export interface PBXProjectHash {
    project: PBXProjectInternals;
    headComment?: string;
  }

  export interface PBXProject {
    filepath: string;
    hash: PBXProjectHash;
    parse(callback: (err: Error | null) => void): void;
    parseSync(): void;
    writeSync(): string;

    getFirstProject(): { uuid: string; firstProject: PBXObject };
    getFirstTarget(): { uuid: string; firstTarget: PBXNativeTarget };
    getTarget(productType: string): { uuid: string; target: PBXNativeTarget } | null;
    pbxNativeTargetSection(): Record<string, PBXNativeTarget | string>;
    pbxFileReferenceSection(): Record<string, PBXFileReference | string>;
    pbxBuildFileSection(): Record<string, PBXBuildFile | string>;
    pbxFrameworksBuildPhaseObj(targetUuid: string): PBXBuildPhase;
    pbxSourcesBuildPhaseObj(targetUuid: string): PBXBuildPhase;
    pbxCopyfilesBuildPhaseObj(targetUuid: string): PBXBuildPhase | undefined;
    pbxGroupByName(name: string): PBXGroup | undefined;
    pbxTargetByName(name: string): PBXNativeTarget | undefined;

    addTarget(
      name: string,
      type: string,
      subfolder?: string,
      bundleId?: string
    ): { uuid: string; pbxNativeTarget: PBXNativeTarget };
    addBuildPhase(
      filePathsArray: string[],
      buildPhaseType: string,
      comment: string,
      target: string,
      optionsOrFolderType?: object | string,
      subfolderPath?: string
    ): { uuid: string; buildPhase: PBXBuildPhase };
    addFramework(
      filepath: string,
      opt?: { target?: string; weak?: boolean }
    ): unknown;
    addToPbxBuildFileSection(file: unknown): void;
    addToPbxFileReferenceSection(file: unknown): void;
    addPbxGroup(
      filePathsArray: string[],
      name: string,
      path: string,
      sourceTree?: string
    ): { uuid: string; pbxGroup: PBXGroup };
  }

  export function project(filepath: string): PBXProject;
}
