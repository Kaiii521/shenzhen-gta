'use strict';
/**
 * 主线流程：开局 → 驾驶 → 射击 → 通缉 → 四章任务 → 死亡复活 → 被捕 → 压测。
 * 需要真实定时器（任务间隔 / 复活等待），所以是异步的。
 */
const { boot, assert, sleep } = require('./harness');

async function run() {
  const g = boot();
  const log = [];

  g.start();
  log.push('开局');

  // --- 上车 ---
  g.run(`
    const near = V.find(v => v.kind === 'parked' && v.type === 'car');
    near.x = 6 * CELL; near.y = 4 * CELL; near.angle = 0;
    P.x = near.x; P.y = near.y;
  `);
  g.press('e');
  g.step(4);
  assert(g.ev('!!P.car'), '上车失败');

  g.key('w', true);
  let maxSp = 0;
  for (let i = 0; i < 70; i++) {
    g.step(1);
    maxSp = Math.max(maxSp, g.ev('P.car ? P.car.speed : 0'));
  }
  assert(maxSp > 140, '加速异常，最高速度 ' + Math.round(maxSp));
  g.key('a', true); g.step(30); g.key('a', false);
  g.key('w', false);
  log.push('驾驶');

  // --- 射击：真的打出子弹 ---
  g.press('e');
  g.step(3);
  g.run('P.weapon = 2; P.cool = 0; bullets.length = 0;');
  g.down();
  g.step(6);
  g.up();
  assert(g.ev('bullets.length') > 0, '开枪没有子弹');
  log.push('射击');

  // --- 通缉：开车撞人 ---
  g.run(`
    const v = V.find(x => x.kind === 'parked' && x.type === 'car');
    v.x = 6 * CELL; v.y = 4 * CELL; v.angle = 0;
    P.x = v.x; P.y = v.y;
  `);
  g.step(2);
  g.press('e');
  g.step(3);
  assert(g.ev('!!P.car'), '撞人测试没上车');
  g.run(`
    // 清空前方车流，避免堵车干扰
    for (const v of V) {
      if (v.kind === 'traffic' && Math.hypot(v.x - P.car.x, v.y - P.car.y) < 500) {
        v.x += 4000;
      }
    }
    const p = peds.find(x => !x.dead);
    p.x = P.car.x + 90; p.y = P.car.y;
    window.__p2 = p;
    P.car.speed = 280;
  `);
  g.key('w', true);
  g.step(60);
  g.key('w', false);
  assert(g.ev('P.wanted') > 0, '撞人没有通缉');
  log.push('通缉');

  // --- 警察 ---
  g.run('P.wanted = 3; P.wantedCool = 0;');
  g.step(240);
  assert(g.ev('cops.length') > 0, '警察没来');
  log.push('通缉 / 警察');

  // --- 四章任务 ---
  g.run('P.wanted = 0; P.wantedCool = 0; while (cops.length) removeV(cops.pop());');
  const money0 = g.ev('P.money');
  let guard = 0, done = false;
  while (guard++ < 90 && !done) {
    const info = g.ev('({active:M.active, idx:M.idx, step:M.step, type:M.active?((MISSIONS[M.idx].steps[M.step]||{}).type||"none"):"idle"})');
    if (!info.active && info.idx === 3 && info.step >= 3) { done = true; break; }
    if (info.type === 'idle' || info.type === 'none') { await sleep(400); g.step(40); continue; }
    if (info.type === 'survive') { g.run('M.timer = 0.02'); g.step(6); }
    else if (info.type === 'goto') { g.run('const st = MISSIONS[M.idx].steps[M.step]; P.x = st.p.x; P.y = st.p.y; if (P.car) { P.car.x = st.p.x; P.car.y = st.p.y; } P.hp = 100;'); g.step(6); }
    else if (info.type === 'steal') { g.run('const v = M.targetCar; P.x = v.x; P.y = v.y; P.car = v; v.kind = "player";'); g.step(6); }
    await sleep(120);
    g.step(20);
  }
  assert(done, '任务链没跑完');
  assert(g.ev('P.money') - money0 === 13200, '奖励总额不对：' + (g.ev('P.money') - money0));
  log.push('四章任务');

  // --- 死亡复活 ---
  g.run('hurtPlayer(500)');
  assert(g.ev('P.down'), '没有倒下');
  await sleep(2700);
  g.step(60);
  assert(!g.ev('P.down') && g.ev('P.hp') > 0, '复活失败');
  log.push('死亡复活');

  // --- 被捕 ---
  g.run('busted()');
  await sleep(2700);
  g.step(60);
  assert(!g.ev('P.down'), '被捕后没恢复');
  log.push('被捕');

  // --- 压测 ---
  g.key('w', true); g.key('d', true);
  g.step(900);
  g.key('w', false); g.key('d', false);
  g.step(400);
  assert(g.ev('gameTime') > 20, '时间没推进');
  assert(g.ev('V.length') < 200 && g.ev('peds.length') < 200, '实体泄漏');
  log.push('压测');

  return log;
}

module.exports = { run };
