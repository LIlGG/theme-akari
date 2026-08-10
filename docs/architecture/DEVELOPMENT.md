# Akari 开发指南

本文描述当前生产实现，供维护者和编码 Agent 快速建立正确上下文。它不记录迁移过程，也不把生成产物当作源码。

## 技术边界

Akari 是 Halo 原生主题：Halo 负责动态内容与 Thymeleaf 渲染，Astro 负责源码组织、模板编译、路由级资源拆分和客户端导航。UnoCSS 提供原子工具与 Iconify 图标，语义 CSS 负责主题独有视觉，Motion 负责需要编排的交互。

关键文件：

| 文件或目录                        | 职责                                   |
| --------------------------------- | -------------------------------------- |
| `theme.yaml`                      | 主题元信息、自定义文章与页面模板       |
| `settings.yaml`                   | 全站主题设置，只放跨内容或跨页面的配置 |
| `annotations.yaml`                | 文章、菜单项和特定自定义页面的元数据   |
| `src/pages/`                      | Astro 编写的 Halo 页面模板源码         |
| `src/layouts/`、`src/components/` | 全局布局与可复用静态结构               |
| `src/gateway_fragments/`          | Halo 布局兼容入口                      |
| `src/styles/`                     | 设计令牌、共享层、页面层和路由入口     |
| `src/js/`                         | 持久运行时、页面功能、服务和工具函数   |
| `templates/`                      | 构建后供 Halo 使用的生成模板           |

不要直接编辑 `templates/`。修改 `src/` 后通过构建脚本生成并原子替换运行模板。

## 构建与运行

- `pnpm build:promote`：构建 Astro，并把经过检查的结果提升到 `templates/`。
- `pnpm check`：执行 ESLint、Astro 检查和主题构建。
- `pnpm build`：执行完整检查、生成 Halo 模板并产出发布 ZIP。
- `pnpm dev`：监听源码变化并持续构建、提升模板。
- `pnpm dev:astro`：仅用于查看 Astro 编译层，不代表 Halo 动态数据的最终表现。

修改 Halo 模板、Finder 数据或主题设置后，最终结论必须来自本地 Halo 运行时，而不是 Astro 静态预览。

## Halo 数据规则

页面内容按以下优先级取得：

1. Halo 内容模型和 Finder API；
2. 与内容实体绑定的注解字段；
3. 主题级设置；
4. 国际化默认文案或主题内置兜底资源。

禁止把站长名、文章标题、分类、计数、日期、天气或媒体时长写死在模板中。可计算的数据在前端或模板中计算；可编辑的数据应放到最接近其内容实体的位置。

- 全站品牌、首页主视觉、外观和页脚属于 `settings.yaml`。
- 菜单位置与图标属于 MenuItem 注解。
- 媒体类型、附件和阅读时间覆盖值属于 Post 注解。
- 只服务于某个自定义页面的文案属于 SinglePage 注解，并用模板条件控制显示。
- 相册、瞬间、友链和评论依赖对应 Halo 插件；模板必须保留无插件或无数据状态。

主题设置和注解支持的真实字段以 `settings.yaml`、`annotations.yaml` 为准，不在本文维护重复字段表。

## 页面与模板

`src/pages/*.astro` 与 Halo 模板文件一一对应。自定义页面由 `theme.yaml` 声明；普通页面、文章、归档、分类、标签、作者、搜索和错误页遵循 Halo 主题路由。

每个页面根节点必须提供稳定的 `data-page`，用于：

- 路由级 JavaScript 功能匹配；
- Astro ClientRouter 切换后的生命周期恢复；
- 页面状态和局部加载行为判断。

`src/layouts/BaseLayout.astro` 只承载所有页面共同需要的内容：SEO、主题启动脚本、Header、Footer、持久播放器和 ClientRouter。页面特有结构不要放进全局布局。

## 客户端生命周期

`src/js/app.ts` 是唯一的全局入口。它负责：

- 安装 Astro 页面切换生命周期；
- 初始化 Header、主题模式、搜索和全局工具；
- 按需启动持久播放器；
- 在页面切换前准备新文档，切换后挂载当前页面功能。

`src/js/lifecycle/page-features.ts` 是页面功能注册表。每个字面量 `import()` 会成为独立 Vite chunk；新增功能时应先判断它属于全局能力、页面族还是按 DOM 能力加载的特性。

页面模块必须：

- 接收当前页面、`pageId` 和 `AbortSignal`；
- 返回清理函数，移除监听、观察器和临时状态；
- 不缓存已经被 ClientRouter 替换的 DOM 节点；
- 不在模块顶层直接操作页面 DOM；
- 把通用网络、评论、媒体和局部加载逻辑放入 `services/`、`controllers/` 或 `utils/`。

持久播放器位于页面交换边界之外。不要把它重新放进页面内容，也不要让页面级清理中断当前音频。

## 样式架构

```text
src/styles/
├── tokens.css          # 明暗模式语义令牌
├── foundation/         # reset、文档基础和媒体兜底
├── shared/             # shell、primitives、comments、responsive、integrations
├── pages/              # 页面族独有规则
└── entries/            # 页面静态导入的路由样式入口
```

`BaseLayout.astro` 只导入令牌、基础层和 shell。每个页面只导入一个匹配的 `entries/*.css`，由 Astro/Vite 生成共享基础 chunk 和页面 chunk。`src/js/app.ts` 不导入 CSS，避免重新合并页面边界。

使用边界：

- UnoCSS：一次性布局、间距、状态、shortcut 和 Iconify 图标。
- 语义 CSS：动态 Halo DOM、富文本、复杂网格、伪元素、播放器、评论、TOC 和 Motion 准备态。
- 不引入第二套原子框架。
- 共享规则必须已被至少两个页面真实使用；不要为假设中的未来需求扩大全局样式。

新增页面时优先复用既有页面族。只有信息架构和交互明显不同，才新增 `pages/*.css` 与 `entries/*.css`。

## 图片、图标和媒体

- 主题静态兜底资源放在 `public/assets/`，通过 `#theme.assets()` 引用。
- 动态图片优先使用 Halo 缩略图能力，保留原图或失败兜底路径。
- 图标优先使用 UnoCSS + Iconify；后台可配置菜单图标使用 Halo 的 Iconify 字段。
- 音视频时长从媒体元数据读取，不写死展示值。
- 首屏关键图片明确尺寸和加载优先级；非首屏图片使用延迟加载与异步解码。

## 修改流程

1. 先确认真实数据来源和受影响页面族。
2. 在最窄的源码边界修改，不直接修生成模板。
3. 涉及样式时同时检查浅色、暗色、桌面和移动端。
4. 涉及导航、播放器、筛选或评论时检查 ClientRouter 前后状态和清理行为。
5. 运行 `pnpm build` 与 `git diff --check`。
6. 在 Chrome 中验证真实 Halo 页面，并检查控制台错误。
7. 最后检查 Git diff，避免提交生成缓存、临时截图、测试账号数据或与任务无关的改动。

## 文档与证据约束

仓库不长期保存逐轮截图、浏览器录屏、MVP 副本、一次性审计报告或迁移日志。需要追溯时使用 Git 历史；需要展示主题时只更新 `docs/images/` 中 README 实际引用的精选截图。

当架构发生变化时，更新本指南和设计系统；不要新增一份并行的“新架构计划”让旧文档继续存在。
