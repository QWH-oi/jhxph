/**
 * 科学内核验收脚本：
 *   node scripts/verify-science.mjs
 * 仅检查数值模型与相律，不渲染三维场景。
 */
import assert from 'node:assert/strict';
import {
  WATER,
  waterSaturationPressure,
  waterSaturationTemperature,
  waterSublimationPressure,
  waterMeltingTemperature,
  waterPhaseAt,
  waterCurves,
  BINARY_SYSTEMS,
  bubblePoint,
  azeotrope,
  binaryPurePoints,
  binaryStateAt,
  vleCurve,
} from '../src/science.js';
import {
  BI_CD,
  biCdStateAt,
  biLiquidusK,
  cdLiquidusK,
  liquidCompositionAt,
  weightPercentBi,
} from '../src/eutectic.js';

const close = (actual, expected, tolerance, label) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected} ± ${tolerance}, got ${actual}`,
  );
  console.log(`  ✓ ${label}: ${actual.toFixed(6)}`);
};

console.log('\n[1] 单组分水：特征点与饱和曲线');
close(WATER.T_TRIPLE, 273.16, 1e-9, '三相点温度');
close(WATER.P_TRIPLE, 611.657, 1e-6, '三相点压强');
close(WATER.T_CRIT, 647.096, 1e-9, '临界温度');
close(WATER.P_CRIT, 22.064e6, 1, '临界压强');
close(waterSaturationPressure(WATER.T_TRIPLE), WATER.P_TRIPLE, 0.01, 'Wagner 方程在三相点');
close(waterSaturationPressure(373.15), 101325, 1100, '常压沸点附近的饱和蒸气压');
close(waterSaturationTemperature(101325), 373.15, 0.1, '反解常压沸点');
close(waterSublimationPressure(253.15), 103.67, 0.5, '−20 °C 冰的升华压强');
close(waterMeltingTemperature(101325), 273.1525, 0.01, '常压熔点');

console.log('\n[2] 单组分相律与相态判定');
const tests = [
  { T: 298.15, P: 101325, phase: '液相', Pn: 1, F: 2 },
  { T: 273.15, P: 101325, phase: '固–液共存', Pn: 2, F: 1 },
  { T: 373.15, P: 101325, phase: '液–气共存', Pn: 2, F: 1 },
  { T: 273.16, P: 611.657, phase: '三相点', Pn: 3, F: 0 },
  { T: 647.096, P: 22.064e6, phase: '临界点', Pn: 2, F: 1 },
  { T: 680, P: 30e6, phase: '超临界流体', Pn: 1, F: 2 },
  { T: 253.15, P: 103.67, phase: '固–气共存', Pn: 2, F: 1 },
];
for (const item of tests) {
  const state = waterPhaseAt(item.T, item.P);
  assert.equal(state.phase, item.phase, `${item.T} K / ${item.P} Pa 相态`);
  assert.equal(state.phases, item.Pn, `${item.T} K / ${item.P} Pa 相数`);
  assert.equal(state.F, item.F, `${item.T} K / ${item.P} Pa 自由度`);
  console.log(`  ✓ ${item.T} K / ${item.P} Pa → ${state.phase} (P=${state.phases}, F=${state.F})`);
}

const curves = waterCurves();
assert.ok(curves.vaporization.length > 100, '汽化曲线采样');
assert.ok(curves.fusion.at(-1).T < curves.fusion[0].T, '熔化曲线具有负斜率');
assert.ok(curves.sublimation[0].P < curves.sublimation.at(-1).P, '升华曲线随温度单调递增');
console.log('  ✓ 三相边界曲线采样与负斜率检查通过');

console.log('\n[3] 双组分乙醇–水：共沸点');
const system = BINARY_SYSTEMS['ethanol-water'];
const az = azeotrope(system, 1);
assert.ok(az, '应存在共沸点');
close(az.T, 78.2, 0.25, '常压共沸温度');
close(az.x, 0.895, 0.012, '常压共沸组成');
console.log(`  ✓ 共沸点 x = y = ${az.x.toFixed(4)}`);

const bubble = bubblePoint(system, 0.3, 1);
assert.ok(bubble.T_C > 79 && bubble.T_C < 83, 'x=0.3 泡点应在 80 °C 左右');
assert.ok(bubble.y1 > 0.3, '乙醇在气相中富集');
console.log(`  ✓ x=0.3 泡点 ${bubble.T_C.toFixed(2)} °C，y=${bubble.y1.toFixed(4)}`);

const curve = vleCurve(system, 1);
assert.ok(curve.points.length > 100, 'VLE 曲线采样');
assert.ok(curve.points[0].T > 99, '纯水沸点接近 100 °C');
assert.ok(curve.points.at(-1).T > 78 && curve.points.at(-1).T < 79, '纯乙醇沸点接近 78.3 °C');
console.log('  ✓ 双组分端点沸点检查通过');

console.log('\n[4] 双组分相律与杠杆规则');
const twoPhase = binaryStateAt(system, 1, 0.3, 85);
assert.equal(twoPhase.phases, 2, 'z=0.3, 85 °C 应为两相');
assert.equal(twoPhase.F, 2, '双组分两相 F=2');
assert.equal(twoPhase.fixedPF, 1, '固定 P 后 f=1');
assert.ok(twoPhase.x < 0.3 && twoPhase.y > 0.3, '两相组成应跨过总组成');
close(twoPhase.x * twoPhase.liqFrac + twoPhase.y * twoPhase.vapFrac, 0.3, 1e-4, '杠杆规则');
console.log(
  `  ✓ x=${twoPhase.x.toFixed(4)}, y=${twoPhase.y.toFixed(4)}, L=${twoPhase.liqFrac.toFixed(3)}`,
);

const liquid = binaryStateAt(system, 1, 0.3, 75);
assert.equal(liquid.phases, 1, '低于泡点应为液相');
assert.equal(liquid.F, 3, '双组分单相 F=3');
assert.equal(liquid.fixedPF, 2, '固定 P 后 f=2');
console.log(`  ✓ 75 °C 为 ${liquid.phase}，F=${liquid.F}，固定 P 后 f=${liquid.fixedPF}`);

const azeoState = binaryStateAt(system, 1, az.x, az.T);
assert.equal(azeoState.phaseKey, 'azeotrope', '共沸点状态');
assert.equal(azeoState.F, 2, '共沸点相律基准 F=2');
assert.equal(azeoState.fixedPF, 0, '共沸点固定 P 后 f*=0');
console.log('  ✓ 共沸点状态与固定 P 有效自由度检查通过');

const ideal = BINARY_SYSTEMS['benzene-toluene'];
assert.equal(azeotrope(ideal, 1), null, '理想体系不应有共沸点');
const pure = binaryPurePoints(ideal, 1);
assert.ok(pure.component1.T > 78 && pure.component1.T < 82, '纯苯沸点');
assert.ok(pure.component2.T > 109 && pure.component2.T < 112, '纯甲苯沸点');
console.log('  ✓ 苯–甲苯理想体系无共沸点，纯组分沸点正确');

console.log('\n[5] Bi–Cd 简单低共熔体系');
close(BI_CD.TE_C, 144.0, 1e-9, 'Bi–Cd 低共熔温度');
close(BI_CD.xE, 0.446, 1e-9, 'Bi–Cd 低共熔组成 x(Bi)');
close(weightPercentBi(BI_CD.xE), 59.95, 0.1, '低共熔组成 wt% Bi');
close(biLiquidusK(BI_CD.xE) - 273.15, BI_CD.TE_C, 1e-6, 'Bi 液相线在 E 点');
close(cdLiquidusK(BI_CD.xE) - 273.15, BI_CD.TE_C, 1e-6, 'Cd 液相线在 E 点');
close(biLiquidusK(1) - 273.15, 271.4, 1e-6, '纯 Bi 熔点');
close(cdLiquidusK(0) - 273.15, 321.07, 1e-6, '纯 Cd 熔点');
close(liquidCompositionAt(170, 'cd'), 0.3761, 0.0015, '170 °C Cd 侧液相组成');
close(liquidCompositionAt(200, 'bi'), 0.6808, 0.002, '200 °C Bi 侧液相组成');

const bcdStates = [
  { x: 0.5, T: 280, phaseKey: 'liquid', phases: 1, F: 3, f: 2 },
  { x: 0.5, T: 150, phaseKey: 'liquid-solid-bi', phases: 2, F: 2, f: 1 },
  { x: 0.3, T: 170, phaseKey: 'liquid-solid-cd', phases: 2, F: 2, f: 1 },
  { x: 0.5, T: 120, phaseKey: 'solid-mixture', phases: 2, F: 2, f: 1 },
  { x: BI_CD.xE, T: BI_CD.TE_C, phaseKey: 'eutectic', phases: 3, F: 1, f: 0 },
];
for (const item of bcdStates) {
  const state = biCdStateAt(item.x, item.T);
  assert.equal(state.phaseKey, item.phaseKey, `${item.x}, ${item.T} °C 相态`);
  assert.equal(state.phases, item.phases, `${item.x}, ${item.T} °C 相数`);
  assert.equal(state.F, item.F, `${item.x}, ${item.T} °C F`);
  assert.equal(state.fixedPF, item.f, `${item.x}, ${item.T} °C 固定 P f`);
  console.log(`  ✓ x=${item.x}, ${item.T} °C → ${state.phaseKey} (P=${state.phases}, F=${state.F}, f=${state.fixedPF})`);
}

const cdTwoPhase = biCdStateAt(0.3, 170);
close(cdTwoPhase.liquidFrac * cdTwoPhase.xL, 0.3, 1e-9, 'L + Cd(s) 杠杆质量平衡');
assert.ok(cdTwoPhase.liquidFrac > 0 && cdTwoPhase.liquidFrac < 1, 'L + Cd(s) 液相分数介于 0 与 1');

const biTwoPhase = biCdStateAt(0.5, 150);
close(
  biTwoPhase.liquidFrac * biTwoPhase.xL + biTwoPhase.solidFrac * 1,
  0.5,
  1e-9,
  'L + Bi(s) 杠杆质量平衡',
);

const solidMix = biCdStateAt(0.5, 120);
close(solidMix.biFrac, 0.5, 1e-9, '固相混合物 Bi(s) 分数');
close(solidMix.cdFrac, 0.5, 1e-9, '固相混合物 Cd(s) 分数');

const eutectic = biCdStateAt(BI_CD.xE, BI_CD.TE_C);
assert.equal(eutectic.phaseKey, 'eutectic', '低共熔三相状态');
assert.equal(eutectic.liquidFrac, null, '低共熔点液相分数不唯一');
assert.equal(eutectic.fixedPF, 0, '低共熔点固定 P 后 f=0');
assert.ok(cdTwoPhase.xL > 0.3 && cdTwoPhase.xL < BI_CD.xE, 'Cd 侧液相组成在 0 与 E 之间');
assert.ok(biTwoPhase.xL > BI_CD.xE && biTwoPhase.xL < 0.5, 'Bi 侧液相组成在 E 与总组成之间');
console.log('  ✓ Bi–Cd 液相线、杠杆规则、三相点与相律检查通过');

console.log('\n全部科学内核检查通过。\n');
