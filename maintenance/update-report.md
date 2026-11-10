# Local upstream maintenance

Base: 2251f09288333394de45633db005c6a9e7782505
Release after verified merge: v0.1.21

<!-- amox-release-summary:v0.1.21:start -->
- 发布 `@gfgghgftgffg/amox-pi-sync@0.1.5`：Git 进程被超时或取消终止时一律判失败，即使 Pi 返回 exit code 0；不再写入虚假的 Push/Pull/Check 完成时间。
- 网络操作 `clone`、`fetch`、`pull`、`push` 使用 10 分钟超时，本地 Git 操作保持 60 秒，避免大仓库传输被 60 秒截断。
- Pull 在无法快进时执行干净的文件级三方合并；冲突会中止并保持本地数据不变。Push 被非快进拒绝时 fetch、整合远端历史并重试一次，不使用 rebase 或 force。
- 强制 `core.autocrlf=false`、`core.eol=lf`，并为快照仓库写入本地 `* -text` 属性，避免 Git 转换或按行合并原始字节；已有混合换行历史不自动改写。
- 上游 `pi-sync-suite@0.1.1` 不设置超时，因此没有这个假成功路径；它的 Pull 只做 `--ff-only`，Push 用 rebase 处理非快进，且没有换行保护。本批为 fork 自身修复，不是上游移植。
- 本批仅发布 sync，其它三个 npm 包不升版、不重新发布。
<!-- amox-release-summary:v0.1.21:end -->

Source review: [agent-review.md](agent-review.md).

Local scoped checks, the full repository suite, exact-head three-platform CI and independent merged-SHA Release verification are required. npm publication is confirmed only by the actual publishing job and public registry integrity.
