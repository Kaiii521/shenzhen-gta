'use strict';
/**
 * 功能用例：每个用例拿一份全新的游戏实例，互不污染。
 */
const { boot, assert } = require('./harness');

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

/* ---------------- 世界 ---------------- */
test('地图结构：117 街区 / 14 地标 / 机场 9 块', (g) => {
  g.start();
  assert(g.ev('blocks.length') === 117, '街区数不对');
  assert(g.ev('LANDMARKS.length') === 15, '地标数不对');
  assert(g.ev('blocks.filter(b=>b.kind==="airfield").length') === 9, '机场地块数不对');
  assert(g.ev('blocks.filter(b=>b.kind==="airfield").reduce((a,b)=>a+b.buildings.filter(x=>x.term).length,0)') > 5, '航站楼没生成');
});

test('机场默认有 2 架战斗机 + 1 客机 + 2 直升机', (g) => {
  g.start();
  assert(g.ev('V.filter(v=>v.type==="jet").length') >= 2, '战斗机数量不足');
  assert(g.ev('V.filter(v=>v.type==="plane").length') >= 1, '客机缺失');
  assert(g.ev('V.filter(v=>v.type==="heli").length') >= 2, '直升机数量不足');
});

test('飞机被摧毁后会自动刷新回来', (g) => {
  g.start();
  const before = g.ev('V.filter(v=>v.air).length');
  g.run('const j = V.find(v=>v.type==="jet"); if (j) removeV(j);');
  g.step(420); // ~6.7 秒
  assert(g.ev('V.filter(v=>v.air).length') >= before, '没有补回来');
  assert(g.ev('V.filter(v=>v.type==="jet").length') >= 1, '战斗机没补回来');
});

/* ---------------- 车辆 ---------------- */
test('车辆可以倒车退出死角', (g) => {
  g.start();
  g.run('const v = V.find(x=>x.kind==="parked" && x.type==="car"); v.x = 6*CELL; v.y = 4*CELL; P.x=v.x+20; P.y=v.y;');
  g.step(3);
  g.press('e');
  g.step(3);
  assert(g.ev('!!P.car'), '没上车');
  g.key('s', true);
  g.step(40);
  g.key('s', false);
  assert(g.ev('P.car.speed') < -60, '倒车速度起不来：' + g.ev('P.car.speed'));
});

test('抢车提示 / 上车 / 行驶中抢车会拽下司机', (g) => {
  g.start();
  g.run('const v = V.find(x=>x.kind==="parked"); P.x=v.x+30; P.y=v.y;');
  g.step(4);
  assert(g.ev('!!nearVehicle'), '没有高亮目标');
  g.press('e');
  g.step(4);
  assert(g.ev('!!P.car && P.car.kind === "player"'), '上车失败');

  g.press('e');
  g.step(4);
  const pedBefore = g.ev('peds.length');
  const wantedBefore = g.ev('P.wanted');
  g.run('const t = V.find(x=>x.kind==="traffic"); t.speed = 200; P.x = t.x; P.y = t.y; window.__t = t;');
  g.step(1);
  g.press('e');
  g.step(4);
  assert(g.ev('P.car === window.__t'), '没抢到行驶中的车');
  assert(g.ev('peds.length') > pedBefore, '司机没有被拽下来');
  assert(g.ev('P.wanted') > wantedBefore, '抢车没有加通缉');
});

/* ---------------- 飞行 ---------------- */
test('直升机可以爬升 / 客机与战斗机可飞', (g) => {
  g.start();
  g.run('const h = V.find(v=>v.type==="heli"); P.x = h.x + 24; P.y = h.y;');
  g.step(4);
  g.press('e');
  g.step(4);
  assert(g.ev('!!(P.car && P.car.air)'), '没上直升机');
  g.key(' ', true);
  g.step(80);
  g.key(' ', false);
  assert(g.ev('P.car.alt') > 100, '没能爬升：' + g.ev('P.car.alt'));
});

test('战斗机发射导弹不会炸在自己身上', (g) => {
  g.start();
  g.run('const j = V.find(v=>v.type==="jet"); P.x = j.x + 24; P.y = j.y;');
  g.step(4);
  g.press('e');
  g.step(4);
  g.run('P.car.alt = 400; P.car.speed = 300; P.airWeapon = 1; P.cool = 0; missiles.length = 0;');
  g.run('aimPoint3D = () => ({ x: P.car.x + 600, y: P.car.y + 100, h: 0 });');
  g.down(); g.step(2); g.up();
  assert(g.ev('missiles.length') === 1, '导弹没发射');
  g.step(10);
  assert(g.ev('missiles.length') === 1 && g.ev('blasts.length') === 0, '导弹发射瞬间就炸了');
  assert(g.ev('!!P.car'), '玩家被自己的导弹炸离飞机');
  g.step(80);
  assert(g.ev('missiles.length') === 0 && g.ev('blasts.length') >= 1, '导弹没有落到地面爆炸');
});

test('直升机也能切到导弹', (g) => {
  g.start();
  g.run('const h = V.find(v=>v.type==="heli"); P.x = h.x + 24; P.y = h.y;');
  g.step(4);
  g.press('e');
  g.step(4);
  g.run('P.car.alt = 200; P.cool = 0; missiles.length = 0;');
  g.key('Tab', true);
  g.step(2);
  assert(g.ev('wheelSlots.length') === 2, '轮盘没有两个机炮选项');
  g.run('wheelSel = 1; drawWheel();');
  g.key('Tab', false);
  g.step(2);
  assert(g.ev('P.airWeapon') === 1, '没切到导弹');
  g.down(); g.step(2); g.up();
  assert(g.ev('missiles.length') === 1, '直升机导弹没发出来');
});

/* ---------------- 武器 ---------------- */
test('武器轮盘：按住 Tab 选择，松开生效', (g) => {
  g.start();
  assert(g.ev('WEAPONS.length') === 5, '武器数量不对');
  g.move(682, 612); // 指向第 4 格（冲锋枪）
  g.key('Tab', true);
  g.step(2);
  assert(g.ev('wheelOpen'), '轮盘没打开');
  assert(g.ev('wheelSlots.length') === 5, '轮盘槽位不对');
  const sel = g.ev('wheelSel');
  assert(sel === 3, '没有选中冲锋枪：' + sel);
  g.key('Tab', false);
  g.step(2);
  assert(!g.ev('wheelOpen'), '轮盘没关闭');
  assert(g.ev('P.weapon') === sel, '松开后没有切换武器');
});

test('近战可以击杀并掉钱，捡起来加钱', (g) => {
  g.start();
  g.run('P.x = 6*CELL; P.y = 4*CELL; P.weapon = 1; P.cool = 0; P.angle = 0; pickups.length = 0;');
  g.run('const p = peds.find(x=>!x.dead); p.x = P.x + 38; p.y = P.y; window.__p = p;');
  g.run('aimPoint3D = () => ({ x: window.__p.x, y: window.__p.y, h: 0 });');
  g.step(3);
  g.down(); g.step(8); g.up();
  assert(g.ev('window.__p.dead'), '砍刀没砍中');
  g.run('P.x = pickups[0].x; P.y = pickups[0].y;');
  const money = g.ev('P.money');
  g.step(6);
  assert(g.ev('P.money') > money, '捡钱没加钱');
});

/* ---------------- 抓钩 ---------------- */
test('抓钩挂楼 → 钟摆 → 松手保留速度', (g) => {
  g.start();
  g.run('const b = blocks.find(x=>x.buildings.some(u=>u.lv>=6)); const bu = b.buildings.find(u=>u.lv>=6); window.__bu = bu; P.x = bu.x - 200; P.y = bu.y + bu.h / 2;');
  g.step(3);
  g.run('aimPoint3D = () => ({ x: window.__bu.x + 10, y: window.__bu.y + window.__bu.h / 2, h: 0 });');
  g.press('g');
  g.step(2);
  assert(g.ev('G.active'), '没挂上');
  assert(g.ev('G.kind') === 'build', '目标类型不对');
  let maxAlt = 0, minAlt = 9999;
  for (let i = 0; i < 12; i++) {
    g.step(8);
    const a = g.ev('P.alt');
    maxAlt = Math.max(maxAlt, a);
    minAlt = Math.min(minAlt, a);
  }
  assert(g.ev('G.active'), '中途自己取消了');
  assert(maxAlt - minAlt > 8, '没有摆荡（高度几乎不变）');
  const sp = Math.hypot(g.ev('P.vx'), g.ev('P.vy'));
  g.press('g');
  g.step(2);
  assert(!g.ev('G.active'), '松手失败');
  assert(Math.hypot(g.ev('P.vx'), g.ev('P.vy')) > sp * 0.5, '松手后速度丢了');
});

test('抓钩抓人：把人拽过来', (g) => {
  g.start();
  g.run('P.x = 6*CELL; P.y = 4*CELL; P.alt = 0;');
  g.run('const p = peds.find(x=>!x.dead); p.x = P.x + 120; p.y = P.y; window.__p = p;');
  g.step(2);
  g.run('aimPoint3D = () => ({ x: window.__p.x, y: window.__p.y, h: 0 });');
  g.press('g');
  g.step(2);
  assert(g.ev('G.kind') === 'ped', '没抓到人');
  g.step(40);
  assert(g.ev('window.__p.dead'), '人没被抓住');
});

/* ---------------- 环境互动 ---------------- */
test('冲击波能推开街道道具', (g) => {
  g.start();
  assert(g.ev('PROPS.length') > 300, '道具太少');
  g.run('const p = PROPS.find(q => Math.hypot(q.x - P.x, q.y - P.y) < 500) || PROPS[0]; window.__p = p; P.x = p.x - 70; P.y = p.y; P.weapon = 4; P.cool = 0;');
  g.step(3);
  g.run('aimPoint3D = () => ({ x: window.__p.x, y: window.__p.y, h: 0 });');
  g.down(); g.step(2); g.up();
  assert(g.ev('shocks.length') === 1, '冲击波没打出来');
  g.step(24);
  assert(g.ev('Math.hypot(window.__p.vx, window.__p.vy)') > 20, '道具没被推动');
});

test('手刹会留下轮胎印', (g) => {
  g.start();
  g.run('const v = V.find(x=>x.kind==="parked"); P.x = v.x + 20; P.y = v.y;');
  g.step(3);
  g.press('e');
  g.step(3);
  g.run('P.car.speed = 300; skids.length = 0;');
  g.key('w', true); g.key(' ', true);
  g.step(45);
  g.key('w', false); g.key(' ', false);
  assert(g.ev('skids.length') > 5, '没有胎痕');
});

test('摩托车：能骑，转向比轿车灵活', (g) => {
  g.start();
  assert(g.ev('V.filter(v=>v.type==="moto").length') > 0, '街上没有摩托车');
  g.run('const m = V.find(v=>v.type==="moto"); m.x = 6*CELL; m.y = 4*CELL; P.x = m.x; P.y = m.y;');
  g.step(2);
  g.press('e');
  g.step(3);
  assert(g.ev('!!(P.car && P.car.type === "moto")'), '骑不上摩托');
  assert(g.ev('HANDLING.moto.turn') > g.ev('HANDLING.car.turn'), '摩托转向不够灵活');
});

test('坡道：冲上去会腾空，平稳落地不扣血', (g) => {
  g.start();
  assert(g.ev('RAMPS.length') >= 3, '坡道太少');
  g.run(`
    const m = V.find(v => v.type === 'moto');
    const r = RAMPS[0];
    m.x = r.x; m.y = r.y; m.angle = r.a;
    P.x = m.x; P.y = m.y;
    tryEnterExit();
  `);
  g.step(3);
  assert(g.ev('!!P.car'), '没骑上车');
  g.run('P.car.speed = 520; P.hp = 100; P.car.hp = 100;');
  g.key('w', true);
  let maxAlt = 0, maxVh = -1;
  for (let i = 0; i < 40; i++) {
    g.step(1);
    maxAlt = Math.max(maxAlt, g.ev('P.car ? P.car.alt : 0'));
    maxVh = Math.max(maxVh, g.ev('P.car ? P.car.vh : -1'));
  }
  g.key('w', false);
  assert(maxAlt > 60, '没有腾空，最高 ' + Math.round(maxAlt));
  assert(maxVh > 100, '没有向上的初速度，' + Math.round(maxVh));

  // 轻落地：完全不掉血
  g.run('P.car.speed = 0; P.car.alt = 40; P.car.vh = 0; P.hp = 100; P.car.hp = 100;');
  for (let i = 0; i < 80; i++) g.step(1);
  assert(g.ev('P.hp') === 100, '平稳落地却掉了血');
  assert(g.ev('P.car.hp') === 100, '平稳落地车却掉了血');
});

test('车流里有骑手（摩托车驾驶员）', (g) => {
  g.start();
  const riders = g.ev('V.filter(v=>v.kind==="traffic" && v.type==="moto").length');
  assert(riders > 0, '车流里没有骑摩托的');
});

test('AI 车会为行人急刹，人走开后再起步', (g) => {
  g.start();
  g.run(`
    const car = V.find(v => v.kind === 'traffic' && v.type === 'car');
    car.speed = 150;
    window.__car = car;
    const p = peds.find(x => !x.dead);
    const ca = Math.cos(car.angle), sa = Math.sin(car.angle);
    p.x = car.x + ca * 70; p.y = car.y + sa * 70;
    window.__ped = p;
  `);
  g.step(24);
  assert(g.ev('window.__car.speed') < 20, '没有为行人刹车：' + Math.round(g.ev('window.__car.speed')));
  g.run('for (const p of peds) { p.x = -900; p.y = -900; }');
  g.run('const ca2 = Math.cos(window.__car.angle), sa2 = Math.sin(window.__car.angle); P.x = window.__car.x - ca2 * 400; P.y = window.__car.y - sa2 * 400;');
  let best = 0;
  for (let i = 0; i < 120; i++) { g.step(1); best = Math.max(best, g.ev('window.__car.speed')); }
  assert(best > 60, '行人走开后没有重新起步，最高 ' + Math.round(best));
});

test('AI 车也会被坡道抛起来', (g) => {
  g.start();
  g.run(`
    const car = V.find(v => v.kind === 'traffic' && v.type !== 'moto');
    const r = RAMPS[0];
    car.x = r.x + 40; car.y = r.y; car.angle = r.a; car.speed = 160;
    window.__c2 = car;
  `);
  g.step(8);
  assert(g.ev('window.__c2.alt || 0') > 8, '车流没有被坡道抬起');
});

test('红绿灯：红灯停、绿灯走', (g) => {
  g.start();
  g.run(`
    gameTime = 10;   // 东西向红灯
    const car = V.find(v => v.kind === 'traffic' && v.type === 'car');
    const ni = Math.round(car.ti), nj = Math.round(car.tj);
    car.x = ni * CELL - 200; car.y = nj * CELL; car.angle = 0; car.speed = 180;
    window.__car = car;
  `);
  g.step(30);
  assert(g.ev('lightIsRed("EW")'), '相位不对');
  assert(g.ev('window.__car.speed') < 30, '红灯没停：' + Math.round(g.ev('window.__car.speed')));
  g.run('gameTime = 3;');   // 东西向绿灯
  g.step(45);
  assert(g.ev('window.__car.speed') > 40, '绿灯没走：' + Math.round(g.ev('window.__car.speed')));
});

test('下车后空车自动靠边', (g) => {
  g.start();
  g.run(`
    const v = V.find(x => x.kind === 'parked' && x.type === 'car');
    v.x = 6 * CELL; v.y = 4 * CELL; v.angle = 0; v.parkT = null;
    P.x = v.x; P.y = v.y;
    window.__v = v;
  `);
  g.step(2);
  g.press('e');
  g.step(3);
  assert(g.ev('!!P.car'), '没上车');
  g.press('e');
  g.step(3);
  assert(g.ev('!!window.__v.parkT'), '没有生成靠边目标');
  const y0 = g.ev('window.__v.y');
  g.step(80);
  assert(Math.abs(g.ev('window.__v.y') - y0) > 40, '空车没有靠边移动');
});

module.exports = { cases };
