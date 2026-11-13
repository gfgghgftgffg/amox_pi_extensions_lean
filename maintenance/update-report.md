# Local upstream maintenance

Base: 5b4c3283cdd60053d7710fcf413bf0084af835cc
Release after verified merge: v0.1.30

<!-- amox-release-summary:v0.1.30:start -->
- 升级 @tintinweb/pi-subagents 至 0.24.0，保留单一 subagent 门面、只读子会话 v1 接口及 goal/workflow 联动；goal 包不升版。
- 沿用上游 FleetView 嵌套树与自身用量显示，说明嵌套并发默认最多 10 个、超限拒绝不排队的设置边界（0 为不限）。
<!-- amox-release-summary:v0.1.30:end -->

Source review: [agent-review.md](agent-review.md).

The local gate runs real tests, contracts, standalone production installs and both dependency audits. Upstream advisory findings are recorded as warnings, not release blockers. Three-platform CI and fixed-host merge acceptance remain required; this report alone is not a cross-platform attestation.
