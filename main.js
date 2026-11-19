import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './styles.css';
import {
  WATER,
  BINARY_SYSTEMS,
  waterPhaseAt,
  waterSaturationPressure,
  waterSaturationTemperature,
  waterSublimationPressure,
  formatPressure,
  azeotrope as findAzeotrope,
  bubbleAtComposition,
  dewAtComposition,
  binaryPurePoints,
  binaryStateAt,
} from './science.js';
import {
  BI_CD,
  EUTECTIC_DOMAIN,
  biCdStateAt,
  weightPercentBi,
} from './eutectic.js';
import { SinglePhaseScene } from './three/singleScene.js';
import { BinaryScene } from './three/binaryScene.js';
import { EutecticScene } from './three/eutecticScene.js';
import { MoleculeStage } from './three/molecules.js';
import { easeInOutCubic } from './three/labels.js';
import { getKnowledgeCards } from './knowledge.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const ALL_SYSTEMS = { ...BINARY_SYSTEMS, [BI_CD.id]: BI_CD };
const isEutectic = (system = getSystem()) => system?.kind === 'eutectic';

const dom = {
  app: $('#app'),
  stage: $('#stage'),
  canvas: $('#scene'),
  moleculeCanvas: $('#moleculeCanvas'),
  moleculeCard: $('#moleculeCard'),
  moleculePhase: $('#moleculePhase'),
  moleculeCaption: $('#moleculeCaption'),
  moleculeSpeed: $('#moleculeSpeed'),
  sceneHeading: $('#sceneHeading'),
  sceneLegend: $('#sceneLegend'),
  binaryModeHint: $('#binaryModeHint'),
  singleSystem: $('#singleSystem'),
  binarySystemWrap: $('#binarySystemWrap'),
  systemSelect: $('#systemSelect'),
  singleControls: $('#singleControls'),
  binaryControls: $('#binaryControls'),
  singleTemp: $('#singleTemp'),
  singleTempValue: $('#singleTempValue'),
  singleTempSub: $('#singleTempSub'),
  singlePress: $('#singlePress'),
  singlePressValue: $('#singlePressValue'),
  singlePressSub: $('#singlePressSub'),
  binaryTemp: $('#binaryTemp'),
  binaryTempValue: $('#binaryTempValue'),
  binaryTempMin: $('#binaryTempMin'),
  binaryTempMax: $('#binaryTempMax'),
  binaryTempSub: $('#binaryTempSub'),
  binaryPress: $('#binaryPress'),
  binaryPressValue: $('#binaryPressValue'),
  binaryPressSub: $('#binaryPressSub'),
  binaryPressGroup: $('#binaryPressGroup'),
  eutecticPressureInfo: $('#eutecticPressureInfo'),
  binaryComp: $('#binaryComp'),
  binaryCompValue: $('#binaryCompValue'),
  binaryCompSub: $('#binaryCompSub'),
  binaryCompLabel: $('#binaryCompLabel'),
  presetGrid: $('#presetGrid'),
  labelsToggle: $('#labelsToggle'),
  rotateToggle: $('#rotateToggle'),
  moleculeToggle: $('#moleculeToggle'),
  phaseHero: $('#phaseHero'),
  phaseEn: $('#phaseEn'),
  phaseName: $('#phaseName'),
  phaseSwatch: $('#phaseSwatch'),
  phaseInterpretation: $('#phaseInterpretation'),
  phaseRuleChip: $('#phaseRuleChip'),
  leverMini: $('#leverMini'),
  leverState: $('#leverState'),
  leverBar: $('#leverBar'),
  leverPartA: $('#leverPartA'),
  leverPartB: $('#leverPartB'),
  leverNameA: $('#leverNameA'),
  leverNameB: $('#leverNameB'),
  leverValueA: $('#leverValueA'),
  leverValueB: $('#leverValueB'),
  leverFormula: $('#leverFormula'),
  formulaC: $('#formulaC'),
  formulaP: $('#formulaP'),
  formulaF: $('#formulaF'),
  formulaNote: $('#formulaNote'),
  dataGrid: $('#dataGrid'),
  dataFootnote: $('#dataFootnote'),
  freedomVisual: $('#freedomVisual'),
  freedomHint: $('#freedomHint'),
  knowledgeList: $('#knowledgeList'),
  rightScroll: $('.right-scroll'),
  tabData: $('#tabData'),
  tabKnowledge: $('#tabKnowledge'),
  dataView: $('#dataView'),
  knowledgeView: $('#knowledgeView'),
  playBtn: $('#playBtn'),
  playIcon: $('#playIcon'),
  playLabel: $('#playLabel'),
  resetBtn: $('#resetBtn'),
  progressBar: $('#progressBar'),
  transportStatus: $('#transportStatus'),
  helpBtn: $('#helpBtn'),
  helpDialog: $('#helpDialog'),
  helpClose: $('#helpClose'),
  fullscreenBtn: $('#fullscreenBtn'),
  tooltip: $('#tooltip'),
  toast: $('#toast'),
  toastText: $('#toastText'),
  loader: $('#loader'),
  fpsMeter: $('#fpsMeter'),
};

const store = {
  mode: 'single',
  systemId: 'ethanol-water',
  single: {
    T: 298.15,
    logP: Math.log10(101325),
  },
  binary: {
    P: 1,
    z: 0.3,
    T: 90,
  },
  playing: false,
  demoElapsed: 0,
  labels: true,
  rotate: false,
  molecule: true,
  activePresetId: null,
};

const DEFAULT_SINGLE = { T: 298.15, logP: Math.log10(101325) };
const DEFAULT_BINARY = { P: 1, z: 0.3 };

// 支持可分享的初始状态：?mode=binary&system=ethanol-water
{
  const params = new URLSearchParams(window.location.search);
  const initialMode = params.get('mode');
  if (initialMode === 'binary' || initialMode === 'single') store.mode = initialMode;
  const initialSystem = params.get('system');
  if (initialSystem && ALL_SYSTEMS[initialSystem]) store.systemId = initialSystem;
}

let renderer;
let scene;
let camera;
let controls;
let singleScene;
let binaryScene;
let eutecticScene;
let moleculeStage;
let raycaster;
let cameraTween = null;
let currentState = null;
let lastState = null;
let lastMode = null;
let lastUiAt = 0;
let elapsed = 0;
let lastFrameAt = performance.now();
let fpsFrames = 0;
let fpsElapsed = 0;
let toastTimer = 0;
let pressureRaf = 0;
let pendingPressure = null;
let hoveredPick = null;
let pointerDownAt = null;

function showFatal(message) {
  if (!dom.loader) return;
  const copy = dom.loader.querySelector('.loader-copy span');
  if (copy) copy.textContent = message;
  const bar = dom.loader.querySelector('.loader-bar');
  if (bar) bar.style.display = 'none';
}

function init() {
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: dom.canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
  } catch (error) {
    console.error(error);
    showFatal('当前浏览器或显卡不支持 WebGL2 / WebGL，无法渲染三维相图。');
    return;
  }

  const initialWidth = dom.canvas.clientWidth || dom.stage.clientWidth;
  const initialHeight = dom.canvas.clientHeight || dom.stage.clientHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.setSize(initialWidth, initialHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.setClearColor(0x000000, 0);

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x04080e, 0.014);

  camera = new THREE.PerspectiveCamera(40, initialWidth / Math.max(1, initialHeight), 0.1, 100);
  camera.position.set(13.5, 10.5, 19);

  controls = new OrbitControls(camera, dom.canvas);
  controls.target.set(0, 3.25, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.rotateSpeed = 0.72;
  controls.zoomSpeed = 0.85;
  controls.panSpeed = 0.65;
  controls.minDistance = 8.2;
  controls.maxDistance = 32;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.autoRotateSpeed = 0.7;
  controls.update();

  scene.add(new THREE.HemisphereLight(0x9fe8ff, 0x02050a, 1.45));
  const key = new THREE.DirectionalLight(0xd6f8ff, 2.1);
  key.position.set(8, 13, 10);
  scene.add(key);
  const rim = new THREE.PointLight(0x22d3ee, 34, 38, 2);
  rim.position.set(-9, 5.5, -5);
  scene.add(rim);
  const warm = new THREE.PointLight(0xf59e0b, 20, 30, 2);
  warm.position.set(8, 2.4, 7);
  scene.add(warm);
  const fill = new THREE.PointLight(0x8b7bff, 14, 30, 2);
  fill.position.set(2, 4, -9);
  scene.add(fill);

  addDust();

  singleScene = new SinglePhaseScene(scene);
  binaryScene = new BinaryScene(scene, BINARY_SYSTEMS['ethanol-water'], store.binary.P);
  binaryScene.setVisible(false);
  eutecticScene = new EutecticScene(scene);
  eutecticScene.setVisible(false);

  try {
    moleculeStage = new MoleculeStage(dom.moleculeCanvas);
    moleculeStage.setPhase('liquid', 298.15);
  } catch (error) {
    console.error('molecule stage unavailable', error);
    dom.moleculeCard.classList.add('is-hidden');
    dom.moleculeToggle.checked = false;
    store.molecule = false;
  }

  raycaster = new THREE.Raycaster();
  setupUi();
  setMode(store.mode, true);
  syncAllUi();
  updateUi(true);

  const initialParams = new URLSearchParams(window.location.search);
  const initialPreset = initialParams.get('preset');
  if (initialPreset) {
    const button = dom.presetGrid.querySelector(`[data-preset-id="${initialPreset}"]`);
    if (button) button.click();
  }
  if (initialParams.get('tab') === 'knowledge') setRightTab('knowledge');
  if (initialParams.get('play') === '1') startPlayback();

  requestAnimationFrame(animate);
  window.setTimeout(() => dom.loader.classList.add('is-done'), 820);
}

function addDust() {
  const count = 220;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 32;
    positions[i * 3 + 1] = Math.random() * 15 - 1;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 24;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0x4cb7ca,
    size: 0.032,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const dust = new THREE.Points(geometry, material);
  dust.name = 'ambient-dust';
  scene.add(dust);
}

function setupUi() {
  $$('.mode-btn').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.mode !== store.mode) setMode(button.dataset.mode);
    });
  });

  dom.singleTemp.addEventListener('input', () => {
    stopPlayback('手动模式');
    store.single.T = parseFloat(dom.singleTemp.value);
    setActivePreset(null);
    updateUi(true);
  });

  dom.singlePress.addEventListener('input', () => {
    stopPlayback('手动模式');
    store.single.logP = parseFloat(dom.singlePress.value);
    setActivePreset(null);
    updateUi(true);
  });

  dom.binaryTemp.addEventListener('input', () => {
    stopPlayback('手动模式');
    store.binary.T = parseFloat(dom.binaryTemp.value);
    setActivePreset(null);
    updateUi(true);
  });

  dom.binaryPress.addEventListener('input', () => {
    stopPlayback('手动模式');
    store.binary.P = parseFloat(dom.binaryPress.value);
    setActivePreset(null);
    scheduleBinaryRebuild();
    updateUi(true);
  });

  dom.binaryComp.addEventListener('input', () => {
    stopPlayback('手动模式');
    store.binary.z = parseFloat(dom.binaryComp.value);
    setActivePreset(null);
    updateUi(true);
  });

  dom.systemSelect.addEventListener('change', () => {
    stopPlayback('手动模式');
    store.systemId = dom.systemSelect.value;
    store.binary.P = 1;
    store.binary.z = 0.3;
    const system = getSystem();
    const eutectic = isEutectic(system);
    dom.binaryPressGroup.classList.toggle('is-hidden', eutectic);
    dom.eutecticPressureInfo.classList.toggle('is-hidden', !eutectic);
    dom.binaryCompLabel.innerHTML = eutectic ? '组成 <em>x(Bi)</em>' : '总组成 <em>z</em>';
    binaryScene.setVisible(!eutectic);
    eutecticScene.setVisible(eutectic);
    (eutectic ? eutecticScene : binaryScene).setLabelsVisible(store.labels);
    if (!eutectic) binaryScene.setContext(system, store.binary.P);
    store.binary.T = getBinaryDefaultTemperature();
    syncBinaryDomain();
    setActivePreset(null);
    updateSceneHeading();
    setCameraView('iso');
    buildPresets();
    renderLegend();
    updateUi(true);
  });

  dom.labelsToggle.addEventListener('change', () => {
    store.labels = dom.labelsToggle.checked;
    getActiveScene().setLabelsVisible(store.labels);
  });

  dom.rotateToggle.addEventListener('change', () => {
    store.rotate = dom.rotateToggle.checked;
    controls.autoRotate = store.rotate;
  });

  dom.moleculeToggle.addEventListener('change', () => {
    store.molecule = dom.moleculeToggle.checked;
    dom.moleculeCard.classList.toggle('is-hidden', !store.molecule);
    if (moleculeStage) {
      moleculeStage.setVisible(store.molecule);
      if (store.molecule) moleculeStage.resize();
    }
  });

  dom.tabData.addEventListener('click', () => setRightTab('data'));
  dom.tabKnowledge.addEventListener('click', () => setRightTab('knowledge'));

  dom.playBtn.addEventListener('click', togglePlayback);
  dom.resetBtn.addEventListener('click', resetCurrent);

  $$('.transport-views button').forEach((button) => {
    button.addEventListener('click', () => setCameraView(button.dataset.view));
  });

  dom.helpBtn.addEventListener('click', () => {
    if (typeof dom.helpDialog.showModal === 'function') dom.helpDialog.showModal();
    else dom.helpDialog.setAttribute('open', '');
  });
  dom.helpClose.addEventListener('click', () => dom.helpDialog.close());
  dom.helpDialog.addEventListener('click', (event) => {
    if (event.target === dom.helpDialog) dom.helpDialog.close();
  });

  dom.fullscreenBtn.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (error) {
      console.warn(error);
    }
  });

  dom.canvas.addEventListener('pointermove', handlePointerMove);
  dom.canvas.addEventListener('pointerleave', hideTooltip);
  dom.canvas.addEventListener('pointerdown', (event) => {
    pointerDownAt = { x: event.clientX, y: event.clientY };
  });
  dom.canvas.addEventListener('pointerup', handlePointerUp);
  dom.canvas.addEventListener('dblclick', () => setCameraView('iso'));

  controls.addEventListener('start', () => {
    cameraTween = null;
    hideTooltip();
  });

  window.addEventListener('resize', resize);
  if (window.ResizeObserver) {
    const observer = new ResizeObserver(() => resize());
    observer.observe(dom.stage);
  }

  window.addEventListener('keydown', (event) => {
    const tag = event.target?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || dom.helpDialog.open) return;
    if (event.code === 'Space') {
      event.preventDefault();
      togglePlayback();
    } else if (event.key.toLowerCase() === 'r') {
      resetCurrent();
    } else if (event.key === '1') {
      setMode('single');
    } else if (event.key === '2') {
      setMode('binary');
    }
  });

  dom.systemSelect.value = store.systemId;
  setRightTab('data');
  setSliderFill(dom.singleTemp);
  setSliderFill(dom.singlePress);
  setSliderFill(dom.binaryTemp);
  setSliderFill(dom.binaryPress);
  setSliderFill(dom.binaryComp);
}

function getSystem() {
  return ALL_SYSTEMS[store.systemId] || BINARY_SYSTEMS['ethanol-water'];
}

function getBinaryDefaultTemperature() {
  const system = getSystem();
  if (isEutectic(system)) return 180;
  if (system.id === 'benzene-toluene') return 95;
  return 90;
}

function getActiveScene() {
  if (store.mode === 'single') return singleScene;
  return isEutectic() ? eutecticScene : binaryScene;
}

function getCurrentState() {
  if (store.mode === 'single') {
    const P = Math.pow(10, store.single.logP);
    return {
      ...waterPhaseAt(store.single.T, P),
      mode: 'single',
      T: store.single.T,
      P,
      logP: store.single.logP,
      T_K: store.single.T,
    };
  }
  const system = getSystem();
  if (isEutectic(system)) {
    const state = biCdStateAt(store.binary.z, store.binary.T);
    return {
      ...state,
      mode: 'binary',
      system,
      P_atm: 1,
      P: 101325,
      T_K: state.T + 273.15,
      wtBi: weightPercentBi(state.x),
    };
  }
  const state = binaryStateAt(system, store.binary.P, store.binary.z, store.binary.T);
  return {
    ...state,
    mode: 'binary',
    system,
    T_K: state.T + 273.15,
    P: state.P_atm * 101325,
  };
}

function setMode(mode, instant = false) {
  if (!instant && mode === store.mode) return;
  stopPlayback('手动模式');
  hideTooltip();
  store.mode = mode;
  dom.app.dataset.mode = mode;
  lastState = null;
  lastMode = mode;

  $$('.mode-btn').forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });

  dom.singleControls.classList.toggle('is-hidden', mode !== 'single');
  dom.binaryControls.classList.toggle('is-hidden', mode !== 'binary');
  dom.singleSystem.classList.toggle('is-hidden', mode !== 'single');
  dom.binarySystemWrap.classList.toggle('is-hidden', mode !== 'binary');

  const system = getSystem();
  const eutectic = mode === 'binary' && isEutectic(system);
  singleScene.setVisible(mode === 'single');
  binaryScene.setVisible(mode === 'binary' && !eutectic);
  eutecticScene.setVisible(eutectic);
  (mode === 'single' ? singleScene : eutectic ? eutecticScene : binaryScene).setLabelsVisible(store.labels);

  dom.binaryPressGroup.classList.toggle('is-hidden', eutectic);
  dom.eutecticPressureInfo.classList.toggle('is-hidden', !eutectic);
  dom.binaryCompLabel.innerHTML = eutectic ? '组成 <em>x(Bi)</em>' : '总组成 <em>z</em>';

  if (mode === 'binary') {
    if (!eutectic) binaryScene.setContext(system, store.binary.P);
    if (eutectic && store.binary.T < EUTECTIC_DOMAIN.Tmin) {
      store.binary.T = getBinaryDefaultTemperature();
    }
    syncBinaryDomain();
    const domain = getBinaryDomain();
    if (store.binary.T < domain.Tmin || store.binary.T > domain.Tmax) {
      store.binary.T = getBinaryDefaultTemperature();
    }
  }

  updateSceneHeading();
  renderLegend();
  buildPresets();
  syncAllUi();
  setCameraView('iso', instant);
  updateUi(true);
}

function updateSceneHeading() {
  const kicker = dom.sceneHeading.querySelector('.scene-kicker');
  const title = dom.sceneHeading.querySelector('h2');
  const subtitle = dom.sceneHeading.querySelector('p');
  if (store.mode === 'single') {
    kicker.textContent = 'PHASE TOPOLOGY / 01';
    title.innerHTML = '单组分相图 <em>P–T</em>';
    subtitle.textContent = '水 · 固 / 液 / 气三相拓扑';
  } else if (isEutectic()) {
    kicker.textContent = 'PHASE TOPOLOGY / 02B';
    title.innerHTML = '双组分低共熔相图 <em>T–x</em>';
    subtitle.textContent = 'Bi–Cd · 简单低共熔 · 固液平衡';
  } else {
    kicker.textContent = 'PHASE TOPOLOGY / 02';
    title.innerHTML = '双组分汽液平衡 <em>T–x–y</em>';
    subtitle.textContent = `${getSystem().label} · ${getSystem().azeotropic ? '非理想共沸体系' : '理想体系'}`;
  }
  if (dom.binaryModeHint) {
    dom.binaryModeHint.textContent = isEutectic() ? 'T–x' : 'T–x–y';
  }
}

function renderLegend() {
  const items = [];
  if (store.mode === 'single') {
    items.push(
      ['固相', 'solid', 'swatch'],
      ['液相', 'liquid', 'swatch'],
      ['气相', 'gas', 'swatch'],
      ['超临界', 'supercritical', 'swatch'],
      ['共存边界', 'fusion', 'line'],
    );
  } else if (isEutectic()) {
    items.push(
      ['液相 L', 'liquid', 'swatch'],
      ['L + Cd(s)', 'cd', 'swatch'],
      ['L + Bi(s)', 'bi', 'swatch'],
      ['Bi + Cd 固相', 'mix', 'swatch'],
      ['低共熔线', 'eutectic', 'line'],
    );
  } else {
    items.push(
      ['液相', 'liquid', 'swatch'],
      ['气相', 'vapor', 'swatch'],
      ['两相区', 'tie', 'swatch'],
    );
    if (getSystem().azeotropic) items.push(['共沸点', 'azeotrope', 'swatch']);
    items.push(['结线', 'tie', 'line']);
  }
  const colors = {
    solid: '#7dd3fc',
    liquid: '#2dd4bf',
    gas: '#fbbf24',
    supercritical: '#c084fc',
    fusion: '#93c5fd',
    vapor: '#fbbf24',
    tie: '#f0abfc',
    azeotrope: '#f0abfc',
    cd: '#a78bfa',
    bi: '#fb923c',
    mix: '#a5b4fc',
    eutectic: '#f0abfc',
  };
  dom.sceneLegend.innerHTML = items
    .map(
      ([label, key, type]) =>
        `<span class="legend-item"><i class="${type === 'line' ? 'legend-line' : 'legend-swatch'}" style="--legend-color:${colors[key]}"></i>${label}</span>`,
    )
    .join('');
}

function setSliderFill(input) {
  const min = parseFloat(input.min);
  const max = parseFloat(input.max);
  const value = parseFloat(input.value);
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  input.style.setProperty('--fill', `${Math.max(0, Math.min(100, pct))}%`);
}

function syncSingleUi() {
  dom.singleTemp.value = store.single.T.toFixed(1);
  dom.singlePress.value = store.single.logP.toFixed(4);
  dom.singleTempValue.textContent = `${store.single.T.toFixed(2)} K`;
  dom.singleTempSub.textContent = `${(store.single.T - 273.15).toFixed(2)} °C`;
  const P = Math.pow(10, store.single.logP);
  dom.singlePressValue.textContent = formatPressure(P, 3);
  dom.singlePressSub.textContent = `lg P = ${store.single.logP.toFixed(3)}`;
  setSliderFill(dom.singleTemp);
  setSliderFill(dom.singlePress);
}

function getBinaryDomain() {
  if (isEutectic()) {
    return { Tmin: EUTECTIC_DOMAIN.Tmin, Tmax: EUTECTIC_DOMAIN.Tmax, P_atm: 1 };
  }
  return binaryScene.getDomain();
}

function syncBinaryDomain() {
  const domain = getBinaryDomain();
  dom.binaryTemp.min = String(domain.Tmin);
  dom.binaryTemp.max = String(domain.Tmax);
  dom.binaryTempMin.textContent = `${domain.Tmin} °C`;
  dom.binaryTempMax.textContent = `${domain.Tmax} °C`;
  if (store.binary.T < domain.Tmin) store.binary.T = domain.Tmin;
  if (store.binary.T > domain.Tmax) store.binary.T = domain.Tmax;
  syncBinaryUi();
}

function syncBinaryUi() {
  const system = getSystem();
  const eutectic = isEutectic(system);
  const T = store.binary.T;
  dom.binaryTemp.value = T.toFixed(2);
  dom.binaryTempValue.textContent = `${T.toFixed(2)} °C`;
  dom.binaryTempSub.textContent = `${(T + 273.15).toFixed(2)} K`;
  dom.binaryPress.value = store.binary.P.toFixed(3);
  dom.binaryPressValue.textContent = `${store.binary.P.toFixed(3)} atm`;
  dom.binaryPressSub.textContent = `${(store.binary.P * 101.325).toFixed(2)} kPa`;
  dom.binaryComp.value = store.binary.z.toFixed(3);
  dom.binaryCompValue.textContent = store.binary.z.toFixed(3);
  dom.binaryCompSub.textContent = eutectic
    ? `x(Bi) · ${weightPercentBi(store.binary.z).toFixed(1)} wt% Bi`
    : `z(${system.component1Short})`;
  dom.binaryPressGroup.classList.toggle('is-hidden', eutectic);
  dom.eutecticPressureInfo.classList.toggle('is-hidden', !eutectic);
  setSliderFill(dom.binaryTemp);
  setSliderFill(dom.binaryPress);
  setSliderFill(dom.binaryComp);
}

function syncAllUi() {
  syncSingleUi();
  syncBinaryUi();
}

function scheduleBinaryRebuild() {
  if (isEutectic()) return;
  pendingPressure = store.binary.P;
  if (pressureRaf) return;
  pressureRaf = requestAnimationFrame(() => {
    pressureRaf = 0;
    if (!pendingPressure) return;
    binaryScene.setContext(getSystem(), pendingPressure);
    syncBinaryDomain();
    pendingPressure = null;
    updateUi(true);
  });
}

function updateUi(force = false) {
  const now = performance.now();
  if (!force && now - lastUiAt < 45) return;
  lastUiAt = now;

  const state = getCurrentState();
  currentState = state;

  const phaseChanged =
    !lastState ||
    lastState.phaseKey !== state.phaseKey ||
    lastMode !== store.mode;
  const prevState = lastState;

  renderPhaseHero(state);
  renderFormula(state);
  renderData(state);
  renderFreedom(state);
  renderLever(state);

  if (phaseChanged) {
    renderKnowledge(state);
    renderMoleculeInfo(state);
    if (prevState && lastMode === store.mode && prevState.phaseKey !== state.phaseKey) {
      const message = phaseChangeMessage(prevState, state);
      if (message) {
        showToast(message, state.color);
        getActiveScene().triggerPulse();
      }
    }
  } else {
    renderMoleculeInfo(state);
  }

  lastState = state;
  lastMode = store.mode;
  syncAllUi();
}

function renderPhaseHero(state) {
  dom.phaseHero.style.setProperty('--phase-color', state.color);
  dom.moleculeCard.style.setProperty('--phase-color', state.color);
  dom.phaseEn.textContent = state.phaseEn;
  dom.phaseName.textContent = state.phase;
  dom.phaseSwatch.style.background = state.color;
  dom.phaseSwatch.style.boxShadow = `0 0 18px ${state.color}`;
  dom.phaseInterpretation.textContent = state.interpretation;
  const suffix =
    store.mode === 'binary' && state.phases >= 2 && Number.isFinite(state.fixedPF)
      ? ` · f = ${state.fixedPF}`
      : '';
  dom.phaseRuleChip.textContent = `F = ${state.F}${suffix}`;
}

function renderFormula(state) {
  const C = store.mode === 'single' ? 1 : 2;
  dom.formulaC.textContent = String(C);
  dom.formulaP.textContent = String(state.phases);
  dom.formulaF.textContent = String(state.F);

  if (store.mode === 'single') {
    if (state.F === 2) dom.formulaNote.textContent = '单相区：T 与 P 均可独立改变。';
    else if (state.F === 1) dom.formulaNote.textContent = '两相共存：T 与 P 沿相边界联动。';
    else dom.formulaNote.textContent = '三相共存：F = 0，没有可独立改变的强度性质。';
  } else if (isEutectic()) {
    if (state.phases === 3) {
      dom.formulaNote.textContent = '低共熔三相共存：F = 1；固定常压后 f = 0，温度与三相组成被锁定。';
    } else if (state.phases === 2) {
      dom.formulaNote.textContent = '两相区：固定常压后 f = 1；温度确定后，液相组成由液相线确定。';
    } else {
      dom.formulaNote.textContent = '单相区：固定常压后 f = 2，温度与总组成可独立改变。';
    }
  } else {
    const f = state.fixedPF;
    if (state.phaseKey === 'azeotrope') {
      dom.formulaNote.textContent = '共沸约束 x = y：固定 P 时该点无变量（f* = 0）；相律基准 F = 2。';
    } else if (f === 1) {
      dom.formulaNote.textContent = '固定总压切片：f = F − 1 = 1，T 一旦确定，两相组成即确定。';
    } else {
      dom.formulaNote.textContent = '固定总压切片：f = F − 1 = 2，T 与组成可独立改变。';
    }
  }
}

function renderData(state) {
  if (store.mode === 'single') {
    const pSat = waterSaturationPressure(state.T);
    const tSat = waterSaturationTemperature(state.P);
    const pSub = state.T < WATER.T_TRIPLE ? waterSublimationPressure(state.T) : null;
    const rows = [
      ['温度 T', `${state.T.toFixed(2)} K`, 'accent'],
      ['摄氏温度', `${(state.T - 273.15).toFixed(2)} °C`],
      ['压强 P', formatPressure(state.P, 3)],
      ['相态', state.phase, 'magenta'],
      ['自由度 F', String(state.F), state.F === 0 ? 'magenta' : 'accent'],
      ['饱和蒸气压', formatPressure(pSat, 3)],
      ['饱和温度', Number.isFinite(tSat) ? `${tSat.toFixed(2)} K` : '—'],
    ];
    if (pSub !== null) rows.push(['升华压强', formatPressure(pSub, 3)]);
    dom.dataGrid.innerHTML = rows
      .map(
        ([label, value, tone]) =>
          `<div class="data-item"><span>${label}</span><strong class="${tone || ''}">${value}</strong></div>`,
      )
      .join('');
    dom.dataFootnote.textContent =
      '相律基准 F = C − P + 2；曲线附近以窄共存带显示两相状态，仅影响交互标注。';
    return;
  }

  if (isEutectic()) {
    const xL = state.xL === null || state.xL === undefined ? '—' : state.xL.toFixed(4);
    let solidPhase = '—';
    if (state.phaseKey === 'liquid-solid-cd') solidPhase = 'Cd(s) · x=0';
    else if (state.phaseKey === 'liquid-solid-bi') solidPhase = 'Bi(s) · x=1';
    else if (state.phaseKey === 'solid-mixture' || state.phaseKey === 'eutectic') solidPhase = 'Bi(s) + Cd(s)';
    else if (state.phaseKey === 'solid') solidPhase = state.xS === 0 ? 'Cd(s)' : 'Bi(s)';
    const liquidFraction =
      state.liquidFrac === null || state.liquidFrac === undefined
        ? '—'
        : `${(state.liquidFrac * 100).toFixed(1)} %`;
    const solidFraction =
      state.solidFrac === null || state.solidFrac === undefined
        ? '—'
        : `${(state.solidFrac * 100).toFixed(1)} %`;
    const rows = [
      ['温度 T', `${state.T.toFixed(2)} °C`, 'accent'],
      ['总组成 x(Bi)', state.x.toFixed(4), 'accent'],
      ['质量分数', `${state.wtBi.toFixed(1)} wt% Bi`],
      ['相态', state.phase, 'magenta'],
      ['液相组成 x_L', xL],
      ['固相', solidPhase],
      ['液相分数 L', liquidFraction],
      ['固相分数 S', solidFraction],
      ['低共熔温度', `${BI_CD.TE_C.toFixed(1)} °C`],
      ['自由度 F', String(state.F), state.F === 1 ? 'magenta' : 'accent'],
    ];
    dom.dataGrid.innerHTML = rows
      .map(
        ([label, value, tone]) =>
          `<div class="data-item"><span>${label}</span><strong class="${tone || ''}">${value}</strong></div>`,
      )
      .join('');
    dom.dataFootnote.textContent =
      state.phaseKey === 'eutectic'
        ? '低共熔点：F=1，固定常压 f=0；相分数不是杠杆规则的唯一解。'
        : '标准 Bi–Cd 简单低共熔数据；固定常压 f = F − 1。相分数由杠杆规则给出。';
    return;
  }

  const x = state.x === null ? '—' : state.x.toFixed(4);
  const y = state.y === null ? '—' : state.y.toFixed(4);
  const liq = state.liqFrac === null ? '—' : `${(state.liqFrac * 100).toFixed(1)} %`;
  const vap = state.vapFrac === null ? '—' : `${(state.vapFrac * 100).toFixed(1)} %`;
  const rows = [
    ['温度 T', `${state.T.toFixed(2)} °C`],
    ['总压 P', `${state.P_atm.toFixed(3)} atm`],
    ['总组成 z', state.z.toFixed(4), 'accent'],
    ['液相组成 x', x, 'accent'],
    ['气相组成 y', y, 'amber'],
    ['液相分数 L', liq],
    ['气相分数 V', vap],
    ['泡点 T_b', `${state.Tb.toFixed(2)} °C`],
    ['露点 T_d', `${state.Td.toFixed(2)} °C`],
    ['自由度 F', String(state.F), 'accent'],
  ];
  dom.dataGrid.innerHTML = rows
    .map(
      ([label, value, tone]) =>
        `<div class="data-item"><span>${label}</span><strong class="${tone || ''}">${value}</strong></div>`,
    )
    .join('');
  dom.dataFootnote.textContent =
    state.phaseKey === 'azeotrope'
      ? '共沸点：x = y；相律基准 F = 2，附加共沸约束使固定 P 时 f* = 0。'
      : '固定总压切片：f = F − 1；杠杆规则 L = (y − z)/(y − x)。';
}

function renderFreedom(state) {
  const C = store.mode === 'single' ? 1 : 2;
  dom.freedomVisual.innerHTML = `
    <div class="freedom-node"><span>C</span><strong>${C}</strong></div>
    <i>−</i>
    <div class="freedom-node"><span>P</span><strong>${state.phases}</strong></div>
    <i>+</i>
    <div class="freedom-node"><span>常数</span><strong>2</strong></div>
    <i>=</i>
    <div class="freedom-node freedom-node--result"><span>F</span><strong>${state.F}</strong></div>
  `;
  if (store.mode === 'single') {
    const hints = {
      0: '三相点：T、P 均被固定，无法独立改变。',
      1: '两相共存：沿熔化 / 汽化 / 升华曲线，T 与 P 一一对应。',
      2: '单相区：两个独立强度变量，T 与 P。',
    };
    dom.freedomHint.textContent = hints[state.F] || '';
  } else if (isEutectic()) {
    if (state.phases === 3) {
      dom.freedomHint.textContent = '低共熔三相点：F = 1；固定常压后 f = 0。';
    } else if (state.phases === 2) {
      dom.freedomHint.textContent = '两相区：固定常压后 f = 1；温度确定液相组成，杠杆规则给出相分数。';
    } else {
      dom.freedomHint.textContent = '单相区：固定常压后 f = 2；温度与组成可独立改变。';
    }
  } else {
    if (state.phaseKey === 'azeotrope') {
      dom.freedomHint.textContent = '共沸附加约束 x = y：固定 P 时 f* = 0；相律基准 F = 2。';
    } else if (state.phases === 2) {
      dom.freedomHint.textContent = '固定总压后 f = 1：温度决定两相组成，杠杆规则给出相分数。';
    } else {
      dom.freedomHint.textContent = `固定总压后 f = 2：温度与总组成可独立改变。`;
    }
  }
}

function renderLever(state) {
  const supported = ['liquid-solid-cd', 'liquid-solid-bi', 'solid-mixture', 'eutectic'];
  const visible =
    store.mode === 'binary' &&
    isEutectic() &&
    state.phases >= 2 &&
    supported.includes(state.phaseKey);
  dom.leverMini.classList.toggle('is-hidden', !visible);
  if (!visible) return;

  const setBar = (ratioA, colorA, colorB) => {
    dom.leverBar.style.display = 'flex';
    dom.leverPartA.style.width = `${Math.max(0, Math.min(100, ratioA * 100))}%`;
    dom.leverPartB.style.width = `${Math.max(0, Math.min(100, 100 - ratioA * 100))}%`;
    dom.leverPartA.style.background = colorA;
    dom.leverPartB.style.background = colorB;
  };

  if (state.phaseKey === 'eutectic') {
    dom.leverState.textContent = '三相共存';
    dom.leverBar.style.display = 'none';
    dom.leverNameA.textContent = '液相 L';
    dom.leverNameB.textContent = 'Bi/Cd(s)';
    dom.leverValueA.textContent = '—';
    dom.leverValueB.textContent = '—';
    dom.leverFormula.textContent = 'F = 1 · 固定 P 后 f = 0；相分数取决于冷却 / 加热历史。';
    return;
  }

  if (state.phaseKey === 'solid-mixture') {
    const bi = state.biFrac ?? state.x;
    const cd = state.cdFrac ?? 1 - state.x;
    setBar(
      bi,
      'linear-gradient(90deg,#fb923c,#fdba74)',
      'linear-gradient(90deg,#a78bfa,#c084fc)',
    );
    dom.leverState.textContent = 'Bi(s) + Cd(s)';
    dom.leverNameA.textContent = 'Bi(s)';
    dom.leverNameB.textContent = 'Cd(s)';
    dom.leverValueA.textContent = `${(bi * 100).toFixed(1)} %`;
    dom.leverValueB.textContent = `${(cd * 100).toFixed(1)} %`;
    dom.leverFormula.textContent = `Bi(s) = x = ${state.x.toFixed(3)}；Cd(s) = 1 − x = ${(1 - state.x).toFixed(3)}。`;
    return;
  }

  const liquid = state.liquidFrac ?? 0;
  const solid = state.solidFrac ?? 1 - liquid;
  const isBi = state.phaseKey === 'liquid-solid-bi';
  const solidName = isBi ? 'Bi(s)' : 'Cd(s)';
  const solidColor = isBi
    ? 'linear-gradient(90deg,#fb923c,#fdba74)'
    : 'linear-gradient(90deg,#a78bfa,#c084fc)';
  setBar(liquid, 'linear-gradient(90deg,#2dd4bf,#67e8f9)', solidColor);
  dom.leverState.textContent = `L + ${solidName}`;
  dom.leverNameA.textContent = '液相 L';
  dom.leverNameB.textContent = solidName;
  dom.leverValueA.textContent = `${(liquid * 100).toFixed(1)} %`;
  dom.leverValueB.textContent = `${(solid * 100).toFixed(1)} %`;
  dom.leverFormula.textContent = isBi
    ? `L = (1 − x)/(1 − x_L) = ${liquid.toFixed(3)}；x_L = ${state.xL.toFixed(3)}。`
    : `L = x / x_L = ${liquid.toFixed(3)}；x_L = ${state.xL.toFixed(3)}。`;
}

function renderMoleculeInfo(state) {
  const captions = {
    solid: '晶格振动 · 长程有序',
    liquid: '短程有序 · 可平动',
    gas: '自由平动 · 低密度',
    vapor: '自由平动 · 低密度',
    supercritical: '气液不分 · 强涨落',
    'solid-liquid': '晶格 ↔ 液体 · 动态平衡',
    'liquid-gas': '液相 ↔ 气相 · 动态平衡',
    'solid-gas': '晶格 ↔ 气相 · 升华',
    triple: '固 / 液 / 气 三相共存',
    critical: '界面消失 · 密度涨落',
    'two-phase': '液相 ↔ 气相 · 动态平衡',
    azeotrope: 'x = y · 共同沸腾',
    'liquid-solid-cd': '液相 ↔ Cd 晶格 · 析出/回熔',
    'liquid-solid-bi': '液相 ↔ Bi 晶格 · 析出/回熔',
    'solid-mixture': 'Bi / Cd 双固相 · 晶格混合',
    eutectic: 'L_E ⇌ Bi(s) + Cd(s)',
    'pure-melting': '纯组分晶格 ↔ 熔体',
  };
  dom.moleculePhase.textContent = state.phase;
  dom.moleculeCaption.textContent = captions[state.phaseKey] || state.phase;
  if (moleculeStage) {
    moleculeStage.setPhase(state.phaseKey, state.T_K);
    dom.moleculeSpeed.textContent = `v ∝ ${moleculeStage.getSpeedReadout()}`;
  }
}

function renderKnowledge(state) {
  const system = store.mode === 'binary' ? getSystem() : null;
  const cards = getKnowledgeCards(store.mode, state, system);
  dom.knowledgeList.innerHTML = cards
    .map(
      (card) =>
        `<div class="knowledge-item"><span class="knowledge-icon">${card.icon}</span><div><strong>${card.title}</strong><p>${card.body}</p></div></div>`,
    )
    .join('');
}

function phaseChangeMessage(prev, next) {
  const key = `${prev.phaseKey}->${next.phaseKey}`;
  const messages = {
    'solid->liquid': '熔化 · 固相 → 液相',
    'liquid->solid': '凝固 · 液相 → 固相',
    'liquid->gas': '汽化 · 液相 → 气相',
    'gas->liquid': '液化 · 气相 → 液相',
    'solid->gas': '升华 · 固相 → 气相',
    'gas->solid': '凝华 · 气相 → 固相',
    'solid->solid-liquid': '到达熔化线 · 固–液共存',
    'solid-liquid->liquid': '完全熔化 · 进入液相',
    'liquid->solid-liquid': '到达凝固线 · 固–液共存',
    'solid-liquid->solid': '完全凝固 · 进入固相',
    'liquid->liquid-gas': '到达沸点 · 液–气共存',
    'liquid-gas->gas': '完全汽化 · 进入气相',
    'gas->liquid-gas': '到达露点 · 液–气共存',
    'liquid-gas->liquid': '完全液化 · 进入液相',
    'solid->triple': '到达三相点 · F = 0',
    'critical->supercritical': '越过临界点 · 进入超临界区',
    'liquid->two-phase': '到达泡点 · 进入两相区',
    'two-phase->vapor': '到达露点 · 进入气相',
    'vapor->two-phase': '到达露点 · 进入两相区',
    'two-phase->liquid': '到达泡点 · 进入液相',
    'liquid->azeotrope': '到达共沸点 · x = y',
    'two-phase->azeotrope': '共沸点 · 液相与气相组成相同',
    'vapor->azeotrope': '共沸点 · 液相与气相组成相同',
    'liquid->supercritical': '进入超临界流体区',
    'liquid->liquid-solid-cd': '到达液相线 · 析出 Cd(s)',
    'liquid->liquid-solid-bi': '到达液相线 · 析出 Bi(s)',
    'liquid-solid-cd->eutectic': '到达低共熔点 · 三相共存',
    'liquid-solid-bi->eutectic': '到达低共熔点 · 三相共存',
    'liquid->eutectic': '到达低共熔点 · 三相共存',
    'eutectic->solid-mixture': '低共熔凝固 · Bi + Cd 两固相',
    'solid-mixture->eutectic': '加热至低共熔点 · 出现液相',
    'liquid-solid-cd->solid-mixture': '低共熔凝固 · Bi + Cd 两固相',
    'liquid-solid-bi->solid-mixture': '低共熔凝固 · Bi + Cd 两固相',
    'solid-mixture->liquid-solid-cd': '升温 · 出现液–固两相',
    'solid-mixture->liquid-solid-bi': '升温 · 出现液–固两相',
  };
  return messages[key] || `${prev.phase} → ${next.phase}`;
}

function buildPresets() {
  const presets = [];
  if (store.mode === 'single') {
    const pAtm = 101325;
    presets.push(
      { id: 'ambient', index: '01', label: '常温常压', sub: '25 °C / 1 atm', T: 298.15, logP: Math.log10(pAtm) },
      { id: 'ice-water', index: '02', label: '冰水共存', sub: '0 °C / 1 atm', T: 273.15, logP: Math.log10(pAtm) },
      { id: 'boiling', index: '03', label: '沸腾', sub: '100 °C / 1 atm', T: 373.15, logP: Math.log10(pAtm) },
      { id: 'triple', index: '04', label: '三相点', sub: '0.01 °C / 611.7 Pa', T: WATER.T_TRIPLE, logP: Math.log10(WATER.P_TRIPLE) },
      { id: 'critical', index: '05', label: '临界点', sub: '374 °C / 22.06 MPa', T: WATER.T_CRIT, logP: Math.log10(WATER.P_CRIT) },
      {
        id: 'sublimation',
        index: '06',
        label: '低压升华',
        sub: '−20 °C / 103.7 Pa',
        T: 253.15,
        logP: Math.log10(waterSublimationPressure(253.15)),
      },
      { id: 'supercritical', index: '07', label: '超临界', sub: '407 °C / 30 MPa', T: 680, logP: Math.log10(30e6) },
    );
    dom.presetGrid.innerHTML = presets
      .map(
        (preset) =>
          `<button class="preset-btn" type="button" data-preset-id="${preset.id}"><span class="preset-index">${preset.index}</span><span class="preset-copy"><strong>${preset.label}</strong><small>${preset.sub}</small></span></button>`,
      )
      .join('');
    dom.presetGrid.querySelectorAll('.preset-btn').forEach((button) => {
      button.addEventListener('click', () => {
        const preset = presets.find((item) => item.id === button.dataset.presetId);
        if (!preset) return;
        stopPlayback('手动模式');
        store.single.T = preset.T;
        store.single.logP = preset.logP;
        setActivePreset(preset.id);
        syncSingleUi();
        updateUi(true);
      });
    });
  } else if (isEutectic()) {
    const eutecticPresets = makeEutecticPresets();
    dom.presetGrid.innerHTML = eutecticPresets
      .map(
        (preset) =>
          `<button class="preset-btn" type="button" data-preset-id="${preset.id}"><span class="preset-index">${preset.index}</span><span class="preset-copy"><strong>${preset.label}</strong><small>${preset.sub}</small></span></button>`,
      )
      .join('');
    dom.presetGrid.querySelectorAll('.preset-btn').forEach((button) => {
      button.addEventListener('click', () => {
        const preset = eutecticPresets.find((item) => item.id === button.dataset.presetId);
        if (!preset) return;
        applyBinaryPreset(preset);
      });
    });
  } else {
    const system = getSystem();
    const binaryPresets = makeBinaryPresets(system);
    dom.presetGrid.innerHTML = binaryPresets
      .map(
        (preset) =>
          `<button class="preset-btn" type="button" data-preset-id="${preset.id}"><span class="preset-index">${preset.index}</span><span class="preset-copy"><strong>${preset.label}</strong><small>${preset.sub}</small></span></button>`,
      )
      .join('');
    dom.presetGrid.querySelectorAll('.preset-btn').forEach((button) => {
      button.addEventListener('click', () => {
        const preset = binaryPresets.find((item) => item.id === button.dataset.presetId);
        if (!preset) return;
        applyBinaryPreset(preset);
      });
    });
  }
  setActivePreset(store.activePresetId);
}

function makeEutecticPresets() {
  return [
    {
      id: 'eutectic',
      index: '01',
      label: '低共熔点',
      sub: '144.0 °C · x=0.446',
      T: BI_CD.TE_C,
      z: BI_CD.xE,
    },
    { id: 'l-cd', index: '02', label: 'L + Cd(s)', sub: '170 °C · x=0.30', T: 170, z: 0.3 },
    { id: 'l-bi', index: '03', label: 'L + Bi(s)', sub: '200 °C · x=0.70', T: 200, z: 0.7 },
    { id: 'liquid', index: '04', label: '全液相', sub: '280 °C · x=0.50', T: 280, z: 0.5 },
    { id: 'solid', index: '05', label: '固相混合物', sub: '120 °C · x=0.50', T: 120, z: 0.5 },
    { id: 'pure-bi', index: '06', label: '纯 Bi 熔点', sub: '271.4 °C', T: 271.4, z: 1 },
    { id: 'pure-cd', index: '07', label: '纯 Cd 熔点', sub: '321.07 °C', T: 321.07, z: 0 },
  ];
}

function makeBinaryPresets(system) {
  const P = 1;
  const az = system.azeotropic ? findAzeotrope(system, P) : null;
  const pure = binaryPurePoints(system, P);
  const bubble = bubbleAtComposition(system, P, 0.3);
  const dew = dewAtComposition(system, P, 0.3);
  const twoPhaseT = (bubble.T + dew.T) / 2;
  const list = [];
  let index = 1;
  const add = (id, label, sub, T, z) => {
    list.push({ id, index: String(index).padStart(2, '0'), label, sub, T, z, P });
    index += 1;
  };
  if (az) {
    add('azeotrope', '共沸点', `${az.T.toFixed(1)} °C · x = ${az.x.toFixed(3)}`, az.T, az.x);
  }
  add('two-phase', '两相区', `${twoPhaseT.toFixed(1)} °C · z = 0.30`, twoPhaseT, 0.3);
  add('bubble', '泡点', `${bubble.T.toFixed(1)} °C · z = 0.30`, bubble.T, 0.3);
  add('dew', '露点', `${dew.T.toFixed(1)} °C · z = 0.30`, dew.T, 0.3);
  add('liquid', '全液相', '低于泡点', Math.max(bubble.T - 4, 0), 0.3);
  add('vapor', '全气相', '高于露点', dew.T + 4, 0.3);
  add(
    'pure-2',
    `${system.component2Short}纯组分`,
    `${pure.component2.T.toFixed(1)} °C`,
    pure.component2.T,
    0,
  );
  add(
    'pure-1',
    `${system.component1Short}纯组分`,
    `${pure.component1.T.toFixed(1)} °C`,
    pure.component1.T,
    1,
  );
  return list;
}

function applyBinaryPreset(preset) {
  stopPlayback('手动模式');
  store.binary.P = 1;
  if (isEutectic()) {
    store.binary.z = preset.z;
    store.binary.T = preset.T;
    syncBinaryDomain();
    setActivePreset(preset.id);
    syncBinaryUi();
    updateUi(true);
    return;
  }
  binaryScene.setContext(getSystem(), 1);
  syncBinaryDomain();
  store.binary.z = preset.z;
  store.binary.T = Math.min(getBinaryDomain().Tmax, Math.max(getBinaryDomain().Tmin, preset.T));
  setActivePreset(preset.id);
  syncBinaryUi();
  updateUi(true);
}

function setActivePreset(id) {
  store.activePresetId = id;
  dom.presetGrid.querySelectorAll('.preset-btn').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.presetId === id);
  });
}

function setRightTab(tab) {
  const isData = tab === 'data';
  dom.tabData.classList.toggle('is-active', isData);
  dom.tabKnowledge.classList.toggle('is-active', !isData);
  dom.tabData.setAttribute('aria-selected', String(isData));
  dom.tabKnowledge.setAttribute('aria-selected', String(!isData));
  dom.dataView.classList.toggle('is-hidden', !isData);
  dom.knowledgeView.classList.toggle('is-hidden', isData);
  if (dom.rightScroll) dom.rightScroll.scrollTop = 0;
}

function togglePlayback() {
  if (store.playing) {
    stopPlayback('已暂停');
  } else {
    startPlayback();
  }
}

function startPlayback() {
  store.playing = true;
  store.demoElapsed = 0;
  setActivePreset(null);
  dom.playBtn.classList.add('is-playing');
  dom.playBtn.setAttribute('aria-pressed', 'true');
  dom.playLabel.textContent = '暂停演示';
  dom.playIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h3.2v14H7zM13.8 5H17v14h-3.2z"/></svg>';
  dom.transportStatus.textContent = '自动演示 · 升温';
  dom.progressBar.style.width = '0%';

  if (store.mode === 'single') {
    store.single.T = 245;
    store.single.logP = Math.log10(101325);
    syncSingleUi();
  } else if (isEutectic()) {
    store.binary.P = 1;
    store.binary.z = 0.5;
    store.binary.T = 300;
    syncBinaryDomain();
    syncBinaryUi();
  } else {
    store.binary.P = 1;
    binaryScene.setContext(getSystem(), 1);
    syncBinaryDomain();
    store.binary.z = 0.3;
    const domain = getBinaryDomain();
    store.binary.T = domain.Tmin + 2;
    syncBinaryUi();
  }
  updateUi(true);
}

function stopPlayback(status = '手动模式') {
  if (!store.playing) {
    if (dom.transportStatus) dom.transportStatus.textContent = status;
    return;
  }
  store.playing = false;
  dom.playBtn.classList.remove('is-playing');
  dom.playBtn.setAttribute('aria-pressed', 'false');
  dom.playLabel.textContent = '自动演示';
  dom.playIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.2v13.6L19 12 8 5.2Z"/></svg>';
  dom.transportStatus.textContent = status;
  dom.progressBar.style.width = '0%';
}

function resetCurrent() {
  stopPlayback('已重置');
  setActivePreset(null);
  if (store.mode === 'single') {
    store.single.T = DEFAULT_SINGLE.T;
    store.single.logP = DEFAULT_SINGLE.logP;
    syncSingleUi();
  } else if (isEutectic()) {
    store.binary.P = 1;
    store.binary.z = 0.3;
    store.binary.T = getBinaryDefaultTemperature();
    syncBinaryDomain();
    syncBinaryUi();
  } else {
    store.binary.P = DEFAULT_BINARY.P;
    store.binary.z = DEFAULT_BINARY.z;
    binaryScene.setContext(getSystem(), DEFAULT_BINARY.P);
    syncBinaryDomain();
    store.binary.T = getBinaryDefaultTemperature();
    syncBinaryUi();
  }
  updateUi(true);
  setCameraView('iso');
  showToast('已重置到当前模式的默认状态', '#67e8f9');
}

function setCameraView(view, instant = false) {
  if (!camera || !controls) return;
  const isSingle = store.mode === 'single';
  const eutectic = store.mode === 'binary' && isEutectic();
  const views = isSingle || eutectic
    ? {
        iso: { pos: new THREE.Vector3(11, 8.2, 15.2), target: new THREE.Vector3(0, 3.2, 0) },
        front: { pos: new THREE.Vector3(0, 4.6, 17.8), target: new THREE.Vector3(0, 3.2, 0) },
        top: { pos: new THREE.Vector3(0.2, 16.8, 0.07), target: new THREE.Vector3(0, 3.0, 0) },
      }
    : {
        iso: { pos: new THREE.Vector3(9.2, 9.3, 20.2), target: new THREE.Vector3(-0.65, 3.2, 0) },
        front: { pos: new THREE.Vector3(0, 5.4, 21.2), target: new THREE.Vector3(-0.5, 3.2, 0) },
        top: { pos: new THREE.Vector3(0.2, 19.2, 0.06), target: new THREE.Vector3(-0.5, 3.0, 0) },
      };
  const target = views[view] || views.iso;
  $$('.transport-views button').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.view === view);
  });

  if (instant) {
    camera.position.copy(target.pos);
    controls.target.copy(target.target);
    controls.update();
    cameraTween = null;
    return;
  }
  cameraTween = createCameraTween(
    camera.position.clone(),
    target.pos,
    controls.target.clone(),
    target.target,
    1.1,
  );
}

function createCameraTween(startPos, endPos, startTarget, endTarget, duration) {
  return {
    startPos,
    endPos,
    startTarget,
    endTarget,
    duration,
    t: 0,
  };
}

function resize() {
  if (!renderer || !camera) return;
  const width = dom.canvas.clientWidth || dom.stage.clientWidth;
  const height = dom.canvas.clientHeight || dom.stage.clientHeight;
  if (width < 10 || height < 10) return;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  if (moleculeStage) moleculeStage.resize();
}

function showToast(text, color = '#67e8f9') {
  dom.toast.style.setProperty('--toast-color', color);
  dom.toastText.textContent = text;
  dom.toast.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => dom.toast.classList.remove('is-visible'), 2300);
}

function pointerNdc(event) {
  const rect = dom.canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
    y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
    rect,
  };
}

function getActivePickables() {
  if (store.mode === 'single') return singleScene.getPickables();
  return isEutectic() ? eutecticScene.getPickables() : binaryScene.getPickables();
}

function handlePointerMove(event) {
  if (!raycaster) return;
  const { x, y } = pointerNdc(event);
  raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
  const hits = raycaster.intersectObjects(getActivePickables(), false);
  if (hits.length > 0) {
    const hit = hits[0].object;
    hoveredPick = hit;
    dom.canvas.style.cursor = 'pointer';
    const rect = dom.stage.getBoundingClientRect();
    dom.tooltip.innerHTML = `<strong>${hit.userData.label}</strong>${hit.userData.tooltip}`;
    dom.tooltip.style.left = `${event.clientX - rect.left}px`;
    dom.tooltip.style.top = `${event.clientY - rect.top}px`;
    dom.tooltip.classList.add('is-visible');
  } else {
    hideTooltip();
  }
}

function hideTooltip() {
  hoveredPick = null;
  dom.canvas.style.cursor = 'grab';
  dom.tooltip.classList.remove('is-visible');
}

function handlePointerUp(event) {
  if (!pointerDownAt || !hoveredPick) {
    pointerDownAt = null;
    return;
  }
  const dist = Math.hypot(event.clientX - pointerDownAt.x, event.clientY - pointerDownAt.y);
  pointerDownAt = null;
  if (dist > 6) return;
  const data = hoveredPick.userData;
  if (data.kind === 'single-marker') {
    stopPlayback('手动模式');
    if (data.id === 'triple') {
      store.single.T = WATER.T_TRIPLE;
      store.single.logP = Math.log10(WATER.P_TRIPLE);
    } else if (data.id === 'critical') {
      store.single.T = WATER.T_CRIT;
      store.single.logP = Math.log10(WATER.P_CRIT);
    } else if (data.id === 'boiling') {
      store.single.T = 373.15;
      store.single.logP = Math.log10(101325);
    } else if (data.id === 'melting') {
      store.single.T = 273.15;
      store.single.logP = Math.log10(101325);
    }
    setActivePreset(null);
    syncSingleUi();
    updateUi(true);
    showToast(`${data.label} · 已定位`, '#67e8f9');
  } else if (data.kind === 'eutectic-marker') {
    stopPlayback('手动模式');
    if (data.id === 'eutectic') {
      store.binary.z = BI_CD.xE;
      store.binary.T = BI_CD.TE_C;
    } else if (data.id === 'pure-bi') {
      store.binary.z = 1;
      store.binary.T = BI_CD.TmBi - 273.15;
    } else if (data.id === 'pure-cd') {
      store.binary.z = 0;
      store.binary.T = BI_CD.TmCd - 273.15;
    }
    setActivePreset(null);
    syncBinaryDomain();
    syncBinaryUi();
    updateUi(true);
    showToast(`${data.label} · 已定位`, '#f0abfc');
  } else if (data.kind === 'binary-marker') {
    stopPlayback('手动模式');
    if (data.id === 'azeotrope') {
      const az = findAzeotrope(getSystem(), store.binary.P);
      if (az) {
        store.binary.z = az.x;
        store.binary.T = az.T;
      }
    } else if (data.id === 'pure-2' || data.id === 'pure-1') {
      const pure = binaryPurePoints(getSystem(), store.binary.P);
      if (data.id === 'pure-2') {
        store.binary.z = 0;
        store.binary.T = pure.component2.T;
      } else {
        store.binary.z = 1;
        store.binary.T = pure.component1.T;
      }
    }
    setActivePreset(null);
    syncBinaryDomain();
    syncBinaryUi();
    updateUi(true);
    showToast(`${data.label} · 已定位`, '#f0abfc');
  }
}

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, Math.max(0.001, (now - lastFrameAt) / 1000));
  lastFrameAt = now;
  elapsed += dt;

  if (store.playing) {
    store.demoElapsed += dt;
    if (store.mode === 'single') {
      const leg = 24;
      const u = (store.demoElapsed % (leg * 2)) / leg;
      const tri = u < 1 ? u : 2 - u;
      store.single.T = 245 + 180 * tri;
      store.single.logP = Math.log10(101325);
      dom.singleTemp.value = store.single.T.toFixed(1);
      dom.singleTempValue.textContent = `${store.single.T.toFixed(2)} K`;
      dom.singleTempSub.textContent = `${(store.single.T - 273.15).toFixed(2)} °C`;
      dom.singlePress.value = store.single.logP.toFixed(4);
      dom.singlePressValue.textContent = formatPressure(Math.pow(10, store.single.logP), 3);
      dom.singlePressSub.textContent = `lg P = ${store.single.logP.toFixed(3)}`;
      setSliderFill(dom.singleTemp);
      setSliderFill(dom.singlePress);
      dom.progressBar.style.width = `${(tri * 100).toFixed(1)}%`;
      dom.transportStatus.textContent = u < 1 ? '自动演示 · 升温' : '自动演示 · 降温';
    } else if (isEutectic()) {
      const leg = 20;
      const u = (store.demoElapsed % (leg * 2)) / leg;
      const tri = u < 1 ? u : 2 - u;
      store.binary.P = 1;
      store.binary.z = 0.5;
      store.binary.T = 300 - 180 * tri;
      dom.binaryTemp.value = store.binary.T.toFixed(2);
      dom.binaryTempValue.textContent = `${store.binary.T.toFixed(2)} °C`;
      dom.binaryTempSub.textContent = `${(store.binary.T + 273.15).toFixed(2)} K`;
      dom.binaryComp.value = '0.500';
      dom.binaryCompValue.textContent = '0.500';
      dom.binaryCompSub.textContent = `x(Bi) · ${weightPercentBi(0.5).toFixed(1)} wt% Bi`;
      setSliderFill(dom.binaryTemp);
      setSliderFill(dom.binaryComp);
      dom.progressBar.style.width = `${(tri * 100).toFixed(1)}%`;
      dom.transportStatus.textContent = u < 1 ? '自动演示 · 降温' : '自动演示 · 升温';
    } else {
      const domain = getBinaryDomain();
      const leg = 20;
      const u = (store.demoElapsed % (leg * 2)) / leg;
      const tri = u < 1 ? u : 2 - u;
      const span = Math.max(2, domain.Tmax - domain.Tmin - 4);
      store.binary.P = 1;
      store.binary.z = 0.3;
      store.binary.T = domain.Tmin + 2 + span * tri;
      dom.binaryTemp.value = store.binary.T.toFixed(2);
      dom.binaryTempValue.textContent = `${store.binary.T.toFixed(2)} °C`;
      dom.binaryTempSub.textContent = `${(store.binary.T + 273.15).toFixed(2)} K`;
      dom.binaryPress.value = '1.000';
      dom.binaryPressValue.textContent = '1.000 atm';
      dom.binaryPressSub.textContent = '101.33 kPa';
      dom.binaryComp.value = '0.300';
      dom.binaryCompValue.textContent = '0.300';
      setSliderFill(dom.binaryTemp);
      setSliderFill(dom.binaryPress);
      setSliderFill(dom.binaryComp);
      dom.progressBar.style.width = `${(tri * 100).toFixed(1)}%`;
      dom.transportStatus.textContent = u < 1 ? '自动演示 · 升温' : '自动演示 · 降温';
    }
  }

  currentState = getCurrentState();

  if (store.mode === 'single') {
    singleScene.update(currentState, dt, elapsed);
  } else if (isEutectic()) {
    eutecticScene.update(currentState, dt, elapsed);
  } else {
    binaryScene.update(currentState, dt, elapsed);
  }

  if (moleculeStage && store.molecule) {
    moleculeStage.update(dt, elapsed);
    moleculeStage.render();
  }

  if (cameraTween) {
    cameraTween.t += dt / cameraTween.duration;
    const t = Math.min(1, cameraTween.t);
    const e = easeInOutCubic(t);
    camera.position.lerpVectors(cameraTween.startPos, cameraTween.endPos, e);
    controls.target.lerpVectors(cameraTween.startTarget, cameraTween.endTarget, e);
    if (t >= 1) cameraTween = null;
  }

  controls.update();
  renderer.render(scene, camera);

  updateUi(false);

  fpsFrames += 1;
  fpsElapsed += dt;
  if (fpsElapsed >= 0.7) {
    const fps = Math.round(fpsFrames / fpsElapsed);
    dom.fpsMeter.textContent = `${fps} FPS`;
    fpsFrames = 0;
    fpsElapsed = 0;
  }
}

init();
