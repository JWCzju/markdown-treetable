# Rich TreeTable 发布审计

审计日期：2026-10-17

## 产品定位

Rich TreeTable 是一个 Markdown-first 的树形记录表增强插件。它保留 Markdown 表格作为唯一数据源，在 Live Preview、阅读模式和嵌入场景中提供层级、折叠、原生单元格编辑和可扫描的表格布局。

它与 Advanced Tables 的编辑器增强、Table Extended 的 MultiMarkdown 结构扩展、Markdown Table Editor 的 CSV/Excel 外部编辑器定位不同。核心卖点是：用户可以继续手写和复制普通 Markdown 表格，同时获得树形记录的阅读和编辑体验。

## 当前可宣称的能力

- `#`、`##`、`###` 分组行；分组行仍是可编辑的 Markdown 表格数据。
- `>`、`>>` 子记录层级，以及 `+` / `-` 显式默认展开或折叠。
- 点击箭头折叠和展开；折叠状态保存在插件数据中，支持重命名、列宽变化、列顺序变化、checkbox 修改和外部文本 patch 后尽量保留结构匹配的状态。
- 可将当前折叠状态写回 Markdown，也可清除显式折叠标记。
- 横向表头分组：`# Group<br>Field`；分组标题作为表头展示，底层仍是可编辑列头。
- 原生 Markdown 单元格编辑，支持基础富文本、图片和嵌入内容。
- 单元格内列表/任务增强：列表层级、连续行、任务 checkbox 和单元格内折叠箭头。
- 当前工作区未提交改动包含 fenced code block 单元格渲染；它应作为候选能力完成独立 GUI 回归后再写入正式商店描述。
- 单行/多档行高：`<!-- treeTable height: 1 -->` 等声明；普通 Markdown 表格也可使用。
- 未指定宽度的列按内容自适应，默认上限 550px；显式 `<!-- width=N -->` 和用户拖拽宽度优先。
- 交互式 code block 继续交给 Obsidian 和对应插件渲染；Rich TreeTable 不接管外部面板的源码生命周期。
- 可选接入 Joule 抽屉插件，把一行以属性面板方式查看和编辑；抽屉不是 Rich TreeTable 的核心依赖。

## 不应在首版承诺的内容

- 移动端支持。当前 manifest 标记为桌面端，且依赖 Obsidian 原生表格编辑器内部接口。
- 任意交互式 code block 的源码编辑生命周期。静态 fenced block 渲染可以进入首版，但 Dataview、HTML Blocks 等会修改自身源码的面板需要单独兼容设计。
- 树表拖行排序。当前实现明确要求在源码中移动完整子树。
- 与所有表格插件同时启用的兼容性。Advanced Tables 的自动格式化可能破坏 Rich TreeTable 的层级标记和 Markdown 注释元数据。

## 上架阻塞项

1. 项目当前没有远程 GitHub 仓库，不能提交社区市场。
2. 需要为公开 GitHub 仓库配置远程地址并推送。
3. 当前 `main` 有未提交的 code block 支持改动。必须先完成静态 fenced block、换行、失焦、重建 DOM、复制粘贴和编辑回写的 GUI 回归。
4. `property-surface` 仍通过本地 `file:` 依赖引用；公开仓库需要把公共层变成可复现依赖，或在发布工程中内置其源码/构建产物。
5. 需要针对官方 Obsidian lint 检查动态样式注入、DOM API、最低 Obsidian 版本和日志输出。

## 发布目录规则

普通插件只保留一份真实源码。发布状态由 Git tag、GitHub Release 和社区市场记录表达。Rich TreeTable 的完整 Git 仓库现在位于 `_Published/markdown-treetable`，它既是源码工程，也是发布准备工程。

现有 `_Published` 下的插件各自只有一份源码；不需要复制第二份。Rich TreeTable 已完成同样的物理目录归类，移动后 worktree 已修复。

本插件使用一个源码仓库和两个构建目标：`build:local` 保留 Joule 抽屉私有集成，`build:store` 不挂载抽屉入口。两者共享 Rich TreeTable 核心；它们不是两份源码。只有使用 `eval`、`new Function` 或其他社区审核禁止的动态执行能力时，才需要像 HTML Blocks 那样做审核意义上的双构建。

`styles.src.css` 是源码样式；`prepare:release` 生成根目录的公开 `styles.css`，把 vendored `property-surface` 样式和 Rich TreeTable 样式合并。根目录的 `main.js`、`manifest.json`、`styles.css` 是可提交到公开仓库和 Release 的产物。

## 参考竞品（2026-10-17 快照）

- [Advanced Tables](https://github.com/tgrosinger/advanced-tables-obsidian)，约 2.6k stars：导航、格式化、行列操作、公式、排序、CSV。
- [Markdown Table Editor](https://github.com/ganesshkumar/obsidian-table-editor)，约 250 stars：独立编辑器、CSV/Excel/Sheets 导入、行列操作。
- [Table Extended](https://github.com/aidenlx/table-extended)，约 218 stars：MultiMarkdown 的 colspan、rowspan、多表头、块级内容和 caption。

这些数字来自 GitHub 仓库页面 API，是随时间变化的市场信号，不是下载量。
