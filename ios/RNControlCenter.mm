// ─────────────────────────────────────────────────────────────────────────
//  📄  RNControlCenter.mm
//  Objective-C 브릿지 — Swift로 작성한 RNControlCenter 클래스를
//  React Native의 Legacy Bridge에 "Native Module"로 등록한다.
//
//  .swift 파일이 클래스를 ObjC 런타임에 "노출"한다면,
//  이 파일은 그것을 RN 브릿지에 "신청"하는 서류 역할.
// ─────────────────────────────────────────────────────────────────────────

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

// 클래스 등록 — Swift의 @objc(RNControlCenter)와 이름이 일치해야 함.
// 두 번째 인자 RCTEventEmitter는 부모 클래스를 RN에게 알려주는 정보.
@interface RCT_EXTERN_MODULE(RNControlCenter, RCTEventEmitter)

// 메서드 등록 — Swift 쪽 @objc func 시그니처와 1:1 매칭.

RCT_EXTERN_METHOD(getState:(NSString *)key
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(setState:(NSString *)key
                     value:(BOOL)value
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
