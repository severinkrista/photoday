"use strict";
(() => {
  // src/model.ts
  function isHttpUrl(value) {
    return /^https?:\/\/\S+$/i.test(value.trim());
  }
  var DEFAULT_TASK_TYPES = [
    { code: "\u0423", description: "\u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0447\u0435\u0441\u043A\u0438\u0435 \u0437\u0430\u0434\u0430\u0447\u0438" },
    { code: "\u0420", description: "\u0440\u0443\u0442\u0438\u043D\u0430, \u0440\u044F\u0434\u043E\u0432\u044B\u0435 \u0440\u0430\u0431\u043E\u0447\u0438\u0435 \u0437\u0430\u0434\u0430\u0447\u0438" },
    { code: "\u041E\u041A", description: "\u0437\u0430\u0434\u0430\u0447\u0438 \u043A\u0430\u0441\u0430\u044E\u0449\u0438\u0435\u0441\u044F \u0432\u0441\u0435\u0439 \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u0438 \u0432 \u0446\u0435\u043B\u043E\u043C, \u043D\u0435 \u0442\u043E\u043B\u044C\u043A\u043E \u043C\u043E\u0438\u043C \u0434\u0435\u043F\u0430\u0440\u0442\u0430\u043C\u0435\u043D\u0442\u043E\u043C" },
    { code: "\u041B", description: "\u043B\u0438\u0447\u043D\u044B\u0435 \u0437\u0430\u0434\u0430\u0447\u0438, \u043D\u0435 \u043A\u0430\u0441\u0430\u044E\u0449\u0438\u0435\u0441\u044F \u0440\u0430\u0431\u043E\u0447\u0438\u0445 \u0432\u043E\u043F\u0440\u043E\u0441\u043E\u0432" },
    { code: "\u0417\u041F", description: "\u0437\u0430\u0434\u0430\u0447\u0438, \u0441\u0432\u044F\u0437\u0430\u043D\u043D\u044B\u0435 \u0441 \u0437\u0430\u0440\u043F\u043B\u0430\u0442\u043E\u0439 \u0438\u043B\u0438 \u043F\u0440\u0435\u043C\u0438\u0435\u0439 \u043C\u043E\u0438\u0445 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u043E\u0432" },
    { code: "\u0413\u041A", description: "\u0437\u0430\u0434\u0430\u0447\u0438, \u0441\u0432\u044F\u0437\u0430\u043D\u043D\u044B\u0435 \u0441 \u0433\u043E\u0441\u0443\u0434\u0430\u0440\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u043C\u0438 \u043A\u043E\u043D\u043A\u0442\u0440\u0430\u043A\u0442\u0430\u043C\u0438" },
    { code: "\u041A\u041A", description: "\u0437\u0430\u0434\u0430\u0447\u0438 \u041A\u0440\u0438\u0441\u0442\u0430\u041A\u043E\u043C\u0430\u043D\u0434\u044B (\u0442\u0440\u0435\u043D\u0438\u043D\u0433\u0438 \u0432 \u043D\u0430\u0448\u0435\u0439 \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u0438, \u0432\u044B\u0435\u0437\u0434\u043D\u044B\u0435 \u043C\u0435\u0440\u043E\u043F\u0440\u0438\u044F\u0442\u0438\u044F \u0438 \u0442.\u043F.)" }
  ];
  var DEFAULT_REMINDERS = { enabled: true, from: "09:00", to: "18:00", every: 1, unit: "hours" };
  var DEFAULT_SETTINGS = { displayMode: "tasks", tasksToShow: 10, daysToShow: 2, diskPath: "disk:/\u041A\u0440\u0438\u0441\u0442\u0430/\u041F\u0440\u043E\u0433\u0440\u0430\u043C\u043C\u044B/photoday/photoday.xlsx", taskTypes: DEFAULT_TASK_TYPES, reminders: DEFAULT_REMINDERS, fileUrl: "" };

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
      fileUrl: typeof s.fileUrl === "string" ? s.fileUrl.trim() : "",
      taskTypes: Array.isArray(s.taskTypes) && s.taskTypes.length ? s.taskTypes : DEFAULT_SETTINGS.taskTypes.map((x) => ({ ...x })),
      reminders: normalizeReminders(s.reminders)
    };
  }
  function normalizeReminders(value) {
    const clock = (v, fallback) => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.trim()) ? v.trim() : fallback;
    const unit = value?.unit === "minutes" ? "minutes" : "hours";
    const rawEvery = Number(value?.every);
    const limit = unit === "minutes" ? 1440 : 24;
    const every = Number.isFinite(rawEvery) && rawEvery >= 1 ? Math.min(Math.floor(rawEvery), limit) : DEFAULT_REMINDERS.every;
    return {
      enabled: typeof value?.enabled === "boolean" ? value.enabled : DEFAULT_REMINDERS.enabled,
      from: clock(value?.from, DEFAULT_REMINDERS.from),
      to: clock(value?.to, DEFAULT_REMINDERS.to),
      every,
      unit
    };
  }
  var ADD_ENTRY_TTL = 2 * 6e4;
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

  // src/reminders.ts
  var REMINDER_ALARM = "photoday-reminder";
  var REMINDER_NOTIFICATION = "photoday-reminder";
  function extensionApi() {
    const scope = globalThis;
    return scope.browser ?? scope.chrome ?? null;
  }
  function periodMinutes(reminders) {
    const every = Math.max(1, Math.floor(reminders.every || 1));
    return reminders.unit === "minutes" ? every : every * 60;
  }
  function reminderSummary(reminders) {
    if (!reminders.enabled) return "\u041D\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u043D\u0438\u044F \u0432\u044B\u043A\u043B\u044E\u0447\u0435\u043D\u044B.";
    const every = reminders.unit === "hours" ? reminders.every + " \u0447" : reminders.every + " \u043C\u0438\u043D";
    const range = reminders.from === reminders.to ? "\u0432\u0435\u0441\u044C \u0434\u0435\u043D\u044C" : reminders.from + "\u2013" + reminders.to;
    return "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435 \u043A\u0430\u0436\u0434\u044B\u0435 " + every + ", " + range + ".";
  }
  async function syncReminderAlarm() {
    const api2 = extensionApi();
    if (!api2?.alarms) return;
    const settings2 = await getSettings();
    const period = periodMinutes(settings2.reminders);
    const existing = await Promise.resolve(api2.alarms.get(REMINDER_ALARM)).catch(() => null);
    if (!settings2.reminders.enabled) {
      if (existing) await Promise.resolve(api2.alarms.clear(REMINDER_ALARM)).catch(() => void 0);
      return;
    }
    if (existing && Number(existing.periodInMinutes) === period) return;
    await Promise.resolve(api2.alarms.clear(REMINDER_ALARM)).catch(() => void 0);
    api2.alarms.create(REMINDER_ALARM, { delayInMinutes: period, periodInMinutes: period });
  }
  async function notificationPermission() {
    const api2 = extensionApi();
    if (!api2?.notifications?.getPermissionLevel) return "granted";
    try {
      const level = await Promise.resolve(api2.notifications.getPermissionLevel());
      return typeof level === "string" ? level : "granted";
    } catch (e) {
      return "granted";
    }
  }
  async function showReminder() {
    const api2 = extensionApi();
    if (!api2?.notifications) throw new Error("\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B \u0432 \u044D\u0442\u043E\u043C \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435.");
    const iconUrl = api2.runtime?.getURL ? api2.runtime.getURL("icons/icon128.png") : "icons/icon128.png";
    await new Promise((resolve) => {
      try {
        api2.notifications.create(REMINDER_NOTIFICATION, {
          type: "basic",
          iconUrl,
          title: "\u0424\u043E\u0442\u043E \u0434\u043D\u044F",
          message: "\u041E\u043F\u0438\u0448\u0438\u0442\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D\u043D\u044B\u0435 \u0437\u0430\u0434\u0430\u0447\u0438, \u043F\u043E\u043A\u0430 \u043D\u0435 \u0437\u0430\u0431\u044B\u043B\u0438, \u0447\u0442\u043E \u0431\u044B\u043B\u043E \u0441\u0434\u0435\u043B\u0430\u043D\u043E.",
          contextMessage: "\xAB\u041E\u041A\xBB \u2014 \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u0444\u043E\u0440\u043C\u0443 \u043D\u043E\u0432\u043E\u0439 \u0437\u0430\u043F\u0438\u0441\u0438.",
          buttons: [{ title: "\u041E\u041A" }, { title: "\u041E\u0442\u043C\u0435\u043D\u0430" }],
          requireInteraction: true,
          priority: 2
        }, () => {
          void api2.runtime?.lastError;
          resolve();
        });
      } catch (e) {
        resolve();
      }
    });
  }

  // src/settings.ts
  var settings;
  var $ = (id) => document.getElementById(id);
  var input = (id) => $(id);
  async function bindClick(id, handler) {
    const el = $(id);
    if (el) el.onclick = handler;
  }
  async function init() {
    try {
      settings = await getSettings();
      render();
      bindClick("save", () => void save());
      bindClick("connect", () => void connect());
      bindClick("testConnection", () => void test());
      bindClick("clearCache", () => void clearCache());
      bindClick("addType", () => {
        syncTypesFromDom();
        settings.taskTypes.push({ code: "\u041D\u043E\u0432\u044B\u0439", description: "" });
        render();
      });
      bindClick("testReminder", () => void testReminder());
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
      for (const id of ["remindersEnabled", "remindersFrom", "remindersTo", "remindersEvery", "remindersUnit"]) {
        $(id).addEventListener("change", updateReminderSummary);
        $(id).addEventListener("input", updateReminderSummary);
      }
    } catch (e) {
      const status = $("status");
      if (status) status.textContent = "\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043A: " + (e instanceof Error ? e.message : String(e));
    }
  }
  function syncDisplayValue() {
    const n = Math.max(1, Number(input("tasks").value) || 1);
    if (settings.displayMode === "tasks") settings.tasksToShow = n;
    else settings.daysToShow = n;
  }
  function syncTypesFromDom() {
    if (!settings) return;
    settings.taskTypes = Array.from(document.querySelectorAll(".type-row")).map((r) => ({ code: r.querySelector('[data-role="code"]').value.trim(), description: r.querySelector('[data-role="description"]').value.trim() }));
  }
  function render() {
    input("diskPath").value = settings.diskPath;
    input("fileUrl").value = settings.fileUrl ?? "";
    const n = settings.displayMode === "tasks" ? settings.tasksToShow : settings.daysToShow;
    input("tasks").value = String(n);
    input("modeTasks").checked = settings.displayMode === "tasks";
    input("modeDays").checked = settings.displayMode === "days";
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
        if (!confirm(`\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0442\u0438\u043F \u0437\u0430\u0434\u0430\u0447\u0438 \xAB${t.code} \u2014 ${t.description}\xBB?`)) return;
        syncTypesFromDom();
        settings.taskTypes.splice(i, 1);
        render();
      };
      row.append(code, desc, del);
      root.append(row);
    });
    renderReminders();
  }
  function renderReminders() {
    const r = settings.reminders;
    input("remindersEnabled").checked = r.enabled;
    input("remindersFrom").value = r.from;
    input("remindersTo").value = r.to;
    input("remindersEvery").value = String(r.every);
    $("remindersUnit").value = r.unit;
    $("reminderStatus").textContent = "";
    updateReminderSummary();
  }
  function remindersFromForm() {
    const enabled = input("remindersEnabled").checked;
    const from = input("remindersFrom").value.trim();
    const to = input("remindersTo").value.trim();
    const unit = $("remindersUnit").value === "minutes" ? "minutes" : "hours";
    const every = Number(input("remindersEvery").value);
    if (enabled && (!from || !to)) throw new Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u0432\u0440\u0435\u043C\u044F \xAB\u0421\xBB \u0438 \xAB\u0414\u043E\xBB \u0434\u043B\u044F \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D\u0430 \u043D\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u043D\u0438\u0439.");
    if (!Number.isFinite(every) || every < 1) throw new Error("\u0427\u0430\u0441\u0442\u043E\u0442\u0430 \u043D\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u043D\u0438\u0439 \u0434\u043E\u043B\u0436\u043D\u0430 \u0431\u044B\u0442\u044C \u043D\u0435 \u043C\u0435\u043D\u044C\u0448\u0435 1.");
    const limit = unit === "minutes" ? 1440 : 24;
    if (Math.floor(every) > limit) throw new Error(unit === "minutes" ? "\u0414\u043B\u044F \u043C\u0438\u043D\u0443\u0442 \u0447\u0430\u0441\u0442\u043E\u0442\u0430 \u043D\u0435 \u043C\u043E\u0436\u0435\u0442 \u043F\u0440\u0435\u0432\u044B\u0448\u0430\u0442\u044C 1440." : "\u0414\u043B\u044F \u0447\u0430\u0441\u043E\u0432 \u0447\u0430\u0441\u0442\u043E\u0442\u0430 \u043D\u0435 \u043C\u043E\u0436\u0435\u0442 \u043F\u0440\u0435\u0432\u044B\u0448\u0430\u0442\u044C 24.");
    return { enabled, from: from || "09:00", to: to || "18:00", every: Math.floor(every), unit };
  }
  function updateReminderSummary() {
    try {
      $("reminderSummary").textContent = reminderSummary(remindersFromForm());
    } catch (e) {
      $("reminderSummary").textContent = e instanceof Error ? e.message : String(e);
    }
  }
  function collectSettings() {
    syncDisplayValue();
    syncTypesFromDom();
    const diskPath = input("diskPath").value.trim();
    const fileUrl = input("fileUrl")?.value.trim() ?? "";
    const tasksToShow = Math.max(1, Number(input("tasks").value) || 10);
    const daysToShow = Math.max(1, settings.daysToShow || 2);
    const displayMode = input("modeDays").checked ? "days" : "tasks";
    const taskTypes = settings.taskTypes.map((t) => ({ code: t.code.trim(), description: t.description.trim() }));
    const reminders = remindersFromForm();
    if (!diskPath) throw new Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043F\u043E\u043B\u043D\u044B\u0439 \u043F\u0443\u0442\u044C \u043A XLSX.");
    if (fileUrl && !isHttpUrl(fileUrl)) throw new Error("\u0421\u0441\u044B\u043B\u043A\u0430 \u043D\u0430 \u0444\u0430\u0439\u043B \u0434\u043E\u043B\u0436\u043D\u0430 \u043D\u0430\u0447\u0438\u043D\u0430\u0442\u044C\u0441\u044F \u0441 http:// \u0438\u043B\u0438 https://.");
    if (!taskTypes.length) throw new Error("\u0414\u043E\u0431\u0430\u0432\u044C\u0442\u0435 \u0445\u043E\u0442\u044F \u0431\u044B \u043E\u0434\u0438\u043D \u0442\u0438\u043F \u0437\u0430\u0434\u0430\u0447\u0438.");
    if (taskTypes.some((t) => !t.code)) throw new Error("\u0423 \u043A\u0430\u0436\u0434\u043E\u0433\u043E \u0442\u0438\u043F\u0430 \u0437\u0430\u0434\u0430\u0447\u0438 \u0434\u043E\u043B\u0436\u0435\u043D \u0431\u044B\u0442\u044C \u0443\u043A\u0430\u0437\u0430\u043D \u043A\u043E\u0434.");
    const codes = taskTypes.map((t) => t.code.toLocaleLowerCase());
    if (new Set(codes).size !== codes.length) throw new Error("\u041A\u043E\u0434\u044B \u0442\u0438\u043F\u043E\u0432 \u0437\u0430\u0434\u0430\u0447 \u043D\u0435 \u0434\u043E\u043B\u0436\u043D\u044B \u043F\u043E\u0432\u0442\u043E\u0440\u044F\u0442\u044C\u0441\u044F.");
    return { displayMode, tasksToShow: displayMode === "tasks" ? tasksToShow : settings.tasksToShow, daysToShow: displayMode === "days" ? tasksToShow : daysToShow, diskPath, taskTypes, reminders, fileUrl };
  }
  async function clearCache() {
    if (!confirm("\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u0438\u044F? \u0411\u0443\u0434\u0443\u0442 \u0443\u0434\u0430\u043B\u0435\u043D\u044B \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438, \u0442\u043E\u043A\u0435\u043D \u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A\u0430 \u0438 \u043E\u0447\u0435\u0440\u0435\u0434\u044C \u043D\u0435\u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043D\u044B\u0445 \u0437\u0430\u0434\u0430\u0447. \u0414\u0430\u043D\u043D\u044B\u0435 \u0432 XLSX \u043D\u0430 \u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A\u0435 \u043D\u0435 \u0443\u0434\u0430\u043B\u044F\u044E\u0442\u0441\u044F.")) return;
    try {
      await clearLocalData();
      settings = await getSettings();
      await syncReminderAlarm();
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
      await syncReminderAlarm();
      updateReminderSummary();
      $("status").textContent = "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u044B.";
      $("reminderStatus").textContent = "\u0420\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043D\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u043D\u0438\u0439 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u043E. " + reminderSummary(settings.reminders);
    } catch (e) {
      $("status").textContent = "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438: " + (e instanceof Error ? e.message : String(e));
    }
  }
  async function testReminder() {
    const button = $("testReminder");
    button.disabled = true;
    $("reminderStatus").textContent = "\u041E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u0435\u043C \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435...";
    try {
      settings = { ...settings, reminders: remindersFromForm() };
      await saveSettings(settings);
      await syncReminderAlarm();
      const level = await notificationPermission();
      if (level === "denied") {
        $("reminderStatus").textContent = "\u0411\u0440\u0430\u0443\u0437\u0435\u0440 \u0437\u0430\u043F\u0440\u0435\u0442\u0438\u043B \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F: \u0440\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u0435 \u0438\u0445 \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445 Chrome \u0438 \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445 \u0441\u0438\u0441\u0442\u0435\u043C\u044B.";
        return;
      }
      await showReminder();
      $("reminderStatus").textContent = "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E. \xAB\u041E\u041A\xBB \u043E\u0442\u043A\u0440\u043E\u0435\u0442 \u0444\u043E\u0440\u043C\u0443 \u043D\u043E\u0432\u043E\u0439 \u0437\u0430\u043F\u0438\u0441\u0438, \xAB\u041E\u0442\u043C\u0435\u043D\u0430\xBB \u043D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u043E\u0442\u043A\u0440\u043E\u0435\u0442.";
    } catch (e) {
      $("reminderStatus").textContent = "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435: " + (e instanceof Error ? e.message : String(e));
    } finally {
      button.disabled = false;
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
