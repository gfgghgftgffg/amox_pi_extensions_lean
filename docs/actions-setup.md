# GitHub Actions 配置

无需 VPS、tmux 或 self-hosted runner。GitHub 托管 runner 完成检测、agent 适配、独立验证和发布。

## 1. 仓库权限

`Settings → Actions → General`：

- 选择 **Allow all actions and reusable workflows**，可勾选 **Require actions to be pinned to a full-length commit SHA**；现有 action 都固定到 SHA。
- Workflow permissions 选择 **Read repository contents and packages permissions**。写权限只在创建 PR、GitHub Release 的 job 中单独声明。
- 勾选 **Allow GitHub Actions to create and approve pull requests**。
- 外部贡献者选择 **Require approval for all external contributors**。

不需要 PAT 或 GitHub App；创建 PR 和 GitHub Release 使用内置 `GITHUB_TOKEN`。

## 2. 配置自动适配的模型（必需）

`Settings → Secrets and variables → Actions`：

### Secrets

| 名称 | 内容 |
| --- | --- |
| `MAINTENANCE_API_KEY` | 模型服务的 API key。不要填写 GitHub token，也不要提交到仓库。 |

### Variables

| 名称 | 内容 |
| --- | --- |
| `MAINTENANCE_PROVIDER` | Pi provider id，例如 `anthropic`、`openai`、`openrouter`；自定义端点可用 `maintenance`。 |
| `MAINTENANCE_MODEL` | 该服务实际支持的精确 model id，无默认值，避免误用模型或产生意外费用。 |
| `MAINTENANCE_BASE_URL` | 内置 provider 留空；自定义服务填公开可访问的 HTTPS API 基址，例如 `https://your-service.example/v1`。不可包含 key、用户名、密码或查询参数。 |
| `MAINTENANCE_API` | 自定义端点填 `openai-completions`、`openai-responses` 或 `anthropic-messages`，必须对应服务实际协议。内置 provider 留空。 |
| `MAINTENANCE_THINKING` | 可选，默认 `high`；非推理模型可填 `off`。 |

OpenAI-compatible 服务示例：provider=`maintenance`，model=你的模型 ID，base URL=服务基址，API=`openai-responses`（或服务支持的 `openai-completions`）。这里不继承你电脑上的 Pi 登录、私有 models.json、代理或 Agent 配置。

只在有上游/lean 更新时调用模型，单次最多 20 分钟、60 个 turn；会消耗模型额度。凭据缺失、模型报错、agent 报告有未解决问题、或独立验证失败都会停止，**不会创建可发布的更新**。无更新时不调用模型。

## 3. 发布环境

`Settings → Environments → release`：

- 只允许 `main` 部署。
- 若希望“审查并合并 PR 后自动发版”，不设置 Required reviewers；合并就是人工确认。
- 若还需要发版前再确认一次，设置 Required reviewers。自己触发并自己审批时，不勾选 Prevent self-review。

GitHub Release 默认启用，上传三个独立 `.tgz` 包及 `assets.json` 哈希清单。根目录是私有维护 workspace，**不是一次装三个的 Pi 包**。

### 可选：发布三个 npm 包

本地分包安装和 GitHub Release 不需要 npm token。只有想让用户直接执行 `pi install npm:@gfgghgftgffg/<扩展名>` 时，才需要：

1. 拥有 npm 上 `@gfgghgftgffg` scope 的发布权限；GitHub 用户名不自动等于 npm scope。
2. 创建适合 CI 的 npm granular access token，授予这三个包所需的发布权限，按 npm 的 2FA/有效期要求配置；放进 **Secret `NPM_TOKEN`**。
3. 增加 **Variable `PUBLISH_NPM` = `true`**。默认未配置，npm 发布不运行。
4. 配置 `npm-publish` environment，仅允许 `main`；可另加审批。

npm job 在 GitHub Release 成功后运行，只发布已验证的独立 tarball，使用 `--ignore-scripts`，不会执行包的生命周期脚本，也不会安装上游代码。三个包逐个发布，不是原子事务；若部分发布成功，重跑失败的 npm job 会检查已存在版本的 integrity，只跳过完全相同的包，拒绝覆盖不同内容。

如果初次发版时未开 npm 发布，后面打开开关不会补发已有 GitHub Release；请发布下一个版本，或人工发布同一 release 的已验证 tarball。不要重新创建已有 tag。

## 4. 首次启用

1. 将工作流和代码提交推送到 `main`，等 **CI / all-platforms-pass** 通过；这是 macOS、Windows、Linux 三平台的汇总门禁。
2. 配好上述模型凭据、变量和环境。
3. `Actions → Check upstream → Run workflow → main`，验证检测与适配链路。没更新时只执行 detect、后续 job skipped 是正常的。
4. 首次发布：`Actions → Release → Run workflow → main`，tag 必须和根、三个包及 manifest 的版本一致，以 `package.json` 的当前 version 为准。
5. 之后合并自动适配 PR 会自动增加 patch 版本并触发 Release，无须再手动改版本或点发版。

若希望测试模型连通性但当前没有更新，不能靠“detect 成功”判断 key 可用；本仓库的 SDK 离线测试不调用真实模型。首次有更新的 adapt job 才会验证真实模型服务。

## 5. 每天的操作

- **Check upstream**：每天 02:23 UTC（北京时间约 10:23），时间可能延迟。检测、收集精确源码 → agent 最小适配 → 独立验证 → 创建/更新草稿 PR。不会自动合并。
- **CI**：push `main`、PR、手动，以及每天 04:17 UTC。三平台分别执行类型/回归测试、契约检查、独立生产安装和审计；源码统一 LF，安装不需要 WSL。
- **Release**：`main` push 且发布版本增加时自动运行；另有手动入口。没有版本变化时只执行 plan，后续 skipped 正常。

PR 由 `GITHUB_TOKEN` 创建/更新时，GitHub 可能要求点击 **Approve workflows to run**。确认 PR 的完整 CI 通过、审查 `maintenance/agent-review.md`、报告和代码/测试 diff，再 Mark ready for review、合并。建议保护 `main`：要求 PR 和 **`all-platforms-pass`** status，限制直接推送。对 `v*` tag 配置禁止移动/删除的 ruleset。

同一机器分支 `maintenance/upstream-update` 会被下一次检测重建；不要直接在上面手工修补。验证失败请查看 artifact，另开修复 PR 或本地修复后重跑。

## 6. 凭据与执行边界

- detect：无模型/发布 secret，临时候选中的上游执行只发生在只读 job。
- adapt：模型 key 只注入 SDK 步骤；禁用所有项目资源发现、默认 shell 工具、插件和 MCP。模型只有受路径限制的文本读取/编辑工具，不能执行上游代码、访问环境变量或写工作流、依赖、版本、快照、许可证。旧测试只能追加，不能删断言。
- verify：三个独立平台 runner，无模型 key、无仓库写 token；重新安装、测量、测试、检查三个独立生产安装并审计。全部通过才创建 PR；发布前也重做三平台验证。模型不能自行宣称验证通过。
- open-pr：只校验并应用受限数据文件，不安装依赖或执行候选代码；随后才注入写 token 创建 PR。main 在运行期间前进则拒绝旧基线。
- release/npm：只处理预构建 tarball；凭据只在各自最终步骤可见。

路径白名单与临时 HOME **不是操作系统级沙箱**，不能证明生成代码的语义正确；prompt injection、遗漏新行为、无效回归测试仍需要人工 diff 审查。因此禁止自动合并。模型供应商会收到被读取的公共源码与维护材料，原始模型 transcript 不上传。

官方资料：
- <https://docs.github.com/en/actions/how-tos/writing-workflows/choosing-when-your-workflow-runs/triggering-a-workflow>
- <https://docs.github.com/en/actions/reference/security/secure-use>
