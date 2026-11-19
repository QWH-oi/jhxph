const CARD = (icon, title, body) => ({ icon, title, body });

export function getKnowledgeCards(mode, state, system) {
  if (mode === 'single') {
    const cards = [
      CARD('F', '相律的读数', 'F = C − P + 2。单组分 C = 1：单相 F = 2，两相共存 F = 1，三相点 F = 0。'),
    ];

    if (state.phaseKey === 'triple') {
      cards.unshift(
        CARD('TP', '三相点 ≠ 常压冰点', '水的三相点是 273.16 K、611.657 Pa；常压冰点还受空气溶解与压强影响。'),
      );
    } else if (state.phaseKey === 'critical') {
      cards.unshift(
        CARD('CP', '临界点之后', '温度高于 647.096 K、压强高于 22.064 MPa 时进入超临界区，气液界面消失，密度可连续变化。'),
      );
    } else if (state.phaseKey === 'solid-liquid') {
      cards.unshift(
        CARD('SL', '冰的反常熔化线', '水的熔化曲线斜率为负：加压使熔点降低。这是因为冰的密度小于液态水。'),
      );
    } else if (state.phaseKey === 'liquid-gas') {
      cards.unshift(
        CARD('LV', '饱和蒸气压', '液–气共存时，温度与饱和蒸气压一一对应。继续吸热会汽化，但温度停留在饱和温度。'),
      );
    } else if (state.phaseKey === 'solid-gas') {
      cards.unshift(
        CARD('SG', '升华', '当压强低于三相点压强时，冰可以直接升华为水蒸气，而不经过液相。'),
      );
    } else if (state.phaseKey === 'supercritical') {
      cards.unshift(
        CARD('SC', '超临界流体', '超临界流体兼具气体的扩散性和液体的溶解能力，常用于萃取与绿色化学。'),
      );
    } else if (state.phaseKey === 'liquid') {
      cards.push(CARD('LQ', '液相中的分子', '液态水保留短程氢键网络，分子可以平动、转动，但无法维持固定晶格。'));
    } else if (state.phaseKey === 'solid') {
      cards.push(CARD('SD', '固相中的分子', '冰中的水分子被氢键束缚在六方晶格附近，主要表现为振动，长程平动受限。'));
    } else if (state.phaseKey === 'gas') {
      cards.push(CARD('GS', '气相中的分子', '气相分子平均间距远大于分子直径，平动占主导，碰撞频率随温度升高而增加。'));
    }

    return cards.slice(0, 3);
  }

  if (system?.kind === 'eutectic') {
    const cards = [
      CARD(
        'F',
        '低共熔体系的相律',
        'C = 2。单液相 P=1 → F=3；两相区 P=2 → F=2；低共熔三相共存 P=3 → F=1。固定常压后 f = F − 1。',
      ),
      CARD(
        'E',
        '低共熔反应',
        'Bi–Cd 在约 144 °C、x(Bi) ≈ 0.446（约 60 wt% Bi）发生 L_E ⇌ Bi(s)+Cd(s)。简单低共熔没有中间化合物。',
      ),
    ];

    if (state.phaseKey === 'eutectic') {
      cards.unshift(
        CARD(
          '3P',
          '三相共存：相分数不唯一',
          '低共熔点是恒温三相点，固定压强后 f=0。整体组成与温度相同，但液相分数还取决于冷却/加热历史，不能只用杠杆规则唯一确定。',
        ),
      );
    } else if (state.phaseKey === 'liquid-solid-cd' || state.phaseKey === 'liquid-solid-bi') {
      cards.unshift(
        CARD(
          'LR',
          '液–固杠杆规则',
          state.phaseKey === 'liquid-solid-cd'
            ? 'L + Cd(s) 区：L = x / x_L，Cd(s) = 1 − L。x 越靠近 Cd 端，固体 Cd 越多。'
            : 'L + Bi(s) 区：L = (1 − x) / (1 − x_L)，Bi(s) = 1 − L。x 越靠近 Bi 端，固体 Bi 越多。',
        ),
      );
    } else if (state.phaseKey === 'solid-mixture') {
      cards.unshift(
        CARD(
          'SM',
          '两固相杠杆规则',
          '低共熔点以下为 Bi(s)+Cd(s) 机械混合物：Bi(s) 分数 = x，Cd(s) 分数 = 1 − x。两相共存，固定 P 后 f=1。',
        ),
      );
    } else if (state.phaseKey === 'liquid') {
      cards.unshift(
        CARD('LQ', '液相线', '全液相区。降温到液相线时，Bi 或 Cd 开始结晶；继续降温进入 L+Bi(s) 或 L+Cd(s) 两相区。'),
      );
    }

    cards.push(
      CARD(
        'CD',
        '冷却曲线与低共熔停歇',
        '低共熔组成的熔体冷却到 144 °C 时温度出现平台，直到液相全部转变为 Bi+Cd 共晶组织；非共晶组成先析出一种晶体，再到达共晶温度。',
      ),
    );

    return cards.slice(0, 3);
  }

  const cards = [
    CARD('F', '固定 P 的切片', '双组分体系 F = C − P + 2。固定总压后自动满足一个约束，因此界面同时给出 f = F − 1。'),
  ];

  if (state.phases === 2) {
    cards.unshift(
      CARD('LR', '杠杆规则', '液相分数 L = (y − z)/(y − x)，气相分数 V = 1 − L。z 越靠近哪一端，哪一相的量越多。'),
    );
  }
  if (state.phaseKey === 'azeotrope') {
    cards.unshift(
      CARD('AZ', '共沸点', '共沸时 x = y，两组分一起沸腾，简单蒸馏不能进一步改变组成。乙醇–水在常压下约 78.2 °C 共沸。'),
    );
  } else if (state.phaseKey === 'two-phase') {
    cards.unshift(
      CARD('VL', '两相区', '泡点与露点之间为液–气两相区。给定 T 后，平衡液相组成 x 与气相组成 y 由相平衡关系唯一确定。'),
    );
  } else if (state.phaseKey === 'liquid') {
    cards.push(CARD('BL', '泡点', '升温至泡点时，第一批气泡出现。对给定总组成 z，泡点温度可由泡点曲线读出。'));
  } else if (state.phaseKey === 'vapor') {
    cards.push(CARD('DP', '露点', '降温至露点时，第一批液滴出现。露点曲线对应给定气相组成的饱和状态。'));
  }

  if (system?.azeotropic) {
    cards.push(
      CARD('NR', '非理想溶液', '乙醇–水具有正偏差，活度系数由 NRTL 模型描述；共沸点处 x = y，相图出现“捏点”。'),
    );
  } else {
    cards.push(
      CARD('ID', '理想溶液', '苯–甲苯近似服从 Raoult 定律，泡点与露点曲线不闭合，因此可用普通精馏分离。'),
    );
  }

  return cards.slice(0, 3);
}
