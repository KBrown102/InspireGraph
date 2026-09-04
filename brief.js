// brief.js — 「灵感完善专家」前端实现（纯浏览器，无文件依赖）
// 输入：walkFromNode 返回的 { start, depth, nodes, links }
// 处理：按 group 分类 → 映射循环13 / 机制元25 / 风格卡（硬编码精简对照）→ 翻表三步法
// 输出：标准设计骨架文本（核心循环 + 机制元组合 + 视觉 + 单关目标）
(function () {
  "use strict";

  // —— 硬编码对照表（源自 Claw/references/design/ 两篇 + styles/，纯前端不解析 md）——
  // 循环13方向（动力层）：治愈向偏好标注
  const LOOP_LIB = {
    "充电宝": { note: "提前储备应急兜底资源，主打有备无患", heal: true },
    "存钱罐": { note: "延迟兑现收益，权衡落袋为安还是冒险增值", heal: true },
    "工具箱": { note: "容量有限，预判前路需求挑选道具", heal: true },
    "滚雪球": { note: "收益持续投入扩张，断链可能全损", heal: false },
    "信用卡": { note: "透支未来换短期爆发，后续承担代价", heal: false },
    "错题本": { note: "靠失败积累经验，输局也有收获", heal: true },
    "试菜": { note: "先落地方案再逐步调整优化", heal: true },
    "陪练": { note: "对手动态适配实力，难度略高一点", heal: true },
    "接力棒": { note: "流程分段，为后续阶段预留条件", heal: true },
    "人情账": { note: "系统长期记录行为，决策别只看短期", heal: true },
    "行李箱": { note: "存储有限，取舍高价值战利品", heal: true },
    "猫捉老鼠": { note: "系统克制固定打法，逼迫变换策略", heal: false },
    "传送门": { note: "两套系统双向影响，形成闭环", heal: true },
  };

  // 机制元25（操作层）：5 类
  const ATOM_LIB = {
    "生成": "建立", "放置": "建立", "连接": "建立", "揭示": "建立", "解锁": "建立",
    "移除": "撤销", "断开": "撤销", "消耗": "撤销", "隐藏": "撤销", "锁定": "撤销",
    "替换": "改写", "位移": "改写", "旋转": "改写", "标量调整": "改写", "控制权转移": "改写", "延迟执行": "改写",
    "耦合位移": "转流", "转化": "转流", "分配": "转流", "侦测": "转流", "随机选择": "转流", "行动者选择": "转流",
    "合并": "重构", "置换": "重构", "拆分": "重构",
  };

  // 风格卡关键词 → 视觉基调（源自 styles/ 各 SKILL.md）
  const STYLE_LIB = {
    "莫奈": "印象派 · 睡莲浮光 · 低饱和水面蓝绿 + 粉白花瓣 · 半透明笔触模拟浮光",
    "水墨": "东方水墨 · 留白意境 · 黑白灰 + 一笔见形 · 宣纸肌理",
    "像素": "复古像素 · 网格清晰 · 限色板(16色) · 硬边描线",
    "液态玻璃": "Glassmorphism 进阶 · 折射扭曲 + 边缘高光 + 环境反光流动 · 半透明毛玻璃卡片",
    "治愈": "低饱和暖调 · 柔和光晕 · 圆角有机形 · 呼吸式动效",
    "极简": "大量留白 · 单一强调色 · 无装饰 · 几何克制",
  };

  // 从节点 label 里识别命中的循环/机制元/风格
  function matchLib(label, lib) {
    const hits = [];
    Object.keys(lib).forEach(function (k) {
      if (label && label.indexOf(k) !== -1) hits.push(k);
    });
    return hits;
  }

  // 翻表三步法：nodes → 骨架
  function buildBrief(walk) {
    if (!walk || !walk.start) return { ok: false, error: "未选中神经元" };
    const nodes = walk.nodes || [];
    const labels = nodes.map(function (n) { return n.label || ""; });

    // ① 选循环方向（动力层）
    let loops = [];
    labels.forEach(function (lb) { matchLib(lb, LOOP_LIB).forEach(function (k) { if (loops.indexOf(k) === -1) loops.push(k); }); });
    // 若种子本身没命中循环，按 weight 高的常见治愈循环补一个推荐
    let loopNote = [];
    if (loops.length) {
      loopNote = loops.slice(0, 2).map(function (k) {
        const L = LOOP_LIB[k];
        return L.heal ? (k + "（治愈友好）") : (k + "（高压，慎用）");
      });
    } else {
      loopNote = ["充电宝（治愈默认推荐：储备兜底、零惩罚）", "错题本（失败有收获）"];
    }

    // ② 选机制元（操作层）：从命中里挑 3-5 个，按 5 类尽量覆盖
    let atoms = [];
    labels.forEach(function (lb) { matchLib(lb, ATOM_LIB).forEach(function (k) { if (atoms.indexOf(k) === -1) atoms.push(k); }); });
    if (atoms.length < 3) {
      // 兜底补通用组合
      ["生成", "放置", "揭示", "标量调整", "合并"].forEach(function (k) { if (atoms.indexOf(k) === -1) atoms.push(k); });
    }
    atoms = atoms.slice(0, 5);

    // ③ 视觉基调：识别风格卡
    let style = "治愈（低饱和暖调 · 圆角有机形 · 呼吸式动效）";
    labels.forEach(function (lb) {
      Object.keys(STYLE_LIB).forEach(function (k) {
        if (lb.indexOf(k) !== -1) style = STYLE_LIB[k];
      });
    });

    // 复用代码指向（基于命中风格/机制给 hint）
    let reuse = "codex/ 下颗粒系统(bloom-tree / wind) 可改水体光斑或笔触粒子";
    if (style.indexOf("像素") !== -1) reuse = "codex/ 像素渲染基础 + 网格对齐工具";
    if (style.indexOf("液态玻璃") !== -1) reuse = "demo-liquid-glass 的折射+边缘高光实现可复用";

    const lines = [];
    lines.push("【灵感种子】" + (walk.start.label || walk.start.id) + "（" + (walk.start.group || "未知") + "）· 出链深度 " + walk.depth);
    lines.push("");
    lines.push("【核心循环 · 动力层】");
    loopNote.forEach(function (s) { lines.push("  · " + s); });
    lines.push("");
    lines.push("【机制元组合 · 操作层】");
    lines.push("  " + atoms.join(" → "));
    lines.push("");
    lines.push("【视觉基调】");
    lines.push("  " + style);
    lines.push("");
    lines.push("【单关目标】用有限操作串起上面机制元，让「" + loopNote[0].replace(/（.*/, "") + "」循环可见、可再玩");
    lines.push("");
    lines.push("【复用代码】" + reuse);
    return { ok: true, text: lines.join("\n"), loops: loops, atoms: atoms, style: style };
  }

  // —— 灵感质量门 gate：三档强度 + PROCEED / PIVOT / KILL 判定 ——
  // 思路参考 CCGS 的 gate-check 与 prototype 判定，落到我们的「神经元吐种 → brief」链路上。
  // mode: "solo" 只查可玩性底线 | "lean"（默认）加视觉与操作链张力 | "full" 再加心理锚点人工确认项
  function gateBrief(brief, opts) {
    opts = opts || {};
    const mode = opts.mode || "lean";
    const b = brief || {};
    const loops = b.loops || [];
    const atoms = b.atoms || [];
    const style = b.style || "";
    const reasons = [];
    const suggestions = [];

    // 是否治愈向：未显式指定时从视觉基调推断
    let healing = opts.healing;
    if (healing === undefined) healing = /治愈|柔和|低饱和|呼吸|暖调/.test(style);

    // ① 核心循环：没有 = 玩法没有持续动力
    if (!loops.length) {
      reasons.push({ level: "fail", msg: "没有命中任何核心循环——做出来的大概率是「会动的壁纸」而不是游戏" });
      suggestions.push("回 game-loops.md 手挑 1-2 个循环；治愈向优先 充电宝 / 错题本 / 试菜 / 陪练");
    } else {
      reasons.push({ level: "pass", msg: "核心循环已定：" + loops.join("、") });
      const high = loops.filter(function (l) { return LOOP_LIB[l] && LOOP_LIB[l].heal === false; });
      if (high.length && healing) {
        reasons.push({ level: "warn", msg: "治愈向用了高压循环（" + high.join("、") + "），与「回血不是消耗」的定位冲突" });
        suggestions.push("换成低惩罚循环，或给它配一个安全垫（如搭配 充电宝）");
      }
    }

    // ② 机制元链：少于 2 个 = 玩家没有可操作动词
    if (atoms.length < 2) {
      reasons.push({ level: "fail", msg: "机制元不足 2 个——玩家没有可操作动词，构不成操作链" });
      suggestions.push("从 mechanism-atoms.md 补到 3-5 个，且尽量跨类");
    } else {
      const cats = {};
      atoms.forEach(function (a) { if (ATOM_LIB[a]) cats[ATOM_LIB[a]] = 1; });
      const catList = Object.keys(cats);
      if (catList.length < 2) {
        reasons.push({ level: "warn", msg: "机制元全在同一类（" + catList.join("") + "），操作链缺张力" });
        suggestions.push("混入 转流 / 改写 / 重构 类动作，让上一步的结果影响下一步");
      } else {
        reasons.push({ level: "pass", msg: "机制元跨 " + catList.length + " 类：" + catList.join(" → ") });
      }
    }

    // ③ 视觉基调（solo 档不查）
    if (mode !== "solo") {
      if (!style) {
        reasons.push({ level: "fail", msg: "没有视觉基调，实现时必然临时拍脑袋" });
        suggestions.push("从 styles/ 挑一张风格卡，至少定配色与动效基因");
      } else {
        reasons.push({ level: "pass", msg: "视觉基调已定" });
      }
    }

    // ④ 心理锚点（full 档，需人工确认）
    if (mode === "full") {
      reasons.push({
        level: "warn",
        msg: "心理锚点待人工确认：能否一句话说清「玩家在这里感觉自己是谁」？目标玩家类型是谁？操作后 0.5 秒玩家能感知到什么？（见 design/player-psychology.md 第六节自检清单）"
      });
    }

    const fails = reasons.filter(function (r) { return r.level === "fail"; }).length;
    const warns = reasons.filter(function (r) { return r.level === "warn"; }).length;
    let verdict = "PROCEED";
    if (fails > 0) verdict = "KILL";
    else if (warns > 0) verdict = "PIVOT";

    return { verdict: verdict, mode: mode, healing: healing, reasons: reasons, suggestions: suggestions };
  }

  window.InspirationBrief = { build: buildBrief, gate: gateBrief, LOOP_LIB: LOOP_LIB, ATOM_LIB: ATOM_LIB, STYLE_LIB: STYLE_LIB };
})();
