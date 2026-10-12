# amox-pi-extensions-lean

一个最小改动原则的单仓（npm workspaces），只维护三个既有 lean 门面扩展，完整保留原有接口与 Prompt 结构，
上游引擎以精确版本依赖使用；仓库同时带一套受约束的上游跟踪与发布自动化（只生成 draft 候选，
不自动改写适配代码、不自动合并、不发布 npm）。

| 工作区包 | 上游引擎（精确锁定） | 对模型暴露的工具 |
| --- | --- | --- |
| `@gfgghgftgffg/pi-web-access-lean` | `pi-web-access@0.39.0` | `web_access`（`op`: search/check/fetch/get/help） |
| `@gfgghgftgffg/rpiv-todo-lean` | `@juicesharp/rpiv-todo@2.13.5` + `@juicesharp/rpiv-i18n@2.13.5` | `todo`（扁平 Schema） |
| `@gfgghgftgffg/pi-subagents-lean` | `@tintinweb/pi-subagents@0.20.0` | `subagent`（`op`: run/result/steer/workflow/help） |

三个门面代码基于 kunkun9527 的 lean 仓库（见各包 `MAINTENANCE.md` 中的基线 commit），上游引擎以固定 npm
依赖方式使用，未复制上游代码、未改动 `node_modules`。

## 安装（Git 单包安装）

根 `package.json` 声明了三个 `pi.extensions` 入口，因此整个仓库可以作为一个 Pi 包安装。
推荐固定 tag 或 commit 安装（tag 由发布工作流创建后才会存在）：

```bash
pi install git:github.com/gfgghgftgffg/amox_pi_extensions_lean@v0.1.0
# pi install git:github.com/gfgghgftgffg/amox_pi_extensions_lean@main
# pi install git:github.com/gfgghgftgffg/amox_pi_extensions_lean@<完整 commit>
```

Pi 1.1.0 对 Git 包执行 `npm install --omit=dev --legacy-peer-deps`；宿主提供的 `@earendil-works/pi-*` 与
`typebox` 仅声明为 peerDependencies，不进入运行时依赖树。安装后只会加载上面三个入口，`node_modules` 里的
上游引擎不会被当作额外扩展加载（见 `tests/host-discovery.test.mjs`）。

请勿同时加载旧的 `@ssk_dev/*-lean` 或其它上游包装扩展，以免重复注册工具。要求 Pi `>=1.1.0`（subagents 上游
下限），已在 Pi 1.1.0 / Node 22.22.1 上验证。

## 上下文占用（字符代理，非计费 token）

由 `scripts/capture-contracts.mjs` 在隔离的 Pi print 模式会话中注册并测量，原始快照见
`maintenance/tool-contracts.json`。估算方式为固定字符代理 `ceil(字符数 / 4)`，**不是** provider tokenizer
计费值。

| 上游 | 上游注册合计 | Lean | Lean 合计 | 降幅 |
| --- | ---: | --- | ---: | ---: |
| `pi-web-access@0.39.0`（4 工具 + `web_enable` 66） | 2,669 | `web_access` | 149 | 94.4% |
| `@juicesharp/rpiv-todo@2.13.5` | 882 | `todo` | 247 | 72.0% |
| `@tintinweb/pi-subagents@0.20.0` | 8,415 | `subagent` | 270 | 96.8% |

## 仓库结构

```
package.json                  # 私有 workspace 根；pi.extensions 三个入口；lockfile 的唯一来源
package-lock.json             # npm ci --ignore-scripts 可复现
LICENSE                       # 根仓库 MIT（各包在 packages/*/LICENSE 保留原始版权）
packages/pi-web-access-lean/  # 门面代码、README、LICENSE、MAINTENANCE.md、tests
packages/rpiv-todo-lean/
packages/pi-subagents-lean/
maintenance/manifest.json        # 机器可读维护清单（上游版本、仓库、leanCommit 基线）
maintenance/tool-contracts.json  # 上游/lean 工具描述、Schema、Snippet、Guideline 与字符统计快照
maintenance/update-report.md     # 上游跟踪候选生成时写入的报告（无候选时不产生）
scripts/capture-contracts.mjs    # 隔离捕获入口（--report / --write / --check / --output）
scripts/check-upstream.mjs       # 上游跟踪：默认只读报告，--apply 生成候选
scripts/validate-candidate.mjs   # 写权限 job 的候选校验/应用（仅受约束数据）
scripts/verify-production-install.mjs  # 生产安装加载验证（自包含 Pi host 解析）
scripts/lib/                     # 隔离 Pi 会话、计划、契约对比、候选校验等 helper
docs/actions-setup.md            # Actions/环境/分支保护/发布配置
docs/maintenance.md              # 上游跟踪与最小改动维护指南（含维护提示词）
tests/                           # 根级：清单、宿主发现、契约快照、自动化边界测试
.github/workflows/test.yml           # CI + 周期性安全审计
.github/workflows/check-upstream.yml # 上游跟踪 → draft 候选 PR
.github/workflows/release.yml        # 手动发布（tag + GitHub release，不发布 npm）
```

## 本地命令

```bash
npm ci --ignore-scripts          # 可复现安装（含 devDependencies）
npm run check                    # 三个包 + 根级 typecheck/test
npm run contracts                # 重建 maintenance/tool-contracts.json（人工显式执行）
npm run contracts:check          # 校验快照是否过期（上游漂移告警）
npm run verify:production        # 用宿主加载三个入口的生产安装验证
npm run maintenance:plan         # 只读检查上游是否有更新（不修改任何文件）
npm run maintenance:stage        # 在 .maintenance-candidate/ 生成候选与诊断
```

## 自动化与维护

- CI（`.github/workflows/test.yml`）：push/PR/手动/定时；只读、无 secret；跑 check、契约快照、
  生产安装验证与 `npm audit`（全量与生产/peer 两档），诊断以 artifact 上传。
- 上游跟踪（`.github/workflows/check-upstream.yml`）：每天检测 npm 最新稳定版与 lean 仓库 HEAD，
  只在临时目录安装候选依赖并对比结构契约；随后由独立写权限 job 严格校验候选数据并创建
  **draft** PR（固定分支 `maintenance/upstream-update`，请勿手工编辑）。
  契约漂移时已接受快照保持不变；lean 仓库有新 HEAD 时提示 manual reuse review 且不动 `leanCommit`。
- 发布（`.github/workflows/release.yml`）：仅手动、仅 `main`、需要 `release` environment 审批
  （在 Settings → Environments → release 配置 required reviewers 与仅允许 `main` 部署）；
  创建 tag/GitHub release 前先通过完整 CI/契约/生产/审计校验，永不 `npm publish`；
  后续发版需先人工 bump 根 `package.json` 的 version；tag 原子预留到已验证 SHA 后才创建 release，
  若 release 创建失败，tag 仍可能已存在，需人工恢复，自动化不会删除或重定向它。

维护与最小改动流程、状态说明、维护提示词见 [docs/maintenance.md](docs/maintenance.md)；
Actions 启用、environment 审批、分支保护与 `GITHUB_TOKEN` 创建 PR 的 CI 审批行为见
[docs/actions-setup.md](docs/actions-setup.md)。

自动化边界：不做自动 AI 代码改写，不保存模型/API 密钥，不自动合并或发布；新 API/新特性只会产出
候选 + 证据 + 维护提示词，由人工或 agent 按原始指南做最小调整。

## ext: 选择器身份（Task Router 迁移说明）

Task Router 的 agent 定义使用 `ext:pi-subagents-lean/subagent`、`ext:pi-web-access-lean/web_access` 这类
选择器。上游 `@tintinweb/pi-subagents` 会同时用**入口所在目录名**与**声明该入口的 package 短名**作为
canonical 名称。本单仓保留目录名与包 basename，因此实际观测到的 canonical 名称仍为
`pi-subagents-lean`、`pi-web-access-lean`、`rpiv-todo-lean`，既有选择器无需迁移；
`tests/host-discovery.test.mjs` 用上游自身的 `extensionCanonicalNames()` 校验这一点。本仓库未修改任何
Router/宿主配置。

## 许可与致谢

根仓库代码（工作流、脚本、维护文档）为 MIT，见根 `LICENSE`。三个工作区包同为 MIT，并在
`packages/*/LICENSE` 中保留原始版权（Copyright (c) 2026 kunkun9527）。上游引擎分别由
Nico Bailon（`pi-web-access`）、juicesharp（`@juicesharp/rpiv-todo`）、tintinweb（`@tintinweb/pi-subagents`）
开发，均为 MIT 协议；各包 `package.json` 的 `contributors` 与 `MAINTENANCE.md` 中明确标注。
原始 lean 作者仓库仅作为可复用改进的只读参考，不会盲目拉取覆盖本仓库的适配。
