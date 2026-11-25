# Loadout Manager

[English](https://github.com/steindvart/dsh-loadout-manager/blob/main/README.md) | [Русский](https://github.com/steindvart/dsh-loadout-manager/blob/main/README_RU.md) | 中文

DeepSeek Harness（DSH）插件。原版 DSH 没有一个页面能同时查看全局和某个项目中可用的技能（skill）与 MCP 服务器，也没有规则（rules）机制。Loadout Manager 补上了这两点：按层级展示技能和 MCP 服务器，提供管理功能，并把规则加入智能体上下文，与 AGENTS.md 并列。

![Loadout Manager 页面（英文界面）：Global 范围下的 Skills 标签页，每个技能都有 On、Manual、Off 开关](assets/main-window.png)

插件界面支持中文、英文和俄文，跟随 DSH 的语言设置。

## 功能

### 按层级查看

左侧边栏会出现 Loadout Manager 入口。在页面顶部选择范围：“全局”或某个工作区。“技能”“指令”和“MCP”三个标签页列出智能体在该范围内获得的全部内容，包括 DSH 自动加载的 AGENTS.md 和 CLAUDE.md。任何文件都可以直接在所在行中展开查看。

### 技能管理

| 状态 | 模型目录 | `/名称` 调用 |
| --- | --- | --- |
| `on` | 可见 | 可用 |
| `manual` | 隐藏 | 可用 |
| `off` | 隐藏 | 隐藏 |

`manual` 模式下，技能描述不占用上下文，但仍可手动调用。如果项目和全局中存在同名技能，面板会标出被覆盖的那一个。不再需要的技能可以移到回收站。

### 规则

规则是位于 `~/.dsh/rules/`、`~/.agents/rules/` 或 `<项目>/.agents/rules/` 中的 Markdown 文件。启用的规则会紧跟在 AGENTS.md 之后进入智能体及其子智能体的上下文，文件修改会在下一步生效。每条规则可以单独启用或停用。

### MCP 管理

在“全局”中，开关会在 DSH 配置中启用或停用服务器。在工作区中，开关会对该项目的智能体隐藏服务器的工具，服务器本身继续运行。“检查”按钮会试连服务器并列出其工具，即使服务器已停用也可以。

### 在对话中管理

插件为智能体提供 `loadout` 工具，因此可以直接在对话中修改设置，例如“在这个项目里停用 omarchy 技能”或“现在启用了哪些规则？”。智能体可以查看技能、规则和 MCP 服务器的状态，并逐个切换。对话中不能删除文件，删除只能在页面上进行。

## 设置保存位置

全局状态写入 `~/.agents/loadout.json`，项目状态写入 `<项目>/.agents/loadout.json`。它们是普通文件，可以提交到仓库并与团队共享。插件不会修改技能和规则文件本身。

```json
{
  "skills": { "omarchy": "off", "tdd": "manual" },
  "rules": { "dsh/russian-docs": false },
  "mcp": { "github": false }
}
```

## 安装

插件适用于 DSH 0.2.2-rc.2。在 DSH 中打开“插件 → 添加插件”，填入仓库目录或其 Git 地址。构建好的 `lib/` 已包含在仓库中，克隆后无需再构建。

插件配置中的 `maxBytes` 参数限制单条规则消息的大小：默认 65536 字节，设为 `0` 则停用规则。

## 限制

- 在智能体尚未启动的会话中，`/` 菜单也会列出已停用的技能。
- 只有预设中包含 `dsh-agent-instructions` 的智能体才会收到规则，Minimal 预设不包含它。
- 删除通过 `gio trash` 完成。在没有 `gio` 的系统上（包括 Windows 和 macOS），文件会保留原处，面板显示错误。
- 来自 `app.asar` 的内置技能可以停用，但不能删除。

## 开发

需要 Node 24 或更高版本。

```sh
npm install
npm run check   # 代码检查、类型检查、构建 lib/ 并运行测试
```

插件设计见 [docs/SPEC.md](https://github.com/steindvart/dsh-loadout-manager/blob/main/docs/SPEC.md)，DSH API 笔记见 [docs/research/](https://github.com/steindvart/dsh-loadout-manager/tree/main/docs/research)。文档为英文。

## 许可证

MIT，见 [LICENSE](https://github.com/steindvart/dsh-loadout-manager/blob/main/LICENSE)。
