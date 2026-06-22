import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "./supabaseClient";

/*
  Miss Thani Make-Up & Lace Club
  -------------------------------------------------------------
  YON SÈL APP, DE ESPAS:
   1) ESPAS PIBLIK  -> sa moun ki sou rezo yo wè (pa bezwen kont)
   2) ESPAS ADMIN   -> pwoteje ak modpas, kote OU ranje enfo yo

  KIJAN YO KOMINIKE:
   Yo pataje menm baz done Supabase la. Admin nan ekri enfo yo,
   epi paj piblik la li yo otomatikman pou tout moun.

  CHANJE MODPAS LA: gade konstant ADMIN_PASSWORD anba a.
  Nòt: modpas sa a se yon baryè senp nan navigatè a.
*/

const ADMIN_PASSWORD = "missthani2026"; // <-- chanje sa pou modpas pa w

// Modpas pou paj /formulaire (lis prospè yo sèlman — ou ka bay resepsyon an aksè sa a).
// Ou ka mete menm bagay ak ADMIN_PASSWORD si ou vle.
const PROSPECTS_PASSWORD = "prospect2026"; // <-- chanje sa pou modpas pa w

const PALETTE = {
  bgTop: "#FFFFFF",
  bgBottom: "#FBEDF5",
  panel: "#FFFFFF",
  cream: "#3A0E33",                       // tèks prensipal (plòm fonse)
  gold: "#E0A50A",                        // aksan lò/jòn
  goldSoft: "#C2238E",                    // majenta (anfaz)
  blush: "#E5247E",                       // woz cho
  line: "rgba(142, 44, 154, 0.18)",       // bòdi vyolèt klè
  lineStrong: "rgba(194, 35, 142, 0.40)", // bòdi majenta
  danger: "#C0392B",
};

const SURF = "rgba(194, 35, 142, 0.05)";  // sifas kat sou fon blan
const SURF_SOFT = "rgba(194, 35, 142, 0.035)";

const uid = () => Math.random().toString(36).slice(2, 9);

/* Tip yon etap: "question" oswa "video" (konpatib ak ansyen done yo) */
const getStepType = (s) => s.type || (s.videoUrl ? "video" : "question");

/* Yon etap kounye a se yon lis "blòk". Pou ansyen done yo (ki te gen yon sèl tip),
   nou konvèti yo otomatikman an blòk pou tout bagay kontinye mache. */
function getStepBlocks(step) {
  if (Array.isArray(step.blocks)) return step.blocks;
  const t = getStepType(step);
  const out = [];
  if (t === "video") {
    out.push({ id: step.id + "-v", kind: "video", title: step.title || "", url: step.videoUrl || "", schedule: step.schedule || [] });
  } else if (t === "form") {
    if (step.title || step.body) out.push({ id: step.id + "-t", kind: "text", title: step.title || "", text: step.body || "" });
    out.push({ id: step.id + "-f", kind: "form", title: "" });
  } else if (t === "special") {
    out.push({ id: step.id + "-s", kind: "special", title: step.title || "", specialName: step.specialName || "", reserveDate: step.reserveDate || "", tpl: step.tpl || "", buttonLabel: step.buttonLabel || "", banner: step.banner || false, videoStep: step.videoStep || "" });
  } else {
    if (step.title || step.body) out.push({ id: step.id + "-t", kind: "text", title: step.title || "", text: step.body || "" });
    if (step.linkUrl) out.push({ id: step.id + "-l", kind: "link", title: "", url: step.linkUrl, label: step.linkLabel || "", sameTab: !!step.linkSameTab, linkMode: "extern", targetProgram: "", targetStep: "" });
  }
  return out;
}

/* Yon nouvo blòk vid selon kalite a */
function newBlock(kind) {
  const id = Math.random().toString(36).slice(2, 9);
  if (kind === "text") return { id, kind: "text", title: "", text: "" };
  if (kind === "video") return { id, kind: "video", title: "", url: "", orient: "auto", schedule: [] };
  if (kind === "form") return { id, kind: "form", title: "" };
  if (kind === "special") return { id, kind: "special", title: "", specialName: "", reserveDate: "", tpl: "", buttonLabel: "", banner: false, videoStep: "" };
  if (kind === "link") return { id, kind: "link", title: "", url: "", label: "", sameTab: false, linkMode: "extern", targetProgram: "", targetStep: "" };
  return { id, kind: "text", title: "", text: "" };
}

/* Dat jodi a nan fòma YYYY-MM-DD (selon lè aparèy la) */
function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* Ekri yon dat (YYYY-MM-DD) an Kreyòl: "lendi 16 jen 2026" */
function formatHtDate(s) {
  if (!s) return "";
  const parts = String(s).split("-").map(Number);
  const [y, m, d] = parts;
  if (!y || !m || !d) return s;
  const days = ["dimanch", "lendi", "madi", "mèkredi", "jedi", "vandredi", "samdi"];
  const months = ["janvye", "fevriye", "mas", "avril", "me", "jen", "jiyè", "out", "septanm", "oktòb", "novanm", "desanm"];
  const dt = new Date(y, m - 1, d);
  return `${days[dt.getDay()]} ${d} ${months[m - 1]} ${y}`;
}

/* Ajoute kèk jou sou yon dat (YYYY-MM-DD) */
function addDays(dateStr, days) {
  if (!dateStr) return "";
  const [y, m, d] = String(dateStr).split("-").map(Number);
  if (!y || !m || !d) return "";
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + (days || 0));
  const p = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

/* Jwenn dat komansman video pwograme ki aktif sou paj la (slot ki kòresponn ak jodi a) */
function activeVideoStart(blocks) {
  const today = todayStr();
  for (const b of blocks || []) {
    if (b.kind !== "video") continue;
    for (const s of b.schedule || []) {
      if (!s.start) continue;
      if (!(s.url || "").trim()) continue;
      const okStart = s.start <= today;
      const okEnd = !s.end || today <= s.end;
      if (okStart && okEnd) return s.start;
    }
  }
  return "";
}

/* Menm bagay men li chèche atravè tout etap yo (pou anons ki rete sou paj ki vini apre) */
function activeVideoStartAll(screens) {
  for (const sc of screens || []) {
    const st = activeVideoStart(getStepBlocks(sc));
    if (st) return st;
  }
  return "";
}

/* Jwenn dat video pwograme yon ETAP espesifik (1 = premye etap). 
   Si etap la pa egziste oswa pa gen video aktif, li retounen "". */
function activeVideoStartForStep(screens, stepNum) {
  const n = parseInt(stepNum, 10);
  if (!n || n < 1) return "";
  const sc = (screens || [])[n - 1];
  if (!sc) return "";
  return activeVideoStart(getStepBlocks(sc));
}

/* Chwazi bon dat la pou yon blòk special: si li atache ak yon etap espesifik, pran dat etap sa a;
   sinon, pran nenpòt video aktif nan tout pwogram nan. */
function specialVideoStart(screens, b) {
  if (b && b.videoStep) {
    const st = activeVideoStartForStep(screens, b.videoStep);
    if (st) return st;
  }
  return activeVideoStartAll(screens);
}

/* Chèche premye video pwograme ki aktif nan tout pwogram yo (pou mesaj swivi yo) */
function anyActiveVideoStart(programs) {
  for (const p of programs || []) {
    const st = activeVideoStartAll(p.steps || []);
    if (st) return st;
  }
  return "";
}

/* Mesaj swivi (follow-up) — {non}=non vizitè a, {dat10}=10 jou apre dat video pwograme a */
const FOLLOWUP_TPL = {
  done: "Nou te kontan pale avèk ou {non} ! Sonje vin rezève plas ou anvan {dat10}.",
  noanswer: "Nou eseye rele w {non}, men nimewo ou a sone san repons. Tanpri verifye si w te resevwa apèl nou, e pa bliye vin rezève plas ou anvan {dat10}.",
  wrong: "Bonjou {non}. Nimewo ou te ban nou an pa fonksyone, nou pa rive jwenn ou. Tanpri ban nou yon lòt nimewo nou ka rele w.",
};
const FOLLOWUP_LABELS = {
  done: "Suivi fèt",
  noanswer: "Sone san repons",
  wrong: "Pa sone ditou (nimewo pa bon)",
};

/* Modèl tèks default pou yon etap Special.
   {special}=non special, {dat}=dat rezèvasyon, {dat10}=10 jou apre dat video pwograme a, {non}=non vizitè a */
const DEFAULT_SPECIAL_TPL = "Felisitasyon {non} ! Nou resevwa enfòmasyon pèsonèl ou yo. Pou w ka gen plis chans pami 10 premye moun yo, kouri vin rezève plas ou anvan {dat10}.";

/* Ranplase {special} {dat} {dat10} {dat5} {non} nan yon modèl pa tèks ki an gra.
   {dat10} ak {dat5} toulède bay menm dat la (10 jou apre dat video a). */
function renderTemplate(tpl, vars) {
  const v = vars || {};
  const parts = String(tpl || "").split(/(\{special\}|\{dat10\}|\{dat5\}|\{dat\}|\{non\})/g);
  return parts.map((part, i) => {
    if (part === "{special}") return <strong key={i} style={{ color: PALETTE.goldSoft }}>{v.special || ""}</strong>;
    if (part === "{dat10}" || part === "{dat5}") return <strong key={i} style={{ color: PALETTE.goldSoft }}>{v.dat10 || ""}</strong>;
    if (part === "{dat}") return <strong key={i} style={{ color: PALETTE.goldSoft }}>{v.dat || ""}</strong>;
    if (part === "{non}") return <strong key={i} style={{ color: PALETTE.goldSoft }}>{v.non || ""}</strong>;
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

/* Chwazi bon videyo a pou yon etap selon dat jodi a.
   Li gade pwogram pa dat yo an premye; si okenn pa koresponn, li sèvi ak videyo default la. */
function activeVideoUrl(step) {
  if (!step) return "";
  const today = todayStr();
  const sched = step.schedule || [];
  for (const s of sched) {
    const url = (s.url || "").trim();
    if (!url) continue;
    if (!s.start && !s.end) continue; // san dat -> se default la k ap sèvi
    const okStart = !s.start || s.start <= today;
    const okEnd = !s.end || today <= s.end;
    if (okStart && okEnd) return url;
  }
  return (step.videoUrl || "").trim();
}

/* Konprann lien video a epi bay bon fason pou montre l */
function getVideoEmbed(url) {
  if (!url) return null;
  const u = url.trim();
  let m;

  // YouTube (plizyè fòm: watch, youtu.be, shorts, live, embed)
  m = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/|youtube\.com\/.*[?&]v=)([\w-]{11})/);
  if (m) return { type: "iframe", src: `https://www.youtube.com/embed/${m[1]}`, orientation: "landscape" };

  // Vimeo
  m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (m) return { type: "iframe", src: `https://player.vimeo.com/video/${m[1]}`, orientation: "landscape" };

  // TikTok (vètikal)
  m = u.match(/tiktok\.com\/(?:@[\w.-]+\/video|v|embed\/v2|embed|player\/v1)\/(\d+)/) || u.match(/tiktok\.com\/.*\/video\/(\d+)/);
  if (m) return { type: "iframe", src: `https://www.tiktok.com/player/v1/${m[1]}`, orientation: "portrait" };

  // Instagram (reel oswa post — vètikal)
  m = u.match(/instagram\.com\/(?:reels?|p|tv)\/([\w-]+)/);
  if (m) return { type: "iframe", src: `https://www.instagram.com/p/${m[1]}/embed`, orientation: "portrait" };

  // Google Drive
  m = u.match(/drive\.google\.com\/file\/d\/([\w-]+)/);
  if (m) return { type: "iframe", src: `https://drive.google.com/file/d/${m[1]}/preview`, orientation: "landscape" };

  // Dailymotion
  m = u.match(/dailymotion\.com\/video\/(\w+)/) || u.match(/dai\.ly\/(\w+)/);
  if (m) return { type: "iframe", src: `https://www.dailymotion.com/embed/video/${m[1]}`, orientation: "landscape" };

  // Streamable
  m = u.match(/streamable\.com\/(\w+)/);
  if (m) return { type: "iframe", src: `https://streamable.com/e/${m[1]}`, orientation: "landscape" };

  // Bunny.net Stream (lyen embed/iframe -> jwe dirèk)
  m = u.match(/mediadelivery\.net\/(?:embed|play)\/(\d+)\/([\w-]+)/);
  if (m) {
    const q = u.includes("?") ? "?" + u.split("?")[1] : "";
    return { type: "iframe", src: `https://iframe.mediadelivery.net/embed/${m[1]}/${m[2]}${q}`, orientation: "auto" };
  }

  // Fichye dirèk (gen ladan videyo Bunny .mp4 sou b-cdn.net)
  if (/\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(u)) return { type: "video", src: u, orientation: "auto" };

  // Facebook
  if (/facebook\.com|fb\.watch/.test(u))
    return { type: "iframe", src: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(u)}&show_text=false`, orientation: "landscape" };

  // Si nou pa rekonèt li — eseye montre l dirèkteman kanmèm
  return { type: "iframe", src: u, orientation: "landscape", unknown: true };
}

/* Ranje yon lyen pou l toujou louvri kòrèkteman (ajoute https:// si l manke) */
function normalizeLink(url) {
  const u = (url || "").trim();
  if (!u) return "#";
  if (/^(https?:\/\/|mailto:|tel:)/i.test(u)) return u;
  if (/^wa\.me\//i.test(u)) return "https://" + u;
  return "https://" + u;
}

/* Verifye yon nimewo telefòn Ayiti.
   Estanda Ayiti: 8 chif, premye chif la se 2 (liy fiks), 3 (Digicel) oswa 4 (Natcom).
   Aksepte ak oswa san kòd peyi 509 (oswa +509 / 00509). */
function validateHaitiPhone(raw) {
  let d = String(raw || "").replace(/\D/g, ""); // kenbe chif yo sèlman
  if (d.startsWith("00")) d = d.slice(2);        // retire prefiks entènasyonal 00
  if (d.length === 11 && d.startsWith("509")) d = d.slice(3); // retire kòd peyi 509
  const ok = /^[234]\d{7}$/.test(d);
  return { ok, local: d, e164: ok ? "509" + d : "" };
}

/* Tcheke nan Supabase si yon nimewo telefòn deja enskri (anpeche resoumèt). */
async function phoneAlreadyUsed(localPhone) {
  if (!localPhone) return false;
  try {
    const list = await loadProspects();
    for (const p of list) {
      for (const a of (p.answers || [])) {
        const v = validateHaitiPhone(a.answer);
        if (v.ok && v.local === localPhone) return true;
      }
    }
    return false;
  } catch (e) {
    return false;
  }
}

const DEFAULT_FORM_FIELDS = [
  { id: uid(), label: "Non konplè", fieldType: "text" },
  { id: uid(), label: "Nimewo telefòn", fieldType: "tel" },
  { id: uid(), label: "Imèl", fieldType: "email" },
];

const DEFAULT_CONFIG = {
  question: "A ki programme ou enterese?",
  revealDelay: 3, // segond ant chak opsyon
  formFields: DEFAULT_FORM_FIELDS, // kesyon fòmilè ki pataje pou tout programme
  agents: [], // non ajan yo pou etikèt yo (admin nan jere lis sa a)
  programs: [
    { id: uid(), label: "Onglerie", steps: [] },
    { id: uid(), label: "Tresse", steps: [] },
    { id: uid(), label: "Makiyaj", steps: [] },
    { id: uid(), label: "Dreadlocks", steps: [] },
    { id: uid(), label: "Formation Bouquet", steps: [] },
  ],
};

/* ----------------------- Memwa: Supabase ----------------------- */
const CONFIG_ID = "main";

async function loadConfig() {
  try {
    const { data, error } = await supabase.from("app_config").select("data").eq("id", CONFIG_ID).maybeSingle();
    if (error) throw error;
    return data ? data.data : null;
  } catch (e) {
    return null;
  }
}

async function saveConfig(cfg) {
  try {
    const { error } = await supabase
      .from("app_config")
      .upsert({ id: CONFIG_ID, data: cfg, updated_at: new Date().toISOString() });
    return !error;
  } catch (e) {
    return false;
  }
}

/* ----------------------- Prospè yo ----------------------- */
async function upsertProspect(record) {
  try {
    const { error } = await supabase.from("prospects").upsert({
      id: record.id,
      program: record.program,
      answers: record.answers,
      updated_at: new Date(record.updatedAt || Date.now()).toISOString(),
    });
    return !error;
  } catch (e) {
    return false;
  }
}

async function loadProspects() {
  try {
    const { data, error } = await supabase.from("prospects").select("*").order("updated_at", { ascending: false });
    if (error) throw error;
    return (data || []).map((r) => ({
      id: r.id,
      program: r.program,
      answers: r.answers || [],
      followup: r.followup || "",
      etiquette: r.etiquette || "",
      updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : 0,
    }));
  } catch (e) {
    return [];
  }
}

async function deleteProspect(id) {
  try {
    const { error } = await supabase.from("prospects").delete().eq("id", id);
    return !error;
  } catch (e) {
    return false;
  }
}

/* Estati swivi (follow-up) pou yon prospè: "" | "done" | "noanswer" | "wrong" | "vini" */
async function setProspectFollowup(id, status) {
  if (!id) return false;
  try {
    const { data, error } = await supabase.from("prospects").update({ followup: status }).eq("id", id).select();
    if (error) return false;
    return (data || []).length > 0; // 0 ranje = RLS bloke oswa id pa jwenn
  } catch (e) {
    return false;
  }
}

/* Etikèt: non ajan ki responsab prospè a (admin nan mete l) */
async function setProspectEtiquette(id, name) {
  if (!id) return false;
  try {
    const { data, error } = await supabase.from("prospects").update({ etiquette: name }).eq("id", id).select();
    if (error) return false;
    return (data || []).length > 0;
  } catch (e) {
    return false;
  }
}

/* Chèche yon sèl prospè pa idantifyan li (pou vizitè a tcheke pwòp estati swivi li) */
async function loadProspectById(id) {
  if (!id) return null;
  try {
    const { data, error } = await supabase.from("prospects").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      id: data.id,
      program: data.program,
      answers: data.answers || [],
      followup: data.followup || "",
      etiquette: data.etiquette || "",
      updatedAt: data.updated_at ? new Date(data.updated_at).getTime() : 0,
    };
  } catch (e) {
    return null;
  }
}

/* Mete yon nouvo nimewo telefòn pou yon prospè (lè ansyen an pa t bon) epi efase estati swivi a */
async function updateProspectPhone(id, newPhone) {
  if (!id) return false;
  try {
    const rec = await loadProspectById(id);
    if (!rec) return false;
    const newVal = String(newPhone || "").trim();
    let replaced = false;
    const answers = (rec.answers || []).map((a) => {
      const v = validateHaitiPhone(a.answer);
      if (!replaced && v.ok) { replaced = true; return { ...a, answer: newVal }; }
      return a;
    });
    const { error } = await supabase
      .from("prospects")
      .update({ answers, followup: "", updated_at: new Date().toISOString() })
      .eq("id", id);
    return !error;
  } catch (e) {
    return false;
  }
}

/* Tip chan pou yon fòmilè -> tip HTML input */
function inputProps(fieldType) {
  switch (fieldType) {
    case "tel": return { type: "tel", inputMode: "tel", placeholder: "Nimewo telefòn ou" };
    case "email": return { type: "email", inputMode: "email", placeholder: "Imèl ou" };
    case "number": return { type: "number", inputMode: "numeric", placeholder: "Ekri repons ou" };
    default: return { type: "text", placeholder: "Ekri repons ou" };
  }
}

/* ===================== JENERATÈ PDF (san okenn lib) =====================
   Konstwi yon vrè fichye PDF, fòma Letter (8.5 x 11), paj pa paj. */
function buildProspectsPdfBytes(items, fmtDate) {
  const PW = 612, PH = 792;          // Letter an pwen (72 dpi)
  const ML = 50, MR = 50, MT = 50, MB = 56;
  const contentW = PW - ML - MR;
  const headerH = 86;
  const lineH = (sz) => sz * 1.5;
  const charW = (sz) => sz * 0.52;   // estimasyon lajè Helvetica

  const sanitize = (s) =>
    String(s == null ? "" : s).split("").map((ch) => (ch.charCodeAt(0) <= 255 ? ch : "?")).join("");
  const esc = (s) => sanitize(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

  const wrap = (text, sz, maxW) => {
    const maxChars = Math.max(8, Math.floor(maxW / charW(sz)));
    const words = sanitize(text).split(/\s+/);
    const out = [];
    let line = "";
    for (const w of words) {
      const t = line ? line + " " + w : w;
      if (t.length > maxChars && line) { out.push(line); line = w; }
      else line = t;
    }
    if (line) out.push(line);
    return out.length ? out : [""];
  };

  // Operasyon desen
  const col = (r, g, b) => `${r} ${g} ${b} rg `;
  const textOp = (text, x, yy, font, size, rgb) =>
    `BT ${col(...rgb)}/${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${yy.toFixed(2)} Tm (${esc(text)}) Tj ET\n`;
  const rect = (x, yy, w, h, rgb) =>
    `${col(...rgb)}${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f\n`;

  const DARK = [0.11, 0.086, 0.125];
  const BODY = [0.18, 0.16, 0.18];
  const GOLD = [0.76, 0.14, 0.56];
  const MUTE = [0.54, 0.49, 0.44];

  // Koupe tèks pou l antre nan yon lajè (koupe gwo mo tou, tankou imèl)
  const wrapCell = (text, sz, maxW) => {
    const maxChars = Math.max(3, Math.floor(maxW / charW(sz)));
    const words = sanitize(text).split(/\s+/).filter(Boolean);
    const out = [];
    let line = "";
    words.forEach((w0) => {
      let w = w0;
      while (w.length > maxChars) {
        if (line) { out.push(line); line = ""; }
        out.push(w.slice(0, maxChars));
        w = w.slice(maxChars);
      }
      const t = line ? line + " " + w : w;
      if (t.length > maxChars && line) { out.push(line); line = w; }
      else line = t;
    });
    if (line) out.push(line);
    return out.length ? out : [""];
  };

  // Kolòn yo: #, Programme, Dat, epi yon kolòn pou chak kesyon
  const qCols = [];
  (items || []).forEach((p) =>
    (p.answers || []).forEach((a) => {
      const q = (a.question || "").trim();
      if (q && !qCols.includes(q)) qCols.push(q);
    })
  );
  const cols = [
    { key: "#", label: "#", w: 20 },
    { key: "prog", label: "Programme", w: 66 },
    { key: "date", label: "Dat", w: 56 },
  ];
  const remaining = contentW - cols.reduce((s, c) => s + c.w, 0);
  if (qCols.length) {
    const wq = remaining / qCols.length;
    qCols.forEach((q) => cols.push({ key: "q:" + q, label: q, w: wq }));
  } else {
    cols[1].w += remaining * 0.6;
    cols[2].w += remaining * 0.4;
  }
  const colX = [];
  { let x = ML; cols.forEach((c) => { colX.push(x); x += c.w; }); }

  const shortDate = (ts) => {
    try { return new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" }); }
    catch (e) { return ""; }
  };
  const cellVal = (p, c, idx) => {
    if (c.key === "#") return String(idx + 1);
    if (c.key === "prog") return p.program || "-";
    if (c.key === "date") return shortDate(p.updatedAt);
    if (c.key.indexOf("q:") === 0) {
      const q = c.key.slice(2);
      const f = (p.answers || []).find((a) => (a.question || "").trim() === q);
      return f ? f.answer || "" : "";
    }
    return "";
  };

  const CS = 9; // gwosè tèks tablo a
  const rowGap = 6;
  const rows = (items || []).map((p, idx) => {
    const cells = cols.map((c) => wrapCell(cellVal(p, c, idx), CS, c.w - 6));
    const nLines = Math.max(1, ...cells.map((a) => a.length));
    return { cells, h: nLines * lineH(CS) + rowGap };
  });

  // Antèt kolòn yo (li repete sou chak paj)
  const headCells = cols.map((c) => wrapCell(c.label, CS, c.w - 6));
  const headLines = Math.max(1, ...headCells.map((a) => a.length));
  const headH = headLines * lineH(CS) + 8;

  // Pagination selon wotè
  const titleH = 80;
  const bottomLimit = MB + 22;
  const topRows = (first) => PH - MT - (first ? titleH : 0) - headH;

  const pages = [{ first: true, rows: [] }];
  let pi = 0;
  let yy = topRows(true);
  rows.forEach((r, ri) => {
    if (yy - r.h < bottomLimit) {
      pages.push({ first: false, rows: [] });
      pi++;
      yy = topRows(false);
    }
    pages[pi].rows.push(ri);
    yy -= r.h;
  });
  const total = pages.length;

  const pageContents = pages.map((pg, idx) => {
    const first = pg.first;
    let c = "";

    // Tit (sou premye paj la sèlman)
    if (first) {
      c += textOp("Miss Thani", ML, PH - MT - 20, "F2", 22, DARK);
      c += textOp("MAKE-UP & LACE CLUB", ML, PH - MT - 36, "F1", 9, GOLD);
      c += rect(ML, PH - MT - 48, contentW, 1.5, GOLD);
      c += textOp("Lis Nouvo Prospect", ML, PH - MT - 70, "F2", 14, DARK);
      c += textOp(`${(items || []).length} prospè`, PW - MR - 60, PH - MT - 70, "F1", 10, MUTE);
    }

    const tableTop = PH - MT - (first ? titleH : 0);

    // Antèt kolòn yo
    cols.forEach((cc, ci) => {
      headCells[ci].forEach((ln, li) => {
        c += textOp(ln, colX[ci] + 3, tableTop - CS - li * lineH(CS), "F2", CS, DARK);
      });
    });
    c += rect(ML, tableTop - headH + 5, contentW, 1, GOLD);

    // Ranje yo
    let ry = topRows(first);
    pg.rows.forEach((ri) => {
      const r = rows[ri];
      cols.forEach((cc, ci) => {
        r.cells[ci].forEach((ln, li) => {
          const f = ci === 1 ? "F2" : "F1";
          const cr = ci === 1 ? DARK : BODY;
          c += textOp(ln, colX[ci] + 3, ry - CS - li * lineH(CS), f, CS, cr);
        });
      });
      c += rect(ML, ry - r.h + 3, contentW, 0.4, [0.88, 0.82, 0.74]);
      ry -= r.h;
    });

    // Liy vètikal ant kolòn yo
    for (let ci = 1; ci < cols.length; ci++) {
      c += rect(colX[ci] - 1, ry + 3, 0.4, tableTop - (ry + 3), [0.9, 0.85, 0.78]);
    }

    // Pye paj
    c += rect(ML, MB + 14, contentW, 0.7, [0.8, 0.74, 0.66]);
    c += textOp("Miss Thani - Make-Up & Lace Club", ML, MB, "F1", 9, MUTE);
    const pn = `Paj ${idx + 1} / ${total}`;
    c += textOp(pn, PW - MR - pn.length * charW(9), MB, "F1", 9, MUTE);
    return c;
  });

  // Asanble objè PDF yo
  const objects = [];
  const add = (body) => { objects.push(body); return objects.length; };

  const catalogNum = add("<< /Type /Catalog /Pages 2 0 R >>");
  // 2 = Pages (n ap ranpli apre)
  const pagesNum = add("");
  const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

  const pageNums = [];
  pageContents.forEach((content) => {
    const streamNum = add(`<< /Length ${content.length} >>\nstream\n${content}endstream`);
    const pageNum = add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${streamNum} 0 R >>`
    );
    pageNums.push(pageNum);
  });

  objects[pagesNum - 1] = `<< /Type /Pages /Kids [${pageNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageNums.length} >>`;

  // Ekri fichye a
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets[i] = pdf.length;
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((off) => {
    pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogNum} 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

  const buf = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) buf[i] = pdf.charCodeAt(i) & 0xff;
  return buf;
}

function downloadProspectsPdf(items, fmtDate) {
  try {
    const bytes = buildProspectsPdfBytes(items, fmtDate);
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nouvo-prospect.pdf";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
    return true;
  } catch (e) {
    return false;
  }
}

function openProspectsPdf(items, fmtDate) {
  try {
    const bytes = buildProspectsPdfBytes(items, fmtDate);
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (!w) {
      // si nouvo paj la bloke, eseye telechaje
      const a = document.createElement("a");
      a.href = url;
      a.download = "nouvo-prospect.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return true;
  } catch (e) {
    return false;
  }
}

/* Telechaje yon fichye CSV (louvri dirèk nan Excel) */
function downloadProspectsCsv(items, qCols, fmtDate) {
  try {
    const esc = (val) => {
      const s = String(val == null ? "" : val);
      // Si gen vigil, gimè, oswa nouvo liy — vlope l nan gimè
      if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const headers = ["Programme", "Dat", ...qCols];
    const lines = [headers.map(esc).join(",")];
    (items || []).forEach((p) => {
      const row = [
        p.program || "",
        fmtDate(p.updatedAt),
        ...qCols.map((q) => {
          const f = (p.answers || []).find((a) => (a.question || "").trim() === q);
          return f ? f.answer || "" : "";
        }),
      ];
      lines.push(row.map(esc).join(","));
    });
    // BOM pou Excel afiche aksan yo byen
    const csv = "\uFEFF" + lines.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "prospects-missthani.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return true;
  } catch (e) {
    return false;
  }
}
export default function MissThaniApp() {
  const [view, setView] = useState("public"); // "public" | "admin"
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  // Èske nou sou paj /formulaire la? (lyen separe pou lis prospè yo)
  const isFormulaire = typeof window !== "undefined" && /^\/formulaire\/?$/i.test(window.location.pathname || "");

  // Chaje konfigirasyon an o depa
  useEffect(() => {
    let active = true;
    (async () => {
      const c = await loadConfig();
      if (active) {
        const cfg = c || DEFAULT_CONFIG;
        if (!cfg.formFields || cfg.formFields.length === 0) cfg.formFields = DEFAULT_FORM_FIELDS;
        setConfig(cfg);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const persist = useCallback(async (cfg) => {
    setConfig(cfg);
    return await saveConfig(cfg);
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        background: `linear-gradient(160deg, ${PALETTE.bgTop} 0%, ${PALETTE.bgBottom} 100%)`,
        color: PALETTE.cream,
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        boxSizing: "border-box",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Inter:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        @keyframes mt-rise { from { opacity:0; transform: translateY(16px);} to { opacity:1; transform: translateY(0);} }
        @keyframes mt-fade { from { opacity:0;} to { opacity:1;} }
        .mt-rise { animation: mt-rise .6s cubic-bezier(.2,.7,.3,1) both; }
        .mt-fade { animation: mt-fade .8s ease both; }
        .mt-btn { transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease, background .18s ease; }
        .mt-option:hover { transform: translateY(-2px); border-color:${PALETTE.gold}; box-shadow:0 10px 30px rgba(0,0,0,.35); }
        .mt-option:focus-visible, .mt-input:focus-visible, button:focus-visible { outline:2px solid ${PALETTE.goldSoft}; outline-offset:2px; }
        .mt-input { background: #FFFFFF; border:1px solid ${PALETTE.line}; color:${PALETTE.cream}; border-radius:10px; padding:10px 12px; font-size:15px; font-family:'Inter',sans-serif; width:100%; }
        .mt-input::placeholder { color: rgba(58,14,51,.4); }
        textarea.mt-input { resize: vertical; min-height: 90px; line-height:1.5; }
        @media (prefers-reduced-motion: reduce){ .mt-rise,.mt-fade{ animation:none !important; } }
        /* ---- Vèsyon PDF (8.5 x 11) ---- */
        .pdf-page { width: 8.5in; min-height: 11in; background:#fff; color:#1d1620; padding: 0.7in 0.65in 0.9in; box-sizing: border-box; position: relative; margin: 0 auto 18px; box-shadow: 0 6px 24px rgba(0,0,0,.4); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .pdf-foot { position:absolute; bottom: 0.4in; left: 0.65in; right: 0.65in; display:flex; justify-content:space-between; font-size: 10px; color:#8a7d70; border-top:1px solid #e7ddd2; padding-top:6px; }
        @page { size: Letter; margin: 0; }
        @media print {
          body * { visibility: hidden !important; }
          #pdf-print-area, #pdf-print-area * { visibility: visible !important; }
          #pdf-print-area { position: absolute; left: 0; top: 0; width: 100%; }
          html, body { background:#fff !important; }
          .no-print { display: none !important; }
          .pdf-page { box-shadow: none; margin: 0; page-break-after: always; }
          .pdf-page:last-child { page-break-after: auto; }
        }
      `}</style>

      {loading ? (
        <Centered>
          <p style={{ color: `${PALETTE.cream}99` }}>Ap chaje…</p>
        </Centered>
      ) : isFormulaire ? (
        <ProspectsGate config={config} />
      ) : view === "admin" ? (
        <AdminSpace
          config={config}
          onSave={persist}
          onExit={() => setView("public")}
        />
      ) : (
        <PublicSpace config={config} onAdmin={() => setView("admin")} />
      )}
    </div>
  );
}

function Centered({ children }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {children}
    </div>
  );
}

function Brand({ small }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: small ? 24 : 34,
          fontWeight: 600,
          letterSpacing: ".5px",
          lineHeight: 1,
          color: "#7B2D8E",
        }}
      >
        Miss Thani
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: small ? 9 : 11,
          letterSpacing: "3px",
          textTransform: "uppercase",
          color: PALETTE.goldSoft,
        }}
      >
        Make-Up &amp; Lace Club
      </div>
    </div>
  );
}

/* ===================== ESPAS PIBLIK ===================== */
/* Kenbe pwogrè vizitè a nan telefòn li (pou si li fèmen paj la epi li tounen) */
const VISIT_KEY = "missthani_visit_v1";
function loadVisit() {
  try {
    if (typeof localStorage === "undefined") return null;
    const r = localStorage.getItem(VISIT_KEY);
    return r ? JSON.parse(r) : null;
  } catch (e) { return null; }
}
function saveVisit(data) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(VISIT_KEY, JSON.stringify(data));
  } catch (e) {}
}

function PublicSpace({ config, onAdmin }) {
  const programs = config.programs || [];
  // Li pwogrè ki te anrejistre a (yon sèl fwa, lè paj la louvri)
  const saved0 = useMemo(() => loadVisit(), []);

  const [revealed, setRevealed] = useState(() => (saved0 && saved0.selectedId ? programs.length : 0));
  const [selected, setSelected] = useState(() => {
    const id = saved0 && saved0.selectedId;
    return id ? (programs.find((p) => p.id === id) || null) : null;
  }); // pwogram chwazi
  const [screenIndex, setScreenIndex] = useState(() => (saved0 && saved0.screenIndex) || 0);
  const [formIdx, setFormIdx] = useState(0); // kesyon fòmilè aktyèl la (youn apre lòt)
  const [formError, setFormError] = useState(""); // mesaj erè fòmilè (nimewo pa bon, deja enskri…)
  const [checking, setChecking] = useState(false); // n ap tcheke nan Supabase
  const [formDone, setFormDone] = useState(() => !!(saved0 && saved0.formDone)); // vizitè a fin ranpli fòmilè a yon fwa
  const [answers, setAnswers] = useState(() => (saved0 && saved0.answers) || {}); // repons fòmilè yo (pa stepId)
  const sessionRef = useRef((saved0 && saved0.sessionId) || null); // idantifyan sesyon vizitè a

  // Estati swivi pèsonèl vizitè a (admin nan mete l) + modifikasyon nimewo
  const [myFollowup, setMyFollowup] = useState("");
  const [editPhone, setEditPhone] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [phoneErr, setPhoneErr] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);

  const delayMs = Math.max(0, (config.revealDelay ?? 3)) * 1000;

  // Lè paj la louvri, tcheke si admin nan mete yon estati swivi pou vizitè sa a
  useEffect(() => {
    let active = true;
    (async () => {
      if (!sessionRef.current) return;
      const rec = await loadProspectById(sessionRef.current);
      if (active && rec) setMyFollowup(rec.followup || "");
    })();
    return () => { active = false; };
  }, []);

  // Anrejistre pwogrè a chak fwa li chanje
  useEffect(() => {
    saveVisit({
      selectedId: selected ? selected.id : "",
      screenIndex,
      formDone,
      answers,
      sessionId: sessionRef.current,
    });
  }, [selected, screenIndex, formDone, answers]);

  useEffect(() => {
    if (selected) return;
    if (revealed >= programs.length) return;
    const t = setTimeout(() => setRevealed((n) => n + 1), revealed === 0 ? 800 : delayMs);
    return () => clearTimeout(t);
  }, [revealed, selected, programs.length, delayMs]);

  const steps = selected ? selected.steps || [] : [];
  // Chak etap = yon ekran. Chak ekran gen yon lis blòk (text, video, fòmilè, special, lyen).
  const screens = steps;
  const screen = screens[screenIndex];
  const blocks = screen ? getStepBlocks(screen) : [];
  const formBlock = blocks.find((b) => b.kind === "form");
  // Special ki gen bouton Wi/Pita (pa anons). Anons yo pa anpeche bouton "Swivan" parèt.
  const specialBlocks = blocks.filter((b) => b.kind === "special" && !b.banner);
  const hasForm = !!formBlock;
  const isLast = screenIndex >= screens.length - 1;

  const formFields = config.formFields || [];

  // Non vizitè a (premye non ki soti nan fòmilè a)
  const nameFieldG = formFields.find((f) => f.fieldType === "text") || formFields[0];
  const firstNameGlobal = nameFieldG ? ((answers[nameFieldG.id] || "").trim().split(/\s+/)[0] || "") : "";

  // Èske vizitè a fin ranpli fòmilè a? (tout chan yo gen yon repons)
  const formComplete = formFields.length === 0 || formFields.every((f) => (answers[f.id] || "").trim());

  // Anons: chak special ki make "anons", men SÈLMAN apre fòmilè a fin ranpli.
  // Yon fwa li parèt, li rete sou tout paj ki rete yo.
  const announcements = [];
  for (let i = 0; i <= screenIndex && i < screens.length; i++) {
    const bl = getStepBlocks(screens[i]);
    for (const b of bl) {
      if (b.kind === "special" && b.banner && formComplete) {
        const dat10 = formatHtDate(addDays(specialVideoStart(screens, b), 10));
        announcements.push({
          id: b.id + "-" + i,
          node: renderTemplate((b.tpl || "").trim() || DEFAULT_SPECIAL_TPL, {
            special: (b.specialName || "").trim() || "special sa a",
            dat: formatHtDate(b.reserveDate),
            dat10,
            non: firstNameGlobal,
          }),
        });
      }
    }
  }

  // Mesaj swivi pèsonèl (admin nan mete l nan paj prospè yo) — parèt anlè paj la
  const followupDat10 = formatHtDate(addDays(anyActiveVideoStart(programs), 10));
  const followupText = (myFollowup && FOLLOWUP_TPL[myFollowup])
    ? renderTemplate(FOLLOWUP_TPL[myFollowup], { non: firstNameGlobal || "", dat10: followupDat10, dat: "", special: "" })
    : "";

  const saveNewPhone = async () => {
    const v = validateHaitiPhone(newPhone);
    if (!v.ok) { setPhoneErr("Mete yon nimewo Ayiti ki valab — 8 chif ki kòmanse ak 2, 3 oswa 4."); return; }
    setSavingPhone(true);
    const ok = await updateProspectPhone(sessionRef.current, newPhone.trim());
    setSavingPhone(false);
    if (!ok) { setPhoneErr("Gen yon erè. Tanpri eseye ankò."); return; }
    const telField = formFields.find((f) => f.fieldType === "tel");
    if (telField) setAnswers((a) => ({ ...a, [telField.id]: newPhone.trim() }));
    setMyFollowup("");
    setEditPhone(false);
    setNewPhone("");
    setPhoneErr("");
  };

  const followupBanner = followupText ? (
    <div style={{ width: "100%", maxWidth: 460, margin: "0 auto 22px", zIndex: 2 }}>
      <div style={{ padding: "16px 18px", borderRadius: 16, border: `1.5px solid ${PALETTE.gold}`, background: `linear-gradient(135deg, ${PALETTE.gold}22, ${PALETTE.blush}1f)` }}>
        <div style={{ fontSize: 11, letterSpacing: "2px", textTransform: "uppercase", color: PALETTE.goldSoft, fontWeight: 700, marginBottom: 8 }}>★ Mesaj pou ou</div>
        <p style={{ fontSize: 15.5, lineHeight: 1.6, color: PALETTE.cream, margin: 0, whiteSpace: "pre-wrap" }}>{followupText}</p>
        {myFollowup === "wrong" && (
          <div style={{ marginTop: 14 }}>
            {!editPhone ? (
              <button className="mt-btn" onClick={() => { setEditPhone(true); setPhoneErr(""); }} style={{ ...goldBtn, width: "100%" }}>
                Modifye nimewo m
              </button>
            ) : (
              <div>
                <input
                  className="mt-input"
                  type="tel"
                  inputMode="tel"
                  placeholder="Nouvo nimewo telefòn"
                  value={newPhone}
                  onChange={(e) => { setNewPhone(e.target.value); if (phoneErr) setPhoneErr(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && newPhone.trim() && !savingPhone) saveNewPhone(); }}
                />
                {phoneErr && <p style={{ fontSize: 13.5, color: "#ff6b6b", margin: "8px 2px 0", lineHeight: 1.5 }}>{phoneErr}</p>}
                <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                  <button
                    className="mt-btn"
                    onClick={saveNewPhone}
                    onMouseDown={(e) => { if (newPhone.trim() && !savingPhone) e.preventDefault(); }}
                    disabled={savingPhone || !newPhone.trim()}
                    style={{ ...goldBtn, flex: 1, opacity: (savingPhone || !newPhone.trim()) ? 0.6 : 1 }}
                  >
                    {savingPhone ? "N ap voye…" : "Anrejistre"}
                  </button>
                  <button className="mt-btn" onClick={() => { setEditPhone(false); setNewPhone(""); setPhoneErr(""); }} style={{ ...ghostBtn }}>Anile</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  ) : null;

  // Reyajiste fòmilè a chak fwa nou chanje ekran + remonte anlè paj la (pou video a parèt)
  useEffect(() => {
    setFormIdx(0);
    setFormError("");
    if (typeof window !== "undefined") {
      try { window.scrollTo({ top: 0, behavior: "auto" }); } catch (e) { window.scrollTo(0, 0); }
    }
  }, [screenIndex, selected]);

  const choose = (p) => {
    // Chak pwogram endepandan: si w chwazi yon LÒT pwogram, kòmanse yon fòmilè fre
    // ak yon nouvo sesyon (konsa enfo yon pwogram pa antre nan yon lòt).
    const switching = !selected || selected.id !== p.id;
    setSelected(p);
    setScreenIndex(0);
    setFormIdx(0);
    if (switching) {
      setAnswers({});
      setFormDone(false);
      setFormError("");
      setMyFollowup("");
      sessionRef.current = uid() + Date.now().toString(36);
    } else if (!sessionRef.current) {
      sessionRef.current = uid() + Date.now().toString(36);
    }
  };
  const reset = () => {
    setSelected(null);
    setScreenIndex(0);
    setFormIdx(0);
    // Pa efase answers/formDone: konsa lè vizitè a tounen l ap toujou rekonèt li.
    setRevealed(programs.length); // pa bezwen retann reparèt la
  };

  // Anrejistre prospè a (repons fòmilè pataje yo + special ki gen valè)
  const persistProspect = (ans) => {
    if (!selected) return;
    const answered = [];
    formFields.forEach((f) => {
      const v = (ans[f.id] || "").trim();
      if (v) answered.push({ question: f.label || "Kesyon", answer: v });
    });
    (selected.steps || []).forEach((s) => {
      getStepBlocks(s).forEach((b) => {
        if (b.kind === "special") {
          const v = (ans[b.id] || "").trim();
          if (v) answered.push({ question: b.title || b.specialName || "Special", answer: v });
        }
      });
    });
    if (answered.length === 0) return;
    upsertProspect({
      id: sessionRef.current,
      program: selected.label,
      answers: answered,
      updatedAt: Date.now(),
    });
  };

  const goNext = () => {
    if (isLast) reset();
    else { setScreenIndex((i) => i + 1); setFormIdx(0); }
  };

  // Bouton prensipal "Kontinye" (sèlman lè pa gen fòmilè ni special)
  const advance = () => {
    persistProspect(answers);
    goNext();
  };

  // Fòmilè youn-apre-lòt: pase nan kesyon kap vini an, oswa fini
  const formNext = async () => {
    const cur = formFields[Math.min(formIdx, formFields.length - 1)];
    const curVal = (answers[cur && cur.id] || "").trim();

    // Validasyon nimewo telefòn Ayiti
    if (cur && cur.fieldType === "tel") {
      const v = validateHaitiPhone(curVal);
      if (!v.ok) {
        setFormError("Tanpri mete yon nimewo Ayiti ki valab — 8 chif ki kòmanse ak 2, 3 oswa 4 (egz: 34 12 34 56).");
        return;
      }
    }
    setFormError("");

    if (formIdx < formFields.length - 1) {
      setFormIdx((i) => i + 1);
      return;
    }

    // Dènye kesyon an — tcheke si nimewo a deja enskri anvan nou soumèt
    const telField = formFields.find((f) => f.fieldType === "tel");
    const telNorm = telField ? validateHaitiPhone(answers[telField.id] || "") : { ok: false };
    if (telField && telNorm.ok) {
      setChecking(true);
      const used = await phoneAlreadyUsed(telNorm.local);
      setChecking(false);
      if (used) {
        setFormError("Nimewo sa a deja enskri. Ou pa ka enskri de fwa ak menm nimewo telefòn nan.");
        setFormDone(true); // bloke: yo deja nan lis la, pa kreye yon doub
        return;
      }
    }

    setFormDone(true);
    persistProspect(answers);
    goNext();
  };

  // Repons sou yon blòk Special
  const respondSpecial = (block, val) => {
    const dt = formatHtDate(block.reserveDate);
    const ansVal =
      val === "Wi"
        ? `Enterese${block.specialName ? " - " + block.specialName : ""}${dt ? " (rezève: " + dt + ")" : ""}`
        : "Pa enterese kounye a";
    const newAns = { ...answers, [block.id]: ansVal };
    setAnswers(newAns);
    persistProspect(newAns);
    if (!hasForm) goNext();
  };

  // Èske nou montre gwo bouton "Kontinye" anba a? (pa lè gen fòmilè oswa special)
  const showMainBtn = !hasForm && specialBlocks.length === 0;
  const btnLabel = (screen?.buttonLabel || "").trim() || (isLast ? "Voye" : "Swivan");

  const blockTitle = (t) =>
    t ? <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 500, margin: "0 0 12px" }}>{t}</h2> : null;

  const renderPublicBlock = (b) => {
    if (b.kind === "text") {
      return (
        <>
          {blockTitle(b.title)}
          {b.text && (
            <p style={{ fontSize: 16, lineHeight: 1.6, color: `${PALETTE.cream}e6`, margin: 0, whiteSpace: "pre-wrap" }}>{b.text}</p>
          )}
        </>
      );
    }
    if (b.kind === "video") {
      const url = activeVideoUrl({ videoUrl: b.url, schedule: b.schedule });
      return (
        <>
          {blockTitle(b.title)}
          {url ? <VideoBlock url={url} orient={b.orient || "auto"} /> : <p style={{ fontSize: 15, color: `${PALETTE.cream}aa`, margin: 0 }}>Video a ap vini byento.</p>}
        </>
      );
    }
    if (b.kind === "link") {
      const isIntern = b.linkMode === "intern";
      const openTheLink = () => {
        if (isIntern) {
          if (!b.targetProgram) { reset(); return; } // tounen sou paj chwazi pwogram nan
          const prog = programs.find((pp) => pp.id === b.targetProgram);
          if (prog) {
            setSelected(prog);
            const st = parseInt(b.targetStep, 10);
            setScreenIndex(st && st >= 1 ? st - 1 : 0);
            setFormIdx(0);
            if (typeof window !== "undefined") { try { window.scrollTo({ top: 0, behavior: "auto" }); } catch (e) { window.scrollTo(0, 0); } }
          }
          return;
        }
        const u = normalizeLink(b.url);
        if (!u) return;
        if (b.sameTab) window.location.href = u;
        else window.open(u, "_blank", "noopener,noreferrer");
      };
      const disabledLink = isIntern ? false : !(b.url || "").trim();
      return (
        <>
          {blockTitle(b.title)}
          <button
            type="button"
            className="mt-btn"
            onClick={openTheLink}
            onMouseDown={(e) => { if (!disabledLink) e.preventDefault(); }}
            disabled={disabledLink}
            style={{ ...goldBtn, width: "100%", textAlign: "center", cursor: disabledLink ? "not-allowed" : "pointer", opacity: disabledLink ? 0.5 : 1, position: "relative", zIndex: 60 }}
          >
            {(b.label || "").trim() || "Klike isit la"}
          </button>
        </>
      );
    }
    if (b.kind === "special") {
      if (b.banner) return null; // anons yo parèt anlè paj la, pa anndan blòk la
      const sName = (b.specialName || "").trim();
      const reserveTxt = formatHtDate(b.reserveDate);
      const dat10Txt = formatHtDate(addDays(specialVideoStart(screens, b), 10));
      const nameField = formFields.find((f) => f.fieldType === "text") || formFields[0];
      const firstName = nameField ? ((answers[nameField.id] || "").trim().split(/\s+/)[0] || "") : "";
      const answered = (answers[b.id] || "").trim();
      return (
        <>
          {blockTitle(b.title)}
          <p style={{ fontSize: 16, lineHeight: 1.6, color: `${PALETTE.cream}e6`, margin: 0, whiteSpace: "pre-wrap" }}>
            {renderTemplate((b.tpl || "").trim() || DEFAULT_SPECIAL_TPL, { special: sName || "special sa a", dat: reserveTxt, dat10: dat10Txt, non: firstName })}
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap", position: "relative", zIndex: 60 }}>
            <button className="mt-btn" onClick={() => respondSpecial(b, "Wi")} style={{ ...goldBtn, position: "relative", zIndex: 60 }}>
              {(b.buttonLabel || "").trim() || "Wi, mwen enterese"}
            </button>
            <button className="mt-btn" onClick={() => respondSpecial(b, "Pita")} style={{ ...ghostBtn, position: "relative", zIndex: 60 }}>Pita</button>
          </div>
          {answered && <p style={{ fontSize: 13, color: PALETTE.goldSoft, margin: "8px 0 0" }}>✓ {answered}</p>}
        </>
      );
    }
    if (b.kind === "form") {
      if (formFields.length === 0) {
        return <p style={{ fontSize: 14, color: `${PALETTE.cream}99`, margin: 0 }}>Pa gen kesyon fòmilè ankò.</p>;
      }
      // Si vizitè a deja soumèt fòmilè a (oswa nimewo a deja enskri):
      // montre yon mesaj olye fòmilè a, ak yon bouton Swivan pou kontinye.
      if (formDone && formComplete) {
        const doneMsg = formError || "✓ Ou deja ranpli fòmilè sa a. Ou ka kontinye.";
        return (
          <>
            {blockTitle(b.title)}
            <div style={{ padding: "14px 16px", borderRadius: 12, border: `1px solid ${PALETTE.gold}`, background: "rgba(224,165,10,.10)" }}>
              <p style={{ fontSize: 15.5, color: PALETTE.cream, margin: 0, lineHeight: 1.5 }}>
                {doneMsg}
              </p>
            </div>
            <div style={{ marginTop: 14, position: "relative", zIndex: 60 }}>
              <button
                className="mt-btn"
                onClick={goNext}
                onMouseDown={(e) => e.preventDefault()}
                style={{ ...goldBtn, width: "100%", position: "relative", zIndex: 60 }}
              >
                {isLast ? "Voye" : "Swivan"}
              </button>
            </div>
          </>
        );
      }
      const f = formFields[Math.min(formIdx, formFields.length - 1)];
      const val = answers[f.id] || "";
      const empty = !val.trim();
      const isLastQ = formIdx >= formFields.length - 1;
      return (
        <>
          {blockTitle(b.title)}
          <p style={{ fontSize: 12, color: `${PALETTE.cream}77`, margin: "0 0 8px" }}>
            Kesyon {formIdx + 1} / {formFields.length}
          </p>
          <label style={{ display: "block", fontSize: 19.5, fontWeight: 700, color: PALETTE.cream, marginBottom: 10, lineHeight: 1.35 }}>{f.label}</label>
          <input
            className="mt-input"
            {...inputProps(f.fieldType)}
            value={val}
            onChange={(e) => { setAnswers((a) => ({ ...a, [f.id]: e.target.value })); if (formError) setFormError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !empty && !checking) formNext(); }}
          />
          {formError && (
            <p style={{ fontSize: 13.5, color: "#ff6b6b", margin: "8px 2px 0", lineHeight: 1.5 }}>{formError}</p>
          )}
          <div style={{ marginTop: 14, position: "relative", zIndex: 60 }}>
            <button
              className="mt-btn"
              onClick={formNext}
              onMouseDown={(e) => { if (!empty && !checking) e.preventDefault(); }}
              disabled={empty || checking}
              style={{ ...goldBtn, width: "100%", opacity: (empty || checking) ? 0.6 : 1, cursor: (empty || checking) ? "not-allowed" : "pointer", position: "relative", zIndex: 60 }}
            >
              {checking ? "N ap verifye…" : (isLastQ ? (isLast ? "Voye" : "Swivan") : "Kontinye")}
            </button>
          </div>
        </>
      );
    }
    return null;
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px 150px", position: "relative" }}>
      <div aria-hidden style={{ position: "absolute", top: "-18%", left: "50%", transform: "translateX(-50%)", width: 520, height: 520, background: `radial-gradient(circle, ${PALETTE.blush}1f 0%, transparent 70%)`, pointerEvents: "none" }} />

      {followupBanner}

      <div className="mt-fade" style={{ marginBottom: 34, zIndex: 1 }}>
        <Brand />
      </div>

      {!selected ? (
        <div style={{ width: "100%", maxWidth: 420, zIndex: 1 }}>
          <h1 className="mt-rise" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, fontWeight: 500, textAlign: "center", margin: "0 0 28px", lineHeight: 1.25 }}>
            {config.question}
          </h1>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {programs.slice(0, revealed).map((p) => (
              <button
                key={p.id}
                className="mt-option mt-rise mt-btn"
                onClick={() => choose(p)}
                style={{ width: "100%", padding: "16px 22px", borderRadius: 14, border: `1px solid ${PALETTE.line}`, background: "rgba(194,35,142,.05)", color: PALETTE.cream, fontSize: 17, fontWeight: 500, cursor: "pointer", textAlign: "left" }}
              >
                {p.label}
              </button>
            ))}
          </div>
          {revealed < programs.length && (
            <p className="mt-fade" style={{ textAlign: "center", marginTop: 22, fontSize: 13, color: `${PALETTE.cream}88` }}>
              Tann yon ti kras…
            </p>
          )}
        </div>
      ) : (
        <div className="mt-fade" style={{ width: "100%", maxWidth: 460, zIndex: 1 }}>
          {announcements.length > 0 && !followupText && (
            <div style={{ position: "sticky", top: 0, zIndex: 40, marginBottom: 16, paddingTop: 8, paddingBottom: 10, background: PALETTE.bgTop, borderRadius: 14, boxShadow: `0 10px 14px -8px ${PALETTE.bgTop}` }}>
              {announcements.map((a) => (
                <div
                  key={a.id}
                  className="mt-rise"
                  style={{
                    marginBottom: 8,
                    padding: "14px 16px",
                    borderRadius: 14,
                    border: `1px solid ${PALETTE.gold}`,
                    background: `linear-gradient(135deg, rgba(224,165,10,.18), rgba(194,35,142,.14)), #FFFFFF`,
                    boxShadow: "0 8px 22px rgba(142,44,154,.20)",
                  }}
                >
                  <div style={{ fontSize: 10, letterSpacing: "2px", textTransform: "uppercase", color: PALETTE.gold, fontWeight: 700, marginBottom: 6 }}>
                    ★ Anons
                  </div>
                  <p style={{ fontSize: 14.5, color: PALETTE.cream, margin: 0, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                    {a.node}
                  </p>
                </div>
              ))}
            </div>
          )}
          <p style={{ textAlign: "center", fontSize: 12, letterSpacing: "2px", textTransform: "uppercase", color: PALETTE.gold, marginBottom: 14 }}>
            {selected.label}
          </p>

          {screens.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 20px", border: `1px solid ${PALETTE.line}`, borderRadius: 16, background: "rgba(194,35,142,.045)" }}>
              <p style={{ fontSize: 16, color: `${PALETTE.cream}cc`, margin: 0 }}>
                Enfòmasyon yo ap vini byento.
              </p>
            </div>
          ) : (
            <div key={screenIndex} className="mt-rise" style={{ padding: "26px 24px", border: `1px solid ${PALETTE.lineStrong}`, borderRadius: 16, background: "rgba(194,35,142,.05)" }}>
              {screens.length > 1 && (
                <p style={{ fontSize: 12, color: `${PALETTE.cream}77`, margin: "0 0 10px" }}>
                  Etap {screenIndex + 1} / {screens.length}
                </p>
              )}

              {/* Blòk yo, youn apre lòt, nan lòd admin nan mete yo */}
              {blocks.length === 0 ? (
                <p style={{ fontSize: 15, color: `${PALETTE.cream}aa`, margin: 0 }}>Etap sa a vid pou kounye a.</p>
              ) : (
                blocks.map((b, bi) => (
                  <div key={b.id} style={{ marginTop: bi === 0 ? 0 : 18 }}>
                    {renderPublicBlock(b)}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Navigasyon */}
          {screens.length > 0 && (
            <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "space-between", position: "relative", zIndex: 60 }}>
              <button
                className="mt-btn"
                onClick={screenIndex > 0 ? () => setScreenIndex((i) => i - 1) : reset}
                style={{ ...ghostBtn, position: "relative", zIndex: 60 }}
              >
                {screenIndex > 0 ? "Anvan" : "Tounen"}
              </button>

              {showMainBtn && (
                <button
                  className="mt-btn"
                  onClick={advance}
                  style={{ ...goldBtn, position: "relative", zIndex: 60 }}
                >
                  {btnLabel}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ANTRE SEKRÈ ADMIN — pa gen okenn bouton vizib.
          Kenbe dwèt ou nan kwen anba adwat la pou 10 segond. */}
      <SecretAdminTrigger onTrigger={onAdmin} holdMs={10000} />
    </div>
  );
}

/* Zòn envizib nan kwen anba adwat la. Kenbe dwèt 10 sek pou louvri admin.
   Pa gen okenn siy ki parèt — envizib nèt. */
function SecretAdminTrigger({ onTrigger, holdMs = 10000 }) {
  const timerRef = useRef(null);

  const stop = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  useEffect(() => () => stop(), [stop]);

  const start = (e) => {
    if (e && e.cancelable) e.preventDefault();
    // kenbe pwentè a sou eleman an menm si dwèt/souri a deplase yon ti kras
    try { if (e.currentTarget.setPointerCapture && e.pointerId != null) e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    if (timerRef.current) return; // deja ap kouri (evite double sou iPhone)
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onTrigger();
    }, holdMs);
  };

  return (
    <div
      onPointerDown={start}
      onPointerUp={stop}
      onPointerCancel={stop}
      onTouchStart={start}
      onTouchEnd={stop}
      onTouchCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      aria-hidden="true"
      style={{
        position: "fixed",
        bottom: 0,   // nan kwen anba dwat la
        right: 0,
        width: 110,
        height: 110,
        zIndex: 50,
        background: "transparent",
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
        cursor: "default",
      }}
    />
  );
}

/* Konvèti yon chwa fòma an de chif (lajè, wotè) */
function ratioWH(orient) {
  switch (orient) {
    case "9:16":
    case "portrait":
      return [9, 16];
    case "1242:2208":
      return [1242, 2208];
    case "720:974":
      return [720, 974];
    case "3:4":
      return [3, 4];
    case "4:5":
      return [4, 5];
    case "1:1":
      return [1, 1];
    case "16:9":
    case "landscape":
      return [16, 9];
    default:
      return null; // "auto"
  }
}

/* Montre video a dirèkteman, gwo nan ekran an, adapte ak nenpòt fòma */
function VideoBlock({ url, orient = "auto" }) {
  const v = getVideoEmbed(url);

  // Pou "auto" san deteksyon: vètikal sou telefòn, orizontal sou òdinatè
  const [isNarrow, setIsNarrow] = useState(
    typeof window !== "undefined" ? window.innerWidth < 700 : false
  );
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 700);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Pou fichye videyo dirèk (mp4): detekte vrè dimansyon yo apre l chaje
  const [detected, setDetected] = useState(null);
  const onMeta = (e) => {
    const vid = e.target;
    if (vid && vid.videoWidth && vid.videoHeight) {
      setDetected({ w: vid.videoWidth, h: vid.videoHeight });
    }
  };

  if (!v) return null;

  // Detèmine lajè/wotè bwat la:
  // 1) Si nou detekte vrè dimansyon video a (mp4) → sèvi avè yo (pafè).
  // 2) Sinon, chwa admin an (orient).
  // 3) Sinon, sa getVideoEmbed di (TikTok=vètikal, YouTube=orizontal).
  // 4) Sinon otomatik selon gwosè ekran.
  let w, h;
  if (detected) {
    w = detected.w;
    h = detected.h;
  } else {
    let r = ratioWH(orient);
    if (!r) r = ratioWH(v.orientation);
    if (!r) r = isNarrow ? [9, 16] : [16, 9];
    [w, h] = r;
  }

  const ratioNum = w / h;
  const isPortrait = ratioNum < 1;

  // Bwat la: kenbe vrè fòma a, men pa janm depase lajè paj la ni 80% wotè ekran an
  const frameWrap = {
    position: "relative",
    width: "100%",
    maxWidth: isPortrait ? `min(380px, calc(80vh * ${ratioNum}))` : 760,
    margin: "16px auto 0",
    aspectRatio: `${w} / ${h}`,
    borderRadius: 14,
    overflow: "hidden",
    border: `1px solid ${PALETTE.line}`,
    background: "#000",
  };

  const fill = { position: "absolute", inset: 0, width: "100%", height: "100%", border: "none", objectFit: "contain", background: "#000" };

  if (v.type === "video") {
    return (
      <div style={frameWrap}>
        <video controls playsInline onLoadedMetadata={onMeta} style={fill}>
          <source src={v.src} />
        </video>
      </div>
    );
  }

  return (
    <div style={frameWrap}>
      <iframe
        src={v.src}
        title="Video"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="no-referrer-when-downgrade"
        style={fill}
      />
    </div>
  );
}

/* ===================== ESPAS ADMIN ===================== */
function AdminSpace({ config, onSave, onExit }) {
  const [authed, setAuthed] = useState(false);
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState("");

  // kopi travay la (n ap anrejistre lè admin klike)
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(config)));
  const [savedAt, setSavedAt] = useState(null);
  const [openProgs, setOpenProgs] = useState(() => {
    const first = config.programs?.[0]?.id;
    return first ? { [first]: true } : {};
  }); // pwogram ki louvri yo (plizyè ka louvri alafwa)
  const toggleProg = (pid) => setOpenProgs((o) => ({ ...o, [pid]: !o[pid] }));
  const [adminTab, setAdminTab] = useState("editor"); // "editor" | "prospects"
  const [collapsed, setCollapsed] = useState({}); // blòk ki pliye yo (pa id)
  const toggleCollapse = (bid) => setCollapsed((c) => ({ ...c, [bid]: !c[bid] }));

  const tryLogin = () => {
    if (pwd === ADMIN_PASSWORD) {
      setAuthed(true);
      setErr("");
    } else {
      setErr("Modpas la pa kòrèk.");
    }
  };

  const save = async () => {
    const ok = await onSave(draft);
    setSavedAt(ok ? "ok" : "fail");
    setTimeout(() => setSavedAt(null), 2500);
  };

  /* ---- editè aksyon ---- */
  const updateProgram = (pid, patch) =>
    setDraft((d) => ({ ...d, programs: d.programs.map((p) => (p.id === pid ? { ...p, ...patch } : p)) }));

  const addProgram = () => {
    const np = { id: uid(), label: "Nouvo programme", steps: [] };
    setDraft((d) => ({ ...d, programs: [...d.programs, np] }));
    setOpenProgs((o) => ({ ...o, [np.id]: true })); // louvri nouvo pwogram nan otomatikman
  };

  const removeProgram = (pid) =>
    setDraft((d) => ({ ...d, programs: d.programs.filter((p) => p.id !== pid) }));

  const addStep = (pid) =>
    updateProgramSteps(pid, (steps) => [...steps, { id: uid(), blocks: [], buttonLabel: "" }]);

  // ---- jesyon blòk anndan yon etap ----
  const setStepBlocks = (pid, sid, fn) =>
    updateProgramSteps(pid, (steps) => steps.map((s) => (s.id === sid ? { ...s, blocks: fn(getStepBlocks(s)) } : s)));
  const addBlock = (pid, sid, kind) => setStepBlocks(pid, sid, (bl) => [...bl, newBlock(kind)]);
  const updateBlock = (pid, sid, bid, patch) => setStepBlocks(pid, sid, (bl) => bl.map((b) => (b.id === bid ? { ...b, ...patch } : b)));
  const removeBlock = (pid, sid, bid) => setStepBlocks(pid, sid, (bl) => bl.filter((b) => b.id !== bid));
  const moveBlock = (pid, sid, idx, dir) =>
    setStepBlocks(pid, sid, (bl) => {
      const j = idx + dir;
      if (j < 0 || j >= bl.length) return bl;
      const c = [...bl];
      [c[idx], c[j]] = [c[j], c[idx]];
      return c;
    });
  // pwogram videyo pa dat (anndan yon blòk videyo)
  const updateBlockSchedule = (pid, sid, bid, fn) =>
    setStepBlocks(pid, sid, (bl) => bl.map((b) => (b.id === bid ? { ...b, schedule: fn(b.schedule || []) } : b)));
  const addBlockSlot = (pid, sid, bid) => updateBlockSchedule(pid, sid, bid, (arr) => [...arr, { id: uid(), start: "", end: "", url: "" }]);
  const updateBlockSlot = (pid, sid, bid, slid, patch) => updateBlockSchedule(pid, sid, bid, (arr) => arr.map((x) => (x.id === slid ? { ...x, ...patch } : x)));
  const removeBlockSlot = (pid, sid, bid, slid) => updateBlockSchedule(pid, sid, bid, (arr) => arr.filter((x) => x.id !== slid));

  const updateStep = (pid, sid, patch) =>
    updateProgramSteps(pid, (steps) => steps.map((s) => (s.id === sid ? { ...s, ...patch } : s)));

  const removeStep = (pid, sid) =>
    updateProgramSteps(pid, (steps) => steps.filter((s) => s.id !== sid));

  const moveStep = (pid, idx, dir) =>
    updateProgramSteps(pid, (steps) => {
      const j = idx + dir;
      if (j < 0 || j >= steps.length) return steps;
      const copy = [...steps];
      [copy[idx], copy[j]] = [copy[j], copy[idx]];
      return copy;
    });

  function updateProgramSteps(pid, fn) {
    setDraft((d) => ({ ...d, programs: d.programs.map((p) => (p.id === pid ? { ...p, steps: fn(p.steps || []) } : p)) }));
  }

  /* ---- pwogram videyo pa dat ---- */
  const updateSchedule = (pid, sid, fn) =>
    updateProgramSteps(pid, (steps) => steps.map((s) => (s.id === sid ? { ...s, schedule: fn(s.schedule || []) } : s)));
  const addSlot = (pid, sid) =>
    updateSchedule(pid, sid, (arr) => [...arr, { id: uid(), start: "", end: "", url: "" }]);
  const updateSlot = (pid, sid, slid, patch) =>
    updateSchedule(pid, sid, (arr) => arr.map((x) => (x.id === slid ? { ...x, ...patch } : x)));
  const removeSlot = (pid, sid, slid) =>
    updateSchedule(pid, sid, (arr) => arr.filter((x) => x.id !== slid));

  /* ---- kesyon fòmilè pataje yo (yon sèl fwa) ---- */
  const updateFormFields = (fn) => setDraft((d) => ({ ...d, formFields: fn(d.formFields || []) }));
  const addFormField = () => updateFormFields((arr) => [...arr, { id: uid(), label: "", fieldType: "text" }]);
  const updateFormField = (fid, patch) => updateFormFields((arr) => arr.map((f) => (f.id === fid ? { ...f, ...patch } : f)));
  const removeFormField = (fid) => updateFormFields((arr) => arr.filter((f) => f.id !== fid));
  const moveFormField = (idx, dir) =>
    updateFormFields((arr) => {
      const j = idx + dir;
      if (j < 0 || j >= arr.length) return arr;
      const copy = [...arr];
      [copy[idx], copy[j]] = [copy[j], copy[idx]];
      return copy;
    });

  /* ---- etikèt yo (admin nan kreye yo nan paj prospè a) ---- */
  const saveAgents = async (list) => {
    const nd = { ...draft, agents: list };
    setDraft(nd);
    await onSave(nd);
  };

  /* ---- login ekran ---- */
  if (!authed) {
    return (
      <Centered>
        <div className="mt-fade" style={{ width: "100%", maxWidth: 360, padding: "0 20px" }}>
          <div style={{ marginBottom: 28 }}>
            <Brand small />
          </div>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 500, textAlign: "center", margin: "0 0 18px" }}>
            Espas Administrasyon
          </h1>
          <input
            className="mt-input"
            type="password"
            placeholder="Modpas"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && tryLogin()}
            autoFocus
          />
          {err && <p style={{ color: PALETTE.danger, fontSize: 13, margin: "10px 0 0" }}>{err}</p>}
          <button className="mt-btn" onClick={tryLogin} style={{ ...goldBtn, width: "100%", marginTop: 14 }}>
            Antre
          </button>
          <button onClick={onExit} style={{ ...ghostBtn, width: "100%", marginTop: 10 }}>
            Tounen sou paj piblik la
          </button>
        </div>
      </Centered>
    );
  }

  /* ---- editè a ---- */
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "28px 18px 80px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22, gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600 }}>Espas Administrasyon</div>
          <div style={{ fontSize: 12, color: PALETTE.gold, letterSpacing: "1px" }}>Miss Thani — Make-Up &amp; Lace Club</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {adminTab === "prospects" ? (
            <button onClick={() => setAdminTab("editor")} style={ghostBtn}>Editè</button>
          ) : (
            <button onClick={() => setAdminTab("prospects")} style={goldBtn}>Nouvo Prospect</button>
          )}
          <button onClick={onExit} style={ghostBtn}>Wè paj piblik</button>
          <button onClick={() => setAuthed(false)} style={ghostBtn}>Sòti</button>
        </div>
      </div>

      {adminTab === "prospects" ? (
        <ProspectsView agents={draft.agents || []} isAdmin={true} onSaveAgents={saveAgents} />
      ) : (
        <>
      {/* Paramèt jeneral */}
      <Section title="Paramèt jeneral">
        <label style={labelStyle}>Kesyon ki parèt sou paj la</label>
        <input className="mt-input" value={draft.question} onChange={(e) => setDraft((d) => ({ ...d, question: e.target.value }))} />
        <label style={{ ...labelStyle, marginTop: 14 }}>Segond ant chak opsyon</label>
        <input
          className="mt-input"
          type="number"
          min="0"
          step="0.5"
          style={{ maxWidth: 140 }}
          value={draft.revealDelay}
          onChange={(e) => setDraft((d) => ({ ...d, revealDelay: Number(e.target.value) || 0 }))}
        />
      </Section>

      {/* Kesyon fòmilè pataje yo */}
      <Section title="Kesyon Fòmilè (prepare yon sèl fwa)">
        <p style={{ fontSize: 13, color: `${PALETTE.cream}99`, margin: "0 0 14px" }}>
          Ekri kesyon fòmilè yo isit la yon sèl fwa. Chak fwa ou ajoute yon etap <strong>Fòmilè</strong> nan yon programme, menm kesyon sa yo ap monte otomatikman.
        </p>
        {(draft.formFields || []).map((f, idx) => (
          <div key={f.id} style={{ border: `1px solid ${PALETTE.line}`, borderRadius: 10, padding: 12, marginBottom: 10, background: "rgba(194,35,142,.035)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: PALETTE.goldSoft, letterSpacing: "1px" }}>KESYON {idx + 1}</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => moveFormField(idx, -1)} disabled={idx === 0} style={miniBtn(idx === 0)}>↑</button>
                <button onClick={() => moveFormField(idx, 1)} disabled={idx === (draft.formFields.length - 1)} style={miniBtn(idx === (draft.formFields.length - 1))}>↓</button>
                <button onClick={() => removeFormField(f.id)} style={miniDanger}>✕</button>
              </div>
            </div>
            <input className="mt-input" placeholder="Kesyon an (egz: Non konplè, Nimewo telefòn)" value={f.label} onChange={(e) => updateFormField(f.id, { label: e.target.value })} />
            <label style={{ ...labelStyle, marginTop: 8 }}>Kalite repons</label>
            <select className="mt-input" value={f.fieldType || "text"} onChange={(e) => updateFormField(f.id, { fieldType: e.target.value })}>
              <option value="text">Tèks</option>
              <option value="tel">Telefòn</option>
              <option value="email">Imèl</option>
              <option value="number">Nimewo</option>
            </select>
          </div>
        ))}
        <button onClick={addFormField} style={{ ...ghostBtn, width: "100%" }}>+ Ajoute yon kesyon fòmilè</button>
      </Section>

      {/* Pwogram yo */}
      <Section title="Programme yo ak etap yo">
        <p style={{ fontSize: 13, color: `${PALETTE.cream}99`, margin: "0 0 16px" }}>
          Pou chak programme, ajoute etap moun nan ap wè youn apre lòt. Chak etap gen yon tit ak yon mesaj.
        </p>

        {draft.programs.map((p) => {
          const open = !!openProgs[p.id];
          return (
            <div key={p.id} style={{ border: `1px solid ${PALETTE.line}`, borderRadius: 12, marginBottom: 12, overflow: "hidden" }}>
              <button
                onClick={() => toggleProg(p.id)}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: open ? "rgba(194,35,142,.07)" : "transparent", border: "none", color: PALETTE.cream, cursor: "pointer", fontSize: 16, fontWeight: 500, textAlign: "left" }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ color: PALETTE.gold, fontSize: 13 }}>{open ? "▾" : "▸"}</span>
                  {p.label || "San non"}
                </span>
                <span style={{ fontSize: 12, color: PALETTE.gold }}>
                  {(p.steps || []).length} etap
                </span>
              </button>

              {open && (
                <div style={{ padding: "4px 16px 18px" }}>
                  <label style={labelStyle}>Non programme nan</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input className="mt-input" value={p.label} onChange={(e) => updateProgram(p.id, { label: e.target.value })} />
                    <button onClick={() => removeProgram(p.id)} style={{ ...dangerBtn, whiteSpace: "nowrap" }}>Efase</button>
                  </div>

                  <div style={{ marginTop: 18 }}>
                    {(p.steps || []).map((s, idx) => {
                      const blocks = getStepBlocks(s);
                      return (
                        <div key={s.id} style={{ border: `1px solid ${PALETTE.line}`, borderRadius: 10, padding: 14, marginBottom: 12, background: "rgba(194,35,142,.035)" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                            <span style={{ fontSize: 12, color: PALETTE.gold, letterSpacing: "1px" }}>ETAP {idx + 1}</span>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button onClick={() => moveStep(p.id, idx, -1)} disabled={idx === 0} style={miniBtn(idx === 0)}>↑</button>
                              <button onClick={() => moveStep(p.id, idx, 1)} disabled={idx === p.steps.length - 1} style={miniBtn(idx === p.steps.length - 1)}>↓</button>
                              <button onClick={() => removeStep(p.id, s.id)} style={miniDanger}>✕</button>
                            </div>
                          </div>

                          {/* Blòk yo nan etap sa a */}
                          {blocks.length === 0 && (
                            <p style={{ fontSize: 13, color: `${PALETTE.cream}88`, margin: "0 0 10px" }}>
                              Etap sa a vid. Ajoute yon blòk anba a (Tèks, Videyo, Fòmilè, Special, oswa Lyen).
                            </p>
                          )}

                          {blocks.map((b, bi) => (
                            <div key={b.id} style={{ border: `1px solid ${PALETTE.line}`, borderRadius: 9, padding: 12, marginBottom: 10, background: "rgba(194,35,142,.04)" }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: collapsed[b.id] ? 0 : 8 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <button onClick={() => toggleCollapse(b.id)} style={miniBtn(false)} aria-label="Pliye oswa depliye blòk la">{collapsed[b.id] ? "▸" : "▾"}</button>
                                  <span style={{ fontSize: 11, color: PALETTE.goldSoft, letterSpacing: "1px", fontWeight: 700 }}>
                                    {({ text: "TÈKS", video: "VIDEYO", form: "FÒMILÈ", special: "SPECIAL", link: "LYEN" })[b.kind]}
                                  </span>
                                </div>
                                <div style={{ display: "flex", gap: 6 }}>
                                  <button onClick={() => moveBlock(p.id, s.id, bi, -1)} disabled={bi === 0} style={miniBtn(bi === 0)}>↑</button>
                                  <button onClick={() => moveBlock(p.id, s.id, bi, 1)} disabled={bi === blocks.length - 1} style={miniBtn(bi === blocks.length - 1)}>↓</button>
                                  <button onClick={() => removeBlock(p.id, s.id, b.id)} style={miniDanger}>✕</button>
                                </div>
                              </div>

                              {!collapsed[b.id] && b.kind === "text" && (
                                <>
                                  <input className="mt-input" placeholder="Tit — opsyonèl" value={b.title || ""} onChange={(e) => updateBlock(p.id, s.id, b.id, { title: e.target.value })} />
                                  <textarea className="mt-input" style={{ marginTop: 8 }} placeholder="Tèks / mesaj moun nan ap wè…" value={b.text || ""} onChange={(e) => updateBlock(p.id, s.id, b.id, { text: e.target.value })} />
                                </>
                              )}

                              {!collapsed[b.id] && b.kind === "video" && (
                                <>
                                  <input className="mt-input" placeholder="Tit — opsyonèl" value={b.title || ""} onChange={(e) => updateBlock(p.id, s.id, b.id, { title: e.target.value })} />
                                  <label style={{ ...labelStyle, marginTop: 10 }}>Videyo default (toujou, si okenn dat pa koresponn)</label>
                                  <input className="mt-input" placeholder="Lien video (YouTube, TikTok, Bunny, mp4)" value={b.url || ""} onChange={(e) => updateBlock(p.id, s.id, b.id, { url: e.target.value })} />
                                  <label style={{ ...labelStyle, marginTop: 10 }}>Fòma videyo a</label>
                                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                    {[
                                      { k: "auto", lbl: "Otomatik" },
                                      { k: "9:16", lbl: "Vètikal 9:16 (TikTok)" },
                                      { k: "720:974", lbl: "720 × 974" },
                                      { k: "3:4", lbl: "Vètikal 3:4" },
                                      { k: "4:5", lbl: "Vètikal 4:5" },
                                      { k: "1:1", lbl: "Kare 1:1" },
                                      { k: "16:9", lbl: "Orizontal 16:9" },
                                    ].map((opt) => {
                                      const cur = b.orient || "auto";
                                      const on = cur === opt.k;
                                      return (
                                        <button
                                          key={opt.k}
                                          onClick={() => updateBlock(p.id, s.id, b.id, { orient: opt.k })}
                                          style={{
                                            padding: "7px 11px",
                                            borderRadius: 9,
                                            fontSize: 12,
                                            fontWeight: 600,
                                            cursor: "pointer",
                                            border: on ? `1px solid ${PALETTE.magenta}` : `1px solid ${PALETTE.line}`,
                                            background: on ? PALETTE.magenta : "transparent",
                                            color: on ? "#fff" : `${PALETTE.cream}cc`,
                                          }}
                                        >
                                          {opt.lbl}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <p style={{ fontSize: 11, color: `${PALETTE.cream}77`, margin: "6px 0 0" }}>
                                    Si se yon fichye mp4 dirèk, fòma a detekte otomatikman. Pou Bunny/YouTube, chwazi fòma a la.
                                  </p>
                                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${PALETTE.line}` }}>
                                    <label style={labelStyle}>Pwogram videyo pa dat</label>
                                    {(b.schedule || []).map((sl) => (
                                      <div key={sl.id} style={{ border: `1px solid ${PALETTE.line}`, borderRadius: 9, padding: 10, marginBottom: 8, background: "rgba(194,35,142,.035)" }}>
                                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                          <div style={{ flex: 1, minWidth: 130 }}>
                                            <span style={{ fontSize: 11, color: `${PALETTE.cream}88` }}>Soti</span>
                                            <input className="mt-input" type="date" style={{ colorScheme: "light" }} value={sl.start || ""} onChange={(e) => updateBlockSlot(p.id, s.id, b.id, sl.id, { start: e.target.value })} />
                                          </div>
                                          <div style={{ flex: 1, minWidth: 130 }}>
                                            <span style={{ fontSize: 11, color: `${PALETTE.cream}88` }}>Rive</span>
                                            <input className="mt-input" type="date" style={{ colorScheme: "light" }} value={sl.end || ""} onChange={(e) => updateBlockSlot(p.id, s.id, b.id, sl.id, { end: e.target.value })} />
                                          </div>
                                          <button onClick={() => removeBlockSlot(p.id, s.id, b.id, sl.id)} style={{ ...miniDanger, alignSelf: "flex-end" }} aria-label="Efase dat">✕</button>
                                        </div>
                                        <input className="mt-input" style={{ marginTop: 8 }} placeholder="Lien videyo pou peryòd sa a" value={sl.url || ""} onChange={(e) => updateBlockSlot(p.id, s.id, b.id, sl.id, { url: e.target.value })} />
                                      </div>
                                    ))}
                                    <button onClick={() => addBlockSlot(p.id, s.id, b.id)} style={{ ...ghostBtn, width: "100%" }}>+ Ajoute yon peryòd</button>
                                  </div>
                                </>
                              )}

                              {!collapsed[b.id] && b.kind === "form" && (
                                <div style={{ padding: 12, border: `1px dashed ${PALETTE.lineStrong}`, borderRadius: 9, background: "rgba(194,35,142,.04)" }}>
                                  <div style={{ fontSize: 11, color: PALETTE.goldSoft, letterSpacing: "1px", marginBottom: 8 }}>KESYON KI AP MONTE YOUN APRE LÒT</div>
                                  {(draft.formFields || []).length === 0 ? (
                                    <p style={{ fontSize: 13, color: `${PALETTE.cream}99`, margin: 0 }}>
                                      Poko gen kesyon. Ajoute yo nan seksyon "Kesyon Fòmilè" anwo a.
                                    </p>
                                  ) : (
                                    <ol style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: `${PALETTE.cream}dd`, lineHeight: 1.7 }}>
                                      {(draft.formFields || []).map((f) => (
                                        <li key={f.id}>{f.label || "(san tit)"}</li>
                                      ))}
                                    </ol>
                                  )}
                                  <p style={{ fontSize: 12, color: `${PALETTE.cream}88`, margin: "8px 0 0", lineHeight: 1.5 }}>
                                    Sou paj la, kesyon sa yo parèt <strong>youn apre lòt</strong>. Repons yo ap parèt nan <strong>Nouvo Prospect</strong> la.
                                  </p>
                                </div>
                              )}

                              {!collapsed[b.id] && b.kind === "special" && (
                                <>
                                  <input className="mt-input" placeholder="Tit — opsyonèl" value={b.title || ""} onChange={(e) => updateBlock(p.id, s.id, b.id, { title: e.target.value })} />
                                  <label style={{ ...labelStyle, marginTop: 10 }}>Sou kisa special la ye?</label>
                                  <input className="mt-input" placeholder="egz: yon mayo gratis, materyèl, yon mini kit" value={b.specialName || ""} onChange={(e) => updateBlock(p.id, s.id, b.id, { specialName: e.target.value })} />
                                  <label style={{ ...labelStyle, marginTop: 12 }}>Ki jou pou rezève (parèt nan mesaj la)</label>
                                  <input className="mt-input" type="date" style={{ colorScheme: "light", maxWidth: 200 }} value={b.reserveDate || ""} onChange={(e) => updateBlock(p.id, s.id, b.id, { reserveDate: e.target.value })} />
                                  <label style={{ ...labelStyle, marginTop: 12 }}>Tèks mesaj la (ou ka modifye l)</label>
                                  <textarea className="mt-input" style={{ minHeight: 100 }} placeholder={DEFAULT_SPECIAL_TPL} value={b.tpl || ""} onChange={(e) => updateBlock(p.id, s.id, b.id, { tpl: e.target.value })} />
                                  <div style={{ fontSize: 12, color: `${PALETTE.cream}99`, margin: "6px 0 0", lineHeight: 1.7 }}>
                                    Ou ka mete varyab sa yo nan mesaj la — y ap ranplase otomatikman:
                                    <div style={{ marginTop: 4 }}>
                                      <strong>{"{non}"}</strong> = non vizitè a<br />
                                      <strong>{"{special}"}</strong> = sou kisa special la ye<br />
                                      <strong>{"{dat}"}</strong> = jou pou rezève (sa ou chwazi anwo a)<br />
                                      <strong>{"{dat10}"}</strong> = 10 jou apre dat komansman video pwograme ki ap jwe a
                                    </div>
                                  </div>
                                  <label style={{ ...labelStyle, marginTop: 12 }}>Ki etap video pwograme a ye? (pou {"{dat10}"})</label>
                                  <select
                                    className="mt-input"
                                    style={{ maxWidth: 280, colorScheme: "light" }}
                                    value={b.videoStep || ""}
                                    onChange={(e) => updateBlock(p.id, s.id, b.id, { videoStep: e.target.value })}
                                  >
                                    <option value="">Otomatik (nenpòt video aktif)</option>
                                    {(p.steps || []).map((stp, si) => (
                                      <option key={stp.id} value={String(si + 1)}>Etap {si + 1}</option>
                                    ))}
                                  </select>
                                  <div style={{ fontSize: 12, color: `${PALETTE.cream}99`, marginTop: 4, lineHeight: 1.6 }}>
                                    Chwazi etap kote video pwograme a ye. Konsa lè video etap sa a chanje, <strong>{"{dat10}"}</strong> ap toujou kalkile apati dat video sa a (10 jou apre).
                                  </div>
                                  <input className="mt-input" style={{ marginTop: 10 }} placeholder="Tèks bouton 'Wi' — opsyonèl (egz: Wi, mwen enterese)" value={b.buttonLabel || ""} onChange={(e) => updateBlock(p.id, s.id, b.id, { buttonLabel: e.target.value })} />
                                  <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 12, cursor: "pointer" }}>
                                    <input
                                      type="checkbox"
                                      checked={!!b.banner}
                                      onChange={(e) => updateBlock(p.id, s.id, b.id, { banner: e.target.checked })}
                                      style={{ marginTop: 3, width: 16, height: 16, accentColor: PALETTE.magenta }}
                                    />
                                    <span style={{ fontSize: 13, color: `${PALETTE.cream}dd`, lineHeight: 1.4 }}>
                                      Montre kòm <strong>anons</strong> anlè tout paj ki rete yo (san bouton Wi/Pita). Mesaj la ap parèt anlè chak paj apati paj sa a.
                                    </span>
                                  </label>
                                  <div style={{ marginTop: 10, padding: 12, border: `1px solid ${PALETTE.line}`, borderRadius: 9, background: "rgba(194,35,142,.04)" }}>
                                    <div style={{ fontSize: 11, color: PALETTE.gold, letterSpacing: "1px", marginBottom: 6 }}>APÈSI</div>
                                    <p style={{ fontSize: 14, color: `${PALETTE.cream}e6`, margin: 0, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                                      {renderTemplate((b.tpl || "").trim() || DEFAULT_SPECIAL_TPL, { special: b.specialName || "…", dat: formatHtDate(b.reserveDate) || "…", dat10: "(10 jou apre dat video a)", non: "(non vizitè a)" })}
                                    </p>
                                  </div>
                                </>
                              )}

                              {!collapsed[b.id] && b.kind === "link" && (
                                <>
                                  <input className="mt-input" placeholder="Tit — opsyonèl" value={b.title || ""} onChange={(e) => updateBlock(p.id, s.id, b.id, { title: e.target.value })} />
                                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                    <button onClick={() => updateBlock(p.id, s.id, b.id, { linkMode: "extern" })} style={toggleBtn((b.linkMode || "extern") === "extern")}>Lien deyò (URL)</button>
                                    <button onClick={() => updateBlock(p.id, s.id, b.id, { linkMode: "intern" })} style={toggleBtn(b.linkMode === "intern")}>Anndan app la (paj)</button>
                                  </div>

                                  {(b.linkMode || "extern") === "extern" ? (
                                    <>
                                      <input className="mt-input" style={{ marginTop: 8 }} placeholder="Lyen (egz: https://wa.me/509XXXXXXXX)" value={b.url || ""} onChange={(e) => updateBlock(p.id, s.id, b.id, { url: e.target.value })} />
                                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                        <button onClick={() => updateBlock(p.id, s.id, b.id, { sameTab: false })} style={toggleBtn(!b.sameTab)}>Lòt onglè</button>
                                        <button onClick={() => updateBlock(p.id, s.id, b.id, { sameTab: true })} style={toggleBtn(!!b.sameTab)}>Menm paj</button>
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <label style={{ ...labelStyle, marginTop: 10 }}>Sou ki paj pou voye moun nan?</label>
                                      <select
                                        className="mt-input"
                                        style={{ colorScheme: "light" }}
                                        value={b.targetProgram ? `${b.targetProgram}::${b.targetStep || 1}` : ""}
                                        onChange={(e) => {
                                          const v = e.target.value;
                                          if (!v) { updateBlock(p.id, s.id, b.id, { targetProgram: "", targetStep: "" }); }
                                          else { const ix = v.indexOf("::"); updateBlock(p.id, s.id, b.id, { targetProgram: v.slice(0, ix), targetStep: v.slice(ix + 2) }); }
                                        }}
                                      >
                                        <option value="">Kòmansman (paj chwazi pwogram nan)</option>
                                        {draft.programs.map((pp) =>
                                          (pp.steps || []).map((stp, si) => (
                                            <option key={pp.id + "::" + (si + 1)} value={`${pp.id}::${si + 1}`}>
                                              {pp.label} — Etap {si + 1}
                                            </option>
                                          ))
                                        )}
                                      </select>
                                      <div style={{ fontSize: 12, color: `${PALETTE.cream}99`, marginTop: 4, lineHeight: 1.6 }}>
                                        Lè vizitè a klike bouton an, l ap ale dirèkteman sou paj sa a anndan app la.
                                      </div>
                                    </>
                                  )}

                                  <input className="mt-input" style={{ marginTop: 8 }} placeholder="Tèks bouton an (egz: Kontakte nou, oswa Kontinye)" value={b.label || ""} onChange={(e) => updateBlock(p.id, s.id, b.id, { label: e.target.value })} />
                                </>
                              )}
                            </div>
                          ))}

                          {/* Ajoute yon blòk */}
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                            <button onClick={() => addBlock(p.id, s.id, "text")} style={{ ...ghostBtn, flex: 1, minWidth: 70 }}>+ Tèks</button>
                            <button onClick={() => addBlock(p.id, s.id, "video")} style={{ ...ghostBtn, flex: 1, minWidth: 70 }}>+ Videyo</button>
                            <button onClick={() => addBlock(p.id, s.id, "form")} style={{ ...ghostBtn, flex: 1, minWidth: 70 }}>+ Fòmilè</button>
                            <button onClick={() => addBlock(p.id, s.id, "special")} style={{ ...ghostBtn, flex: 1, minWidth: 70 }}>+ Special</button>
                            <button onClick={() => addBlock(p.id, s.id, "link")} style={{ ...ghostBtn, flex: 1, minWidth: 70 }}>+ Lyen</button>
                          </div>

                          <input className="mt-input" style={{ marginTop: 10 }} placeholder="Tèks bouton 'Kontinye' — opsyonèl" value={s.buttonLabel || ""} onChange={(e) => updateStep(p.id, s.id, { buttonLabel: e.target.value })} />
                        </div>
                      );
                    })}
                    <button onClick={() => addStep(p.id)} style={{ ...ghostBtn, width: "100%" }}>+ Ajoute yon etap</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <button onClick={addProgram} style={{ ...ghostBtn, width: "100%", marginTop: 6 }}>+ Ajoute yon programme</button>
      </Section>

      {/* Bar anrejistre */}
      <div style={{ position: "sticky", bottom: 0, marginTop: 24, padding: "14px 0", background: `linear-gradient(to top, ${PALETTE.bgBottom}, transparent)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={save} style={{ ...goldBtn, flex: 1 }}>Anrejistre chanjman yo</button>
          {savedAt === "ok" && <span style={{ color: PALETTE.goldSoft, fontSize: 13 }}>Anrejistre ✓</span>}
          {savedAt === "fail" && <span style={{ color: PALETTE.danger, fontSize: 13 }}>Pa t kapab anrejistre</span>}
        </div>
      </div>
        </>
      )}
    </div>
  );
}

/* ===================== PAJ NOUVO PROSPECT ===================== */
/* Paj /formulaire — modpas pou wè lis prospè yo dirèkteman (san antre nan admin) */
function ProspectsGate({ config }) {
  const [authed, setAuthed] = useState(false);
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState("");

  const tryLogin = () => {
    if (pwd === PROSPECTS_PASSWORD) { setAuthed(true); setErr(""); }
    else setErr("Modpas la pa kòrèk.");
  };

  if (!authed) {
    return (
      <Centered>
        <div className="mt-fade" style={{ width: "100%", maxWidth: 360, padding: "0 20px" }}>
          <div style={{ marginBottom: 28 }}>
            <Brand small />
          </div>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 500, textAlign: "center", margin: "0 0 18px" }}>
            Lis Prospè yo
          </h1>
          <input
            className="mt-input"
            type="password"
            placeholder="Modpas"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && tryLogin()}
            autoFocus
          />
          {err && <p style={{ color: PALETTE.danger, fontSize: 13, margin: "10px 0 0" }}>{err}</p>}
          <button className="mt-btn" onClick={tryLogin} style={{ ...goldBtn, width: "100%", marginTop: 14 }}>
            Antre
          </button>
          <a href="/" style={{ ...ghostBtn, width: "100%", marginTop: 10, display: "block", textAlign: "center", textDecoration: "none" }}>
            Tounen sou sit la
          </a>
        </div>
      </Centered>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px 60px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 600 }}>Nouvo Prospè</div>
        <a href="/" style={{ ...ghostBtn, textDecoration: "none" }}>Tounen sou sit la</a>
      </div>
      <ProspectsView agents={(config && config.agents) || []} isAdmin={false} />
    </div>
  );
}

function ProspectsView({ agents = [], isAdmin = false, onSaveAgents }) {
  const [items, setItems] = useState(null); // null = ap chaje
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("list"); // "list" | "pdf"
  const [tab, setTab] = useState("prospects"); // "prospects" | "students"
  const [creatingEtq, setCreatingEtq] = useState(false); // chan kreye etikèt la louvri
  const [newEtq, setNewEtq] = useState("");
  const [saveErr, setSaveErr] = useState(""); // mesaj erè si anrejistreman echwe

  // Non etikèt yo (san doub)
  const agentNames = [...new Set(
    (agents || [])
      .map((a) => (typeof a === "string" ? a : (a && a.name) || ""))
      .map((s) => s.trim())
      .filter(Boolean)
  )];

  // Kreye / efase yon etikèt (admin sèlman)
  const createEtiquette = async () => {
    const name = newEtq.trim();
    if (!name || !onSaveAgents) { setCreatingEtq(false); setNewEtq(""); return; }
    if (!agentNames.includes(name)) await onSaveAgents([...agentNames, name]);
    setNewEtq("");
    setCreatingEtq(false);
  };
  const removeEtiquetteName = async (name) => {
    if (!onSaveAgents) return;
    await onSaveAgents(agentNames.filter((n) => n !== name));
  };

  // Lis ki montre selon tab la: Etidyan = sa ki make "Vini", Prospè = lòt yo
  const viewItems = useMemo(() => {
    if (!items) return null;
    return tab === "students"
      ? items.filter((p) => p.followup === "vini")
      : items.filter((p) => p.followup !== "vini");
  }, [items, tab]);
  const isStudents = tab === "students";

  const refresh = useCallback(async () => {
    setBusy(true);
    const list = await loadProspects();
    setItems(list);
    setBusy(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const remove = async (id) => {
    await deleteProspect(id);
    setItems((prev) => (prev || []).filter((p) => p.id !== id));
  };

  // Mete estati swivi (follow-up) pou yon prospè
  const setSwivi = async (id, status) => {
    setSaveErr("");
    setItems((prev) => (prev || []).map((p) => (p.id === id ? { ...p, followup: status } : p)));
    const ok = await setProspectFollowup(id, status);
    if (!ok) { setSaveErr("Pa rive anrejistre swivi a nan baz done a. Tcheke kolòn `followup` ak règ RLS yo nan Supabase."); refresh(); }
  };

  // Mete etikèt (non ajan) pou yon prospè
  const setEtiquette = async (id, name) => {
    setSaveErr("");
    setItems((prev) => (prev || []).map((p) => (p.id === id ? { ...p, etiquette: name } : p)));
    const ok = await setProspectEtiquette(id, name);
    if (!ok) { setSaveErr("Pa rive anrejistre etikèt la nan baz done a. Tcheke kolòn `etiquette` ak règ RLS yo nan Supabase."); refresh(); }
  };

  const fmtDate = (ts) => {
    if (!ts) return "";
    try {
      return new Date(ts).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      return "";
    }
  };

  const shortDate = (ts) => {
    try { return new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" }); }
    catch (e) { return ""; }
  };

  // Kolòn yo: # | Programme | Dat | yon kolòn pou chak kesyon
  const qCols = useMemo(() => {
    const out = [];
    (viewItems || []).forEach((p) =>
      (p.answers || []).forEach((a) => {
        const q = (a.question || "").trim();
        if (q && !out.includes(q)) out.push(q);
      })
    );
    return out;
  }, [viewItems]);

  const answerFor = (p, q) => {
    const f = (p.answers || []).find((a) => (a.question || "").trim() === q);
    return f ? f.answer || "" : "";
  };

  // Separe an paj pou apèsi a (20 ranje pa paj)
  const ROWS_PER_PAGE = 20;
  const pages = useMemo(() => {
    const out = [];
    for (let i = 0; i < (viewItems || []).length; i += ROWS_PER_PAGE) out.push((viewItems || []).slice(i, i + ROWS_PER_PAGE));
    return out;
  }, [viewItems]);

  const th = { textAlign: "left", padding: "6px 6px", fontSize: 10, color: "#1d1620", borderBottom: "1.5px solid #C2238E", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".3px" };
  const td = { textAlign: "left", padding: "7px 6px", fontSize: 11, color: "#1d1620", borderBottom: "0.5px solid #e7ddd2", verticalAlign: "top", wordBreak: "break-word" };

  /* ---------- VÈSYON PDF ---------- */
  if (mode === "pdf") {
    return (
      <div>
        <div className="no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600, margin: 0 }}>
            Vèsyon PDF — {(viewItems || []).length} {isStudents ? "etidyan" : "prospè"}
          </h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setMode("list")} style={ghostBtn}>Tounen</button>
            <button onClick={() => openProspectsPdf(viewItems || [], fmtDate)} style={ghostBtn}>Wè PDF la</button>
            <button onClick={() => downloadProspectsPdf(viewItems || [], fmtDate)} style={goldBtn}>Telechaje PDF</button>
          </div>
        </div>
        <p className="no-print" style={{ fontSize: 13, color: `${PALETTE.cream}88`, margin: "0 0 18px" }}>
          "Wè PDF la" louvri l nan yon nouvo paj. "Telechaje PDF" sere fichye a (<strong>nouvo-prospect.pdf</strong>). Anba a se yon apèsi an fòma tablo.
        </p>

        <div id="pdf-print-area" style={{ overflowX: "auto" }}>
          {pages.length === 0 ? (
            <div className="pdf-page">
              <PdfHeader />
              <p style={{ color: "#555", fontSize: 14 }}>Poko gen okenn prospè.</p>
              <div className="pdf-foot"><span>Miss Thani - Make-Up &amp; Lace Club</span><span>Paj 1 / 1</span></div>
            </div>
          ) : (
            pages.map((pg, i) => (
              <div className="pdf-page" key={i}>
                {i === 0 && <PdfHeader count={(viewItems || []).length} />}
                <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, width: 26 }}>#</th>
                      <th style={{ ...th, width: 78 }}>Programme</th>
                      <th style={{ ...th, width: 60 }}>Dat</th>
                      {qCols.map((q) => (
                        <th key={q} style={th}>{q}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pg.map((p, idx) => {
                      const num = i * ROWS_PER_PAGE + idx + 1;
                      return (
                        <tr key={p.id}>
                          <td style={{ ...td, color: "#C2238E", fontWeight: 700 }}>{num}</td>
                          <td style={{ ...td, fontWeight: 700 }}>{p.program || "-"}</td>
                          <td style={{ ...td, color: "#7a6f63" }}>{shortDate(p.updatedAt)}</td>
                          {qCols.map((q) => (
                            <td key={q} style={td}>{answerFor(p, q)}</td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="pdf-foot">
                  <span>Miss Thani - Make-Up &amp; Lace Club</span>
                  <span>Paj {i + 1} / {pages.length}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  /* ---------- LIS NÒMAL ---------- */
  return (
    <div>
      {/* Bouton pou chanje ant Nouvo Prospè ak Nouvo Etidyan */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button
          onClick={() => { setTab("prospects"); setMode("list"); }}
          style={tab === "prospects" ? goldBtn : ghostBtn}
        >
          Nouvo Prospè
        </button>
        <button
          onClick={() => { setTab("students"); setMode("list"); }}
          style={tab === "students" ? goldBtn : ghostBtn}
        >
          Nouvo Etidyan
        </button>
      </div>

      {saveErr && (
        <div style={{ marginBottom: 14, padding: "12px 14px", borderRadius: 12, border: "1px solid #ff6b6b", background: "rgba(255,107,107,.08)" }}>
          <p style={{ margin: 0, fontSize: 13.5, color: "#ff6b6b", lineHeight: 1.5 }}>{saveErr}</p>
        </div>
      )}

      {/* Kreye etikèt yo (admin sèlman) */}
      {isAdmin && (
        <div style={{ marginBottom: 16, padding: "12px 14px", border: `1px solid ${PALETTE.line}`, borderRadius: 12, background: "rgba(123,45,142,.05)" }}>
          {!creatingEtq ? (
            <button onClick={() => setCreatingEtq(true)} style={goldBtn}>+ Kreye étiquette</button>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input
                className="mt-input"
                style={{ maxWidth: 240 }}
                placeholder="Non etikèt la (egz: Marie)"
                value={newEtq}
                onChange={(e) => setNewEtq(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && newEtq.trim()) createEtiquette(); }}
                autoFocus
              />
              <button onClick={createEtiquette} disabled={!newEtq.trim()} style={{ ...goldBtn, opacity: newEtq.trim() ? 1 : 0.6 }}>Anrejistre</button>
              <button onClick={() => { setCreatingEtq(false); setNewEtq(""); }} style={ghostBtn}>Anile</button>
            </div>
          )}
          {agentNames.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              {agentNames.map((n) => (
                <span key={n} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: "#EEE3F7", color: "#3A0E33", fontSize: 13 }}>
                  {n}
                  <button onClick={() => removeEtiquetteName(n)} aria-label="Efase etikèt" style={{ border: "none", background: "transparent", color: "#7B2D8E", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 }}>✕</button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600, margin: 0 }}>
          {isStudents ? "Nouvo Etidyan" : "Nouvo Prospè"} {viewItems ? `(${viewItems.length})` : ""}
        </h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={refresh} style={ghostBtn} disabled={busy}>{busy ? "Ap chaje…" : "Aktyalize"}</button>
          {viewItems && viewItems.length > 0 && (
            <>
              <button onClick={() => downloadProspectsCsv(viewItems || [], qCols, fmtDate)} style={ghostBtn}>Telechaje CSV (Excel)</button>
              <button onClick={() => setMode("pdf")} style={goldBtn}>Vèsyon PDF</button>
            </>
          )}
        </div>
      </div>

      {items === null ? (
        <p style={{ color: `${PALETTE.cream}99` }}>Ap chaje…</p>
      ) : viewItems.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", border: `1px solid ${PALETTE.line}`, borderRadius: 16, background: "rgba(194,35,142,.04)" }}>
          <p style={{ fontSize: 16, color: `${PALETTE.cream}cc`, margin: 0 }}>
            {isStudents ? "Poko gen okenn etidyan." : "Poko gen okenn prospè."}
          </p>
          <p style={{ fontSize: 13, color: `${PALETTE.cream}88`, margin: "8px 0 0" }}>
            {isStudents
              ? "Lè ou make yon prospè \"Vini\" nan lis swivi a, l ap parèt isit la."
              : "Lè yon moun reponn yon etap Fòmilè sou paj piblik la, l ap parèt isit la."}
          </p>
        </div>
      ) : (
        <div style={{ overflowX: "auto", border: `1px solid ${PALETTE.line}`, borderRadius: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
            <thead>
              <tr>
                <th style={{ ...thDark, width: 36 }}>#</th>
                <th style={thDark}>Programme</th>
                <th style={thDark}>Dat</th>
                <th style={{ ...thDark, width: 150 }}>Swivi</th>
                <th style={{ ...thDark, width: 150 }}>Etikèt</th>
                {qCols.map((q) => (
                  <th key={q} style={thDark}>{q}</th>
                ))}
                <th style={{ ...thDark, width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {viewItems.map((p, idx) => (
                <tr key={p.id}>
                  <td style={{ ...tdDark, color: PALETTE.gold, fontWeight: 700 }}>{idx + 1}</td>
                  <td style={{ ...tdDark, color: PALETTE.goldSoft, fontWeight: 600, whiteSpace: "nowrap" }}>{p.program || "-"}</td>
                  <td style={{ ...tdDark, color: `${PALETTE.cream}88`, whiteSpace: "nowrap" }}>{shortDate(p.updatedAt)}</td>
                  <td style={{ ...tdDark, textAlign: "center", whiteSpace: "nowrap" }}>
                    <select
                      value={p.followup || ""}
                      onChange={(e) => setSwivi(p.id, e.target.value)}
                      style={{ fontSize: 12.5, padding: "6px 8px", borderRadius: 8, border: `1px solid ${PALETTE.line}`, background: p.followup ? "#FBE9F4" : "#fff", color: "#3A0E33", colorScheme: "light", cursor: "pointer", maxWidth: 150 }}
                    >
                      <option value="">Swivi…</option>
                      <option value="done">Suivi fèt</option>
                      <option value="noanswer">Sone san repons</option>
                      <option value="wrong">Pa sone ditou</option>
                      <option value="vini">Vini (nouvo etidyan)</option>
                    </select>
                  </td>
                  <td style={{ ...tdDark, textAlign: "center", whiteSpace: "nowrap" }}>
                    {(isAdmin || !p.etiquette) ? (
                      <select
                        value={p.etiquette || ""}
                        onChange={(e) => setEtiquette(p.id, e.target.value)}
                        style={{ fontSize: 12.5, padding: "6px 8px", borderRadius: 8, border: `1px solid ${PALETTE.line}`, background: p.etiquette ? "#EEE3F7" : "#fff", color: "#3A0E33", colorScheme: "light", cursor: "pointer", maxWidth: 150 }}
                      >
                        <option value="">Ajoute etikèt…</option>
                        {agentNames.map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                        {p.etiquette && !agentNames.includes(p.etiquette) && (
                          <option value={p.etiquette}>{p.etiquette}</option>
                        )}
                      </select>
                    ) : (
                      <span style={{ fontSize: 13, color: "#7B2D8E", fontWeight: 600 }}>
                        {p.etiquette}
                      </span>
                    )}
                  </td>
                  {qCols.map((q) => (
                    <td key={q} style={tdDark}>{answerFor(p, q)}</td>
                  ))}
                  <td style={{ ...tdDark, textAlign: "center" }}>
                    <button onClick={() => remove(p.id)} style={miniDanger} aria-label="Efase prospè">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const thDark = { textAlign: "left", padding: "10px 12px", fontSize: 11, color: "#C2238E", borderBottom: "1.5px solid rgba(194,35,142,.45)", textTransform: "uppercase", letterSpacing: ".5px", whiteSpace: "nowrap" };
const tdDark = { padding: "10px 12px", fontSize: 14, color: "#3A0E33", borderBottom: "1px solid rgba(142,44,154,.16)", verticalAlign: "top", wordBreak: "break-word" };

/* Antèt paj PDF la */
function PdfHeader({ count }) {
  return (
    <div style={{ borderBottom: "2px solid #C2238E", paddingBottom: 12, marginBottom: 16 }}>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 600, color: "#6A1A63" }}>Miss Thani</div>
      <div style={{ fontSize: 10, letterSpacing: "2px", textTransform: "uppercase", color: "#C2238E" }}>Make-Up &amp; Lace Club</div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#1d1620" }}>Lis Nouvo Prospect</span>
        {typeof count === "number" && <span style={{ fontSize: 12, color: "#7a6f63" }}>{count} prospè</span>}
      </div>
    </div>
  );
}

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 26, padding: 18, border: `1px solid ${PALETTE.line}`, borderRadius: 16, background: "rgba(194,35,142,.04)" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Pliye oswa depliye seksyon an"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "transparent", border: "none", color: "inherit", cursor: "pointer", padding: 0, margin: open ? "0 0 14px" : "0", textAlign: "left" }}
      >
        <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 19, fontWeight: 600, margin: 0 }}>{title}</h2>
        <span style={{ fontSize: 16, color: PALETTE.goldSoft, marginLeft: 12 }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && children}
    </div>
  );
}

/* ----------------------- estil ----------------------- */
const labelStyle = { display: "block", fontSize: 12, color: `${PALETTE.cream}aa`, marginBottom: 6, letterSpacing: ".3px" };

const goldBtn = {
  padding: "12px 22px",
  borderRadius: 12,
  border: "none",
  background: `linear-gradient(135deg, ${PALETTE.blush}, #8E2C9A)`,
  color: "#FFFFFF",
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "'Inter', sans-serif",
  boxShadow: "0 6px 18px rgba(194,35,142,.28)",
};

const ghostBtn = {
  padding: "12px 20px",
  borderRadius: 12,
  border: `1px solid ${PALETTE.lineStrong}`,
  background: "#FFFFFF",
  color: PALETTE.goldSoft,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "'Inter', sans-serif",
};

const dangerBtn = { ...ghostBtn, borderColor: PALETTE.danger, color: PALETTE.danger };

const toggleBtn = (active) => ({
  flex: 1,
  padding: "9px 0",
  borderRadius: 9,
  border: `1px solid ${active ? PALETTE.goldSoft : PALETTE.line}`,
  background: active ? "rgba(194,35,142,.10)" : "#FFFFFF",
  color: active ? PALETTE.goldSoft : `${PALETTE.cream}99`,
  fontSize: 14,
  fontWeight: active ? 700 : 500,
  cursor: "pointer",
  fontFamily: "'Inter', sans-serif",
});

const miniBtn = (disabled) => ({
  width: 30, height: 30, borderRadius: 8,
  border: `1px solid ${PALETTE.line}`, background: "transparent",
  color: disabled ? `${PALETTE.cream}40` : PALETTE.cream,
  cursor: disabled ? "default" : "pointer", fontSize: 14,
});

const miniDanger = {
  width: 30, height: 30, borderRadius: 8,
  border: `1px solid ${PALETTE.danger}`, background: "transparent",
  color: PALETTE.danger, cursor: "pointer", fontSize: 13,
};
