# 神经元大脑（原 neuron-inspiration · 神经元灵感系统）

> **定位（2026-07-29 升格）**：不只是小游戏的灵感插件——目标是长成一个**第二大脑**：任何项目、任何 agent 都能把自己的概念/知识灌进来，让它跑模拟、碰撞灵感、输出思考。当前第一个「宿主」是 daily-games 每日小游戏。

把「灵感诞生」做成可运行、可观测的机制：多源扫描（游戏历史/热点/知识库/采集站/经典玩法/个人爽感），长出一群**带权重的神经元**（概念），它们之间用**突触**相连（共现→关联，几乎不共现→断触），按**脑区**分块；开「可塑性」就自己跑、自己演化。

## 文件结构
```
神经元大脑/
├── index-3d.html   # 🆕 3D 可视化页：Three.js 深空神经元星图（推荐！）
├── lib/            # 🆕 Three.js r128 本地库（three.min.js + OrbitControls.js），离线可用
├── neuron-3d.js    # 🆕 Three.js 3D 渲染引擎（搜索飞行/时间轨迹/无限拖动）
├── index.html      # 2D Canvas 可视化页（轻量备用）
├── engine.js       # 核心引擎（神经元/突触/可塑性/抽取/模拟，浏览器+Node 双用）
├── gamedata.js     # 由 gen-data.cjs 从 daily-games 历史生成（概念图数据）
├── gen-data.cjs    # 重新生成 gamedata.js（daily-games 新增游戏后跑一次）
├── run.cjs         # 无头后台执行器（供自动化调用，产出种子+思考记录）
├── last-run.json   # run.cjs 产出：本次灵感种子（自动化读取）
├── thinking-log.md # run.cjs 产出：思考过程与激活通路（可读记录）
└── README.md
```

## 🌌 3D 版本（index-3d.html）— 推荐
用 **Three.js** 渲染的深空神经元星图，对标你给的那张参考截图：

| 特性 | 说明 |
|------|------|
| **3D 神经元** | 发光球体，大小=权重，颜色=脑区，激活时脉冲呼吸 |
| **突触三态** | active(亮白实线) / weakened(橙淡线) / **broken 断触**(灰隐) |
| **脑区聚类布局** | 五域分散在 3D 空间形成有机"大脑"形状 |
| **搜索 + 飞行跳转** | 输入词→匹配概念→相机平滑飞到目标位置 |
| **时间维度（4D）** | 激活脉冲沿突触传播 + 历史轨迹粒子系统 |
| **无限拖动/缩放/旋转** | OrbitControls 无边界限制，图谱再大也能漫游 |
| **性能优化** | InstancedMesh 批量渲染 / 视锥剔除 / LOD / 距离衰减 |

### 操作方式
- 🖱 **左键拖动** → 旋转视角
- 🖱 **滚轮** → 缩放（无边界，可拉极远或推极近）
- 🖱 **右键拖动** → 平移
- 🔍 **搜索框** → 输入概念/关键词 → 自动飞行到目标
- ▶️ **可塑性运行** → 开启后图谱持续演化
- ⚡ **跑一次模拟** → 完整模拟→输出种子+思考轨迹
- 💉 **注入实时词** → 叠加对话中的词汇影响权重

## 2D 版本（index.html）— 轻量备用
Canvas 2D 渲染，功能完整但无 3D 效果。适合低配设备或不需要 3D 的场景。

## 模型（生物学对齐）
- **神经元 Neuron**：有 `weight`（大小）= 历史出现频率 + 近因 + 实时对话叠加。
- **突触 Synapse**：两概念关联，`strength`=共现强度，`state`∈{active / weakened / broken(断触)}，`myelin`=成熟度。
- **脑区 Region**：五域（情绪/意象/机制/风格/元素）着色分块。
- **可塑性 Plasticity**：Hebbian 共激活强化、长期不用→衰减修剪(断触)、近因提升。开页即自动运行并演化。

## 两种运行模式
**① 页面演示（人看）**：双击 `index-3d.html`。输入框叠加实时对话词→点亮对应神经元；「可塑性/自动运行」开关控制是否持续演化；「导出种子」跑一次模拟并给出灵感焦点+思考轨迹+种子 JSON。

**② 自动化后台（机器跑）**：两个每日游戏自动化执行前，先用一条命令跑模拟：
```bash
node run.cjs --words "（昨日的主题或随机词）" --steps 240
```
→ 产出 `last-run.json` + `thinking-log.md` → 自动化读取种子(promptHint / coreConcepts)，结合治愈约束去深度思考/检索，再开始做游戏。

> 接入自动化只需在自动化 prompt 开头加要求：「每次生成前，先调用 神经元大脑 跑一次灵感模拟并记录思考过程，围绕产出的核心概念 + 无惩罚/留白/60fps 约束做方案。」

## 放置方式
整个 `神经元大脑/` 文件夹可拷贝进**任意项目 / agent 目录**，零依赖（vanilla JS + Node）。`gamedata.js` 已预生成；若 daily-games 新增了游戏，跑一次 `node gen-data.cjs` 刷新即可。

## 重新生成数据
```bash
cd <仓库根目录>
node gen-data.cjs
```
读取宿主项目 daily-games 的 `manifest.json`（位于其项目根目录），重建概念图（权重随历史变化）。

## 本地依赖与修复说明（v1.1）
- **Three.js 已本地化**：`lib/three.min.js`(r128) + `lib/OrbitControls.js`(r128)。原 CDN 引用 `three@0.160.0` 的 `OrbitControls.js` 在 r148+ 已被官方移除（仅留 ESM 版），会导致 `THREE.OrbitControls is not a constructor` 整页崩溃；本地化后离线也能开，版本也锁死不再踩坑。
- **已修复的 4 个加载/运行 bug（用 Playwright 真实加载页面验证，0 报错）**：
  1. OrbitControls CDN 404 → 改用本地 `lib/`。
  2. 容器 id 不匹配：HTML `id="canvas-wrap"` 与 JS `$("canvasWrap")` 大小写不一致 → 统一为 `canvasWrap`。
  3. `gamedata.js` 未生成 `graph._byId` 索引，导致突触线 / 搜索结果全落空 → 引擎构造函数兜底构建。
  4. `doSearch` 渲染时误用结果对象 `r` 而非 `r.id`（写成了 `data-id="[object Object]"`）→ 改用 `r.id`，搜索结果现已正确显示。
- **调试接入点**：`index-3d.html` 的 `init()` 把引擎实例挂到 `window.engine`，便于外部脚本 / 自动化直接调用 `window.engine.search()` 等。
