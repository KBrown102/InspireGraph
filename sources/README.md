# InspireGraph · 多源数据说明

图谱由 **5 个数据源 + 内置基础概念基座** 合并成一张神经元图：

| 来源 | 目录/文件 | 内容 | 谁来填 |
|------|-----------|------|--------|
| ① 基础概念基座 | `engine.js` 内置 CONCEPTS | 情绪/意象/机制/风格/元素 5 域核心概念 | 代码内置，始终存在 |
| ② 热点 | `web-hot/web-hot.json` | 当下热门类型/玩法/创意/热点 | 采集任务（WebSearch） |
| ③ 知识库 | `knowledge-base/*.md` → `kb.json` | 沉淀的知识/观察，关键词自动成神经元 | 手动 / 采集写入笔记 |
| ④ 外站采集 | `scraped-sites/scraped.json` | 从外部网站抓取的作品/概念 | 采集任务（WebFetch） |
| ⑤ 经典玩法 | `classic-games/*.json` | 经典益智/桌游/地摊玩法基因库 | 手工维护 |
| ⑥ 个人爽感 | `personal-taste/taste.json` | 个人口味的爽感机制 | 手工维护 |

## 数据流

```
各来源 JSON/MD
   └─> collect-kb.cjs 读取知识库 → kb.json
   └─> 采集任务 写 web-hot.json / scraped.json
            │
            ▼
      gen-data.cjs（engine.buildGraph 合并 + 跨源连线 + 内置基座）
            │
            ▼
        gamedata.js  ──>  index.html 可视化
            │
            ▼
      run.cjs 仿真 → last-run.json + thinking-log.md（灵感种子）
```

## 各文件格式

### web-hot/web-hot.json（热点神经元）
```json
{
  "neurons": [
    { "id": "hot:merge", "label": "合成经营", "group": "热点",
      "weight": 0.8, "freq": 3, "lastSeen": 0,
      "kw": ["合成","经营","merge","二合"] }
  ],
  "synapses": [
    { "a": "hot:merge", "b": "hot:narrative", "strength": 0.7, "myelin": 0.7, "state": "active" }
  ],
  "regions": { "热点": "#ffb347" },
  "meta": {}
}
```

### knowledge-base/*.md（知识库笔记）
用 frontmatter 声明 `keywords:`，`collect-kb.cjs` 会把每个关键词变成一颗 `kb:` 神经元。
（详见 `knowledge-base/README.md`）

### scraped-sites/sites.json（待填的两个网站）
```json
[
  { "name": "站点A", "url": "https://...", "note": "用户自生成/上传游戏的网站" },
  { "name": "站点B", "url": "https://...", "note": "" }
]
```
把 url 填好后，自动采集任务会用 WebFetch 抓作品标题/简介，写入 `scraped.json`（神经元 id 前缀 `web:`）。

## 手动刷新
```bash
node collect-kb.cjs     # 知识库 → kb.json
node gen-data.cjs       # 合并全部来源 → gamedata.js
node run.cjs            # 仿真出灵感种子
```
