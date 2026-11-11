# Pi Screenshot Context

独立 Pi 扩展，用请求观察记录控制历史输入图片过滤，保留全部原始历史和文字。不改 Pi/RPC/Web 或原图片工具，不增加模型调用。

## 0.4.0 预发布：待手动验证

**当前改动未执行测试或类型检查，不是已验证的发布版本。** 此前测试镜像不可用，本次按用户要求直接修改代码，由用户手动测试。没有自动安装、推送或创建标签。

## 安装与命令

在实际运行 Pi 的环境中安装本地目录：

```sh
pi install /app/Pi-Extension-Screenshot-Context
# 仅当前项目：追加 --local，且需获得项目信任
```

本地安装引用原目录，不复制；RPC 容器中该路径及配置必须持久化。使用与 RPC 相同用户和 agent 配置目录安装，空闲时重载或安全重启运行时。不是在浏览器或截图 API 服务安装。

```text
/screenshot-context on
/screenshot-context off
/screenshot-context status
```

默认关闭，开关按当前会话分支保存；已有 version-1 设置沿用。切换只允许在空闲时，off 恢复原行为，可能重新发送旧图片。status 显示本分支消费记录数量。命令不会调用模型。

## 新规则：图片实例 + 请求观察 + 成功响应

1. 新图片默认 pending，不凭后续 assistant 的存在推断消费。
2. 在 context 中通过来源消息条目 ID、图片块序号、内容 SHA-256 标识实例。重新读同一路径产生新的条目，所以重新发送。哈希不是去重依据。
3. 仅省略有本分支 receipt 的实例。图片映射不到唯一持久化来源时保守保留，不猜测。
4. 在 before_provider_request 观察常见供应商载荷中的 inline 图片；仅内存保存候选实例 ID/哈希，不保存第二份 Base64。
5. 对应 turn_end 的 stopReason 为 stop/toolUse，且分支关联检查通过，才持久化该批图片的 receipt，引用 assistant 条目 ID。
6. error/aborted/length/pending/deferred、不完整关联或同次 context 多个载荷回调不写 receipt。重试图片继续保留。
7. 重复投影本身不会消费图片。恢复/分支切换从当前分支 receipt 重建，旧任务分界条目不再使用。

支持标准 user/toolResult 输入图片，覆盖 phone_screenshot、read 和其他工具。custom 图片只有在能明确映射来源时才记录，通常保守保留。assistant 输出图片和系统消息不改写。普通文字/JSON 内的 Base64 不用正则删除。

占位文字明确说明：图片按策略省略，仅保留原文字，**不代表已保存图片识别结果**。后续需要看图时重新读取。本版没有引入显式 ack 工具，不检查识别记录文件或视觉结论正确性。

## 重要限制

- **观察到载荷不等于最终网络送达，更不等于识别正确。** Pi 1.4.0 公开事件没有统一请求 ID，也没有所有处理器之后的最终载荷回调。实现仅针对普通串行主请求关联；嵌套调用、多载荷回调等保守跳过。
- 本扩展之后的 provider 请求处理器仍可能移除图片，本扩展无法察觉。不应声称已严格证明该图片进入最终请求；部署时要对扩展组合实际抓取请求验收。
- 支持 OpenAI Chat/Responses、Anthropic 和 Gemini 常见 inline 图片结构的观察，未知格式或传输重编码导致哈希不匹配时不消费。重复图片内容数量不匹配时不猜测对应实例。
- receipt 只写实例 ID 和 assistant 条目引用，不写 Base64 或观察正文。分支内共享祖先的有效记录可继承，其他分支记录不读取。
- **升级后无 receipt 的旧图片保守保留，可能在首次成功分析请求中再次集中发送。** 不自动将历史图标记已识别，也不删除原会话或偷偷迁移。长会话升级请空闲时操作，首次请求体可能很大。
- receipt 失效或相关助手消息不在当前分支中时重新保留图片。扩展未加载、关闭或处理出错时不保证过滤，这不是安全脱敏机制。
- 独立摘要/压缩请求、后续扩展改写或注入、特殊供应商格式不保证覆盖。原图仍占用会话文件和部分内存，这不是磁盘清理功能。
- HTTP 200 不是消费成功依据，必须等模型 turn_end 完整成功。

## 手动验收

测试必须遵守项目执行边界，在独立 Docker 环境执行，不在 Pi 工作容器直接跑项目。需 Pi 1.4.0、支持 TypeScript 类型剥离的 Node，并能解析宿主提供的 pi-coding-agent/pi-ai。

```sh
PI_OFFLINE=1 npm test
npm pack --dry-run --json
```

test/transport.test.mjs 使用真实 Pi SDK/供应商序列化 + 容器 loopback HTTP SSE 替身捕获请求，不调用付费 API。检查同路径重读、新批次、无图后续请求、后续 context 处理器移除图后不写 receipt。扩展单测覆盖失败/多载荷/分支恢复和重复投影。直接替换 streamFunction、没有供应商载荷回调的测试现在应保守保留全部图片，不能据此假称有实际提交证据。

请特别验证：首次新图进入实际 HTTP body；成功后省略；同路径重读再次进入；失败后仍携带；恢复和分支不串状态；更晚 before_provider_request 处理器移除图的已知限制。尚未运行本版测试，不能认定这些断言已通过。

## 卸载

```sh
pi remove /app/Pi-Extension-Screenshot-Context
```

项目安装移除时同样添加 --local。安全重载/重启后停止过滤。设置和 receipt 不进入模型上下文，不必删除；重新安装可能恢复原设置。Web 命令通知及生产网络性能需单独验收。
