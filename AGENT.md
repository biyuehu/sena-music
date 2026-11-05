# AGENT.md - Sena Music 智能体行为与工程准则

本项目为 Sena Music（轻量级自托管音乐聚合播放器）。本文档为所有在此代码库工作的 AI Agent 设定绝对刚性的行为边界、工程规范与协作准则。

---

## 1. 核心行为红线（绝对不可违背）

### 铁律一：严格恪守任务边界，零容忍 Scope Creep
- **指令即边界**：用户要求什么，就只交付什么。没有用户的明确授权，严禁在同一个回合中顺带修改未提及的文件、重构无关模块或格式化非目标文件。
- **发现问题只提建议**：在排查或开发中发现周边潜在 bug，只能向用户简明汇报，绝对不允许擅自私自修复。

### 铁律二：严禁篡改用户个人规划与看板资产
- **用户主权资产**：`TODO.md`、`NOTES.md`、开发计划等文件属于用户的指挥权看板。
- **禁止私自勾选与删改**：任何待办事项的提出、评估、排期、核验与划掉（打勾），其所有权 100% 归属于用户。Agent 绝不可越俎代庖。

### 铁律三：严禁无超时常驻挂死，敏捷掌控进程生命周期
- **明确区分命令性质**：瞬时批处理命令（`bun test`, `tsc`, `git`）可直接执行；常驻监听进程（`electronmon`, `parcel watch`, `bun --watch`）必须显式管理，严禁无超时直接前台挂起或盲目抛入后台死等。
- **秒级止损机制**：任何命令如果非预期陷入监听或 5 秒内未退出，必须立即终止，绝不允许让用户面对数分钟的无响应空白。

### 铁律四：严禁盲目执行破坏性 Git 操作
- **禁止滥用 `git reset --hard`**：撤销或还原代码时，默认保留工作区修改（使用 mixed/soft reset 或手动恢复），严禁未经用户授权直接使用 `--hard` 冲刷代码导致有效工作丢失。

### 铁律五：崇尚敏捷高效，杜绝形式主义内耗
- **敏捷交付**：提交代码以最直接、快速的方式安全完成。严禁为了追求机械的“学术级原子提交”去反复备份还原文件、导致数分钟的无谓等待。
- **极简汇报**：回复直奔主题，讲清事实，严禁废话推诿与机械自嗨。

---

## 2. 项目架构与核心技术栈

- **前端架构**：单页面应用（SPA），基于 Web Components、`@/romi/web`（`defineComponent`, `State`）、`lit-html` 与 UnoCSS。
- **服务端架构**：基于 `@/romi`（Action, Api, Returner）微框架，运行于 Bun / Node.js 运行时，配置文件为 `music.toml`。
- **多端分发**：
  - Web：`dist/client`
  - Desktop：Electron（主进程位于 `src/platform/desktop/main.ts`，打包资源重定向至 `userData`）
  - Mobile：Capacitor（Android）

---

## 3. 技术实现与避坑准则

### 3.1 物理交互控件
- **PointerEvents 统一接管**：音量条、播放进度条等需要高精度物理拖拽的控件，必须使用 `PointerEvent`（结合 `setPointerCapture` / `releasePointerCapture`）与 `getBoundingClientRect()` 归一化计算，彻底杜绝透明原生 `<input type="range">` 滑块半径偏差与移动端 TouchEvent 冲突。

### 3.2 SPA 路由与组件生命周期
- **生命周期时差防御**：在 SPA 架构下，`<settings-page>` 等子页面挂载后其 `connectedCallback` 仅执行一次。若数据需随页面进入实时同步，必须监听路由事件（`hashchange` / `popstate`）主动拉取最新状态。
- **状态同步与组件抽取**：通用控件（如 `<theme-toggle>`）应独立解耦，子页面严禁引入全局级侧边栏等冗余死代码。

### 3.3 桌面端（Electron）运行时与文件系统
- **绝对路径规整**：服务端缓存与数据路径统一使用 `node:path` 中的 `resolve` 规整为绝对路径。
- **自愈式文件操作**：在 Electron 打包运行模式下，`userData` 目录与工作目录隔离，文件读写必须具备自愈能力（`mkdirSync({ recursive: true })`），禁止假设目录预先存在。

---

## 4. 常用验证命令

在提交任何改动前，必须执行对应检查保证代码质量：

```bash
# 1. 类型检查
bun run check

# 2. 自动化测试
bun test

# 3. 代码格式与风格
bun run fix
```

