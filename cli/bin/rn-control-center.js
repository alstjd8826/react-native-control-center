#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-var-requires */

const path = require('path');

let runGenerate;
try {
  // production: 빌드된 lib에서 로드
  ({ runGenerate } = require(path.join(__dirname, '..', '..', 'lib', 'commonjs', 'cli', 'runGenerate')));
} catch {
  // 로컬 개발: TS 직접 실행
  require('ts-node/register');
  ({ runGenerate } = require(path.join(__dirname, '..', 'runGenerate')));
}

const command = process.argv[2];

if (!command || command === 'help' || command === '--help') {
  console.log(
    [
      'Usage: rn-control-center <command>',
      '',
      'Commands:',
      '  generate    Generate widget extension files into ios/ and modify pbxproj',
      '',
      'Reads configuration from your project package.json:',
      '  {',
      '    "rnControlCenter": {',
      '      "controls": "./src/controls.ts",',
      '      "urlScheme": "myapp"',
      '    }',
      '  }',
    ].join('\n')
  );
  process.exit(0);
}

if (command === 'generate') {
  try {
    const result = runGenerate();
    console.log(`✓ Wrote ${result.filesWritten.length} files`);
    console.log(`✓ Updated ${result.pbxprojPath}`);
    console.log('  Widget target:  ' + result.widgetTargetUuid);
    console.log('  Main app target:' + result.mainAppTargetUuid);
  } catch (err) {
    console.error(err.message ?? err);
    process.exit(1);
  }
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(2);
}
