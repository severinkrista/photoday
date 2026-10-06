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
  async function saveReminderState(state) {
    await set("reminderState", state);
  }

  // src/reminders.ts
  var REMINDER_ALARM = "photoday-reminder";
  var REMINDER_NOTIFICATION = "photoday-reminder";
  var ADD_WINDOW = { width: 780, height: 920 };
  function extensionApi() {
    const scope = globalThis;
    return scope.browser ?? scope.chrome ?? null;
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
    const api2 = extensionApi();
    if (!api2?.alarms) return;
    const settings = await getSettings();
    const period = periodMinutes(settings.reminders);
    const existing = await Promise.resolve(api2.alarms.get(REMINDER_ALARM)).catch(() => null);
    if (!settings.reminders.enabled) {
      if (existing) await Promise.resolve(api2.alarms.clear(REMINDER_ALARM)).catch(() => void 0);
      return;
    }
    if (existing && Number(existing.periodInMinutes) === period) return;
    await Promise.resolve(api2.alarms.clear(REMINDER_ALARM)).catch(() => void 0);
    api2.alarms.create(REMINDER_ALARM, { delayInMinutes: period, periodInMinutes: period });
  }
  async function handleReminderAlarm(name) {
    if (name !== REMINDER_ALARM) return;
    const settings = await getSettings();
    const reminders = settings.reminders;
    if (!reminders.enabled) return;
    const now = /* @__PURE__ */ new Date();
    if (!inRange(now, reminders)) return;
    const state = await getReminderState();
    const last = Number(state.lastNotifiedAt) || 0;
    if (last && now.getTime() - last < periodMinutes(reminders) * 6e4 * 0.9) return;
    await saveReminderState({ lastNotifiedAt: now.getTime() });
    await showReminder();
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
  async function openAddWindow() {
    const api2 = extensionApi();
    if (!api2) return;
    await markAddEntry();
    try {
      if (api2.action?.openPopup) {
        await Promise.resolve(api2.action.openPopup());
        return;
      }
    } catch (e) {
    }
    const url = api2.runtime?.getURL ? api2.runtime.getURL("popup.html?new=1") : "popup.html?new=1";
    try {
      if (api2.windows?.create) {
        await Promise.resolve(api2.windows.create({ url, type: "popup", width: ADD_WINDOW.width, height: ADD_WINDOW.height, focused: true }));
        return;
      }
    } catch (e) {
    }
    try {
      await Promise.resolve(api2.tabs?.create?.({ url }));
    } catch (e) {
    }
  }

  // src/background.ts
  var api = extensionApi();
  if (api) {
    api.runtime?.onInstalled?.addListener(() => {
      void syncReminderAlarm();
    });
    api.runtime?.onStartup?.addListener(() => {
      void syncReminderAlarm();
    });
    api.alarms?.onAlarm?.addListener((alarm) => {
      void handleReminderAlarm(String(alarm?.name ?? ""));
    });
    api.notifications?.onButtonClicked?.addListener((id, index) => {
      if (id !== REMINDER_NOTIFICATION) return;
      void Promise.resolve(api.notifications.clear(id)).catch(() => void 0);
      if (index === 0) void openAddWindow();
    });
    api.notifications?.onClicked?.addListener((id) => {
      if (id !== REMINDER_NOTIFICATION) return;
      void Promise.resolve(api.notifications.clear(id)).catch(() => void 0);
      void openAddWindow();
    });
    void syncReminderAlarm();
  }
})();
