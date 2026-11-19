import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import {
  ACTIVE_SPRINT_TASK_FILTER,
  MY_SPRINT_TASKS_PATH,
  calculateSprintTaskProgress,
  selectMyActiveSprintTasks,
} from "../src/lib/sprint-task-progress.js";

const task = (id, overrides = {}) => ({
  _id: id, title: id, type: "Task", status: "TODO", priority: "Medium",
  assignee: { _id: "dev", name: "Developer" }, projectId: { _id: "p1", name: "One" },
  sprintId: { _id: "s1", state: "ACTIVE" }, ...overrides,
});
const issues = [
  task("done-task", { status: "DONE" }),
  task("done-subtask", { type: "Sub-task", status: "CLOSED", projectId: { _id: "p2", name: "Two" }, sprintId: { _id: "s2", status: "ACTIVE" }, assignee: null, assignees: [{ _id: "dev", name: "Developer" }] }),
  task("open-task"),
  task("other-developer", { assignee: { _id: "other" } }),
  task("planned-task", { sprintId: { state: "PLANNED" } }),
  task("completed-sprint", { sprintId: { state: "COMPLETED" } }),
  task("backlog-task", { sprintId: null }),
  task("unpopulated-sprint", { sprintId: "s1" }),
  task("lowercase-state", { sprintId: { state: "active" } }),
  task("assigned-story", { type: "Story" }),
  task("assigned-bug", { type: "Bug" }),
];

test("sprint progress preserves assigned Task/Sub-task counts and rounding across sprints", () => {
  const selected = selectMyActiveSprintTasks(issues, "dev");
  assert.deepEqual(selected.map((issue) => issue._id), ["done-task", "done-subtask", "open-task"]);
  assert.deepEqual(calculateSprintTaskProgress(selected), { completed: 2, total: 3, percentage: 67, hasActiveSprint: true });
  assert.deepEqual(selectMyActiveSprintTasks(issues, undefined), []);
  assert.equal(new URL(MY_SPRINT_TASKS_PATH, "http://localhost").searchParams.get("filter"), ACTIVE_SPRINT_TASK_FILTER);
});

test("empty metric and stored ACTIVE lifecycle behavior are unchanged", () => {
  assert.deepEqual(calculateSprintTaskProgress([]), { completed: 0, total: 0, percentage: 0, hasActiveSprint: false });
  const expired = task("expired", { status: "RESOLVED", sprintId: { state: "ACTIVE", lifecycleState: "EXPIRED", endDate: "2000-01-01" } });
  assert.equal(calculateSprintTaskProgress([expired]).percentage, 100);
});

// No browser-testing dependency: exercise native link keyboard navigation via Chrome CDP.
const chrome = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium",
].find((candidate) => existsSync(candidate));

test("widget empty/populated states, keyboard navigation, and actual TasksPage destination", {
  skip: chrome ? false : "Set CHROME_PATH to run the real-browser checks", timeout: 90000,
}, async (t) => {
  const profile = await mkdtemp(path.join(tmpdir(), "sprint-widget-test-"));
  const requests = [];
  let browser;
  let socket;
  const server = await createServer({
    appType: "custom",
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
      res.end(JSON.stringify(req.url.startsWith("/api/issues/my") ? issues : []));
      return;
    }
    if (!req.url.startsWith("/__sprint-widget-test")) return next();
    const html = `<!doctype html><html><body><div id="root"></div><script type="module">
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { MemoryRouter, Routes, Route } from 'react-router-dom';
      import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
      import { AuthContext } from '/src/context/AuthContext.jsx';
      import Widget from '/src/components/dashboard/SprintProgressWidget.jsx';
      import TasksPage from '/src/pages/TasksPage.jsx';
      import { calculateSprintTaskProgress, selectMyActiveSprintTasks } from '/src/lib/sprint-task-progress.js';
      const issues = ${JSON.stringify(issues)};
      const params = new URLSearchParams(location.search);
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
      client.setQueryData(['projects'], [{ _id: 'p1', name: 'One' }, { _id: 'p2', name: 'Two' }]);
      client.setQueryData(['work-permissions'], {});
      const metrics = calculateSprintTaskProgress(params.has('empty') ? [] : selectMyActiveSprintTasks(issues, 'dev'));
      createRoot(document.getElementById('root')).render(
        React.createElement(QueryClientProvider, { client },
          React.createElement(AuthContext.Provider, { value: { role: 'Developer', user: { _id: 'dev' } } },
            React.createElement(MemoryRouter, { initialEntries: ['/widget'] },
              React.createElement(Routes, null,
                React.createElement(Route, { path: '/widget', element: React.createElement(Widget, { metrics, isLoading: params.has('loading') }) }),
                React.createElement(Route, { path: '/tasks', element: React.createElement(TasksPage) })
              )
            )
          )
        )
      );
    </script></body></html>`;
    res.setHeader("Content-Type", "text/html");
    res.end(await server.transformIndexHtml(req.url, html));
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
      if (await evaluate(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.fail(`Browser condition timed out: ${expression}; body: ${await evaluate("document.body.innerText")}`);
  };
  const key = async (name, code, keyCode) => {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: name, code, windowsVirtualKeyCode: keyCode });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: name, code, windowsVirtualKeyCode: keyCode });
  };

  await send("Page.navigate", { url: `${origin}/__sprint-widget-test?empty` });
  await waitFor("document.body.innerText.includes('No assigned tasks in active sprints')");
  assert.match(await evaluate("document.body.innerText"), /My Sprint Task Progress/);
  assert.equal(await evaluate("document.querySelector('a').textContent"), "View My Tasks");
  assert.equal(await evaluate("document.querySelector('a').getAttribute('href')"), "/tasks");

  await send("Page.navigate", { url: `${origin}/__sprint-widget-test?loading` });
  await waitFor("document.querySelectorAll('.animate-pulse').length === 3");
  assert.equal(await evaluate("document.querySelectorAll('a').length"), 0);

  await send("Page.navigate", { url: `${origin}/__sprint-widget-test` });
  await waitFor("document.body.innerText.includes('2 / 3 Tasks Completed')");
  assert.match(await evaluate("document.body.innerText"), /67%/);
  assert.equal(await evaluate("document.querySelector('a').getAttribute('href')"), MY_SPRINT_TASKS_PATH);
  await key("Tab", "Tab", 9);
  assert.equal(await evaluate("document.activeElement.tagName"), "A");
  await key("Enter", "Enter", 13);
  await waitFor("document.body.innerText.includes('My Sprint Tasks') && document.body.innerText.includes('done-subtask')");
  const body = await evaluate("document.body.innerText");
  for (const issue of issues.slice(0, 3)) assert.ok(body.includes(issue.title), issue.title);
  for (const issue of issues.slice(3)) assert.ok(!body.includes(issue.title), issue.title);
  assert.ok(requests.includes("/api/issues/my?sortBy=recently-updated"));
  assert.ok(!requests.some((url) => url.includes("teamProgress") || url.includes("/sprints")));
});
