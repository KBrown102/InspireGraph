/*
 * neuron-3d.js — Three.js 3D 神经元可视化引擎
 *
 * 特性：
 *   - 神经元 = 发光球体（大小=weight，颜色=脑区，激活时脉冲）
 *   - 突触 = 光线（active实亮 / weakened橙虚 / broken灰隐）
 *   - 脑区聚类 3D 布局（五域分散在空间中形成有机结构）
 *   - 搜索 + 相机平滑飞行跳转（飞到目标神经元附近）
 *   - 时间维度：激活脉冲沿突触传播 + 历史轨迹粒子
 *   - 无限拖动/缩放/旋转（OrbitControls，无边界限制）
 *   - 性能优化：InstancedMesh / 分批Line / 视锥剔除 / LOD降级 / 按距离衰减突触渲染
 *
 * 依赖：Three.js r128（本地 lib/，离线可用）
 * 数据：engine.js 生成的 graph 对象（neurons + synapses + regions）
 */
(function (global) {
  "use strict";

  // ═══════════════════════════════════════════════════════════
  //  常量 & 配置
  // ═══════════════════════════════════════════════════════════

  const CFG = {
    // 神经元（GPU 点渲染：size 由 weight + 激活在 shader 中计算）
    neuronMinR: 0.18,
    neuronMaxR: 0.7,
    neuronSeg: 12,          // 球体分段数（低=性能好，球体已弃用，仅保留字段）
    pointBaseSize: 2.4,     // Points 基础像素尺寸
    pointMaxSize: 9.0,      // 高权重/激活时的最大像素尺寸
    hoverGlowBoost: 2.2,    // 悬停节点额外放大倍数

    // 突触
    synapseActiveColor: 0xaaccff,
    synapseWeakenedColor: 0xffaa66,
    synapseBrokenColor: 0x334455,
    synapseMaxDist: 45,     // 超过此距离的突触不渲染（性能）

    // 布局（B 方案：拉大分布，星空感）
    clusterRadius: 16,      // 每个脑区聚类半径（原 10 → 拉大）
    clusterSpread: 34,      // 脑区间距（原 22 → 拉大）
    layoutNoise: 4.0,       // 有机噪声幅度（原 2.5 → 略增）

    // 动画
    pulseSpeed: 2.5,        // 激活脉冲速度
    trailLife: 120,         // 历史轨迹粒子存活帧数
    trailMaxCount: 300,     // 最大轨迹粒子数

    // 搜索
    searchFlyDuration: 1200, // 飞行动画时长 ms
    searchHighlightDist: 6,  // 高亮相关神经元的距离阈值

    // 性能
    lodDistNear: 20,        // LOD 近距离阈值
    lodDistFar: 60,         // LOD 远距离阈值
    synapseRenderRatio: 0.5, // 远距离时只渲染 N% 的弱突触
    labelMaxVisible: 24,     // 懒加载标签：同时最多可见数量
  };

  // 脑区 → 3D 方向向量（五域分布在空间中，形成有机的"大脑"形状）
  const REGION_DIRS = {
    "情绪":  { x: 0, y: 5, z: 3 },     // 上方偏前 — 情绪/感觉
    "意象":  { x: -6, y: 0, z: 5 },    // 左前方 — 意象/画面
    "机制":  { x: 6, y: 0, z: 5 },     // 右前方 — 机制/玩法
    "风格":  { x: 0, y: -4, z: -4 },   // 下方偏后 — 风格/美学
    "元素":  { x: 0, y: 1, z: -7 },    // 正后方 — 元素/符号
    // v2 新来源脑区（外圈散布，避免与核心五域重叠）
    "热点":  { x: -9, y: 7, z: -1 },   // 左上外 — 自动搜索热点
    "知识库": { x: 9, y: 7, z: -1 },    // 右上外 — 本地知识库
    "采集":  { x: 0, y: -1, z: 10 },   // 正前外 — 网站采集
    "经典":  { x: 0, y: -8, z: 6 },    // 下前外 — 经典玩法基因（老根，长在脑底）
    "爽感":  { x: 0, y: 10, z: 2 },    // 头顶正上 — 用户个人爽感（口味王冠，长在脑顶）
  };

  // ═══════════════════════════════════════════════════════════
  //  工具函数
  // ═══════════════════════════════════════════════════════════

  function hexToRgb(hex) {
    const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
    return { r: r / 255, g: g / 255, b: b / 255 };
  }

  function rgbStr(r, g, b, a) {
    return `rgba(${(r * 255) | 0},${(g * 255) | 0},${(b * 255) | 0},${a.toFixed(2)})`;
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // 斐波纳契球面均匀分布点
  function fibonacciSphere(i, total, radius) {
    const phi = Math.acos(1 - 2 * (i + 0.5) / total);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    return {
      x: radius * Math.cos(theta) * Math.sin(phi),
      y: radius * Math.sin(theta) * Math.sin(phi),
      z: radius * Math.cos(phi),
    };
  }

  // ═══════════════════════════════════════════════════════════
  //  Neuron3DEngine 主类
  // ═══════════════════════════════════════════════════════════

  class Neuron3DEngine {
    /**
     * @param {HTMLElement} container - 挂载容器
     * @param {object} graph - engine.js 产出的图数据 {neurons, synapses, regions}
     */
    constructor(container, graph) {
      this.container = container;
      this.graph = graph;
      this.neurons = graph.neurons || [];
      this.synapses = graph.synapses || [];
      this.regions = graph.regions || {};
      // 确保 _byId 索引存在（gamedata.js 可能未生成此字段）
      if (!graph._byId) {
        graph._byId = {};
        this.neurons.forEach((n) => { graph._byId[n.id] = n; });
      }
      this.byId = graph._byId;

      // Three.js 核心
      this.scene = null;
      this.camera = null;
      this.renderer = null;
      this.controls = null;

      // Three.js 对象引用
      this.neuronMeshes = [];        // 每个神经元的 mesh（保留字段）
      this.instNeurons = null;        // 旧 InstancedMesh（已弃用，保留字段防引用报错）
      this.neuronPoints = null;       // B 方案：THREE.Points + ShaderMaterial（GPU 点渲染）
      this.glowPoints = null;        // 假 bloom：柔光晕层（THREE.Points + 径向柔晕 shader）
      this.regionHalos = [];         // 脑区发光团（每个脑区一团柔光 Sprite）
      this.glowEnabled = true;       // 辉光显示开关（UI 按钮控制）
      this.linesEnabled = true;      // 连线显示开关（UI 按钮控制）
      this.synLinesActive = null;
      this.synLinesWeakened = null;
      this.synLinesBroken = null;
      this._synPairs = { active: [], weakened: [], broken: [] }; // 每批连线的端点 id（按脑区显隐用）
      this.focusId = null;           // 当前聚焦（选中）的神经元 id
      this._focusPickIds = null;     // 聚焦期间可交互的关联节点 id 集合（非聚焦时为 null）
      this.focusGlow = null;         // 选中神经元专用辉光（无视全局开关，始终可见更亮）
      this.focusLines = null;        // 选中神经元专用连线（无视全局开关，动态生长）
      this._focusAttrIndex = null;   // aFocus 属性中当前选中索引
      this._focusLineStart = 0;      // 选中连线生长动画起点（performance.now）
      this.focusTimeout = null;      // 1 分钟无操作收起定时器
      this._focusLabels = [];          // 聚焦时显示的标签（退出时清理）
      this._autoRotateBeforeFocus = true; // 聚焦前自转状态（退出时还原）
      this._lineDimMul = 1;          // 其它连线弱化倍率（1=不弱化）
      this._lineBaseOpacity = { active: 0.12, weakened: 0.05, broken: 0.02 };
      this.onFocusExit = null;       // 聚焦自动收起回调（用于同步 UI 自转按钮）
      this.labelSprites = [];         // 文字标签
      this.trailParticles = [];       // 时间维度历史轨迹
      this.trailGeom = null;
      this.trailPoints = null;
      this.trailMat = null;

      // 动画状态
      this.clock = new THREE.Clock();
      this.running = false;
      this.plasticityOn = false;
      this.simStep = 0;
      this.simSpeed = 1;

      // 搜索状态
      this.searchResults = [];
      this.highlightIds = new Set();

      // 飞行动画
      this.flyAnim = null;

      // 回调钩子
      this.onNeuronClick = null;
      this.onSeedReady = null;

      // 性能监控
      this.frameCount = 0;
      this.lastFpsTime = 0;
      this.fps = 60;

      this._init();
    }

    // ─────────────────────────────────────────────────────
    //  初始化
    // ─────────────────────────────────────────────────────

    _init() {
      this._setupScene();
      this._buildLayout();
      this._createNeurons();
      this._createGlowPoints();      // 假 bloom：每个神经元一层柔光晕
      this._createRegionHalos();     // 脑区发光团（星云团观感）
      this._createSynapses();
      this._createTimeTrails();
      this._setupLights();
      this._setupControls();
      this._setupRaycaster();
      this._startLoop();
      this._onResize();
      window.addEventListener("resize", () => this._onResize());
    }

    _setupScene() {
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;

      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x07080f); // 深空黑（比截图稍蓝一点）
      this.scene.fog = new THREE.FogExp2(0x07080f, 0.0042); // 调低雾浓度，远处隐入更柔（星空感）

      this.camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 2000);
      this.camera.position.set(0, 18, 92); // 默认拉远，开局即全景星空

      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
      this.renderer.setSize(w, h);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.container.appendChild(this.renderer.domElement);
    }

    _setupLights() {
      // 环境光（微弱基底）
      this.scene.add(new THREE.AmbientLight(0x334466, 0.4));

      // 主光源（从相机方向来，照亮面向用户的神经元）
      const key = new THREE.DirectionalLight(0xffffff, 0.5);
      key.position.set(10, 15, 20);
      this.scene.add(key);

      // 补光（从下方，给球体底部补一点光）
      const fill = new THREE.DirectionalLight(0x6688bb, 0.25);
      fill.position.set(-5, -10, -10);
      this.scene.add(fill);
    }

    _setupControls() {
      // OrbitControls — 无限拖动/缩放/旋转
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.08;
      this.controls.rotateSpeed = 0.5;
      this.controls.zoomSpeed = 1.2;
      this.controls.panSpeed = 0.8;
      this.controls.minDistance = 3;
      this.controls.maxDistance = 500;    // 几乎无限
      this.controls.enablePan = true;
      this.controls.autoRotate = true;   // 默认开启缓慢自转（"活的宇宙"感）
      this.controls.autoRotateSpeed = 0.35;
      // 用户开始拖拽/缩放 → 重置聚焦收起计时（视为"有操作"）
      this.controls.addEventListener("start", () => this._resetFocusIdle());
    }

    _setupRaycaster() {
      this.raycaster = new THREE.Raycaster();
      this.raycaster.params.Points.threshold = 0.5;
      this.mouse = new THREE.Vector2();

      this.renderer.domElement.addEventListener("click", (e) => this._onClick(e));
      this.renderer.domElement.addEventListener("mousemove", (e) => this._onHover(e));
      // 任何指针按下/滚轮缩放都算"有操作"，重置聚焦 1 分钟收起计时
      this.renderer.domElement.addEventListener("pointerdown", () => this._resetFocusIdle());
      this.renderer.domElement.addEventListener("wheel", () => this._resetFocusIdle(), { passive: true });
    }

    _onResize() {
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    }

    // ─────────────────────────────────────────────────────
    //  3D 布局算法（脑区聚类 + 斐波纳契球面）
    // ─────────────────────────────────────────────────────

    _buildLayout() {
      // 按脑区分组
      const groups = {};
      this.neurons.forEach((n) => {
        const g = n.group || "元素";
        if (!groups[g]) groups[g] = [];
        groups[g].push(n);
      });

      // 给每个神经元分配 3D 坐标
      Object.keys(groups).forEach((groupName) => {
        const members = groups[groupName];
        const dir = REGION_DIRS[groupName] || { x: 0, y: 0, z: 0 };
        const center = new THREE.Vector3(dir.x, dir.y, dir.z);

        members.forEach((n, i) => {
          // 权重大的靠近聚类中心，小的散到边缘
          const effW = n.weight || 0.3;
          const r = CFG.clusterRadius * (1.4 - effW * 0.8); // 大权重→小r→靠中心
          const offset = fibonacciSphere(i, members.length, r);
          // 加入有机噪声（B 方案：略增幅度，配合拉大分布）
          n.pos = new THREE.Vector3(
            center.x + offset.x + (Math.random() - 0.5) * CFG.layoutNoise,
            center.y + offset.y + (Math.random() - 0.5) * CFG.layoutNoise,
            center.z + offset.z + (Math.random() - 0.5) * CFG.layoutNoise
          );
        });
      });
    }

    // ─────────────────────────────────────────────────────
    //  创建神经元（B 方案：THREE.Points + ShaderMaterial，GPU 脉动）
    // ─────────────────────────────────────────────────────

    _createNeurons() {
      const N = this.neurons.length;
      const positions = new Float32Array(N * 3);
      const colors = new Float32Array(N * 3);
      const aSize = new Float32Array(N);     // 基础尺寸（权重）
      const aAct = new Float32Array(N);      // 激活值（动态）
      const aHover = new Float32Array(N);    // 悬停标记（1=悬停）
      const aFocus = new Float32Array(N);    // 选中（聚焦）标记（1=选中）
      const aVisible = new Float32Array(N);  // 类别可见性（1=显示，0=隐藏，用于筛选）

      const color = new THREE.Color();
      this.neurons.forEach((n, i) => {
        const pos = n.pos || new THREE.Vector3();
        positions[i * 3] = pos.x;
        positions[i * 3 + 1] = pos.y;
        positions[i * 3 + 2] = pos.z;

        const hex = this.regions[n.group] || "#c7ceea";
        color.set(hex);
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;

        const w = n.weight || 0.3;
        aSize[i] = lerp(CFG.neuronMinR, CFG.neuronMaxR, w) / CFG.neuronMaxR; // 归一 0..1
        aAct[i] = n.act || 0;
        aHover[i] = 0;
        aFocus[i] = 0;
        aVisible[i] = 1;

        n.meshIndex = i; // 保持反向映射（Points index = 神经元序）
      });

      // 类别可见性（默认全显示），供 UI 复选筛选
      this.groupVisible = {};
      this.neurons.forEach((n) => { this.groupVisible[n.group || "元素"] = true; });

      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geom.setAttribute("aSize", new THREE.BufferAttribute(aSize, 1));
      geom.setAttribute("aAct", new THREE.BufferAttribute(aAct, 1));
      geom.setAttribute("aHover", new THREE.BufferAttribute(aHover, 1));
      geom.setAttribute("aFocus", new THREE.BufferAttribute(aFocus, 1));
      geom.setAttribute("aVisible", new THREE.BufferAttribute(aVisible, 1));

      // 自定义着色器：GPU 点渲染 + 锐利星核 + 柔晕 + 独立闪烁 + 激活星芒
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uBaseSize: { value: CFG.pointBaseSize },
          uMaxSize: { value: CFG.pointMaxSize },
          uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
          uHoverBoost: { value: CFG.hoverGlowBoost },
        },
        vertexShader: `
          attribute float aSize;
          attribute float aAct;
          attribute float aHover;
          attribute float aFocus;
          attribute float aVisible;
          uniform float uTime;
          uniform float uBaseSize;
          uniform float uMaxSize;
          uniform float uPixelRatio;
          uniform float uHoverBoost;
          varying vec3 vColor;
          varying float vAct;
          varying float vHover;
          varying float vTwinkle;
          varying float vSizeNorm;
          varying float vFocus;
          varying float vVisible;
          // 稳定哈希：同一坐标永远同一相位
          float hash(vec3 p) {
            vec3 q = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
            q *= 17.0;
            return fract(q.x * q.y * q.z * (q.x + q.y + q.z));
          }
          void main() {
            vColor = color;
            vAct = aAct;
            vHover = aHover;
            vFocus = aFocus;
            vVisible = aVisible;
            vSizeNorm = aSize;
            vTwinkle = hash(position * 100.0) * 6.2831853;
            // 激活时呼吸更明显，普通星点轻微呼吸
            float pulse = 1.0 + (aAct * 0.45 + 0.08) * sin(uTime * 2.5 + vTwinkle);
            float hi = max(aHover, aFocus);
            float hoverMul = 1.0 + hi * (uHoverBoost - 1.0);
            float sz = mix(uBaseSize, uMaxSize, aSize) * pulse * hoverMul;
            // 普通星点更克制，避免满屏糊；激活/悬停才放大
            sz *= (0.55 + 0.45 * (1.0 - aAct * 0.35 - hi * 0.25));
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            // 类别筛选：被隐藏的神经元不渲染
            gl_PointSize = (aVisible < 0.5) ? 0.0 : max(1.0, sz * uPixelRatio * (60.0 / -mv.z));
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: `
          varying vec3 vColor;
          varying float vAct;
          varying float vHover;
          varying float vTwinkle;
          varying float vSizeNorm;
          varying float vFocus;
          varying float vVisible;
          uniform float uTime;
          void main() {
            if (vVisible < 0.5) discard;   // 类别筛选：隐藏的神经元不绘制
            vec2 uv = gl_PointCoord - 0.5;
            float d = length(uv);
            if (d > 0.5) discard;
            // 独立闪烁：每个星点有自己的呼吸相位
            float twinkle = 0.72 + 0.28 * sin(uTime * 1.3 + vTwinkle * 3.0);
            // 锐利星核（透亮感的来源）
            float core = smoothstep(0.18, 0.0, d);
            // 紧贴核心的明亮内晕
            float innerGlow = exp(-d * d * 28.0) * 0.55;
            // 更大的柔光外晕
            float outerGlow = exp(-d * d * 6.0) * 0.18;
            // 十字星芒：只在激活/悬停时出现
            float flare = 0.0;
            if (vAct > 0.05 || vHover > 0.05 || vFocus > 0.05) {
              float crossX = max(0.0, 1.0 - abs(uv.x) * 14.0) * max(0.0, 1.0 - abs(uv.y) * 2.2);
              float crossY = max(0.0, 1.0 - abs(uv.y) * 14.0) * max(0.0, 1.0 - abs(uv.x) * 2.2);
              flare = (crossX + crossY) * 0.55 * clamp(vAct + vHover + vFocus, 0.0, 1.0);
            }
            float alpha = clamp(core + innerGlow + outerGlow + flare, 0.0, 1.0);
            // 普通星点暗一点，激活/悬停更亮
            float brightness = 0.72 + vAct * 0.6 + vHover * 0.6 + vFocus * 0.6;
            alpha *= twinkle * brightness;
            vec3 col = vColor;
            // 星核偏冷白，增强透亮
            col = mix(col, vec3(0.95, 0.97, 1.0), core * 0.75);
            // 激活/悬停提亮
            col = mix(col, vec3(1.0), clamp(vAct * 0.6 + vHover * 0.6 + vFocus * 0.6, 0.0, 0.9));
            gl_FragColor = vec4(col * (0.8 + alpha * 0.35), alpha);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexColors: true,
      });

      this.neuronPoints = new THREE.Points(geom, mat);
      this.neuronPoints.frustumCulled = false; // 单对象整体，无需逐对象剔除
      this.scene.add(this.neuronPoints);

      // 懒加载标签系统（不预建，沿用 this.labelSprites 旧字段名以便兼容）
      this.labelSprites = [];
      this._labelPool = [];      // 复用 Sprite 对象
      this._labelActive = new Map(); // neuronId -> sprite
      this._hoveredNeuron = null;
    }

    // ─────────────────────────────────────────────────────
    //  假 bloom 辉光层（借鉴诗云星云团观感）
    //  在已有锐利星核 Points 之外，叠加一层更大尺寸的纯径向柔晕
    //  Points，加色混合。区域密集处光晕自然融成发光团。零新依赖。
    // ─────────────────────────────────────────────────────

    _createGlowPoints() {
      const N = this.neurons.length;
      const positions = new Float32Array(N * 3);
      const colors = new Float32Array(N * 3);
      const aGlow = new Float32Array(N); // 光晕强度因子（权重驱动）
      const aVisible = new Float32Array(N); // 类别可见性（与 neuronPoints 同序）
      const color = new THREE.Color();

      this.neurons.forEach((n, i) => {
        const pos = n.pos || new THREE.Vector3();
        positions[i * 3] = pos.x;
        positions[i * 3 + 1] = pos.y;
        positions[i * 3 + 2] = pos.z;
        color.set(this.regions[n.group] || "#c7ceea");
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
        const w = n.weight || 0.3;
        aGlow[i] = lerp(0.35, 1.0, w); // 归一 0..1，权重越大光晕越强
        aVisible[i] = 1;
      });

      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geom.setAttribute("aGlow", new THREE.BufferAttribute(aGlow, 1));
      geom.setAttribute("aVisible", new THREE.BufferAttribute(aVisible, 1));

      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uGlowBase: { value: 15.0 },
          uMaxGlow: { value: 36.0 },   // 默认辉光略收一档（更克制）
          uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
          uDim: { value: 0 },          // 聚焦时弱化其它辉光（0=不弱化，1=压到~22%）
        },
        vertexShader: `
          attribute float aGlow;
          attribute float aVisible;
          uniform float uTime;
          uniform float uGlowBase;
          uniform float uMaxGlow;
          uniform float uPixelRatio;
          varying vec3 vColor;
          varying float vGlow;
          varying float vVisible;
          float hash(vec3 p){ vec3 q = fract(p * 0.3183099 + 0.7); q *= 17.0; return fract(q.x*q.y*q.z*(q.x+q.y+q.z)); }
          void main() {
            vColor = color;
            vVisible = aVisible;
            float tw = hash(position * 100.0);
            float pulse = 0.85 + 0.15 * sin(uTime * 1.2 + tw * 6.2831);
            vGlow = aGlow * pulse;
            float sz = mix(uGlowBase, uMaxGlow, aGlow) * pulse;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            // 类别筛选：被隐藏的神经元不渲染光晕
            gl_PointSize = (aVisible < 0.5) ? 0.0 : max(2.0, sz * uPixelRatio * (60.0 / -mv.z));
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: `
          varying vec3 vColor;
          varying float vGlow;
          varying float vVisible;
          uniform float uDim;
          void main() {
            if (vVisible < 0.5) discard;   // 类别筛选：隐藏的神经元不绘制光晕
            vec2 uv = gl_PointCoord - 0.5;
            float d = length(uv);
            if (d > 0.5) discard;
            // 宽柔晕：exp 衰减 → 假 bloom 观感
            float glow = exp(-d * d * 9.0) * 0.55 + exp(-d * d * 3.0) * 0.20;
            float alpha = glow * (0.13 + vGlow * 0.20) * (1.0 - uDim * 0.78); // 默认辉光稍弱一档
            vec3 col = vColor;
            col = mix(col, vec3(1.0), exp(-d * d * 40.0) * 0.5); // 中心微微提亮
            gl_FragColor = vec4(col, alpha);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexColors: true,
      });

      this.glowPoints = new THREE.Points(geom, mat);
      this.glowPoints.frustumCulled = false;
      this.scene.add(this.glowPoints);
    }

    // ─────────────────────────────────────────────────────
    //  脑区发光团（每个脑区一团柔光 Sprite，让区域读成星云团）
    // ─────────────────────────────────────────────────────

    _createRegionHalos() {
      const tex = this._makeGlowTexture();
      const groups = {};
      this.neurons.forEach((n) => {
        const g = n.group || "元素";
        if (!groups[g]) groups[g] = { sum: new THREE.Vector3(), count: 0, maxR: 0, center: new THREE.Vector3() };
        if (n.pos) groups[g].sum.add(n.pos);
        groups[g].count++;
      });

      Object.keys(groups).forEach((g) => {
        const info = groups[g];
        if (info.count < 3) return; // 太小不画团
        info.center.copy(info.sum).multiplyScalar(1 / info.count);
        this.neurons.forEach((n) => {
          if ((n.group || "元素") !== g || !n.pos) return;
          const r = info.center.distanceTo(n.pos);
          if (r > info.maxR) info.maxR = r;
        });
        const radius = Math.max(info.maxR * 1.15, 6);
        const hex = this.regions[g] || "#c7ceea";
        const mat = new THREE.SpriteMaterial({
          map: tex,
          color: new THREE.Color(hex),
          transparent: true,
          opacity: 0.05,               // 脑区发光团更克制（默认辉光整体调弱）
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const sprite = new THREE.Sprite(mat);
        sprite.position.copy(info.center);
        sprite.scale.set(radius * 2.2, radius * 2.2, 1);
        this.scene.add(sprite);
        this.regionHalos.push(sprite);
      });
    }

    _makeGlowTexture() {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const ctx = c.getContext("2d");
      const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0.0, "rgba(255,255,255,1)");
      grad.addColorStop(0.25, "rgba(255,255,255,0.55)");
      grad.addColorStop(0.6, "rgba(255,255,255,0.12)");
      grad.addColorStop(1.0, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    }

    // ─────────────────────────────────────────────────────
    //  标签懒加载（B 方案：只在悬停/选中时生成，复用对象池）
    // ─────────────────────────────────────────────────────

    _makeLabelSprite(neuron) {
      let sprite = this._labelPool.pop();
      if (!sprite) {
        const canvas = document.createElement("canvas");
        canvas.width = 256; canvas.height = 64;
        const ctx = canvas.getContext("2d");
        ctx.font = "bold 24px 'PingFang SC','Microsoft YaHei',sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, opacity: 0.85 });
        sprite = new THREE.Sprite(mat);
        sprite.scale.set(3, 0.75, 1);
      }
      // 重绘文字
      const cv = sprite.material.map.image;
      const cx = cv.getContext("2d");
      cx.clearRect(0, 0, 256, 64);
      cx.fillStyle = "rgba(0,0,0,0)"; cx.fillRect(0, 0, 256, 64);
      cx.font = "bold 24px 'PingFang SC','Microsoft YaHei',sans-serif";
      cx.fillStyle = "#dbe6ff";
      cx.textAlign = "center"; cx.textBaseline = "middle";
      cx.fillText(neuron.label, 128, 32);
      sprite.material.map.needsUpdate = true;
      sprite.position.copy(neuron.pos);
      sprite.position.y += lerp(CFG.neuronMinR, CFG.neuronMaxR, neuron.weight || 0.3) + 0.8;
      sprite.userData = { neuronId: neuron.id };
      return sprite;
    }

    /** 懒加载显示某神经元的标签（超出上限则回收最旧） */
    _showLabel(neuron) {
      if (!neuron || !neuron.pos || this._activeLabelCount() >= CFG.labelMaxVisible) {
        // 已达上限：回收一个非悬停的旧标签
        this._recycleOldestLabel();
        if (this._activeLabelCount() >= CFG.labelMaxVisible) return;
      }
      if (this._labelActive.has(neuron.id)) return; // 已显示
      const sprite = this._makeLabelSprite(neuron);
      this.labelSprites.push(sprite);
      this._labelActive.set(neuron.id, sprite);
      this.scene.add(sprite);
    }

    _hideLabel(neuronId) {
      const sprite = this._labelActive.get(neuronId);
      if (!sprite) return;
      this.scene.remove(sprite);
      const idx = this.labelSprites.indexOf(sprite);
      if (idx >= 0) this.labelSprites.splice(idx, 1);
      this._labelActive.delete(neuronId);
      this._labelPool.push(sprite); // 回收进对象池
    }

    _activeLabelCount() { return this._labelActive.size; }

    _recycleOldestLabel() {
      // 回收最早加入的非悬停、非聚焦标签（保护选中节点及其关联节点的文字）
      for (const [id, sprite] of this._labelActive) {
        if (id === (this._hoveredNeuron && this._hoveredNeuron.id)) continue;
        if (this._focusLabels && this._focusLabels.indexOf(id) >= 0) continue;
        this._hideLabel(id);
        return;
      }
    }

    // ─────────────────────────────────────────────────────
    //  创建突触（分三批 LineSegments，连线整体调淡）
    // ─────────────────────────────────────────────────────

    _createSynapses() {
      const activePts = [], weakPts = [], brokenPts = [];
      const activePairs = [], weakPairs = [], brokenPairs = [];

      this.synapses.forEach((s) => {
        const a = this.byId[s.a], b = this.byId[s.b];
        if (!a || !b || !a.pos || !b.pos) return;

        if (s.state === "active") {
          activePts.push(a.pos.x, a.pos.y, a.pos.z, b.pos.x, b.pos.y, b.pos.z);
          activePairs.push([s.a, s.b]);
        } else if (s.state === "weakened") {
          weakPts.push(a.pos.x, a.pos.y, a.pos.z, b.pos.x, b.pos.y, b.pos.z);
          weakPairs.push([s.a, s.b]);
        } else {
          brokenPts.push(a.pos.x, a.pos.y, a.pos.z, b.pos.x, b.pos.y, b.pos.z);
          brokenPairs.push([s.a, s.b]);
        }
      });

      // 记录每批连线的端点 id 顺序，供「按脑区隐藏连线」复用
      this._synPairs = { active: activePairs, weakened: weakPairs, broken: brokenPairs };

      // Active — 亮白/蓝色细线
      if (activePts.length > 0) {
        this.synLinesActive = this._makeSynLines(activePts, activePairs, CFG.synapseActiveColor, 0.12);
        this.scene.add(this.synLinesActive);
      }

      // Weakened — 橙色虚线效果（用 dashed 不支持 LineSegments，用透明度模拟）
      if (weakPts.length > 0) {
        this.synLinesWeakened = this._makeSynLines(weakPts, weakPairs, CFG.synapseWeakenedColor, 0.05);
        this.scene.add(this.synLinesWeakened);
      }

      // Broken — 极淡灰色
      if (brokenPts.length > 0) {
        this.synLinesBroken = this._makeSynLines(brokenPts, brokenPairs, CFG.synapseBrokenColor, 0.02);
        this.scene.add(this.synLinesBroken);
      }
    }

    /**
     * 构建一批突触连线：额外带 aVisible 顶点属性（每段 2 个顶点同值），
     * 通过 onBeforeCompile 注入 shader 实现「单条连线级别」的隐藏，
     * 这样隐藏某个脑区时，与之相关的连线也能一起消失（无需重建几何体）。
     */
    _makeSynLines(points, pairs, color, opacity) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
      const vis = new Float32Array((pairs ? pairs.length : 0) * 2);
      vis.fill(1);
      geom.setAttribute("aVisible", new THREE.BufferAttribute(vis, 1));

      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity, linewidth: 1 });
      // 注入点用宽容正则；若找不到（未来换 three 版本）则整体放弃遮罩，保证连线照常显示
      const MAIN_RE = /void\s+main\s*\(\s*\)\s*\{/;
      mat.onBeforeCompile = function (shader) {
        if (!MAIN_RE.test(shader.vertexShader) || !MAIN_RE.test(shader.fragmentShader)) return;
        shader.vertexShader =
          "attribute float aVisible;\nvarying float vSynVis;\n" +
          shader.vertexShader.replace(MAIN_RE, "void main() {\n  vSynVis = aVisible;");
        shader.fragmentShader =
          "varying float vSynVis;\n" +
          shader.fragmentShader.replace(MAIN_RE, "void main() {\n  if (vSynVis < 0.5) discard;");
      };
      return new THREE.LineSegments(geom, mat);
    }

    /** 按脑区可见性隐藏/显示相关连线（两端任一被隐藏 → 整条线隐藏） */
    _applySynapseVisibility() {
      const apply = (lines, pairs) => {
        if (!lines || !pairs || !pairs.length) return;
        const attr = lines.geometry.getAttribute("aVisible");
        if (!attr) return;
        for (let i = 0; i < pairs.length; i++) {
          const a = this.byId[pairs[i][0]], b = this.byId[pairs[i][1]];
          const ga = a ? (a.group || "元素") : null;
          const gb = b ? (b.group || "元素") : null;
          const v = (this.groupVisible[ga] === false || this.groupVisible[gb] === false) ? 0 : 1;
          attr.array[i * 2] = v;
          attr.array[i * 2 + 1] = v;
        }
        attr.needsUpdate = true;
      };
      const p = this._synPairs || {};
      apply(this.synLinesActive, p.active);
      apply(this.synLinesWeakened, p.weakened);
      apply(this.synLinesBroken, p.broken);
    }

    // ─────────────────────────────────────────────────────
    //  时间维度：历史轨迹粒子系统
    // ─────────────────────────────────────────────────────

    _createTimeTrails() {
      const maxPts = CFG.trailMaxCount;
      this.trailPositions = new Float32Array(maxPts * 3);
      this.trailColors = new Float32Array(maxPts * 3);
      this.trailSizes = new Float32Array(maxPts);
      this.trailAges = new Float32Array(maxPts); // 年龄（帧数）
      this.trailCount = 0;

      this.trailGeom = new THREE.BufferGeometry();
      this.trailGeom.setAttribute("position", new THREE.BufferAttribute(this.trailPositions, 3));
      this.trailGeom.setAttribute("color", new THREE.BufferAttribute(this.trailColors, 3));
      this.trailGeom.setAttribute("size", new THREE.BufferAttribute(this.trailSizes, 1));

      this.trailMat = new THREE.PointsMaterial({
        size: 0.18,
        vertexColors: true,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      this.trailPoints = new THREE.Points(this.trailGeom, this.trailMat);
      this.scene.add(this.trailPoints);
    }

    /** 在指定位置发射一个轨迹粒子 */
    _emitTrail(pos, colorHex) {
      if (this.trailCount >= CFG.trailMaxCount) return;
      const i = this.trailCount;
      this.trailPositions[i * 3] = pos.x;
      this.trailPositions[i * 3 + 1] = pos.y;
      this.trailPositions[i * 3 + 2] = pos.z;

      const c = hexToRgb(colorHex);
      this.trailColors[i * 3] = c.r;
      this.trailColors[i * 3 + 1] = c.g;
      this.trailColors[i * 3 + 2] = c.b;

      this.trailSizes[i] = 0.15 + Math.random() * 0.15;
      this.trailAges[i] = 0;
      this.trailCount++;
    }

    _updateTrails(dt) {
      if (this.trailCount === 0) return;

      let writeIdx = 0;
      for (let i = 0; i < this.trailCount; i++) {
        this.trailAges[i] += dt * 60; // 按 60fps 归一化
        if (this.trailAges[i] < CFG.trailLife) {
          if (writeIdx !== i) {
            this.trailPositions[writeIdx * 3] = this.trailPositions[i * 3];
            this.trailPositions[writeIdx * 3 + 1] = this.trailPositions[i * 3 + 1];
            this.trailPositions[writeIdx * 3 + 2] = this.trailPositions[i * 3 + 2];
            this.trailColors[writeIdx * 3] = this.trailColors[i * 3];
            this.trailColors[writeIdx * 3 + 1] = this.trailColors[i * 3 + 1];
            this.trailColors[writeIdx * 3 + 2] = this.trailColors[i * 3 + 2];
            this.trailSizes[writeIdx] = this.trailSizes[i];
            this.trailAges[writeIdx] = this.trailAges[i];
          }
          writeIdx++;
        }
      }
      this.trailCount = writeIdx;

      // 更新透明度（随年龄衰减）
      for (let i = 0; i < this.trailCount; i++) {
        const life = 1 - this.trailAges[i] / CFG.trailLife;
        this.trailSizes[i] *= 0.995; // 渐缩
      }

      this.trailGeom.attributes.position.needsUpdate = true;
      this.trailGeom.attributes.size.needsUpdate = true;
    }

    // ─────────────────────────────────────────────────────
    //  激活脉冲动画（时间维度的核心表现）
    // ─────────────────────────────────────────────────────

    _updatePulse(time) {
      // B 方案：脉动尺寸/亮度全在 shader 里做（uTime 驱动），CPU 只同步激活值
      this.neuronPoints.material.uniforms.uTime.value = time;
      if (this.glowPoints) this.glowPoints.material.uniforms.uTime.value = time;

      const actAttr = this.neuronPoints.geometry.getAttribute("aAct");
      if (!actAttr) return;
      let changed = false;
      // 仅更新有激活的神经元（多数 act=0，无需每帧写）
      for (let i = 0; i < this.neurons.length; i++) {
        const act = this.neurons[i].act || 0;
        if (actAttr.array[i] !== act) { actAttr.array[i] = act; changed = true; }
      }
      if (changed) actAttr.needsUpdate = true;
    }

    // ─────────────────────────────────────────────────────
    //  模拟步进（接入 engine.js 的 step/run）
    // ─────────────────────────────────────────────────────

    runSimulation(steps, seedWords) {
      if (typeof NeuronEngine === "undefined") {
        console.warn("[Neuron3D] engine.js 未加载，无法运行模拟");
        return null;
      }
      const result = NeuronEngine.run(this.graph, {
        steps: steps || 200,
        seedWords: seedWords || "",
        plasticity: this.plasticityOn,
      });
      return result;
    }

    /** 单步推进模拟并更新视觉 */
    simulationTick() {
      if (typeof NeuronEngine === "undefined") return;
      const fired = NeuronEngine.step(this.graph, { plasticity: this.plasticityOn });

      // 在被激活的突触上发射轨迹粒子
      fired.forEach((pairKey) => {
        const parts = pairKey.split("↔");
        if (parts.length !== 2) return;
        const a = this.byId[parts[0]], b = this.byId[parts[1]];
        if (a && a.pos && b && b.pos) {
          const mid = new THREE.Vector3().lerpVectors(a.pos, b.pos, 0.5 + Math.random() * 0.3);
          this._emitTrail(mid, 0xaaccff);
        }
      });

      // 自发闪烁也偶尔发射
      this.neurons.forEach((n) => {
        if ((n.act || 0) > 0.5 && Math.random() < 0.08 && n.pos) {
          this._emitTrail(n.pos, this.regions[n.group] || "#c7ceea");
        }
      });
    }

    // ─────────────────────────────────────────────────────
    //  搜索系统
    // ─────────────────────────────────────────────────────

    /**
     * 搜索神经元
     * @param {string} query - 搜索词（匹配 label 和 kw）
     * @returns {Array} 匹配的神经元 id 列表
     */
    search(query) {
      if (!query || !query.trim()) {
        this.clearSearch();
        return [];
      }
      const q = query.trim().toLowerCase();
      const results = [];

      this.neurons.forEach((n) => {
        // 匹配标签
        if (n.label.toLowerCase().includes(q)) {
          results.push({ id: n.id, score: 1, reason: "标签匹配" });
          return;
        }
        // 匹配关键词（优先神经元自带 kw，回退到 CONCEPTS 词典）
        const ci = (typeof NeuronEngine !== "undefined") ? (NeuronEngine.CONCEPTS || []).find(c => c.id === n.id) : null;
        const kws = (n.kw && n.kw.length) ? n.kw : (ci ? ci.kw : []);
        if (kws && kws.length) {
          for (const k of kws) {
            if (k.includes(q) || q.includes(k)) {
              results.push({ id: n.id, score: 0.8, reason: `关键词「${k}」` });
              return;
            }
          }
        }
        // 模糊匹配（包含关系）
        if (q.length >= 2) {
          if (n.label.indexOf(q) >= 0 || q.indexOf(n.label) >= 0) {
            results.push({ id: n.id, score: 0.6, reason: "部分匹配" });
          }
        }
      });

      results.sort((a, b) => b.score - a.score);
      this.searchResults = results.map(r => r.id);

      // 也把直接连接的相关神经元加入高亮
      this.highlightIds = new Set(this.searchResults);
      this.synapses.forEach(s => {
        if (this.highlightIds.has(s.a) && !this.highlightIds.has(s.b))
          this.highlightIds.add(s.b);
        else if (this.highlightIds.has(s.b) && !this.highlightIds.has(s.a))
          this.highlightIds.add(s.a);
      });

      // 飞到第一个结果
      if (results.length > 0) {
        const target = this.byId[results[0].id];
        if (target && target.pos) {
          this.flyTo(target.pos.clone());
          this._showLabel(target); // 懒加载显示命中标签
        }
      }

      return results;
    }

    clearSearch() {
      this.searchResults = [];
      this.highlightIds.clear();
    }

    /**
     * 平滑飞行到目标位置
     * @param {THREE.Vector3} target - 目标位置
     * @param {number} duration - 动画时长 ms
     */
    flyTo(target, duration, distScale) {
      duration = duration || CFG.searchFlyDuration;
      distScale = (distScale && distScale > 0) ? distScale : 1;
      const startPos = this.camera.position.clone();
      const startTarget = this.controls.target.clone();
      const endTarget = target.clone();

      // 计算一个好看的观察位置（从目标斜上方 45 度角）
      const dir = startPos.clone().sub(startTarget).normalize();
      let dist = startPos.distanceTo(startTarget) * distScale;
      // 拉近（distScale<1）时给一个合理的观察距离，避免过远看不清文字
      if (distScale < 1) dist = Math.max(6, Math.min(30, dist));
      const endPos = target.clone().add(dir.multiplyScalar(dist));

      const startTime = performance.now();

      const tick = (now) => {
        const t = Math.min(1, (now - startTime) / duration);
        const ease = easeOutCubic(t);

        this.camera.position.lerpVectors(startPos, endPos, ease);
        this.controls.target.lerpVectors(startTarget, endTarget, ease);
        this.controls.update();

        if (t < 1) {
          this.flyAnim = requestAnimationFrame(tick);
        } else {
          this.flyAnim = null;
        }
      };

      if (this.flyAnim) cancelAnimationFrame(this.flyAnim);
      this.flyAnim = requestAnimationFrame(tick);
    }

    // ─────────────────────────────────────────────────────
    //  交互事件
    // ─────────────────────────────────────────────────────

    /**
     * 该神经元当前是否可被鼠标拾取：
     *  - 被分类筛选隐藏的脑区 → 不可拾取（避免点中看不见的节点）
     *  - 聚焦（选中）期间 → 只有选中节点自己 + 它的关联节点可交互，
     *    其它节点一律忽略，防止拖动/旋转时误触而丢失当前目标
     *  - 未聚焦 → 全部可拾取
     */
    _isPickable(n) {
      if (!n || !n.id) return false;
      if (this.groupVisible && this.groupVisible[n.group || "元素"] === false) return false;
      if (this.focusId == null) return true;
      if (n.id === this.focusId) return true;
      return !!(this._focusPickIds && this._focusPickIds.has(n.id));
    }

    /** 该标签是否属于聚焦集合（选中节点/关联节点）——聚焦期间不因鼠标移开而隐藏 */
    _isFocusLabel(id) {
      return !!(this.focusId != null && this._focusLabels && this._focusLabels.indexOf(id) >= 0);
    }

    _onClick(e) {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      const hits = this.raycaster.intersectObject(this.neuronPoints);
      if (hits.length === 0) return;

      // 取最近的「可拾取」命中（聚焦期间忽略其它节点，保持当前目标不丢）
      const hit = hits.find((h) => this._isPickable(this.neurons[h.index]));
      if (!hit) return;

      const n = this.neurons[hit.index];
      if (n && this.onNeuronClick) {
        this.onNeuronClick(n, hit.point);
      }
    }

    _onHover(e) {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      const hits = this.raycaster.intersectObject(this.neuronPoints);
      const hit = hits.find((h) => this._isPickable(this.neurons[h.index]));
      const n = hit ? this.neurons[hit.index] : null;
      this.renderer.domElement.style.cursor = n ? "pointer" : "grab";

      // 懒加载标签：悬停节点显示其标签，离开回收（但聚焦标签不回收）
      if (n) {
        if (this._hoveredNeuron && this._hoveredNeuron.id !== n.id) {
          // 取消旧悬停高亮
          this._setHover(this._hoveredNeuron, 0);
          if (!this._isFocusLabel(this._hoveredNeuron.id)) this._hideLabel(this._hoveredNeuron.id);
        }
        this._hoveredNeuron = n;
        this._setHover(n, 1);
        this._showLabel(n);
      } else if (this._hoveredNeuron) {
        this._setHover(this._hoveredNeuron, 0);
        if (!this._isFocusLabel(this._hoveredNeuron.id)) this._hideLabel(this._hoveredNeuron.id);
        this._hoveredNeuron = null;
      }
    }

    /** 设置某神经元悬停标记（写 aHover 属性） */
    _setHover(neuron, val) {
      if (!neuron || neuron.meshIndex == null) return;
      const attr = this.neuronPoints.geometry.getAttribute("aHover");
      if (attr) { attr.array[neuron.meshIndex] = val; attr.needsUpdate = true; }
    }

    // ─────────────────────────────────────────────────────
    //  性能优化：LOD + 突触距离衰减
    // ─────────────────────────────────────────────────────

    _updatePerformance() {
      const camPos = this.camera.position;
      const distToOrigin = camPos.length();

      // 标签：懒加载后数量极少，仅对存在的做远距隐藏
      this.labelSprites.forEach((spr) => {
        spr.visible = camPos.distanceTo(spr.position) < CFG.lodDistFar * 1.5;
      });

      // 突触按距离调整透明度（远处更淡，强化星空感）
      if (this.synLinesWeakened) {
        const farFactor = clamp(distToOrigin / CFG.lodDistFar, 0, 1);
        this.synLinesWeakened.material.opacity = 0.05 * (1 - farFactor * 0.7) * this._lineDimMul;
      }
      if (this.synLinesBroken) {
        const farFactor = clamp(distToOrigin / CFG.lodDistFar, 0, 1);
        this.synLinesBroken.material.opacity = 0.02 * (1 - farFactor * 0.9) * this._lineDimMul;
      }
    }

    // ─────────────────────────────────────────────────────
    //  主循环
    // ─────────────────────────────────────────────────────

    _startLoop() {
      this.running = true;
      this.clock.start();
      this._tick();
    }

    _tick = () => {
      if (!this.running) return;
      requestAnimationFrame(this._tick);

      const dt = this.clock.getDelta();
      const time = this.clock.getElapsedTime();

      // FPS 计算
      this.frameCount++;
      if (time - this.lastFpsTime >= 1) {
        this.fps = this.frameCount;
        this.frameCount = 0;
        this.lastFpsTime = time;
      }

      // 控制器更新
      this.controls.update();

      // 激活脉冲动画
      this._updatePulse(time);

      // 聚焦模式：选中辉光脉动 + 连线由近及远动态生长
      if (this.focusGlow) this.focusGlow.material.uniforms.uTime.value = time;
      if (this.focusLines) {
        const t = clamp((performance.now() - this._focusLineStart) / 520, 0, 1);
        this.focusLines.material.uniforms.uReveal.value = t;
        this.focusLines.material.uniforms.uTime.value = time;
      }

      // 模拟推进（如果开启了可塑性自动运行）
      if (this.plasticityOn) {
        this.simStep++;
        if (this.simStep % 2 === 0) { // 每 2 帧跑一步模拟
          this.simulationTick();
        }
      }

      // 更新轨迹粒子
      this._updateTrails(dt);

      // 性能优化
      if (this.frameCount % 30 === 0) {
        this._updatePerformance();
      }

      // 渲染
      this.renderer.render(this.scene, this.camera);
    };

    // ─────────────────────────────────────────────────────
    //  公共 API
    // ─────────────────────────────────────────────────────

    /** 开关可塑性自动运行 */
    setPlasticity(on) {
      this.plasticityOn = !!on;
      if (!on) this.simStep = 0;
    }

    /** 开关辉光层（假 bloom 光晕 Points + 脑区发光团 Sprite） */
    setGlowEnabled(on) {
      this.glowEnabled = !!on;
      if (this.glowPoints) this.glowPoints.visible = this.glowEnabled;
      this.regionHalos.forEach((h) => { h.visible = this.glowEnabled; });
      if (this.focusId != null) this._applyFocusDim(); // 聚焦中切换开关需重算弱化
      return this.glowEnabled;
    }

    /** 开关连线层（能量线：active/weakened/broken 三批 LineSegments） */
    setLinesEnabled(on) {
      this.linesEnabled = !!on;
      if (this.synLinesActive) this.synLinesActive.visible = this.linesEnabled;
      if (this.synLinesWeakened) this.synLinesWeakened.visible = this.linesEnabled;
      if (this.synLinesBroken) this.synLinesBroken.visible = this.linesEnabled;
      if (this.focusId != null) this._applyFocusDim();
      return this.linesEnabled;
    }

    /** 切换某个脑区（类别）的可见性（用于 UI 复选筛选） */
    setGroupVisible(group, visible) {
      this.groupVisible[group] = !!visible;
      this._applyGroupVisibility();
    }

    /** 批量设置可见性：{ 脑区名: true/false, ... }（未列出的保持原值） */
    setVisibleGroups(map) {
      if (!map) return;
      Object.keys(map).forEach((g) => { this.groupVisible[g] = !!map[g]; });
      this._applyGroupVisibility();
    }

    /** 将所有脑区的可见性应用到 neuronPoints / glowPoints 的 aVisible 属性 */
    _applyGroupVisibility() {
      if (!this.neuronPoints) return;
      const na = this.neuronPoints.geometry.attributes.aVisible;
      const ga = this.glowPoints ? this.glowPoints.geometry.attributes.aVisible : null;
      this.neurons.forEach((n, i) => {
        const v = this.groupVisible[n.group || "元素"] === false ? 0 : 1;
        if (na) na.array[i] = v;
        if (ga) ga.array[i] = v;
      });
      if (na) na.needsUpdate = true;
      if (ga) ga.needsUpdate = true;
      // 同步隐藏与该脑区相关的连线（两端任一被隐藏则整条消失）
      this._applySynapseVisibility();
    }

    /**
     * 聚焦（选中）一个神经元：
     *  - 无视全局辉光/连线开关，点亮该点的辉光 + 动态显示它的连线
     *  - 锁定视角并暂停自转
     *  - 其它能量线暂时隐藏，其它辉光弱化以突出选中
     *  - 1 分钟无操作自动收起，收起后按开关状态还原辉光与连线
     */
    focusNeuron(neuron) {
      if (!neuron || !neuron.id) return [];
      this._clearFocusObjects();                 // 清掉上一次的聚焦对象
      this.focusId = neuron.id;
      this._autoRotateBeforeFocus = this.controls.autoRotate;
      this.controls.autoRotate = false;          // 锁定视角 + 暂停自转
      this._setNeuronFocus(neuron);              // 该点星核点亮/放大
      this._buildFocusGlow(neuron);              // 选中专用辉光（独立层，始终可见更亮）
      this._buildFocusLines(neuron);             // 选中专用连线（动态生长）
      this._applyFocusDim();                     // 若两者都开 → 弱化其它
      this._armFocusTimer();                     // 1 分钟收起

      // 显示文字标签：选中节点本身
      this._focusLabels = [];
      if (neuron.pos) {
        this._showLabel(neuron);
        this._focusLabels.push(neuron.id);
      }
      // 收集关联神经元（去重），并把它们的标签也点亮
      const seen = new Set([neuron.id]);
      const neighbors = [];
      this.synapses.forEach((s) => {
        let otherId = null;
        if (s.a === neuron.id) otherId = s.b;
        else if (s.b === neuron.id) otherId = s.a;
        if (!otherId || seen.has(otherId)) return;
        seen.add(otherId);
        const nb = this.byId[otherId];
        if (!nb) return;
        neighbors.push(nb);
        if (nb.pos && this._focusLabels.length < CFG.labelMaxVisible) {
          this._showLabel(nb);
          this._focusLabels.push(nb.id);
        }
      });
      this.focusNeighbors = neighbors;
      // 聚焦期间可交互范围：选中节点自己 + 关联节点（其它节点暂时取消鼠标事件）
      this._focusPickIds = new Set(neighbors.map((nb) => nb.id));

      // 镜头锁定拉近（比默认飞行更近，便于看清文字与连线）
      if (neuron.pos) this.flyTo(neuron.pos.clone(), CFG.searchFlyDuration, 0.5);
      return neighbors;
    }

    /** 退出聚焦：收起辉光/连线、还原自转、清弱化 */
    exitFocus() {
      this._clearFocusObjects();
      this.focusId = null;
      if (this.focusTimeout) { clearTimeout(this.focusTimeout); this.focusTimeout = null; }
      this.controls.autoRotate = this._autoRotateBeforeFocus;
      if (this.onFocusExit) this.onFocusExit(this._autoRotateBeforeFocus);
    }

    _armFocusTimer() {
      if (this.focusTimeout) clearTimeout(this.focusTimeout);
      this.focusTimeout = setTimeout(() => this.exitFocus(), 60000);
    }

    /** 用户有操作时重置收起计时 */
    _resetFocusIdle() {
      if (this.focusId != null) this._armFocusTimer();
    }

    _applyFocusDim() {
      const focusing = this.focusId != null;
      // 选中时：其它能量线暂时隐藏（聚焦模式只突出当前神经元自己的连线 focusLines）
      if (this.synLinesActive) this.synLinesActive.visible = !focusing;
      if (this.synLinesWeakened) this.synLinesWeakened.visible = !focusing;
      if (this.synLinesBroken) this.synLinesBroken.visible = !focusing;
      // 其它辉光弱化以突出选中（仅在辉光开关开启时）
      this._setGlowDim(focusing && this.glowEnabled ? 1.0 : 0);
    }

    _setGlowDim(v) {
      if (this.glowPoints && this.glowPoints.material.uniforms.uDim)
        this.glowPoints.material.uniforms.uDim.value = v;
    }

    _setLineOpacityMultiplier(m) {
      this._lineDimMul = m;
      if (this.synLinesActive && this._lineBaseOpacity.active != null)
        this.synLinesActive.material.opacity = this._lineBaseOpacity.active * m;
      if (this.synLinesWeakened && this._lineBaseOpacity.weakened != null)
        this.synLinesWeakened.material.opacity = this._lineBaseOpacity.weakened * m;
      if (this.synLinesBroken && this._lineBaseOpacity.broken != null)
        this.synLinesBroken.material.opacity = this._lineBaseOpacity.broken * m;
    }

    _restoreLineDim() { this._setLineOpacityMultiplier(1); }

    /** 点亮/取消点亮某神经元的星核（写 aFocus 属性，复用 shader 的 flare/放大逻辑） */
    _setNeuronFocus(neuron) {
      const attr = this.neuronPoints && this.neuronPoints.geometry.getAttribute("aFocus");
      if (!attr) return;
      if (this._focusAttrIndex != null) {
        attr.array[this._focusAttrIndex] = 0;
        this._focusAttrIndex = null;
      }
      if (neuron && neuron.meshIndex != null) {
        attr.array[neuron.meshIndex] = 1;
        this._focusAttrIndex = neuron.meshIndex;
      }
      attr.needsUpdate = true;
    }

    /** 选中神经元专用辉光（独立于全局开关，始终可见、更亮、脉动） */
    _buildFocusGlow(neuron) {
      if (this.focusGlow) {
        this.scene.remove(this.focusGlow);
        this.focusGlow.geometry.dispose();
        this.focusGlow.material.dispose();
      }
      const color = new THREE.Color(this.regions[neuron.group] || "#c7ceea");
      const positions = new Float32Array(3);
      positions[0] = neuron.pos ? neuron.pos.x : 0;
      positions[1] = neuron.pos ? neuron.pos.y : 0;
      positions[2] = neuron.pos ? neuron.pos.z : 0;
      const colors = new Float32Array([color.r, color.g, color.b]);
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uSize: { value: 46.0 },   // 选中辉光更克制（原 64）
          uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        },
        vertexShader: `
          uniform float uTime; uniform float uSize; uniform float uPixelRatio;
          varying vec3 vColor; varying float vPulse;
          void main() {
            vColor = color;
            vPulse = 0.82 + 0.18 * sin(uTime * 3.0);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = max(3.0, uSize * vPulse * uPixelRatio * (60.0 / -mv.z));
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: `
          varying vec3 vColor; varying float vPulse;
          void main() {
            vec2 uv = gl_PointCoord - 0.5; float d = length(uv);
            if (d > 0.5) discard;
            float glow = exp(-d * d * 10.0) * 0.7 + exp(-d * d * 3.0) * 0.3;
            float alpha = glow * (0.4 + 0.28 * vPulse);   // 选中辉光更克制（原 0.6+0.4）
            gl_FragColor = vec4(mix(vColor, vec3(1.0), 0.28), alpha);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexColors: true,
      });
      this.focusGlow = new THREE.Points(geom, mat);
      this.focusGlow.frustumCulled = false;
      this.scene.add(this.focusGlow);
    }

    /** 选中神经元专用连线：命中该神经元的突触，从它向外由近及远动态生长 */
    _buildFocusLines(neuron) {
      if (this.focusLines) {
        this.scene.remove(this.focusLines);
        this.focusLines.geometry.dispose();
        this.focusLines.material.dispose();
        this.focusLines = null;
      }
      const segs = [];
      const reveals = [];
      this.synapses.forEach((s) => {
        if (s.a !== neuron.id && s.b !== neuron.id) return;
        const other = (s.a === neuron.id) ? this.byId[s.b] : this.byId[s.a];
        if (!other || !other.pos || !neuron.pos) return;
        segs.push(neuron.pos.x, neuron.pos.y, neuron.pos.z, other.pos.x, other.pos.y, other.pos.z);
        reveals.push(0, 1); // 起点(选中)=0，远端=1 → uReveal 0→1 由近及远生长
      });
      if (segs.length === 0) return;
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.Float32BufferAttribute(segs, 3));
      geom.setAttribute("aReveal", new THREE.Float32BufferAttribute(reveals, 1));
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uReveal: { value: 0 },
          uTime: { value: 0 },
          uColor: { value: new THREE.Color(this.regions[neuron.group] || "#aaccff") },
        },
        vertexShader: `
          attribute float aReveal;
          uniform float uReveal;
          varying float vReveal;
          void main() {
            vReveal = aReveal;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying float vReveal;
          uniform float uReveal;
          uniform vec3 uColor;
          uniform float uTime;
          void main() {
            if (vReveal > uReveal) discard;       // 只显示已生长到的部分（动态生长观感）
            float pulse = 0.78 + 0.22 * sin(uTime * 4.0);
            gl_FragColor = vec4(uColor * 1.25, 0.92 * pulse);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      this.focusLines = new THREE.LineSegments(geom, mat);
      this.focusLines.frustumCulled = false;
      this.scene.add(this.focusLines);
      this._focusLineStart = performance.now();
    }

    /** 清理聚焦对象（不还原自转，供重新聚焦/退出共用） */
    _clearFocusObjects() {
      if (this.focusGlow) {
        this.scene.remove(this.focusGlow);
        this.focusGlow.geometry.dispose();
        this.focusGlow.material.dispose();
        this.focusGlow = null;
      }
      if (this.focusLines) {
        this.scene.remove(this.focusLines);
        this.focusLines.geometry.dispose();
        this.focusLines.material.dispose();
        this.focusLines = null;
      }
      // 隐藏聚焦期间显示的标签（本节点 + 关联节点）
      if (this._focusLabels && this._focusLabels.length) {
        this._focusLabels.forEach((id) => this._hideLabel(id));
        this._focusLabels = [];
      }
      // 恢复全部节点的鼠标事件
      this._focusPickIds = null;
      this._setNeuronFocus(null);
      this._setGlowDim(0);
      this._restoreLineDim();
      this._restoreVisibility();   // 还原其它能量线/辉光可见性（按全局开关）
    }

    /** 还原其它能量线/辉光的可见性（退出聚焦时按全局开关决定显不显示） */
    _restoreVisibility() {
      if (this.synLinesActive) this.synLinesActive.visible = this.linesEnabled;
      if (this.synLinesWeakened) this.synLinesWeakened.visible = this.linesEnabled;
      if (this.synLinesBroken) this.synLinesBroken.visible = this.linesEnabled;
      if (this.glowPoints) this.glowPoints.visible = this.glowEnabled;
      this.regionHalos.forEach((h) => { h.visible = this.glowEnabled; });
    }

    /** 重置所有激活值 */
    resetActivation() {
      this.neurons.forEach((n) => { n.act = 0; n.heat = 0; n.overlay = 0; });
      this.trailCount = 0;
    }

    /** 叠加实时词 */
    applyOverlay(text) {
      if (typeof NeuronEngine !== "undefined" && NeuronEngine.applyOverlay) {
        return NeuronEngine.applyOverlay(this.graph, text);
      }
      return [];
    }

    /** 获取当前统计 */
    getStats() {
      return {
        neuronCount: this.neurons.length,
        synapseCount: this.synapses.length,
        activeSynapses: this.synapses.filter(s => s.state === "active").length,
        brokenSynapses: this.synapses.filter(s => s.state === "broken").length,
        fps: this.fps,
        trailParticles: this.trailCount,
        cameraDistance: this.camera.position.length(),
      };
    }

    /** 导出当前视角为截图（返回 dataURL） */
    screenshot() {
      this.renderer.render(this.scene, this.camera);
      return this.renderer.domElement.toDataURL("image/png");
    }

    /** 销毁 */
    dispose() {
      this.running = false;
      if (this.flyAnim) cancelAnimationFrame(this.flyAnim);
      window.removeEventListener("resize", this._onResize);
      this.controls.dispose();
      this.renderer.dispose();
      // 清理几何体和材质...
      this.container.removeChild(this.renderer.domElement);
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  导出
  // ═══════════════════════════════════════════════════════════
  global.Neuron3DEngine = Neuron3DEngine;

})(typeof window !== "undefined" ? window : globalThis);
