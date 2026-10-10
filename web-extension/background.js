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
  var ADD_ENTRY_KEY = "photodayAddEntry";
  var REMINDER_EVENT_KEY = "reminderEvent";
  var ADD_ENTRY_TTL = 2 * 6e4;
  function sessionArea() {
    const scope = globalThis;
    return (scope.browser ?? scope.chrome)?.storage?.session ?? null;
  }
  async function markAddEntry() {
    const session = sessionArea();
    if (session?.set) {
      try {
        await session.set({ [ADD_ENTRY_KEY]: Date.now() });
        return;
      } catch (e) {
      }
    }
    await set(ADD_ENTRY_KEY, Date.now());
  }
  async function getReminderState() {
    return get("reminderState", {});
  }
  async function saveReminderState(state2) {
    await set("reminderState", state2);
  }
  async function getToken() {
    return get("token", null);
  }
  async function saveReminderEvent(event) {
    await set(REMINDER_EVENT_KEY, event);
  }

  // src/reminders.ts
  var REMINDER_ALARM = "photoday-reminder";
  var REMINDER_NOTIFICATION = "photoday-reminder";
  function isReminderNotification(id) {
    return String(id ?? "").startsWith(REMINDER_NOTIFICATION);
  }
  var ADD_WINDOW = { width: 780, height: 920 };
  var NOTIFICATION_BUTTONS = [{ title: "\u041E\u041A" }, { title: "\u041E\u0442\u043C\u0435\u043D\u0430" }];
  function extensionApi() {
    const scope = globalThis;
    return scope.browser ?? scope.chrome ?? null;
  }
  function errorText(error) {
    if (error instanceof Error) return error.message;
    const text = String(error ?? "");
    return text && text !== "undefined" ? text : "\u043D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u0430\u044F \u043E\u0448\u0438\u0431\u043A\u0430";
  }
  function trace(message, ...details) {
    try {
      console.info("[photoday] " + message, ...details);
    } catch (e) {
    }
  }
  function periodMinutes(reminders) {
    const every = Math.max(1, Math.floor(reminders.every || 1));
    return reminders.unit === "minutes" ? every : every * 60;
  }
  function parseClock(value) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
    if (!match) return null;
    const hours = Number(match[1]), minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  }
  function inRange(now, reminders) {
    const from = parseClock(reminders.from), to = parseClock(reminders.to);
    if (from === null || to === null) return false;
    const current = now.getHours() * 60 + now.getMinutes();
    if (from === to) return true;
    return from < to ? current >= from && current < to : current >= from || current < to;
  }
  async function syncReminderAlarm() {
    const api4 = extensionApi();
    if (!api4?.alarms) return;
    const settings = await getSettings();
    const period = periodMinutes(settings.reminders);
    const existing = await Promise.resolve(api4.alarms.get(REMINDER_ALARM)).catch(() => null);
    if (!settings.reminders.enabled) {
      if (existing) await Promise.resolve(api4.alarms.clear(REMINDER_ALARM)).catch(() => void 0);
      return;
    }
    if (existing && Number(existing.periodInMinutes) === period) return;
    await Promise.resolve(api4.alarms.clear(REMINDER_ALARM)).catch(() => void 0);
    api4.alarms.create(REMINDER_ALARM, { delayInMinutes: period, periodInMinutes: period });
  }
  async function handleReminderAlarm(name) {
    if (name !== REMINDER_ALARM) return;
    const settings = await getSettings();
    const reminders = settings.reminders;
    if (!reminders.enabled) return;
    const now = /* @__PURE__ */ new Date();
    if (!inRange(now, reminders)) return;
    const state2 = await getReminderState();
    const last = Number(state2.lastNotifiedAt) || 0;
    if (last && now.getTime() - last < periodMinutes(reminders) * 6e4 * 0.9) return;
    await saveReminderState({ lastNotifiedAt: now.getTime() });
    await showReminder();
  }
  async function platformOs() {
    const api4 = extensionApi();
    if (!api4?.runtime?.getPlatformInfo) return "";
    try {
      const info = await Promise.resolve(api4.runtime.getPlatformInfo());
      return String(info?.os ?? "");
    } catch (e) {
      return "";
    }
  }
  async function showReminder() {
    const api4 = extensionApi();
    if (!api4?.notifications) throw new Error("\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B \u0432 \u044D\u0442\u043E\u043C \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435.");
    const id = `${REMINDER_NOTIFICATION}-${Date.now()}`;
    const holdOnScreen = await platformOs() !== "mac";
    const iconUrl = api4.runtime?.getURL ? api4.runtime.getURL("icons/icon128.png") : "icons/icon128.png";
    await new Promise((resolve) => {
      try {
        api4.notifications.create(id, {
          type: "basic",
          iconUrl,
          title: "\u0424\u043E\u0442\u043E \u0434\u043D\u044F",
          message: "\u041E\u043F\u0438\u0448\u0438\u0442\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D\u043D\u044B\u0435 \u0437\u0430\u0434\u0430\u0447\u0438, \u043F\u043E\u043A\u0430 \u043D\u0435 \u0437\u0430\u0431\u044B\u043B\u0438, \u0447\u0442\u043E \u0431\u044B\u043B\u043E \u0441\u0434\u0435\u043B\u0430\u043D\u043E.",
          contextMessage: "\xAB\u041E\u041A\xBB \u2014 \u0444\u043E\u0440\u043C\u0430 \u043D\u043E\u0432\u043E\u0439 \u0437\u0430\u043F\u0438\u0441\u0438; \u043C\u043E\u0436\u043D\u043E \u043F\u0440\u043E\u0441\u0442\u043E \u043D\u0430\u0436\u0430\u0442\u044C \u043D\u0430 \u044D\u0442\u043E \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435.",
          buttons: NOTIFICATION_BUTTONS,
          requireInteraction: holdOnScreen,
          priority: 2
        }, () => {
          void api4.runtime?.lastError;
          resolve();
        });
      } catch (e) {
        trace("\u043D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435", errorText(e));
        resolve();
      }
    });
    trace("\u043F\u043E\u043A\u0430\u0437\u0430\u043D\u043E \u043D\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u043D\u0438\u0435", id);
    await saveReminderEvent({ kind: "shown", at: Date.now(), notificationId: id, action: "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435 \u043F\u043E\u043A\u0430\u0437\u0430\u043D\u043E, \u0436\u0434\u0451\u043C \u043D\u0430\u0436\u0430\u0442\u0438\u044F." });
    return id;
  }
  function openedText(result) {
    switch (result.opened) {
      case "popup":
        return "\u041E\u0442\u043A\u0440\u044B\u043B\u043E\u0441\u044C \u043E\u043A\u043D\u043E \u043F\u043B\u0430\u0433\u0438\u043D\u0430 (popup).";
      case "window":
        return "\u041E\u0442\u043A\u0440\u044B\u043B\u043E\u0441\u044C \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E\u0435 \u043E\u043A\u043D\u043E \u0444\u043E\u0440\u043C\u044B \u043D\u043E\u0432\u043E\u0439 \u0437\u0430\u043F\u0438\u0441\u0438.";
      case "tab":
        return "\u0424\u043E\u0440\u043C\u0430 \u043D\u043E\u0432\u043E\u0439 \u0437\u0430\u043F\u0438\u0441\u0438 \u043E\u0442\u043A\u0440\u044B\u043B\u0430\u0441\u044C \u0432 \u043D\u043E\u0432\u043E\u0439 \u0432\u043A\u043B\u0430\u0434\u043A\u0435.";
      default:
        return "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u043E\u043A\u043D\u043E: " + (result.error ?? "\u043F\u0440\u0438\u0447\u0438\u043D\u0430 \u043D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u0430");
    }
  }
  async function openAddWindow() {
    const api4 = extensionApi();
    if (!api4) return { opened: "none", error: "\u041D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u0430 \u043A API \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u0438\u044F." };
    await markAddEntry();
    const errors = [];
    if (api4.action?.openPopup) {
      try {
        await Promise.resolve(api4.action.openPopup());
        trace("\u0444\u043E\u0440\u043C\u0430 \u043E\u0442\u043A\u0440\u044B\u0442\u0430 \u0447\u0435\u0440\u0435\u0437 action.openPopup");
        return { opened: "popup" };
      } catch (e) {
        errors.push("openPopup: " + errorText(e));
        trace("action.openPopup \u043D\u0435 \u0441\u0440\u0430\u0431\u043E\u0442\u0430\u043B", errorText(e));
      }
    }
    const url = api4.runtime?.getURL ? api4.runtime.getURL("popup.html?new=1") : "popup.html?new=1";
    if (api4.windows?.create) {
      try {
        await Promise.resolve(api4.windows.create({ url, type: "popup", width: ADD_WINDOW.width, height: ADD_WINDOW.height, focused: true }));
        trace("\u0444\u043E\u0440\u043C\u0430 \u043E\u0442\u043A\u0440\u044B\u0442\u0430 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u043C \u043E\u043A\u043D\u043E\u043C");
        return { opened: "window" };
      } catch (e) {
        errors.push("windows.create: " + errorText(e));
        trace("windows.create \u043D\u0435 \u0441\u0440\u0430\u0431\u043E\u0442\u0430\u043B", errorText(e));
      }
    }
    if (api4.tabs?.create) {
      try {
        await Promise.resolve(api4.tabs.create({ url }));
        trace("\u0444\u043E\u0440\u043C\u0430 \u043E\u0442\u043A\u0440\u044B\u0442\u0430 \u0432\u043A\u043B\u0430\u0434\u043A\u043E\u0439");
        return { opened: "tab" };
      } catch (e) {
        errors.push("tabs.create: " + errorText(e));
        trace("tabs.create \u043D\u0435 \u0441\u0440\u0430\u0431\u043E\u0442\u0430\u043B", errorText(e));
      }
    }
    return { opened: "none", error: errors.join("; ") || "\u041D\u0438 \u043E\u0434\u0438\u043D \u0441\u043F\u043E\u0441\u043E\u0431 \u043E\u0442\u043A\u0440\u044B\u0442\u0438\u044F \u043E\u043A\u043D\u0430 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D." };
  }
  async function clearNotification(id) {
    const api4 = extensionApi();
    if (!api4?.notifications?.clear) return;
    try {
      await Promise.resolve(api4.notifications.clear(id));
    } catch (e) {
    }
  }
  async function handleNotificationButton(id, index) {
    if (!isReminderNotification(id)) return;
    const title = NOTIFICATION_BUTTONS[index]?.title ?? "\u043A\u043D\u043E\u043F\u043A\u0430 " + (index + 1);
    trace("\u043D\u0430\u0436\u0430\u0442\u0430 \u043A\u043D\u043E\u043F\u043A\u0430 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F", id, title);
    await clearNotification(id);
    if (index !== 0) {
      await saveReminderEvent({ kind: "button", button: title, index, at: Date.now(), notificationId: id, action: "\xAB\u041E\u0442\u043C\u0435\u043D\u0430\xBB \u2014 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435 \u0437\u0430\u043A\u0440\u044B\u0442\u043E, \u043E\u043A\u043D\u043E \u043D\u0435 \u043E\u0442\u043A\u0440\u044B\u0432\u0430\u043B\u043E\u0441\u044C." });
      return;
    }
    const result = await openAddWindow();
    await saveReminderEvent({ kind: "button", button: title, index, at: Date.now(), notificationId: id, opened: result.opened, error: result.error, action: openedText(result) });
  }
  async function handleNotificationClick(id) {
    if (!isReminderNotification(id)) return;
    trace("\u043D\u0430\u0436\u0430\u0442\u043E \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435", id);
    await clearNotification(id);
    const result = await openAddWindow();
    await saveReminderEvent({ kind: "body", at: Date.now(), notificationId: id, opened: result.opened, error: result.error, action: openedText(result) });
  }
  async function handleNotificationClosed(id, byUser) {
    if (!isReminderNotification(id)) return;
    await saveReminderEvent({ kind: "closed", at: Date.now(), notificationId: id, action: byUser ? "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435 \u0437\u0430\u043A\u0440\u044B\u0442\u043E \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u043C." : "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435 \u0437\u0430\u043A\u0440\u044B\u0442\u043E \u0441\u0438\u0441\u0442\u0435\u043C\u043E\u0439." });
  }

  // src/autotrack-storage.ts
  var SETTINGS_KEY = "autotrackSettings";
  var STATE_KEY = "autotrackJson";
  var DEFAULT_SETTINGS2 = { enabled: true, uploadEveryMinutes: 60, rootPath: "disk:/\u0418\u0442\u043E\u0433\u0438 \u0434\u043D\u044F" };
  function storage2() {
    const g = globalThis;
    return (g.browser ?? g.chrome)?.storage?.local ?? null;
  }
  async function get2(key, fallback) {
    const s = storage2();
    if (s?.get) {
      const value = await Promise.resolve(s.get(key));
      return value?.[key] ?? fallback;
    }
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
  async function set2(key, value) {
    const s = storage2();
    if (s?.set) {
      await Promise.resolve(s.set({ [key]: value }));
      return;
    }
    localStorage.setItem(key, JSON.stringify(value));
  }
  async function getAutoTrackSettings() {
    const value = await get2(SETTINGS_KEY, {});
    const interval = Number(value.uploadEveryMinutes);
    return {
      enabled: typeof value.enabled === "boolean" ? value.enabled : DEFAULT_SETTINGS2.enabled,
      uploadEveryMinutes: Number.isFinite(interval) && interval >= 5 ? Math.min(1440, Math.floor(interval)) : DEFAULT_SETTINGS2.uploadEveryMinutes,
      rootPath: typeof value.rootPath === "string" && value.rootPath.trim() ? value.rootPath.trim() : DEFAULT_SETTINGS2.rootPath
    };
  }
  async function getAutoTrackState() {
    return get2(STATE_KEY, { days: {}, active: null });
  }
  async function saveAutoTrackState(value) {
    await set2(STATE_KEY, value);
  }

  // src/yandex.ts
  async function api(url, init = {}) {
    const token = await getToken();
    if (!token) throw new Error("\u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A \u043D\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0451\u043D.");
    const h = new Headers(init.headers);
    h.set("Authorization", "OAuth " + token);
    const r = await fetch(url, { ...init, headers: h });
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
  async function folderExists(path) {
    const r = await api("https://cloud-api.yandex.net/v1/disk/resources?path=" + encodeURIComponent(path));
    if (r.status === 404) return false;
    if (!r.ok) throw new Error("\u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A: HTTP " + r.status + " " + await r.text());
    return (await r.json()).type === "dir";
  }
  async function ensureFolder(path) {
    const r = await api("https://cloud-api.yandex.net/v1/disk/resources?path=" + encodeURIComponent(path), { method: "PUT" });
    if (r.ok) return;
    if (r.status === 409 && await folderExists(path)) return;
    throw new Error("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u043F\u0430\u043F\u043A\u0443 " + path + ": HTTP " + r.status + " " + await r.text());
  }
  async function uploadAutotrackJson(path, content) {
    const r = await api(await href("resources/upload", path, "&overwrite=true"), { method: "PUT", headers: { "Content-Type": "application/json; charset=utf-8" }, body: content });
    if (!r.ok) throw new Error("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0430\u0432\u0442\u043E\u0442\u0440\u0435\u043A\u0438\u043D\u0433 \u0432 " + path + ": HTTP " + r.status + " " + await r.text());
  }

  // src/autotrack.ts
  var ALARM = "photoday-autotrack-upload";
  var CHECKPOINT_ALARM = "photoday-autotrack-checkpoint";
  var MIN_DURATION_SECONDS = 180;
  var IDLE_THRESHOLD_SECONDS = 60;
  var initialized = false;
  var state = { days: {}, active: null };
  var browserFocused = true;
  var idleState = "active";
  var queue = Promise.resolve();
  var initialization = Promise.resolve();
  function api2() {
    const g = globalThis;
    return g.browser ?? g.chrome ?? null;
  }
  function localDay(ms) {
    const d = new Date(ms);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function safeUrl(raw) {
    try {
      const u = new URL(raw);
      if (u.protocol !== "http:" && u.protocol !== "https:") return raw;
      for (const key of [...u.searchParams.keys()]) if (/(?:^|[_-])(token|secret|password|passwd|auth|session|code|key)(?:$|[_-])|^(access|api|private)key$/i.test(key)) u.searchParams.delete(key);
      u.hash = "";
      return u.toString();
    } catch {
      return raw;
    }
  }
  function enqueue(work) {
    queue = queue.then(work).catch((error) => {
      console.warn("[photoday-autotrack]", error);
    });
    return queue;
  }
  async function persist() {
    await saveAutoTrackState(state);
  }
  async function recordCurrent(now = Date.now()) {
    const current = state.active;
    if (!current) return;
    const record = {
      url: current.url,
      title: current.title,
      openedAt: new Date(current.openedAtMs).toISOString(),
      durationSeconds: Math.max(0, Math.floor((now - current.openedAtMs) / 1e3))
    };
    const day = localDay(current.openedAtMs);
    const records = state.days[day] ?? (state.days[day] = []);
    const existing = records.findIndex((x) => x.openedAt === record.openedAt && x.url === record.url);
    if (existing >= 0) records[existing] = record;
    else records.push(record);
  }
  async function closeSession(now = Date.now()) {
    if (!state.active) return;
    await recordCurrent(now);
    state.active = null;
    await persist();
  }
  async function beginSession(tab) {
    const settings = await getAutoTrackSettings();
    if (!settings.enabled || !tab || typeof tab.id !== "number" || !browserFocused || idleState !== "active" || !tab.url || !/^https?:/i.test(tab.url)) return;
    const now = Date.now();
    state.active = { tabId: tab.id, windowId: Number(tab.windowId) || -1, url: safeUrl(String(tab.url)), title: String(tab.title ?? ""), openedAtMs: now, lastCheckpointAtMs: now };
    await persist();
  }
  async function currentTab() {
    const a = api2();
    if (!a?.tabs?.query) return null;
    try {
      const tabs = await Promise.resolve(a.tabs.query({ active: true, lastFocusedWindow: true }));
      return Array.isArray(tabs) ? tabs[0] ?? null : null;
    } catch {
      return null;
    }
  }
  async function syncActiveTab() {
    await closeSession();
    if (!browserFocused || idleState !== "active") return;
    await beginSession(await currentTab());
  }
  async function onActivated(info) {
    await closeSession();
    if (!browserFocused || idleState !== "active") return;
    const a = api2();
    try {
      await beginSession(await Promise.resolve(a?.tabs?.get?.(Number(info.tabId))));
    } catch {
      state.active = null;
      await persist();
    }
  }
  async function onUpdated(tabId, change, tab) {
    const active = state.active;
    if (!active || active.tabId !== tabId) return;
    const updatedUrl = typeof change.url === "string" ? change.url : typeof tab?.url === "string" ? tab.url : "";
    if (updatedUrl && safeUrl(updatedUrl) !== active.url) {
      await closeSession();
      await beginSession({ ...tab, url: updatedUrl });
      return;
    }
    if (typeof change.title === "string" && change.title !== active.title) {
      active.title = change.title;
      await persist();
    }
  }
  async function onRemoved(tabId) {
    if (state.active?.tabId === tabId) await closeSession();
  }
  async function onWindowFocusChanged(windowId) {
    browserFocused = windowId !== -1;
    if (!browserFocused) {
      await closeSession();
      return;
    }
    await syncActiveTab();
  }
  async function onIdleStateChanged(value) {
    idleState = value === "active" ? "active" : value === "locked" ? "locked" : "idle";
    if (idleState !== "active") {
      await closeSession();
      return;
    }
    await syncActiveTab();
  }
  function uploadPath(root, day) {
    return root.replace(/\/+$/, "") + "/" + day + "/autotrack/autotrack.json";
  }
  async function ensurePath(path) {
    const normalized = path.trim().replace(/^disk:/i, "").replace(/^\/+|\/+$/g, "");
    let current = "disk:/";
    for (const segment of normalized.split("/").filter(Boolean)) {
      current += (current.endsWith("/") ? "" : "/") + segment;
      await ensureFolder(current);
    }
  }
  async function uploadDay(day, force = false) {
    const records = (state.days[day] ?? []).filter((x) => x.durationSeconds > MIN_DURATION_SECONDS);
    if (!records.length) return;
    const settings = await getAutoTrackSettings();
    if (!settings.enabled && !force) return;
    const root = settings.rootPath.trim().replace(/\/+$/, "");
    const path = uploadPath(root, day);
    const autoFolder = path.slice(0, path.lastIndexOf("/"));
    const dateFolder = autoFolder.slice(0, autoFolder.lastIndexOf("/"));
    await ensurePath(root);
    await ensureFolder(dateFolder);
    await ensureFolder(autoFolder);
    const payload = { date: day, generatedAt: (/* @__PURE__ */ new Date()).toISOString(), minimumSessionSeconds: MIN_DURATION_SECONDS, records: [...records].sort((a, b) => a.openedAt.localeCompare(b.openedAt)) };
    await uploadAutotrackJson(path, JSON.stringify(payload, null, 2));
  }
  async function uploadAutotrackNow(force = false) {
    if (!initialized) {
      const saved = await getAutoTrackState();
      state = { days: saved.days ?? {}, active: saved.active ?? null, lastUploadedAt: saved.lastUploadedAt, lastError: saved.lastError };
    }
    await recordCurrent();
    await persist();
    const settings = await getAutoTrackSettings();
    if (!settings.enabled && !force) return;
    for (const day of Object.keys(state.days).sort()) await uploadDay(day, force);
    state.lastUploadedAt = Date.now();
    state.lastError = "";
    await persist();
  }
  async function syncAutoTrackAlarm() {
    const a = api2();
    if (!a?.alarms) return;
    const settings = await getAutoTrackSettings();
    if (!settings.enabled && !initialized) {
      const saved = await getAutoTrackState();
      state = { days: saved.days ?? {}, active: saved.active ?? null, lastUploadedAt: saved.lastUploadedAt, lastError: saved.lastError };
    }
    try {
      await Promise.resolve(a.alarms.clear(ALARM));
    } catch {
    }
    try {
      await Promise.resolve(a.alarms.clear(CHECKPOINT_ALARM));
    } catch {
    }
    if (settings.enabled) {
      a.alarms.create(ALARM, { delayInMinutes: settings.uploadEveryMinutes, periodInMinutes: settings.uploadEveryMinutes });
      a.alarms.create(CHECKPOINT_ALARM, { delayInMinutes: 1, periodInMinutes: 1 });
    } else {
      await closeSession();
    }
  }
  async function handleAutoTrackAlarm(name) {
    if (name !== ALARM && name !== CHECKPOINT_ALARM) return;
    await enqueue(async () => {
      await initialization;
      if (name === CHECKPOINT_ALARM) {
        if (state.active) {
          await recordCurrent();
          state.active.lastCheckpointAtMs = Date.now();
          await persist();
        }
        return;
      }
      try {
        await uploadAutotrackNow();
      } catch (e) {
        state.lastError = e instanceof Error ? e.message : String(e);
        await persist();
      }
    });
  }
  async function initAutoTrack() {
    if (initialized) return;
    initialized = true;
    const a = api2();
    if (!a) return;
    a.tabs?.onActivated?.addListener((info) => void enqueue(async () => {
      await initialization;
      await onActivated(info);
    }));
    a.tabs?.onUpdated?.addListener((id, change, tab) => void enqueue(async () => {
      await initialization;
      await onUpdated(id, change, tab);
    }));
    a.tabs?.onRemoved?.addListener((id) => void enqueue(async () => {
      await initialization;
      await onRemoved(id);
    }));
    a.windows?.onFocusChanged?.addListener((id) => void enqueue(async () => {
      await initialization;
      await onWindowFocusChanged(id);
    }));
    a.idle?.onStateChanged?.addListener((value) => void enqueue(async () => {
      await initialization;
      await onIdleStateChanged(value);
    }));
    initialization = (async () => {
      const saved = await getAutoTrackState();
      state = { days: saved.days ?? {}, active: saved.active ?? null, lastUploadedAt: saved.lastUploadedAt, lastError: saved.lastError };
      try {
        if (a.idle?.setDetectionInterval) a.idle.setDetectionInterval(IDLE_THRESHOLD_SECONDS);
        if (a.idle?.queryState) idleState = await Promise.resolve(a.idle.queryState(IDLE_THRESHOLD_SECONDS));
      } catch {
      }
      try {
        const focused = await Promise.resolve(a.windows?.getLastFocused?.());
        browserFocused = !!focused && focused.id !== -1;
      } catch {
        browserFocused = true;
      }
      const tab = await currentTab();
      if (state.active && Date.now() - (state.active.lastCheckpointAtMs ?? state.active.openedAtMs) <= 12e4 && tab && state.active.tabId === tab.id && safeUrl(String(tab.url ?? "")) === state.active.url && browserFocused && idleState === "active") {
        state.active.title = String(tab.title ?? state.active.title);
        await persist();
      } else {
        const previous = state.active;
        if (previous) await closeSession(previous.lastCheckpointAtMs ?? previous.openedAtMs);
        await beginSession(tab);
      }
    })();
    await initialization;
  }

  // src/background.ts
  var api3 = extensionApi();
  if (api3) {
    api3.runtime?.onInstalled?.addListener(() => {
      void syncReminderAlarm();
      void syncAutoTrackAlarm();
    });
    api3.runtime?.onStartup?.addListener(() => {
      void syncReminderAlarm();
      void syncAutoTrackAlarm();
    });
    api3.alarms?.onAlarm?.addListener((alarm) => {
      const name = String(alarm?.name ?? "");
      void handleReminderAlarm(name);
      void handleAutoTrackAlarm(name);
    });
    api3.notifications?.onButtonClicked?.addListener((id, index) => {
      void handleNotificationButton(String(id ?? ""), Number(index) || 0);
    });
    api3.notifications?.onClicked?.addListener((id) => {
      void handleNotificationClick(String(id ?? ""));
    });
    api3.notifications?.onClosed?.addListener((id, byUser) => {
      void handleNotificationClosed(String(id ?? ""), Boolean(byUser));
    });
    void syncReminderAlarm();
    void syncAutoTrackAlarm();
    void initAutoTrack();
  }
})();
