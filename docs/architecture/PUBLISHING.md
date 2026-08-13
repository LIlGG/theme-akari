# GitHub Release 与 Halo 应用市场发布

Akari 使用 Halo 官方维护的可复用工作流发布主题。发布一个 GitHub Release 后，发布工作流会构建主题 ZIP、把 ZIP 添加到该 Release，并同步创建 Halo 应用市场版本。

Akari 的应用市场 ID 为 `app-8rojpuw1`，已经同时固化在 `theme.yaml` 与发布工作流中。应用 ID 是公开标识，不作为 Secret 保存。该应用由 Halo 管理员维护，不设置首次审核等待阶段。

## 自动化边界

可以自动完成：

- 在推送到 `main` 或提交 Pull Request 时执行代码检查、Astro 构建和主题打包；
- 检查安装包完整性，并阻止源码、原型和设计资料进入 ZIP；
- 校验 GitHub Release 标签、`package.json` 和 `theme.yaml` 的版本一致；
- 将主题 ZIP 上传为 GitHub Release 资产；
- 将 GitHub Release 同步为 Halo 应用市场的新版本。

不能自动完成：

- 创建和维护应用市场中的名称、Logo、截图、README 与外部链接；
- 代替维护者决定版本号和撰写发行说明。

## 一次性配置

### 1. 创建应用市场应用

Akari 已经在 Halo 应用市场创建主题应用，ID 为 `app-8rojpuw1`。发布前仍需确认应用名称、Logo、截图、README、外部链接和版本说明已经填写完整。

### 2. 创建个人令牌

在 Halo 官网创建个人访问令牌，并授予“应用市场开发者 → 版本管理”权限。令牌只保存到 GitHub，不应写入仓库文件。

### 3. 配置 GitHub Actions

进入 GitHub 仓库的 **Settings → Secrets and variables → Actions**：

| 类型              | 名称       | 内容                             |
| ----------------- | ---------- | -------------------------------- |
| Repository secret | `HALO_PAT` | 具有版本管理权限的 Halo 个人令牌 |

也可以在已经关联远程仓库的本地目录中使用 GitHub CLI 配置：

```bash
gh secret set HALO_PAT
```

命令会安全地提示输入令牌，不要把令牌直接写进命令历史、提交或聊天记录。未配置 `HALO_PAT` 时，发布工作流会在构建前明确失败，避免产生 GitHub Release 与应用市场版本不同步的半完成状态。

## 发布版本

发布前，把 `package.json` 中的 `version` 与 `theme.yaml` 中的 `spec.version` 更新为同一个版本并提交。例如发布 `0.2.0` 时，两处都必须是 `0.2.0`。

确认 CI 通过后，可以使用 GitHub CLI 创建 Release：

```bash
git tag v0.2.0
git push origin v0.2.0
gh release create v0.2.0 \
  --title "Akari 0.2.0" \
  --generate-notes \
  --verify-tag
```

也可以在 GitHub 网页中创建 Release。Release 必须选择 **Publish release**；草稿不会触发发布工作流。

发布完成后，[`cd.yaml`](../../.github/workflows/cd.yaml) 会调用 Halo 官方的 [`theme-cd.yaml@v4`](https://github.com/halo-sigs/reusable-workflows/blob/v4/.github/workflows/theme-cd.yaml)。应用市场同步由 [`halo-sigs/app-store-release-action@v4`](https://github.com/halo-sigs/app-store-release-action) 完成。

## 失败时如何处理

- **版本不一致**：统一 Release 标签、`package.json` 和 `theme.yaml` 后重新发布。
- **缺少 `HALO_PAT`**：检查 GitHub Actions Secret 名称及令牌的版本管理权限。
- **构建失败**：先在本地运行 `pnpm install --frozen-lockfile && pnpm build`，修复后再重新运行 Actions。

不要把失败 Release 上的旧 ZIP 手工提交到应用市场。应修复对应提交并创建正确的新版本，确保 GitHub Release、源代码和应用市场产物可以相互追溯。
