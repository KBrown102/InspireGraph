// gen-data.cjs — 多源合并：把 热点/知识库/采集/经典玩法/个人爽感 + 内置基础概念 汇成一张统一神经元图
// 用法: node gen-data.cjs
// 产物: gamedata.js (window.GAME_GRAPH)，供 index.html 加载
const path = require("path");
const fs = require("fs");
const engine = require("./engine.js");

const sourcesDir = path.join(__dirname, "sources");
const graph = engine.buildGraph({ sourcesDir });
if (!graph) { console.error("没有任何可用来源（sources 缺失）"); process.exit(1); }

const data = {
  neurons: graph.neurons.map((n) => ({
    id: n.id, label: n.label, group: n.group, weight: +n.weight.toFixed(3),
    freq: n.freq, lastSeen: n.lastSeen, kw: n.kw || [],
  })),
  synapses: graph.synapses.map((s) => ({
    a: s.a, b: s.b, strength: +s.strength.toFixed(3), myelin: +s.myelin.toFixed(3), state: s.state,
  })),
  regions: graph.regions,
  meta: graph.meta,
};
const out = "window.GAME_GRAPH = " + JSON.stringify(data, null, 0) + ";\n";
fs.writeFileSync(path.join(__dirname, "gamedata.js"), out);

const byGroup = {};
data.neurons.forEach((n) => { byGroup[n.group] = (byGroup[n.group] || 0) + 1; });
const broken = data.synapses.filter((s) => s.state === "broken").length;
const weakened = data.synapses.filter((s) => s.state === "weakened").length;
console.log(`✓ 构建完成：${data.neurons.length} 神经元 / ${data.synapses.length} 突触（active ${data.synapses.length - broken - weakened}，weakened ${weakened}，broken ${broken}）`);
console.log("✓ 脑区分布：" + Object.entries(byGroup).map(([g, c]) => `${g} ${c}`).join("，"));
console.log("✓ 已写出 gamedata.js");
