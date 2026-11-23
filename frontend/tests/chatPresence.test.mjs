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
window.serverPresenting={};

const socket={connected:true,on(event,fn){if(!listeners.has(event))listeners.set(event,new Set());
listeners.get(event).add(fn);
},off(event,fn){listeners.get(event)?.delete(fn);
},connect(){return this;
},emit(event,payload,callback){window.callEmissions.push({event,payload});
if(event==='call:start')callback?.({ok:false,error:'Synthetic test call only'});
if(event==='call:screen-share-started'||event==='call:screen-share-stopped'){if(event.endsWith('started')){window.serverPresenting.me=true;window.serverCallPresence.me='in-group-call';}else delete window.serverPresenting.me;queueMicrotask(()=>this.server('call:presence',{presence:window.serverCallPresence,presenting:window.serverPresenting}));}
if(event==='call:presence:sync')queueMicrotask(()=>this.server('call:presence',{presence:window.serverCallPresence,presenting:window.serverPresenting}));
},server(event,payload){if(event==='call:presence'){window.serverCallPresence=payload.presence;window.serverPresenting=payload.presenting||{};}
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
import {useChatStore} from '/src/lib/chatStore.js';
window.chatTestStore=useChatStore;
import ChatWindow from '/src/components/chat/ChatWindow.jsx';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '/src/components/ui/dialog.jsx';
import ChatSidebar from '/src/components/chat/ChatSidebar.jsx';
import '/src/index.css';
window.mediaAttempts=0;window.mediaRequests=[];window.deletes=0;window.confirmations=0;
window.confirm=()=>{window.confirmations++;return true;};
const syntheticVideo=()=>document.createElement('canvas').captureStream().getVideoTracks()[0];
Object.defineProperty(navigator,'mediaDevices',{value:{
  async getUserMedia(options){window.mediaAttempts++;window.mediaRequests.push(options);const audio=new AudioContext().createMediaStreamDestination().stream;return new MediaStream([...audio.getAudioTracks(),...(options.video?[syntheticVideo()]:[])]);},
  async getDisplayMedia(){window.displayTrack=syntheticVideo();return new MediaStream([window.displayTrack]);}
},configurable:true});
const conv=[{"_id":"dm-d1","type":"direct","participants":[{"_id":"me","name":"Observer","role":"Developer"},{"_id":"d1","name":"Alice","role":"Developer"}],"lastMessage":"Audio call started","unreadCount":0},{"_id":"dm-d2","type":"direct","participants":[{"_id":"me","name":"Observer","role":"Developer"},{"_id":"d2","name":"Bob","role":"Developer"}],"lastMessage":"Audio call started","unreadCount":0},{"_id":"dm-d3","type":"direct","participants":[{"_id":"me","name":"Observer","role":"Developer"},{"_id":"d3","name":"Charlie","role":"Developer"}],"lastMessage":"Audio call started","unreadCount":0}];conv.push({_id:'group',type:'group',channelType:'custom',name:'Team call',participants:[{_id:'me',name:'Observer'},{_id:'d1',name:'Alice'},{_id:'d2',name:'Bob'}]});const noop=()=>{};
function Fixture(){
  const [active,setActive]=React.useState(conv[0]._id);
  const [dialog,setDialog]=React.useState(false);
  window.selectTestConversation=setActive;
  window.openTestDialog=()=>setDialog(true);
  window.closeTestDialog=()=>setDialog(false);
  window.preferences=window.preferences||[];
  const onPreference=field=>window.preferences.push({conversationId:active,field});
  const conversation=conv.find(c=>c._id===active);
  if(new URLSearchParams(location.search).has('menu-layout')){
    const messages=Array.from({length:200},(_,i)=>({_id:'message-'+i,message:'Long conversation message '+i+' with enough text to overlap the menu region.',senderId:{_id:i%2?'me':'d1',name:i%2?'Observer':'Alice'},createdAt:'2026-11-20T10:00:00.000Z',seenBy:[]}));
    return React.createElement(React.Fragment,null,
      React.createElement('div',{'data-menu-scroll-host':true,style:{height:'calc(100dvh - 16px)',overflow:'auto',padding:'8px'}},
        React.createElement('div',{style:{height:'32px'}}),
        React.createElement('div',{className:'page-shell-enter grid grid-cols-1 lg:grid-cols-[350px_minmax(0,1fr)]',style:{height:'calc(100dvh - 80px)',overflow:'hidden'}},
          React.createElement(ChatSidebar,{conversations:conv,activeConversationId:active,currentUserId:'me',onlineUsers:['d1','d2','d3'],isOpen:false,onSelect:setActive,onSearch:noop,searchResults:[],onDelete:()=>{window.deletes++;},onClose:noop,onCreateDirect:noop,onCreateGroup:noop}),
          React.createElement(ChatWindow,{conversation,currentUser:{_id:'me',name:'Observer'},messages,typingUsers:[],onlineUsers:['d1','d2','d3'],onDelete:()=>{window.deletes++;},onToggleConversationPreference:onPreference,onToggleSidebar:noop,onSend:noop,onLoadOlder:noop})
        ),
        React.createElement('div',{style:{height:'300px'}})
      ),
      React.createElement(Dialog,{open:dialog,onOpenChange:setDialog},React.createElement(DialogContent,null,React.createElement(DialogTitle,null,'Synthetic layer dialog'),React.createElement(DialogDescription,null,'Checks the existing modal layer without changing chat data.')))
    );
  }
  return React.createElement('div',{style:{display:'grid',gridTemplateColumns:'350px 1fr',height:'900px'}},React.createElement(ChatSidebar,{conversations:conv,activeConversationId:active,currentUserId:'me',onlineUsers:['d1','d2','d3'],isOpen:false,onSelect:setActive,onSearch:noop,searchResults:[],onDelete:()=>{window.deletes++;},onClose:noop,onCreateDirect:noop,onCreateGroup:noop}),React.createElement(ChatHeader,{conversation,currentUserId:'me',onlineUsers:['d1','d2','d3'],onDelete:()=>{window.deletes++;},onToggleConversationPreference:onPreference,onToggleSidebar:noop}));
}
document.getElementById('root').classList.add('app-theme-root');document.getElementById('root').dataset.theme='light';
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
  const key = async (name, code, keyCode, modifiers = 0) => {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: name, code, windowsVirtualKeyCode: keyCode, modifiers, text: name === "Enter" ? "\r" : name === " " ? " " : undefined });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: name, code, windowsVirtualKeyCode: keyCode, modifiers });
  };
  const status=async()=>evaluate(dots+'.map(x=>({label:x.getAttribute("aria-label"),color:getComputedStyle(x.firstElementChild).backgroundColor}))');
  const emit=async(event,payload)=>evaluate('window.fakeChatSocket.server('+JSON.stringify(event)+','+JSON.stringify(payload)+')');
  const waitLabel=(index,label)=>waitFor(dots+'['+index+']?.getAttribute("aria-label")==='+JSON.stringify(label));
  assert.deepEqual((await status()).map(x=>x.label),['Online','Online','Online']);
  // Shadow colors vary with presence; preserve the dot size, border, and positioning.
  const geometry=await evaluate(dots+'.map(x=>({position:x.className,dot:x.firstElementChild.className.split(" ").filter(token=>!token.startsWith("shadow-")).join(" ").replace(/bg-[a-z]+-500/g,"COLOR"),height:x.firstElementChild.getBoundingClientRect().height,width:x.firstElementChild.getBoundingClientRect().width}))');
  await emit('presence:update',{userId:'d1',status:'idle'});await waitLabel(0,'Idle');
  await emit('call:presence',{presence:{d1:'in-call',d2:'in-group-call'}});
  await waitLabel(0,'In Call');await waitLabel(1,'In Group Call');
  assert.equal(await evaluate(header+'.getAttribute("aria-label")'),'In Call');
  assert.equal(await evaluate(header+'.getAttribute("title")'),'In Call');
  assert.deepEqual((await status()).map(x=>x.color),['rgb(239, 68, 68)','rgb(239, 68, 68)','rgb(16, 185, 129)']);
  assert.equal(await evaluate('getComputedStyle('+header+'.firstElementChild).backgroundColor'),'rgb(239, 68, 68)');
  // Regression: dark-theme surface selectors must not recolor semantic call dots.
  await evaluate('document.getElementById("root").classList.add("app-theme-root");document.getElementById("root").dataset.theme="dark"');
  assert.equal(await evaluate('getComputedStyle('+header+'.firstElementChild).backgroundColor'),'rgb(239, 68, 68)');
  assert.deepEqual((await status()).slice(0,2).map(x=>x.color),['rgb(239, 68, 68)','rgb(239, 68, 68)']);
  await evaluate('document.getElementById("root").dataset.theme="light"');

  assert.deepEqual(await evaluate(dots+'.map(x=>({position:x.className,dot:x.firstElementChild.className.split(" ").filter(token=>!token.startsWith("shadow-")).join(" ").replace(/bg-[a-z]+-500/g,"COLOR"),height:x.firstElementChild.getBoundingClientRect().height,width:x.firstElementChild.getBoundingClientRect().width}))'),geometry);
  // A normal online event cannot overwrite the per-user call overlay.
  await emit('presence:update',{userId:'d1',status:'active'});await waitLabel(0,'In Call');
  // Select the previously unselected call participant; both remain red.
  await evaluate('[...document.querySelectorAll("aside button")].find(x=>x.textContent.includes("Bob")).click()');
  await waitFor(header+'.getAttribute("aria-label")==="In Group Call"');
  assert.deepEqual((await status()).map(x=>x.color),['rgb(239, 68, 68)','rgb(239, 68, 68)','rgb(16, 185, 129)']);
  await emit('presence:update',{userId:'d1',status:'idle'});

  await emit('call:presence',{presence:{d1:'in-call',d2:'in-group-call'},presenting:{d1:true,d2:true}});
  await waitFor('document.querySelectorAll("aside [aria-label=Presenting]").length===2 && document.querySelector("header [aria-label=Presenting]")');
  assert.equal(await evaluate('document.querySelector("header [aria-label=Presenting]").getAttribute("title")'),'Presenting');
  assert.ok(await evaluate('Boolean(document.querySelector("header [aria-label=Presenting] svg.lucide-monitor-up"))'));
  assert.deepEqual((await status()).slice(0,2).map(x=>x.color),['rgb(239, 68, 68)','rgb(239, 68, 68)']);
  await emit('call:presence',{presence:{d1:'in-call',d2:'in-group-call'},presenting:{d1:true}});
  await waitFor('!document.querySelector("header [aria-label=Presenting]") && document.querySelectorAll("aside [aria-label=Presenting]").length===1');
  await emit('call:channel-active',{call:{callId:'group-call',conversationId:'group',scope:'group',activeParticipantIds:['d1']}});
  await evaluate('[...document.querySelectorAll("aside button")].find(x=>x.textContent.includes("Team call")).click()');
  await waitFor('document.querySelector("header [aria-label=Presenting]") && document.querySelector("header").textContent.includes("Alice")');
  assert.equal(await evaluate('getComputedStyle('+header+'.firstElementChild).backgroundColor'),'rgb(239, 68, 68)');
  await evaluate('[...document.querySelectorAll("aside button")].find(x=>x.textContent.includes("Bob")).click()');
  await waitFor('document.querySelector("header h1").textContent==="Bob"');

  await emit('call:presence',{presence:{}});await waitLabel(0,'Idle');await waitLabel(1,'Online');
  await waitFor('document.querySelectorAll("[aria-label=Presenting]").length===0');

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
  // Header deletion is not a clear-history action: offer no destructive substitute.
  const button = (label, scope = "") => `[...document.querySelectorAll(${JSON.stringify(scope + "button")})].find(x=>x.getAttribute("aria-label")===${JSON.stringify(label)})`;
  assert.equal(await evaluate('[...document.querySelectorAll("header button")].some(x=>x.title==="Delete chat")'),false);
  await evaluate(button("More actions", "header ")+".click()");
  await waitFor('document.getElementById("chat-actions-menu")?.contains(document.activeElement)');
  assert.equal(await evaluate('[...document.querySelectorAll("#chat-actions-menu button")].find(x=>x.textContent.includes("Clear Conversation")).disabled'),true);
  await evaluate('[...document.querySelectorAll("#chat-actions-menu button")].find(x=>x.textContent.includes("Clear Conversation")).click()');
  assert.equal(await evaluate('window.deletes'),0);assert.equal(await evaluate('window.confirmations'),0);
  await key("Escape", "Escape", 27);
  await waitFor("!document.getElementById(\"chat-actions-menu\")");
  // Exercise confirmation, loading, cancellation, and error recovery with synthetic history only.
  await evaluate(`window.originalClearAction=window.chatTestStore.getState().clearConversationHistory;
    window.clearAttempts=0;
    window.chatTestStore.setState({messagesByConversation:{'dm-d2':[{_id:'synthetic-history',message:'Call ended',createdAt:'2026-01-01T00:00:00Z'}]},
      clearConversationHistory:(id)=>{window.clearAttempts++;
        window.chatTestStore.setState({clearingByConversation:{[id]:true}});
        return new Promise((resolve,reject)=>{
          window.failSyntheticClear=()=>{window.chatTestStore.setState({clearingByConversation:{}});reject(new Error('Synthetic clear failure'));};
          window.finishSyntheticClear=()=>{window.chatTestStore.getState().applyConversationCleared({conversationId:id,clearedAt:'2026-11-20T10:00:00Z'});window.chatTestStore.setState({clearingByConversation:{}});resolve(true);};
        });
      }});`);
  const clearItem='[...document.querySelectorAll("#chat-actions-menu button")].find(x=>x.textContent.includes("Clear Conversation"))';
  const dialogButton=label=>'[...document.querySelectorAll(\'[role="dialog"] button\')].find(x=>x.textContent.trim()==='+JSON.stringify(label)+')';
  await evaluate(button("More actions", "header ")+".click()");
  await waitFor('document.getElementById("chat-actions-menu")');
  assert.equal(await evaluate(clearItem+'.disabled'),false);
  await evaluate(clearItem+'.click()');
  await waitFor('document.querySelector(\'[role="dialog"]\')');
  assert.ok(await evaluate('document.querySelector(\'[role="dialog"]\').textContent.includes("This clears the conversation history for you only. Other participants will keep their messages.")'));
  await evaluate(dialogButton('Cancel')+'.click()');
  await waitFor('!document.querySelector(\'[role="dialog"]\')');
  assert.equal(await evaluate('window.clearAttempts'),0);
  await evaluate(button("More actions", "header ")+".click()");
  await waitFor('document.getElementById("chat-actions-menu")');
  await evaluate(clearItem+'.click()');
  await waitFor('document.querySelector(\'[role="dialog"]\')');
  await evaluate(dialogButton('Clear Conversation')+'.click()');
  await waitFor('Boolean('+dialogButton('Clearing...')+')');
  assert.equal(await evaluate(dialogButton('Clearing...')+'.disabled'),true);
  await evaluate(dialogButton('Clearing...')+'.click()');
  assert.equal(await evaluate('window.clearAttempts'),1);
  await evaluate('window.failSyntheticClear()');
  await waitFor('document.querySelector(\'[role="alert"]\')?.textContent.includes("Synthetic clear failure")');
  assert.equal(await evaluate('window.chatTestStore.getState().messagesByConversation["dm-d2"].length'),1);
  await evaluate(dialogButton('Clear Conversation')+'.click()');
  await waitFor('window.clearAttempts===2');
  await evaluate('window.finishSyntheticClear()');
  await waitFor('!document.querySelector(\'[role="dialog"]\')');
  assert.equal(await evaluate('window.chatTestStore.getState().messagesByConversation["dm-d2"].length'),0);
  await evaluate('window.chatTestStore.setState({clearConversationHistory:window.originalClearAction})');
  // Exercise the unchanged video action with generated media and a rejected fake socket call.
  assert.ok(await evaluate('Boolean(('+button("Start video call", "header ")+').querySelector("svg.lucide-video"))'));
  await evaluate(button("Start video call", "header ")+".click()");
  await waitFor('window.callEmissions.some(x=>x.event==="call:start" && x.payload.callType==="video")');
  assert.ok(await evaluate('Boolean(window.mediaRequests.at(-1).video)'));
  // A synthetic group-call UI lets us exercise the browser Stop sharing callback
  // using a canvas track; no hardware capture or real calls are involved.
  await emit('call:outgoing',{callId:'cccccccccccccccccccccccc',conversationId:'synthetic-group',scope:'group',callType:'video',caller:{_id:'me'},createdBy:'me',participants:[]});
  await waitFor(button("Share screen"));
  assert.equal(await evaluate(button("Start video call", "header ")+".disabled"),true);
  await evaluate(button("Share screen")+".click()");
  await waitFor('window.callEmissions.some(x=>x.event==="call:screen-share-started") && typeof window.displayTrack?.onended==="function"');
  await evaluate('window.displayTrack.onended()');
  await waitFor('window.callEmissions.some(x=>x.event==="call:screen-share-stopped") && !window.serverPresenting.me');
  await emit('call:ended',{callId:'cccccccccccccccccccccccc',conversationId:'synthetic-group'});

  // Real ChatWindow: backdrop-filter bubbles, transformed page shell, overflow
  // ancestors, a long scrollable list, and the actual composer.
  await send('Page.navigate',{url:origin+'/__chat-presence-test?menu-layout'});
  await waitFor('document.querySelector("header button[aria-haspopup=menu]") && document.querySelectorAll(".whitespace-pre-wrap").length===200');
  const trigger='document.getElementById("chat-actions-trigger")';
  const menu='document.getElementById("chat-actions-menu")';
  const settle=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const openMenu=async()=>{
    await evaluate(trigger+'.click()');
    await waitFor(menu+' && getComputedStyle('+menu+').opacity==="1" && '+menu+'.contains(document.activeElement)');
    await settle();
  };
  const checkMenu=async()=>{
    const geometry=await evaluate('(()=>{const m='+menu+';const r=m.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,z:getComputedStyle(m).zIndex,portal:!m.closest("header"),covered:[...m.querySelectorAll("[role=menuitem]")].filter(x=>x.getBoundingClientRect().top>=r.top&&x.getBoundingClientRect().bottom<=r.bottom).some(x=>{const b=x.getBoundingClientRect();return !m.contains(document.elementFromPoint(b.left+b.width/2,b.top+b.height/2));})}})()');
    assert.ok(geometry.portal);
    assert.equal(geometry.z,'45');
    assert.ok(geometry.left>=11&&geometry.right<=geometry.width-11,JSON.stringify(geometry));
    assert.ok(geometry.top>=11&&geometry.bottom<=geometry.height-11,JSON.stringify(geometry));
    assert.equal(geometry.covered,false,'messages/composer must not cover any visible menu option');
    assert.deepEqual(await evaluate('[...'+menu+'.querySelectorAll("[role=menuitem]")].map(x=>x.textContent.trim())'),['Pin chat','Star chat','Archive chat','Clear Conversation']);
    assert.equal(await evaluate(menu+'.querySelector("[role=menuitem]:disabled").textContent.trim()'),'Clear Conversation');
  };
  await openMenu();await checkMenu();
  assert.equal(await evaluate('document.activeElement.textContent.trim()'),'Pin chat');
  await key('ArrowDown','ArrowDown',40);assert.equal(await evaluate('document.activeElement.textContent.trim()'),'Star chat');
  await key('End','End',35);assert.equal(await evaluate('document.activeElement.textContent.trim()'),'Archive chat');
  await key('Home','Home',36);assert.equal(await evaluate('document.activeElement.textContent.trim()'),'Pin chat');
  await key('Escape','Escape',27);await waitFor('!'+menu);
  assert.equal(await evaluate('document.activeElement.id'),'chat-actions-trigger');
  await key('ArrowUp','ArrowUp',38);await waitFor(menu);await settle();
  assert.equal(await evaluate('document.activeElement.textContent.trim()'),'Archive chat');
  await key('Escape','Escape',27);await waitFor('!'+menu);
  await openMenu();
  // Parent scrolling moves the anchor; message scrolling does not close the menu.
  const beforeTop=await evaluate(menu+'.getBoundingClientRect().top');
  await evaluate('document.querySelector("[data-menu-scroll-host]").scrollTop+=20');await settle();
  await waitFor('Math.abs('+menu+'.getBoundingClientRect().top-('+trigger+'.getBoundingClientRect().bottom+8))<2');
  assert.ok((await evaluate(menu+'.getBoundingClientRect().top'))<beforeTop);
  await evaluate('document.querySelector("section .dashboard-scrollbar").scrollTop=0');await settle();await checkMenu();
  // Real Radix dialogs remain above the portal, and Escape belongs to the dialog.
  await evaluate('window.openTestDialog()');
  await waitFor('document.querySelector("[role=dialog]")?.contains(document.activeElement)');
  assert.ok(await evaluate('(()=>{const r='+menu+'.getBoundingClientRect();const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !'+menu+'.contains(hit)})()'));
  await key('Escape','Escape',27);await waitFor('!document.querySelector("[role=dialog]")');
  await checkMenu();
  // Actual call overlay UI, driven solely by a synthetic socket event.
  await emit('call:outgoing',{callId:'synthetic-overlay',conversationId:'synthetic-overlay',scope:'group',callType:'audio',caller:{_id:'me'},createdBy:'me',participants:[]});
  await waitFor('[...document.querySelectorAll(".fixed")].some(x=>getComputedStyle(x).zIndex==="75")');
  assert.ok(await evaluate('(()=>{const layer=[...document.querySelectorAll(".fixed")].find(x=>getComputedStyle(x).zIndex==="75");const r='+menu+'.getBoundingClientRect();return layer.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))})()'));
  await emit('call:ended',{callId:'synthetic-overlay',conversationId:'synthetic-overlay'});
  await waitFor('![...document.querySelectorAll(".fixed")].some(x=>getComputedStyle(x).zIndex==="75")');
  for(const [width,height] of [[1024,700],[768,600],[375,500],[375,240]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await waitFor('(()=>{const m='+menu+';if(!m)return false;const r=m.getBoundingClientRect();return r.left>=11 && r.right<=innerWidth-11 && r.top>=11 && r.bottom<=innerHeight-11})()');
    await settle();await checkMenu();
  }
  // Theme inheritance remains intact when the menu is portalled outside the app.
  await evaluate('document.getElementById("root").dataset.theme="dark"');
  await waitFor(menu+'.parentElement.dataset.theme==="dark"');
  await waitFor('getComputedStyle('+menu+').backgroundColor==="rgb(15, 23, 42)"');
  await evaluate('document.body.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}))');await waitFor('!'+menu);
  await openMenu();await key('Tab','Tab',9);await waitFor('!'+menu);
  await openMenu();await evaluate('window.selectTestConversation("dm-d2")');await waitFor('!'+menu+' && document.querySelector("header h1").textContent==="Bob"');
  await openMenu();await key('Enter','Enter',13);await waitFor('!'+menu);
  assert.deepEqual(await evaluate('window.preferences.at(-1)'),{conversationId:'dm-d2',field:'isPinned'});
  assert.equal(await evaluate('window.deletes'),0);assert.equal(await evaluate('window.confirmations'),0);

});
