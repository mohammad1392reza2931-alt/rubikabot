// ربات کانال روبیکا - Cloudflare Worker
import { BANNER_B64 } from "./banner.js";

const BANNER_TEXT = `💛BINDO💛


دنبال یه کانال ماینکرفتی خفن میگردی😱؟

دنبال یه کانال میگردی که دیگه مود های تکراری نزاره🤩؟

دنبال یه کانال میگردی که کلی تامنیل خفن با قیمتهای ارزون بزنه🧐؟

دنبال یه کانال با فعالیت خفن میگردی🤨؟




پس اینجا جای تو هست😉❤️👇

@BINDO1392`;
const BANNER_EVERY_MS = 24 * 3600 * 1000;

// کلیدها داخل خود کد نیستن؛ توی تنظیمات کلودفلر (Secrets) ذخیره می‌شن
let CFG = {};
function init(env) {
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
const WORDS = ["addon","mod","pack","weapons","furniture","dragon","magic","food","cars","mobs","armor","biome","tools","pets","city","robot","sword"];

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
  const ok = data.filter(f => f.downloadUrl && (f.fileLength || 0) <= CFG.MAX_MB * 1024 * 1024);
  if (!ok.length) return null;
  ok.sort((a, b) => String(b.fileDate).localeCompare(String(a.fileDate)));
  return ok[0];
}

async function pickMod(done, log) {
  const idxs = [0, 10, 20, 30, 40];
  for (let i = 0; i < 5; i++) {
    const w = WORDS[Math.floor(Math.random() * WORDS.length)];
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
  if (CFG.SHOW_AUTHOR && m.authors && m.authors.length) text += "\n\n👤 سازنده: " + m.authors[0].name;
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

function bannerBlob() {
  const bin = atob(BANNER_B64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: "image/jpeg" });
}

async function sendBanner(ch) {
  const fid = await upload("Image", bannerBlob(), "banner.jpg");
  await rub("sendFile", { chat_id: ch, file_id: fid, text: BANNER_TEXT });
}

async function loadState(env) {
  const s = (await env.STATE.get("state", "json")) || {};
  s.channels = s.channels || [];
  s.done = s.done || [];
  s.blocked = s.blocked || [];
  s.names = s.names || {};
  return s;
}
const saveState = (env, s) => env.STATE.put("state", JSON.stringify(s));

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
  await discover(state, log);
  if (!state.channels.length) {
    await saveState(env, state);
    return "کانالی پیدا نشد. توی هر کانال یک پیام بنویس و دوباره اجرا کن.";
  }
  const now = Date.now();
  // بنر: هر ۲۴ ساعت یک بار برای همه‌ی کانال‌ها به جز کانال اول
  if (!opts.now) {
    const dueB = state.channels.filter((c, i) => i > 0 && now - (c.bannerLast || 0) >= BANNER_EVERY_MS);
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
        if (fc) fc.bannerLast = now - (BANNER_EVERY_MS - 10 * 60000); // ۱۰ دقیقه‌ی دیگه دوباره تلاش می‌کنه
        await saveState(env, fresh);
        return "banner error: " + e.message;
      }
    }
  }
  let target = null;
  if (opts.now) {
    target = state.channels[opts.now - 1];
    if (!target) { await saveState(env, state); return "کانالی با این شماره نیست."; }
  } else {
    const due = state.channels
      .filter(c => now - c.last >= CFG.INTERVAL_MIN * 60000)
      .sort((a, b) => a.last - b.last);
    target = due[0];
  }
  if (!target) { await saveState(env, state); return "not yet"; }

  target.last = now;
  await saveState(env, state);

  const [m, f] = await pickMod(state.done, log);
  if (!m) { log.push("ماد مناسب پیدا نشد."); return log.join("\n"); }
  await postTo(target.id, m, f, log, target.footer);

  const fresh = await loadState(env);
  fresh.done.push(m.id);
  if (fresh.done.length > 600) fresh.done = fresh.done.slice(-600);
  await saveState(env, fresh);
  return log.join("\n");
}

export default {
  async scheduled(event, env, ctx) {
    init(env);
    ctx.waitUntil(run(env, {}));
  },
  async fetch(request, env) {
    init(env);
    const u = new URL(request.url);
    const h = { "Content-Type": "text/plain; charset=utf-8" };
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
