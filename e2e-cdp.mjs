/**
 * 无依赖的 Edge CDP 交互验收脚本。
 * 前提：Edge 已以 --remote-debugging-port=9223 打开本地预览页。
 * 用法：node scripts/e2e-cdp.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DEBUG_PORT = process.env.DEBUG_PORT || '9223';
const APP_URL_PART = '127.0.0.1:4173';
const DOCS_DIR = join(process.cwd(), 'docs');
mkdirSync(DOCS_DIR, { recursive: true });

const targets = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`).then((r) => r.json());
const target = targets.find((item) => item.type === 'page' && item.url.includes(APP_URL_PART));
if (!target) throw new Error('未找到本地预览页面 target');

const ws = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
const errors = [];
const logs = [];
let seq = 0;

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const handler = pending.get(message.id);
    if (handler) {
      pending.delete(message.id);
      handler(message);
    }
    return;
  }
  if (message.method === 'Runtime.exceptionThrown') {
    errors.push(message.params.exceptionDetails?.text || 'unknown exception');
  }
  if (message.method === 'Runtime.consoleAPICalled') {
    const text = message.params.args?.map((arg) => arg.value ?? arg.description).join(' ');
    logs.push(`${message.params.type}: ${text}`);
    if (message.params.type === 'error') errors.push(text || 'console.error');
  }
};

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, (message) => {
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'evaluate failed');
  }
  return result.result?.value;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (expression, timeout = 5000) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return true;
    await sleep(100);
  }
  return false;
};

await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 1600,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});
await send('Page.reload', { ignoreCache: true });
await sleep(1800);

async function capture(name) {
  await sleep(2300);
  const result = await send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const targetPath = join(DOCS_DIR, name);
  writeFileSync(targetPath, Buffer.from(result.data, 'base64'));
  console.log(`  ↳ screenshot: ${targetPath}`);
}

const checks = [];
const check = (name, ok, details = '') => {
  checks.push({ name, ok: Boolean(ok), details });
  console.log(`${ok ? '✓' : '✗'} ${name}${details ? ` — ${details}` : ''}`);
};

const loaded = await waitFor(`document.querySelector('#loader')?.classList.contains('is-done')`, 10000);
check('页面加载并退出 loading', loaded);
await sleep(1000);

const initial = await evaluate(`({
  mode: document.querySelector('#app').dataset.mode,
  phase: document.querySelector('#phaseName').textContent.trim(),
  f: document.querySelector('#formulaF').textContent.trim(),
  dataCount: document.querySelectorAll('#dataGrid .data-item').length,
  moleculeCanvas: !!document.querySelector('#moleculeCanvas')
})`);
check('初始为单组分', initial.mode === 'single', JSON.stringify(initial));
check('初始相位为液相', initial.phase === '液相');
check('初始自由度 F=2', initial.f === '2');
check('数据面板实时渲染', initial.dataCount >= 6, `${initial.dataCount} rows`);
await capture('preview-single.png');

await evaluate(`document.querySelector('.mode-btn[data-mode="binary"]').click()`);
await sleep(900);
const binary = await evaluate(`({
  mode: document.querySelector('#app').dataset.mode,
  phase: document.querySelector('#phaseName').textContent.trim(),
  f: document.querySelector('#formulaF').textContent.trim(),
  data: document.querySelector('#dataGrid').innerText,
  presets: document.querySelectorAll('#presetGrid .preset-btn').length
})`);
check('切换到双组分', binary.mode === 'binary');
check('双组分两相状态', binary.phase.includes('两相'), binary.phase);
check('双组分两相 F=2', binary.f === '2');
check('双组分预设已生成', binary.presets >= 6, `${binary.presets} presets`);
await capture('preview-binary.png');

await evaluate(`document.querySelector('[data-preset-id="azeotrope"]')?.click()`);
await sleep(700);
const azeo = await evaluate(`({
  phase: document.querySelector('#phaseName').textContent.trim(),
  f: document.querySelector('#formulaF').textContent.trim(),
  chip: document.querySelector('#phaseRuleChip').textContent.trim(),
  data: document.querySelector('#dataGrid').innerText,
  active: document.querySelector('[data-preset-id="azeotrope"]')?.classList.contains('is-active')
})`);
check('共沸点预设可应用', azeo.phase === '共沸点', azeo.phase);
check('共沸点 F=2 / f*=0', azeo.f === '2' && azeo.chip.includes('f = 0'), azeo.chip);
check('共沸点 x = y', azeo.data.includes('0.8950'), azeo.data.split('\n').slice(0, 8).join(' | '));
check('预设选中态', azeo.active === true);

await evaluate(`document.querySelector('#tabKnowledge').click()`);
await sleep(250);
const knowledge = await evaluate(`({
  visible: !document.querySelector('#knowledgeView').classList.contains('is-hidden'),
  dataHidden: document.querySelector('#dataView').classList.contains('is-hidden'),
  cards: document.querySelectorAll('#knowledgeList .knowledge-item').length,
  text: document.querySelector('#knowledgeView').innerText.slice(0, 80)
})`);
check('知识讲解标签切换', knowledge.visible && knowledge.dataHidden);
check('知识卡片渲染', knowledge.cards >= 2, `${knowledge.cards} cards: ${knowledge.text}`);
await capture('preview-knowledge.png');

await evaluate(`document.querySelector('#tabData').click()`);
await evaluate(`document.querySelector('#playBtn').click()`);
await sleep(1300);
const playing = await evaluate(`({
  playing: document.querySelector('#playBtn').classList.contains('is-playing'),
  label: document.querySelector('#playLabel').textContent.trim(),
  progress: document.querySelector('#progressBar').style.width
})`);
check('自动演示启动', playing.playing && playing.label === '暂停演示', JSON.stringify(playing));
await evaluate(`document.querySelector('#playBtn').click()`);
await sleep(200);
const paused = await evaluate(`({
  playing: document.querySelector('#playBtn').classList.contains('is-playing'),
  label: document.querySelector('#playLabel').textContent.trim()
})`);
check('自动演示暂停', !paused.playing && paused.label === '自动演示');

await evaluate(`document.querySelector('.mode-btn[data-mode="single"]').click()`);
await sleep(800);
await evaluate(`document.querySelector('[data-preset-id="triple"]').click()`);
await sleep(600);
const triple = await evaluate(`({
  phase: document.querySelector('#phaseName').textContent.trim(),
  f: document.querySelector('#formulaF').textContent.trim(),
  chip: document.querySelector('#phaseRuleChip').textContent.trim(),
  temperature: document.querySelector('#singleTempValue').textContent.trim(),
  data: document.querySelector('#dataGrid').innerText.slice(0, 120)
})`);
check('三相点预设', triple.phase === '三相点', triple.phase);
check('三相点 F=0', triple.f === '0' && triple.chip.includes('F = 0'), triple.chip);
check('三相点温度正确', triple.temperature.includes('273.16'), triple.temperature);

await evaluate(`(() => {
  const el = document.querySelector('#singleTemp');
  el.value = '650';
  el.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
await sleep(400);
const hot = await evaluate(`({
  phase: document.querySelector('#phaseName').textContent.trim(),
  f: document.querySelector('#formulaF').textContent.trim(),
  temp: document.querySelector('#singleTempValue').textContent.trim()
})`);
check('温度滑杆实时联动', hot.temp.startsWith('650.00'), JSON.stringify(hot));

await evaluate(`document.querySelector('#tabKnowledge').click()`);
await sleep(200);
const singleKnowledge = await evaluate(`document.querySelectorAll('#knowledgeList .knowledge-item').length`);
check('单组分知识卡片', singleKnowledge >= 2, `${singleKnowledge} cards`);

await evaluate(`document.querySelector('#resetBtn').click()`);
await sleep(500);
const reset = await evaluate(`({
  phase: document.querySelector('#phaseName').textContent.trim(),
  temp: document.querySelector('#singleTempValue').textContent.trim(),
  f: document.querySelector('#formulaF').textContent.trim()
})`);
check('一键重置', reset.phase === '液相' && reset.temp.startsWith('298.15'), JSON.stringify(reset));

await evaluate(`document.querySelector('.mode-btn[data-mode="binary"]').click()`);
await sleep(700);
await evaluate(`(() => {
  const select = document.querySelector('#systemSelect');
  select.value = 'bi-cd';
  select.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
await sleep(900);
const biCd = await evaluate(`({
  mode: document.querySelector('#app').dataset.mode,
  heading: document.querySelector('#sceneHeading h2').textContent.trim(),
  hint: document.querySelector('#binaryModeHint').textContent.trim(),
  phase: document.querySelector('#phaseName').textContent.trim(),
  f: document.querySelector('#formulaF').textContent.trim(),
  chip: document.querySelector('#phaseRuleChip').textContent.trim(),
  pressureHidden: document.querySelector('#binaryPressGroup').classList.contains('is-hidden'),
  fixedPressure: !document.querySelector('#eutecticPressureInfo').classList.contains('is-hidden'),
  leverVisible: !document.querySelector('#leverMini').classList.contains('is-hidden'),
  leverState: document.querySelector('#leverState').textContent.trim(),
  leverA: document.querySelector('#leverValueA').textContent.trim(),
  leverB: document.querySelector('#leverValueB').textContent.trim(),
  data: document.querySelector('#dataGrid').innerText
})`);
check('切换到 Bi–Cd 低共熔', biCd.mode === 'binary' && biCd.heading.includes('低共熔'), biCd.heading);
check('双组分标签切换为 T–x', biCd.hint === 'T–x', biCd.hint);
check('Bi–Cd 默认 L + Cd(s)', biCd.phase === 'L + Cd(s)', biCd.phase);
check('L + Cd(s) 两相 F=2 / f=1', biCd.f === '2' && biCd.chip.includes('f = 1'), biCd.chip);
check('低共熔常压切片', biCd.pressureHidden && biCd.fixedPressure);
check('杠杆规则卡显示', biCd.leverVisible && biCd.leverState === 'L + Cd(s)', `${biCd.leverA} / ${biCd.leverB}`);
check('杠杆数值与组成一致', biCd.data.includes('0.3000') && biCd.data.includes('Cd(s)'), biCd.data.slice(0, 100));
await evaluate(`document.querySelector('#tabData').click()`);
await capture('preview-bi-cd.png');

await evaluate(`document.querySelector('[data-preset-id="eutectic"]').click()`);
await sleep(700);
const eutectic = await evaluate(`({
  phase: document.querySelector('#phaseName').textContent.trim(),
  f: document.querySelector('#formulaF').textContent.trim(),
  chip: document.querySelector('#phaseRuleChip').textContent.trim(),
  leverState: document.querySelector('#leverState').textContent.trim(),
  data: document.querySelector('#dataGrid').innerText,
  footnote: document.querySelector('#dataFootnote').innerText,
  temp: document.querySelector('#binaryTempValue').textContent.trim()
})`);
check('低共熔点预设', eutectic.phase === '低共熔三相', eutectic.phase);
check('低共熔三相 F=1 / f=0', eutectic.f === '1' && eutectic.chip.includes('f = 0'), eutectic.chip);
check('低共熔温度 144 °C', eutectic.temp.startsWith('144.00'), eutectic.temp);
check(
  '低共熔相分数说明',
  eutectic.leverState === '三相共存' && eutectic.footnote.includes('低共熔点'),
  `${eutectic.leverState} · ${eutectic.footnote}`,
);
await evaluate(`document.querySelector('#tabKnowledge').click()`);
await capture('preview-bi-cd-eutectic.png');

await evaluate(`document.querySelector('[data-preset-id="solid"]').click()`);
await sleep(600);
const solidMix = await evaluate(`({
  phase: document.querySelector('#phaseName').textContent.trim(),
  f: document.querySelector('#formulaF').textContent.trim(),
  leverA: document.querySelector('#leverValueA').textContent.trim(),
  leverB: document.querySelector('#leverValueB').textContent.trim()
})`);
check('Bi + Cd 固相混合物', solidMix.phase === 'Bi(s) + Cd(s)', solidMix.phase);
check('固相混合物 F=2', solidMix.f === '2');
check('固相杠杆 50 / 50', solidMix.leverA.startsWith('50.0') && solidMix.leverB.startsWith('50.0'), `${solidMix.leverA} / ${solidMix.leverB}`);

await evaluate(`document.querySelector('[data-preset-id="liquid"]').click()`);
await sleep(500);
const biLiquid = await evaluate(`({
  phase: document.querySelector('#phaseName').textContent.trim(),
  f: document.querySelector('#formulaF').textContent.trim()
})`);
check('Bi–Cd 全液相 F=3', biLiquid.phase === '液相 L' && biLiquid.f === '3', `${biLiquid.phase} F=${biLiquid.f}`);

await evaluate(`document.querySelector('#tabKnowledge').click()`);
await sleep(250);
const biKnowledge = await evaluate(`document.querySelector('#knowledgeList').innerText`);
check('Bi–Cd 知识讲解', biKnowledge.includes('低共熔') || biKnowledge.includes('液相线'), biKnowledge.slice(0, 90));

check('无未捕获异常', errors.length === 0, errors.join(' | ').slice(0, 220));
if (logs.length) console.log('\nConsole:', logs.slice(-10).join('\n'));

const failed = checks.filter((item) => !item.ok);
console.log(`\nE2E: ${checks.length - failed.length}/${checks.length} checks passed`);
try {
  await Promise.race([send('Browser.close'), sleep(500)]);
} catch {
  // Browser.close 不可用时保持页面打开即可。
}
ws.close();
if (failed.length) process.exitCode = 1;
