'use strict';
/**
 * 测试底座：用 DOM / Canvas 桩件把 shenzhen-gta-3d.html 里的脚本跑起来，
 * 提供「按帧推进」「按键」「鼠标」等操作接口。
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_GAME = path.join(ROOT, 'shenzhen-gta-3d.html');

const noop = () => {};

function makeCtx2d() {
  const grad = { addColorStop: noop };
  const base = {
    measureText: () => ({ width: 40 }),
    createLinearGradient: () => grad,
    createRadialGradient: () => grad
  };
  return new Proxy(base, {
    get(o, k) { return k in o ? o[k] : noop; },
    set(o, k, v) { o[k] = v; return true; }
  });
}

function makeEl(id) {
  const el = {
    id,
    style: {},
    width: 1600,
    height: 900,
    textContent: '',
    innerHTML: '',
    _h: {},
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); }
    },
    addEventListener(t, fn) { el._h[t] = fn; },
    appendChild() {},
    removeChild() {},
    getContext: () => makeCtx2d(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1600, height: 900 })
  };
  return el;
}

function boot(file, seed) {
  const src = fs.readFileSync(file || DEFAULT_GAME, 'utf8');
  const m = src.match(/<script>([\s\S]*)<\/script>/);
  if (!m) throw new Error('找不到 <script> 块');
  const source = m[1];

  // 固定随机数，让每次运行的场景完全一致
  let s = (seed === undefined ? 20261122 : seed) >>> 0;
  const rand = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const M = Object.create(Math);
  M.random = rand;

  const els = {};
  const handlers = {};
  let raf = null;
  let clock = 0;

  const sandbox = {
    console, Math: M, Date, JSON, setTimeout, clearTimeout, isNaN, parseFloat, parseInt,
    document: {
      getElementById(id) { return els[id] || (els[id] = makeEl(id)); },
      createElement() { return makeEl('tmp'); },
      addEventListener: noop,
      body: { style: {} }
    },
    window: null,
    devicePixelRatio: 1
  };

  sandbox.requestAnimationFrame = (cb) => { raf = cb; return 1; };
  sandbox.window = {
    innerWidth: 1600,
    innerHeight: 900,
    devicePixelRatio: 1,
    addEventListener(t, fn) { handlers[t] = fn; },
    removeEventListener: noop,
    requestAnimationFrame: sandbox.requestAnimationFrame
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  const ctx = vm.createContext(sandbox);
  vm.runInContext(source, ctx, { filename: 'game.js' });

  const ev = (code) => vm.runInContext(code, ctx);
  const run = (code, label) => {
    try {
      return vm.runInContext('(function(){' + code + '})()', ctx);
    } catch (e) {
      throw new Error((label ? '[' + label + '] ' : '') + e.message);
    }
  };

  function step(n) {
    for (let i = 0; i < n; i++) {
      const cb = raf;
      raf = null;
      if (!cb) throw new Error('渲染循环意外停止');
      clock += 16;
      cb(clock);
    }
  }

  function key(k, down) {
    const h = handlers[down ? 'keydown' : 'keyup'];
    if (!h) throw new Error('没有键盘监听');
    h({ key: k, preventDefault: noop });
  }

  const press = (k) => { key(k, true); key(k, false); };

  function move(x, y) { handlers.mousemove({ clientX: x, clientY: y }); }
  function down() { handlers.mousedown({ button: 0 }); }
  function up() { handlers.mouseup({ button: 0 }); }

  function start() {
    step(30);
    els.startBtn._h.click();
    step(30);
  }

  return { ev, run, step, key, press, move, down, up, handlers, els, start, get time() { return clock; } };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function assert(cond, msg) {
  if (!cond) throw new Error(msg || '断言失败');
}

module.exports = { boot, sleep, assert, ROOT, DEFAULT_GAME };
