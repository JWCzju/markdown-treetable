# TreeTable

**[English](README.md) | [简体中文](README.zh-CN.md)**

TreeTable 是 Markdown 表格的增强语法，支持分组折叠、富文本编辑、宽度拖拽等功能。它保留普通 Markdown 表格作为数据格式，对现有数据和 AI 编辑都友好。

## 如何使用

1. 新建一个普通 Markdown 表格。
2. 在第一列的空白单元格用 `#` 创建分组，用 `>` / `>>` 创建子记录。
3. 点击分组或记录左侧的箭头折叠或展开，点击单元格即可编辑。

复制下面的表格试试：

```md
| Record | Notes |
| --- | --- |
| # Travel |  |
| Flights | Book tickets |
| > Accommodation | Compare hotels |
| >> Tokyo | Stay three nights |
| # Work |  |
| Release | Prepare notes |
```

`# Travel` 和 `# Work` 是分组；`> Accommodation` 是子记录；`>> Tokyo` 是它下面的第二层记录。关闭 TreeTable 后，这仍然是可读的 Markdown 表格。

## 核心功能

1. **通过“# ”分组**：通过 `#`、`>` 等简单语法标记，让表格像树一样可分组、折叠。
2. **富文本单元格**：单元格支持基础 Markdown 内容，包括列表、任务、图片、嵌入和围栏代码块。
3. **指定列宽**：通过可视化拖拽即可改变列宽。
4. **单行展示**：当表格内容过多时，可以通过单行展示快速查看结构。

## 详细说明

如果其他已启用的插件提供交互式代码块渲染，TreeTable 会保留其显示，并将代码块的交互生命周期交给对应插件。

未手动设置的列会根据内容自适应；也可以拖动列分隔线设置宽度，或在表头单元格中写入宽度元数据，例如 `<!-- width=240 -->`。行高控制也适用于普通 Markdown 表格。

宽表可以用 `# 分组<br>字段名` 在列头中添加横向分组。

## 已知问题

TreeTable 面向桌面版 Obsidian，并使用 Obsidian 原生 Markdown 表格编辑器。

- 暂不支持按树结构拖动记录或整组排序；移动时可在源码模式下连同子记录一起移动。
- Advanced Tables 等会重写表格行的插件可能影响树标记或宽度元数据，建议先在副本中确认兼容性。

## 支持作者

如果工具对你有帮助，可以通过 [GitHub Sponsors](https://github.com/sponsors/JWCzju) 支持作者。

## 许可证

[MIT](LICENSE) © Yinno
