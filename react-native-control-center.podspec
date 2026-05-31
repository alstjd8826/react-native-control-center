require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name         = 'react-native-control-center'
  s.version      = package['version']
  s.summary      = package['description']
  s.description  = package['description']
  s.homepage     = 'https://github.com/alstjd8826/react-native-control-center'
  s.license      = 'MIT'
  s.authors      = package['author']

  # 메인 앱이 동작할 최소 iOS 버전.
  # Control Center 위젯 자체는 iOS 18+ 에서만 보이지만, Native Module의 iOS 18
  # API(ControlCenter.reloadAllControls)는 #available로 가드되어 있어 더 낮은
  # 타겟에서도 안전하게 빌드/로드된다. RN 0.81 / Expo SDK 54 기본값(15.1)에 맞춤.
  # (iOS 17 이하에선 위젯이 안 보일 뿐, 라이브러리 import는 에러 없이 동작)
  s.platforms    = { :ios => '15.1' }

  s.source       = {
    :git => 'https://github.com/alstjd8826/react-native-control-center.git',
    :tag => "v#{s.version}"
  }

  # 라이브러리의 모든 Swift/ObjC 소스를 빌드에 포함.
  # 사용자 앱의 Pods 프로젝트가 이 파일들을 컴파일하게 됨.
  s.source_files = 'ios/**/*.{swift,h,m,mm}'
  s.requires_arc = true
  s.swift_version = '5.0'

  # React-Core 의존성 — RCTEventEmitter, RCTBridgeModule, Promise 블록 타입 등을 제공.
  # 이 줄이 없으면 .swift의 `import React`가 못 풀리고,
  # .mm의 `#import <React/RCTBridgeModule.h>`가 헤더 못 찾음.
  s.dependency 'React-Core'
end
