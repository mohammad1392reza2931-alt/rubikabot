// ربات کانال روبیکا - Cloudflare Worker
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

async function postTo(ch, m, f, log) {
  let text;
  try { text = await aiText(m); }
  catch (e) {
    log.push("AI error: " + e.message);
    text = "🔥 ادان جدید ماینکرفت بدرک\n\n" + m.name + "\n" + m.summary;
  }
  if (CFG.SHOW_AUTHOR && m.authors && m.authors.length) text += "\n\n👤 سازنده: " + m.authors[0].name;

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

async function loadState(env) {
  const s = (await env.STATE.get("state", "json")) || {};
  s.channels = s.channels || [];
  s.done = s.done || [];
  s.blocked = s.blocked || [];
  return s;
}
const saveState = (env, s) => env.STATE.put("state", JSON.stringify(s));

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
  await postTo(target.id, m, f, log);

  state.done.push(m.id);
  if (state.done.length > 600) state.done = state.done.slice(-600);
  await saveState(env, state);
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
      const lines = state.channels.map((c, i) => (i + 1) + ") " + c.id);
      return new Response(["تعداد کانال‌ها: " + state.channels.length, ...lines, ...log].join("\n"), { headers: h });
    }
    if (u.searchParams.get("remove")) {
      const state = await loadState(env);
      const i = parseInt(u.searchParams.get("remove"), 10) - 1;
      if (state.channels[i]) {
        state.blocked.push(state.channels[i].id);
        state.channels.splice(i, 1);
        await saveState(env, state);
        return new Response("حذف شد. کانال‌های باقی‌مونده: " + state.channels.length, { headers: h });
      }
      return new Response("کانالی با این شماره نیست.", { headers: h });
    }
    const now = parseInt(u.searchParams.get("now") || "0", 10);
    return new Response(await run(env, { now }), { headers: h });
  },
};
