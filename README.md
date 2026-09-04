# InspireGraph · 灵感图谱

> **v1.0.0 · 产品思路 demo** —— 用于演示「多源概念 → 概念图谱 → 灵感种子」的表现形式与功能，非正式产品。

把「灵感诞生」做成可运行、可观测的机制：多源扫描（热点 / 知识库 / 采集站 / 经典玩法 / 个人爽感 / 基础概念），长出一群**带权重的神经元**（概念），它们之间用**突触**相连（共现→关联，几乎不共现→断触），按**脑区**分块；开「可塑性」就自己跑、自己演化，产出灵感种子。

**一句话定位**：同一张概念图谱，承载任意创作方向；摇骰子 / 跑模拟，让概念跨域碰撞出灵感链。

## 文件结构

```
InspireGraph/
├── index.html      # 主页面：Three.js 3D 神经元星图（唯一入口）
├── lib/            # Three.js r128 本地库（three.min.js + OrbitControls.js），离线可用
├── neuron-3d.js    # Three.js 3D 渲染引擎（搜索飞行 / 时间轨迹 / 无限拖动）
├── engine.js       # 核心引擎（神经元/突触/可塑性/抽取/模拟，浏览器+Node 双用）
├── gamedata.js     # 由 gen-data.cjs 从 sources/ 合并生成（概念图数据）
├── gen-data.cjs    # 重新生成 gamedata.js（新增数据源后跑一次）
├── run.cjs         # 无头后台执行器（产出灵感种子 + 思考记录）
├── chain-ui.js     # 灵感链路 UI
├── chain.cjs       # 灵感链路生成
├── brief.js        # 灵感 Brief 生成 / 质量门
├── collect-kb.cjs  # 知识库采集脚本（笔记 → sources/knowledge-base/kb.json）
├── sources/        # 多源数据（热点/知识库/采集/经典玩法/个人爽感）
└── README.md
```

> `last-run.json` / `thinking-log.md` 由 `run.cjs` 运行生成，已被 `.gitignore` 忽略，不入库。

## 主页面（index.html）— 3D 神经元星图

用 **Three.js** 渲染的深空神经元星图：

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

## 模型（生物学对齐）

- **神经元 Neuron**：有 `weight`（大小）= 历史出现频率 + 近因 + 实时对话叠加。
- **突触 Synapse**：两概念关联，`strength`=共现强度，`state`∈{active / weakened / broken(断触)}，`myelin`=成熟度。
- **脑区 Region**：多域（情绪/意象/机制/风格/元素 + 动态采集域）着色分块。
- **可塑性 Plasticity**：Hebbian 共激活强化、长期不用→衰减修剪(断触)、近因提升。开页即自动运行并演化。

## 两种运行模式

**① 页面演示（人看）**：双击 `index.html`。输入框叠加实时对话词→点亮对应神经元；「可塑性/自动运行」开关控制是否持续演化；「导出种子」跑一次模拟并给出灵感焦点+思考轨迹+种子 JSON。

**② 自动化后台（机器跑）**：需要灵感种子时跑一条命令：

```bash
node run.cjs --words "（主题或随机词）" --steps 240
```

→ 产出 `last-run.json` + `thinking-log.md` → 供外部自动化读取种子（promptHint / coreConcepts），再结合自身约束去深度思考/创作。

## 数据与重建

- **数据源**：`sources/` 下 5 个源（web-hot 热点 / knowledge-base 知识库 / scraped-sites 采集 / classic-games 经典玩法 / personal-taste 个人爽感）+ `engine.js` 内置 5 域基础概念基座（情绪/意象/机制/风格/元素）。
- **图谱数据**：`gamedata.js`（`window.GAME_GRAPH`）已预生成（2467 神经元 / 9251 突触 / 17 脑区）。新增或修改数据源后重建：

```bash
node gen-data.cjs
```

- **知识库采集**：把笔记放进 `sources/knowledge-base/` 后，跑 `node collect-kb.cjs` 更新 `kb.json`，再 `node gen-data.cjs` 重建图谱。

## 放置方式

整个仓库可拷贝进**任意项目 / agent 目录**，零依赖（vanilla JS + Node）。`gamedata.js` 已预生成，开箱即用。

## 本地依赖说明

- **Three.js 已本地化**：`lib/three.min.js`(r128) + `lib/OrbitControls.js`(r128)。原 CDN 引用 `three@0.160.0` 的 `OrbitControls.js` 在 r148+ 已被官方移除（仅留 ESM 版），会导致 `THREE.OrbitControls is not a constructor` 整页崩溃；本地化后离线也能开，版本也锁死不再踩坑。
- **调试接入点**：`index.html` 的 `init()` 把引擎实例挂到 `window.engine`，便于外部脚本 / 自动化直接调用 `window.engine.search()` 等。
