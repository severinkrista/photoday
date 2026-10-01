"use strict";
(() => {
  // src/model.ts
  var DEFAULT_TASK_TYPES = [
    { code: "\u0423", description: "\u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0447\u0435\u0441\u043A\u0438\u0435 \u0437\u0430\u0434\u0430\u0447\u0438" },
    { code: "\u0420", description: "\u0440\u0443\u0442\u0438\u043D\u0430, \u0440\u044F\u0434\u043E\u0432\u044B\u0435 \u0440\u0430\u0431\u043E\u0447\u0438\u0435 \u0437\u0430\u0434\u0430\u0447\u0438" },
    { code: "\u041E\u041A", description: "\u0437\u0430\u0434\u0430\u0447\u0438 \u043A\u0430\u0441\u0430\u044E\u0449\u0438\u0435\u0441\u044F \u0432\u0441\u0435\u0439 \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u0438 \u0432 \u0446\u0435\u043B\u043E\u043C, \u043D\u0435 \u0442\u043E\u043B\u044C\u043A\u043E \u043C\u043E\u0438\u043C \u0434\u0435\u043F\u0430\u0440\u0442\u0430\u043C\u0435\u043D\u0442\u043E\u043C" },
    { code: "\u041B", description: "\u043B\u0438\u0447\u043D\u044B\u0435 \u0437\u0430\u0434\u0430\u0447\u0438, \u043D\u0435 \u043A\u0430\u0441\u0430\u044E\u0449\u0438\u0435\u0441\u044F \u0440\u0430\u0431\u043E\u0447\u0438\u0445 \u0432\u043E\u043F\u0440\u043E\u0441\u043E\u0432" },
    { code: "\u0417\u041F", description: "\u0437\u0430\u0434\u0430\u0447\u0438, \u0441\u0432\u044F\u0437\u0430\u043D\u043D\u044B\u0435 \u0441 \u0437\u0430\u0440\u043F\u043B\u0430\u0442\u043E\u0439 \u0438\u043B\u0438 \u043F\u0440\u0435\u043C\u0438\u0435\u0439 \u043C\u043E\u0438\u0445 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u043E\u0432" },
    { code: "\u0413\u041A", description: "\u0437\u0430\u0434\u0430\u0447\u0438, \u0441\u0432\u044F\u0437\u0430\u043D\u043D\u044B\u0435 \u0441 \u0433\u043E\u0441\u0443\u0434\u0430\u0440\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u043C\u0438 \u043A\u043E\u043D\u043A\u0442\u0440\u0430\u043A\u0442\u0430\u043C\u0438" },
    { code: "\u041A\u041A", description: "\u0437\u0430\u0434\u0430\u0447\u0438 \u041A\u0440\u0438\u0441\u0442\u0430\u041A\u043E\u043C\u0430\u043D\u0434\u044B (\u0442\u0440\u0435\u043D\u0438\u043D\u0433\u0438 \u0432 \u043D\u0430\u0448\u0435\u0439 \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u0438, \u0432\u044B\u0435\u0437\u0434\u043D\u044B\u0435 \u043C\u0435\u0440\u043E\u043F\u0440\u0438\u044F\u0442\u0438\u044F \u0438 \u0442.\u043F.)" }
  ];
  var DEFAULT_SETTINGS = { displayMode: "tasks", tasksToShow: 10, daysToShow: 2, diskPath: "disk:/\u041A\u0440\u0438\u0441\u0442\u0430/\u041F\u0440\u043E\u0433\u0440\u0430\u043C\u043C\u044B/photoday/photoday.xlsx", taskTypes: DEFAULT_TASK_TYPES };

  // src/storage.ts
  var storage = globalThis.browser?.storage?.local ?? globalThis.chrome?.storage?.local;
  async function get(key, fallback) {
    if (storage) {
      const r = await storage.get(key);
      return r[key] ?? fallback;
    }
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  }
  async function set(key, value) {
    if (storage) {
      await storage.set({ [key]: value });
      return;
    }
    localStorage.setItem(key, JSON.stringify(value));
  }
  async function getSettings() {
    const s = await get("settings", {});
    const mode = s.displayMode === "days" ? "days" : "tasks";
    const tasks = Number(s.tasksToShow);
    const days = Number(s.daysToShow);
    return {
      displayMode: mode,
      tasksToShow: Number.isFinite(tasks) && tasks > 0 ? Math.floor(tasks) : DEFAULT_SETTINGS.tasksToShow,
      daysToShow: Number.isFinite(days) && days > 0 ? Math.floor(days) : DEFAULT_SETTINGS.daysToShow,
      diskPath: typeof s.diskPath === "string" && s.diskPath.trim() ? s.diskPath : DEFAULT_SETTINGS.diskPath,
      taskTypes: Array.isArray(s.taskTypes) && s.taskTypes.length ? s.taskTypes : DEFAULT_SETTINGS.taskTypes.map((x) => ({ ...x }))
    };
  }
  async function clearLocalData() {
    if (storage) {
      await storage.clear();
      return;
    }
    localStorage.clear();
  }
  async function saveSettings(s) {
    await set("settings", s);
  }
  async function getToken() {
    return get("token", null);
  }
  async function saveToken(t) {
    await set("token", t);
  }

  // src/yandex.ts
  var CLIENT_ID = "f4ce4570ab454ee38f6792c37e61811d";
  var REDIRECT = "https://oauth.yandex.ru/verification_code";
  var SCOPE = "cloud_api:disk.read cloud_api:disk.write";
  function random(n = 48) {
    return [...crypto.getRandomValues(new Uint8Array(n))].map((x) => (x % 36).toString(36)).join("");
  }
  async function challenge(v) {
    const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
    return btoa(String.fromCharCode(...new Uint8Array(d))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  async function connectToYandex() {
    const verifier = random(), state = random(32), url = new URL("https://oauth.yandex.ru/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", CLIENT_ID);
    url.searchParams.set("redirect_uri", REDIRECT);
    url.searchParams.set("scope", SCOPE);
    url.searchParams.set("code_challenge", await challenge(verifier));
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", state);
    url.searchParams.set("force_confirm", "yes");
    window.open(url.toString(), "_blank");
    const code = window.prompt("\u041F\u043E\u0441\u043B\u0435 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u0438 \u0432\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u0441\u044E\u0434\u0430 \u043A\u043E\u0434 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F \u042F\u043D\u0434\u0435\u043A\u0441 OAuth:");
    if (!code?.trim()) throw new Error("\u0410\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u044F \u043E\u0442\u043C\u0435\u043D\u0435\u043D\u0430.");
    const body = new URLSearchParams({ grant_type: "authorization_code", code: code.trim(), client_id: CLIENT_ID, redirect_uri: REDIRECT, code_verifier: verifier });
    const r = await fetch("https://oauth.yandex.ru/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    if (!r.ok) throw new Error("\u042F\u043D\u0434\u0435\u043A\u0441 OAuth: HTTP " + r.status + " " + await r.text());
    const j = await r.json();
    if (!j.access_token) throw new Error("\u042F\u043D\u0434\u0435\u043A\u0441 OAuth \u043D\u0435 \u0432\u0435\u0440\u043D\u0443\u043B access_token.");
    await saveToken(j.access_token);
  }
  async function api(url, init2 = {}) {
    const token = await getToken();
    if (!token) throw new Error("\u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A \u043D\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0451\u043D.");
    const h = new Headers(init2.headers);
    h.set("Authorization", "OAuth " + token);
    const r = await fetch(url, { ...init2, headers: h });
    if (r.status === 401) throw new Error("\u0422\u043E\u043A\u0435\u043D \u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A\u0430 \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u0435\u043D. \u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u0435 \u0430\u043A\u043A\u0430\u0443\u043D\u0442 \u0437\u0430\u043D\u043E\u0432\u043E.");
    return r;
  }
  async function href(op, path, extra = "") {
    const r = await api("https://cloud-api.yandex.net/v1/disk/" + op + "?path=" + encodeURIComponent(path) + extra);
    if (!r.ok) throw new Error("\u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A: HTTP " + r.status + " " + await r.text());
    const j = await r.json();
    if (!j.href) throw new Error("\u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A \u043D\u0435 \u0432\u0435\u0440\u043D\u0443\u043B \u0441\u0441\u044B\u043B\u043A\u0443 \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u0438.");
    return j.href;
  }
  async function downloadWorkbook(s) {
    const r = await api(await href("resources/download", s.diskPath));
    if (!r.ok) throw new Error("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043A\u0430\u0447\u0430\u0442\u044C XLSX: HTTP " + r.status);
    return r.arrayBuffer();
  }
  async function folderExists(path) {
    const r = await api("https://cloud-api.yandex.net/v1/disk/resources?path=" + encodeURIComponent(path));
    if (r.status === 404) return false;
    if (!r.ok) throw new Error("\u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A: HTTP " + r.status + " " + await r.text());
    return (await r.json()).type === "dir";
  }
  async function testConnection(s) {
    const b = await downloadWorkbook(s);
    if (!b.byteLength) throw new Error("\u041E\u0441\u043D\u043E\u0432\u043D\u043E\u0439 XLSX-\u0444\u0430\u0439\u043B \u043F\u0443\u0441\u0442\u043E\u0439.");
    const f = s.diskPath.substring(0, s.diskPath.lastIndexOf("/")) + "/attached";
    return { filePath: s.diskPath, attachmentFolder: f, attachmentFolderExists: await folderExists(f) };
  }

  // src/settings.ts
  var settings;
  var $ = (id) => document.getElementById(id);
  async function init() {
    try {
      settings = await getSettings();
      render();
      $("save").onclick = () => void save();
      $("connect").onclick = () => void connect();
      $("testConnection").onclick = () => void test();
      $("clearCache").onclick = () => void clearCache();
      $("addType").onclick = () => {
        syncTypesFromDom();
        settings.taskTypes.push({ code: "\u041D\u043E\u0432\u044B\u0439", description: "" });
        render();
      };
      $("modeTasks").onchange = () => {
        syncDisplayValue();
        syncTypesFromDom();
        settings.displayMode = "tasks";
        render();
      };
      $("modeDays").onchange = () => {
        syncDisplayValue();
        syncTypesFromDom();
        settings.displayMode = "days";
        render();
      };
    } catch (e) {
      $("status").textContent = "\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043A: " + (e instanceof Error ? e.message : String(e));
    }
  }
  function syncDisplayValue() {
    const n = Math.max(1, Number($("tasks").value) || 1);
    if (settings.displayMode === "tasks") settings.tasksToShow = n;
    else settings.daysToShow = n;
  }
  function syncTypesFromDom() {
    if (!settings) return;
    settings.taskTypes = Array.from(document.querySelectorAll(".type-row")).map((r) => ({ code: r.querySelector('[data-role="code"]').value.trim(), description: r.querySelector('[data-role="description"]').value.trim() }));
  }
  function render() {
    $("diskPath").setAttribute("value", settings.diskPath);
    $("diskPath").value = settings.diskPath;
    const n = settings.displayMode === "tasks" ? settings.tasksToShow : settings.daysToShow;
    $("tasks").value = String(n);
    $("modeTasks").checked = settings.displayMode === "tasks";
    $("modeDays").checked = settings.displayMode === "days";
    $("displayNumberLabel").textContent = settings.displayMode === "tasks" ? "\u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E \u0437\u0430\u0434\u0430\u0447" : "\u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E \u0434\u043D\u0435\u0439";
    const root = $("types");
    root.innerHTML = "";
    settings.taskTypes.forEach((t, i) => {
      const row = document.createElement("div");
      row.className = "type-row";
      const code = document.createElement("input");
      code.value = t.code;
      code.dataset.role = "code";
      const desc = document.createElement("input");
      desc.value = t.description;
      desc.dataset.role = "description";
      const del = document.createElement("button");
      del.type = "button";
      del.textContent = "\u0423\u0434\u0430\u043B\u0438\u0442\u044C";
      del.onclick = () => {
        syncTypesFromDom();
        settings.taskTypes.splice(i, 1);
        render();
      };
      row.append(code, desc, del);
      root.append(row);
    });
  }
  function collectSettings() {
    syncDisplayValue();
    syncTypesFromDom();
    const diskPath = $("diskPath").value.trim();
    const tasksToShow = Math.max(1, Number($("tasks").value) || 10);
    const daysToShow = Math.max(1, settings.daysToShow || 2);
    const displayMode = $("modeDays").checked ? "days" : "tasks";
    const taskTypes = settings.taskTypes.map((t) => ({ code: t.code.trim(), description: t.description.trim() }));
    if (!diskPath) throw new Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043F\u043E\u043B\u043D\u044B\u0439 \u043F\u0443\u0442\u044C \u043A XLSX.");
    if (!taskTypes.length) throw new Error("\u0414\u043E\u0431\u0430\u0432\u044C\u0442\u0435 \u0445\u043E\u0442\u044F \u0431\u044B \u043E\u0434\u0438\u043D \u0442\u0438\u043F \u0437\u0430\u0434\u0430\u0447\u0438.");
    if (taskTypes.some((t) => !t.code)) throw new Error("\u0423 \u043A\u0430\u0436\u0434\u043E\u0433\u043E \u0442\u0438\u043F\u0430 \u0437\u0430\u0434\u0430\u0447\u0438 \u0434\u043E\u043B\u0436\u0435\u043D \u0431\u044B\u0442\u044C \u0443\u043A\u0430\u0437\u0430\u043D \u043A\u043E\u0434.");
    const codes = taskTypes.map((t) => t.code.toLocaleLowerCase());
    if (new Set(codes).size !== codes.length) throw new Error("\u041A\u043E\u0434\u044B \u0442\u0438\u043F\u043E\u0432 \u0437\u0430\u0434\u0430\u0447 \u043D\u0435 \u0434\u043E\u043B\u0436\u043D\u044B \u043F\u043E\u0432\u0442\u043E\u0440\u044F\u0442\u044C\u0441\u044F.");
    return { displayMode, tasksToShow: displayMode === "tasks" ? tasksToShow : settings.tasksToShow, daysToShow: displayMode === "days" ? tasksToShow : daysToShow, diskPath, taskTypes };
  }
  async function clearCache() {
    if (!confirm("\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u0438\u044F? \u0411\u0443\u0434\u0443\u0442 \u0443\u0434\u0430\u043B\u0435\u043D\u044B \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438, \u0442\u043E\u043A\u0435\u043D \u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A\u0430 \u0438 \u043E\u0447\u0435\u0440\u0435\u0434\u044C \u043D\u0435\u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043D\u044B\u0445 \u0437\u0430\u0434\u0430\u0447. \u0414\u0430\u043D\u043D\u044B\u0435 \u0432 XLSX \u043D\u0430 \u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A\u0435 \u043D\u0435 \u0443\u0434\u0430\u043B\u044F\u044E\u0442\u0441\u044F.")) return;
    try {
      await clearLocalData();
      settings = await getSettings();
      render();
      $("connectionStatus").textContent = "\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u0441\u0431\u0440\u043E\u0448\u0435\u043D\u044B. \u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u0435 \u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A \u0437\u0430\u043D\u043E\u0432\u043E \u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438.";
      $("testResult").textContent = "";
      $("status").textContent = "\u041A\u044D\u0448 \u0438 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u0441\u0431\u0440\u043E\u0448\u0435\u043D\u044B.";
    } catch (e) {
      $("status").textContent = "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435: " + (e instanceof Error ? e.message : String(e));
    }
  }
  async function save() {
    try {
      settings = collectSettings();
      await saveSettings(settings);
      $("status").textContent = "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u044B.";
    } catch (e) {
      $("status").textContent = "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438: " + (e instanceof Error ? e.message : String(e));
    }
  }
  async function connect() {
    $("connect").disabled = true;
    try {
      await connectToYandex();
      $("connectionStatus").textContent = "\u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0451\u043D. \u0422\u0435\u043F\u0435\u0440\u044C \u043C\u043E\u0436\u043D\u043E \u0432\u044B\u043F\u043E\u043B\u043D\u0438\u0442\u044C \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F.";
    } catch (e) {
      $("connectionStatus").textContent = "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u044C\u0441\u044F: " + (e instanceof Error ? e.message : String(e));
    } finally {
      $("connect").disabled = false;
    }
  }
  async function test() {
    $("testConnection").disabled = true;
    $("testResult").textContent = "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430...";
    try {
      const current = collectSettings();
      const r = await testConnection(current);
      $("testResult").textContent = r.attachmentFolderExists ? "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442. \u041E\u0441\u043D\u043E\u0432\u043D\u043E\u0439 \u0444\u0430\u0439\u043B \u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D. \u041F\u0430\u043F\u043A\u0430 \u0432\u043B\u043E\u0436\u0435\u043D\u0438\u0439 \u043D\u0430\u0439\u0434\u0435\u043D\u0430." : "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442. \u041E\u0441\u043D\u043E\u0432\u043D\u043E\u0439 \u0444\u0430\u0439\u043B \u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D. \u041F\u0430\u043F\u043A\u0430 \u0432\u043B\u043E\u0436\u0435\u043D\u0438\u0439 \u043F\u043E\u043A\u0430 \u043D\u0435 \u0441\u043E\u0437\u0434\u0430\u043D\u0430.";
    } catch (e) {
      $("testResult").textContent = "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u043D\u0435 \u043F\u0440\u043E\u0439\u0434\u0435\u043D\u0430: " + (e instanceof Error ? e.message : String(e));
    } finally {
      $("testConnection").disabled = false;
    }
  }
  void init();
})();
