'use strict';
/**
 * 一键跑全部测试：node tests/run.js
 *   node tests/run.js features   # 只跑功能用例
 *   node tests/run.js smoke      # 只跑主线流程
 */
const { boot } = require('./harness');

const only = process.argv[2];
let pass = 0, fail = 0;
const failures = [];

function ok(name) {
  pass++;
  console.log('  \x1b[32m✓\x1b[0m ' + name);
}
function bad(name, err) {
  fail++;
  failures.push({ name, err });
  console.log('  \x1b[31m✗\x1b[0m ' + name);
  console.log('      ' + String(err && err.message || err).split('\n')[0]);
}

async function main() {
  if (!only || only === 'features') {
    console.log('\n功能用例');
    const { cases } = require('./features');
    for (const c of cases) {
      try {
        c.fn(boot());
        ok(c.name);
      } catch (e) {
        bad(c.name, e);
      }
    }
  }

  if (!only || only === 'smoke') {
    console.log('\n主线流程');
    try {
      const { run } = require('./smoke');
      const log = await run();
      ok(log.join(' → '));
    } catch (e) {
      bad('主线流程', e);
    }
  }

  console.log('\n' + (fail === 0
    ? '\x1b[32m全部通过\x1b[0m  ' + pass + ' 项'
    : '\x1b[31m失败 ' + fail + ' 项\x1b[0m，通过 ' + pass + ' 项'));

  if (fail) {
    console.log('\n失败详情：');
    for (const f of failures) {
      console.log('- ' + f.name + ': ' + (f.err && f.err.stack || f.err));
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
