/*
 * chain.cjs — 灵感链路随机关联生成器（CLI demo）
 * 依赖 engine.js 的 buildGraph / generateChain。
 *
 * 用法：
 *   node chain.cjs [种子关键词] [生成条数]
 * 例：
 *   node chain.cjs 童年回忆 5
 *
 * 链路逻辑（见 engine.generateChain）：
 *   种子=题材 → 玩法 → 画风 → 配色
 *   每跳优先走既有突触（适配关联），无则跨脑区按权重随机（弱关联），
 *   以 skipProb 概率跳过该角色（允许概率不关联）。
 */
const engine = require("./engine.js");

function runDemo(seed, times) {
  const g = engine.buildGraph();
  console.log("图谱规模:", g.neurons.length, "神经元 /", g.synapses.length, "突触");
  for (let i = 0; i < times; i++) {
    const r = engine.generateChain(g, seed, { roles: ["玩法", "画风", "配色"], skipProb: 0.2 });
    console.log("\n── 第 " + (i + 1) + " 条灵感链路（种子题材：" + r.seed.label + "·" + r.seed.group + "）──");
    r.chain.forEach((s) => {
      if (s.neuron) {
        console.log("  " + s.role + " → " + s.neuron.label + "（" + s.neuron.group + "）  " + s.via);
      } else {
        console.log("  " + s.role + " → （空）  " + s.via);
      }
    });
  }
}

if (require.main === module) {
  const seed = process.argv[2] || "童年回忆";
  const times = parseInt(process.argv[3] || "5", 10);
  runDemo(seed, times);
}
