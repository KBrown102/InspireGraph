// collect-kb.cjs — 检索知识库：把 sources/knowledge-base/*.md 里的关键词自动生成为神经元
// 用法: node collect-kb.cjs
// 产物: sources/knowledge-base/kb.json（neurons + synapses），供 gen-data 合并
//
// 笔记 frontmatter 支持三种 keywords 写法：
//   keywords: 治愈,留白,呼吸,正念          # 逗号分隔
//   keywords: [治愈, 留白, 呼吸, 正念]      # 行内数组
//   keywords:                              # YAML 列表
//     - 治愈
//     - 留白
//
// 连边策略（2026-08-09 改）：不再对同笔记关键词做 O(k²) 全连接。
//   小笔记（≤ FULL_CONNECT_MAX 个词）：全连接，团簇语义成立。
//   大笔记（每日热点这类大杂烩）：滑动窗口连接相邻词 + 每词一条确定性长程边，
//   边数从 O(k²) 降到 O(k)，避免单篇笔记垄断整张图、制造虚假关联。
const path = require("path");
const fs = require("fs");

const kbDir = path.join(__dirname, "sources", "knowledge-base");
const outFile = path.join(kbDir, "kb.json");

// —— 连边参数 ——
const FULL_CONNECT_MAX = 12; // 关键词数 ≤ 此值：全连接
const WINDOW = 3;            // 超过时：每个词连接其后 WINDOW 个词
const LONG_RANGE = true;     // 是否补一圈确定性长程边（保证团簇连通、不散架）

function slug(s) {
  return String(s).trim().toLowerCase().replace(/\s+/g, "-").replace(/[^\w一-龥-]/g, "");
}

// 清洗单个关键词：剥掉行内数组残留的方括号、引号、首尾空白
function cleanKeyword(s) {
  return String(s).replace(/^[\s[\]"']+|[\s[\]"']+$/g, "").trim();
}

function parseFrontmatter(text) {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return { keywords: [], group: "知识库", title: "" };

  const fm = {};
  let listKey = null;
  let listBuf = [];
  const flushList = () => {
    if (listKey) {
      fm[listKey] = listBuf.join(",");
      listKey = null;
      listBuf = [];
    }
  };

  for (const line of m[1].split("\n")) {
    // YAML 列表项："  - 某关键词"
    const item = line.match(/^\s*-\s+(.*)$/);
    if (item && listKey) {
      listBuf.push(item[1].trim());
      continue;
    }
    flushList();
    const i = line.indexOf(":");
    if (i > 0) {
      const key = line.slice(0, i).trim();
      const val = line.slice(i + 1).trim();
      if (val === "") {
        listKey = key; // 值为空 → 下面可能跟 YAML 列表
        listBuf = [];
      } else {
        fm[key] = val;
      }
    }
  }
  flushList();

  const keywords = String(fm.keywords || "")
    .split(/[,，]/)
    .map(cleanKeyword)
    .filter(Boolean);

  return { title: fm.title || "", group: fm.group || "知识库", keywords };
}

const files = fs.readdirSync(kbDir).filter((f) => f.endsWith(".md") && f.toUpperCase() !== "README.MD");
const neurons = {}; // id -> neuron
const synapses = [];
const pairSeen = new Set();
const warnings = [];
let fullClusterNotes = 0;
let sparseNotes = 0;

function addEdge(a, b, strength) {
  if (a === b) return;
  const key = a < b ? a + "|" + b : b + "|" + a;
  if (pairSeen.has(key)) return;
  pairSeen.add(key);
  synapses.push({ a, b, strength, myelin: 0.5, state: "active" });
}

files.forEach((f) => {
  const text = fs.readFileSync(path.join(kbDir, f), "utf8");
  const { group, keywords } = parseFrontmatter(text);

  if (keywords.length === 0) {
    warnings.push(`  ⚠ ${f}：未解析到任何 keywords（检查 frontmatter 格式）`);
    return;
  }

  const ids = [];
  keywords.forEach((kw) => {
    const id = "kb:" + slug(kw);
    if (!id || id === "kb:") return;
    if (!ids.includes(id)) ids.push(id);
    if (neurons[id]) {
      neurons[id].freq += 1;
      if (!neurons[id].kw.includes(kw)) neurons[id].kw.push(kw);
    } else {
      neurons[id] = { id, label: kw, group, weight: 0.45, freq: 1, lastSeen: Date.now(), kw: [kw] };
    }
  });

  const k = ids.length;
  if (k <= FULL_CONNECT_MAX) {
    // 小笔记：全连接，团簇是真实语义聚类
    for (let i = 0; i < k; i++)
      for (let j = i + 1; j < k; j++) addEdge(ids[i], ids[j], 0.5);
    fullClusterNotes++;
  } else {
    // 大笔记：滑动窗口 + 确定性长程边，避免 O(k²) 爆炸与虚假关联
    for (let i = 0; i < k; i++)
      for (let w = 1; w <= WINDOW && i + w < k; w++) addEdge(ids[i], ids[i + w], 0.45);
    if (LONG_RANGE) {
      const half = Math.floor(k / 2);
      for (let i = 0; i < k; i++) addEdge(ids[i], ids[(i + half) % k], 0.3);
    }
    sparseNotes++;
  }
});

// 权重按出现频次微缩放
const maxFreq = Math.max(1, ...Object.values(neurons).map((n) => n.freq));
Object.values(neurons).forEach((n) => {
  n.weight = +(0.4 + 0.4 * (n.freq / maxFreq)).toFixed(3);
});

const out = {
  neurons: Object.values(neurons),
  synapses,
  regions: { "知识库": "#b39ddb" },
  meta: {
    source: "knowledge-base",
    noteCount: files.length,
    fullClusterNotes,
    sparseNotes,
    builtAt: new Date().toISOString(),
  },
};
fs.writeFileSync(outFile, JSON.stringify(out, null, 2));

if (warnings.length) {
  console.log("⚠ 有笔记未产出关键词：");
  warnings.forEach((w) => console.log(w));
}
console.log(
  `✓ 知识库检索完成：${out.neurons.length} 关键词神经元 / ${out.synapses.length} 连线` +
    `（${files.length} 篇笔记：${fullClusterNotes} 篇全连接 · ${sparseNotes} 篇稀疏连接）`
);
console.log("✓ 已写出 sources/knowledge-base/kb.json");
