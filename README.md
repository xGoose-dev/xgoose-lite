# xgoose lite

给普通网站的 xgoose 页面助手。站长在单页配置器里调整外观、欢迎语、建议提问、模型、指令和页面工具。下载的 JS 已包含运行时与设置。无需安装浏览器扩展。

[打开官网配置器](https://xgoose.org/lite/)

## 本地试用

需要 Node.js 22+。在项目目录运行：

```sh
npm ci
npm run build
npm start
```

打开 http://127.0.0.1:4173 。也可以直接双击构建好的 `dist/index.html`。配置器和默认体验可离线使用。右侧是可操作的本地预览，修改对话服务只影响导出的文件。默认助手支持关键词搜索和页面大纲。选择 AI 服务后可用自然语言提问。

点击“下载配置好的 JS”。将 `xgoose-lite.site.js` 放在网站根目录，在需要助手的页面加入：

```html
<script defer src="/xgoose-lite.site.js"></script>
```

`dist/xgoose-lite.site.js` 是用默认设置构建的同类文件。可以直接拿来试用。首次挂载、下载脚本和本地体验都不会向模型服务发请求。

## 作为 JS 库使用

使用 `dist/xgoose-lite.mjs`，或在项目目录运行 `npm pack`，将生成的包安装到自己的项目。浏览器经典脚本版 `dist/xgoose-lite.js` 提供同样的 `window.XGooseLite` 接口。

```js
import { init } from "xgoose-lite";

const assistant = init({
  name: "文档助手",
  locale: "zh",
  provider: "site",
  tokenUrl: "/api/xgoose/token",
  endpoint: "/api/xgoose/chat",
  instructions: "回答时引用相关文档链接。",
  suggestions: ["这一页讲了什么？"],
  pageTools: ["read_page", "find_on_page", "list_actions", "scroll_to"],
  skills: [{
    name: "docs",
    tools: [{
      name: "current_version",
      description: "Read the version of the documentation being viewed.",
      run: () => ({ version: document.documentElement.dataset.version }),
    }],
  }],
});

assistant.open();
// assistant.ask("页面中提到了哪些命令？");
// assistant.update({ theme: "dark" });
// assistant.destroy();
```

`init()` 使用本地模式。支持 `zh`、`en`、`es`，默认跟随网页语言。模型模式还可选 `click`、`type_text`，站长在配置器勾选后才会启用。页面可以通过 `data-xgoose-ignore` 排除子树。对话只保存在当前组件内存中。单页应用切换登录身份时调用 `destroy()` 并重新 `init()`。

### 本站登录和额度

选择 `site`。每次模型调用的接口约定如下。

1. Lite 向同源的 `tokenUrl` 发送 `POST {}`，携带本站会话 cookie。后端从会话确定用户，未登录时返回 401。成功时返回 `{"access_token":"短期、仅限聊天的凭证"}`，响应加 `Cache-Control: no-store`。
2. Lite 以 `Authorization: Bearer <access_token>` 向配置的 Chat Completions 地址发送 `messages`、可选的 `model`、`tools` 和 `stream: true`。聊天请求不携带站点 cookie。后端验证短期凭证及用户额度，使用服务器持有的模型供应商密钥转发请求。
3. 聊天端点可返回 OpenAI 兼容的 SSE 或 JSON。遇到聊天 401，Lite 再取一次短期凭证并重试一次。跨源聊天端点须允许嵌入站点来源、POST 以及 Content-Type / Authorization 请求头。

以下为接入现有后端的 Express 路由示意。三个业务函数由网站提供。短期凭证绑定用户及聊天用途，额度在聊天端点执行。

```js
app.post("/api/xgoose/token", requireWebsiteSession, async (req, res) => {
  const token = await issueChatGrant({ userId: req.user.id, expiresInSeconds: 120 });
  res.set("Cache-Control", "no-store").json({ access_token: token });
});
app.post("/api/xgoose/chat", verifyChatGrant, handleMeteredChat);
```

### 用访客的 xgoose Hosted 额度

选择 `hosted`。访客发送问题时，助手打开官方授权窗口。访客在那里登录并允许本次提问，授权窗用 xgoose 第一方登录 cookie 调用现有的 `/me`、`/auth/refresh` 和 `/ai/v1/chat/completions`。嵌入页只收到模型回答和工具调用。每次授权最多六次模型调用，限时十分钟，可随时关闭窗口结束授权。Hosted 采用完整 JSON 回答，模型默认由官网选择。

**官网发布**：官网维护者将构建出的 `dist/lite/connect/index.html` 与 `connect.js` 一起放到 `https://xgoose.org/lite/connect/`。此目录是第一方授权页的独立发布产物。站长只需嵌入配置好的 JS。保留官网防嵌框设置，并允许官方授权页保留与嵌入页之间的 popup opener。启用严格 COOP 隔离的嵌入页应使用本站 token 模式。本地浏览器测试使用模拟接口验证协议。

## 开发与验证

```sh
npx playwright install chromium
npm test
npm pack --dry-run
```

源码采用 MIT 许可证。聊天循环、面板、页面工具和 Markdown 渲染源自 xgoose 官网 `43b7646` 的 `web/lite`，品牌图标来自 xgoose 扩展 `d164106`。项目可独立构建，无运行时 npm 依赖。
