// run.cjs — 无头后台执行器（供灵感自动采集任务调用）
// 用法: node run.cjs [--words "实时对话词"] [--steps 240]
// 产出: last-run.json (种子) + thinking-log.md (思考过程与激活路径)
const path = require("path");
const fs = require("fs");
const engine = require("./engine.js");

const args = process.argv.slice(2);
function getArg(k, d) { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d; }
const seedWords = getArg("--words", "") || "";
const steps = parseInt(getArg("--steps", "240"), 10);

const sourcesDir = path.join(__dirname, "sources");
const graph = engine.buildGraph({ sourcesDir });
if (!graph) { console.error("没有任何可用来源"); process.exit(1); }

const { seed, trace } = engine.run(graph, { steps, seedWords, plasticity: true });

// 写 last-run.json
fs.writeFileSync(path.join(__dirname, "last-run.json"), JSON.stringify(seed, null, 2));

// 写 thinking-log.md（思考过程）
const now = new Date().toLocaleString("zh-CN");
const md = [
  `# 神经元灵感 · 思考记录`,
  ``,
  `> 生成时间：${now}`,
  `> 实时对话叠加词：${seedWords || "（无，仅用历史频率+近因+外部来源）"}`,
  `> 叠加命中概念：${seed.overlayHits.length ? seed.overlayHits.map((id) => (graph._byId[id] || {}).label || id).join("、") : "无"}`,
  ``,
  `## 一、灵感诞生过程（激活焦点随步数演化）`,
  ...trace.map((t) => `- ${t}`),
  ``,
  `## 二、最终聚焦概念（种子）`,
  ...seed.coreConcepts.map((c) => `- **${c.concept}**（${c.group}，激活 ${c.heat}，历史权重 ${c.weight}）`),
  ``,
  `## 三、关联通路（共同激活的突触）`,
  ...(seed.pathway.length ? seed.pathway.map((p) => `- ${p}`) : ["- （本次未形成明显通路）"]),
  ``,
  `## 四、给游戏任务的提示`,
  `> ${seed.promptHint}`,
  ``,
].join("\n");
fs.writeFileSync(path.join(__dirname, "thinking-log.md"), md);

console.log("✓ 神经元模拟完成");
console.log("  种子概念：" + seed.coreConcepts.map((c) => c.concept).join(" · "));
console.log("  已写出 last-run.json / thinking-log.md");
