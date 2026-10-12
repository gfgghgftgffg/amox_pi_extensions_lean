# amox-pi-extensions-lean

一个最小改动原则的单仓（npm workspaces），只维护三个既有 lean 门面扩展，完整保留原有接口与 Prompt 结构，
并把上游运行时升级到当前版本：

| 工作区包 | 上游引擎（精确锁定） | 对模型暴露的工具 |
| --- | --- | --- |
| `@gfgghgftgffg/pi-web-access-lean` | `pi-web-access@0.39.0` | `web_access`（`op`: search/check/fetch/get/help） |
| `@gfgghgftgffg/rpiv-todo-lean` | `@juicesharp/rpiv-todo@2.13.5` + `@juicesharp/rpiv-i18n@2.13.5` | `todo`（扁平 Schema） |
| `@gfgghgftgffg/pi-subagents-lean` | `@tintinweb/pi-subagents@0.20.0` | `subagent`（`op`: run/result/steer/workflow/help） |

三个门面代码基于 kunkun9527 的 lean 仓库（见各包 `MAINTENANCE.md` 中的基线 commit），上游引擎以固定 npm
依赖方式使用，未复制上游代码、未改动 `node_modules`。

## 安装（Git 单包安装）

根 `package.json` 声明了三个 `pi.extensions` 入口，因此整个仓库可以作为一个 Pi 包安装：

```bash
pi install git:git@github.com:gfgghgftgffg/amox_pi_extensions_lean.git
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
packages/pi-web-access-lean/  # 门面代码、README、LICENSE、MAINTENANCE.md、tests
packages/rpiv-todo-lean/
packages/pi-subagents-lean/
maintenance/manifest.json     # phase 2 机器可读接口（schemaVersion=1，packages 数组）
maintenance/tool-contracts.json  # 上游/lean 工具描述、Schema、Snippet、Guideline 与字符统计快照
scripts/capture-contracts.mjs    # 可复用的隔离捕获入口（--report/--write/--check）
scripts/lib/isolated-pi-session.mjs  # 隔离 Pi 会话 helper（phase 2 可复用）
scripts/verify-production-install.mjs # 生产安装（--omit=dev --legacy-peer-deps）加载验证
tests/                        # 根级：清单校验、宿主发现、契约快照
```

每个工作区包仍保留独立 `package.json`（含各自的 `pi.extensions`、`files`、`LICENSE`），便于后续单独发布到
npm；phase 1 不含发布工作流。

## 维护流程

```bash
npm ci --ignore-scripts   # 可复现安装（含 devDependencies）
npm run check             # 三个包 + 根级 typecheck/test
npm run contracts         # 重建 maintenance/tool-contracts.json
npm run contracts:check   # 校验快照是否过期（上游漂移告警）
npm run verify:production # 在临时目录执行生产安装并用宿主加载三个入口
```

`maintenance/manifest.json` 为 phase 2 提供：`id`、`path`、`upstreamPackage`、`upstreamVersion`、
`upstreamRepository`、`leanRepository`、`leanCommit` 基线等字段；`contracts:check` 与隔离 helper 可直接复用。

## ext: 选择器身份（Task Router 迁移说明）

Task Router 的 agent 定义使用 `ext:pi-subagents-lean/subagent`、`ext:pi-web-access-lean/web_access` 这类
选择器。上游 `@tintinweb/pi-subagents` 会同时用**入口所在目录名**与**声明该入口的 package 短名**作为
canonical 名称。本单仓保留目录名与包 basename，因此实际观测到的 canonical 名称仍为
`pi-subagents-lean`、`pi-web-access-lean`、`rpiv-todo-lean`，既有选择器无需迁移；
`tests/host-discovery.test.mjs` 用上游自身的 `extensionCanonicalNames()` 校验这一点。本仓库未修改任何
Router/宿主配置。

## 许可与致谢

各包均为 MIT，并在 `packages/*/LICENSE` 中保留原始版权（Copyright (c) 2026 kunkun9527）。上游引擎分别由
Nico Bailon（`pi-web-access`）、juicesharp（`@juicesharp/rpiv-todo`）、tintinweb（`@tintinweb/pi-subagents`）
开发，均为 MIT 协议；各包 `package.json` 的 `contributors` 与 `MAINTENANCE.md` 中明确标注。
