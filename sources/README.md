# 神经元灵感系统 · 多源采集说明

灵感不再只来自 daily-games 的历史作品，而是 **4 个来源合并成一张神经元图**：

| 来源 | 目录 | 内容 | 谁来填 |
|------|------|------|--------|
| ① daily-games 历史 | （manifest.json） | 已生成的治愈小游戏主题/机制 | 游戏自动化产出 |
| ② 自动搜索热点 | `web-hot/web-hot.json` | 当下热门类型/玩法/创意/热点 | **自动采集任务**（WebSearch） |
| ③ 本地知识库 | `knowledge-base/*.md` → `kb.json` | 你沉淀的游戏设计知识，关键词自动成神经元 | 你/自动采集写入笔记 |
| ④ 外部网站采集 | `scraped-sites/scraped.json` | 从你给的两个小游戏网站抓的用户作品 | **自动采集任务**（WebFetch） |

## 数据流

```
各来源 JSON/MD
   └─> collect-kb.cjs 读取知识库 → kb.json
   └─> 自动采集任务 写 web-hot.json / scraped.json
            │
            ▼
      gen-data.cjs（engine.buildGraph 合并 + 跨源连线）
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
