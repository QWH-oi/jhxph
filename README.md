# 相衡 PHASE LAB

> 单组分 / 双组分相平衡三维交互实验室  
> An academic-tech 3D phase-equilibrium playground for physical chemistry teaching.

![单组分相图](docs/preview-single.png)

一个可直接运行的轻量 Web 工程：用 Three.js 把 P–T 相图、T–x–y 汽液平衡图与 Bi–Cd T–x 低共熔相图做成可旋转、可缩放、可实时调参的三维实验台。调节温度、总压或组成时，相图状态点、相区颜色、分子运动、相律自由度与数据面板同步更新。

## 功能一览

- **单组分体系（H₂O，P–T 相图）**
  - 固相、液相、气相、超临界流体四类相区
  - 升华线、熔化线（负斜率）、汽化线、三相点、临界点
  - 温度 200–700 K、压强 5 Pa–50 MPa（对数滑杆）
  - 曲线附近窄共存带：固–液、液–气、固–气
- **双组分体系（T–x–y 汽液平衡）**
  - 乙醇–水：Antoine + NRTL，非理想最低共沸体系
  - 苯–甲苯：Raoult 理想体系，无共沸点
  - 泡点线、露点线、结线、两相包络面、共沸点
  - 温度、总压、总组成 z 三个可调参数
  - 相组成 x / y、相分数 L / V 与杠杆规则实时计算
- **Bi–Cd 低共熔体系（T–x 固液平衡）**
  - 标准 Bi–Cd 简单低共熔相图：两条液相线、144 °C 低共熔点、Bi/Cd 纯组分熔点
  - 液相、L + Cd(s)、L + Bi(s)、Bi(s) + Cd(s) 与三相共存区
  - 温度与组成 x(Bi) 可调；系统点追踪
  - 当前结线、液相/固相端点、杠杆规则分数条与数值同步
  - 低共熔点三相共存时明确提示“相分数由热历史决定”，不误用杠杆规则
- **严格相律显示**
  - 吉布斯相律 `F = C − P + 2`
  - 单组分：单相 F=2，两相 F=1，三相点 F=0，临界点 F=1
  - 双组分：单相 F=3，两相 F=2，三相共存 F=1；固定常压切片另显示 `f = F − 1`
  - 共沸点附加约束 `x = y`，固定 P 时显示 `f* = 0`
  - Bi–Cd 低共熔点：P=3、F=1，固定常压 `f = 0`
- **交互与演示**
  - 鼠标拖拽旋转、滚轮缩放、右键平移；双击复位视角
  - 等轴测 / 正视 / 俯视视角
  - 自动演示（升温 → 相变 → 降温循环）与暂停
  - 一键重置、关键点标注、自动旋转、分子视窗开关
  - 点击三相点、临界点、共沸点、低共熔点、纯组分标记可快速定位
  - 快捷键：`Space` 播放/暂停、`R` 重置、`1` 单组分、`2` 双组分
- **教学信息架构**
  - 实时数据面板与自由度分解
  - “实时数据 / 知识讲解”双标签；知识卡随当前相态变化
  - 右侧分子运动三维视窗：固态晶格振动、液态短程有序、气态自由平动、两相动态平衡
  - 教学说明对话框、模型与边界说明

## 快速运行

环境：Node.js ≥ 20.19（本工程在 Node 24.21 / pnpm 11.28 下构建验证）。

```bash
cd phase-equilibrium-lab
pnpm install
pnpm dev
# 浏览器打开 http://127.0.0.1:5173/
```

生产构建与本地预览：

```bash
pnpm build
pnpm preview
# http://127.0.0.1:4173/
```

如果本机没有 pnpm，也可以使用 npm：

```bash
npm install
npm run dev
```

## 部署到 GitHub Pages

### 最快方式：上传已构建的静态文件

不需要安装 Node，直接使用仓库里的 [phase-lab-site.zip](phase-lab-site.zip)。

1. 注册/登录 GitHub，新建一个 **Public** 仓库，例如 `phase-lab`。
2. 下载并解压 `phase-lab-site.zip`。
3. 在仓库中点击 **Add file → Upload files**，把解压后的 `index.html`、`assets/`、`.nojekyll` 上传到**仓库根目录**，提交。
4. 进入 **Settings → Pages**。
5. **Build and deployment → Source** 选择 **Deploy from a branch**。
6. Branch 选择 `main`，文件夹选择 `/ (root)`，点击 **Save**。
7. 等待 1–3 分钟，访问 `https://<你的用户名>.github.io/<仓库名>/`。

> 注意：这种方式上传的是**构建后的网站**，不是 `src/` 源码。不要把源码直接放在分支根目录后再选 `/ (root)`，否则页面只会引用未编译的模块。

### 自动构建方式：GitHub Actions

仓库已包含 [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml)。

1. 新建 Public 仓库，上传完整工程源码（不要上传 `node_modules/` 和 `dist/`）。
2. 进入 **Settings → Pages**，将 **Source** 设为 **GitHub Actions**。
3. 推送到 `main` 分支，或在 **Actions** 中手动运行 `Deploy PHASE LAB to GitHub Pages`。
4. 工作流会自动执行 `pnpm install`、`pnpm build` 并发布 `dist/`。
5. 发布完成后，Pages 页面会显示公网地址。

GitHub Pages 对 Public 仓库免费；发布后手机和其他电脑都可以访问，不依赖本机开机。

## 可分享的初始状态

页面支持 URL 参数，便于课堂投屏或直接打开某个案例：

| URL | 效果 |
| --- | --- |
| `/?mode=single` | 单组分水相图 |
| `/?mode=single&preset=triple` | 直接打开三相点 |
| `/?mode=single&preset=critical` | 直接打开临界点 |
| `/?mode=binary&system=ethanol-water` | 乙醇–水双组分 |
| `/?mode=binary&preset=azeotrope` | 打开共沸点 |
| `/?mode=binary&system=benzene-toluene` | 苯–甲苯理想体系 |
| `/?mode=binary&system=bi-cd` | Bi–Cd 低共熔体系 |
| `/?mode=binary&system=bi-cd&preset=eutectic` | 直接打开 Bi–Cd 低共熔点 |
| `/?mode=binary&tab=knowledge` | 打开知识讲解标签 |
| `/?play=1` | 启动自动演示 |

## 科学模型

### 单组分水

- 饱和蒸气压：IAPWS Wagner 方程（Wagner & Pruß, 2002）
- 升华曲线：Clausius–Clapeyron 近似，`ΔH_sub = 51.0 kJ mol⁻¹`
- 熔化曲线：三相点邻域线性化，取冰 Ih 的负斜率 `dT/dP ≈ −7.4×10⁻⁸ K Pa⁻¹`
- 特征值：
  - 三相点 `273.16 K / 611.657 Pa`
  - 临界点 `647.096 K / 22.064 MPa`
- 三维图中的深度轴是分子间距 / 体积的视觉示意，不是独立热力学自由度。

### 双组分汽液平衡

- 纯组分饱和蒸气压：Antoine 方程
- 乙醇–水活度系数：NRTL 模型
  - `α = 0.30`
  - `τ₁₂ = −0.2299382`，`τ₂₁ = 2.26470458`
  - 常压重现共沸点约 `78.2 °C`、`x(乙醇) ≈ 0.895`
- 苯–甲苯：理想溶液，`γ = 1`
- 总压范围：0.25–3 atm；温度范围随总压自动调整。

### Bi–Cd 低共熔体系

- 标准数据：
  - `T_m(Bi) = 271.4 °C (544.55 K)`，`ΔH_fus(Bi) = 11.30 kJ mol⁻¹`
  - `T_m(Cd) = 321.07 °C (594.22 K)`，`ΔH_fus(Cd) = 6.19 kJ mol⁻¹`
  - 低共熔点 `T_E = 144.0 °C (417.15 K)`，`x(Bi) ≈ 0.446`（约 60 wt% Bi / 40 wt% Cd）
- 两条液相线由凝固点降低方程计算，并用两参数 Margules 活度系数对低共熔点做热力学一致校正；两条支线在 E 点严格相交。
- 固相按“Bi 与 Cd 互溶度可忽略”的简单低共熔模型处理：两相区为 L+Cd(s) 或 L+Bi(s)，低共熔点以下为 Bi(s)+Cd(s)。
- 杠杆规则：
  - `L + Cd(s)`：`L = x / x_L`，`Cd(s) = 1 − L`
  - `L + Bi(s)`：`L = (1 − x)/(1 − x_L)`，`Bi(s) = 1 − L`
  - 低共熔点以下：`Bi(s) = x`，`Cd(s) = 1 − x`
- 低共熔点三相共存时，相分数不由 T、x 唯一确定，界面显示“— / 热历史相关”，避免把两相杠杆规则错误套用到三相点。

### 相律与固定压强切片

- 基准相律：`F = C − P + 2`
- 双组分相图固定总压时：`f = F − 1`
  - 单相：`F=3 → f=2`
  - 两相：`F=2 → f=1`
  - 低共熔三相：`F=1 → f=0`
- 共沸点满足 `x = y` 的附加约束，固定总压时该点温度与组成同时确定（`f* = 0`）；界面同时保留相律基准 `F=2`，避免把共沸约束误当成相律本身。

### 交互判定与精度

- 相边界附近使用窄共存带（约 `±0.12 K` 或 `±0.8% P`）显示两相状态，便于鼠标/滑杆交互。
- 这是**教学可视化判定带**，不是将平衡态拓宽为有限区域；帮助文档与数据脚注中均有说明。
- Bi–Cd 低共熔模型忽略固相互溶度、金属间化合物与动力学过冷；用于教学演示，不是相图计算软件。
- 本工程不包含完整 IAPWS-95 状态方程、活度系数随温度变化、固相多晶型或动力学过冷/成核模型。

## 工程结构

```
phase-equilibrium-lab/
├─ index.html                  # 页面骨架、面板、帮助对话框
├─ src/
│  ├─ main.js                  # 场景初始化、状态机、交互、自动演示
│  ├─ science.js               # 汽液平衡与单组分相平衡计算内核
│  ├─ eutectic.js              # Bi–Cd 低共熔 T–x 模型、相态与杠杆规则
│  ├─ knowledge.js             # 随相态变化的知识卡
│  ├─ styles.css               # 学术科技风视觉系统与响应式布局
│  └─ three/
│     ├─ singleScene.js        # 单组分 P–T 三维相图
│     ├─ binaryScene.js        # 双组分 T–x–y 三维相图
│     ├─ eutecticScene.js      # Bi–Cd T–x 低共熔三维相图与结线
│     ├─ molecules.js          # 分子运动视窗
│     └─ labels.js             # Canvas 文本精灵、发光体、曲线工具
├─ scripts/
│  ├─ verify-science.mjs       # 数值与相律验收
│  └─ e2e-cdp.mjs              # Edge CDP 交互验收 + 预览截图
├─ docs/                       # README 预览图
├─ vite.config.js
├─ package.json
└─ pnpm-lock.yaml
```

## 验证

### 1. 科学内核

```bash
node scripts/verify-science.mjs
```

检查内容：

- 三相点 / 临界点数值
- Wagner 饱和曲线与常压沸点
- 升华压强与负斜率熔化线
- 单组分各相态下的相数与 F
- 乙醇–水共沸点 `78.2 °C / x=0.895`
- 双组分杠杆规则、单相 F=3、两相 F=2
- 苯–甲苯无共沸点与纯组分沸点
- Bi–Cd 低共熔点 `144 °C / x(Bi)=0.446`（59.95 wt% Bi）
- Bi–Cd 两条液相线在 E 点相交、纯 Bi/Cd 熔点
- L+Cd、L+Bi 两相杠杆质量平衡、Bi+Cd 固相分数
- 低共熔三相 P=3、F=1、固定常压 f=0

### 2. 浏览器交互

`scripts/e2e-cdp.mjs` 会通过 Edge 调试端口执行 40 项交互检查，并输出 `docs/preview-*.png`：

- 模式切换、预设应用、知识标签切换
- 自动演示播放/暂停、重置
- 滑杆实时联动
- 共沸点、三相点、自由度显示
- Bi–Cd 低共熔点、L+Cd/L+Bi、固相混合物、杠杆条与知识卡
- 未捕获异常检测

示例启动方式（Windows）：

```powershell
# 终端 1：启动预览
pnpm preview

# 终端 2：启动带调试端口的 Edge
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" `
  --headless=new --remote-debugging-port=9223 `
  --window-size=1600,1000 "http://127.0.0.1:4173/"

# 终端 3：运行验收
node scripts/e2e-cdp.mjs
```

本工程已通过：`40/40` 浏览器交互检查、科学内核全部断言、生产构建。

## 预览

| 单组分 P–T | 双组分 T–x–y |
| --- | --- |
| ![单组分](docs/preview-single.png) | ![双组分](docs/preview-binary.png) |

| 知识讲解 | 理想体系 |
| --- | --- |
| ![知识讲解](docs/preview-knowledge.png) | ![苯–甲苯](docs/preview-ideal.png) |

| Bi–Cd L + Cd(s) | Bi–Cd 低共熔三相 |
| --- | --- |
| ![Bi–Cd 两相区](docs/preview-bi-cd.png) | ![Bi–Cd 低共熔点](docs/preview-bi-cd-eutectic.png) |

## 设计说明

- **视觉语言**：深空蓝黑背景、青蓝液相、紫色 Cd 相、琥珀 Bi 相、品红低共熔线；玻璃拟态面板与细网格，兼顾学术报告与课堂投屏。
- **三维表达**：单组分与 Bi–Cd 用 T–x/P–T 平面的厚度挤出表达相区体积；双组分汽液平衡把液相组成 x、气相组成 y 与温度 T 分成三个空间轴，用结线曲面表达两相区。
- **性能**：Three.js + Vite，生产包 gzip 约 187 KB；单个 RAF 循环驱动主场景与分子视窗，移动端降级为可滚动的纵向布局。
- **离线优先**：所有依赖本地安装，无云端 API、无外部字体、无付费服务；预览页的 three.js 由构建产物提供。

## 参考

- Wagner, W., & Pruß, A. (2002). The IAPWS Formulation 1995 for the Thermodynamic Properties of Ordinary Water Substance for General and Scientific Use.
- Renon, H., & Prausnitz, J. M. (1968). Local compositions in thermodynamic excess functions for liquid mixtures. *AIChE Journal*.
- Poling, B. E., Prausnitz, J. M., & O'Connell, J. P. *The Properties of Gases and Liquids* (Antoine constants).
- Massalski, T. B. (Ed.). *Binary Alloy Phase Diagrams*. ASM International（Bi–Cd 相图与低共熔数据）.
- Hultgren, R., et al. *Selected Values of Thermodynamic Properties of Metals and Alloys*（Bi/Cd 熔化焓）.
- Atkins, P., & de Paula, J. *Physical Chemistry*（相律与相图章节）。

---

本项目在当前 DeepSeek Harness 工作区内开发，使用 Vite + Three.js，不依赖 DSH 私有接口；既可作为 Harness 工作区工程运行，也可作为独立静态 Web 工程部署。
