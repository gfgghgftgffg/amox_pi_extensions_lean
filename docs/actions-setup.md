# GitHub Actions 配置指南

本仓库自带三个工作流：CI、上游跟踪候选、发布。它们只使用 GitHub 内置的 `GITHUB_TOKEN`，
不需要 PAT、GitHub App、self-hosted runner 或任何自定义 secret。

## 1. 启用前设置

仓库 `Settings → Actions → General`：

1. **Actions permissions**：允许使用 actions。若启用 allowlist，至少允许 `actions/*`、
   `peter-evans/create-pull-request`（本仓库全部 action 均已固定到完整 commit SHA）。
2. **Workflow permissions**：保持默认的只读即可。每个 job 在工作流内已显式声明所需权限，
   无需全局授予写权限。
3. 勾选 **Allow GitHub Actions to create and approve pull requests**。
   上游跟踪工作流的最后一步用 `GITHUB_TOKEN` 创建/更新 draft PR，此开关是必需的。

## 2. 三个工作流

### CI（`.github/workflows/test.yml`）

- 触发：push `main`、pull request、手动 `workflow_dispatch`、每天 04:17 UTC 定时（周期性安全审计）。
- 权限：`contents: read`；checkout `persist-credentials: false`。
- 步骤：`npm ci --ignore-scripts` → `npm run check` → `npm run contracts:check` →
  `npm run verify:production` → `npm audit --audit-level=high`（全量）与
  `npm audit --omit=dev --audit-level=high`（生产/peer 面）。
- 诊断 artifact 仅包含 `diagnostics/`（日志与 audit JSON），不含 `node_modules`、`.npmrc` 或任何凭据。
- 不使用 `pull_request_target` / `workflow_run`，PR 构建不读取任何 secret。

### 上游跟踪（`.github/workflows/check-upstream.yml`）

- 触发：每天 02:23 UTC + 手动，串行执行（`concurrency` 不取消），仅 `main`。
- **detect job（只读）**：安装基线依赖 → 基线快照校验 → `node scripts/check-upstream.mjs --apply
  --out-dir .maintenance-candidate` → 产出 `candidate.json` + 报告 + 诊断，并作为 artifact 上传。
- **open-pr job（`contents: write` + `pull-requests: write`）**：
  checkout 相同基线（不持久化凭据）→ 下载同一次运行的 artifact →
  `node scripts/validate-candidate.mjs --apply` 严格校验后才写入文件 → 固定的
  `peter-evans/create-pull-request` 创建/更新 **draft** PR。
  该 job 不安装依赖、不执行上游或 artifact 中的任何代码；仅用 Node 内置 fetch 读取固定 public npm registry 的版本 DATA 核对 lock/发布 commit，token 只在最后创建 PR 的步骤使用。
- 合法写入路径仅限：`package-lock.json`、三个 `packages/*/package.json`、
  `maintenance/manifest.json`、`maintenance/tool-contracts.json`、`maintenance/update-report.md`；越界路径、符号链接、模式变更、
  删除、改名、额外 JSON 字段修改都会在写入前被拒绝。
- 固定机器分支 `maintenance/upstream-update` **请勿手工编辑**，自动化会重建它。
- 状态与人工流程见 [maintenance.md](./maintenance.md)。

### 发布（`.github/workflows/release.yml`）

- 仅手动 `workflow_dispatch`（要求在 `main` 上运行），输入 tag 形如 `vX.Y.Z`。
- **verify job（只读）**：校验 tag 与根 `package.json` version 一致、checkout HEAD 等于本次运行的
  `github.sha`，然后完整跑 CI/契约/生产安装/审计。
- **release job**：`environment: release` + `contents: write`，checkout 精确 SHA，最后一步才注入
  `GITHUB_TOKEN`；通过 GitHub git-ref API create-only POST 原子预留 tag 到已验证 SHA，再核对创建的 ref，
  用 `gh release create --verify-tag` 创建 release；已有/并发创建的 tag 必须失败，不删除或重定向。
  工作流串行执行（`concurrency: release`，不取消），该 job 不安装依赖、不执行任何 npm 命令。
  tag 创建后 release 失败会报告 tag 已预留、需人工恢复；不会自动删除、重试或 retarget。
- 工作流**永不**执行 `npm publish`。

## 3. 首次发布步骤

1. 确认 `main` 上 CI 通过。
2. `Settings → Environments → release`：配置 required reviewers（例如自己），
   并把 **Deployment branches** 限制为 `main`。
3. 人工把根 `package.json` 的 `version` 改到目标版本（以后每次发版都要手动改），提交后等待 CI。
4. `Actions → Release → Run workflow`，tag 填 `vX.Y.Z`（必须与上面的 version 一致）。
5. 审批 `release` environment，工作流创建 tag 与 release。

发布前 tag 不存在；发布后可固定 tag/commit 安装：

```bash
pi install git:github.com/gfgghgftgffg/amox_pi_extensions_lean@v0.1.0
# 或 pi install git:github.com/gfgghgftgffg/amox_pi_extensions_lean@main
# 或 pi install git:github.com/gfgghgftgffg/amox_pi_extensions_lean@<完整 commit>
```

## 4. 分支保护与 draft PR 的 CI

- 对 `v*` 配置 tag protection / repository ruleset，限制更新和删除（含管理员 bypass）。
  原子预留解决 create race，但外部管理员之后强制移动 tag 仍需托管规则保护；本地 mock 不代表已验证线上并发或 reviewer 配置。
- 建议 `main` 要求 PR + 必须通过的 status check（例如 CI 的
  `check + contracts + production + audit`），并限制推送权限。
- 上游跟踪 PR 由 `GITHUB_TOKEN` 创建/更新。官方文档说明：这类 PR 的
  `pull_request`（opened/synchronize/reopened）工作流会以 **approval-required** 状态创建，
  PR 合并框显示 *Approve workflows to run* 横幅，有写权限的用户点击即可运行 CI；
  也可以直接手动 `workflow_dispatch` 运行 CI。**不需要**为了自动化而配置 PAT 或 GitHub App token。
  来源：<https://docs.github.com/en/actions/how-tos/writing-workflows/choosing-when-your-workflow-runs/triggering-a-workflow>

## 5. 安全边界（务必了解）

- 所有外部 action 固定到完整 commit SHA 并附版本注释；`.github/dependabot.yml` 负责
  `github-actions` 的版本更新，npm 更新只覆盖 dev 工具，上游引擎依赖被忽略，避免绕开
  `maintenance/manifest.json` 的受控升级流程。
- 不存在 `pull_request_target`、`workflow_run` 等特权触发；PR 构建无 secret、只读。
- 生成/安装/捕获/测试全部发生在只读 job，没有写权限、没有发布或模型 token；
  写权限 job 绝不安装或执行上游/artifact 代码。
- 隔离的临时 `HOME` / `PI_CODING_AGENT_DIR` 只是配置隔离（避免读写真实 `~/.pi`），
  **不是**操作系统级沙箱。
- artifact/output 只包含受控枚举与诊断内容，报告文本不会被当作 shell 命令或 GitHub 表达式执行。
- 相关官方文档：<https://docs.github.com/en/actions/reference/security/secure-use>
