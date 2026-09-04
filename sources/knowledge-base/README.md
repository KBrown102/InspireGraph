# 知识库（knowledge-base）

放进这里的 `.md` 笔记，会被 `collect-kb.cjs` 自动检索，把 `keywords:` 里列出的每个关键词变成一颗神经元（id 前缀 `kb:`），同笔记内的关键词两两连线形成团簇。

## 笔记格式

```markdown
---
title: 笔记标题
group: 知识库
keywords: 治愈,留白,呼吸,正念
---
正文……
```

- `keywords` 用中文逗号或英文逗号分隔，每个词 → 一颗神经元。
- 多个笔记出现同一关键词会**自动合并**（频次累加、权重提升），所以放心重复记。
- 想加新领域，直接新建 `.md` 即可，无需改代码。

## 用法

```bash
node collect-kb.cjs   # 扫描本目录 → 写出 kb.json
```

然后 `node gen-data.cjs` 会把它并入总图。自动采集任务也会在每次运行时补写新笔记（例如把搜索到的新趋势落成一篇 `热点YYYYMMDD.md`）。
