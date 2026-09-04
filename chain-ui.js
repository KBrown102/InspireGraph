// chain-ui.js — 浏览器版「灵感链路」生成器（灵感骰子）
// 数据来源：window.GAME_GRAPH { neurons, synapses, regions }
// 逻辑移植自 engine.js 的 generateChain：种子(题材) → 玩法 → 画风 → 配色
//   每跳优先走既有突触（适配关联），无则跨脑区按权重随机（弱关联），
//   并以 skipProb 概率跳过该跳（允许概率不关联）。
(function () {
  "use strict";
  const G = window.GAME_GRAPH;
  if (!G || !G.neurons) { window.InspirationChain = { available: false }; return; }

  const byId = {};
  G.neurons.forEach(function (n) { byId[n.id] = n; });

  // 多领域灵感链路：每个领域有自己的角色链 + 角色到脑区的映射
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
  };

  // 关键词找种子：先精确 id，再按 label/kw 子串匹配，命中取权重最高者
  function findSeed(kw) {
    const k = String(kw || "").trim();
    if (!k) return null;
    if (byIdsafe(k)) return byId[k];
    let best = null, bestScore = 0;
    G.neurons.forEach(function (n) {
      const pool = [n.label, (n.kw || []).join("|")].join("|");
      if (pool.indexOf(k) !== -1) {
        const s = n.weight || 0.4;
        if (s > bestScore) { bestScore = s; best = n; }
      }
    });
    return best;
  }
  function byIdsafe(id) { return Object.prototype.hasOwnProperty.call(byId, id); }

  function neighborsOf(id) {
    const out = [];
    G.synapses.forEach(function (s) {
      if (s.state === "broken") return;
      if (s.a === id) out.push({ id: s.b, strength: s.strength });
      else if (s.b === id) out.push({ id: s.a, strength: s.strength });
    });
    return out;
  }

  function pickWeighted(items, weightFn) {
    const ws = items.map(weightFn);
    const sum = ws.reduce(function (a, b) { return a + b; }, 0);
    if (sum <= 0) return null;
    let r = Math.random() * sum;
    for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  }

  // 按领域取默认种子组
  function randomTheme(domain) {
    const d = DOMAINS[domain] || DOMAINS.game;
    const pool = G.neurons.filter(function (n) { return d.seedGroups.indexOf(n.group) !== -1; });
    if (!pool.length) return null;
    return pool[(Math.random() * pool.length) | 0];
  }

  function generateChain(seedKeyword, opts) {
    opts = opts || {};
    const domain = opts.domain || "game";
    const d = DOMAINS[domain] || DOMAINS.game;
    const roles = opts.roles || d.roles;
    const skipProb = (typeof opts.skipProb === "number") ? opts.skipProb : 0.15;

    let seed = null;
    const kw = String(seedKeyword || "").trim();
    if (kw) seed = findSeed(kw);
    if (!seed) seed = randomTheme(domain);
    if (!seed) seed = G.neurons[(Math.random() * G.neurons.length) | 0];

    const chain = [{
      role: "种子(" + (domain === "tool" ? "痛点" : domain === "website" ? "主题" : domain === "gameplay" ? "循环" : "题材") + ")",
      neuron: { id: seed.id, label: seed.label, group: seed.group },
      via: kw ? ("关键词命中「" + kw + "」") : "随机种子",
    }];
    let cur = seed;
    let prevId = null;
    for (let ri = 0; ri < roles.length; ri++) {
      const role = roles[ri];
      const groups = ROLE_GROUPS[role] || [];
      if (Math.random() < skipProb) {
        chain.push({ role: role, neuron: null, via: "（本次未关联到" + role + "，概率跳过）" });
        continue;
      }
      let cand = neighborsOf(cur.id)
        .filter(function (c) {
          const n = byId[c.id];
          return n && groups.indexOf(n.group) !== -1 && c.id !== seed.id && c.id !== prevId;
        });
      let via;
      if (cand.length) {
        via = "突触直连（适配关联）";
      } else {
        cand = G.neurons
          .filter(function (n) { return groups.indexOf(n.group) !== -1 && n.id !== seed.id && n.id !== prevId; })
          .map(function (n) { return { id: n.id, strength: 0.3 }; });
        via = "跨脑区随机（弱关联）";
      }
      if (!cand.length) {
        chain.push({ role: role, neuron: null, via: "（无候选" + role + "）" });
        continue;
      }
      const chosen = pickWeighted(cand, function (c) {
        const n = byId[c.id];
        return c.strength * (n ? (n.weight || 0.4) : 0.4);
      });
      const n = byId[chosen.id];
      chain.push({ role: role, neuron: { id: n.id, label: n.label, group: n.group }, via: via });
      prevId = cur.id;
      cur = n;
    }
    return { seed: { id: seed.id, label: seed.label, group: seed.group }, chain: chain, domain: domain };
  }

  window.InspirationChain = {
    available: true,
    generate: generateChain,
    randomTheme: randomTheme,
    ROLE_GROUPS: ROLE_GROUPS,
    DOMAINS: DOMAINS,
  };
})();
