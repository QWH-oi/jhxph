import * as THREE from 'three';
import {
  BI_CD,
  EUTECTIC_DOMAIN,
  eutecticCurves,
  liquidCompositionAt,
} from '../eutectic.js';
import {
  makeTextSprite,
  makeGlowSprite,
  makeRingSprite,
  createLine,
  createTube,
  disposeObject,
} from './labels.js';

const { Tmin, Tmax, depth } = EUTECTIC_DOMAIN;
const W = 10;
const H = 6.0;
const X_MIN = -W / 2;
const X_MAX = W / 2;
const Z_FRONT = depth / 2;
const Z_BACK = -depth / 2;

const COLORS = {
  liquid: '#2dd4bf',
  bi: '#fb923c',
  cd: '#a78bfa',
  mix: '#a5b4fc',
  eutectic: '#f0abfc',
  tie: '#f0abfc',
  axis: 0x78b5c8,
  grid: 0x0d3344,
};

const mapX = (x) => X_MIN + x * W;
const mapT = (T) => 0.3 + ((T - Tmin) / (Tmax - Tmin)) * H;

function makeShape(points) {
  const shape = new THREE.Shape();
  points.forEach(([x, T], index) => {
    if (index === 0) shape.moveTo(mapX(x), mapT(T));
    else shape.lineTo(mapX(x), mapT(T));
  });
  shape.closePath();
  return shape;
}

function phaseMaterial(color, opacity) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.18,
    roughness: 0.38,
    metalness: 0.14,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

function setLinePoints(line, points) {
  const attr = line.geometry.attributes.position;
  if (!attr || attr.count !== points.length) return;
  points.forEach((point, index) => attr.setXYZ(index, point.x, point.y, point.z));
  attr.needsUpdate = true;
  if (line.material.isLineDashedMaterial) line.computeLineDistances();
}

function setLabel(sprite, text, color, height = 0.3) {
  if (!sprite) return;
  sprite.userData.update(text, {
    fontSize: 24,
    color,
    background: true,
    border: true,
    height,
    padding: 10,
  });
  sprite.material.color.set('#ffffff');
}

export class EutecticScene {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'eutectic-scene';
    this.labelsGroup = new THREE.Group();
    this.labelsGroup.name = 'eutectic-labels';
    this.pickables = [];
    this.visible = false;
    this.color = new THREE.Color(COLORS.liquid);
    this.markerPos = new THREE.Vector3();
    this.markerTarget = new THREE.Vector3();
    this.endA = new THREE.Vector3();
    this.endB = new THREE.Vector3();
    this.endATarget = new THREE.Vector3();
    this.endBTarget = new THREE.Vector3();
    this.labelTimer = 0;
    this.pulse = 0;
    this.scene.add(this.group);
    this.scene.add(this.labelsGroup);
    this.build();
  }

  build() {
    this.curves = eutecticCurves(120);
    this.buildFloor();
    this.buildRegions();
    this.buildBoundaries();
    this.buildAxes();
    this.buildStaticTieLines();
    this.buildRegionLabels();
    this.buildKeyPoints();
    this.buildStateMarkers();
  }

  buildFloor() {
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(9.4, 96),
      new THREE.MeshBasicMaterial({
        color: 0x04131d,
        transparent: true,
        opacity: 0.54,
        depthWrite: false,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.07;
    this.group.add(floor);

    const grid = new THREE.GridHelper(17.5, 20, COLORS.grid, 0x061c29);
    grid.position.y = -0.045;
    grid.material.transparent = true;
    grid.material.opacity = 0.5;
    grid.material.depthWrite = false;
    this.group.add(grid);

    const ring = createLine(
      Array.from({ length: 101 }, (_, i) => {
        const a = (i / 100) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(a) * 7.9, -0.03, Math.sin(a) * 7.9);
      }),
      0x1e6c80,
      0.26,
    );
    this.group.add(ring);
  }

  buildRegions() {
    const left = this.curves.left;
    const right = this.curves.right;
    const e = BI_CD.xE;
    const te = BI_CD.TE_C;

    const liquidPoints = [
      [0, Tmax],
      [1, Tmax],
    ];
    right
      .slice()
      .reverse()
      .forEach((p) => liquidPoints.push([p.x, p.T_C]));
    left
      .slice()
      .reverse()
      .forEach((p) => liquidPoints.push([p.x, p.T_C]));

    const liquidCdPoints = left.map((p) => [p.x, p.T_C]);
    liquidCdPoints.push([e, te], [0, te]);

    const liquidBiPoints = [[e, te], [1, te]];
    right
      .slice()
      .reverse()
      .forEach((p) => liquidBiPoints.push([p.x, p.T_C]));

    const solidPoints = [
      [0, Tmin],
      [1, Tmin],
      [1, te],
      [0, te],
    ];

    const regions = [
      { points: liquidPoints, color: COLORS.liquid, opacity: 0.17, key: 'liquid' },
      { points: liquidCdPoints, color: COLORS.cd, opacity: 0.18, key: 'liquid-solid-cd' },
      { points: liquidBiPoints, color: COLORS.bi, opacity: 0.18, key: 'liquid-solid-bi' },
      { points: solidPoints, color: COLORS.mix, opacity: 0.15, key: 'solid-mixture' },
    ];

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

      [Z_FRONT + 0.006, Z_BACK - 0.006].forEach((z, index) => {
        const points = region.points.map(([x, T]) => new THREE.Vector3(mapX(x), mapT(T), z));
        const outline = createLine(points, region.color, index === 0 ? 0.34 : 0.12);
        outline.renderOrder = 6;
        this.group.add(outline);
      });
    });
  }

  buildBoundaries() {
    const addBoundary = (points, color, radius = 0.02) => {
      [Z_FRONT + 0.025, Z_BACK - 0.025].forEach((z, index) => {
        const vectors = points.map((p) => new THREE.Vector3(mapX(p.x), mapT(p.T_C), z));
        const glow = createTube(vectors, color, radius * 2.8, index === 0 ? 0.13 : 0.04);
        glow.renderOrder = 7;
        this.group.add(glow);
        const tube = createTube(vectors, color, radius, index === 0 ? 0.9 : 0.2);
        tube.renderOrder = 8;
        this.group.add(tube);
      });
    };

    addBoundary(this.curves.left, COLORS.cd, 0.022);
    addBoundary(this.curves.right, COLORS.bi, 0.022);
    addBoundary(
      [
        { x: 0, T_C: BI_CD.TE_C },
        { x: 1, T_C: BI_CD.TE_C },
      ],
      COLORS.eutectic,
      0.024,
    );

    const solidusCd = [
      new THREE.Vector3(mapX(0), mapT(Tmin), Z_FRONT + 0.03),
      new THREE.Vector3(mapX(0), mapT(BI_CD.TmCd - 273.15), Z_FRONT + 0.03),
    ];
    const solidusBi = [
      new THREE.Vector3(mapX(1), mapT(Tmin), Z_FRONT + 0.03),
      new THREE.Vector3(mapX(1), mapT(BI_CD.TmBi - 273.15), Z_FRONT + 0.03),
    ];
    this.group.add(createLine(solidusCd, COLORS.cd, 0.35, true, 0.08, 0.07));
    this.group.add(createLine(solidusBi, COLORS.bi, 0.35, true, 0.08, 0.07));
  }

  buildAxes() {
    const axisGroup = new THREE.Group();
    this.group.add(axisGroup);

    const xAxis = createLine(
      [
        new THREE.Vector3(X_MIN - 0.2, -0.02, Z_FRONT + 0.42),
        new THREE.Vector3(X_MAX + 0.2, -0.02, Z_FRONT + 0.42),
      ],
      COLORS.axis,
      0.9,
    );
    axisGroup.add(xAxis);

    const tAxis = createLine(
      [
        new THREE.Vector3(X_MIN - 0.42, -0.02, Z_FRONT + 0.2),
        new THREE.Vector3(X_MIN - 0.42, H + 0.25, Z_FRONT + 0.2),
      ],
      COLORS.axis,
      0.9,
    );
    axisGroup.add(tAxis);

    const box = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, depth)),
      new THREE.LineBasicMaterial({
        color: 0x2e7b92,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      }),
    );
    box.position.set(0, H / 2, 0);
    axisGroup.add(box);

    [0, 0.2, 0.4, 0.6, 0.8, 1].forEach((x) => {
      const px = mapX(x);
      axisGroup.add(
        createLine(
          [
            new THREE.Vector3(px, -0.02, Z_FRONT + 0.28),
            new THREE.Vector3(px, -0.02, Z_FRONT + 0.58),
          ],
          COLORS.axis,
          0.6,
        ),
      );
      const label = makeTextSprite(x.toFixed(1), {
        fontSize: 24,
        color: '#d3f0f9',
        height: 0.22,
        weight: 400,
      });
      label.position.set(px, 0.2, Z_FRONT + 0.83);
      axisGroup.add(label);
    });

    [100, 150, 200, 250, 300, 340].forEach((T) => {
      const py = mapT(T);
      axisGroup.add(
        createLine(
          [
            new THREE.Vector3(X_MIN - 0.57, py, Z_FRONT + 0.2),
            new THREE.Vector3(X_MIN - 0.3, py, Z_FRONT + 0.2),
          ],
          COLORS.axis,
          0.6,
        ),
      );
      const label = makeTextSprite(`${T} °C`, {
        fontSize: 24,
        color: '#d3f0f9',
        height: 0.22,
        weight: 400,
        background: true,
        border: false,
        padding: 6,
      });
      label.position.set(X_MIN - 1.22, py, Z_FRONT + 0.24);
      axisGroup.add(label);
    });

    const xTitle = makeTextSprite('Bi 摩尔分数  x(Bi)  →', {
      fontSize: 28,
      color: '#e2f8ff',
      height: 0.26,
      weight: 500,
    });
    xTitle.position.set(mapX(0.5), 0.34, Z_FRONT + 0.96);
    axisGroup.add(xTitle);

    const tTitle = makeTextSprite('温度 T / °C', {
      fontSize: 29,
      color: '#e2f8ff',
      height: 0.27,
      weight: 500,
    });
    tTitle.position.set(X_MIN - 0.95, H + 0.5, Z_FRONT + 0.2);
    axisGroup.add(tTitle);

    const depthTitle = makeTextSprite('相区示意深度', {
      fontSize: 19,
      color: '#547a8c',
      height: 0.16,
      weight: 400,
    });
    depthTitle.position.set(X_MIN - 1.0, 0.28, 0);
    axisGroup.add(depthTitle);
  }

  buildStaticTieLines() {
    [160, 180, 210, 240, 270, 300].forEach((T) => {
      if (T > BI_CD.TE_C && T < BI_CD.TmCd - 273.15) {
        const xL = liquidCompositionAt(T, 'cd');
        const points = [
          new THREE.Vector3(mapX(0), mapT(T), Z_FRONT + 0.15),
          new THREE.Vector3(mapX(xL), mapT(T), Z_FRONT + 0.15),
        ];
        const line = createLine(points, COLORS.cd, 0.14);
        line.renderOrder = 5;
        this.group.add(line);
      }
      if (T > BI_CD.TE_C && T < BI_CD.TmBi - 273.15) {
        const xL = liquidCompositionAt(T, 'bi');
        const points = [
          new THREE.Vector3(mapX(xL), mapT(T), Z_FRONT + 0.15),
          new THREE.Vector3(mapX(1), mapT(T), Z_FRONT + 0.15),
        ];
        const line = createLine(points, COLORS.bi, 0.14);
        line.renderOrder = 5;
        this.group.add(line);
      }
    });
  }

  buildRegionLabels() {
    const items = [
      { text: '液相 L', x: 0.52, T: 290, color: COLORS.liquid, height: 0.34 },
      { text: 'L + Cd(s)', x: 0.2, T: 175, color: COLORS.cd, height: 0.28 },
      { text: 'L + Bi(s)', x: 0.74, T: 185, color: COLORS.bi, height: 0.28 },
      { text: 'Bi(s) + Cd(s)', x: 0.5, T: 118, color: COLORS.mix, height: 0.27 },
    ];
    items.forEach((item) => {
      const sprite = makeTextSprite(item.text, {
        fontSize: 27,
        color: item.color,
        height: item.height,
        weight: 500,
        opacity: 0.75,
      });
      sprite.position.set(mapX(item.x), mapT(item.T), Z_FRONT + 0.3);
      this.labelsGroup.add(sprite);
    });
  }

  buildKeyPoints() {
    const addKeyPoint = ({ id, x, T, color, label, sub, size = 0.1, tooltip }) => {
      const g = new THREE.Group();
      const px = mapX(x);
      const py = mapT(T);
      g.position.set(px, py, Z_FRONT + 0.09);
      this.group.add(g);

      const mesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(size, 0),
        new THREE.MeshBasicMaterial({ color, toneMapped: false, depthWrite: false }),
      );
      g.add(mesh);
      const glow = makeGlowSprite('#ffffff', size * 7, 0.36);
      glow.material.color.set(color);
      g.add(glow);
      const ring = makeRingSprite('#ffffff', size * 4.6, 0.24);
      ring.material.color.set(color);
      g.add(ring);

      const labelSprite = makeTextSprite(`${label}\n${sub}`, {
        fontSize: 24,
        color,
        background: true,
        border: true,
        height: 0.34,
        weight: 500,
        padding: 11,
      });
      labelSprite.position.set(px, py + size + 0.56, Z_FRONT + 0.18);
      this.labelsGroup.add(labelSprite);

      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(size * 3, 12, 10),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      );
      hit.position.copy(g.position);
      hit.userData = { kind: 'eutectic-marker', id, label, tooltip };
      this.group.add(hit);
      this.pickables.push(hit);
    };

    addKeyPoint({
      id: 'eutectic',
      x: BI_CD.xE,
      T: BI_CD.TE_C,
      color: COLORS.eutectic,
      label: '低共熔点 E',
      sub: `${BI_CD.TE_C.toFixed(1)} °C · x(Bi)=${BI_CD.xE.toFixed(3)}`,
      size: 0.12,
      tooltip: '低共熔三相共存：L_E ⇌ Bi(s) + Cd(s)。点击跳转。',
    });
    addKeyPoint({
      id: 'pure-bi',
      x: 1,
      T: BI_CD.TmBi - 273.15,
      color: COLORS.bi,
      label: '纯 Bi 熔点',
      sub: `${(BI_CD.TmBi - 273.15).toFixed(1)} °C`,
      size: 0.075,
      tooltip: '纯 Bi 熔点 271.4 °C。点击跳转。',
    });
    addKeyPoint({
      id: 'pure-cd',
      x: 0,
      T: BI_CD.TmCd - 273.15,
      color: COLORS.cd,
      label: '纯 Cd 熔点',
      sub: `${(BI_CD.TmCd - 273.15).toFixed(2)} °C`,
      size: 0.075,
      tooltip: '纯 Cd 熔点 321.07 °C。点击跳转。',
    });
  }

  buildStateMarkers() {
    const stateGroup = new THREE.Group();
    this.group.add(stateGroup);
    this.stateGroup = stateGroup;

    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.12, 0),
      new THREE.MeshBasicMaterial({ color: COLORS.liquid, toneMapped: false, depthWrite: false }),
    );
    core.renderOrder = 15;
    stateGroup.add(core);
    this.core = core;

    const glow = makeGlowSprite('#ffffff', 1.2, 0.58);
    glow.material.color.set(COLORS.liquid);
    stateGroup.add(glow);
    this.markerGlow = glow;

    const ring = makeRingSprite('#ffffff', 0.66, 0.45);
    ring.material.color.set(COLORS.liquid);
    stateGroup.add(ring);
    this.markerRing = ring;

    const light = new THREE.PointLight(0x2dd4bf, 4.3, 6, 2);
    stateGroup.add(light);
    this.markerLight = light;

    this.markerPos.set(mapX(0.5), mapT(250), Z_FRONT + 0.3);
    this.markerTarget.copy(this.markerPos);
    stateGroup.position.copy(this.markerPos);

    this.verticalGuide = createLine(
      [new THREE.Vector3(), new THREE.Vector3()],
      COLORS.liquid,
      0.38,
      true,
      0.09,
      0.07,
    );
    this.verticalGuide.renderOrder = 9;
    this.group.add(this.verticalGuide);

    this.horizontalGuide = createLine(
      [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
      COLORS.liquid,
      0.25,
      true,
      0.09,
      0.07,
    );
    this.horizontalGuide.renderOrder = 9;
    this.group.add(this.horizontalGuide);

    this.tieRod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 1, 7),
      new THREE.MeshBasicMaterial({
        color: COLORS.eutectic,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.tieRod.visible = false;
    this.tieRod.renderOrder = 12;
    this.group.add(this.tieRod);

    const endAGroup = new THREE.Group();
    const endACore = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 20, 16),
      new THREE.MeshBasicMaterial({ color: COLORS.liquid, toneMapped: false, depthWrite: false }),
    );
    endAGroup.add(endACore);
    const endAGlow = makeGlowSprite('#ffffff', 0.55, 0.4);
    endAGlow.material.color.set(COLORS.liquid);
    endAGroup.add(endAGlow);
    this.group.add(endAGroup);
    this.endAGroup = endAGroup;
    this.endACore = endACore;
    this.endAGlow = endAGlow;

    const endBGroup = new THREE.Group();
    const endBCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 20, 16),
      new THREE.MeshBasicMaterial({ color: COLORS.bi, toneMapped: false, depthWrite: false }),
    );
    endBGroup.add(endBCore);
    const endBGlow = makeGlowSprite('#ffffff', 0.55, 0.4);
    endBGlow.material.color.set(COLORS.bi);
    endBGroup.add(endBGlow);
    this.group.add(endBGroup);
    this.endBGroup = endBGroup;
    this.endBCore = endBCore;
    this.endBGlow = endBGlow;

    this.endALabel = makeTextSprite('x_L', {
      fontSize: 22,
      color: COLORS.liquid,
      background: true,
      border: true,
      height: 0.28,
      padding: 9,
    });
    this.endBLabel = makeTextSprite('x_S', {
      fontSize: 22,
      color: COLORS.bi,
      background: true,
      border: true,
      height: 0.28,
      padding: 9,
    });
    this.overallLabel = makeTextSprite('当前状态', {
      fontSize: 22,
      color: '#dffaff',
      background: true,
      border: true,
      height: 0.3,
      padding: 9,
    });
    this.labelsGroup.add(this.endALabel);
    this.labelsGroup.add(this.endBLabel);
    this.labelsGroup.add(this.overallLabel);

    this.endALabel.visible = false;
    this.endBLabel.visible = false;
    this.endAGroup.visible = false;
    this.endBGroup.visible = false;
  }

  setVisible(visible) {
    this.visible = visible;
    this.group.visible = visible;
    this.labelsGroup.visible = visible;
  }

  setLabelsVisible(visible) {
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
    this.markerTarget.set(mapX(state.x), mapT(state.T), Z_FRONT + 0.3);
    this.markerPos.lerp(this.markerTarget, 1 - Math.exp(-delta * 12));
    this.stateGroup.position.copy(this.markerPos);

    const target = new THREE.Color(state.color);
    this.color.lerp(target, 1 - Math.exp(-delta * 8));
    this.core.material.color.copy(this.color);
    this.markerGlow.material.color.copy(this.color);
    this.markerRing.material.color.copy(this.color);
    this.markerLight.color.copy(this.color);
    this.markerLight.intensity = 4.2 + Math.sin(time * 3.2) * 0.6;

    this.markerRing.scale.setScalar(1 + Math.sin(time * 2.8) * 0.08);
    if (this.pulse > 0) {
      this.pulse = Math.max(0, this.pulse - delta * 1.8);
      this.markerRing.scale.setScalar(1 + (1 - this.pulse) * 2.5);
      this.markerRing.material.opacity = 0.52 * this.pulse;
    } else {
      this.markerRing.material.opacity = 0.4 + Math.sin(time * 2.8) * 0.08;
    }

    const vPoints = [
      new THREE.Vector3(this.markerPos.x, 0.02, this.markerPos.z),
      new THREE.Vector3(this.markerPos.x, Math.max(0.2, this.markerPos.y - 0.15), this.markerPos.z),
    ];
    setLinePoints(this.verticalGuide, vPoints);
    this.verticalGuide.material.color.copy(this.color);

    const hPoints = [
      new THREE.Vector3(this.markerPos.x, this.markerPos.y, this.markerPos.z),
      new THREE.Vector3(this.markerPos.x, this.markerPos.y, Z_FRONT + 0.2),
      new THREE.Vector3(X_MIN - 0.55, this.markerPos.y, Z_FRONT + 0.2),
    ];
    setLinePoints(this.horizontalGuide, hPoints);
    this.horizontalGuide.material.color.copy(this.color);

    const isTwoPhase =
      state.xL !== null &&
      state.xS !== null &&
      (state.phaseKey === 'liquid-solid-cd' || state.phaseKey === 'liquid-solid-bi');
    const isSolidMix = state.phaseKey === 'solid-mixture';
    const isEutectic = state.phaseKey === 'eutectic';

    if (isTwoPhase || isSolidMix || isEutectic) {
      let aX;
      let bX;
      let aColor;
      let bColor;
      let aText;
      let bText;
      if (isTwoPhase) {
        aX = state.xL;
        bX = state.xS;
        aColor = COLORS.liquid;
        bColor = state.xS === 0 ? COLORS.cd : COLORS.bi;
        aText = `液相 x = ${state.xL.toFixed(3)}`;
        bText = `${state.xS === 0 ? 'Cd(s)' : 'Bi(s)'}`;
      } else {
        aX = 0;
        bX = 1;
        aColor = COLORS.cd;
        bColor = COLORS.bi;
        aText = 'Cd(s)';
        bText = 'Bi(s)';
      }

      this.endATarget.set(mapX(aX), mapT(state.T), Z_FRONT + 0.27);
      this.endBTarget.set(mapX(bX), mapT(state.T), Z_FRONT + 0.27);
      this.endA.lerp(this.endATarget, 1 - Math.exp(-delta * 12));
      this.endB.lerp(this.endBTarget, 1 - Math.exp(-delta * 12));
      this.endAGroup.position.copy(this.endA);
      this.endBGroup.position.copy(this.endB);
      this.endAGroup.visible = true;
      this.endBGroup.visible = true;
      this.endACore.material.color.set(aColor);
      this.endAGlow.material.color.set(aColor);
      this.endBCore.material.color.set(bColor);
      this.endBGlow.material.color.set(bColor);
      this.endALabel.visible = true;
      this.endBLabel.visible = true;
      this.endALabel.position.copy(this.endA).add(new THREE.Vector3(0, 0.34, 0.06));
      this.endBLabel.position.copy(this.endB).add(new THREE.Vector3(0, 0.34, 0.06));

      const direction = this.endB.clone().sub(this.endA);
      const length = direction.length();
      if (length > 1e-5) {
        this.tieRod.visible = true;
        this.tieRod.position.copy(this.endA).addScaledVector(direction, 0.5);
        this.tieRod.scale.set(1, length, 1);
        this.tieRod.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          direction.normalize(),
        );
        this.tieRod.material.color.set(isEutectic ? COLORS.eutectic : COLORS.tie || 0xf0abfc);
      }
      this.tieRod.visible = true;
    } else {
      this.endAGroup.visible = false;
      this.endBGroup.visible = false;
      this.endALabel.visible = false;
      this.endBLabel.visible = false;
      this.tieRod.visible = false;
    }

    this.overallLabel.position.copy(this.markerPos).add(new THREE.Vector3(0, 0.48, 0.1));
    this.overallLabel.material.color.set('#ffffff');

    if (this.labelTimer > 0.12) {
      this.labelTimer = 0;
      setLabel(this.overallLabel, `当前状态 x=${state.x.toFixed(3)} · ${state.T.toFixed(1)} °C`, '#dffaff', 0.3);
      if (isTwoPhase) {
        setLabel(this.endALabel, `液相 x = ${state.xL.toFixed(3)}`, '#dffaff', 0.28);
        setLabel(this.endBLabel, `${state.xS === 0 ? 'Cd(s)' : 'Bi(s)'}`, state.xS === 0 ? '#c4b5fd' : '#fdba74', 0.28);
      } else if (isSolidMix) {
        setLabel(this.endALabel, 'Cd(s)', '#c4b5fd', 0.28);
        setLabel(this.endBLabel, 'Bi(s)', '#fdba74', 0.28);
      } else if (isEutectic) {
        setLabel(this.endALabel, 'Cd(s)', '#c4b5fd', 0.28);
        setLabel(this.endBLabel, 'Bi(s)', '#fdba74', 0.28);
      }
    }
  }

  dispose() {
    disposeObject(this.group);
    disposeObject(this.labelsGroup);
    this.scene.remove(this.group);
    this.scene.remove(this.labelsGroup);
  }
}
