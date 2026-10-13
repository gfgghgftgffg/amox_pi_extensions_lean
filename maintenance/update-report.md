# Upstream maintenance candidate

<!-- amox-maintenance-adapted; verified -->

Base: `7a666d19d92f6e5d0d22a0b5d638645a079809a3`
Release after human merge: v0.1.1

<!-- amox-release-summary:v0.1.1:start -->
- **subagents：0.20.0 → 0.21.0。**承接上游的前台任务转后台、后台完成通知使用 steer、workflow 透传 agent 文件的 isolated 设置，以及 deferred/codemode 工具作用域和嵌套调用限制。lean 入口保持不变，继续委派上游执行。
- **todo/i18n：2.13.5 → 2.13.8。**更新精确依赖锁；所审查的直接工具 API 未变，不宣称新增功能。web-access 保持 0.39.0。
- 新增三个离线回归测试，覆盖后台结果与通知透传、子代理工具作用域和 workflow 隔离。
- 修复 Windows 下新增 workflow 测试的 jiti 导入路径，避免生成两份代理注册表；保留全部断言与三平台验证。
- 真实 provider、MCP 服务及交互 UI 未做端到端测试；新增测试只覆盖上述离线边界。
<!-- amox-release-summary:v0.1.1:end -->

Detailed source/API review: [agent-review.md](agent-review.md).

## Verification and publication

The original [maintenance run](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/actions/runs/38301888492) completed detection and model adaptation. Linux and macOS verification passed; Windows failed in the new workflow-isolation test before a PR could be created.

The test imported `agent-types.ts` directly while the upstream host imports `agent-types.js`. On Windows, jiti cached differently separated paths as two registries. Matching the host's `.js` specifier fixed the fixture without changing production code or weakening assertions.

After the repair, the three new regression tests passed locally. Full local Windows checks had 158 tests, 154 passed, 0 failed and 4 skipped for unavailable file-symlink privileges. Contracts, all three standalone production installs and both audits passed with 0 vulnerabilities. The full offline maintenance pipeline also passed.

Fresh [PR #8 CI](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/actions/runs/38305997793) passed on Linux, macOS and Windows, including the aggregate gate. PR #8 was merged at `bcd2a562045feb3aed0bada3c7fdc68e52e6aed8`; [v0.1.1](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/releases/tag/v0.1.1) was published with three archives and `assets.json` after independent Release verification. No additional maintenance-model call or npm publication was performed.

This record describes the accepted v0.1.1 candidate, not verification of later maintenance-script changes.
