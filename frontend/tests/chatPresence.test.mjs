import test from "node:test";
import assert from "node:assert/strict";
import { resolveChatPresenceStatus } from "../src/lib/chat-presence.js";

test("active per-user calls take precedence over ordinary online and idle presence", () => {
  for (const callStatus of ["in-call", "in-group-call"]) {
    assert.equal(resolveChatPresenceStatus({ callStatus, presenceStatus: "active", isOnline: true }), callStatus);
    assert.equal(resolveChatPresenceStatus({ callStatus, presenceStatus: "idle", isOnline: true }), callStatus);
  }
  assert.equal(resolveChatPresenceStatus({ presenceStatus: "active", isOnline: true }), "active");
  assert.equal(resolveChatPresenceStatus({ callStatus: "ringing", isOnline: true }), "ringing");
});

test("removing the call overlay restores actual idle, online, and offline presence", () => {
  for (const presenceStatus of ["idle", "active", "offline"]) {
    assert.equal(resolveChatPresenceStatus({ callStatus: undefined, presenceStatus, isOnline: true }), presenceStatus);
  }
  assert.equal(resolveChatPresenceStatus({ isOnline: true }), "active");
  assert.equal(resolveChatPresenceStatus({ isOnline: false }), "offline");
});

import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const syntheticSocketModule = `const listeners=new Map();
window.callEmissions=[];
window.serverCallPresence={};

const socket={connected:true,on(event,fn){if(!listeners.has(event))listeners.set(event,new Set());
listeners.get(event).add(fn);
},off(event,fn){listeners.get(event)?.delete(fn);
},connect(){return this;
},emit(event,payload){window.callEmissions.push({event,payload});
if(event==='call:presence:sync')queueMicrotask(()=>this.server('call:presence',{presence:window.serverCallPresence}));
},server(event,payload){if(event==='call:presence')window.serverCallPresence=payload.presence;
if(event==='disconnect')this.connected=false;
if(event==='connect')this.connected=true;
for(const fn of listeners.get(event)||[])fn(payload);
}};

window.fakeChatSocket=socket;
export const getChatSocket=()=>socket;
export const disconnectChatSocket=()=>{};
`;

const fixtureHtml = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';
import {createRoot} from 'react-dom/client';
import {AuthContext} from '/src/context/AuthContext.jsx';
import {PresenceProvider} from '/src/context/PresenceContext.jsx';
import {CallProvider} from '/src/components/chat/CallProvider.jsx';
import ChatHeader from '/src/components/chat/ChatHeader.jsx';
import ChatSidebar from '/src/components/chat/ChatSidebar.jsx';
import '/src/index.css';
window.mediaAttempts=0;Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia(){window.mediaAttempts++;return Promise.reject(new Error('Real media forbidden in test'));}},configurable:true});
const conv=[{"_id":"dm-d1","type":"direct","participants":[{"_id":"me","name":"Observer","role":"Developer"},{"_id":"d1","name":"Alice","role":"Developer"}],"lastMessage":"Audio call started","unreadCount":0},{"_id":"dm-d2","type":"direct","participants":[{"_id":"me","name":"Observer","role":"Developer"},{"_id":"d2","name":"Bob","role":"Developer"}],"lastMessage":"Audio call started","unreadCount":0},{"_id":"dm-d3","type":"direct","participants":[{"_id":"me","name":"Observer","role":"Developer"},{"_id":"d3","name":"Charlie","role":"Developer"}],"lastMessage":"Audio call started","unreadCount":0}];const noop=()=>{};
function Fixture(){const [active,setActive]=React.useState(conv[0]._id);return React.createElement('div',{style:{display:'grid',gridTemplateColumns:'350px 1fr',height:'900px'}},React.createElement(ChatSidebar,{conversations:conv,activeConversationId:active,currentUserId:'me',onlineUsers:['d1','d2','d3'],isOpen:false,onSelect:setActive,onSearch:noop,searchResults:[],onDelete:noop,onClose:noop,onCreateDirect:noop,onCreateGroup:noop}),React.createElement(ChatHeader,{conversation:conv.find(c=>c._id===active),currentUserId:'me',onlineUsers:['d1','d2','d3'],onDelete:noop,onToggleConversationPreference:noop,onToggleSidebar:noop}));}
createRoot(document.getElementById('root')).render(React.createElement(AuthContext.Provider,{value:{user:{"_id":"me","name":"Observer","role":"Developer"},token:'synthetic-token'}},React.createElement(PresenceProvider,null,React.createElement(CallProvider,null,React.createElement(Fixture)))));
</script></body></html>`;

// Render the real chat UI with synthetic transport through Chrome CDP.
const chrome = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium",
].find((candidate) => existsSync(candidate));

test("remote call presence updates header and selected/unselected DM avatars without real calls", {
  skip: chrome ? false : "Set CHROME_PATH to run the real-browser checks", timeout: 120000,
}, async (t) => {
  const profile = await mkdtemp(path.join(tmpdir(), "chat-presence-test-"));
  const requests = [];
  let browser;
  let socket;
  const server = await createServer({
    appType: "custom",
    plugins: [{
      name: "synthetic-chat-socket",
      enforce: "pre",
      transform(code, id) {
        if (id.replaceAll("\\", "/").endsWith("/src/lib/socket.js")) return syntheticSocketModule;
      },
    }],
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
  });
  t.after(async () => {
    socket?.close();
    if (browser && browser.exitCode === null) {
      const exited = once(browser, "exit");
      browser.kill();
      await exited;
    }
    await server.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  });
  server.middlewares.use(async (req, res, next) => {
    if (req.url.startsWith("/api/")) {
      requests.push(req.url);
      res.setHeader("Content-Type", "application/json");
      res.end("[]");
      return;
    }
    if (!req.url.startsWith("/__chat-presence-test")) return next();
    res.setHeader("Content-Type", "text/html");
    res.end(await server.transformIndexHtml(req.url, fixtureHtml));
  });
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = spawn(chrome, ["--headless=new", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  const endpoint = await new Promise((resolve, reject) => {
    let stderr = "";
    const timer = setTimeout(() => reject(new Error(`Chrome debugging endpoint timed out: ${stderr.slice(-2000)}`)), 15000);
    browser.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      const url = stderr.match(/DevTools listening on (ws:\/\/\S+)/)?.[1];
      if (url) { clearTimeout(timer); resolve(url); }
    });
    browser.once("error", reject);
  });
  socket = new WebSocket(endpoint);
  await once(socket, "open");
  let id = 0;
  let sessionId;
  const pending = new Map();
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (!pending.has(message.id)) return;
    const { resolve, reject, timer } = pending.get(message.id);
    clearTimeout(timer);
    pending.delete(message.id);
    message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(requestId, { resolve, reject, timer });
    socket.send(JSON.stringify({ id: requestId, method, params, sessionId }));
  });
  const targets = await send("Target.getTargets");
  sessionId = (await send("Target.attachToTarget", { targetId: targets.targetInfos.find((target) => target.type === "page").targetId, flatten: true })).sessionId;
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitFor = async (expression) => {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (await evaluate(`Boolean(${expression})`)) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.fail(`Browser condition timed out: ${expression}; body: ${await evaluate("document.body.innerText")}`);
  };

  await send('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:origin+'/__chat-presence-test'});
  const dots="[...document.querySelectorAll('aside span[role=img][title]')]";
  const header="document.querySelector('header span[role=img][title]')";
  await waitFor(dots+'.length===3 && '+header);
  const status=async()=>evaluate(dots+'.map(x=>({label:x.getAttribute("aria-label"),color:getComputedStyle(x.firstElementChild).backgroundColor}))');
  const emit=async(event,payload)=>evaluate('window.fakeChatSocket.server('+JSON.stringify(event)+','+JSON.stringify(payload)+')');
  const waitLabel=(index,label)=>waitFor(dots+'['+index+']?.getAttribute("aria-label")==='+JSON.stringify(label));
  assert.deepEqual((await status()).map(x=>x.label),['Online','Online','Online']);
  const geometry=await evaluate(dots+'.map(x=>({position:x.className,dot:x.firstElementChild.className.replace(/bg-[a-z]+-500/g,"COLOR"),height:x.firstElementChild.getBoundingClientRect().height,width:x.firstElementChild.getBoundingClientRect().width}))');
  await emit('presence:update',{userId:'d1',status:'idle'});await waitLabel(0,'Idle');
  await emit('call:presence',{presence:{d1:'in-call',d2:'in-group-call'}});
  await waitLabel(0,'In Call');await waitLabel(1,'In Group Call');
  assert.equal(await evaluate(header+'.getAttribute("aria-label")'),'In Call');
  assert.equal(await evaluate(header+'.getAttribute("title")'),'In Call');
  assert.deepEqual((await status()).map(x=>x.color),['rgb(239, 68, 68)','rgb(239, 68, 68)','rgb(16, 185, 129)']);
  assert.equal(await evaluate('getComputedStyle('+header+'.firstElementChild).backgroundColor'),'rgb(239, 68, 68)');
  assert.deepEqual(await evaluate(dots+'.map(x=>({position:x.className,dot:x.firstElementChild.className.replace(/bg-[a-z]+-500/g,"COLOR"),height:x.firstElementChild.getBoundingClientRect().height,width:x.firstElementChild.getBoundingClientRect().width}))'),geometry);
  // A normal online event cannot overwrite the per-user call overlay.
  await emit('presence:update',{userId:'d1',status:'active'});await waitLabel(0,'In Call');
  // Select the previously unselected call participant; both remain red.
  await evaluate('[...document.querySelectorAll("aside button")].find(x=>x.textContent.includes("Bob")).click()');
  await waitFor(header+'.getAttribute("aria-label")==="In Group Call"');
  assert.deepEqual((await status()).map(x=>x.color),['rgb(239, 68, 68)','rgb(239, 68, 68)','rgb(16, 185, 129)']);
  await emit('presence:update',{userId:'d1',status:'idle'});
  await emit('call:presence',{presence:{}});await waitLabel(0,'Idle');await waitLabel(1,'Online');
  await waitFor(header+'.getAttribute("aria-label")==="Online"');
  // Remote disconnect removes only that user's overlay; actual offline wins.
  await emit('call:presence',{presence:{d1:'in-call'}});await waitLabel(0,'In Call');
  await emit('call:presence',{presence:{}});await emit('presence:update',{userId:'d1',status:'offline'});await waitLabel(0,'Offline');
  await emit('presence:update',{userId:'d1',status:'idle'});await emit('call:presence',{presence:{d1:'in-call'}});await waitLabel(0,'In Call');
  // This observer disconnects: clear stale overlays, then request a fresh snapshot.
  const syncCount=await evaluate('window.callEmissions.filter(x=>x.event==="call:presence:sync").length');
  await emit('disconnect','transport close');await waitLabel(0,'Idle');
  await emit('connect');await waitLabel(0,'In Call');
  assert.ok(await evaluate('window.callEmissions.filter(x=>x.event==="call:presence:sync").length')>syncCount);
  // A call ending while the observer is offline must not reappear on reconnect.
  await emit('disconnect','transport close');await waitLabel(0,'Idle');
  await evaluate('window.serverCallPresence={}');await emit('connect');await waitLabel(0,'Idle');
  assert.equal(await evaluate('window.mediaAttempts'),0);
  assert.equal(await evaluate('window.callEmissions.some(x=>["call:start","call:accept","call:join"].includes(x.event))'),false);
});
