# Third-party notices

本仓库中有一部分纪律文本改写自 [mattpocock/skills](https://github.com/mattpocock/skills)
（MIT License，Copyright © 2026 Matt Pocock）。

| 上游文件 | 本仓库位置 | 改写方式 |
|---|---|---|
| [`skills/productivity/grilling/SKILL.md`](https://github.com/mattpocock/skills/blob/main/skills/productivity/grilling/SKILL.md) | `better-plan/disciplines.js` 的 `GRILLING_ASKING`；`better-plan-skill/references/grilling.md` | 去掉 frontmatter，把「每轮提问」从聊天改写为右侧面板发布、批量预选与一次确认 |
| [`skills/engineering/domain-modeling/SKILL.md`](https://github.com/mattpocock/skills/blob/main/skills/engineering/domain-modeling/SKILL.md) | `better-plan/disciplines.js` 的 `DOMAIN_MODELING`；`better-plan-skill/references/domain-modeling.md` | 压缩为一段可注入的系统提示，保留术语校准、场景压力测试、GLOSSARY/ADR 懒创建 |
| [`skills/engineering/grill-with-docs/SKILL.md`](https://github.com/mattpocock/skills/blob/main/skills/engineering/grill-with-docs/SKILL.md) | 两阶段流程的编排方式（无逐字复制）；`better-plan-skill/SKILL.md` 第 1–3 节 | 上游只是「依次调用 grilling 与 domain-modeling」；本插件把两者合成一次提问，并在其后增加「计划 → 确认 → 实施」第三段 |
| [`skills/productivity/grill-me/SKILL.md`](https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md) | 触发用语与「只调用 grilling」的简写方式（无逐字复制） | 用于说明本插件与上游 grill 系列的对应关系 |
| — | `better-plan/disciplines.js` 的 `PLAN_MODE`；`better-plan-skill/SKILL.md` 的第 3 节 | 本项目原创（两阶段流程、计划确认、自定义答案必须追问） |

- 文本**冻结在编写时的时间点**，上游后续更新不会自动同步；如需跟进，请对照上表逐段 diff。
- 上游仓库及其许可证 <https://github.com/mattpocock/skills/blob/main/LICENSE>。

## MIT License (mattpocock/skills)

```
MIT License

Copyright (c) 2026 Matt Pocock

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
