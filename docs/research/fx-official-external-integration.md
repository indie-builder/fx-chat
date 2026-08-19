# FX 官方外部集成调研

> 调研日期：2026-08-19
>
> 上游仓库快照：[`400ed25`](https://github.com/vercel-labs/fx/commit/400ed25b886f5df8b81c8be1ee44d1cdf1627ca8)
>
> 已发布 npm 版本：[`libfx@0.0.3`](https://www.npmjs.com/package/libfx/v/0.0.3)，对应标签 [`v0.0.3`](https://github.com/vercel-labs/fx/tree/fc124be4f4c67ac4c1b7a0b586a3831e93b463d6)

## 结论

FX 官方提供四种可用于外部项目的表面，但能力并不等价：

1. `fx acp`：把原生 FX 作为 ACP 服务进程，由外部编辑器或应用通过 stdin/stdout 驱动。这是当前唯一同时保留 FX 原生工具、权限、沙箱、项目指令、Skills、原生会话，并允许客户端提供 MCP servers 的外部集成方式。[官方 ACP 文档](https://fx.sh/docs/using-fx/acp)
2. Node `createFxAgent()`：把 Headless ACP Core 嵌入 JavaScript 进程。`libfx@0.0.3` 优先加载 N-API addon，不能加载时才回退到 WASM；但当前 native core 故意禁用了原生工具、ACP MCP、后台进程和 secret store，因此它适合验证会话与文本流，不是完整 coding-agent runtime。[v0.0.3 Node 入口](https://github.com/vercel-labs/fx/blob/fc124be4f4c67ac4c1b7a0b586a3831e93b463d6/sdk/node.js#L249-L291) [N-API capability profile](https://github.com/vercel-labs/fx/blob/fc124be4f4c67ac4c1b7a0b586a3831e93b463d6/sdk/NAPI.md#L119-L145)
3. Browser `createFxAgent()`：使用 `fx-core.wasm` 的 Headless Core，同样不提供原生工具；要求 JSPI，适合纯浏览器的自定义 Chat，但生产环境不能把长期凭证写进客户端。[SDK browser agent](https://github.com/vercel-labs/fx/blob/400ed25b886f5df8b81c8be1ee44d1cdf1627ca8/sdk/README.md#L135-L168)
4. Browser `createFxTerminal()`：使用 `fx-term.wasm` 和 xterm.js 嵌入 FX 自带终端 UI。它可通过 host workspace adapter 增加一个受约束的前台 `run_command`，但不等同于原生 FX 工具集。[WebAssembly SDK](https://fx.sh/docs/lib/webassembly) [Browser integration](https://fx.sh/docs/lib/host-integration)

因此，对当前 Next.js Chat 项目的推荐是：

- 只验证 FX 文本会话：服务端使用 `libfx/node`，直接接 Vercel AI Gateway。
- 要验证“完整工具状态、权限、coding agent 行为”：将后端改成 ACP client，按 workspace 启动 `fx acp`，再把 ACP 更新转成页面事件。
- 不应继续把“自定义 Kimi fetch 转译器 + Headless Core”表述成官方 FX 集成；官方只定义了 AI Gateway 认证和 Gateway 请求代理，并未定义 Kimi 原生协议适配器。

## 文档版本与发布状态

目前官方资料存在短期漂移：fx.sh 的 WebAssembly 页面仍写着“SDK 尚未发布到 npm”，但上游 `main` 的 `sdk/README.md` 已给出 `npm install libfx`，npm 也已发布 `0.0.3`。[fx.sh WebAssembly SDK](https://fx.sh/docs/lib/webassembly) [当前 SDK README](https://github.com/vercel-labs/fx/blob/400ed25b886f5df8b81c8be1ee44d1cdf1627ca8/sdk/README.md#L7-L25)

本报告对实现行为以 `libfx@0.0.3` 标签和发布包为准，对未来方向引用上游 `main`。建议项目固定精确版本，不要假设 `main` 中新增的说明已经存在于已安装包。

`libfx@0.0.3` 是纯 ESM，要求 Node.js 20+，导出 `libfx`、`libfx/node`、`libfx/browser`、`libfx/wasm`。包中包含 JavaScript host layer、两个 WASM 文件及 Linux/macOS x64/arm64 native addons。[v0.0.3 package exports](https://github.com/vercel-labs/fx/blob/fc124be4f4c67ac4c1b7a0b586a3831e93b463d6/sdk/package.json#L18-L45) [SDK backend requirements](https://github.com/vercel-labs/fx/blob/400ed25b886f5df8b81c8be1ee44d1cdf1627ca8/sdk/README.md#L13-L34)

发布包没有 `types` 字段，也没有 `.d.ts` 文件进入 `files` 清单，所以 `0.0.3` 不是官方 TypeScript typed package；Next.js/TypeScript 项目若自行增加声明文件，应明确它是本地适配层，不能把它当作 FX 官方类型契约。[v0.0.3 package manifest](https://github.com/vercel-labs/fx/blob/fc124be4f4c67ac4c1b7a0b586a3831e93b463d6/sdk/package.json#L18-L45)

## 四种集成表面的对比

| 表面 | 运行位置 | UI | 工具能力 | 会话 | 认证 | 推荐用途 |
| --- | --- | --- | --- | --- | --- | --- |
| `fx acp` | 原生独立进程 | 自定义 | 完整原生 runtime；MCP 仅使用客户端传入的 servers | FX 原生持久化 | 复用 `fx login`、`fx setup` 或进程凭证 | 完整 coding-agent Chat / 编辑器集成 |
| Node `createFxAgent()` | Node 进程内，native 优先 | 自定义 | 当前 native core 为 0 个原生工具，无 ACP MCP | 默认内存，可注入 `sessionStore` | `AI_GATEWAY_API_KEY`；host `fetch` 可代理 Gateway | 文本流、会话 API 验证 |
| Browser `createFxAgent()` | 浏览器 WASM | 自定义 | Headless Core 无工具 | 默认内存，可注入 `sessionStore` | 短期 Gateway 凭证或服务端代理 | 纯浏览器 Chat 实验 |
| Browser `createFxTerminal()` | 浏览器 WASM | FX 终端 + xterm | 无原生工具；可选 host workspace 仅增加前台 `run_command` | 可注入 store，可恢复 | 短期凭证或 device login adapters | 原样嵌入 FX 终端体验 |

FX 自己也把三类入口区分为：原生 CLI、`fx acp`、JavaScript Headless 与 JavaScript Terminal，而不是把它们描述成同一套能力。[Embed fx](https://fx.sh/docs/lib) [仓库 README](https://github.com/vercel-labs/fx/blob/400ed25b886f5df8b81c8be1ee44d1cdf1627ca8/README.md#L67-L75)

### 1. Node Headless：`createFxAgent()`

官方调用顺序是：

```js
import { createFxAgent } from "libfx/node";

const agent = await createFxAgent({
  backend: "native",
  env: {
    AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
    FX_MODEL: process.env.FX_MODEL,
  },
  onEvent(event) {
    // runtime / ACP / lifecycle diagnostics
  },
  async onPermission(request) {
    return null;
  },
});

const session = await agent.createSession();
const turn = session.prompt("Explain this project");

for await (const update of turn) {
  // ACP session update
}

console.log(await turn.stopReason);
await session.close();
await agent.close();
```

这与官方 Headless 示例、生命周期和取消约定一致。[Headless example](https://github.com/vercel-labs/fx/blob/400ed25b886f5df8b81c8be1ee44d1cdf1627ca8/sdk/README.md#L44-L77) [Session API and cancellation](https://github.com/vercel-labs/fx/blob/400ed25b886f5df8b81c8be1ee44d1cdf1627ca8/sdk/README.md#L96-L133)

关键限制：

- 一个 agent 同时只有一个 active session；创建或打开另一个 session 会先关闭当前 session。
- 一个 session 同时只有一个 active prompt。
- prompt 支持 string，或 text/resource blocks；image blocks 当前直接拒绝。
- turn 是 async iterable，同时提供 `result`、`stopReason` 和 `cancel()`；`AbortSignal` 会发送 `session/cancel` 并中止 host effect。

这些约束由 `0.0.3` 的公开 JavaScript host layer 直接实现。[v0.0.3 session implementation](https://github.com/vercel-labs/fx/blob/fc124be4f4c67ac4c1b7a0b586a3831e93b463d6/sdk/fx-sdk.js#L913-L930) [v0.0.3 agent and turn lifecycle](https://github.com/vercel-labs/fx/blob/fc124be4f4c67ac4c1b7a0b586a3831e93b463d6/sdk/fx-sdk.js#L933-L1128)

Node backend 的 `auto` 会先找 native addon；`native` 要求 native 成功；`wasm` 强制 JSPI。当前 native addon 只实现 Headless Core，`createFxTerminal()` 会走 WASM。[v0.0.3 Node loader](https://github.com/vercel-labs/fx/blob/fc124be4f4c67ac4c1b7a0b586a3831e93b463d6/sdk/node.js#L249-L291)

最重要的是，当前 Node Headless native core 不是原生 CLI 的完整能力：官方 maintainer 文档明确设置 `allow_native_tools = false`、`allow_acp_mcp = false`，并禁用后台进程、secret store 和文件/命令额度。官方回归测试还断言发给模型的 `tools` 必须为空。[N-API capability profile](https://github.com/vercel-labs/fx/blob/fc124be4f4c67ac4c1b7a0b586a3831e93b463d6/sdk/NAPI.md#L119-L145) [native stream test](https://github.com/vercel-labs/fx/blob/fc124be4f4c67ac4c1b7a0b586a3831e93b463d6/sdk/tests/test-native-core-stream.mjs#L13-L41)

所以页面显示 `Tools 0` 不是渲染问题，而是这个 backend 的设计结果。

### 2. Browser Headless：`createFxAgent()` + `fx-core.wasm`

Browser 入口始终使用 WASM。官方要求先运行 `supportsJspi()`；当前 SDK README 给出的最低浏览器是 Chrome/Edge 137，fx.sh 页面还记录了 Safari 27 / Safari Technology Preview 238 和 Node 24 的 JSPI 支持。[Browser agent](https://github.com/vercel-labs/fx/blob/400ed25b886f5df8b81c8be1ee44d1cdf1627ca8/sdk/README.md#L135-L168) [WebAssembly runtime support](https://fx.sh/docs/lib/webassembly)

它与 Node Headless 共享会话 API，但 WebAssembly Core 的 active tool set 在源码中固定为空；网页 host integration 也只把 `configStore`、`sessionStore`、`fetch` 列为 `createFxAgent()` 支持的 adapters。[WASM ACP tool set](https://github.com/vercel-labs/fx/blob/400ed25b886f5df8b81c8be1ee44d1cdf1627ca8/src/acp/prompt.zig#L310-L318) [Browser integration adapters](https://fx.sh/docs/lib/host-integration)

官方明确要求浏览器不要持有长期 API key，应改用短期 credential 或认证后的 server-side proxy。[SDK credential warning](https://github.com/vercel-labs/fx/blob/400ed25b886f5df8b81c8be1ee44d1cdf1627ca8/sdk/README.md#L163-L168)

### 3. Browser Terminal：`createFxTerminal()` + xterm.js

这是官方 `term-demo.html` 和 `fx.sh/try` 使用的形态：创建 xterm、连接 `xtermAdapter()`、传入 config/prompt-history adapters，再等待 `runtime.interactive`。官方 demo 的实际 wiring 可见 [`term-demo.html`](https://github.com/vercel-labs/fx/blob/400ed25b886f5df8b81c8be1ee44d1cdf1627ca8/sdk/term-demo.html#L61-L132)，公开 API 包含 `interactive`、`exited`、`write()`、`resize()`、`abort()`。[Interactive terminal API](https://github.com/vercel-labs/fx/blob/400ed25b886f5df8b81c8be1ee44d1cdf1627ca8/sdk/README.md#L170-L229)

可选 `workspace` adapter 的 v1 约束很严格：

- `cwd === root`；
- `gitAvailable: false`；
- `ephemeral: true`；
- permission 只能是 `allow-sandboxed` 或 `prompt`；
- command 最多 64 KiB，组合输出最多 64 KiB，执行最多 30 秒；
- host 必须响应 `AbortSignal`；
- 工具 schema 只有 `{ action: "exec", command }`，不支持 durable/background action。

这些限制同时存在于官方 Browser integration 文档和 workspace 回归测试。[Browser workspace contract](https://fx.sh/docs/lib/host-integration) [workspace integration test](https://github.com/vercel-labs/fx/blob/400ed25b886f5df8b81c8be1ee44d1cdf1627ca8/sdk/node/test-term-workspace.mjs#L29-L63) [workspace schema assertions](https://github.com/vercel-labs/fx/blob/400ed25b886f5df8b81c8be1ee44d1cdf1627ca8/sdk/node/test-term-workspace.mjs#L148-L165)

WASM 不包含 native processes、OS sandbox、native MCP、subagents、skills、web search、auto-upgrade、clipboard 或任意 WASI filesystem access。[SDK security boundaries](https://github.com/vercel-labs/fx/blob/400ed25b886f5df8b81c8be1ee44d1cdf1627ca8/sdk/README.md#L290-L318)

### 4. Native ACP：`fx acp`

外部应用从目标 workspace 启动一个 native FX 进程：

```sh
cd /absolute/path/to/project
/absolute/path/to/fx acp
```

协议是 stdin/stdout 上的 newline-delimited JSON-RPC 2.0；stdout 只能用于 ACP，日志要写 `--log-file` 或 `FX_TRACE_LOG`。每条输入上限 8 MiB。每个 primary workspace 应启动独立进程，每条 connection 只有一个 active session 和一个 active prompt。[ACP server](https://fx.sh/docs/using-fx/acp)

官方支持 `initialize`、session create/load/resume/close/list、prompt/cancel、model/mode config。prompt 支持 text 与 embedded resource，不支持 image/audio。客户端会收到 streamed user/agent messages、tool status updates 和 permission requests。[ACP methods and prompts](https://fx.sh/docs/using-fx/acp)

ACP 使用 FX 现有认证、settings、project instructions、skills、sessions、permissions、sandbox 和 tools；但 MCP 是例外：只使用客户端 `mcpServers`，不会继承 `~/.fx/mcp.json`。[ACP authentication and MCP](https://fx.sh/docs/using-fx/acp)

这正是自定义 Chat UI 想保留 FX 完整语义时应该使用的官方边界。

## 凭证与模型

官方认证只有 Vercel 登录或 Vercel AI Gateway credential。CLI/ACP 可按 `VERCEL_OIDC_TOKEN`、`AI_GATEWAY_API_KEY`、saved login、stored key 的顺序选取；SDK 示例直接把 `AI_GATEWAY_API_KEY` 注入 `env`。[Authentication](https://fx.sh/docs/getting-started/authentication) [Headless SDK example](https://github.com/vercel-labs/fx/blob/400ed25b886f5df8b81c8be1ee44d1cdf1627ca8/sdk/README.md#L44-L77)

FX 使用 AI Gateway model catalog。进程级 `FX_MODEL` 优先，SDK 也可以在创建 session 后调用 `session.setModel(modelId)`；有效 ID 应来自当前 credential/team 能访问的 Gateway catalog。[Models](https://fx.sh/docs/configure-fx/models) [Session config API](https://github.com/vercel-labs/fx/blob/400ed25b886f5df8b81c8be1ee44d1cdf1627ca8/sdk/README.md#L109-L120)

`libfx@0.0.3` 的 native entry 只从 `env` 中读取 `AI_GATEWAY_API_KEY`、`FX_MODEL`、`FX_GATEWAY_CHAT_URL`。生产 endpoint 只允许 canonical Vercel AI Gateway；自定义 URL 只允许带端口的 loopback HTTP，且 URL 不能带 credentials 或 fragment。[v0.0.3 native options](https://github.com/vercel-labs/fx/blob/fc124be4f4c67ac4c1b7a0b586a3831e93b463d6/sdk/node.js#L113-L139)

### Kimi Key 的结论

官方仓库、SDK 文档、fx.sh 文档和 `0.0.3` 测试中均没有 `KIMI_API_KEY`、Moonshot direct API、Anthropic-compatible Kimi endpoint 或相应 provider adapter。FX 官方方式是：

```text
AI_GATEWAY_API_KEY=<Vercel AI Gateway credential>
FX_MODEL=<Gateway catalog 中可用的 Kimi model ID>
```

host `fetch` 是公开 adapter，但文档把用途限定为路由 Gateway 请求、通过服务端代理认证、或施加网络策略。[Host integrations](https://github.com/vercel-labs/fx/blob/400ed25b886f5df8b81c8be1ee44d1cdf1627ca8/sdk/README.md#L273-L288) [Network requests](https://fx.sh/docs/lib/host-integration)

用自定义 `fetch` 忽略 FX 请求 URL、把 Gateway 请求翻译成 Kimi/Anthropic 协议，再把响应翻译回 Gateway SSE，技术上可以由 host 实现，但它没有官方 schema、示例或回归测试支持。因此应标记为“项目自定义且版本脆弱”，不能作为官方兼容路径。尤其不能把 `KIMI_API_KEY` 伪装成 `AI_GATEWAY_API_KEY` 后宣称 FX 原生支持 Kimi direct API。

## 事件、权限和会话契约

### 会话

`sessionStore` 的 bytes 是 opaque data，采用 optimistic revision：首次 commit 的 `expectedRevision` 是 `undefined`；每次 commit 必须返回新 revision；stale revision 必须抛出 `code === "FX_SESSION_REVISION_CONFLICT"`。没有自定义 store 时，`createFxAgent()` 使用内存 store。[Session store contract](https://fx.sh/docs/lib/host-integration) [官方 session test](https://github.com/vercel-labs/fx/blob/400ed25b886f5df8b81c8be1ee44d1cdf1627ca8/sdk/tests/test-core.mjs#L63-L98)

不要解析或改写 session bytes；也不要把并发请求无条件路由到同一个 agent/session，因为公开实现明确拒绝一个 session 上的第二个 active prompt。[v0.0.3 turn guard](https://github.com/vercel-labs/fx/blob/fc124be4f4c67ac4c1b7a0b586a3831e93b463d6/sdk/fx-sdk.js#L1074-L1114)

### 权限

`createFxAgent()` 的 `onPermission(request)` 必须返回 `request.options[*].optionId`；返回 `null`/`undefined` 或 callback 抛错都会映射成 cancelled。SDK 同时通过 `onEvent` 发送 `permission.request` 和 `permission.resolve`。[SDK permission example](https://github.com/vercel-labs/fx/blob/400ed25b886f5df8b81c8be1ee44d1cdf1627ca8/sdk/README.md#L52-L64) [v0.0.3 permission bridge](https://github.com/vercel-labs/fx/blob/fc124be4f4c67ac4c1b7a0b586a3831e93b463d6/sdk/fx-sdk.js#L967-L985)

但 callback 存在不代表当前 Headless Core 有工具：在 native/WASM Headless 的空工具集下，通常不会产生工具权限请求。完整权限流属于 `fx acp` 或 interactive terminal 的能力。

ACP 的 `ask` 模式会把未决敏感调用交给客户端批准；`code` 模式会自动 review。Session allow grant 只活在当前 session，不会写回 settings 或随 load 恢复。[ACP modes](https://fx.sh/docs/using-fx/acp)

### 可公开依赖的更新

`turn` 直接 yield `session/update` 中的 `update` 对象。当前 FX 源码写出的主要形态是：

- `agent_message_chunk`：`content: { type: "text", text }`；
- `user_message_chunk`；
- `tool_call`：`toolCallId`、`title`、`kind`、`status`；
- `tool_call_update`：`toolCallId`、`status`、可选 text content / command result；
- `session_info_update`：当前用于 model-response recovery；
- `available_commands_update`。

Stop reason 不在 update 流里，而在 prompt response / `turn.result` / `turn.stopReason`，当前枚举包含 `end_turn`、`max_output_tokens`、`max_model_turns`、`refused`、`cancelled`。[ACP update writers](https://github.com/vercel-labs/fx/blob/400ed25b886f5df8b81c8be1ee44d1cdf1627ca8/src/acp/types.zig#L11-L77) [message and tool update shapes](https://github.com/vercel-labs/fx/blob/400ed25b886f5df8b81c8be1ee44d1cdf1627ca8/src/acp/types.zig#L121-L178) [prompt response](https://github.com/vercel-labs/fx/blob/400ed25b886f5df8b81c8be1ee44d1cdf1627ca8/src/acp/types.zig#L180-L203)

`onEvent` 还可观察 runtime lifecycle 和原始 ACP envelopes。官方 core debugger 正是通过 `acp.receive` 读取 `session/update`，把非 message update 作为 raw JSON 展示，并用 `session.setModel()` / `setMode()` 和 `turn.cancel()` 控制会话。[Core debugger event rendering](https://github.com/vercel-labs/fx/blob/400ed25b886f5df8b81c8be1ee44d1cdf1627ca8/sdk/index.html#L132-L148) [Core debugger session wiring](https://github.com/vercel-labs/fx/blob/400ed25b886f5df8b81c8be1ee44d1cdf1627ca8/sdk/index.html#L250-L314)

## Thinking、工具状态和 Token 的官方支持度

### Thinking

在本次检查的 `v0.0.3` host layer、当前 ACP update writers、SDK 示例和 ACP 文档中，没有公开的 `agent_thought_chunk`、reasoning delta 或“完整 Thinking”事件。公开的 agent stream 是 `agent_message_chunk`。因此页面不能把自定义 fetch 中截获的 provider reasoning 内容标为 FX 官方事件。[ACP message update shape](https://github.com/vercel-labs/fx/blob/400ed25b886f5df8b81c8be1ee44d1cdf1627ca8/src/acp/types.zig#L129-L178) [ACP documented streamed outputs](https://fx.sh/docs/using-fx/acp)

### 工具状态

FX ACP 有正式的 `tool_call` / `tool_call_update` 形态，可显示 pending、in_progress、completed、failed，并带有限的结果预览。[Tool call schema](https://github.com/vercel-labs/fx/blob/400ed25b886f5df8b81c8be1ee44d1cdf1627ca8/src/acp/types.zig#L79-L119) [Tool update writer](https://github.com/vercel-labs/fx/blob/400ed25b886f5df8b81c8be1ee44d1cdf1627ca8/src/acp/types.zig#L141-L178)

但是只有 tool-bearing surface 才会发这些更新。`libfx` Headless Core 的 tool set 为空，因此“渲染器支持 tool event”与“当前 backend 实际能执行工具”是两回事。

### Token 使用量

Gateway SSE 的 `finish` 确实包含 usage，FX 内部会解析 input/output/cache/reasoning token 并保存 usage；但 `createFxAgent()` 的公开 prompt result 目前只返回 `stopReason`，ACP update writers 也没有 usage update。[Gateway usage parser](https://github.com/vercel-labs/fx/blob/400ed25b886f5df8b81c8be1ee44d1cdf1627ca8/src/gateway/client.zig#L2469-L2485) [v0.0.3 public turn result](https://github.com/vercel-labs/fx/blob/fc124be4f4c67ac4c1b7a0b586a3831e93b463d6/sdk/fx-sdk.js#L1098-L1114)

CLI 的 `fx usage` 可以查看本机 FX 记录的 usage，并强调它不是 team-wide AI Gateway 查询；但它不是当前 `libfx` session API 的一部分。[Usage and costs](https://fx.sh/docs/using-fx/usage-and-costs)

所以当前页面若通过 custom `fetch` tee/parse Gateway SSE 来显示 token，只能算实验性 transport instrumentation：

- 它依赖未承诺为 UI API 的 Gateway wire format；
- 它不等于 ACP/libfx 官方事件；
- 必须防止把 Authorization、prompt、tool output 或 provider diagnostics 写进客户端日志；
- FX 升级后要用实际 Gateway stream 回归测试重新验证。

如果产品要求稳定的 per-turn token contract，应向 FX 上游请求在 ACP `session/update` 或 prompt result 中正式暴露 usage，而不是把 Gateway SSE parser 固化成应用协议。

## 面向当前 Next.js Chat 的建议架构

### 路线 A：保留最小 Headless 验证

适用于目标仅为“证明 Next.js 页面能通过 FX 建立会话并流式输出文本”。

```text
Next.js Chat
  -> Node server route
  -> libfx/node createFxAgent({ backend: "native" })
  -> Vercel AI Gateway
```

要求：

- `libfx` 只在 server-only 模块加载，运行环境必须能加载对应 `.node` addon；
- API key 留在服务端；
- 使用真正的 `AI_GATEWAY_API_KEY` 和 Gateway model ID；
- agent/session 要有明确 owner，串行一个 active prompt，并在取消/断开时调用 `turn.cancel()`；
- 对外只承诺 text chunks、stop reason、session lifecycle；
- 明确标注此路线没有 FX 原生工具、Thinking 和官方 token event。

FX 官方尚未提供 Next.js template、Route Handler 示例、native addon bundler 配置或 React hook。以上是根据官方 Node API 形成的集成设计，不是官方 Next.js 模板。上线前必须验证目标 bundler/deployment 是否保留 native addon 和长期 session 生命周期。

### 路线 B：完整 FX Chat，推荐

适用于目标为“显示工具、权限、session、真实 coding agent 行为”。

```text
Next.js Chat UI
  <-> SSE + permission POST，或 WebSocket
ACP process manager（长生命周期 Node service）
  <-> NDJSON-RPC over stdin/stdout
fx acp（每个 primary workspace 独立进程）
  -> Vercel AI Gateway
  -> native tools / sandbox / client-supplied MCP
```

后端需要：

1. 以目标 workspace 为 cwd 启动绝对路径的 `fx acp`。
2. 先发送 `initialize`，再 new/load session。
3. 把 `session/update` 事件原样保存并映射到前端；未知 update type 必须透传或安全忽略，不能让 UI parser 崩溃。
4. 把 permission request 暴露成可交互 UI，并把用户选择的 option ID 回写同一 ACP request。
5. 每个 connection 串行 prompt，取消时发送 `session/cancel`。
6. stdout 只做 ACP；诊断写独立 log。
7. 复用 FX 原生会话，不要另造一份 transcript 作为事实来源；前端数据库最多保存 UI-to-session-ID mapping。
8. 运行环境必须能保持子进程与 stdin/stdout 长连接；若 Next 部署环境不能保证这一点，应把 ACP process manager 放到独立长生命周期服务，Next 仅保留 UI/BFF。

这条路线能得到官方 tool status 和 permission contract，但仍得不到公开 Thinking 与 per-turn token event；这两项不能在 UI 上伪装成官方完整数据。

### 路线 C：直接嵌入 FX Terminal

如果目标是最快看到 FX 官方交互，而不是保持 Chat 视觉，可以直接复用 `createFxTerminal()` + xterm.js。它最接近 `term-demo.html`，但 UI 是终端，浏览器工具只有 host 实现的受约束 `run_command`，不满足完整原生 coding-agent 要求。

## 实施前的验收标准

无论选择哪条路线，都应至少验证：

- 使用与生产相同的 credential source 和 model ID；
- 文本按多个 chunk 到达，而不是结束后一次性刷新；官方 core test 对此有明确断言。[Core stream test](https://github.com/vercel-labs/fx/blob/400ed25b886f5df8b81c8be1ee44d1cdf1627ca8/sdk/tests/test-core.mjs#L141-L160)
- 浏览器断开或用户取消会真正 abort Gateway fetch，并得到 `cancelled` stop reason。[Cancellation test](https://github.com/vercel-labs/fx/blob/400ed25b886f5df8b81c8be1ee44d1cdf1627ca8/sdk/tests/test-core-cancel.mjs#L16-L56)
- session store revision conflict 会失败关闭，而不是覆盖新 snapshot；
- 权限 UI 只提交官方 option ID，默认无决定即 cancel；
- 所有未知 ACP update 都有向前兼容处理；
- 不记录 credential、Authorization header、OAuth bytes、raw session bytes；
- UI 对 Thinking/Token 的标签准确区分“官方 ACP 数据”和“实验性 transport 观测”；
- Headless 路线必须验收工具数为 0；ACP 路线必须用真实只读工具与一项需审批工具验证完整状态迁移。

## 最终建议

当前项目已经不只是“Chat 文本流 demo”，而是要求展示工具、权限和运行细节。继续围绕 `libfx@0.0.3 createFxAgent()` 增加 UI 无法补回 backend 根本没有的 native tool capability。

建议下一步先做架构切换：

1. 删除“FX 官方支持 KIMI_API_KEY direct”的假设，改用 `AI_GATEWAY_API_KEY + Gateway Kimi model ID`；
2. 将完整功能路径改成 `fx acp` process manager；
3. 以 ACP `session/update` 为唯一正式前端事件源；
4. Thinking 和 Token 暂时显示为“不由当前 FX ACP API 提供”，除非明确保留一个标为 experimental 的 Gateway transport inspector；
5. `libfx` Headless 可保留为单独的最小文本流实验，不应与完整 FX coding-agent 验证混为一谈。
