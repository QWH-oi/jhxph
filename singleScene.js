import * as THREE from 'three';
import {
  WATER,
  WATER_DOMAIN,
  PHASE_META,
  waterCurves,
  waterMeltingTemperature,
  waterSublimationPressure,
  waterSaturationPressure,
} from '../science.js';
import {
  makeTextSprite,
  makeGlowSprite,
  makeRingSprite,
  createLine,
  createTube,
  disposeObject,
} from './labels.js';

const { Tmin, Tmax, logPmin, logPmax, depth } = WATER_DOMAIN;
const W = 10.8;
const H = 6.25;
const X_MIN = -W / 2;
const X_MAX = W / 2;
const Z_FRONT = depth / 2;
const Z_BACK = -depth / 2;

const COLORS = {
  solid: '#7dd3fc',
  liquid: '#2dd4bf',
  gas: '#fbbf24',
  supercritical: '#c084fc',
  fusion: '#93c5fd',
  vaporization: '#fcd34d',
  sublimation: '#a5b4fc',
  grid: 0x0d3344,
};

const mapT = (T) => X_MIN + ((T - Tmin) / (Tmax - Tmin)) * W;
const mapLogP = (logP) => ((logP - logPmin) / (logPmax - logPmin)) * H;

function toPoint(T, logP, z = Z_FRONT + 0.035) {
  return new THREE.Vector3(mapT(T), mapLogP(logP), z);
}

function makeShape(points) {
  const shape = new THREE.Shape();
  points.forEach(([T, logP], index) => {
    const x = mapT(T);
    const y = mapLogP(logP);
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  return shape;
}

function phaseMaterial(color, opacity) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.2,
    roughness: 0.36,
    metalness: 0.16,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: true,
  });
}

function setLinePoints(line, points) {
  const positions = line.geometry.attributes.position;
  if (!positions || positions.count !== points.length) return;
  points.forEach((point, index) => {
    positions.setXYZ(index, point.x, point.y, point.z);
  });
  positions.needsUpdate = true;
  if (line.material.isLineDashedMaterial) line.computeLineDistances();
}

export class SinglePhaseScene {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'single-phase-scene';
    this.labelsGroup = new THREE.Group();
    this.labelsGroup.name = 'single-labels';
    this.pickables = [];
    this.currentColor = new THREE.Color('#2dd4bf');
    this.targetColor = new THREE.Color('#2dd4bf');
    this.markerPos = new THREE.Vector3();
    this.markerTarget = new THREE.Vector3();
    this.labelTimer = 0;
    this.pulse = 0;
    this.visible = true;
    this.scene.add(this.group);
    this.scene.add(this.labelsGroup);
    this.build();
  }

  build() {
    this.curves = waterCurves();
    this.buildFloor();
    this.buildRegions();
    this.buildBoundaries();
    this.buildAxes();
    this.buildRegionLabels();
    this.buildKeyPoints();
    this.buildStateMarker();
  }

  buildFloor() {
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(9.5, 96),
      new THREE.MeshBasicMaterial({
        color: 0x04131d,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.07;
    this.group.add(floor);

    const grid = new THREE.GridHelper(17.5, 20, COLORS.grid, 0x061c29);
    grid.position.y = -0.045;
    grid.material.transparent = true;
    grid.material.opacity = 0.52;
    grid.material.depthWrite = false;
    this.group.add(grid);

    const rings = [4.5, 6.3, 8.1];
    rings.forEach((r, index) => {
      const points = [];
      for (let i = 0; i <= 100; i += 1) {
        const a = (i / 100) * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(a) * r, -0.035 + index * 0.001, Math.sin(a) * r));
      }
      const ring = createLine(points, index === 0 ? 0x2a94ab : 0x16566c, 0.25 - index * 0.05);
      this.group.add(ring);
    });
  }

  buildRegions() {
    const pMax = Math.pow(10, logPmax);
    const fusion = this.curves.fusion;
    const vaporization = this.curves.vaporization;
    const sublimation = this.curves.sublimation;

    const solidPoints = [];
    solidPoints.push([Tmin, logPmax]);
    fusion
      .slice()
      .reverse()
      .forEach((p) => solidPoints.push([p.T, p.logP]));
    sublimation
      .slice()
      .reverse()
      .forEach((p) => solidPoints.push([p.T, p.logP]));
    solidPoints.push([Tmin, logPmin]);

    const liquidPoints = [];
    liquidPoints.push([WATER.T_TRIPLE, Math.log10(WATER.P_TRIPLE)]);
    fusion.forEach((p) => liquidPoints.push([p.T, p.logP]));
    liquidPoints.push([WATER.T_CRIT, logPmax]);
    liquidPoints.push([WATER.T_CRIT, Math.log10(WATER.P_CRIT)]);
    vaporization
      .slice()
      .reverse()
      .forEach((p) => liquidPoints.push([p.T, p.logP]));

    const gasPoints = [];
    gasPoints.push([WATER.T_TRIPLE, Math.log10(WATER.P_TRIPLE)]);
    sublimation
      .slice()
      .reverse()
      .forEach((p) => gasPoints.push([p.T, p.logP]));
    gasPoints.push([Tmin, logPmin]);
    gasPoints.push([Tmax, logPmin]);
    gasPoints.push([Tmax, Math.log10(WATER.P_CRIT)]);
    gasPoints.push([WATER.T_CRIT, Math.log10(WATER.P_CRIT)]);
    vaporization
      .slice()
      .reverse()
      .forEach((p) => gasPoints.push([p.T, p.logP]));

    const superPoints = [
      [WATER.T_CRIT, Math.log10(WATER.P_CRIT)],
      [Tmax, Math.log10(WATER.P_CRIT)],
      [Tmax, logPmax],
      [WATER.T_CRIT, logPmax],
    ];

    const regions = [
      { key: 'solid', points: solidPoints, color: COLORS.solid, opacity: 0.26 },
      { key: 'liquid', points: liquidPoints, color: COLORS.liquid, opacity: 0.22 },
      { key: 'gas', points: gasPoints, color: COLORS.gas, opacity: 0.18 },
      { key: 'supercritical', points: superPoints, color: COLORS.supercritical, opacity: 0.16 },
    ];

    this.regions = {};
    regions.forEach((region) => {
      const shape = makeShape(region.points);
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: false,
        steps: 1,
        curveSegments: 1,
      });
      geometry.translate(0, 0, -depth / 2);
      const mesh = new THREE.Mesh(geometry, phaseMaterial(region.color, region.opacity));
      mesh.renderOrder = 1;
      mesh.userData.region = region.key;
      this.group.add(mesh);
      this.regions[region.key] = mesh;

      [Z_FRONT + 0.006, Z_BACK - 0.006].forEach((z, index) => {
        const points = region.points.map(([T, logP]) => new THREE.Vector3(mapT(T), mapLogP(logP), z));
        const loop = createLine(points, region.color, index === 0 ? 0.34 : 0.13);
        loop.geometry.setDrawRange(0, points.length);
        loop.renderOrder = 6;
        this.group.add(loop);
      });

      // 侧面竖向装饰线，增强玻璃块的体积感
      const sideSteps = 6;
      for (let i = 0; i < sideSteps; i += 1) {
        const [T, logP] = region.points[Math.floor((i / sideSteps) * (region.points.length - 1))];
        const line = createLine(
          [
            new THREE.Vector3(mapT(T), mapLogP(logP), Z_BACK),
            new THREE.Vector3(mapT(T), mapLogP(logP), Z_FRONT),
          ],
          region.color,
          0.055,
        );
        line.renderOrder = 2;
        this.group.add(line);
      }
    });
  }

  buildBoundaries() {
    const addBoundary = (samples, color, radius = 0.022) => {
      [Z_FRONT + 0.025, Z_BACK - 0.025].forEach((z, index) => {
        const points = samples.map((p) => new THREE.Vector3(mapT(p.T), mapLogP(p.logP), z));
        const glow = createTube(points, color, radius * 2.6, index === 0 ? 0.13 : 0.04);
        glow.renderOrder = 7;
        this.group.add(glow);
        const tube = createTube(points, color, radius, index === 0 ? 0.88 : 0.2);
        tube.renderOrder = 8;
        this.group.add(tube);
      });
    };

    addBoundary(
      this.curves.fusion.filter((p) => Number.isFinite(p.T) && Number.isFinite(p.logP)),
      COLORS.fusion,
      0.02,
    );
    addBoundary(this.curves.vaporization, COLORS.vaporization, 0.023);
    addBoundary(this.curves.sublimation, COLORS.sublimation, 0.019);

    // 临界点之后的虚线延长，提示超临界边界
    const crit = this.curves.critical;
    const superLinePoints = [toPoint(crit.T, crit.logP)];
    for (let i = 1; i <= 30; i += 1) {
      const u = i / 30;
      superLinePoints.push(
        toPoint(crit.T + u * (Tmax - crit.T), crit.logP, Z_FRONT + 0.026),
      );
    }
    const superLine = createLine(superLinePoints, COLORS.supercritical, 0.28, true, 0.1, 0.1);
    superLine.renderOrder = 8;
    this.group.add(superLine);
  }

  buildAxes() {
    const axisGroup = new THREE.Group();
    axisGroup.name = 'single-axes';
    this.group.add(axisGroup);

    const axisColor = 0x78b5c8;
    const tAxis = createLine(
      [
        new THREE.Vector3(X_MIN, -0.02, Z_FRONT + 0.42),
        new THREE.Vector3(X_MAX + 0.18, -0.02, Z_FRONT + 0.42),
      ],
      axisColor,
      0.9,
    );
    axisGroup.add(tAxis);

    const pAxis = createLine(
      [
        new THREE.Vector3(X_MIN - 0.42, -0.02, Z_FRONT + 0.2),
        new THREE.Vector3(X_MIN - 0.42, H + 0.1, Z_FRONT + 0.2),
      ],
      axisColor,
      0.9,
    );
    axisGroup.add(pAxis);

    const depthAxis = createLine(
      [
        new THREE.Vector3(X_MIN - 0.42, -0.02, Z_BACK),
        new THREE.Vector3(X_MIN - 0.42, -0.02, Z_FRONT + 0.2),
      ],
      axisColor,
      0.65,
    );
    axisGroup.add(depthAxis);

    const box = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, depth)),
      new THREE.LineBasicMaterial({
        color: 0x216578,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      }),
    );
    box.position.set(0, H / 2, 0);
    axisGroup.add(box);

    // T ticks
    const tTicks = [200, 300, 400, 500, 600, 700];
    tTicks.forEach((T) => {
      const x = mapT(T);
      axisGroup.add(
        createLine(
          [
            new THREE.Vector3(x, -0.02, Z_FRONT + 0.28),
            new THREE.Vector3(x, -0.02, Z_FRONT + 0.58),
          ],
          axisColor,
          0.55,
        ),
      );
      const label = makeTextSprite(`${T} K`, {
        fontSize: 25,
        color: '#b9d8e6',
        height: 0.22,
        weight: 400,
      });
      label.position.set(x, 0.18, Z_FRONT + 0.82);
      axisGroup.add(label);
    });

    // P ticks (decades)
    for (let decade = 1; decade <= 7; decade += 1) {
      const y = mapLogP(decade);
      axisGroup.add(
        createLine(
          [
            new THREE.Vector3(X_MIN - 0.56, y, Z_FRONT + 0.2),
            new THREE.Vector3(X_MIN - 0.3, y, Z_FRONT + 0.2),
          ],
          axisColor,
          0.55,
        ),
      );
      const value = Math.pow(10, decade);
      const text = value >= 1e6 ? `${value / 1e6}M` : value >= 1e3 ? `${value / 1e3}k` : `${value}`;
      const label = makeTextSprite(text, {
        fontSize: 23,
        color: '#b9d8e6',
        height: 0.2,
        weight: 400,
      });
      label.position.set(X_MIN - 0.98, y, Z_FRONT + 0.24);
      axisGroup.add(label);
    }

    const tTitle = makeTextSprite('温度 T / K', {
      fontSize: 29,
      color: '#d5f1fb',
      height: 0.26,
      weight: 500,
    });
    tTitle.position.set(X_MAX - 0.38, 0.33, Z_FRONT + 0.92);
    axisGroup.add(tTitle);

    const pTitle = makeTextSprite('lg (P / Pa)', {
      fontSize: 28,
      color: '#d5f1fb',
      height: 0.25,
      weight: 500,
    });
    pTitle.position.set(X_MIN - 1.05, H + 0.5, Z_FRONT + 0.24);
    axisGroup.add(pTitle);

    const dTitle = makeTextSprite('分子间距示意', {
      fontSize: 19,
      color: '#547a8c',
      height: 0.16,
      weight: 400,
    });
    dTitle.position.set(X_MIN - 1.0, 0.28, 0);
    axisGroup.add(dTitle);
  }

  buildRegionLabels() {
    const labels = [
      { text: '固相\nSOLID', T: 228, logP: 6.7, color: COLORS.solid, height: 0.43 },
      { text: '液相\nLIQUID', T: 455, logP: 6.75, color: COLORS.liquid, height: 0.43 },
      { text: '气相\nVAPOR', T: 555, logP: 3.25, color: COLORS.gas, height: 0.43 },
      { text: '超临界\nSUPERCRITICAL', T: 672, logP: 7.52, color: COLORS.supercritical, height: 0.35 },
    ];
    labels.forEach((item) => {
      const sprite = makeTextSprite(item.text, {
        fontSize: 30,
        color: item.color,
        height: item.height,
        weight: 500,
        opacity: 0.76,
        lineGap: 5,
      });
      sprite.position.set(mapT(item.T), mapLogP(item.logP), Z_FRONT + 0.42);
      this.labelsGroup.add(sprite);
    });

    const note = makeTextSprite('深度轴：分子间距 / 体积示意（非独立自由度）', {
      fontSize: 20,
      color: '#50778b',
      height: 0.16,
      weight: 400,
    });
    note.position.set(3.2, 0.3, Z_BACK - 0.45);
    this.labelsGroup.add(note);
  }

  buildKeyPoints() {
    const addKeyPoint = ({
      id,
      T,
      logP,
      color,
      label,
      sub,
      geometry = 'octa',
      size = 0.1,
      tooltip,
      showLabel = true,
    }) => {
      const group = new THREE.Group();
      const x = mapT(T);
      const y = mapLogP(logP);
      group.position.set(x, y, Z_FRONT + 0.105);
      this.group.add(group);

      const geo =
        geometry === 'sphere'
          ? new THREE.SphereGeometry(size, 20, 16)
          : geometry === 'diamond'
            ? new THREE.OctahedronGeometry(size, 0)
            : new THREE.OctahedronGeometry(size, 0);
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.98,
          toneMapped: false,
          depthWrite: false,
        }),
      );
      mesh.renderOrder = 12;
      group.add(mesh);

      const glow = makeGlowSprite('#ffffff', size * 6.8, 0.35);
      glow.material.color.set(color);
      group.add(glow);

      const ring = makeRingSprite('#ffffff', size * 4.8, 0.22);
      ring.material.color.set(color);
      group.add(ring);

      const labelSprite = makeTextSprite(`${label}\n${sub}`, {
        fontSize: 27,
        color,
        background: true,
        border: true,
        height: 0.36,
        weight: 500,
        opacity: 0.95,
        gap: 0.08,
        padding: 12,
      });
      labelSprite.position.set(0, size + 0.62, 0.12);
      // 标签使用世界坐标，避免与 marker group 的局部坐标混淆
      if (showLabel) {
        labelSprite.position.set(x, y + size + 0.62, Z_FRONT + 0.22);
        this.labelsGroup.add(labelSprite);
      }

      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(size * 2.9, 12, 10),
        new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      hit.position.copy(group.position);
      hit.userData = { kind: 'single-marker', id, label, tooltip };
      this.group.add(hit);
      this.pickables.push(hit);
    };

    const { triple, critical } = this.curves;
    addKeyPoint({
      id: 'triple',
      T: triple.T,
      logP: triple.logP,
      color: '#f8fafc',
      label: '三相点 · F = 0',
      sub: '273.16 K / 611.657 Pa',
      geometry: 'octa',
      size: 0.105,
      tooltip: '三相点：固、液、气三相共存，F = 0。点击跳转。',
    });
    addKeyPoint({
      id: 'critical',
      T: critical.T,
      logP: critical.logP,
      color: '#c084fc',
      label: '临界点 · F = 1',
      sub: '647.096 K / 22.064 MPa',
      geometry: 'sphere',
      size: 0.105,
      tooltip: '临界点：气液界面消失，F = 1。点击跳转。',
    });
    addKeyPoint({
      id: 'boiling',
      T: 373.15,
      logP: Math.log10(101325),
      color: '#fcd34d',
      label: '常压沸点',
      sub: '373.15 K / 101.325 kPa',
      geometry: 'diamond',
      size: 0.058,
      tooltip: '常压水的沸点。点击跳转至液–气共存。',
      showLabel: false,
    });
    addKeyPoint({
      id: 'melting',
      T: 273.15,
      logP: Math.log10(101325),
      color: '#93c5fd',
      label: '常压熔点',
      sub: '273.15 K / 101.325 kPa',
      geometry: 'diamond',
      size: 0.058,
      tooltip: '常压冰的熔点。点击跳转至固–液共存。',
      showLabel: false,
    });

    const fusionNote = makeTextSprite('反常熔化线\n负斜率', {
      fontSize: 22,
      color: '#7fa6ba',
      height: 0.3,
      weight: 400,
      opacity: 0.8,
    });
    fusionNote.position.set(mapT(266) - 0.55, mapLogP(6.8) + 0.25, Z_FRONT + 0.35);
    this.labelsGroup.add(fusionNote);
  }

  buildStateMarker() {
    const stateGroup = new THREE.Group();
    stateGroup.name = 'single-state-marker';
    this.stateGroup = stateGroup;
    this.group.add(stateGroup);

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.125, 26, 20),
      new THREE.MeshBasicMaterial({
        color: '#2dd4bf',
        toneMapped: false,
        depthWrite: false,
      }),
    );
    core.renderOrder = 15;
    stateGroup.add(core);
    this.core = core;

    const glow = makeGlowSprite('#ffffff', 1.35, 0.6);
    glow.material.color.set('#2dd4bf');
    stateGroup.add(glow);
    this.markerGlow = glow;

    const ring = makeRingSprite('#ffffff', 0.72, 0.5);
    ring.material.color.set('#2dd4bf');
    stateGroup.add(ring);
    this.markerRing = ring;

    const light = new THREE.PointLight(0x2dd4bf, 4.5, 6, 2);
    stateGroup.add(light);
    this.markerLight = light;

    this.markerPos.set(mapT(298.15), mapLogP(Math.log10(101325)), Z_FRONT + 0.32);
    this.markerTarget.copy(this.markerPos);
    stateGroup.position.copy(this.markerPos);

    const vertical = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({
        color: '#67e8f9',
        transparent: true,
        opacity: 0.4,
        dashSize: 0.09,
        gapSize: 0.07,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    vertical.computeLineDistances();
    vertical.renderOrder = 9;
    this.group.add(vertical);
    this.verticalGuide = vertical;

    const horizontal = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
      ]),
      new THREE.LineDashedMaterial({
        color: '#67e8f9',
        transparent: true,
        opacity: 0.28,
        dashSize: 0.09,
        gapSize: 0.07,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    horizontal.computeLineDistances();
    horizontal.renderOrder = 9;
    this.group.add(horizontal);
    this.horizontalGuide = horizontal;

    const caption = makeTextSprite('当前状态', {
      fontSize: 19,
      color: '#67e8f9',
      height: 0.15,
      weight: 500,
      opacity: 0.75,
    });
    caption.position.set(this.markerPos.x, this.markerPos.y + 0.38, this.markerPos.z + 0.12);
    this.labelsGroup.add(caption);
    this.stateCaption = caption;
  }

  setLabelsVisible(visible) {
    this.labelsGroup.visible = visible;
  }

  setVisible(visible) {
    this.visible = visible;
    this.group.visible = visible;
    this.labelsGroup.visible = visible;
  }

  getPickables() {
    return this.visible ? this.pickables : [];
  }

  triggerPulse() {
    this.pulse = 1;
  }

  update(state, delta, time) {
    if (!this.visible || !state) return;
    this.labelTimer += delta;
    this.markerTarget.set(
      mapT(state.T),
      mapLogP(Math.log10(state.P)),
      Z_FRONT + 0.32,
    );
    this.markerPos.lerp(this.markerTarget, 1 - Math.exp(-delta * 12));
    this.stateGroup.position.copy(this.markerPos);

    const target = new THREE.Color(state.color);
    this.currentColor.lerp(target, 1 - Math.exp(-delta * 8));
    this.core.material.color.copy(this.currentColor);
    this.markerGlow.material.color.copy(this.currentColor);
    this.markerRing.material.color.copy(this.currentColor);
    this.markerLight.color.copy(this.currentColor);
    this.markerLight.intensity = 4.2 + Math.sin(time * 3.2) * 0.7;

    const pulseScale = 1 + Math.sin(time * 2.8) * 0.08;
    this.markerRing.scale.setScalar(pulseScale);
    if (this.pulse > 0) {
      this.pulse = Math.max(0, this.pulse - delta * 1.8);
      const p = 1 - this.pulse;
      const ring = this.markerRing;
      ring.scale.setScalar(1 + p * 2.5);
      ring.material.opacity = 0.55 * this.pulse;
    } else {
      this.markerRing.material.opacity = 0.38 + Math.sin(time * 2.8) * 0.1;
    }

    const verticalPoints = [
      new THREE.Vector3(this.markerPos.x, 0.02, this.markerPos.z),
      new THREE.Vector3(this.markerPos.x, this.markerPos.y - 0.15, this.markerPos.z),
    ];
    setLinePoints(this.verticalGuide, verticalPoints);
    this.verticalGuide.material.color.copy(this.currentColor);

    const horizontalPoints = [
      new THREE.Vector3(this.markerPos.x, this.markerPos.y, this.markerPos.z),
      new THREE.Vector3(this.markerPos.x, this.markerPos.y, Z_FRONT + 0.24),
      new THREE.Vector3(X_MIN - 0.55, this.markerPos.y, Z_FRONT + 0.24),
    ];
    setLinePoints(this.horizontalGuide, horizontalPoints);
    this.horizontalGuide.material.color.copy(this.currentColor);

    this.stateCaption.position.set(
      this.markerPos.x,
      this.markerPos.y + 0.38,
      this.markerPos.z + 0.16,
    );
  }

  dispose() {
    disposeObject(this.group);
    disposeObject(this.labelsGroup);
    this.scene.remove(this.group);
    this.scene.remove(this.labelsGroup);
  }
}
