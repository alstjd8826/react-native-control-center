// Expo가 plugins 배열에서 패키지 이름만 봤을 때 이 파일을 찾도록.
// 빌드된 lib/ 결과물이 있으면 거길 보고, 없으면 src를 ts-node 처리.
const path = require('path');

let plugin;
try {
  plugin = require(path.join(__dirname, 'lib', 'commonjs', 'plugin')).default;
} catch {
  // 로컬 개발 (라이브러리 빌드 전) — TS 직접 실행
  require('ts-node/register');
  plugin = require(path.join(__dirname, 'plugin', 'index')).default;
}

module.exports = plugin;
