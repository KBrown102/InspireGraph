---
title: 独立游戏开发 · AI 全流程实战（Nenly 案例）
date: 2026-08-09
keywords: AI全流程开发, 一人独立开发, 幸存者like, 武侠题材, 两个月上架, 本地模型部署, AI美术管线, AI代码协作, 极简资源, 工具链编排, Steam上架
---

# 独立游戏开发 · AI 全流程实战（Nenly 案例）

> 来源：抖音「Nenly同学」2026-08-28 视频《0 基础小白用 AI 两个月开发〈武侠传〉Survivor-like 游戏〈群侠传〉》
> 落库日期：2026-08-09 ｜ 用途：开发脑区方法论 + 工具链参考 + 灵感链路「开发」维度

## 项目成果

- **《群侠传》**：武侠题材 Survivor-like（幸存者 like），已上架 Steam
- **周期**：2 个月
- **资源极简**：1 人 + 十几个 AI 模型/Agent
- **硬件**：本地 RTX 5090 + 量化模型

## 新 4A 定义（核心方法论）

> AI 不能替代人的**时间、努力、耐心**，但可以让普通人撬动过去只有 3A 团队能做的事。

- **A** = 大量**时间**（Time）
- **A** = 大量**努力**（Effort）
- **A** = 大量**耐心**（Patience）
- **A** = **AI**（放大努力，而非取代）

**关键认知**：AI ≠ 取代努力，是**放大努力**。核心不可替代的是人的**审美判断**。

## 四大 AI 主导模块（工具链）

| 模块 | 关键工具 / 做法 |
|---|---|
| **AI 策划与代码** | Hermes Agent（RTX5090 本地 + QWEN3.6 27B 量化）+ Cursor + **Godot 引擎**（2D 友好 / 文档成熟 / Agent 易接管）+ Grill-me Skill 反向工程 + Prompt 生成文档/原型 |
| **AI 美术** | **HD-2D 像素风**（参考《歧路旅人》/ 天水碧）+ Image2 + Banana Pro + Qwen Image Edit + 本地量化提速 + Sprite 拆分层（前景/地面/背景/光效） |
| **AI 动画** | ComfyUI 本地模型 + After Effects + Goodbye Greenscreen 抠像 + 开源 Shader + Agent 生成可视化调参台 |
| **AI 音乐音效** | Suno 实战激战 BGM + ElevenLabs 打击/UI/系统音效 + 本地备选 ACE-STEP 1.5 + MMAudio |

## 真实挑战（避坑）

1. Demo 改了十几次才顺
2. 不靠 AI 死路一条，但纯靠 AI 也出不了精品
3. 必须 AI 反复抽卡 + 拆图 + 逐帧调图
4. **核心不可替代 = 人的审美判断**（选什么、砍什么、留什么）

## 对神经元系统的价值

- **玩法脑区**（classics.json）：Survivor-like / 武侠 RPG / roguelike / HD-2D
- **开发脑区**（taste.json）：AI 全流程 / 4A 新解 / Godot / HD-2D / 像素美术
- **灵感链路新维度**：题材 → 玩法（Survivor-like）→ 画风（HD-2D）→ 配色（群青/朱殷）

## 关联创作者

- 老植《一分钟学会制作独立游戏像素角色》—— 同主题（AI 像素美术落地），见 `独立游戏开发-AI像素美术-老植.md`
