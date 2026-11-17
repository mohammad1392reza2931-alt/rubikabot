// ربات کانال روبیکا - Cloudflare Worker
import { BANNER_B64 } from "./banner.js";
import { PANEL_HTML } from "./panel.js";

const BANNER_TEXT = `💛BINDO💛


دنبال یه کانال ماینکرفتی خفن میگردی😱؟

دنبال یه کانال میگردی که دیگه مود های تکراری نزاره🤩؟

دنبال یه کانال میگردی که کلی تامنیل خفن با قیمتهای ارزون بزنه🧐؟

دنبال یه کانال با فعالیت خفن میگردی🤨؟




پس اینجا جای تو هست😉❤️👇

@BINDO1392`;

// کلیدها داخل خود کد نیستن؛ توی تنظیمات کلودفلر (Secrets) ذخیره می‌شن
let CFG = {}, ENV = null, S = {};
const SNAPS = new WeakMap();
function applySettings(st) {
  S = Object.assign({ intervalMin: 15, bannerHours: 24, maxMb: 10, showAuthor: false, paused: false, words: DEF_WORDS, bannerText: BANNER_TEXT }, st.settings || {});
  if (!S.words || !S.words.length) S.words = DEF_WORDS;
}
const bannerOn = (c, i) => (c.banner !== undefined ? c.banner : i > 0);
function init(env) {
  ENV = env;
  CFG = {
    TOKEN: env.RUBIKA_TOKEN,
    CF_KEY: env.CF_KEY,
    AI_KEY: env.AI_KEY,
    AI_ACCOUNT: env.AI_ACCOUNT,
    SECRET: env.SECRET,
    MAX_MB: 10,
    MAX_CHANNELS: 10,
    INTERVAL_MIN: 15,
    SHOW_AUTHOR: false,
  };
}
const DEF_WORDS = ["addon","mod","pack","weapons","furniture","dragon","magic","food","cars","mobs","armor","biome","tools","pets","city","robot","sword"];

async function rub(method, body) {
  const r = await fetch("https://botapi.rubika.ir/v3/" + CFG.TOKEN + "/" + method, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  if (!r.ok) throw new Error("Rubika " + method + " " + r.status + " " + t.slice(0, 100));
  return JSON.parse(t);
}

async function cf(path, params) {
  const u = new URL("https://api.curseforge.com" + path);
  for (const k in params) u.searchParams.set(k, params[k]);
  const r = await fetch(u.toString(), { headers: { "x-api-key": CFG.CF_KEY, "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error("CurseForge " + r.status);
  return r.json();
}

async function download(url) {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, redirect: "follow" });
  if (!r.ok) throw new Error("download " + r.status);
  return await r.blob();
}

async function upload(type, blob, name) {
  const d = await rub("requestSendFile", { type });
  const fd = new FormData();
  fd.append("file", blob, name);
  const r = await fetch(d.data.upload_url, { method: "POST", body: fd });
  const j = await r.json();
  return j.data.file_id;
}

async function bestFile(id) {
  const data = (await cf("/v1/mods/" + id + "/files", { pageSize: 10 })).data;
  const ok = data.filter(f => f.downloadUrl && (f.fileLength || 0) <= S.maxMb * 1024 * 1024);
  if (!ok.length) return null;
  ok.sort((a, b) => String(b.fileDate).localeCompare(String(a.fileDate)));
  return ok[0];
}

async function pickMod(done, log) {
  const idxs = [0, 10, 20, 30, 40];
  for (let i = 0; i < 5; i++) {
    const w = S.words[Math.floor(Math.random() * S.words.length)];
    const idx = idxs[Math.floor(Math.random() * idxs.length)];
    const p = { gameId: 78022, searchFilter: w, pageSize: 10 };
    if (idx) p.index = idx;
    let found = [];
    try { found = (await cf("/v1/mods/search", p)).data; }
    catch (e) { log.push("search error: " + e.message); continue; }
    let checked = 0;
    for (const m of found) {
      if (m.classId !== 4984 || done.includes(m.id)) continue;
      if (checked++ >= 3) break;
      try { const f = await bestFile(m.id); if (f) return [m, f]; } catch (e) {}
    }
  }
  return [null, null];
}

async function aiText(m) {
  const prompt = "یک پست کوتاه، جذاب و هیجان‌انگیز فارسی (حداکثر ۴ خط) برای معرفی این ادان ماینکرفت بدرک بنویس. فقط به فارسی و فقط متن پست، بدون لینک. اسم: " + m.name + ". توضیح: " + m.summary;
  const url = "https://api.cloudflare.com/client/v4/accounts/" + CFG.AI_ACCOUNT + "/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast";
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + CFG.AI_KEY },
    body: JSON.stringify({ max_tokens: 300, messages: [{ role: "user", content: prompt }] }),
  });
  if (!r.ok) throw new Error("AI " + r.status);
  const j = await r.json();
  const t = ((j.result && j.result.response) || "").trim();
  if (!t) throw new Error("empty AI answer");
  return t;
}

async function postTo(ch, m, f, log, footer) {
  let text;
  try { text = await aiText(m); }
  catch (e) {
    log.push("AI error: " + e.message);
    text = "🔥 ادان جدید ماینکرفت بدرک\n\n" + m.name + "\n" + m.summary;
  }
  if (S.showAuthor && m.authors && m.authors.length) text += "\n\n👤 سازنده: " + m.authors[0].name;
  if (footer) text += "\n\n" + footer;

  try {
    const img = await download(m.logo.url);
    const fid = await upload("Image", img, "a.jpg");
    await rub("sendFile", { chat_id: ch, file_id: fid, text });
  } catch (e) {
    log.push("image error: " + e.message);
    try { await rub("sendMessage", { chat_id: ch, text }); }
    catch (x) { log.push("message error: " + x.message); }
  }
  try {
    const blob = await download(f.downloadUrl);
    const fid = await upload("File", blob, f.fileName);
    await rub("sendFile", { chat_id: ch, file_id: fid });
    log.push("OK: " + m.name);
  } catch (e) {
    log.push("file error: " + e.message);
  }
}

function bannerBlob(b64) {
  const bin = atob(b64 || BANNER_B64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: "image/jpeg" });
}

async function sendBanner(ch) {
  const custom = await ENV.STATE.get("banner");
  const fid = await upload("Image", bannerBlob(custom), "banner.jpg");
  await rub("sendFile", { chat_id: ch, file_id: fid, text: S.bannerText });
}

async function loadState(env) {
  const s = (await env.STATE.get("state", "json")) || {};
  s.channels = s.channels || [];
  s.done = s.done || [];
  s.blocked = s.blocked || [];
  s.names = s.names || {};
  s.settings = s.settings || {};
  s.logs = s.logs || [];
  applySettings(s);
  SNAPS.set(s, JSON.stringify(s));
  return s;
}
// فقط وقتی چیزی عوض شده باشه می‌نویسه (پلن رایگان فقط ۱۰۰۰ نوشتن در روز اجازه می‌ده)
async function saveState(env, s) {
  const j = JSON.stringify(s);
  if (SNAPS.get(s) === j) return;
  try { await env.STATE.put("state", j); SNAPS.set(s, j); }
  catch (e) { console.log("KV put failed: " + e.message); }
}

async function chatName(state, id) {
  if (state.names[id]) return state.names[id];
  try {
    const j = await rub("getChat", { chat_id: id });
    const c = (j.data && j.data.chat) || j.data || {};
    const n = c.title || [c.first_name, c.last_name].filter(Boolean).join(" ") || c.username || "";
    if (n) { state.names[id] = n; return n; }
  } catch (e) {}
  return "";
}
async function label(state, id) {
  const n = await chatName(state, id);
  return n || ("نام نامشخص (" + id + ")");
}

async function discover(state, log) {
  try {
    const raw = JSON.stringify(await rub("getUpdates", { limit: 100 }));
    const ids = [...new Set([...raw.matchAll(/"chat_id":"(c0[^"]+)"/g)].map(x => x[1]))];
    for (const id of ids) {
      if (!state.channels.find(c => c.id === id) && !state.blocked.includes(id) && state.channels.length < CFG.MAX_CHANNELS) {
        state.channels.push({ id, last: 0 });
        log.push("کانال جدید اضافه شد");
      }
    }
  } catch (e) { log.push("getUpdates error: " + e.message); }
}

// opts.now: شماره‌ی کانال برای پست فوری (از 1)
async function run(env, opts) {
  const log = [];
  const state = await loadState(env);
  if (S.paused && !opts.now && !opts.id) return "paused";
  await discover(state, log);
  await saveState(env, state); // فقط اگه کانال جدیدی پیدا شده باشه می‌نویسه
  if (!state.channels.length) return "کانالی پیدا نشد. توی هر کانال یک پیام بنویس و دوباره اجرا کن.";
  const now = Date.now();
  // بنر: هر چند ساعت یک بار برای کانال‌هایی که بنرشون روشنه
  if (!opts.now && !opts.id) {
    const dueB = state.channels.filter((c, i) => bannerOn(c, i) && !c.paused && now - (c.bannerLast || 0) >= S.bannerHours * 3600000);
    if (dueB.length) {
      const c = dueB[0];
      c.bannerLast = now;
      await saveState(env, state);
      try {
        await sendBanner(c.id);
        return "بنر برای یک کانال ارسال شد.";
      } catch (e) {
        const fresh = await loadState(env);
        const fc = fresh.channels.find(x => x.id === c.id);
        if (fc) fc.bannerLast = now - (S.bannerHours * 3600000 - 10 * 60000);
        await saveState(env, fresh);
        return "banner error: " + e.message;
      }
    }
  }
  let target = null;
  if (opts.now || opts.id) {
    target = opts.id ? state.channels.find(c => c.id === opts.id) : state.channels[opts.now - 1];
    if (!target) return "کانالی با این شماره نیست.";
  } else {
    // هر دقیقه نوبت یک کانال است؛ بدون نیاز به نوشتن توی حافظه
    const el = state.channels.filter(c => !c.paused);
    const win = Math.max(S.intervalMin, el.length);
    target = el[Math.floor(now / 60000) % win];
  }
  if (!target) return "not yet";

  const [m, f] = await pickMod(state.done, log);
  if (!m) { log.push("ماد مناسب پیدا نشد."); return log.join("\n"); }
  await postTo(target.id, m, f, log, target.footer);

  // فقط یک نوشتن برای هر پست
  const fresh = await loadState(env);
  const fc = fresh.channels.find(c => c.id === target.id);
  if (fc) fc.last = now;
  fresh.done.push(m.id);
  if (fresh.done.length > 600) fresh.done = fresh.done.slice(-600);
  fresh.logs.push({ t: now, m: log.join(" | ").slice(0, 300) });
  fresh.logs = fresh.logs.slice(-60);
  await saveState(env, fresh);
  return log.join("\n");
}

async function runLogged(env, opts) {
  return await run(env, opts);
}

async function api(env, b) {
  const st = await loadState(env);
  const id = b.id;
  switch (b.action) {
    case "state": {
      for (const c of st.channels) await chatName(st, c.id);
      for (const x of st.blocked) await chatName(st, x);
      await saveState(env, st);
      return {
        channels: st.channels.map((c, i) => ({ ...c, name: st.names[c.id] || "", bannerOn: bannerOn(c, i) })),
        blocked: st.blocked.map(x => ({ id: x, name: st.names[x] || "" })),
        settings: S, logs: st.logs, doneCount: st.done.length,
        hasBanner: !!(await env.STATE.get("banner")), now: Date.now(),
      };
    }
    case "setChannel": {
      const c = st.channels.find(x => x.id === id);
      if (!c) throw new Error("کانال پیدا نشد");
      for (const k of ["footer", "paused", "banner"]) if (k in (b.patch || {})) c[k] = b.patch[k];
      if (c.footer === "") delete c.footer;
      break;
    }
    case "remove": {
      const i = st.channels.findIndex(x => x.id === id);
      if (i < 0) throw new Error("کانال پیدا نشد");
      st.blocked.push(id); st.channels.splice(i, 1);
      break;
    }
    case "unblock": {
      if (st.channels.length >= CFG.MAX_CHANNELS) throw new Error("ظرفیت کانال‌ها پر است");
      st.blocked = st.blocked.filter(x => x !== id);
      if (!st.channels.find(x => x.id === id)) st.channels.push({ id, last: 0 });
      break;
    }
    case "add": {
      if (!/^c0[A-Za-z0-9]+$/.test(id || "")) throw new Error("آیدی معتبر نیست");
      if (st.channels.length >= CFG.MAX_CHANNELS) throw new Error("ظرفیت کانال‌ها پر است");
      st.blocked = st.blocked.filter(x => x !== id);
      if (!st.channels.find(x => x.id === id)) st.channels.push({ id, last: 0 });
      break;
    }
    case "scan": {
      const log = [];
      await discover(st, log);
      await saveState(env, st);
      return log.join("\n") || "کانال جدیدی پیدا نشد";
    }
    case "settings": {
      const n = b.settings || {}, o = st.settings;
      for (const k of ["intervalMin", "bannerHours", "maxMb"]) if (n[k] !== undefined) o[k] = Math.max(1, Number(n[k]) || 1);
      if (n.paused !== undefined) o.paused = !!n.paused;
      if (n.showAuthor !== undefined) o.showAuthor = !!n.showAuthor;
      if (Array.isArray(n.words)) o.words = n.words.slice(0, 100);
      if (typeof n.bannerText === "string") o.bannerText = n.bannerText;
      break;
    }
    case "bannerImage": {
      if (b.clear) await env.STATE.delete("banner");
      else if (b.b64) await env.STATE.put("banner", b.b64);
      return "ok";
    }
    case "clearLogs": st.logs = []; break;
    case "post": return await runLogged(env, { id });
    case "banner": {
      const c = st.channels.find(x => x.id === id);
      if (!c) throw new Error("کانال پیدا نشد");
      await sendBanner(id);
      return "بنر ارسال شد";
    }
    default: throw new Error("دستور نامعتبر");
  }
  await saveState(env, st);
  return "ok";
}

export default {
  async scheduled(event, env, ctx) {
    init(env);
    ctx.waitUntil(runLogged(env, {}));
  },
  async fetch(request, env) {
    init(env);
    const u = new URL(request.url);
    const h = { "Content-Type": "text/plain; charset=utf-8" };
    if (u.pathname === "/panel") return new Response(PANEL_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    if (u.pathname === "/api") {
      if (request.headers.get("x-key") !== CFG.SECRET) return new Response("{}", { status: 403 });
      const j = { "Content-Type": "application/json; charset=utf-8" };
      try { return new Response(JSON.stringify(await api(env, await request.json())), { headers: j }); }
      catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: j }); }
    }
    if (u.searchParams.get("key") !== CFG.SECRET) return new Response("no", { status: 403 });

    if (u.searchParams.get("list")) {
      const state = await loadState(env);
      const log = [];
      await discover(state, log);
      await saveState(env, state);
      const lines = [];
      for (let i = 0; i < state.channels.length; i++) {
        const c = state.channels[i];
        lines.push((i + 1) + ") " + (await label(state, c.id)) + (c.footer ? "  | پیام: " + c.footer : ""));
      }
      await saveState(env, state);
      return new Response(["تعداد کانال‌ها: " + state.channels.length, ...lines, ...log].join("\n"), { headers: h });
    }
    if (u.searchParams.get("chatinfo")) {
      const state = await loadState(env);
      const c = state.channels[parseInt(u.searchParams.get("chatinfo"), 10) - 1];
      if (!c) return new Response("کانالی با این شماره نیست.", { headers: h });
      try { return new Response(JSON.stringify(await rub("getChat", { chat_id: c.id }), null, 1), { headers: h }); }
      catch (e) { return new Response("getChat error: " + e.message, { headers: h }); }
    }
    if (u.searchParams.get("blocked")) {
      const state = await loadState(env);
      const lines = [];
      for (let i = 0; i < state.blocked.length; i++) lines.push((i + 1) + ") " + (await label(state, state.blocked[i])));
      await saveState(env, state);
      return new Response(["کانال‌های حذف‌شده: " + state.blocked.length, ...lines].join("\n"), { headers: h });
    }
    if (u.searchParams.get("unblock")) {
      const state = await loadState(env);
      const v = u.searchParams.get("unblock");
      const back = v === "all" ? state.blocked.slice() : [state.blocked[parseInt(v, 10) - 1]].filter(Boolean);
      if (!back.length) return new Response("کانالی با این شماره توی لیست حذف‌شده‌ها نیست.", { headers: h });
      let added = 0;
      for (const id of back) {
        if (state.channels.length >= CFG.MAX_CHANNELS) break;
        state.blocked = state.blocked.filter(x => x !== id);
        state.channels.push({ id, last: 0 });
        added++;
      }
      await saveState(env, state);
      return new Response(added + " کانال برگشت. تعداد کانال‌ها: " + state.channels.length, { headers: h });
    }
    if (u.searchParams.get("banner")) {
      const state = await loadState(env);
      const i = parseInt(u.searchParams.get("banner"), 10) - 1;
      const c = state.channels[i];
      if (!c) return new Response("کانالی با این شماره نیست.", { headers: h });
      try {
        await sendBanner(c.id);
        if (i > 0) { c.bannerLast = Date.now(); await saveState(env, state); }
        return new Response("بنر برای کانال " + (i + 1) + " ارسال شد.", { headers: h });
      } catch (e) {
        return new Response("banner error: " + e.message, { headers: h });
      }
    }
    if (u.searchParams.get("footer")) {
      const state = await loadState(env);
      const i = parseInt(u.searchParams.get("footer"), 10) - 1;
      const c = state.channels[i];
      if (!c) return new Response("کانالی با این شماره نیست.", { headers: h });
      if (u.searchParams.get("clear")) {
        delete c.footer;
        await saveState(env, state);
        return new Response("پیام کانال " + (i + 1) + " پاک شد.", { headers: h });
      }
      const t = u.searchParams.get("text");
      if (!t) return new Response("پیام فعلی کانال " + (i + 1) + ": " + (c.footer || "(خالی)"), { headers: h });
      c.footer = t;
      await saveState(env, state);
      return new Response("برای کانال " + (i + 1) + " ذخیره شد:\n" + t, { headers: h });
    }
    if (u.searchParams.get("remove")) {
      const state = await loadState(env);
      const i = parseInt(u.searchParams.get("remove"), 10) - 1;
      if (state.channels[i]) {
        const nm = await label(state, state.channels[i].id);
        state.blocked.push(state.channels[i].id);
        state.channels.splice(i, 1);
        await saveState(env, state);
        return new Response("حذف شد: " + nm + "\nکانال‌های باقی‌مونده: " + state.channels.length, { headers: h });
      }
      return new Response("کانالی با این شماره نیست.", { headers: h });
    }
    const now = parseInt(u.searchParams.get("now") || "0", 10);
    return new Response(await run(env, { now }), { headers: h });
  },
};
