"use strict";
(() => {
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
  var ADD_ENTRY_TTL = 2 * 6e4;
  async function getToken() {
    return get("token", null);
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
  async function downloadFile(path) {
    const r = await api(await href("resources/download", path));
    if (!r.ok) throw new Error("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043A\u0430\u0447\u0430\u0442\u044C \u0444\u0430\u0439\u043B: HTTP " + r.status);
    return r.arrayBuffer();
  }

  // src/repository.ts
  async function getAttachment(t) {
    if (!t.attachmentFolder || !t.attachmentName) throw new Error("\u0423 \u0437\u0430\u0434\u0430\u0447\u0438 \u043D\u0435\u0442 \u0432\u043B\u043E\u0436\u0435\u043D\u0438\u044F.");
    return downloadFile(t.attachmentFolder + "/" + t.attachmentName);
  }

  // src/viewer.ts
  var params = new URLSearchParams(location.search);
  var folder = params.get("folder");
  var name = params.get("name");
  var image = document.getElementById("image");
  var error = document.getElementById("error");
  (async () => {
    try {
      if (!folder || !name) throw new Error("\u041D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u043E \u0432\u043B\u043E\u0436\u0435\u043D\u0438\u0435.");
      const data = await getAttachment({ weekday: "", partOfDay: "", taskType: "", task: "", attachmentFolder: folder, attachmentName: name });
      const url = URL.createObjectURL(new Blob([data]));
      image.src = url;
      image.hidden = false;
      window.addEventListener("beforeunload", () => URL.revokeObjectURL(url));
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : String(e);
      error.hidden = false;
    }
  })();
})();
