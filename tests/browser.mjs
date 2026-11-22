import assert from "node:assert/strict";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { serve } from "../scripts/serve.mjs";

const server = await serve(resolve("dist"));
const origin = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
const errors = [];
ctx.on("page", p => p.on("pageerror", err => errors.push(err.message)));
page.on("pageerror", err => errors.push(err.message));
const fixture = '<main><h1>Field manual</h1><p>Geese nest by the lake.</p><div data-xgoose-ignore>excluded text</div></main>';
async function embed(js) {
  await page.route(origin + "/sample", route => route.fulfill({contentType:"text/html",body:fixture}));
  await page.goto(origin + "/sample");
  await page.addScriptTag(js);
}
const answer = (message) => ({ choices:[{message}] });
try {
  await page.goto(new URL("../dist/index.html", import.meta.url).href);
  const preview = page.frameLocator("#preview");
  await preview.getByRole("button", {name:"让 xgoose 看看这个页面"}).click();
  await preview.getByRole("button", {name:"查看页面大纲"}).click();
  await preview.locator(".ai").getByText("湖岸步道", {exact:true}).waitFor();
  await page.locator('[name="name"]').fill("Field assistant");
  await page.locator('[name="locale"]').selectOption("en");
  await page.getByLabel("额度来源").selectOption("site");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", {name:/下载配置/}).click();
  const file = await (await downloaded).path();
  let tokenCalls = 0, chatCalls = 0;
  await page.route(origin + "/api/xgoose/token", route => {
    assert.match(route.request().headers().cookie, /sid=visitor/);
    assert.equal(route.request().method(), "POST");
    return route.fulfill({json:{access_token:"short-" + ++tokenCalls}});
  });
  await ctx.addCookies([{name:"sid",value:"visitor",url:origin}]);
  await page.route(origin + "/api/xgoose/chat", route => {
    const req = route.request(), body = req.postDataJSON();
    assert.equal(req.headers().cookie, undefined);
    assert.equal(req.headers().authorization, "Bearer short-" + tokenCalls);
    chatCalls++;
    if (chatCalls === 1) return route.fulfill({status:401});
    if (chatCalls === 2) {
      assert.ok(body.tools.some(t => t.function.name === "read_page"));
      assert.ok(!body.tools.some(t => t.function.name === "click"));
      return route.fulfill({json:answer({role:"assistant",tool_calls:[{id:"test",type:"function",function:{name:"read_page",arguments:"{}"}}]})});
    }
    assert.match(body.messages.at(-1).content, /Geese nest/);
    assert.doesNotMatch(body.messages.at(-1).content, /excluded text/);
    return route.fulfill({contentType:"text/event-stream",body:'data: {"choices":[{"delta":{"content":"The lake."}}]}\n\ndata: [DONE]\n\n'});
  });
  await embed({path:file});
  await page.getByRole("button",{name:"Ask xgoose about this page"}).click();
  const panel = page.getByRole("dialog",{name:"Field assistant"});
  await panel.getByRole("textbox").fill("Where do geese nest?");
  await panel.getByRole("textbox").press("Enter");
  await panel.getByText("The lake.", {exact:true}).waitFor();
  assert.equal(chatCalls,3);
  assert.equal(tokenCalls,3);
  console.log("PASS standalone studio, exported embed, live preview, site session, token renewal, filtered tools and streaming");

  const grantUrl = "https://xgoose.org/lite/connect/";
  await ctx.route(grantUrl, route => route.fulfill({path:resolve("dist/lite/connect/index.html")}));
  await ctx.route(grantUrl + "connect.js", route => route.fulfill({path:resolve("dist/lite/connect/connect.js")}));
  let signedIn = false, hostedCalls = 0;
  await ctx.route("https://api.xgoose.org/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/me" || path === "/auth/refresh") return route.fulfill({ status:signedIn ? 200 : 401, json:signedIn ? {user:{id:"u"}} : {} });
    assert.equal(path,"/ai/v1/chat/completions");
    assert.equal(route.request().postDataJSON().stream,false);
    hostedCalls++;
    if (hostedCalls === 1) {
      return route.fulfill({json:answer({role:"assistant",tool_calls:[{type:"function",id:"lookup",function:{name:"read_page",arguments:"{}"}}]})});
    }
    const {messages} = route.request().postDataJSON();
    assert.equal(messages.findLast(m => m.role === "user").content, "Ask Hosted");
    assert.equal(messages.at(-1).tool_call_id, "lookup");
    return route.fulfill({json:answer({role:"assistant",content:"Hosted answer"})});
  });
  await page.evaluate(() => XGooseLite.init({provider:"hosted",locale:"en"}).open());
  await page.getByRole("textbox").fill("Ask Hosted");
  const opened = page.waitForEvent("popup");
  await page.getByRole("textbox").press("Enter");
  const popup = await opened;
  await popup.getByText(origin,{exact:true}).waitFor();
  await popup.getByText("Ask Hosted",{exact:true}).waitFor();
  await popup.getByText("Review the full initial request").click();
  const consent = JSON.parse(await popup.locator("#request").innerText());
  assert.equal(consent.messages.at(-1).content, "Ask Hosted");
  assert.ok(consent.tools.some(t => t.function.name === "read_page"));
  await popup.getByRole("button",{name:"Allow this question"}).click();
  await popup.getByRole("status").getByText(/Sign in to xgoose/).waitFor();
  assert.equal(hostedCalls,0);
  signedIn = true;
  await popup.getByRole("button",{name:"Allow this question"}).click();
  await page.getByText("Hosted answer",{exact:true}).waitFor();
  assert.equal(hostedCalls,2);
  console.log("PASS two-origin Hosted popup, signed-out recovery, explicit approval and chat");

  await page.setViewportSize({width:375,height:750});
  await page.goto(origin);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByRole("button",{name:/下载配置/}).scrollIntoViewIfNeeded();
  const esm = await import("../dist/xgoose-lite.mjs");
  assert.equal(typeof esm.init, "function");
  assert.equal(esm.defaults.provider, "local");
  await page.route(origin + "/head-embed", route => route.fulfill({contentType:"text/html",
    body:'<!doctype html><html lang="en"><head><script src="/xgoose-lite.site.js"></script></head><body>' + fixture + '</body></html>'}));
  await page.goto(origin + "/head-embed");
  await page.getByRole("button",{name:"Ask xgoose about this page"}).click();
  await page.getByRole("button",{name:"Show page outline"}).click();
  await page.locator(".ai").getByText("Field manual",{exact:true}).first().waitFor();
  assert.deepEqual(errors,[]);
  console.log("PASS mobile studio, default distribution and ESM entry");
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
