/*
 * engine.js — 神经元灵感系统核心引擎（浏览器 / Node 双用）
 * 模型：Neuron(神经元,有weight大小) + Synapse(突触,有state/broken断触) + Region(脑区)
 *       + Plasticity(可塑性: Hebbian强化 / 衰减修剪 / 近因提升)
 */
(function (global) {
  "use strict";

  // ============ 脑区（分区）============
  const GROUPS = {
    "情绪": "#ff9aa2",
    "意象": "#a0e7e5",
    "机制": "#b5ead7",
    "风格": "#ffdac1",
    "元素": "#c7ceea",
    // v2 新来源脑区
    "热点": "#ffb347",     // 自动搜索抓取的热点趋势
    "知识库": "#b39ddb",   // 本地知识库检索出的关键词
    "采集": "#80cbc4",     // 从外部网站采集的用户作品
    "经典": "#e8a87c",     // 经典益智/桌游/地摊玩法基因库
    "爽感": "#f48fb1",     // 用户亲口认证的爽感机制（个人口味区，高权重不衰减）
  };

  // ============ 概念词典（5 域，kw=检测关键词）============
  // 来自 daily-games 真实主题/机制归纳；扫描 manifest 的 need/idea/mechanic/title 文本匹配。
  const CONCEPTS = [
    // 情绪
    { id: "calm",   label: "平静", g: "情绪", kw: ["平静", "静", "安"] },
    { id: "heal",   label: "治愈", g: "情绪", kw: ["治愈", "疗愈", "温暖", "安抚"] },
    { id: "focus",  label: "专注", g: "情绪", kw: ["专注", "凝", "心流"] },
    { id: "nost",   label: "怀旧", g: "情绪", kw: ["怀旧", "回忆", "旧", "从前", "童年", "童年回忆"] },
    { id: "wonder", label: "惊奇", g: "情绪", kw: ["惊奇", "震撼", "惊喜", "哇"] },
    { id: "alone",  label: "孤独", g: "情绪", kw: ["孤独", "一个人", "独处", "孤单"] },
    { id: "letgo",  label: "放下", g: "情绪", kw: ["放下", "松手", "放手", "交出去", "释"] },
    { id: "rest",   label: "休息", g: "情绪", kw: ["休息", "停", "坐", "躺", "歇", "慢"] },
    { id: "company",label: "陪伴", g: "情绪", kw: ["陪伴", "陪", "一起", "狐狸", "凑近", "依偎"] },
    // 意象
    { id: "water",  label: "水",   g: "意象", kw: ["水", "河", "海", "潮", "浪", "溪", "泊", "流"] },
    { id: "stone",  label: "石",   g: "意象", kw: ["石", "砂", "枯山水", "庭院", "岩"] },
    { id: "wind",   label: "风",   g: "意象", kw: ["风", "吹", "掠"] },
    { id: "light",  label: "光",   g: "意象", kw: ["光", "灯", "暖光", "亮", "星河"] },
    { id: "plant",  label: "植物", g: "意象", kw: ["植物", "花", "草", "苔", "树", "叶", "蒲公英", "根", "蔓"] },
    { id: "season", label: "四季", g: "意象", kw: ["四季", "春夏秋冬", "春", "秋", "季节"] },
    { id: "star",   label: "星",   g: "意象", kw: ["星", "星座", "银河", "夜空"] },
    { id: "breath", label: "呼吸", g: "意象", kw: ["呼吸", "吐纳", "气息"] },
    { id: "rain",   label: "雨",   g: "意象", kw: ["雨", "落雨", "细雨"] },
    { id: "fire",   label: "火",   g: "意象", kw: ["火", "余烬", "柴", "花火", "焰"] },
    { id: "cloud",  label: "云雾", g: "意象", kw: ["云", "雾", "雾气", "烟"] },
    { id: "snow",   label: "雪",   g: "意象", kw: ["雪", "冰", "寒"] },
    // 机制
    { id: "idle",     label: "放置", g: "机制", kw: ["放置", "摆", "搁"] },
    { id: "puzzle",   label: "解谜", g: "机制", kw: ["解谜", "谜", "谜题", "机关"] },
    { id: "rhythm",   label: "节奏", g: "机制", kw: ["节奏", "律动", "节拍", "拍"] },
    { id: "sim",      label: "模拟", g: "机制", kw: ["模拟", "仿真", "沙盘"] },
    { id: "narr",     label: "叙事", g: "机制", kw: ["叙事", "故事", "情节", "剧情"] },
    { id: "collect",  label: "收集", g: "机制", kw: ["收集", "攒", "集", "收藏"] },
    { id: "raise",    label: "养成", g: "机制", kw: ["养成", "成长", "照料", "照顾"] },
    { id: "assemble", label: "拼合", g: "机制", kw: ["拼", "拼合", "组合", "拼接"] },
    { id: "drag",     label: "拖拽", g: "机制", kw: ["拖", "拽", "拉", "拖拽"] },
    { id: "touch",    label: "触摸", g: "机制", kw: ["触", "摸", "轻触"] },
    // 风格
    { id: "morandi", label: "莫兰迪", g: "风格", kw: ["莫兰迪", "低饱和", "高级灰"] },
    { id: "blank",   label: "留白",   g: "风格", kw: ["留白", "空", "余地", "虚"] },
    { id: "minimal", label: "极简",   g: "风格", kw: ["极简", "简", "少"] },
    { id: "ink",     label: "水墨",   g: "风格", kw: ["水墨", "国画", "墨", "毛笔"] },
    { id: "pixel",   label: "像素",   g: "风格", kw: ["像素"] },
    { id: "soft",    label: "柔和",   g: "风格", kw: ["柔和", "温柔", "软"] },
    { id: "neon",    label: "霓虹",   g: "风格", kw: ["霓虹", "赛博", "光污染"] },
    // 元素
    { id: "wuxing", label: "五行", g: "元素", kw: ["五行", "金木水火土"] },
    { id: "chess",  label: "棋",   g: "元素", kw: ["棋", "围棋", "象棋"] },
    { id: "dice",   label: "骰子", g: "元素", kw: ["骰", "掷"] },
    { id: "astro",  label: "星象", g: "元素", kw: ["星象", "占星"] },
    { id: "geo",    label: "几何", g: "元素", kw: ["几何", "图形", "三角", "圆", "方"] },
    { id: "music",  label: "音律", g: "元素", kw: ["音律", "音乐", "五音", "声", "曲"] },
  ];

  const DAY = 86400000;

  // ============ 从 daily-games manifest 抽取图 ============
  function extractFromManifest(manifestPath) {
    const fs = require("fs");
    const raw = fs.readFileSync(manifestPath, "utf8");
    const data = JSON.parse(raw);
    const games = data.games || [];
    const now = Date.now();
    const byId = {};
    CONCEPTS.forEach((c, i) => {
      byId[c.id] = {
        id: c.id, label: c.label, group: c.g,
        freq: 0, lastSeen: 0, // 时间戳
        weight: 0.3, act: 0, overlay: 0,
        excite: 0.012 + Math.random() * 0.02, _i: i,
      };
    });
    // 共现计数
    const co = {};
    const pairKey = (a, b) => (a < b ? a + "|" + b : b + "|" + a);

    games.forEach((g) => {
      const text = [g.title, g.need, g.idea, g.mechanic].join(" ");
      const t = Date.parse(g.date) || now;
      const present = [];
      CONCEPTS.forEach((c) => {
        if (c.kw.some((k) => text.includes(k))) {
          const n = byId[c.id];
          n.freq += 1;
          if (t > n.lastSeen) n.lastSeen = t;
          present.push(c.id);
        }
      });
      for (let i = 0; i < present.length; i++)
        for (let j = i + 1; j < present.length; j++) {
          const k = pairKey(present[i], present[j]);
          co[k] = (co[k] || 0) + 1;
        }
    });

    // 计算 weight（频率 + 近因）
    const maxFreq = Math.max(1, ...CONCEPTS.map((c) => byId[c.id].freq));
    CONCEPTS.forEach((c) => {
      const n = byId[c.id];
      const fN = n.freq / maxFreq;
      const recN = n.lastSeen ? Math.exp(-(now - n.lastSeen) / (30 * DAY)) : 0;
      n.weight = Math.max(0.18, Math.min(1, 0.18 + 0.55 * fN + 0.4 * recN));
    });

    // 构建突触（共现 → strength；弱→断触）
    const maxCo = Math.max(1, ...Object.values(co));
    const synapses = [];
    Object.keys(co).forEach((k) => {
      const [a, b] = k.split("|");
      const s = co[k] / maxCo;
      let state = "active";
      if (s < 0.1) state = "broken";      // 断触（几乎不共现 → 修剪）
      else if (s < 0.28) state = "weakened";
      synapses.push({ a, b, strength: s, myelin: s, state });
    });

    const neurons = CONCEPTS.map((c) => byId[c.id]);
    const meta = { gameCount: games.length, builtAt: new Date().toISOString() };
    return { neurons, synapses, regions: GROUPS, meta, _byId: byId };
  }

  // ============ 基础概念基座（5 域：情绪/意象/机制/风格/元素）============
  // 原 CONCEPTS 仅在 extractFromManifest（扫描 daily-games 历史共现）中注入；
  // 本仓库不依赖外部宿主，改为无条件注入一份基础概念图，保证 5 大核心脑区始终存在。
  function extractBaseConcepts() {
    const byId = {};
    CONCEPTS.forEach((c, i) => {
      byId[c.id] = {
        id: c.id, label: c.label, group: c.g,
        freq: 1, lastSeen: 0, weight: 0.6, act: 0, overlay: 0,
        excite: 0.015 + (i % 5) * 0.002, _i: i,
      };
    });
    // 同域两两弱连接（团簇语义）；跨域连线交给 linkCrossSources 负责碰撞
    const synapses = [];
    const byGroup = {};
    CONCEPTS.forEach((c) => { (byGroup[c.g] = byGroup[c.g] || []).push(c.id); });
    Object.keys(byGroup).forEach((g) => {
      const ids = byGroup[g];
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++)
          synapses.push({ a: ids[i], b: ids[j], strength: 0.35, myelin: 0.35, state: "active" });
    });
    const neurons = CONCEPTS.map((c) => byId[c.id]);
    return { neurons, synapses, regions: GROUPS, meta: { baseConcepts: neurons.length } };
  }

  // ============ 实时对话叠加（确认项1：叠加）============
  // 解析文本，命中概念 → 提升其 overlay（叠加到 weight 上）
  function applyOverlay(graph, text) {
    if (!text) return [];
    const hits = [];
    // 把输入切成词，用于反向匹配：输入「捏塑」应能命中关键词「捏塑成型」
    const tokens = String(text).split(/[\s,，、。·\/|]+/)
      .map((s) => s.trim()).filter((s) => s.length >= 2);
    graph.neurons.forEach((n) => {
      const c = CONCEPTS.find((x) => x.id === n.id);
      const kws = (n.kw && n.kw.length) ? n.kw : (c ? c.kw : []);
      const pool = n.label ? kws.concat([n.label]) : kws;
      // 双向包含：输入整串含关键词，或输入的某个词是关键词的一部分
      const hit = pool.some((k) => text.includes(k) || tokens.some((t) => k.includes(t)));
      if (hit) {
        n.overlay = Math.min(1, n.overlay + 0.18);
        hits.push(n.id);
      }
    });
    return hits;
  }
  function effectiveWeight(n) { return Math.max(0.1, Math.min(1, n.weight + n.overlay)); }

  // ============ 仿真步进（含可塑性）============
  function step(graph, opts) {
    opts = opts || {};
    const plasticity = !!opts.plasticity;
    const ns = graph.neurons, syn = graph.synapses, byId = graph._byId;
    const SPREAD = 0.16, DECAY = 0.93;

    // 自发闪烁（近因/大权重更易被击中）；闪烁率随脑规模自适应，避免大脑越大越"沉默"
    const flickerRate = Math.min(0.06, 0.008 + ns.length * 0.0004);
    if (Math.random() < flickerRate) {
      const n = ns[(Math.random() * ns.length) | 0];
      n.act = Math.min(1, n.act + 0.55 * effectiveWeight(n));
    }
    // 传播
    const na = ns.map((n) => n.act * DECAY);
    const firedPairs = [];
    for (const e of syn) {
      if (e.state === "broken") continue; // 断触不通
      const A = byId[e.a], B = byId[e.b];
      const f = e.strength * SPREAD * (1 - DECAY);
      na[B._i] += A.act * f; na[A._i] += B.act * f;
      // Hebbian：共激活 → 突触增强（可塑性）
      if (plasticity && A.act > 0.4 && B.act > 0.4) {
        e.strength = Math.min(1, e.strength + 0.01);
        e.myelin = e.strength;
        if (e.state === "weakened" && e.strength >= 0.28) e.state = "active";
        firedPairs.push(e.a + "↔" + e.b);
      }
    }
    ns.forEach((n, i) => { n.act = Math.max(0, Math.min(1, na[i])); });
    // 衰减修剪（可塑性）：极弱突触 → 断触
    if (plasticity) {
      for (const e of syn) {
        e.strength *= 0.9995;
        if (e.strength < 0.05 && e.state !== "broken") e.state = "broken";
      }
    }
    return firedPairs;
  }

  // ============ 运行一次模拟，产出种子 + 思考轨迹 ============
  function run(graph, opts) {
    opts = opts || {};
    const steps = opts.steps || 220;
    const plasticity = opts.plasticity !== false;
    const seedWords = opts.seedWords || "";
    graph.neurons.forEach((n) => { n.act = 0; n.heat = 0; });
    const overlayHits = seedWords ? applyOverlay(graph, seedWords) : [];
    // 注入种子：命中点给个大激活
    overlayHits.forEach((id) => { graph._byId[id].act = 0.9; });
    // 无种子词时「自发起念」：按权重加权随机点燃 2-3 个神经元，保证思考一定能启动
    if (!overlayHits.length) {
      const pool = graph.neurons.slice().sort(() => Math.random() - 0.5);
      const picks = pool
        .map((n) => ({ n, score: effectiveWeight(n) * (0.5 + Math.random()) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 2 + (Math.random() < 0.5 ? 1 : 0));
      picks.forEach((p) => { p.n.act = Math.max(p.n.act, 0.75); });
    }

    const trace = [];
    const pathway = new Set();
    for (let s = 0; s < steps; s++) {
      const fired = step(graph, { plasticity });
      fired.forEach((p) => pathway.add(p));
      graph.neurons.forEach((n) => { n.heat += n.act; }); // 累计激活热度
      if (s % 40 === 0) {
        const top = topByHeat(graph, 3).map((n) => n.label).join("·");
        if (top) trace.push(`[${s}] 激活焦点：${top}`);
      }
    }
    const top = topByHeat(graph, 6);
    const seed = {
      generatedAt: new Date().toISOString(),
      seedWords: seedWords || null,
      overlayHits: overlayHits,
      coreConcepts: top.map((n) => ({ concept: n.label, group: n.group, heat: +n.heat.toFixed(1), weight: +n.weight.toFixed(2) })),
      pathway: [...pathway].slice(0, 24),
      promptHint: top.length
        ? `围绕「${top.map((n) => n.label).join("·")}」构思一款治愈小游戏，保持无惩罚、留白构图、跨端60fps。`
        : "（未产生焦点）",
    };
    return { seed, trace, top };
  }

  // 按累计热度取 Top（灵感焦点 = 整个思考过程被激活最多的概念）
  function topByHeat(graph, k) {
    const sorted = graph.neurons.filter((n) => n.heat > 0.5)
      .sort((a, b) => b.heat - a.heat);
    // 多源合并后常出现同名概念（如"收集"同时存在于知识库/爽感/热点区），
    // 种子里重复同一个词毫无信息量 —— 同 label 只保留热度最高的那个。
    const seen = new Set();
    const out = [];
    for (const n of sorted) {
      const key = String(n.label).trim();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(n);
      if (out.length >= k) break;
    }
    return out;
  }

  function topActive(graph, k) {
    return graph.neurons.filter((n) => n.act > 0.25)
      .sort((a, b) => b.act - a.act).slice(0, k);
  }

  // ============ 多源合并（v2：支持 热点/知识库/采集 等新来源）============
  function normNeuron(n, i) {
    return {
      id: n.id,
      label: n.label || n.id,
      group: n.group || "元素",
      weight: typeof n.weight === "number" ? n.weight : 0.4,
      freq: n.freq || 1,
      lastSeen: n.lastSeen || Date.now(),
      kw: Array.isArray(n.kw) ? n.kw : [],
      overlay: 0, act: 0, heat: 0,
      excite: 0.012 + Math.random() * 0.02,
      _i: i,
    };
  }

  function mergeGraphs(graphs) {
    const neurons = [];
    const byId = {};
    const regions = {};
    const synapses = [];
    const meta = { builtAt: new Date().toISOString(), parts: [] };
    graphs.forEach((g, gi) => {
      (g.neurons || []).forEach((n) => {
        if (byId[n.id]) { // 同 id 合并（如知识库多笔记出现同一关键词）
          const ex = byId[n.id];
          ex.freq += (n.freq || 1);
          ex.weight = Math.max(ex.weight, n.weight || 0.4);
          if (n.kw) ex.kw = Array.from(new Set([...(ex.kw || []), ...n.kw]));
          if (n.lastSeen && n.lastSeen > ex.lastSeen) ex.lastSeen = n.lastSeen;
          return;
        }
        const nn = normNeuron(n, neurons.length);
        neurons.push(nn);
        byId[nn.id] = nn;
      });
      (g.synapses || []).forEach((s) => synapses.push(s));
      Object.assign(regions, g.regions || {});
      meta.parts.push(g.meta && g.meta.gameCount ? ("games:" + g.meta.gameCount) : ("src" + gi));
    });
    const valid = synapses.filter((s) => byId[s.a] && byId[s.b]);
    return { neurons, synapses: valid, regions, meta, _byId: byId };
  }

  // 跨源连线：让新来源神经元与既有概念/其他来源产生"灵感碰撞"
  function bigrams(s) { const set = new Set(); s = s || ""; for (let i = 0; i + 1 < s.length; i++) set.add(s.substr(i, 2)); return set; }
  function labelOverlap(a, b) { const A = bigrams(a), B = bigrams(b); let c = 0; A.forEach((x) => { if (B.has(x)) c++; }); return c; }
  function linkCrossSources(graph) {
    const ns = graph.neurons, byId = graph._byId;
    const conceptIds = new Set(CONCEPTS.map((c) => c.id));
    const pairSeen = new Set(graph.synapses.map((s) => (s.a < s.b ? s.a + "|" + s.b : s.b + "|" + s.a)));
    ns.forEach((n) => {
      if (conceptIds.has(n.id)) return; // 只给新来源神经元找连接
      const cand = [];
      ns.forEach((m) => {
        if (m.id === n.id) return;
        let o = labelOverlap(n.label, m.label);
        if (n.kw && m.kw) { const shared = n.kw.filter((k) => m.kw.includes(k)); if (shared.length) o = Math.max(o, 3); }
        if (o >= 1) cand.push({ id: m.id, o });
      });
      cand.sort((a, b) => b.o - a.o);
      cand.slice(0, 2).forEach((c) => {
        const key = (n.id < c.id ? n.id + "|" + c.id : c.id + "|" + n.id);
        if (pairSeen.has(key)) return;
        pairSeen.add(key);
        graph.synapses.push({ a: n.id, b: c.id, strength: 0.3, myelin: 0.3, state: "weakened" });
      });
    });
    return graph;
  }

  // 汇总所有来源 → 一张统一神经元图（供 gen-data / run 使用）
  function buildGraph(opts) {
    opts = opts || {};
    const fs = require("fs");
    const path = require("path");
    // daily-games 是外部宿主项目，其 manifest.json 不随本仓库分发；
    // 需要注入游戏历史概念时通过 opts.manifestPath 显式传入；缺省只使用本仓库内 sources/ 数据源。
    const manifestPath = opts.manifestPath;
    const sourcesDir = opts.sourcesDir || path.join(__dirname, "sources");
    const graphs = [];
    graphs.push(extractBaseConcepts()); // 基础概念基座：保证 5 大核心脑区始终存在
    if (manifestPath && fs.existsSync(manifestPath)) graphs.push(extractFromManifest(manifestPath));
    const srcFiles = [
      { file: "web-hot/web-hot.json", regions: { "热点": "#ffb347" } },
      { file: "knowledge-base/kb.json", regions: { "知识库": "#b39ddb" } },
      { file: "scraped-sites/scraped.json", regions: { "采集": "#80cbc4" } },
      { file: "classic-games/classics.json", regions: { "经典": "#e8a87c" } },
      { file: "personal-taste/taste.json", regions: { "爽感": "#f48fb1" } },
    ];
    srcFiles.forEach((sf) => {
      const fp = path.join(sourcesDir, sf.file);
      if (!fs.existsSync(fp)) return;
      try {
        const d = JSON.parse(fs.readFileSync(fp, "utf8"));
        if (d && Array.isArray(d.neurons) && d.neurons.length) {
          graphs.push({ neurons: d.neurons, synapses: d.synapses || [], regions: d.regions || sf.regions, meta: d.meta || {} });
        }
      } catch (e) { console.warn("跳过", fp, e.message); }
    });
    if (!graphs.length) return null;
    let g = mergeGraphs(graphs);
    g = linkCrossSources(g);
    return g;
  }

  // ============ 灵感链路随机关联（v3：按角色逐跳，允许概率不关联）============
  // 从小游戏灵感出发：种子=题材，再逐跳 玩法→画风→配色。
  // 每跳优先走既有突触（适配关联），无则跨脑区按权重随机（弱关联）；
  // 以 skipProb 概率跳过该角色（允许概率不关联）。返回带 rationale 的链路。
  // 多领域灵感链路配置
  const DOMAINS = {
    game: {
      label: "题材 → 玩法 → 画风 → 配色",
      roles: ["题材", "玩法", "画风", "配色"],
      seedGroups: ["意象", "情绪", "经典", "审美", "热点", "文学", "电影", "运动", "天文", "地理"],
    },
    tool: {
      label: "痛点 → 功能 → 交互 → 视觉",
      roles: ["痛点", "功能", "交互", "视觉"],
      seedGroups: ["意象", "情绪", "经典", "热点", "文学", "电影", "运动", "天文", "地理", "开发"],
    },
    website: {
      label: "主题 → 结构 → 视觉 → 内容",
      roles: ["主题", "结构", "视觉", "内容"],
      seedGroups: ["意象", "情绪", "经典", "审美", "热点", "文学", "电影", "运动", "开发"],
    },
    gameplay: {
      label: "循环 → 机制元 → 情绪 → 爽感",
      roles: ["循环", "机制元", "情绪", "爽感"],
      seedGroups: ["机制", "经典", "爽感", "意象", "情绪"],
    },
  };

  const ROLE_GROUPS = {
    // 游戏
    "题材": ["意象", "情绪", "经典"],
    "玩法": ["机制", "经典", "元素"],
    "画风": ["风格", "审美"],
    "配色": ["审美", "风格"],
    // 工具
    "痛点": ["意象", "情绪", "热点", "经典"],
    "功能": ["机制", "开发", "元素"],
    "交互": ["风格", "审美", "机制"],
    // 网站
    "主题": ["意象", "情绪", "经典", "审美"],
    "结构": ["机制", "开发", "元素"],
    "内容": ["情绪", "意象", "文学"],
    // 玩法深挖
    "循环": ["机制", "爽感", "经典"],
    "机制元": ["机制", "元素"],
    // 通用
    "视觉": ["审美", "风格"],
    "爽感": ["爽感"],
    "情绪": ["情绪", "意象"],
    "开发": ["开发"],
  };

  function findSeed(graph, kw) {
    const k = String(kw || "").trim();
    if (!k) return null;
    if (graph._byId[k]) return graph._byId[k];
    let best = null, bestScore = 0;
    graph.neurons.forEach((n) => {
      const pool = [n.label, ...(n.kw || [])].join("|");
      if (pool.includes(k)) {
        const s = n.weight || 0.4;
        if (s > bestScore) { bestScore = s; best = n; }
      }
    });
    return best;
  }

  function neighborsOf(graph, id) {
    const out = [];
    graph.synapses.forEach((s) => {
      if (s.state === "broken") return;
      if (s.a === id) out.push({ id: s.b, strength: s.strength });
      else if (s.b === id) out.push({ id: s.a, strength: s.strength });
    });
    return out;
  }

  function pickWeighted(items, weightFn) {
    const ws = items.map(weightFn);
    const sum = ws.reduce((a, b) => a + b, 0);
    if (sum <= 0) return null;
    let r = Math.random() * sum;
    for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  }

  function generateChain(graph, seedKeyword, opts) {
    opts = opts || {};
    // gamedata.js 可能未生成 _byId，兜底构建
    if (!graph._byId) {
      graph._byId = {};
      graph.neurons.forEach((n) => { graph._byId[n.id] = n; });
    }
    const domain = opts.domain || "game";
    const d = DOMAINS[domain] || DOMAINS.game;
    const roles = opts.roles || d.roles;
    const skipProb = (typeof opts.skipProb === "number") ? opts.skipProb : 0.15;
    let seed = findSeed(graph, seedKeyword);
    if (!seed) {
      const pool = graph.neurons.filter((n) => d.seedGroups.indexOf(n.group) !== -1);
      seed = pool.length ? pool[(Math.random() * pool.length) | 0] : graph.neurons[(Math.random() * graph.neurons.length) | 0];
    }
    const seedRoleName = domain === "tool" ? "痛点" : domain === "website" ? "主题" : domain === "gameplay" ? "循环" : "题材";
    const chain = [{
      role: "种子(" + seedRoleName + ")",
      neuron: { id: seed.id, label: seed.label, group: seed.group },
      via: seedKeyword ? "关键词命中" : "随机种子",
    }];
    let cur = seed;
    let prevId = null;
    for (const role of roles) {
      const groups = ROLE_GROUPS[role] || [];
      if (Math.random() < skipProb) {
        chain.push({ role, neuron: null, via: "（本次未关联到" + role + "，概率跳过）" });
        continue;
      }
      let cand = neighborsOf(graph, cur.id)
        .filter((c) => { const n = graph._byId[c.id]; return n && groups.includes(n.group) && c.id !== seed.id && c.id !== prevId; });
      let via;
      if (cand.length) {
        via = "突触直连（适配关联）";
      } else {
        cand = graph.neurons
          .filter((n) => groups.includes(n.group) && n.id !== seed.id && n.id !== prevId)
          .map((n) => ({ id: n.id, strength: 0.3 }));
        via = "跨脑区随机（弱关联）";
      }
      if (!cand.length) {
        chain.push({ role, neuron: null, via: "（无候选" + role + "）" });
        continue;
      }
      const chosen = pickWeighted(cand, (c) => {
        const n = graph._byId[c.id];
        return c.strength * (n ? (n.weight || 0.4) : 0.4);
      });
      const n = graph._byId[chosen.id];
      chain.push({ role, neuron: { id: n.id, label: n.label, group: n.group }, via });
      prevId = cur.id;
      cur = n;
    }
    return { seed: { id: seed.id, label: seed.label, group: seed.group }, chain };
  }

  // ============ 导出 ============
  function exportSeed(graph, opts) { return run(graph, opts).seed; }

  // 手动拨弄：从指定节点出发 BFS 走 N 跳（1-6），按 synapse strength 加权选路径，避免重复节点
  // 返回 { start, depth, nodes:[{id,label,group,weight}], links:[{from,to,strength}] }
  function walkFromNode(graph, startId, depth) {
    depth = Math.max(1, Math.min(6, depth | 0 || 1));
    const byId = graph._byId || {};
    const get = function (id) {
      if (byId[id]) return byId[id];
      return (graph.neurons || []).find(function (n) { return n.id === id; }) || null;
    };
    const adj = {};
    (graph.synapses || []).forEach(function (s) {
      if (s.state === "broken") return;
      if (!adj[s.a]) adj[s.a] = [];
      if (!adj[s.b]) adj[s.b] = [];
      adj[s.a].push({ id: s.b, strength: s.strength });
      adj[s.b].push({ id: s.a, strength: s.strength });
    });
    const visited = {};
    const nodes = [];
    const links = [];
    const start = get(startId);
    if (!start) return { start: null, depth: depth, nodes: nodes, links: links };
    visited[start.id] = true;
    nodes.push({ id: start.id, label: start.label, group: start.group, weight: start.weight || 0.5 });

    // 每一层：对当前层所有节点，按 strength 选出未访问的邻居加入下一层
    let frontier = [start.id];
    for (let d = 1; d <= depth && frontier.length; d++) {
      const next = [];
      frontier.forEach(function (fid) {
        const nbrs = (adj[fid] || []).filter(function (c) { return !visited[c.id]; });
        // 按 strength*权重排序，取前若干（控制广度，避免爆炸）
        nbrs.sort(function (a, b) { return b.strength - a.strength; });
        const take = Math.min(nbrs.length, 6);
        for (let i = 0; i < take; i++) {
          const c = nbrs[i];
          if (visited[c.id]) continue;
          visited[c.id] = true;
          const node = get(c.id);
          if (!node) continue;
          nodes.push({ id: node.id, label: node.label, group: node.group, weight: node.weight || 0.5 });
          links.push({ from: fid, to: c.id, strength: c.strength });
          next.push(c.id);
        }
      });
      frontier = next;
    }
    return { start: { id: start.id, label: start.label, group: start.group }, depth: depth, nodes: nodes, links: links };
  }

  const api = {
    GROUPS, CONCEPTS, extractFromManifest, applyOverlay, effectiveWeight,
    step, run, topActive, exportSeed,
    mergeGraphs, linkCrossSources, buildGraph,
    generateChain, findSeed, ROLE_GROUPS, DOMAINS, walkFromNode,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.NeuronEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
