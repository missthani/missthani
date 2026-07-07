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
  if (kind === "faq") return { id, kind: "faq", title: "", items: [] };
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

/* Dat enskripsyon yon prospè: dat la sòti nan id sesyon an (uid 7 karaktè + Date.now() an base36) */
function prospectCreatedTs(p) {
  try {
    const tail = String((p && p.id) || "").slice(7);
    const ts = parseInt(tail, 36);
    if (ts && ts > 1600000000000 && ts < 4000000000000) return ts;
  } catch (e) {}
  return (p && p.updatedAt) || 0;
}
/* Dat limit rezèvasyon: 10 jou apre enskripsyon an */
function prospectReserveTs(p) {
  const c = prospectCreatedTs(p);
  return c ? c + 10 * 86400000 : 0;
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

/* Kreno video aktif la (start + end) — pou konnen dat "rive" a (dezyèm dat la) */
function activeVideoSlot(blocks) {
  const today = todayStr();
  for (const b of blocks || []) {
    if (b.kind !== "video") continue;
    for (const s of b.schedule || []) {
      if (!s.start || !((s.url || "").trim())) continue;
      if (s.start <= today && (!s.end || today <= s.end)) return { start: s.start, end: s.end || "" };
    }
  }
  return null;
}
function activeVideoSlotAll(screens) {
  for (const sc of screens || []) {
    const sl = activeVideoSlot(getStepBlocks(sc));
    if (sl) return sl;
  }
  return null;
}

/* Tout kreno video pwograme yo (start/end/session) atravè tout etap yon pwogram — pou apèsi dat rezèvasyon yo */
function allVideoSlots(screens) {
  const out = [];
  for (const sc of screens || []) {
    for (const b of getStepBlocks(sc) || []) {
      if (b.kind !== "video") continue;
      for (const s of b.schedule || []) {
        if (!s.start || !((s.url || "").trim())) continue;
        out.push({ start: s.start, end: s.end || "", session: s.session || "" });
      }
    }
  }
  out.sort((a, b) => String(a.start).localeCompare(String(b.start)));
  return out;
}

/* Dat baz pou kalkile rezèvasyon an nan kreno aktif la: dat session si li defini, sinon dat komansman */
function activeVideoResaBase(blocks) {
  const today = todayStr();
  for (const b of blocks || []) {
    if (b.kind !== "video") continue;
    for (const s of b.schedule || []) {
      if (!s.start || !((s.url || "").trim())) continue;
      if (s.start <= today && (!s.end || today <= s.end)) return (s.session || s.start);
    }
  }
  return "";
}
function activeVideoResaBaseAll(screens) {
  for (const sc of screens || []) {
    const d = activeVideoResaBase(getStepBlocks(sc));
    if (d) return d;
  }
  return "";
}

/* Kreno "aktyèl" la pou rezèvasyon (menm baz pou lis prospè, bouton dat rezèvasyon, ak mesaj WhatsApp):
   1) kreno ki aktif jodi a (jodi a nan peryòd videyo a), sinon
   2) pwochen session k ap vini an (dat session ki pi pre nan lavni), sinon
   3) dènye session ki fin pase a */
function currentVideoSlotAll(screens) {
  const today = todayStr();
  const slots = allVideoSlots(screens); // deja ranje pa dat komansman
  for (const s of slots) {
    if (s.start <= today && (!s.end || today <= s.end)) return s;
  }
  const withBase = slots.map((s) => ({ s, base: s.session || s.start })).filter((x) => x.base);
  const up = withBase.filter((x) => x.base >= today).sort((a, b) => a.base.localeCompare(b.base));
  if (up.length) return up[0].s;
  const past = withBase.slice().sort((a, b) => b.base.localeCompare(a.base));
  return past.length ? past[0].s : null;
}
function currentResaBaseAll(screens) {
  const s = currentVideoSlotAll(screens);
  return s ? (s.session || s.start) : "";
}
function anyCurrentResaBase(programs) {
  for (const p of programs || []) {
    const d = currentResaBaseAll(p.steps || []);
    if (d) return d;
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

/* Menm bagay men li bay dat baz rezèvasyon an (dat session si li defini) */
function anyActiveVideoResaBase(programs) {
  for (const p of programs || []) {
    const d = activeVideoResaBaseAll(p.steps || []);
    if (d) return d;
  }
  return "";
}

/* Mesaj swivi (follow-up) — {non}=non vizitè a, {dat10}=10 jou apre dat video pwograme a */
const FOLLOWUP_TPL = {
  done: "Nou te kontan pale avèk ou {non} ! Sonje vin rezève plas ou anvan {dat10}.",
  noanswer: "Nou eseye rele w {non}, men nimewo ou a sone san repons. Tanpri verifye si w te resevwa apèl nou, e pa bliye vin rezève plas ou anvan {dat10}.",
  wrong: "Bonjou {non}. Nimewo ou te ban nou an pa fonksyone, nou pa rive jwenn ou. Tanpri ban nou yon lòt nimewo nou ka rele w.",
  lwen: "Hello chère, nou vle raple w ke adrès nou se Pétion-Ville, Morne Hercule, nan lokal Zéphyrs. Etandone ou rete {adres}, nou wè adrès la yon jan lwen pou ou. Si tout fwa ou konte vini pi pre nou pou w ka vin pran fòmasyon {program} an, kontakte nou sou 46433016 pou n ka fè swivi pou ou.",
};
const FOLLOWUP_LABELS = {
  done: "Suivi fèt",
  noanswer: "Sone san repons",
  wrong: "Pa sone ditou (nimewo pa bon)",
  lwen: "Lwen",
};

/* Mesaj ki ranplase mesaj rezèvasyon an lè dat limit la (dat10) fin pase, men peryòd la poko fini.
   {datRive}=dezyèm dat la (dat rive a) nan peryòd soti→rive */
const EXPIRED_RESA_TPL = "Hello chère, nou toujou ap resevwa enskripsyon jiska {datRive}, menm si espesyal la fini. Ou ka toujou vin enskri pou nouvèl sesyon an.";

/* Modèl mesaj ki defile nan kazye chak moun (Bwat mesaj — admin ka modifye yo).
   Chak etap gen pwòp varyab li. */
const TICKER_STATES = [
  { key: "no_tag_no_follow", label: "Kontakte — san etikèt, san swivi", step: 1, vars: ["{non}"],
    cond: "Moun nan klike WhatsApp (boul vèt) + PA gen etikèt + PA gen swivi",
    dateRule: "", dropdown: "", flow: ["Mete yon etikèt oswa chwazi yon swivi → pwochen etap la"],
    def: "Moun sa ({non}) jwenn mesaj WhatsApp deja, men nou pa mete etikèt sou li, epi nou pa make swivi pou li." },
  { key: "tag_no_follow", label: "Gen etikèt — poko gen swivi", step: 1, vars: ["{etiket}", "{non}"],
    cond: "Kontakte + gen etikèt + PA gen swivi",
    dateRule: "", dropdown: "", flow: ["Chwazi yon swivi nan meni « Swivi » a → etap 2"],
    def: "Hello {etiket}, ou gen pou fè swivi ak {non}." },
  { key: "follow_done", label: "Swivi fèt", step: 2, vars: ["{etiket}", "{non}", "{dat_swivi}", "{dat_rezervasyon}", "{dat_session}", "{dat_apel}"],
    cond: "Swivi = « Suivi fèt »",
    dateRule: "Rapèl pou rele = dat rezèvasyon − 2 jou. Lè jou a rive: dat la vin « JODIA » + liy WOUJ.",
    dropdown: "Eske ou fè swivi ak {non}?",
    flow: ["Li reserve nan dat special → etap « Li reserve »", "Dat special pase, poko reserve → etap « Special pase »", "Li reserve apre special → etap « Li reserve »", "Li recycler → etap « Recycle »"],
    def: "Hello {etiket}, sonje ou te fè swivi ak {non} deja {dat_swivi}. Dat rezèvasyon an se {dat_rezervasyon} pou sesyon {dat_session}. Sonje rele {non} {dat_apel} pou w raple l sa." },
  { key: "follow_done_late", label: "Swivi fèt — dat apèl la pase (rapèl, 3 jou)", step: 2, vars: ["{etiket}", "{non}"],
    cond: "Otomatik: swivi = fèt, dat apèl la (rezèvasyon − 2 jou) pase, epi admin poko chwazi yon etap. Li dire 3 jou.",
    dateRule: "Otomatik lè jodia depase dat apèl la. Liy WOUJ.",
    dropdown: "Eske ou fè swivi ak {non}?", flow: ["Chwazi yon etap nan meni an pou avanse"],
    def: "Salut {etiket}, mwen te anonse w dat limit pou w fè swivi avèk {non} lan te rive, men ou pa note ki swivi ou fè. Klike sou pwosesis swivi a pou w di m kisa ou te fè ak {non} pou dat sa." },
  { key: "follow_done_lost", label: "Swivi fèt — 3 jou pase san aksyon", step: 2, vars: ["{etiket}", "{non}"],
    cond: "Otomatik: 3 jou pase apre dat apèl la, admin toujou poko chwazi yon etap.",
    dateRule: "Otomatik lè jodia depase dat apèl la + 3 jou. Liy WOUJ.",
    dropdown: "Eske ou fè swivi ak {non}?", flow: ["Chwazi yon etap oswa bay yon lòt ajan swivi a"],
    def: "Hello {etiket}, ou fè 3 jou san w pa mete sistèm nan ajou pandan dat rezèvasyon an pase deja. Ou riske pèdi moun sa. Yon lòt ajan ap anchaje l de swivi {non}." },
  { key: "follow_done_late", label: "Swivi fèt — dat rapèl la pase (rapèl 3 jou)", step: 2, vars: ["{etiket}", "{non}"],
    cond: "Swivi = « Suivi fèt », dat rapèl la pase, ajan an poko chwazi pwochen etap la (jiska 3 jou)",
    dateRule: "Kòmanse yon jou apre dat rapèl la. Li dire 3 jou. Liy WOUJ.",
    dropdown: "Eske ou fè swivi ak {non}?",
    flow: ["Menm opsyon ak « Swivi fèt » — chwazi ki etap moun nan travèse"],
    def: "Salut {etiket}, mwen te anonse w dat limit pou w fè swivi avèk {non} la te rive, men ou pa note ki swivi ou fè. Klike sou pwosesis swivi a pou m ka di kisa ou te fè ak {non} pou dat sa. Mesaj sa ap dire sèlman 3 jou." },
  { key: "follow_done_overdue", label: "Swivi fèt — 3 jou pase san mizajou", step: 2, vars: ["{etiket}", "{non}"],
    cond: "Swivi = « Suivi fèt », 3 jou pase apre dat rapèl la, toujou pa gen mizajou",
    dateRule: "Kòmanse apre 3 jou. Liy WOUJ.",
    dropdown: "Eske ou fè swivi ak {non}?",
    flow: ["Menm opsyon ak « Swivi fèt » — chwazi ki etap moun nan travèse"],
    def: "Hello {etiket}, ou fè 3 jou san w pa mete sistèm nan ajou pandan dat rezèvasyon an pase deja. Ou riske pèdi moun sa. Yon lòt ajan ap anchaje de swivi {non}." },
  { key: "follow_noanswer", label: "Sone san repons / pa sone ditou", step: 1, vars: ["{etiket}", "{non}", "{dat_swivi}", "{estati}", "{dat_refe}"],
    cond: "Swivi = « Sone san repons » oswa « Pa sone ditou »",
    dateRule: "Refè swivi = dat WhatsApp + 3 jou. Lè jou a rive: « JODIA » + liy BLE.",
    dropdown: "", flow: ["Rele ankò, epi chanje swivi a lè w jwenn moun nan"],
    def: "Hello {etiket}, sonje ou te fè swivi ak {non} {dat_swivi}, men li te {estati}. Sonje refè swivi ak {non} {dat_refe}." },
  { key: "reserved", label: "Li reserve (felisitasyon)", step: 3, vars: ["{etiket}", "{non}", "{dat_apel}", "{dat_session}"],
    cond: "Etap = « Li reserve » (anvan jou session an)",
    dateRule: "Rapèl pou rele = dat session − 2 jou.",
    dropdown: "Eske {non} vini nan kou?",
    flow: ["Vini → deplase nan « Nouvo Etidyan »", "Recycler → etap « Recycle »"],
    def: "Felisitasyon {etiket}, {non} reserve. Kounya sonje rele li {dat_apel} pou w raple l pou l vini nan kou (session {dat_session})." },
  { key: "reserved_daybefore", label: "Li reserve — jou anvan session an", step: 3, vars: ["{etiket}", "{non}", "{dat_session}"],
    cond: "Etap = « Li reserve » + se JOU ANVAN session an",
    dateRule: "Otomatik 1 jou anvan dat session an. Liy WOUJ.",
    dropdown: "", flow: ["Kontinye rive nan jou session an"],
    def: "Hello {etiket}, rele {non} pou w di l vini nan session an demen ({dat_session})." },
  { key: "reserved_sessionday", label: "Jou session an — èske li vini?", step: 3, vars: ["{non}", "{dat_session}"],
    cond: "Etap = « Li reserve » + se JOU session an",
    dateRule: "Otomatik jou dat session an. Liy WOUJ.",
    dropdown: "Eske {non} vini nan kou?",
    flow: ["Vini → « Nouvo Etidyan »", "Recycler → etap « Recycle »"],
    def: "Eske {non} vini nan kou? (Session an se {dat_session}.)" },
  { key: "special_passed", label: "Dat special pase — poko reserve", step: 3, vars: ["{etiket}", "{non}"],
    cond: "Etap = « Special pase »",
    dateRule: "", dropdown: "Aksyon pou {non}",
    flow: ["Enskri → etap « Li reserve »", "Recycler → etap « Recycle »"],
    def: "Hello {etiket}, {non} poko reserve et dat special la pase. Kontinye fè swivi avè l, fè l antre sou gwoup la." },
  { key: "recycle", label: "Recycle", step: 4, vars: ["{etiket}", "{non}"],
    cond: "Etap = « Recycle »",
    dateRule: "", dropdown: "Aksyon pou {non}",
    flow: ["Li reserve → etap « Li reserve »", "Vini → « Nouvo Etidyan »"],
    def: "Hello {etiket}, sonje {non} enskri deja men li poko vini nan kou. Sonje rele l pou planifye avè l jiskaske l vini nan kou." },
  { key: "noshow", label: "Reserve men pa vini", step: 4, vars: ["{etiket}", "{non}"],
    cond: "Etap = « Pa vini » (li te reserve men li pa t vini)",
    dateRule: "", dropdown: "Aksyon pou {non}",
    flow: ["Li reserve ankò → etap « Li reserve »", "Vini → « Nouvo Etidyan »"],
    def: "Hello {etiket}, sonje {non} te reserve deja men li poko vini." },
];
const TICKER_DEFAULTS = TICKER_STATES.reduce((o, s) => { o[s.key] = s.def; return o; }, {});
// Koulè pa etap: Etap 1 wouj, Etap 2 ble, Etap 3 mòv, Etap 4 vèt
const STEP_COLORS = { 1: "#C0392B", 2: "#2E86C1", 3: "#8E44AD", 4: "#1E8449" };

/* Tout varyab ki disponib pou bouton "+" nan editè mesaj yo */
const ALL_TICKER_VARS = [
  { v: "{non}", d: "non moun nan" },
  { v: "{etiket}", d: "non etikèt la" },
  { v: "{dat_swivi}", d: "dat WhatsApp la klike" },
  { v: "{dat_rezervasyon}", d: "dat limit rezèvasyon" },
  { v: "{jou_rezervasyon}", d: "konbyen jou avan rezèvasyon" },
  { v: "{dat_session}", d: "dat session an" },
  { v: "{jou_session}", d: "konbyen jou avan session" },
  { v: "{dat_apel}", d: "dat pou rele (rapèl)" },
  { v: "{dat_refe}", d: "dat pou refè swivi" },
  { v: "{estati}", d: "sone san repons / pa sone ditou" },
];

/* Lis kondisyon yo detekte nan sistèm nan — admin ka konekte yon etap ak yo (Koneksyon) */
const CONDITIONS = [
  { key: "green", label: "Bouton vèt (WhatsApp klike)", test: (p) => !!p.contacted },
  { key: "etiquette", label: "Gen etikèt", test: (p) => !!String(p.etiquette || "").trim() },
  { key: "no_etiquette", label: "PA gen etikèt", test: (p) => !String(p.etiquette || "").trim() },
  { key: "no_swivi", label: "PA gen swivi", test: (p) => !p.followup },
  { key: "swivi_done", label: "Swivi = Suivi fèt", test: (p) => p.followup === "done" },
  { key: "swivi_noanswer", label: "Swivi = Sone san repons", test: (p) => p.followup === "noanswer" },
  { key: "swivi_wrong", label: "Swivi = Pa sone ditou", test: (p) => p.followup === "wrong" },
  { key: "reserved", label: "Enskri (li reserve)", test: (p) => p.stage === "reserved_special" || p.stage === "reserved_after" },
  { key: "special_passed", label: "Special pase, poko reserve", test: (p) => p.stage === "special_passed" },
  { key: "recycle", label: "Enskri poko vini (recycle)", test: (p) => p.stage === "recycle" },
  { key: "noshow", label: "Reserve men pa vini", test: (p) => p.stage === "noshow" },
];
const CONDITIONS_MAP = CONDITIONS.reduce((o, c) => { o[c.key] = c; return o; }, {});

/* Kondisyon default pou chak etap (sa fè konpòtman an rete menm jan an si admin pa chanje anyen) */
const DEFAULT_STAGE_CONDS = {
  no_tag_no_follow: ["green", "no_etiquette", "no_swivi"],
  tag_no_follow: ["green", "etiquette", "no_swivi"],
  follow_done: ["green", "swivi_done"],
  follow_noanswer: ["green"],
  reserved: ["reserved"],
  reserved_daybefore: ["reserved"],
  reserved_sessionday: ["reserved"],
  special_passed: ["special_passed"],
  recycle: ["recycle"],
  noshow: ["noshow"],
};

/* Pran adrès yon moun nan repons li yo (kolòn ki gen mo kle adrès) */
function extractAddress(answers) {
  const re = /rete|adr|kote|z[oò]n|vil|abite|kominote|address|lokalite|komin|katye|kartye/i;
  for (const a of answers || []) {
    if (re.test(a.question || "")) return (a.answer || "").trim();
  }
  return "";
}

/* Modèl default mesaj WhatsApp la — {non}=non konplè, {program}=pwogram, {dat}=dat rezèvasyon */
const DEFAULT_WA_TEMPLATE = "*Miss Thani Make-up & Lace Club*\n\nBonjou {non}\n\nNou resevwa pre-enskripsyon ou te fè pou programme {program}.\n\nMwen prè pou m akonpaye w plis e ede w valide enskripsyon an ak espesyal rediksyon an. Paske ou ta sipoze reserve avan {dat} pou w ka pami moun k ap nan espesyal yo.\n\nÈske ou gen kesyon?";

/* Modèl tèks default pou yon etap Special.
   {special}=non special, {dat}=dat rezèvasyon, {dat10}=10 jou apre dat video pwograme a, {non}=non vizitè a */
const DEFAULT_SPECIAL_TPL = "Felisitasyon {non} ! Nou resevwa enfòmasyon pèsonèl ou yo. Pou w ka gen plis chans pami 10 premye moun yo, kouri vin rezève plas ou anvan {dat10}.";

/* Ranplase {special} {dat} {dat10} {dat5} {non} nan yon modèl pa tèks ki an gra.
   {dat10} ak {dat5} toulède bay menm dat la (10 jou apre dat video a). */
function renderTemplate(tpl, vars) {
  const v = vars || {};
  const parts = String(tpl || "").split(/(\{special\}|\{dat10\}|\{dat5\}|\{datRive\}|\{dat\}|\{non\}|\{adres\}|\{program\})/g);
  return parts.map((part, i) => {
    if (part === "{special}") return <strong key={i} style={{ color: PALETTE.goldSoft }}>{v.special || ""}</strong>;
    if (part === "{dat10}" || part === "{dat5}") return <strong key={i} style={{ color: PALETTE.goldSoft }}>{v.dat10 || ""}</strong>;
    if (part === "{datRive}") return <strong key={i} style={{ color: PALETTE.goldSoft }}>{v.datRive || ""}</strong>;
    if (part === "{dat}") return <strong key={i} style={{ color: PALETTE.goldSoft }}>{v.dat || ""}</strong>;
    if (part === "{non}") return <strong key={i} style={{ color: PALETTE.goldSoft }}>{v.non || ""}</strong>;
    if (part === "{adres}") return <strong key={i} style={{ color: PALETTE.goldSoft }}>{v.adres || ""}</strong>;
    if (part === "{program}") return <strong key={i} style={{ color: PALETTE.goldSoft }}>{v.program || ""}</strong>;
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
async function phoneAlreadyUsed(localPhone, campaignTs = 0) {
  if (!localPhone) return false;
  try {
    const list = await loadProspects();
    for (const p of list) {
      // Si nimewo a te enskri AVAN kanpay video aktyèl la, inyore l (yon nouvo kanpay = yon nouvo chans)
      if (campaignTs && prospectCreatedTs(p) < campaignTs) continue;
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
  waMessages: [], // modèl mesaj WhatsApp yo (admin nan jere)
  activeWaMessage: "", // id modèl ki aktif la
  tickerMsgs: {}, // modèl mesaj ki defile nan kazye yo (admin ka modifye — Bwat mesaj)
  stageConditions: {}, // ki kondisyon ki konekte ak chak etap (Koneksyon)
  stageWaMsg: {}, // ki modèl mesaj WhatsApp ki konekte ak chak etap
  agentInfo: {}, // { [nonEtikèt]: { pin: "1234", photo: "" } } — modpas ak foto ajan yo
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
    const row = {
      id: record.id,
      program: record.program,
      answers: record.answers,
      updated_at: new Date(record.updatedAt || Date.now()).toISOString(),
    };
    if (record.etiquette) row.etiquette = record.etiquette; // etikèt otomatik nan lien referans lan
    const { error } = await supabase.from("prospects").upsert(row);
    return !error;
  } catch (e) {
    return false;
  }
}

/* Li paramèt ?ref= nan URL la (etikèt ajan an) epi kenbe l pou sesyon an */
function getRefAgent() {
  try {
    const u = new URLSearchParams(window.location.search || "");
    const r = (u.get("ref") || "").trim();
    if (r) { try { localStorage.setItem("missthani_ref", r); } catch (e) {} return r; }
    return localStorage.getItem("missthani_ref") || "";
  } catch (e) {
    return "";
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
      contacted: !!r.contacted,
      contactedAt: r.contacted_at || "",
      stage: r.stage || "",
      cameAt: r.came_at || "",
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

/* ===== Estatistik vizit yo ===== */
/* Anrejistre yon evènman: type = "visit" (yon moun louvri app la) | "page" (yon paj vizite) */
async function logEvent(type, label, session) {
  try {
    await supabase.from("events").insert({ type, label: label || "", session: session || "" });
  } catch (e) {}
}
async function loadEvents(limit = 5000) {
  try {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).map((r) => ({
      type: r.type,
      label: r.label || "",
      session: r.session || "",
      at: r.created_at ? new Date(r.created_at).getTime() : 0,
    }));
  } catch (e) {
    return [];
  }
}

/* Estati swivi (follow-up) pou yon prospè: "" | "done" | "noanswer" | "wrong" | "vini" */
async function setProspectFollowup(id, status) {
  if (!id) return false;
  try {
    const patch = { followup: status };
    if (status === "vini") patch.came_at = todayStr(); // dat moun nan make "vini" (pou konkou ajan yo)
    const { data, error } = await supabase.from("prospects").update(patch).eq("id", id).select();
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

/* Etap (stage) nan sikl swivi a: "", "reserved", "notreserved", "recycle" */
async function setProspectStage(id, stage) {
  if (!id) return false;
  try {
    const { data, error } = await supabase.from("prospects").update({ stage: stage || "" }).eq("id", id).select();
    if (error) return false;
    return (data || []).length > 0;
  } catch (e) {
    return false;
  }
}

/* Reset pwosesis bwat mesaj la pou yon prospè (swivi, kontak, dat kontak, etap) — admin sèlman */
async function resetProspectProcess(id) {
  if (!id) return false;
  try {
    const { error } = await supabase.from("prospects").update({ stage: "", followup: "", contacted: false, contacted_at: "" }).eq("id", id);
    return !error;
  } catch (e) {
    return false;
  }
}

/* Make si yon mesaj WhatsApp te voye bay prospè a (vèt = voye, wouj = poko) */
async function setProspectContacted(id, val, atDate) {
  if (!id) return false;
  try {
    const patch = { contacted: !!val };
    if (val) patch.contacted_at = atDate || todayStr();
    const { data, error } = await supabase.from("prospects").update(patch).eq("id", id).select();
    if (error) return false;
    return (data || []).length > 0;
  } catch (e) {
    return false;
  }
}

/* Kachèt lokal pou estati kontak la (rezilyans si Supabase pa sove a tan, sitou sou telefòn) */
const CONTACTED_CACHE_KEY = "missthani_contacted";
function loadContactedCache() {
  try { return JSON.parse(localStorage.getItem(CONTACTED_CACHE_KEY) || "{}") || {}; }
  catch (e) { return {}; }
}
function saveContactedCache(id, val, atDate) {
  try {
    const c = loadContactedCache();
    c[id] = { v: !!val, at: val ? (atDate || todayStr()) : "" };
    localStorage.setItem(CONTACTED_CACHE_KEY, JSON.stringify(c));
  } catch (e) {}
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
function buildProspectsPdfBytes(items, fmtDate, opts) {
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

  // Kolòn yo: #, Programme, Dat, Etikèt, epi yon kolòn pou chak kesyon
  const qCols = [];
  (items || []).forEach((p) =>
    (p.answers || []).forEach((a) => {
      const q = (a.question || "").trim();
      if (q && !qCols.includes(q)) qCols.push(q);
    })
  );
  const cols = [
    { key: "#", label: "#", w: 20 },
    { key: "prog", label: "Programme", w: 62 },
    { key: "date", label: "Dat", w: 46 },
    { key: "etq", label: "Etikèt", w: 54 },
  ];
  const remaining = contentW - cols.reduce((s, c) => s + c.w, 0);
  if (qCols.length) {
    const wq = remaining / qCols.length;
    qCols.forEach((q) => cols.push({ key: "q:" + q, label: q, w: wq }));
  } else {
    cols[1].w += remaining * 0.5;
    cols[3].w += remaining * 0.5;
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
    if (c.key === "etq") return p.etiquette || "";
    if (c.key.indexOf("q:") === 0) {
      const q = c.key.slice(2);
      const f = (p.answers || []).find((a) => (a.question || "").trim() === q);
      return f ? f.answer || "" : "";
    }
    return "";
  };

  const CS = 9; // gwosè tèks tablo a
  const rowGap = 6;
  const groupBy = (opts && opts.groupBy) || "none";
  const pdfTitle = (opts && opts.title) || "Lis Nouvo Prospect";
  const moisHt = ["janvye", "fevriye", "mas", "avril", "me", "jen", "jiyè", "out", "septanm", "oktòb", "novanm", "desanm"];
  const fmtWk = (d) => `${d.getDate()} ${moisHt[d.getMonth()]} ${d.getFullYear()}`;

  const makeRow = (p, num) => {
    const cells = cols.map((c) => wrapCell(cellVal(p, c, num - 1), CS, c.w - 6));
    const nLines = Math.max(1, ...cells.map((a) => a.length));
    return { type: "row", cells, h: nLines * lineH(CS) + rowGap };
  };

  // Bati lis blòk yo (antèt semèn + ranje), selon fason gwoupman an
  const blocks = [];
  let ordered = (items || []).slice();
  if (groupBy === "date") {
    const wk = (p) => {
      const ts = prospectCreatedTs(p) || p.updatedAt || Date.now();
      const d = new Date(ts); d.setHours(0, 0, 0, 0);
      const day = (d.getDay() + 6) % 7; // 0 = lendi ... 6 = dimanch
      d.setDate(d.getDate() - day);
      return d;
    };
    ordered.sort((a, b) => {
      const wa = wk(a).getTime(), wb = wk(b).getTime();
      if (wa !== wb) return wa - wb;
      return String(a.program || "").localeCompare(String(b.program || ""));
    });
    let curKey = null; let num = 0;
    ordered.forEach((p) => {
      const w = wk(p); const key = w.getTime();
      if (key !== curKey) {
        curKey = key;
        const sun = new Date(w); sun.setDate(sun.getDate() + 6);
        blocks.push({ type: "header", label: `Semèn ${fmtWk(w)} - ${fmtWk(sun)}`, h: lineH(11) + 10 });
      }
      num++;
      blocks.push(makeRow(p, num));
    });
  } else {
    let num = 0;
    ordered.forEach((p) => { num++; blocks.push(makeRow(p, num)); });
  }

  // Antèt kolòn yo (li repete sou chak paj)
  const headCells = cols.map((c) => wrapCell(c.label, CS, c.w - 6));
  const headLines = Math.max(1, ...headCells.map((a) => a.length));
  const headH = headLines * lineH(CS) + 8;

  // Pagination selon wotè
  const titleH = 80;
  const bottomLimit = MB + 22;
  const topRows = (first) => PH - MT - (first ? titleH : 0) - headH;

  const pages = [{ first: true, blocks: [] }];
  let pi = 0;
  let yy = topRows(true);
  blocks.forEach((b, bi) => {
    if (yy - b.h < bottomLimit) {
      pages.push({ first: false, blocks: [] });
      pi++;
      yy = topRows(false);
    }
    pages[pi].blocks.push(bi);
    yy -= b.h;
  });
  const total = pages.length;
  const GOLDBAR = [0.98, 0.92, 0.78];

  const pageContents = pages.map((pg, idx) => {
    const first = pg.first;
    let c = "";

    // Tit (sou premye paj la sèlman)
    if (first) {
      c += textOp("Miss Thani", ML, PH - MT - 20, "F2", 22, DARK);
      c += textOp("MAKE-UP & LACE CLUB", ML, PH - MT - 36, "F1", 9, GOLD);
      c += rect(ML, PH - MT - 48, contentW, 1.5, GOLD);
      c += textOp(pdfTitle, ML, PH - MT - 70, "F2", 14, DARK);
      c += textOp(`${(items || []).length} moun`, PW - MR - 60, PH - MT - 70, "F1", 10, MUTE);
    }

    const tableTop = PH - MT - (first ? titleH : 0);

    // Antèt kolòn yo
    cols.forEach((cc, ci) => {
      headCells[ci].forEach((ln, li) => {
        c += textOp(ln, colX[ci] + 3, tableTop - CS - li * lineH(CS), "F2", CS, DARK);
      });
    });
    c += rect(ML, tableTop - headH + 5, contentW, 1, GOLD);

    // Blòk yo (antèt semèn + ranje)
    let ry = topRows(first);
    pg.blocks.forEach((bi) => {
      const blk = blocks[bi];
      if (blk.type === "header") {
        c += rect(ML, ry - blk.h + 3, contentW, blk.h - 3, GOLDBAR);
        c += textOp(blk.label, ML + 5, ry - 13, "F2", 11, DARK);
        ry -= blk.h;
        return;
      }
      cols.forEach((cc, ci) => {
        blk.cells[ci].forEach((ln, li) => {
          const f = ci === 1 ? "F2" : "F1";
          const cr = ci === 1 ? DARK : BODY;
          c += textOp(ln, colX[ci] + 3, ry - CS - li * lineH(CS), f, CS, cr);
        });
      });
      c += rect(ML, ry - blk.h + 3, contentW, 0.4, [0.88, 0.82, 0.74]);
      ry -= blk.h;
    });

    // Liy vètikal ant kolòn yo (sèlman lè pa gen antèt semèn)
    if (groupBy !== "date") {
      for (let ci = 1; ci < cols.length; ci++) {
        c += rect(colX[ci] - 1, ry + 3, 0.4, tableTop - (ry + 3), [0.9, 0.85, 0.78]);
      }
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

function downloadProspectsPdf(items, fmtDate, opts) {
  try {
    const bytes = buildProspectsPdfBytes(items, fmtDate, opts);
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

function openProspectsPdf(items, fmtDate, opts) {
  try {
    const bytes = buildProspectsPdfBytes(items, fmtDate, opts);
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
  // Èske nou sou paj /agent la? (espas ajan yo — Progression des Agents)
  const isAgent = typeof window !== "undefined" && /^\/agent\/?$/i.test(window.location.pathname || "");

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
        @keyframes mt-scroll { 0% { transform: translateX(0);} 100% { transform: translateX(-100%);} }
        .mt-marquee { display:inline-block; white-space:nowrap; padding-left:100%; animation: mt-scroll 16s linear infinite; }
        .mt-marquee:hover { animation-play-state: paused; }
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
      ) : isAgent ? (
        <AgentSpace config={config} onSave={persist} />
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
  const [submittedCampaign, setSubmittedCampaign] = useState(() => (saved0 && saved0.submittedCampaign) || ""); // ki kanpay video li te soumèt anba l
  const [answers, setAnswers] = useState(() => (saved0 && saved0.answers) || {}); // repons fòmilè yo (pa stepId)
  const [answeredFor, setAnsweredFor] = useState(() => (saved0 && (saved0.answeredFor || saved0.selectedId)) || ""); // ki pwogram repons/formDone yo apatni (kenbe l menm lè moun nan tounen akèy)
  const sessionRef = useRef((saved0 && saved0.sessionId) || null); // idantifyan sesyon vizitè a

  // Estati swivi pèsonèl vizitè a (admin nan mete l) + modifikasyon nimewo
  const [myFollowup, setMyFollowup] = useState("");
  const [myAddr, setMyAddr] = useState("");
  const [myProgram, setMyProgram] = useState("");
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
      if (active && rec) {
        setMyFollowup(rec.followup || "");
        setMyAddr(extractAddress(rec.answers));
        setMyProgram(rec.program || "");
      }
    })();
    return () => { active = false; };
  }, []);

  // Konte vizit yo: yon sèl fwa pa jou pa telefòn (pou "konbyen moun pa jou")
  useEffect(() => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const key = "missthani_visitlog";
      if (localStorage.getItem(key) !== today) {
        logEvent("visit", "", sessionRef.current || "");
        localStorage.setItem(key, today);
      }
    } catch (e) {}
  }, []);

  // Konte paj ki vizite yo (chak fwa yon moun rive sou yon nouvo paj nan yon pwogram)
  useEffect(() => {
    if (selected) logEvent("page", `${selected.label} — Etap ${screenIndex + 1}`, sessionRef.current || "");
  }, [selected, screenIndex]);

  // Anrejistre pwogrè a chak fwa li chanje
  useEffect(() => {
    saveVisit({
      selectedId: selected ? selected.id : "",
      answeredFor,
      screenIndex,
      formDone,
      submittedCampaign,
      answers,
      sessionId: sessionRef.current,
    });
  }, [selected, screenIndex, formDone, submittedCampaign, answers, answeredFor]);

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

  // Kanpay video aktyèl la pou pwogram sa a (dat video pwograme a). Si li chanje, vizitè a ka re-soumèt.
  const currentCampaign = selected ? activeVideoStartAll(selected.steps || []) : "";
  // Fòmilè a "bloke" sèlman si li soumèt anba MENM kanpay la (oswa si pa gen kanpay video, lock pèmanan)
  const formLocked = formDone && (!currentCampaign || submittedCampaign === currentCampaign);

  // Anons: chak special ki make "anons", men SÈLMAN apre fòmilè a fin ranpli.
  // Yon fwa li parèt, li rete sou tout paj ki rete yo.
  const announcements = [];
  for (let i = 0; i <= screenIndex && i < screens.length; i++) {
    const bl = getStepBlocks(screens[i]);
    for (const b of bl) {
      if (b.kind === "special" && b.banner && formComplete) {
        const startDate = currentResaBaseAll(screens) || specialVideoStart(screens, b);
        const deadlineRaw = addDays(startDate, -10); // dat limit rezèvasyon (10 jou anvan dat session)
        const slot = activeVideoSlotAll(screens);
        const riveRaw = slot ? slot.end : ""; // dezyèm dat la (dat rive a)
        const expired = deadlineRaw && todayStr() > deadlineRaw;
        let node;
        if (expired && riveRaw) {
          // Dat rezèvasyon an pase, men peryòd la poko fini: mesaj "n ap toujou resevwa enskripsyon jiska dat rive a"
          node = renderTemplate(EXPIRED_RESA_TPL, {
            datRive: formatHtDate(riveRaw),
            non: firstNameGlobal,
          });
        } else {
          node = renderTemplate((b.tpl || "").trim() || DEFAULT_SPECIAL_TPL, {
            special: (b.specialName || "").trim() || "special sa a",
            dat: formatHtDate(b.reserveDate),
            dat10: formatHtDate(deadlineRaw),
            non: firstNameGlobal,
          });
        }
        announcements.push({ id: b.id + "-" + i, node });
      }
    }
  }

  // Mesaj swivi pèsonèl (admin nan mete l nan paj prospè yo) — parèt anlè paj la
  const followupDat10 = formatHtDate(addDays(anyCurrentResaBase(programs), -10));
  const followupText = (myFollowup && FOLLOWUP_TPL[myFollowup])
    ? renderTemplate(FOLLOWUP_TPL[myFollowup], { non: firstNameGlobal || "", dat10: followupDat10, dat: "", special: "", adres: myAddr, program: myProgram || (selected && selected.label) || "" })
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
    // Chak pwogram endepandan. Nou konpare ak pwogram repons yo apatni an (answeredFor),
    // konsa lè moun nan tounen akèy epi reouvri MENM pwogram lan, nou kenbe fòmilè a
    // (li pa ka reranpli l, epi anons/swivi yo rete).
    const currentProgId = selected ? selected.id : answeredFor;
    const switching = currentProgId !== p.id;
    setSelected(p);
    setScreenIndex(0);
    setFormIdx(0);
    setAnsweredFor(p.id);
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
      etiquette: getRefAgent(),
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
    const campaignTs = currentCampaign ? new Date(currentCampaign + "T00:00:00").getTime() : 0;
    if (telField && telNorm.ok) {
      setChecking(true);
      const used = await phoneAlreadyUsed(telNorm.local, campaignTs);
      setChecking(false);
      if (used) {
        setFormError("Nimewo sa a deja enskri. Ou pa ka enskri de fwa ak menm nimewo telefòn nan.");
        setFormDone(true); // bloke: yo deja nan lis la, pa kreye yon doub
        setSubmittedCampaign(currentCampaign);
        return;
      }
    }

    // Si se yon NOUVO kanpay video (li te deja soumèt anba yon lòt kanpay),
    // kreye yon nouvo sesyon pou yon nouvo enskripsyon ak bon dat la
    const isNewCampaign = formDone && submittedCampaign && currentCampaign && submittedCampaign !== currentCampaign;
    if (isNewCampaign) sessionRef.current = uid() + Date.now().toString(36);

    setFormDone(true);
    setSubmittedCampaign(currentCampaign);
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
    if (b.kind === "faq") {
      return <FaqBlock key={b.id} block={b} />;
    }
    if (b.kind === "special") {
      if (b.banner) return null; // anons yo parèt anlè paj la, pa anndan blòk la
      const sName = (b.specialName || "").trim();
      const reserveTxt = formatHtDate(b.reserveDate);
      const dat10Txt = formatHtDate(addDays(currentResaBaseAll(screens) || specialVideoStart(screens, b), -10));
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
      if (formLocked && formComplete) {
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
          {announcements.length > 0 && !followupText && (
            <div style={{ marginTop: 22 }}>
              {announcements.map((a) => (
                <div key={a.id} className="mt-rise" style={{ marginBottom: 8, padding: "14px 16px", borderRadius: 14, border: `1px solid ${PALETTE.gold}`, background: `linear-gradient(135deg, rgba(224,165,10,.18), rgba(194,35,142,.14)), #FFFFFF`, boxShadow: "0 8px 22px rgba(142,44,154,.20)" }}>
                  <div style={{ fontSize: 10, letterSpacing: "2px", textTransform: "uppercase", color: PALETTE.gold, fontWeight: 700, marginBottom: 6 }}>★ Anons</div>
                  <p style={{ fontSize: 14.5, color: PALETTE.cream, margin: 0, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{a.node}</p>
                </div>
              ))}
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
  const addBlockSlot = (pid, sid, bid) => updateBlockSchedule(pid, sid, bid, (arr) => [...arr, { id: uid(), start: "", end: "", url: "", session: "" }]);
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

  const saveWaMessages = async (list, activeId) => {
    const nd = { ...draft, waMessages: list, activeWaMessage: activeId };
    setDraft(nd);
    await onSave(nd);
  };

  const saveTickerMsgs = async (msgs, conds, waMap) => {
    const nd = { ...draft, tickerMsgs: msgs };
    if (conds) nd.stageConditions = conds;
    if (waMap) nd.stageWaMsg = waMap;
    setDraft(nd);
    await onSave(nd);
  };

  const saveAgentInfo = async (info) => {
    const nd = { ...draft, agentInfo: info };
    setDraft(nd);
    await onSave(nd);
  };

  const saveAgentsAndInfo = async (names, info) => {
    const nd = { ...draft, agents: names, agentInfo: info };
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
          <button onClick={() => setAdminTab("editor")} style={adminTab === "editor" ? goldBtn : ghostBtn}>Editè</button>
          <button onClick={() => setAdminTab("prospects")} style={adminTab === "prospects" ? goldBtn : ghostBtn}>Nouvo Prospect</button>
          <button onClick={() => setAdminTab("stats")} style={adminTab === "stats" ? goldBtn : ghostBtn}>Estatistik</button>
          <button onClick={onExit} style={ghostBtn}>Wè paj piblik</button>
          <button onClick={() => setAuthed(false)} style={ghostBtn}>Sòti</button>
        </div>
      </div>

      {adminTab === "prospects" ? (
        <ProspectsView agents={draft.agents || []} isAdmin={true} onSaveAgents={saveAgents} programs={draft.programs || []} waMessages={draft.waMessages || []} activeWaMessage={draft.activeWaMessage || ""} onSaveWaMessages={saveWaMessages} tickerMsgs={draft.tickerMsgs || {}} onSaveTickerMsgs={saveTickerMsgs} stageConditions={draft.stageConditions || {}} agentInfo={draft.agentInfo || {}} onSaveAgentInfo={saveAgentInfo} onSaveAgentsAndInfo={saveAgentsAndInfo} stageWaMsg={draft.stageWaMsg || {}} />
      ) : adminTab === "stats" ? (
        <StatsView />
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
                                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${PALETTE.line}` }}>
                                          <span style={{ fontSize: 11, color: PALETTE.gold, fontWeight: 700 }}>Dat session</span>
                                          <span style={{ fontSize: 11, color: `${PALETTE.cream}77`, display: "block", marginBottom: 4 }}>
                                            Jou session an. Dat limit rezèvasyon an ap 10 jou ANVAN dat sa a.
                                          </span>
                                          <input className="mt-input" type="date" style={{ colorScheme: "light", maxWidth: 200 }} value={sl.session || ""} onChange={(e) => updateBlockSlot(p.id, s.id, b.id, sl.id, { session: e.target.value })} />
                                        </div>
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
                                      <strong>{"{dat10}"}</strong> = 10 jou anvan dat session an (oswa 10 jou anvan dat komansman video a si pa gen session)
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

                              {!collapsed[b.id] && b.kind === "faq" && (
                                <>
                                  <input className="mt-input" placeholder="Tit — opsyonèl (egz: Kesyon moun konn poze)" value={b.title || ""} onChange={(e) => updateBlock(p.id, s.id, b.id, { title: e.target.value })} />
                                  <div style={{ fontSize: 12, color: `${PALETTE.cream}99`, margin: "6px 0 8px", lineHeight: 1.5 }}>
                                    Ekri chak kesyon ak repons yo. Sou paj la, vizitè a ap wè kesyon yo youn apre lòt epi chwazi youn ou plizyè repons.
                                  </div>
                                  {(b.items || []).map((it, ii) => (
                                    <div key={it.id} style={{ border: `1px solid ${PALETTE.line}`, borderRadius: 10, padding: 10, marginBottom: 8, background: "rgba(194,35,142,.03)" }}>
                                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                        <span style={{ fontSize: 11.5, fontWeight: 700, color: PALETTE.goldSoft }}>Kesyon {ii + 1}</span>
                                        <button onClick={() => updateBlock(p.id, s.id, b.id, { items: (b.items || []).filter((x) => x.id !== it.id) })} style={{ border: "none", background: "transparent", color: PALETTE.danger, cursor: "pointer", fontSize: 14 }}>✕</button>
                                      </div>
                                      <input className="mt-input" placeholder="Kesyon an (egz: Konbyen kou a koute?)" value={it.q || ""} onChange={(e) => updateBlock(p.id, s.id, b.id, { items: (b.items || []).map((x) => x.id === it.id ? { ...x, q: e.target.value } : x) })} />
                                      <div style={{ fontSize: 11, color: `${PALETTE.cream}88`, margin: "8px 0 4px" }}>Repons yo:</div>
                                      {(it.options || []).map((op, oi) => (
                                        <div key={op.id} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 5 }}>
                                          <span style={{ color: PALETTE.goldSoft, fontSize: 13 }}>•</span>
                                          <input className="mt-input" style={{ flex: 1 }} placeholder={`Repons ${oi + 1}`} value={op.text || ""} onChange={(e) => updateBlock(p.id, s.id, b.id, { items: (b.items || []).map((x) => x.id === it.id ? { ...x, options: (x.options || []).map((o) => o.id === op.id ? { ...o, text: e.target.value } : o) } : x) })} />
                                          <button onClick={() => updateBlock(p.id, s.id, b.id, { items: (b.items || []).map((x) => x.id === it.id ? { ...x, options: (x.options || []).filter((o) => o.id !== op.id) } : x) })} style={{ border: "none", background: "transparent", color: PALETTE.danger, cursor: "pointer", fontSize: 13 }}>✕</button>
                                        </div>
                                      ))}
                                      <button onClick={() => updateBlock(p.id, s.id, b.id, { items: (b.items || []).map((x) => x.id === it.id ? { ...x, options: [...(x.options || []), { id: Math.random().toString(36).slice(2, 9), text: "" }] } : x) })} style={{ ...ghostBtn, padding: "4px 10px", fontSize: 12, marginTop: 2 }}>+ Ajoute yon repons</button>
                                    </div>
                                  ))}
                                  <button onClick={() => updateBlock(p.id, s.id, b.id, { items: [...(b.items || []), { id: Math.random().toString(36).slice(2, 9), q: "", options: [] }] })} style={{ ...ghostBtn, marginTop: 4 }}>+ Ajoute yon kesyon</button>
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
                            <button onClick={() => addBlock(p.id, s.id, "faq")} style={{ ...ghostBtn, flex: 1, minWidth: 70 }}>+ Kesyon</button>
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
        <p style={{ margin: "8px 0 0", fontSize: 11.5, color: `${PALETTE.cream}88`, textAlign: "center" }}>
          Klike "Anrejistre chanjman yo" pou sove. Tann pou w wè "Anrejistre ✓" anvan ou fèmen oswa deplwaye.
        </p>
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
      <ProspectsView agents={(config && config.agents) || []} isAdmin={false} programs={(config && config.programs) || []} waMessages={(config && config.waMessages) || []} activeWaMessage={(config && config.activeWaMessage) || ""} tickerMsgs={(config && config.tickerMsgs) || {}} stageConditions={(config && config.stageConditions) || {}} stageWaMsg={(config && config.stageWaMsg) || {}} />
    </div>
  );
}

/* Estatistik vizit yo (admin) */
function StatsView() {
  const [events, setEvents] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    setEvents(await loadEvents());
    setBusy(false);
  };
  useEffect(() => { load(); }, []);

  const visitsByDay = useMemo(() => {
    const m = {};
    (events || []).filter((e) => e.type === "visit").forEach((e) => {
      const iso = e.at ? new Date(e.at).toISOString().slice(0, 10) : "?";
      m[iso] = (m[iso] || 0) + 1;
    });
    return Object.entries(m).sort((a, b) => b[0].localeCompare(a[0]));
  }, [events]);

  const pageViews = useMemo(() => {
    const m = {};
    (events || []).filter((e) => e.type === "page").forEach((e) => {
      const lbl = e.label || "—";
      m[lbl] = (m[lbl] || 0) + 1;
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [events]);

  const totalVisits = (events || []).filter((e) => e.type === "visit").length;
  const maxDay = Math.max(1, ...visitsByDay.map((d) => d[1]));
  const maxPage = Math.max(1, ...pageViews.map((d) => d[1]));

  const fmtIso = (iso) => {
    try { return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }); }
    catch (e) { return iso; }
  };

  const bar = (n, max, grad) => (
    <div style={{ flex: 1, background: "rgba(123,45,142,.10)", borderRadius: 6, overflow: "hidden" }}>
      <div style={{ width: `${(n / max) * 100}%`, minWidth: 26, background: grad, color: "#fff", fontSize: 12, fontWeight: 700, padding: "3px 8px", borderRadius: 6, textAlign: "right", boxSizing: "border-box" }}>{n}</div>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600, margin: 0 }}>Estatistik vizit yo</h2>
        <button onClick={load} style={ghostBtn} disabled={busy}>{busy ? "Ap chaje…" : "Aktyalize"}</button>
      </div>

      {events === null ? (
        <p style={{ color: `${PALETTE.cream}99` }}>Ap chaje…</p>
      ) : (
        <>
          <div style={{ marginBottom: 24, padding: "14px 18px", border: `1px solid ${PALETTE.line}`, borderRadius: 14, background: "rgba(194,35,142,.05)", display: "inline-block", minWidth: 160 }}>
            <div style={{ fontSize: 13, color: `${PALETTE.cream}aa` }}>Total vizit</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: PALETTE.gold }}>{totalVisits}</div>
          </div>

          <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 12px" }}>Konbyen moun pa jou</h3>
          {visitsByDay.length === 0 ? (
            <p style={{ fontSize: 13, color: `${PALETTE.cream}88`, margin: "0 0 24px" }}>Poko gen done vizit. (L ap kòmanse konte apre w deplwaye.)</p>
          ) : (
            <div style={{ marginBottom: 28 }}>
              {visitsByDay.map(([iso, n]) => (
                <div key={iso} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 150, fontSize: 13, color: `${PALETTE.cream}cc`, whiteSpace: "nowrap" }}>{fmtIso(iso)}</div>
                  {bar(n, maxDay, `linear-gradient(90deg, ${PALETTE.goldSoft}, ${PALETTE.blush})`)}
                </div>
              ))}
            </div>
          )}

          <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 12px" }}>Paj ki pi vizite yo</h3>
          {pageViews.length === 0 ? (
            <p style={{ fontSize: 13, color: `${PALETTE.cream}88` }}>Poko gen done paj.</p>
          ) : (
            <div>
              {pageViews.map(([lbl, n]) => (
                <div key={lbl} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 200, fontSize: 13, color: `${PALETTE.cream}cc` }}>{lbl}</div>
                  {bar(n, maxPage, `linear-gradient(90deg, #7B2D8E, ${PALETTE.goldSoft})`)}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* Konkou ant ajan yo — Progression des Agents (moun ki make "vini" konte pou ajan yo) */
/* Blòk Kesyon — chak kesyon gen plizyè repons; vizitè a wè yo youn apre lòt epi chwazi youn ou plizyè */
function FaqBlock({ block }) {
  const items = (block.items || []).filter((it) => (it.q || "").trim());
  const [idx, setIdx] = useState(0);
  const [sel, setSel] = useState({}); // { itemId: [optionIds] }
  if (items.length === 0) return null;
  const i = Math.min(idx, items.length - 1);
  const cur = items[i];
  const opts = (cur.options || []).filter((o) => (o.text || "").trim());
  const chosen = sel[cur.id] || [];
  const toggle = (opId) => setSel((s) => {
    const c = s[cur.id] || [];
    return { ...s, [cur.id]: c.includes(opId) ? c.filter((x) => x !== opId) : [...c, opId] };
  });
  return (
    <div style={{ marginBottom: 4 }}>
      {block.title && <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600, color: PALETTE.cream, margin: "0 0 12px" }}>{block.title}</h3>}
      <div style={{ border: `1px solid ${PALETTE.line}`, borderRadius: 14, padding: "18px 16px", background: "#fff" }}>
        <div style={{ fontSize: 12, color: `${PALETTE.cream}88`, fontWeight: 700 }}>Kesyon {i + 1} / {items.length}</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: PALETTE.cream, margin: "10px 0 14px", lineHeight: 1.4 }}>{cur.q}</div>
        {opts.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {opts.map((op) => {
              const on = chosen.includes(op.id);
              return (
                <button key={op.id} onClick={() => toggle(op.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 13px", borderRadius: 10, cursor: "pointer", textAlign: "left", border: `1.5px solid ${on ? PALETTE.goldSoft : PALETTE.line}`, background: on ? "rgba(194,35,142,.07)" : "#fff", fontSize: 14.5, color: PALETTE.cream, fontWeight: 500 }}>
                  <span style={{ fontSize: 16, color: on ? PALETTE.goldSoft : `${PALETTE.cream}66` }}>{on ? "☑" : "☐"}</span>
                  {op.text}
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: `${PALETTE.cream}88`, marginBottom: 16 }}>Pa gen repons pou kesyon sa a.</div>
        )}
        {i < items.length - 1 && (() => {
          const canNext = opts.length === 0 || chosen.length > 0;
          return (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
              <button onClick={() => { if (opts.length === 0 || chosen.length > 0) setIdx((v) => v + 1); }} style={{ ...goldBtn, opacity: canNext ? 1 : 0.5 }}>Kesyon swivan →</button>
              {!canNext && <span style={{ fontSize: 10.5, color: PALETTE.blush }}>Chwazi omwen yon repons pou kontinye</span>}
            </div>
          );
        })()}
      </div>
      {items.length > 1 && (
        <div style={{ display: "flex", gap: 5, justifyContent: "center", marginTop: 10, flexWrap: "wrap" }}>
          {items.map((_, k) => (
            <button key={k} onClick={() => setIdx(k)} aria-label={`Kesyon ${k + 1}`} style={{ width: 9, height: 9, borderRadius: 999, border: "none", cursor: "pointer", background: k === i ? PALETTE.goldSoft : PALETTE.line, padding: 0 }} />
          ))}
        </div>
      )}
    </div>
  );
}

/* Konkou ant ajan yo — Progression des Agents (moun ki make "vini" konte pou ajan yo) */
function AgentsProgressView({ items = [], programs = [] }) {
  const OBJ = 60;
  const LEVELS = [
    { key: "silver", label: "SILVER", pct: 50, n: Math.round(OBJ * 0.5), color: "#9AA0A6", soft: "#EEF0F2", grad: "linear-gradient(90deg,#C7CAD0,#9AA0A6)", icon: "🥈" },
    { key: "gold", label: "GOLD", pct: 80, n: Math.round(OBJ * 0.8), color: "#E0A50A", soft: "#FCEFC7", grad: "linear-gradient(90deg,#F6CE5A,#E0A50A)", icon: "🥇" },
    { key: "diamond", label: "DIAMOND", pct: 110, n: Math.round(OBJ * 1.1), color: "#5FA8D3", soft: "#E3F1FA", grad: "linear-gradient(90deg,#9AD1EF,#5FA8D3)", icon: "💎" },
  ];
  const progList = (programs || []).map((p) => p.label).filter(Boolean);
  const [sel, setSel] = useState(progList[0] || "");
  useEffect(() => { if (!progList.includes(sel) && progList[0]) setSel(progList[0]); }, [progList.join("|")]);

  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const moisFr = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  const monthLabel = `${moisFr[now.getMonth()]} ${now.getFullYear()}`;
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const endLabel = `${endOfMonth.getDate()} ${moisFr[now.getMonth()]} ${now.getFullYear()}`;
  const daysLeft = Math.max(0, Math.ceil((endOfMonth - now) / 86400000));

  const progIcon = (lbl) => {
    const s = (lbl || "").toLowerCase();
    if (/ongl|nail/.test(s)) return "💅";
    if (/maki|makyaj|make|maqui/.test(s)) return "💄";
    if (/tres|braid/.test(s)) return "🎀";
    if (/dread|loc/.test(s)) return "🧶";
    if (/fl[eè]|fleur|flow|flo/.test(s)) return "🌸";
    return "⭐";
  };
  const initials = (name) => (name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const avatarColor = (name) => { let h = 0; for (const c of name || "") h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h},55%,62%)`; };

  const { agents, winners } = useMemo(() => {
    const vinis = (items || []).filter((p) => p.followup === "vini" && p.program === sel && (!p.cameAt || p.cameAt.slice(0, 7) === ym));
    const by = {};
    vinis.forEach((p) => {
      const a = (String(p.etiquette || "").trim()) || "San etikèt";
      (by[a] = by[a] || []).push(p.cameAt || "9999-99-99");
    });
    const ags = Object.keys(by).map((a) => ({ agent: a, count: by[a].length, times: by[a].slice().sort() })).sort((x, y) => y.count - x.count);
    const wins = {};
    LEVELS.forEach((L) => {
      let best = null;
      ags.forEach((ag) => {
        if (ag.count >= L.n) { const t = ag.times[L.n - 1] || "9999"; if (!best || t < best.time) best = { agent: ag.agent, time: t }; }
      });
      wins[L.key] = best;
    });
    return { agents: ags, winners: wins };
  }, [items, sel, ym]);

  const levelOf = (name) => {
    if (winners.diamond && winners.diamond.agent === name) return LEVELS[2];
    if (winners.gold && winners.gold.agent === name) return LEVELS[1];
    if (winners.silver && winners.silver.agent === name) return LEVELS[0];
    return null;
  };
  const barColor = (name) => { const L = levelOf(name); return L ? L.grad : `linear-gradient(90deg,${PALETTE.blush},#C2238E)`; };
  const wonLevels = (name) => LEVELS.filter((L) => winners[L.key] && winners[L.key].agent === name);

  const seg = [{ w: 50 / 150, L: LEVELS[0] }, { w: 30 / 150, L: LEVELS[1] }, { w: 30 / 150, L: LEVELS[2] }];
  const axisTicks = [0, 25, 50, 80, 110, 150];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 30 }}>🏆</span>
          <div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 800, letterSpacing: ".5px", margin: 0, color: PALETTE.cream }}>PROGRESSION DES AGENTS</h2>
            <p style={{ fontSize: 13, color: `${PALETTE.cream}99`, margin: "2px 0 0" }}>Soyez le premier à atteindre les objectifs et gagnez les bonus !</p>
          </div>
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", border: `1px solid ${PALETTE.line}`, borderRadius: 12, background: "#fff", fontWeight: 700, color: PALETTE.cream, fontSize: 14 }}>📅 {monthLabel}</div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        {progList.map((pl) => {
          const on = sel === pl;
          return (
            <button key={pl} onClick={() => setSel(pl)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 14, cursor: "pointer", border: `2px solid ${on ? PALETTE.blush : PALETTE.line}`, background: on ? "rgba(229,36,126,.06)" : "#fff", textAlign: "left" }}>
              <span style={{ fontSize: 20 }}>{progIcon(pl)}</span>
              <span>
                <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: on ? PALETTE.blush : PALETTE.cream }}>{pl}</span>
                <span style={{ display: "block", fontSize: 11, color: `${PALETTE.cream}88` }}>Objectif : {OBJ}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ border: `1px solid ${PALETTE.line}`, borderRadius: 18, padding: 18, background: "#fff", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: PALETTE.cream, letterSpacing: ".5px" }}>{(sel || "").toUpperCase()} CHALLENGE</h3>
            <p style={{ margin: "3px 0 0", fontSize: 13, color: `${PALETTE.cream}99` }}>🎯 Objectif : {OBJ} personnes</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ margin: 0, fontSize: 12.5, color: `${PALETTE.cream}99` }}>🕒 Fin du challenge : {endLabel}</p>
            <p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 800, color: PALETTE.blush }}>Il reste {daysLeft} jour{daysLeft > 1 ? "s" : ""}</p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          {seg.map((s) => {
            const w = winners[s.L.key];
            return (
              <div key={s.L.key} style={{ flex: s.w, minWidth: 88, background: s.L.soft, padding: "12px 8px", borderRadius: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontWeight: 800, fontSize: 12.5, color: s.L.color }}>
                  <span>{s.L.icon}</span>{s.L.label}
                </div>
                <div style={{ textAlign: "center", fontSize: 11, color: `${PALETTE.cream}aa`, marginTop: 3 }}>{s.L.n} pers. ({s.L.pct}%)</div>
                {w && <div style={{ textAlign: "center", fontSize: 10.5, fontWeight: 700, color: s.L.color, marginTop: 4 }}>🏆 {w.agent}</div>}
              </div>
            );
          })}
          <div style={{ flex: 40 / 150, minWidth: 88, background: "rgba(229,36,126,.08)", padding: "12px 8px", borderRadius: 10 }}>
            <div style={{ textAlign: "center", fontWeight: 800, fontSize: 12, color: PALETTE.blush }}>🏆 GAGNANT</div>
            <div style={{ textAlign: "center", fontSize: 10.5, color: `${PALETTE.cream}aa`, marginTop: 3 }}>{winners.silver ? winners.silver.agent : "—"}</div>
          </div>
        </div>
        <div style={{ position: "relative", height: 16, marginTop: 6 }}>
          {axisTicks.map((t) => (
            <span key={t} style={{ position: "absolute", left: `${(t / 150) * 100}%`, transform: "translateX(-50%)", fontSize: 10.5, color: [50, 80, 110].includes(t) ? PALETTE.gold : `${PALETTE.cream}77`, fontWeight: [50, 80, 110].includes(t) ? 800 : 500 }}>{t}%</span>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 236px", gap: 16, alignItems: "start" }}>
        <div style={{ border: `1px solid ${PALETTE.line}`, borderRadius: 18, padding: 16, background: "#fff" }}>
          {agents.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 16px" }}>
              <p style={{ fontSize: 15, color: `${PALETTE.cream}cc`, margin: 0 }}>Poko gen ajan pou {sel} nan {monthLabel}.</p>
              <p style={{ fontSize: 12.5, color: `${PALETTE.cream}88`, margin: "6px 0 0" }}>Lè yon ajan (etikèt) make yon moun "Vini", l ap parèt isit la.</p>
            </div>
          ) : agents.map((ag, i) => {
            const pctReal = Math.round((ag.count / OBJ) * 100);
            const barW = Math.min(150, pctReal) / 150 * 100;
            const medal = ["🥇", "🥈", "🥉"][i];
            const won = wonLevels(ag.agent);
            return (
              <div key={ag.agent} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 0", borderBottom: i < agents.length - 1 ? `1px solid ${PALETTE.line}` : "none" }}>
                <span style={{ width: 22, textAlign: "center", fontSize: medal ? 16 : 13, fontWeight: 800, color: `${PALETTE.cream}99` }}>{medal || i + 1}</span>
                <span style={{ width: 32, height: 32, borderRadius: 999, background: avatarColor(ag.agent), color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{initials(ag.agent)}</span>
                <div style={{ width: 88, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", fontSize: 13, fontWeight: 700, color: PALETTE.cream }}>{ag.agent}</div>
                <div style={{ width: 58, fontSize: 11, color: `${PALETTE.cream}99`, whiteSpace: "nowrap" }}>{ag.count} pers.</div>
                <div style={{ flex: 1, minWidth: 60, background: "rgba(123,45,142,.08)", borderRadius: 8, overflow: "hidden", height: 18 }}>
                  <div style={{ width: `${barW}%`, minWidth: 8, height: "100%", background: barColor(ag.agent), borderRadius: 8 }} />
                </div>
                <span style={{ width: 38, textAlign: "right", fontSize: 12.5, fontWeight: 800, color: PALETTE.cream }}>{pctReal}%</span>
                {won.length > 0 && <span style={{ fontSize: 13 }} title={won.map((L) => L.label).join(" + ")}>{won.map((L) => L.icon).join("")}</span>}
              </div>
            );
          })}
        </div>

        <div>
          <div style={{ border: `1px solid ${PALETTE.line}`, borderRadius: 18, padding: 14, background: "#fff", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 800, fontSize: 13, color: PALETTE.cream, marginBottom: 6 }}>👑 GAGNANTS DES BONUS</div>
            {LEVELS.map((L) => {
              const w = winners[L.key];
              return (
                <div key={L.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: `1px solid ${PALETTE.line}` }}>
                  <span style={{ fontSize: 18 }}>{L.icon}</span>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: L.color }}>{L.label}</div>
                    <div style={{ fontSize: 12, color: w ? PALETTE.cream : `${PALETTE.cream}77` }}>{w ? w.agent : "Pas encore gagné"}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ borderRadius: 18, padding: 14, background: "rgba(229,36,126,.07)", border: `1px solid ${PALETTE.lineStrong}` }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: PALETTE.blush, marginBottom: 4 }}>Continuez comme ça ! 🎁</div>
            <p style={{ fontSize: 11.5, color: `${PALETTE.cream}aa`, margin: 0, lineHeight: 1.5 }}>Le premier à chaque niveau remporte le bonus ! Un agent qui atteint plusieurs niveaux additionne ses bonus.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
/* Espas Ajan yo — paj /agent (login ak etikèt + modpas 4 chif, pwofil, tablo de bòd, rémunération, lien referans) */
function AgentSpace({ config, onSave }) {
  const agentsList = (config && config.agents) || [];
  const names = [...new Set(agentsList.map((a) => (typeof a === "string" ? a : (a && a.name) || "")).filter(Boolean))];
  const info = (config && config.agentInfo) || {};

  const [items, setItems] = useState(null);
  useEffect(() => { (async () => setItems(await loadProspects()))(); }, []);

  const [me, setMe] = useState(() => { try { return localStorage.getItem("missthani_agent") || ""; } catch (e) { return ""; } });
  const [pick, setPick] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("dash"); // "dash" | "remun"

  const login = () => {
    if (!pick) { setErr("Chwazi non ou nan lis la."); return; }
    const expected = String((info[pick] && info[pick].pin) || "");
    if (!expected) { setErr("Pa gen modpas pou etikèt sa a. Mande admin nan mete youn."); return; }
    if (pin !== expected) { setErr("Modpas la pa kòrèk."); return; }
    setMe(pick); try { localStorage.setItem("missthani_agent", pick); } catch (e) {}
    setErr(""); setPin("");
  };
  const logout = () => { setMe(""); setPick(""); try { localStorage.removeItem("missthani_agent"); } catch (e) {} };

  const PER = 750;
  const BONUS = { silver: 2500, gold: 5000, diamond: 7500 };
  const LVLN = { silver: 30, gold: 48, diamond: 66 };
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const remun = useMemo(() => {
    if (!me || !items) return { count: 0, base: 0, bonuses: [], total: 0 };
    let count = 0; const bonuses = [];
    ((config && config.programs) || []).forEach((prog) => {
      const vinis = items.filter((p) => p.followup === "vini" && p.program === prog.label && (!p.cameAt || p.cameAt.slice(0, 7) === ym));
      const by = {};
      vinis.forEach((p) => { const a = (String(p.etiquette || "").trim()) || "San etikèt"; (by[a] = by[a] || []).push(p.cameAt || "9999-99-99"); });
      count += (by[me] || []).length;
      ["silver", "gold", "diamond"].forEach((lvl) => {
        const n = LVLN[lvl]; let best = null;
        Object.keys(by).forEach((a) => { if (by[a].length >= n) { const t = by[a].slice().sort()[n - 1] || "9999"; if (!best || t < best.t) best = { a, t }; } });
        if (best && best.a === me) bonuses.push({ program: prog.label, level: lvl, amount: BONUS[lvl] });
      });
    });
    const base = count * PER;
    const bt = bonuses.reduce((s, b) => s + b.amount, 0);
    return { count, base, bonuses, total: base + bt };
  }, [me, items, config, ym]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const refLink = me ? `${origin}/?ref=${encodeURIComponent(me)}` : "";
  const myPhoto = (info[me] && info[me].photo) || "";
  const gmt = (n) => n.toLocaleString("fr-FR") + " gdes";

  const uploadPhoto = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        const max = 240; const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        const dataUrl = cv.toDataURL("image/jpeg", 0.8);
        const nd = { ...config, agentInfo: { ...(config.agentInfo || {}), [me]: { ...((config.agentInfo || {})[me] || {}), photo: dataUrl } } };
        await onSave(nd);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const copyLink = () => { try { navigator.clipboard.writeText(refLink); } catch (e) {} };

  const wrap = { maxWidth: 1080, margin: "0 auto", padding: "24px 18px 60px" };

  // ---- Login ----
  if (!me) {
    return (
      <div style={wrap}>
        <div style={{ textAlign: "center", marginTop: 20, marginBottom: 22 }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 34, fontWeight: 700, color: PALETTE.goldSoft, letterSpacing: "1px" }}>MISS THANI</div>
          <div style={{ fontSize: 12, letterSpacing: "3px", color: `${PALETTE.cream}99`, fontWeight: 600 }}>BONUS SYSTEM</div>
        </div>
        <div style={{ maxWidth: 380, margin: "0 auto", background: "#fff", border: `1px solid ${PALETTE.line}`, borderRadius: 18, padding: 22 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 4px", color: PALETTE.cream }}>Connexion Agent</h2>
          <p style={{ fontSize: 13, color: `${PALETTE.cream}99`, margin: "0 0 16px" }}>Chwazi non ou epi antre modpas 4 chif ou.</p>
          <label style={{ fontSize: 12.5, fontWeight: 700, color: PALETTE.cream }}>Non ou (etikèt)</label>
          <select className="mt-input" style={{ margin: "6px 0 14px" }} value={pick} onChange={(e) => { setPick(e.target.value); setErr(""); }}>
            <option value="">Chwazi…</option>
            {names.map((n) => (<option key={n} value={n}>{n}</option>))}
          </select>
          <label style={{ fontSize: 12.5, fontWeight: 700, color: PALETTE.cream }}>Modpas (4 chif)</label>
          <input className="mt-input" style={{ marginTop: 6, letterSpacing: "6px", textAlign: "center", fontSize: 20 }} type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setErr(""); }} onKeyDown={(e) => { if (e.key === "Enter") login(); }} placeholder="••••" />
          {err && <p style={{ color: PALETTE.danger, fontSize: 13, margin: "10px 0 0" }}>{err}</p>}
          <button onClick={login} style={{ ...goldBtn, width: "100%", marginTop: 16 }}>Konekte</button>
          {names.length === 0 && <p style={{ fontSize: 12, color: `${PALETTE.cream}88`, marginTop: 12 }}>Poko gen okenn etikèt. Admin nan dwe kreye etikèt yo ak modpas 4 chif nan panèl la.</p>}
        </div>
      </div>
    );
  }

  // ---- Pwofil / Tablo de bòd ----
  return (
    <div style={wrap}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <label style={{ cursor: "pointer", position: "relative" }} title="Chanje foto">
            {myPhoto ? (
              <img src={myPhoto} alt="" style={{ width: 58, height: 58, borderRadius: 999, objectFit: "cover", border: `2px solid ${PALETTE.goldSoft}` }} />
            ) : (
              <span style={{ width: 58, height: 58, borderRadius: 999, background: PALETTE.goldSoft, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 20 }}>{(me[0] || "?").toUpperCase()}</span>
            )}
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => uploadPhoto(e.target.files && e.target.files[0])} />
            <span style={{ position: "absolute", bottom: -2, right: -2, background: PALETTE.blush, color: "#fff", width: 20, height: 20, borderRadius: 999, fontSize: 12, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>✎</span>
          </label>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, color: PALETTE.cream }}>{me}</div>
            <div style={{ fontSize: 12.5, color: `${PALETTE.cream}99` }}>Agent Miss Thani</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => { if (typeof window !== "undefined") window.location.href = "/formulaire"; }} style={ghostBtn}>← Lis prospè yo</button>
          <button onClick={logout} style={ghostBtn}>Dekonekte</button>
        </div>
      </div>

      {/* Lien referans */}
      <div style={{ background: "rgba(229,36,126,.07)", border: `1px solid ${PALETTE.lineStrong}`, borderRadius: 16, padding: 14, marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: PALETTE.blush, marginBottom: 6 }}>🔗 Lien referans ou a</div>
        <p style={{ fontSize: 12, color: `${PALETTE.cream}aa`, margin: "0 0 8px" }}>Pataje lien sa a. Tout moun ki enskri pa lien sa a ap otomatikman gen etikèt ou an, epi ap konte pou ou.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <code style={{ flex: 1, minWidth: 180, background: "#fff", border: `1px solid ${PALETTE.line}`, borderRadius: 8, padding: "8px 10px", fontSize: 12.5, wordBreak: "break-all", color: PALETTE.cream }}>{refLink}</code>
          <button onClick={copyLink} style={goldBtn}>Kopye lien an</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setTab("dash")} style={tab === "dash" ? goldBtn : ghostBtn}>Tableau de bord</button>
        <button onClick={() => setTab("remun")} style={tab === "remun" ? goldBtn : ghostBtn}>Rémunération</button>
      </div>

      {tab === "remun" ? (
        <div style={{ background: "#fff", border: `1px solid ${PALETTE.line}`, borderRadius: 18, padding: 18 }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800, color: PALETTE.cream }}>Rémunération — {now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</h3>
          <p style={{ fontSize: 12.5, color: `${PALETTE.cream}99`, margin: "0 0 16px" }}>750 gdes pa moun ki vini. Bonis: Silver 2 500 · Gold 5 000 · Diamond 7 500 gdes.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 16 }}>
            <div style={{ border: `1px solid ${PALETTE.line}`, borderRadius: 14, padding: 14 }}>
              <div style={{ fontSize: 12, color: `${PALETTE.cream}aa` }}>Moun ki vini</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: PALETTE.cream }}>{remun.count}</div>
              <div style={{ fontSize: 12, color: `${PALETTE.cream}99` }}>× 750 = {gmt(remun.base)}</div>
            </div>
            <div style={{ border: `1px solid ${PALETTE.line}`, borderRadius: 14, padding: 14 }}>
              <div style={{ fontSize: 12, color: `${PALETTE.cream}aa` }}>Bonis nivo yo</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: PALETTE.gold }}>{gmt(remun.bonuses.reduce((s, b) => s + b.amount, 0))}</div>
              <div style={{ fontSize: 12, color: `${PALETTE.cream}99` }}>{remun.bonuses.length} bonis</div>
            </div>
            <div style={{ border: `2px solid ${PALETTE.blush}`, borderRadius: 14, padding: 14, background: "rgba(229,36,126,.06)" }}>
              <div style={{ fontSize: 12, color: `${PALETTE.cream}aa` }}>TOTAL</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: PALETTE.blush }}>{gmt(remun.total)}</div>
            </div>
          </div>
          {remun.bonuses.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: PALETTE.cream, marginBottom: 6 }}>Detay bonis yo:</div>
              {remun.bonuses.map((b, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: `1px solid ${PALETTE.line}` }}>
                  <span style={{ color: PALETTE.cream }}>{b.level.toUpperCase()} — {b.program}</span>
                  <strong style={{ color: PALETTE.gold }}>{gmt(b.amount)}</strong>
                </div>
              ))}
            </div>
          )}
          {!items && <p style={{ color: `${PALETTE.cream}99` }}>Ap chaje…</p>}
        </div>
      ) : (
        items === null ? <p style={{ color: `${PALETTE.cream}99` }}>Ap chaje…</p> : <AgentsProgressView items={items || []} programs={(config && config.programs) || []} />
      )}
    </div>
  );
}

function ProspectsView({ agents = [], isAdmin = false, onSaveAgents, programs = [], waMessages = [], activeWaMessage = "", onSaveWaMessages, tickerMsgs = {}, onSaveTickerMsgs, stageConditions = {}, agentInfo = {}, onSaveAgentInfo, onSaveAgentsAndInfo, stageWaMsg = {} }) {
  const fillTpl = (key, vars) => {
    let t = (tickerMsgs && tickerMsgs[key]) || TICKER_DEFAULTS[key] || "";
    Object.keys(vars || {}).forEach((k) => { t = t.split(`{${k}}`).join(vars[k] == null ? "" : vars[k]); });
    return t;
  };
  // Kondisyon ki konekte ak yon etap (default = konpòtman natirèl la)
  const condsOf = (key) => (stageConditions && stageConditions[key]) || DEFAULT_STAGE_CONDS[key] || [];
  const matchConds = (p, key) => condsOf(key).every((ck) => (CONDITIONS_MAP[ck] ? CONDITIONS_MAP[ck].test(p) : true));
  const [items, setItems] = useState(null); // null = ap chaje
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("list"); // "list" | "pdf"
  const [pdfFilter, setPdfFilter] = useState("none"); // "none" | "date" | "etiquette" | "program"
  const [pdfEtq, setPdfEtq] = useState(""); // etikèt chwazi pou filtè a
  const [pdfPeriod, setPdfPeriod] = useState(""); // (pa itilize ankò)
  const [pdfMonth, setPdfMonth] = useState(""); // mwa chwazi pou filtè dat la
  const [pdfWeek, setPdfWeek] = useState(""); // semèn chwazi anndan mwa a ("" = tout mwa a)
  const [pdfProgram, setPdfProgram] = useState(""); // programme chwazi pou filtè a
  const [tab, setTab] = useState("prospects"); // "prospects" | "students"
  const [creatingEtq, setCreatingEtq] = useState(false); // chan kreye etikèt la louvri
  const [newEtq, setNewEtq] = useState("");
  const [newPin, setNewPin] = useState("");
  const [saveErr, setSaveErr] = useState(""); // mesaj erè si anrejistreman echwe
  const [msgPanel, setMsgPanel] = useState(false); // panèl modèl mesaj WhatsApp louvri
  const [resaPanel, setResaPanel] = useState(false); // panèl apèsi dat rezèvasyon yo
  const [msgFilter, setMsgFilter] = useState(""); // filtre pa mesaj/etap (stage key)
  const [etqFilter, setEtqFilter] = useState(""); // filtre pa etikèt (ajan)
  const [msgDraft, setMsgDraft] = useState(waMessages || []);
  const [activeDraft, setActiveDraft] = useState(activeWaMessage || "");
  const [msgSaved, setMsgSaved] = useState(false);
  useEffect(() => { setMsgDraft(waMessages || []); }, [waMessages]);
  useEffect(() => { setActiveDraft(activeWaMessage || ""); }, [activeWaMessage]);

  // Bwat mesaj — panèl pou modifye mesaj ki defile nan kazye yo
  const [boxPanel, setBoxPanel] = useState(false);
  const [boxDraft, setBoxDraft] = useState(tickerMsgs || {});
  const [condDraft, setCondDraft] = useState(stageConditions || {});
  const [waDraft, setWaDraft] = useState(stageWaMsg || {});
  const [openInsert, setOpenInsert] = useState(""); // ki etap ki gen meni "+" louvri
  const [openConn, setOpenConn] = useState(""); // ki etap ki gen panèl Koneksyon louvri
  const [boxSaved, setBoxSaved] = useState(false);
  useEffect(() => { if (boxPanel) return; setBoxDraft(tickerMsgs || {}); }, [tickerMsgs, boxPanel]);
  useEffect(() => { if (boxPanel) return; setCondDraft(stageConditions || {}); }, [stageConditions, boxPanel]);
  const boxVal = (key) => (boxDraft[key] != null ? boxDraft[key] : TICKER_DEFAULTS[key] || "");
  const setBoxVal = (key, v) => setBoxDraft((d) => ({ ...d, [key]: v }));
  const resetBoxVal = (key) => setBoxDraft((d) => { const n = { ...d }; delete n[key]; return n; });
  const insertVar = (key, varText) => setBoxDraft((d) => ({ ...d, [key]: (d[key] != null ? d[key] : TICKER_DEFAULTS[key] || "") + " " + varText }));
  const condsDraftOf = (key) => (condDraft[key] != null ? condDraft[key] : DEFAULT_STAGE_CONDS[key] || []);
  const toggleCond = (key, ck) => setCondDraft((d) => {
    const cur = d[key] != null ? d[key] : DEFAULT_STAGE_CONDS[key] || [];
    const next = cur.includes(ck) ? cur.filter((x) => x !== ck) : [...cur, ck];
    return { ...d, [key]: next };
  });
  const saveBox = async () => {
    if (onSaveTickerMsgs) await onSaveTickerMsgs(boxDraft, condDraft, waDraft);
    setBoxSaved(true); setTimeout(() => setBoxSaved(false), 2000);
  };

  const addMsg = () => {
    const id = "wa" + Math.random().toString(36).slice(2, 8);
    setMsgDraft((l) => [...(l || []), { id, name: "Nouvo modèl", text: DEFAULT_WA_TEMPLATE }]);
    setActiveDraft((a) => a || id);
  };
  const updateMsg = (id, patch) =>
    setMsgDraft((l) => (l || []).map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const removeMsg = (id) => {
    setMsgDraft((l) => (l || []).filter((m) => m.id !== id));
    setActiveDraft((a) => (a === id ? "" : a));
  };
  const saveMsgs = () => {
    if (onSaveWaMessages) onSaveWaMessages(msgDraft, activeDraft);
    setMsgSaved(true);
    setTimeout(() => setMsgSaved(false), 2000);
  };

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
    if (!name) { setCreatingEtq(false); setNewEtq(""); setNewPin(""); return; }
    const names = agentNames.includes(name) ? agentNames : [...agentNames, name];
    const info = { ...(agentInfo || {}) };
    if (newPin) info[name] = { ...(info[name] || {}), pin: newPin };
    if (onSaveAgentsAndInfo) await onSaveAgentsAndInfo(names, info);
    else if (onSaveAgents) await onSaveAgents(names);
    setNewEtq(""); setNewPin("");
    setCreatingEtq(false);
  };
  // Mete/chanje modpas pou yon etikèt ki deja egziste
  const setAgentPin = async (name, pin) => {
    if (!onSaveAgentInfo) return;
    await onSaveAgentInfo({ ...(agentInfo || {}), [name]: { ...((agentInfo || {})[name] || {}), pin } });
  };
  const removeEtiquetteName = async (name) => {
    if (!onSaveAgents) return;
    await onSaveAgents(agentNames.filter((n) => n !== name));
  };

  // Lis ki montre selon tab la: Etidyan = sa ki make "Vini", Prospè = lòt yo
  const viewItems = useMemo(() => {
    if (!items) return null;
    if (tab === "students") return items.filter((p) => p.followup === "vini");
    if (tab === "lwen") return items.filter((p) => p.followup === "lwen");
    return items.filter((p) => p.followup !== "vini" && p.followup !== "lwen");
  }, [items, tab]);
  const isStudents = tab === "students";
  const isLwen = tab === "lwen";

  const refresh = useCallback(async () => {
    setBusy(true);
    const list = await loadProspects();
    const cache = loadContactedCache();
    const merged = (list || []).map((p) => {
      const c = cache[p.id];
      if (c && typeof c === "object") return { ...p, contacted: !!c.v, contactedAt: c.at || p.contactedAt || "" };
      if (typeof c === "boolean") return { ...p, contacted: c };
      return p;
    });
    setItems(merged);
    setBusy(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Aktyalize otomatikman chak 5 segond (san flicker) — pou nouvo moun parèt pou kont yo
  useEffect(() => {
    const id = setInterval(async () => {
      const list = await loadProspects();
      const cache = loadContactedCache();
      const merged = (list || []).map((p) => {
        const c = cache[p.id];
        if (c && typeof c === "object") return { ...p, contacted: !!c.v, contactedAt: c.at || p.contactedAt || "" };
        if (typeof c === "boolean") return { ...p, contacted: c };
        return p;
      });
      setItems(merged);
    }, 5000);
    return () => clearInterval(id);
  }, []);

  // Swiv nouvo moun ki moute (pou notifikasyon)
  const [seen, setSeen] = useState(null); // null = poko inisyalize
  useEffect(() => {
    if (items && seen === null) {
      const o = {}; items.forEach((p) => { o[p.id] = true; });
      setSeen(o);
    }
  }, [items, seen]);
  const isNew = (p) => seen !== null && !seen[p.id];
  const markGroupSeen = (rows) => setSeen((s) => { const n = { ...(s || {}) }; (rows || []).forEach((r) => { n[r.id] = true; }); return n; });

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

  // Mete etap (stage) nan pwosesis la
  const setStage = async (id, stage) => {
    setSaveErr("");
    setItems((prev) => (prev || []).map((p) => (p.id === id ? { ...p, stage } : p)));
    const ok = await setProspectStage(id, stage);
    if (!ok) { setSaveErr("Pa rive anrejistre etap la. Ajoute kolòn `stage` nan Supabase (gade enstriksyon yo)."); }
  };

  // Aksyon ki soti nan ti meni ki bò kote mesaj defilan an
  const applyTickerAction = async (p, value) => {
    if (!value) return;
    if (value === "came") {
      // Deplase moun nan nan "Nouvo Etidyan"
      await setStage(p.id, "");
      await setSwivi(p.id, "vini");
    } else if (value.indexOf("stage:") === 0) {
      await setStage(p.id, value.slice(6));
    }
  };

  // Reset tout pwosesis bwat mesaj la pou yon prospè (admin sèlman)
  const resetProcess = async (p) => {
    if (typeof window !== "undefined" && !window.confirm(`Reset pwosesis mesaj la pou ${prospectName(p) || "moun sa"}? Sa ap remete swivi a, estati kontak la (boul vèt), ak etap la nan kòmansman. (Etikèt la ap rete.)`)) return;
    setItems((prev) => (prev || []).map((x) => (x.id === p.id ? { ...x, stage: "", followup: "", contacted: false, contactedAt: "" } : x)));
    saveContactedCache(p.id, false, "");
    const ok = await resetProspectProcess(p.id);
    if (!ok) setSaveErr("Pa rive reset pwosesis la nan Supabase. Tcheke koneksyon an.");
  };

  // Mete etikèt (non ajan) pou yon prospè
  const setEtiquette = async (id, name) => {
    setSaveErr("");
    setItems((prev) => (prev || []).map((p) => (p.id === id ? { ...p, etiquette: name } : p)));
    const ok = await setProspectEtiquette(id, name);
    if (!ok) { setSaveErr("Pa rive anrejistre etikèt la nan baz done a. Tcheke kolòn `etiquette` ak règ RLS yo nan Supabase."); refresh(); }
  };

  // Make si yon mesaj WhatsApp voye (vèt) oswa poko (wouj)
  const markContacted = async (p, val) => {
    if (!p || p.contacted === val) return;
    const at = val ? todayStr() : "";
    setItems((prev) => (prev || []).map((x) => (x.id === p.id ? { ...x, contacted: val, contactedAt: val ? at : (x.contactedAt || "") } : x)));
    saveContactedCache(p.id, val, at); // kenbe l sou aparèy sa a kèlkeswa rezilta Supabase la
    const ok = await setProspectContacted(p.id, val, at);
    if (!ok) {
      setSaveErr("Estati a sove sou aparèy sa a, men li pa rive nan Supabase. Pou l sove pou tout moun, ajoute kolòn `contacted` ak `contacted_at` nan Supabase (gade enstriksyon yo).");
    }
  };
  const toggleContacted = (p) => markContacted(p, !p.contacted);

  // Ti boul koulè bò kote non an: vèt = mesaj WhatsApp voye, wouj = poko
  const contactDot = (p) => (
    <button
      type="button"
      onClick={() => toggleContacted(p)}
      title={p.contacted ? "Mesaj WhatsApp voye — klike pou remete wouj" : "Poko voye mesaj — klike pou make voye"}
      aria-label="Estati kontak WhatsApp"
      style={{ width: 13, height: 13, borderRadius: "50%", border: "none", cursor: "pointer", padding: 0, flexShrink: 0, background: p.contacted ? "#25D366" : "#C0392B", boxShadow: p.contacted ? "0 0 0 2px rgba(37,211,102,.25)" : "0 0 0 2px rgba(192,57,43,.22)" }}
    />
  );

  // Gwoupe prospè yo pa programme
  const groups = useMemo(() => {
    if (!viewItems) return [];
    const map = new Map();
    viewItems.forEach((p) => {
      const k = p.program || "(San programme)";
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(p);
    });
    return Array.from(map.entries());
  }, [viewItems]);
  const [openProg, setOpenProg] = useState({}); // ki programme ki louvri
  const toggleProg = (k) => setOpenProg((s) => ({ ...s, [k]: !s[k] }));

  // Pliye/depliye chak programme nan panèl Dat rezèvasyon an (louvri otomatikman sa ki gen yon peryòd an kous)
  const [openResa, setOpenResa] = useState(() => {
    const o = {};
    const t = todayStr();
    (programs || []).forEach((prog) => {
      const slots = allVideoSlots(prog.steps || []);
      if (slots.some((s) => s.start && s.start <= t && (!s.end || t <= s.end))) o[prog.label] = true;
    });
    return o;
  });
  const toggleResa = (k) => setOpenResa((s) => ({ ...s, [k]: !s[k] }));

  // Tèt tablo a (menm pou chak programme)
  const headCells = () => (
    <>
      <th style={{ ...thDark, width: 36 }}>#</th>
      {priorityCols.map((q) => (
        <th key={q} style={{ ...thDark, whiteSpace: "nowrap" }}>{q}</th>
      ))}
      <th style={thDark}>Dat</th>
      <th style={{ ...thDark, whiteSpace: "nowrap" }}>Réservation</th>
      <th style={{ ...thDark, width: 150 }}>Swivi</th>
      <th style={{ ...thDark, width: 150 }}>Etikèt</th>
      {restCols.map((q) => (
        <th key={q} style={thDark}>{q}</th>
      ))}
      {isAdmin && <th style={{ ...thDark, width: 40 }}></th>}
    </>
  );

  // Yon ranje prospè
  const renderRow = (p, idx) => (
    <tr key={p.id} style={{ background: rowTint((rowTicker(p) || {}).tone) }}>
      <td style={{ ...tdDark, color: PALETTE.gold, fontWeight: 700, whiteSpace: "nowrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {!nameCol && contactDot(p)}
          {idx + 1}
        </span>
      </td>
      {priorityCols.map((q) => (
        <td key={q} style={{ ...tdDark, whiteSpace: "nowrap" }}>
          {q === nameCol ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              {contactDot(p)}
              {renderAnswer(p, q)}
            </span>
          ) : (
            renderAnswer(p, q)
          )}
        </td>
      ))}
      <td style={{ ...tdDark, color: `${PALETTE.cream}88`, whiteSpace: "nowrap" }}>{shortDate(p.updatedAt)}</td>
      <td style={{ ...tdDark, color: PALETTE.gold, fontWeight: 600, whiteSpace: "nowrap" }}>{resaDate(p)}</td>
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
          <option value="lwen">Lwen</option>
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
          <span style={{ fontSize: 13, color: "#7B2D8E", fontWeight: 600 }}>{p.etiquette}</span>
        )}
      </td>
      {restCols.map((q) => (
        <td key={q} style={tdDark}>{renderAnswer(p, q)}</td>
      ))}
      {isAdmin && (
        <td style={{ ...tdDark, textAlign: "center" }}>
          <button onClick={() => remove(p.id)} style={miniDanger} aria-label="Efase prospè">✕</button>
        </td>
      )}
    </tr>
  );

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

  // Dat rezèvasyon: MENM baz ak bouton "Dat rezèvasyon" an — 10 jou ANVAN dat session aktyèl la
  const resaDate = (p) => {
    const prog = (programs || []).find((pp) => pp.label === p.program);
    const base = prog ? currentResaBaseAll(prog.steps || []) : "";
    const d = addDays(base, -10);
    return d ? formatHtDate(d) : "—";
  };

  // Dat brit yo pou yon prospè (session + rezèvasyon), pou kalkil mesaj yo
  const resaRawOf = (p) => {
    const prog = (programs || []).find((pp) => pp.label === p.program);
    const base = prog ? currentResaBaseAll(prog.steps || []) : "";
    return { session: base, resa: base ? addDays(base, -10) : "" };
  };

  // Mesaj ki defile nan kazye chak moun (selon kontak, etikèt, swivi, stage, ak dat yo)
  const rowTicker = (p) => {
    if (!p.contacted) return null;
    const name = prospectName(p) || "moun sa";
    const etq = (p.etiquette || "").trim();
    const fu = p.followup || "";
    const stage = p.stage || "";
    const cAt = p.contactedAt || "";
    const cAtTxt = cAt ? formatHtDate(cAt) : "";
    const today = todayStr();
    const { session, resa } = resaRawOf(p);
    const greet = etq ? `Hello ${etq}` : "Hello";
    const feli = etq ? `Felisitasyon ${etq}` : "Felisitasyon";
    // Varyab jou entelijan (disponib pou tout mesaj etap yo)
    const jouOf = (d) => { if (!d) return ""; const diff = Math.round((new Date(d + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000); return String(Math.max(0, diff)); };
    const baseVars = { jou_rezervasyon: jouOf(resa), jou_session: jouOf(session) };
    const fill = (key, vars) => fillTpl(key, { ...baseVars, ...vars });

    // ===== Machin-eta (stage) =====
    if (matchConds(p, "reserved")) {
      const sessTxt = session ? formatHtDate(session) : "—";
      const callDay = session ? addDays(session, -2) : "";
      const dayBefore = session ? addDays(session, -1) : "";
      const canAct = !!session && today >= session; // ka make Vini/Pa vini sèlman apre dat session an rive
      const viniDrop = {
        title: `Eske ${name} vini?`,
        disabled: !canAct,
        disabledNote: "Dat session an poko rive — ou poko ka fè aksyon sa.",
        options: [
          { label: "Vini", value: "came" },
          { label: "Pa vini", value: "stage:noshow" },
        ],
      };
      if (session && today >= session) {
        return { text: fill("reserved_sessionday", { non: name, dat_session: sessTxt }), tone: "red", dropdown: viniDrop };
      }
      if (dayBefore && today >= dayBefore) {
        return { text: fill("reserved_daybefore", { etiket: etq || "chè", non: name, dat_session: sessTxt }), tone: "red", dropdown: viniDrop };
      }
      const callArrived = callDay && today >= callDay;
      const callTxt = callDay ? (callArrived ? "JODIA" : formatHtDate(callDay)) : "byento";
      return { text: fill("reserved", { etiket: etq || "chè", non: name, dat_apel: callTxt, dat_session: sessTxt }), tone: callArrived ? "red" : "none", dropdown: viniDrop };
    }

    if (matchConds(p, "noshow")) {
      return {
        text: fill("noshow", { etiket: etq || "chè", non: name }),
        tone: "warn",
        dropdown: { title: `Aksyon pou ${name}:`, options: [
          { label: "Li reserve ankò", value: "stage:reserved_special" },
          { label: "Vini", value: "came" },
        ] },
      };
    }

    if (matchConds(p, "special_passed")) {
      return {
        text: fill("special_passed", { etiket: etq || "chè", non: name }),
        tone: "none",
        dropdown: { title: `Aksyon pou ${name}:`, options: [
          { label: "Enskri", value: "stage:reserved_special" },
          { label: "Recycler", value: "stage:recycle" },
        ] },
      };
    }

    if (matchConds(p, "recycle")) {
      return {
        text: fill("recycle", { etiket: etq || "chè", non: name }),
        tone: "none",
        dropdown: { title: `Aksyon pou ${name}:`, options: [
          { label: "Li reserve", value: "stage:reserved_special" },
          { label: "Vini", value: "came" },
        ] },
      };
    }

    // ===== Pa gen stage ankò =====
    if (matchConds(p, "no_tag_no_follow")) {
      return { text: fill("no_tag_no_follow", { non: name }), tone: "warn" };
    }
    if (matchConds(p, "follow_done")) {
      const callDay = resa ? addDays(resa, -2) : "";
      const lostDay = callDay ? addDays(callDay, 3) : "";
      const resaTxt = resa ? formatHtDate(resa) : "—";
      const sessTxt = session ? formatHtDate(session) : "—";
      const drop = { title: `Eske ou fè swivi ak ${name}?`, options: [
        { label: "Li reserve nan dat special", value: "stage:reserved_special" },
        { label: "Dat special la pase, li poko reserve", value: "stage:special_passed" },
        { label: "Li reserve apre special", value: "stage:reserved_after" },
        { label: "Li recycler", value: "stage:recycle" },
      ] };
      // 3 jou pase apre dat apèl la, admin toujou poko aji
      if (callDay && today > lostDay) {
        return { text: fill("follow_done_lost", { etiket: etq || "chè", non: name }), tone: "red", dropdown: drop };
      }
      // dat apèl la fin pase (pandan 3 jou), admin poko aji
      if (callDay && today > callDay) {
        return { text: fill("follow_done_late", { etiket: etq || "chè", non: name }), tone: "red", dropdown: drop };
      }
      const arrived = callDay && today >= callDay;
      const callTxt = callDay ? (arrived ? "JODIA" : formatHtDate(callDay)) : "byento";
      return {
        text: fill("follow_done", { etiket: etq || "chè", non: name, dat_swivi: cAtTxt, dat_rezervasyon: resaTxt, dat_session: sessTxt, dat_apel: callTxt }),
        tone: arrived ? "red" : "none",
        dropdown: drop,
      };
    }
    if ((fu === "noanswer" || fu === "wrong") && matchConds(p, "follow_noanswer")) {
      const stat = fu === "noanswer" ? "sone san repons" : "pa sone ditou";
      const redoDay = cAt ? addDays(cAt, 3) : "";
      const arrived = redoDay && today >= redoDay;
      const redoTxt = redoDay ? (arrived ? "JODIA" : formatHtDate(redoDay)) : "byento";
      return { text: fill("follow_noanswer", { etiket: etq || "chè", non: name, dat_swivi: cAtTxt, estati: stat, dat_refe: redoTxt }), tone: arrived ? "blue" : "none" };
    }
    if (matchConds(p, "tag_no_follow")) return { text: fill("tag_no_follow", { etiket: etq, non: name }), tone: "none" };
    return null;
  };

  const tickerColor = (tone) =>
    tone === "red" ? "#C0392B" : tone === "blue" ? "#2F6FDB" : tone === "warn" ? "#B8860B" : PALETTE.goldSoft;
  const rowTint = (tone) =>
    tone === "red" ? "rgba(192,57,43,.13)" : tone === "blue" ? "rgba(47,111,219,.13)" : undefined;

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

  // Reòganize kolòn yo: Nom, Nimewo (+WhatsApp), Kote li rete an premye; rès yo apre.
  const { priorityCols, restCols, nameCol } = useMemo(() => {
    let nameCol = null, phoneCol = null, addrCol = null;
    const rest = [];
    const getVal = (p, q) => {
      const f = (p.answers || []).find((a) => (a.question || "").trim() === q);
      return f ? f.answer || "" : "";
    };
    const looksPhone = (q) => (viewItems || []).some((p) => validateHaitiPhone(getVal(p, q)).ok);
    for (const q of qCols) {
      const ql = q.toLowerCase();
      if (!phoneCol && (/tel|phone|nimewo|whatsap|telef/.test(ql) || looksPhone(q))) { phoneCol = q; continue; }
      if (!nameCol && /non|nom|name|prenon|prénom|prenom/.test(ql)) { nameCol = q; continue; }
      if (!addrCol && /rete|adr|kote|z[oò]n|vil|abite|kominote|address|lokalite|komin|katye|kartye/.test(ql)) { addrCol = q; continue; }
      rest.push(q);
    }
    return { priorityCols: [nameCol, phoneCol, addrCol].filter(Boolean), restCols: rest, nameCol };
  }, [qCols, viewItems]);

  // Non konplè moun nan (premye repons ki pa yon telefòn ni yon imèl)
  const prospectName = (p) => {
    for (const a of (p.answers || [])) {
      const val = (a.answer || "").trim();
      if (!val) continue;
      if (validateHaitiPhone(val).ok) continue;
      if (/\S+@\S+\.\S+/.test(val)) continue;
      return val;
    }
    return "";
  };

  // Mesaj WhatsApp ki ranpli otomatikman
  // Ki etap yon prospè ye (menm lòd ak rowTicker) — pou chwazi mesaj WhatsApp ki konekte a
  const stageKeyOf = (p) => {
    if (!p.contacted) return "";
    if (matchConds(p, "reserved")) return "reserved";
    if (matchConds(p, "noshow")) return "noshow";
    if (matchConds(p, "special_passed")) return "special_passed";
    if (matchConds(p, "recycle")) return "recycle";
    if (matchConds(p, "no_tag_no_follow")) return "no_tag_no_follow";
    if (matchConds(p, "follow_done")) return "follow_done";
    if ((p.followup === "noanswer" || p.followup === "wrong") && matchConds(p, "follow_noanswer")) return "follow_noanswer";
    if (matchConds(p, "tag_no_follow")) return "tag_no_follow";
    return "";
  };

  const waMessage = (p) => {
    const resa = resaDate(p);
    const dat = (resa && resa !== "—") ? resa : "pi vit posib";
    // Jou ki rete avan dat rezèvasyon ak dat session (dat entelijan)
    const { session: sessRaw, resa: resaRaw } = resaRawOf(p);
    const today = todayStr();
    const daysTo = (d) => {
      if (!d) return "";
      const diff = Math.round((new Date(d + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000);
      return String(Math.max(0, diff));
    };
    const jouResa = daysTo(resaRaw);
    const jouSession = daysTo(sessRaw);
    const datResaTxt = (resa && resa !== "—") ? resa : "";
    const datSessionTxt = sessRaw ? formatHtDate(sessRaw) : "";
    // Mesaj ki konekte ak etap prospè a (si admin te konekte youn); sinon mesaj aktif default la
    const key = stageKeyOf(p);
    const connId = (stageWaMsg || {})[key];
    let tmpl = "";
    if (connId) { const cm = (waMessages || []).find((m) => m && m.id === connId); if (cm && cm.text) tmpl = cm.text; }
    if (!tmpl) {
      const active = (waMessages || []).find((m) => m && m.id === activeWaMessage);
      tmpl = (active && active.text) || DEFAULT_WA_TEMPLATE;
    }
    let msg = tmpl
      .replace(/\{non\}/g, prospectName(p))
      .replace(/\{program\}/g, p.program || "")
      .replace(/\{dat_rezervasyon\}/g, datResaTxt)
      .replace(/\{dat_session\}/g, datSessionTxt)
      .replace(/\{dat\}/g, dat)
      .replace(/\{jou_rezervasyon\}/g, jouResa)
      .replace(/\{jou_session\}/g, jouSession)
      .replace(/\{adres\}/g, extractAddress(p.answers) || "");
    // Siyati etikèt la anba nèt lè prospè a gen yon etikèt
    const etq = (p.etiquette || "").trim();
    if (etq) msg = msg + "\n\n" + etq;
    return msg;
  };

  // Afiche yon repons; si se yon nimewo Ayiti valab, mete yon bouton WhatsApp bò kote l
  const renderAnswer = (p, q) => {
    const val = answerFor(p, q);
    const v = validateHaitiPhone(val);
    if (v.ok) {
      const tk = rowTicker(p);
      const stStep = tk ? ((TICKER_STATES.find((s) => s.key === stageKeyOf(p)) || {}).step || 0) : 0;
      const bc = STEP_COLORS[stStep] || (tk ? tickerColor(tk.tone) : PALETTE.goldSoft);
      return (
        <div style={{ display: "inline-flex", flexDirection: "column", gap: 4, maxWidth: 230 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
            <span>{val}</span>
            <a
              href={`https://wa.me/${v.e164}?text=${encodeURIComponent(waMessage(p))}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => markContacted(p, true)}
              title={`Ekri ${val} sou WhatsApp`}
              style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999, background: "#25D366", color: "#fff", textDecoration: "none", fontSize: 11, fontWeight: 700 }}
            >
              WhatsApp
            </a>
          </span>
          {tk && tk.text && (
            <div style={{ overflow: "hidden", width: "100%", maxWidth: 230, height: 18, display: "flex", alignItems: "center", background: `${bc}14`, border: `1px solid ${bc}44`, borderRadius: 6 }}>
              <span className="mt-marquee" style={{ fontSize: 10.5, color: bc, fontWeight: 700 }}>{tk.text}</span>
            </div>
          )}
          {tk && tk.dropdown && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2, maxWidth: 230 }}>
              <select
                value=""
                disabled={tk.dropdown.disabled}
                onChange={(e) => { const v = e.target.value; if (v) applyTickerAction(p, v); }}
                style={{ maxWidth: 230, fontSize: 11.5, padding: "3px 6px", borderRadius: 8, border: `1px solid ${bc}66`, background: "#fff", color: PALETTE.cream, fontWeight: 600, opacity: tk.dropdown.disabled ? 0.55 : 1, cursor: tk.dropdown.disabled ? "not-allowed" : "pointer" }}
              >
                <option value="">▾ {tk.dropdown.title}</option>
                {tk.dropdown.options.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
              </select>
              {tk.dropdown.disabled && tk.dropdown.disabledNote && (
                <span style={{ fontSize: 9.5, color: "#B8860B", lineHeight: 1.2 }}>{tk.dropdown.disabledNote}</span>
              )}
            </div>
          )}
          {tk && tk.text && isAdmin && (
            <button
              onClick={() => resetProcess(p)}
              title="Reset pwosesis mesaj la pou moun sa"
              style={{ alignSelf: "flex-start", marginTop: 2, padding: "2px 8px", borderRadius: 999, fontSize: 10.5, fontWeight: 700, cursor: "pointer", border: `1px solid ${PALETTE.danger}55`, background: "#fff", color: PALETTE.danger }}
            >
              ↺ Reset pwosesis
            </button>
          )}
        </div>
      );
    }
    return val;
  };

  // Separe an paj pou apèsi a (20 ranje pa paj)
  const ROWS_PER_PAGE = 20;
  const pages = useMemo(() => {
    const out = [];
    for (let i = 0; i < (viewItems || []).length; i += ROWS_PER_PAGE) out.push((viewItems || []).slice(i, i + ROWS_PER_PAGE));
    return out;
  }, [viewItems]);

  // Lis etikèt ki disponib pou filtè PDF a
  const etqOptions = useMemo(() => {
    const set = new Set();
    (agentNames || []).forEach((n) => n && set.add(n));
    (viewItems || []).forEach((p) => p.etiquette && set.add(p.etiquette));
    return [...set];
  }, [agentNames, viewItems]);

  const programOptions = useMemo(() => {
    const set = new Set();
    (viewItems || []).forEach((p) => p.program && set.add(p.program));
    return [...set];
  }, [viewItems]);

  // Lis mwa yo (ki gen prospè), pi resan an anwo
  const moisHt = ["Janvye", "Fevriye", "Mas", "Avril", "Me", "Jen", "Jiyè", "Out", "Septanm", "Oktòb", "Novanm", "Desanm"];
  const prospTs = (p) => prospectCreatedTs(p) || p.updatedAt || Date.now();
  const pdfMonths = useMemo(() => {
    const arr0 = viewItems || [];
    const map = new Map();
    arr0.forEach((p) => {
      const d = new Date(prospTs(p));
      const y = d.getFullYear(), m = d.getMonth();
      const key = `${y}-${m}`;
      if (!map.has(key)) map.set(key, { key, year: y, month: m, label: `${moisHt[m]} ${y}` });
    });
    return [...map.values()].sort((a, b) => (b.year - a.year) || (b.month - a.month));
  }, [viewItems]);

  // Semèn yo anndan mwa ki chwazi a (lendi → dimanch), sèlman semèn ki deja kòmanse
  const weeksOfSelMonth = useMemo(() => {
    if (!pdfMonth) return [];
    const [y, m] = pdfMonth.split("-").map(Number);
    const mondayOf = (d) => { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x; };
    const fmt = (d) => `${d.getDate()} ${moisHt[d.getMonth()].toLowerCase()}`;
    const ord = ["1ye", "2yèm", "3yèm", "4yèm", "5yèm", "6yèm"];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const endMonday = mondayOf(last);
    const weeks = [];
    let cur = mondayOf(first); let n = 0;
    while (cur.getTime() <= endMonday.getTime()) {
      const sun = new Date(cur); sun.setDate(sun.getDate() + 6);
      if (cur.getTime() <= today.getTime()) {
        n++;
        weeks.push({ key: `w-${cur.getTime()}`, start: new Date(cur), end: new Date(sun), label: `${ord[n - 1] || n + "yèm"} semèn — Lendi ${fmt(cur)} → Dimanch ${fmt(sun)}` });
      }
      cur = new Date(cur); cur.setDate(cur.getDate() + 7);
    }
    return weeks;
  }, [pdfMonth]);

  const selWeek = useMemo(() => weeksOfSelMonth.find((w) => w.key === pdfWeek) || null, [weeksOfSelMonth, pdfWeek]);
  const selMonthLabel = useMemo(() => (pdfMonths.find((mo) => mo.key === pdfMonth) || {}).label || "", [pdfMonths, pdfMonth]);

  // Moun ki pral nan PDF a (aplike filtè a)
  const pdfItems = useMemo(() => {
    let arr = (viewItems || []).slice();
    if (pdfFilter === "etiquette") arr = pdfEtq ? arr.filter((p) => (p.etiquette || "") === pdfEtq) : [];
    else if (pdfFilter === "program") arr = pdfProgram ? arr.filter((p) => (p.program || "") === pdfProgram) : [];
    else if (pdfFilter === "date") {
      if (!pdfMonth) arr = [];
      else if (selWeek) arr = arr.filter((p) => { const d = new Date(prospTs(p)); d.setHours(0, 0, 0, 0); return d.getTime() >= selWeek.start.getTime() && d.getTime() <= selWeek.end.getTime(); });
      else { const [y, m] = pdfMonth.split("-").map(Number); arr = arr.filter((p) => { const d = new Date(prospTs(p)); return d.getFullYear() === y && d.getMonth() === m; }); }
    }
    arr.sort((a, b) => String(a.program || "").localeCompare(String(b.program || "")));
    return arr;
  }, [viewItems, pdfFilter, pdfEtq, pdfProgram, pdfMonth, selWeek]);

  // Opsyon pou jenere PDF a
  const pdfTitleTxt = isStudents ? "Lis Nouvo Etidyan" : isLwen ? "Lis Lwen" : "Lis Nouvo Prospect";
  const pdfOpts = {
    groupBy: "none",
    title:
      pdfFilter === "etiquette" && pdfEtq ? `${pdfTitleTxt} — Etikèt: ${pdfEtq}`
      : pdfFilter === "program" && pdfProgram ? `${pdfTitleTxt} — ${pdfProgram}`
      : pdfFilter === "date" && pdfMonth ? `${pdfTitleTxt} — ${selWeek ? selWeek.label : selMonthLabel}`
      : pdfTitleTxt,
  };

  // Ranje apèsi a (lis senp — pdfItems deja filtre + ranje pa programme)
  const previewRows = useMemo(
    () => (pdfItems || []).map((p, i) => ({ type: "row", p, num: i + 1 })),
    [pdfItems]
  );

  const th = { textAlign: "left", padding: "6px 6px", fontSize: 10, color: "#1d1620", borderBottom: "1.5px solid #C2238E", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".3px" };
  const td = { textAlign: "left", padding: "7px 6px", fontSize: 11, color: "#1d1620", borderBottom: "0.5px solid #e7ddd2", verticalAlign: "top", wordBreak: "break-word" };

  /* ---------- VÈSYON PDF ---------- */
  if (mode === "pdf") {
    const selStyle = { padding: "8px 10px", borderRadius: 10, border: `1px solid ${PALETTE.lineStrong}`, background: "#fff", color: PALETTE.cream, fontSize: 13, colorScheme: "light" };
    return (
      <div>
        <div className="no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600, margin: 0 }}>
            Vèsyon PDF — {pdfItems.length} {isStudents ? "etidyan" : isLwen ? "lwen" : "prospè"}
          </h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setMode("list")} style={ghostBtn}>Tounen</button>
            <button onClick={() => openProspectsPdf(pdfItems, fmtDate, pdfOpts)} style={ghostBtn}>Wè PDF la</button>
            <button onClick={() => downloadProspectsPdf(pdfItems, fmtDate, pdfOpts)} style={goldBtn}>Telechaje PDF</button>
          </div>
        </div>

        {/* Filtè PDF */}
        <div className="no-print" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14, padding: "12px 14px", border: `1px solid ${PALETTE.line}`, borderRadius: 12, background: "rgba(224,165,10,.06)" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: PALETTE.cream }}>Filtè :</span>
          <select
            value={pdfFilter}
            onChange={(e) => { const v = e.target.value; setPdfFilter(v); if (v !== "etiquette") setPdfEtq(""); if (v !== "date") { setPdfMonth(""); setPdfWeek(""); } if (v !== "program") setPdfProgram(""); }}
            style={selStyle}
          >
            <option value="none">Tout ansanm</option>
            <option value="date">Pa dat (semèn / mwa)</option>
            <option value="etiquette">Pa etikèt</option>
            <option value="program">Pa programme</option>
          </select>
          {pdfFilter === "date" && (
            <>
              <select value={pdfMonth} onChange={(e) => { setPdfMonth(e.target.value); setPdfWeek(""); }} style={selStyle}>
                <option value="">Chwazi yon mwa…</option>
                {pdfMonths.map((mo) => (<option key={mo.key} value={mo.key}>{mo.label}</option>))}
              </select>
              {pdfMonth && (
                <select value={pdfWeek} onChange={(e) => setPdfWeek(e.target.value)} style={selStyle}>
                  <option value="">Tout mwa a</option>
                  {weeksOfSelMonth.map((w) => (<option key={w.key} value={w.key}>{w.label}</option>))}
                </select>
              )}
            </>
          )}
          {pdfFilter === "etiquette" && (
            <select value={pdfEtq} onChange={(e) => setPdfEtq(e.target.value)} style={selStyle}>
              <option value="">Chwazi yon etikèt…</option>
              {etqOptions.map((n) => (<option key={n} value={n}>{n}</option>))}
            </select>
          )}
          {pdfFilter === "program" && (
            <select value={pdfProgram} onChange={(e) => setPdfProgram(e.target.value)} style={selStyle}>
              <option value="">Chwazi yon programme…</option>
              {programOptions.map((n) => (<option key={n} value={n}>{n}</option>))}
            </select>
          )}
          <span style={{ fontSize: 12, color: `${PALETTE.cream}99` }}>
            {pdfFilter === "date"
              ? (!pdfMonth ? "Chwazi yon mwa (answit ou ka chwazi yon semèn ladann)." : selWeek ? `Sèlman moun ki enskri "${selWeek.label}".` : `Tout moun ki enskri nan ${selMonthLabel}.`)
              : pdfFilter === "etiquette"
              ? (pdfEtq ? `Sèlman moun ki gen etikèt "${pdfEtq}" yo.` : "Chwazi yon etikèt pou filtre.")
              : pdfFilter === "program"
              ? (pdfProgram ? `Sèlman moun ki nan programme "${pdfProgram}" an.` : "Chwazi yon programme pou filtre.")
              : "Tout moun yo, tout programme ansanm."}
          </span>
        </div>

        <p className="no-print" style={{ fontSize: 13, color: `${PALETTE.cream}88`, margin: "0 0 18px" }}>
          "Wè PDF la" louvri l nan yon nouvo paj. "Telechaje PDF" sere fichye a. Anba a se yon apèsi.
        </p>

        <div id="pdf-print-area" style={{ overflowX: "auto" }}>
          <div className="pdf-page">
            <PdfHeader count={pdfItems.length} />
            {pdfItems.length === 0 ? (
              <p style={{ color: "#555", fontSize: 14 }}>
                {pdfFilter === "etiquette" && !pdfEtq
                  ? "Chwazi yon etikèt anwo a."
                  : pdfFilter === "date" && !pdfMonth
                  ? "Chwazi yon mwa anwo a."
                  : pdfFilter === "program" && !pdfProgram
                  ? "Chwazi yon programme anwo a."
                  : "Poko gen okenn moun."}
              </p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                <thead>
                  <tr>
                    <th style={{ ...th, width: 26 }}>#</th>
                    <th style={{ ...th, width: 74 }}>Programme</th>
                    <th style={{ ...th, width: 52 }}>Dat</th>
                    <th style={{ ...th, width: 66 }}>Etikèt</th>
                    {qCols.map((q) => (<th key={q} style={th}>{q}</th>))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r, ri) =>
                    r.type === "header" ? (
                      <tr key={"h" + ri}>
                        <td colSpan={4 + qCols.length} style={{ padding: "8px 8px", fontSize: 12, fontWeight: 800, color: "#7a2d0e", background: "rgba(224,165,10,.28)", borderTop: "1px solid #e0a50a", borderBottom: "1px solid #e0a50a" }}>
                          {r.label}
                        </td>
                      </tr>
                    ) : (
                      <tr key={r.p.id}>
                        <td style={{ ...td, color: "#C2238E", fontWeight: 700 }}>{r.num}</td>
                        <td style={{ ...td, fontWeight: 700 }}>{r.p.program || "-"}</td>
                        <td style={{ ...td, color: "#7a6f63" }}>{shortDate(r.p.updatedAt)}</td>
                        <td style={{ ...td, color: "#7a2d0e" }}>{r.p.etiquette || ""}</td>
                        {qCols.map((q) => (<td key={q} style={td}>{answerFor(r.p, q)}</td>))}
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            )}
            <div className="pdf-foot">
              <span>Miss Thani - Make-Up &amp; Lace Club</span>
              <span>Apèsi</span>
            </div>
          </div>
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
          onClick={() => { if (typeof window !== "undefined") window.location.href = "/agent"; }}
          style={ghostBtn}
          title="Louvri paj Progression des Agents"
        >
          Progression des Agents ↗
        </button>
        <button
          onClick={() => { setTab("lwen"); setMode("list"); }}
          style={tab === "lwen" ? goldBtn : ghostBtn}
        >
          Lwen
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
              <input
                className="mt-input"
                style={{ maxWidth: 130, letterSpacing: "4px", textAlign: "center" }}
                placeholder="Modpas 4 chif"
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                onKeyDown={(e) => { if (e.key === "Enter" && newEtq.trim()) createEtiquette(); }}
              />
              <button onClick={createEtiquette} disabled={!newEtq.trim()} style={{ ...goldBtn, opacity: newEtq.trim() ? 1 : 0.6 }}>Anrejistre</button>
              <button onClick={() => { setCreatingEtq(false); setNewEtq(""); setNewPin(""); }} style={ghostBtn}>Anile</button>
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
          {isAdmin && agentNames.length > 0 && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${PALETTE.line}` }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: PALETTE.cream, marginBottom: 6 }}>🔑 Modpas ajan yo (4 chif) — pou konekte sou paj /agent la</div>
              {agentNames.map((n) => {
                const hasPin = !!((agentInfo || {})[n] && (agentInfo || {})[n].pin);
                return (
                  <div key={n} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                    <span style={{ width: 130, fontSize: 13, fontWeight: 600, color: PALETTE.cream, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{n}</span>
                    <input
                      className="mt-input"
                      style={{ maxWidth: 120, letterSpacing: "4px", textAlign: "center" }}
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="4 chif"
                      defaultValue={((agentInfo || {})[n] && (agentInfo || {})[n].pin) || ""}
                      onInput={(e) => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4); }}
                      onBlur={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 4); if (v && v.length === 4) setAgentPin(n, v); }}
                    />
                    <span style={{ fontSize: 12, color: hasPin ? "#1E7E34" : `${PALETTE.cream}77` }}>{hasPin ? "✓ modpas mete" : "pa gen modpas"}</span>
                  </div>
                );
              })}
              <p style={{ fontSize: 11, color: `${PALETTE.cream}77`, margin: "4px 0 0" }}>Tape 4 chif epi klike deyò chan an pou sove.</p>
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600, margin: 0, display: "inline-flex", alignItems: "center", gap: 10 }}>
          <span>{isStudents ? "Nouvo Etidyan" : isLwen ? "Lwen" : "Nouvo Prospè"} {viewItems ? `(${viewItems.length})` : ""}</span>
          {(() => { const nt = (viewItems || []).filter(isNew).length; return nt > 0 ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: PALETTE.blush, color: "#fff", fontSize: 12.5, fontWeight: 800, padding: "3px 11px", borderRadius: 999 }}>🔔 {nt} nouvo moun</span>
          ) : null; })()}
        </h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={msgFilter}
            onChange={(e) => setMsgFilter(e.target.value)}
            title="Filtre moun yo dapre mesaj ki nan bwat la"
            style={{ padding: "8px 12px", fontSize: 13, borderRadius: 999, cursor: "pointer", fontWeight: 600, border: `1px solid ${msgFilter ? PALETTE.goldSoft : PALETTE.line}`, background: msgFilter ? "rgba(194,35,142,.08)" : "#fff", color: msgFilter ? PALETTE.goldSoft : PALETTE.cream }}
          >
            <option value="">Filtre: tout mesaj</option>
            {[1, 2, 3, 4].map((step) => {
              const inStep = TICKER_STATES.filter((s) => s.step === step);
              if (inStep.length === 0) return null;
              const stepName = { 1: "Kontak", 2: "Swivi", 3: "Rezèvasyon", 4: "Recycle" }[step];
              return (
                <optgroup key={step} label={`━━ ETAP ${step} — ${stepName} ━━`}>
                  {inStep.map((st) => (<option key={st.key} value={st.key}>{st.label}</option>))}
                </optgroup>
              );
            })}
          </select>
          <select
            value={etqFilter}
            onChange={(e) => setEtqFilter(e.target.value)}
            title="Filtre moun yo dapre etikèt (ajan)"
            style={{ padding: "8px 12px", fontSize: 13, borderRadius: 999, cursor: "pointer", fontWeight: 600, border: `1px solid ${etqFilter ? PALETTE.goldSoft : PALETTE.line}`, background: etqFilter ? "rgba(194,35,142,.08)" : "#fff", color: etqFilter ? PALETTE.goldSoft : PALETTE.cream }}
          >
            <option value="">Filtre: tout etikèt</option>
            {agentNames.map((n) => (<option key={n} value={n}>{n}</option>))}
          </select>
          <button onClick={() => setResaPanel((v) => !v)} style={resaPanel ? goldBtn : ghostBtn}>Dat rezèvasyon</button>
          {isAdmin && (
            <>
              <button onClick={() => setMsgPanel((v) => !v)} style={msgPanel ? goldBtn : ghostBtn}>Mesaj WhatsApp</button>
              <button onClick={() => setBoxPanel((v) => !v)} style={boxPanel ? goldBtn : ghostBtn}>Chèn pwosesis</button>
            </>
          )}
          <button onClick={refresh} style={ghostBtn} disabled={busy}>{busy ? "Ap chaje…" : "Aktyalize"}</button>
          {viewItems && viewItems.length > 0 && (
            <>
              <button onClick={() => downloadProspectsCsv(viewItems || [], qCols, fmtDate)} style={ghostBtn}>Telechaje CSV (Excel)</button>
              <button onClick={() => setMode("pdf")} style={goldBtn}>Vèsyon PDF</button>
            </>
          )}
        </div>
      </div>

      {resaPanel && (
        <div style={{ marginBottom: 18, padding: 16, border: `1px solid ${PALETTE.gold}`, borderRadius: 14, background: "rgba(224,165,10,.08)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 10, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 15 }}>Dat rezèvasyon pa programme</strong>
            <button onClick={() => setResaPanel(false)} style={ghostBtn}>Fèmen</button>
          </div>
          <p style={{ fontSize: 12.5, color: `${PALETTE.cream}aa`, margin: "0 0 14px", lineHeight: 1.5 }}>
            Dat rezèvasyon an se 10 jou apre video pwograme a kòmanse. Men chak peryòd video ak dat limit rezèvasyon ki mache avè l.
          </p>
          {(() => {
            const t = todayStr();
            const progList = (programs || [])
              .map((prog) => {
                const curBase = currentResaBaseAll(prog.steps || []); // baz aktyèl la (menm ak lis prospè + WhatsApp)
                const slots = allVideoSlots(prog.steps || []).map((s) => {
                  const base = s.session || s.start; // dat session (sinon dat komansman)
                  return {
                    base,
                    resa: addDays(base, -10),
                    active: !!base && base === curBase,
                  };
                });
                return { label: prog.label, slots };
              })
              .filter((p) => p.slots.length > 0);

            if (progList.length === 0) {
              return <p style={{ fontSize: 13, color: `${PALETTE.cream}88`, margin: 0 }}>Poko gen okenn dat session. (Mete yon "Dat session" sou yon kreno Videyo nan Editè a pou dat yo parèt isit la.)</p>;
            }
            return progList.map((pr) => {
              const open = !!openResa[pr.label];
              const hasActive = pr.slots.some((s) => s.active);
              return (
                <div key={pr.label} style={{ marginBottom: 10, border: `1px solid ${PALETTE.line}`, borderRadius: 12, overflow: "hidden", background: "#fff" }}>
                  <button
                    type="button"
                    onClick={() => toggleResa(pr.label)}
                    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "11px 13px", background: "rgba(224,165,10,.10)", border: "none", cursor: "pointer", textAlign: "left" }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 12, color: PALETTE.gold, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s", display: "inline-block" }}>▶</span>
                      <strong style={{ fontSize: 14.5, color: PALETTE.cream }}>{pr.label}</strong>
                    </span>
                    <span style={{ fontSize: 12, color: `${PALETTE.cream}aa`, fontWeight: 600, whiteSpace: "nowrap" }}>
                      {pr.slots.length} session{hasActive ? " · ● an kous" : ""}
                    </span>
                  </button>
                  {open && (
                    <div style={{ overflowX: "auto", borderTop: `1px solid ${PALETTE.line}` }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 360 }}>
                        <thead>
                          <tr>
                            <th style={{ ...thDark, whiteSpace: "nowrap" }}>Dat session</th>
                            <th style={{ ...thDark, whiteSpace: "nowrap" }}>Dat limit rezèvasyon (10 jou anvan)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pr.slots.map((s, i) => (
                            <tr key={i} style={s.active ? { background: "#C0392B" } : undefined}>
                              <td style={{ ...tdDark, whiteSpace: "nowrap", fontWeight: 700, color: s.active ? "#FFFFFF" : PALETTE.cream }}>
                                {s.base ? formatHtDate(s.base) : "—"}
                                {s.active && (
                                  <span style={{ marginLeft: 8, display: "inline-block", padding: "1px 8px", borderRadius: 999, background: "#FFFFFF", color: "#C0392B", fontSize: 10.5, fontWeight: 800, verticalAlign: "middle" }}>● AN KOUS</span>
                                )}
                              </td>
                              <td style={{ ...tdDark, whiteSpace: "nowrap", fontWeight: 700, color: s.active ? "#000000" : PALETTE.gold }}>
                                {s.base ? formatHtDate(s.resa) : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
      )}

      {isAdmin && boxPanel && (
        <div style={{ marginBottom: 18, padding: 16, border: `1px solid ${PALETTE.lineStrong}`, borderRadius: 14, background: "rgba(224,165,10,.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 10, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 15 }}>Chèn pwosesis — mesaj ki defile nan kazye yo</strong>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {boxSaved && <span style={{ color: PALETTE.goldSoft, fontSize: 13 }}>Anrejistre ✓</span>}
              <button onClick={saveBox} style={goldBtn}>Anrejistre mesaj yo</button>
              <button onClick={() => setBoxPanel(false)} style={ghostBtn}>Fèmen</button>
            </div>
          </div>
          <p style={{ fontSize: 12.5, color: `${PALETTE.cream}aa`, margin: "0 0 14px", lineHeight: 1.5 }}>
            Men tout etap pwosesis la, prezante tankou yon chèn. Chak kat montre <b>kondisyon</b> ki deklanche l, <b>mesaj</b> la (ou ka modifye l), <b>règ dat</b> yo, ak <b>kote chak opsyon meni an mennen</b>. Varyab yo (<b>{"{non}"}</b>, <b>{"{etiket}"}</b>, <b>{"{dat_session}"}</b>...) ranplase otomatikman.
          </p>
          {[1, 2, 3, 4].map((stepNum) => {
            const inStep = TICKER_STATES.filter((s) => s.step === stepNum);
            if (inStep.length === 0) return null;
            return (
              <div key={stepNum} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0 10px" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 999, background: PALETTE.goldSoft, color: "#fff", fontSize: 13, fontWeight: 800 }}>{stepNum}</span>
                  <strong style={{ fontSize: 14, color: PALETTE.goldSoft }}>Etap {stepNum}</strong>
                  <span style={{ flex: 1, height: 1, background: PALETTE.line }} />
                </div>
                {inStep.map((st) => (
                  <div key={st.key} style={{ border: `1px solid ${PALETTE.line}`, borderRadius: 12, padding: 12, marginBottom: 10, background: "#fff" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                      <strong style={{ fontSize: 13.5, color: PALETTE.cream }}>{st.label}</strong>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => setOpenConn(openConn === st.key ? "" : st.key)} style={{ ...(openConn === st.key ? goldBtn : ghostBtn), padding: "3px 10px", fontSize: 12 }}>Koneksyon</button>
                        <button onClick={() => resetBoxVal(st.key)} style={{ ...ghostBtn, padding: "3px 10px", fontSize: 12 }} title="Remete mesaj default la">↺</button>
                      </div>
                    </div>
                    <div style={{ fontSize: 11.5, color: `${PALETTE.cream}cc`, marginBottom: 6, lineHeight: 1.5 }}>
                      {st.dateRule && <div><b style={{ color: PALETTE.goldSoft }}>Règ dat:</b> {st.dateRule}</div>}
                      {st.dropdown && <div><b style={{ color: PALETTE.goldSoft }}>Meni:</b> {st.dropdown}</div>}
                      {st.flow && st.flow.length > 0 && (
                        <div><b style={{ color: PALETTE.goldSoft }}>Kote opsyon yo mennen:</b>
                          <ul style={{ margin: "3px 0 0", paddingLeft: 18 }}>
                            {st.flow.map((f, i) => (<li key={i}>{f}</li>))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {openConn === st.key && (
                      <div style={{ border: `1px solid ${PALETTE.lineStrong}`, borderRadius: 10, padding: 10, marginBottom: 8, background: "rgba(224,165,10,.06)" }}>
                        <div style={{ fontSize: 11.5, color: `${PALETTE.cream}aa`, marginBottom: 6 }}>Chwazi kondisyon ki konekte ak etap sa a (mesaj la ap parèt sèlman lè yo tout vre):</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {CONDITIONS.map((c) => {
                            const on = condsDraftOf(st.key).includes(c.key);
                            return (
                              <button key={c.key} onClick={() => toggleCond(st.key, c.key)} style={{ padding: "3px 9px", borderRadius: 999, fontSize: 11.5, fontWeight: 600, cursor: "pointer", border: `1px solid ${on ? PALETTE.goldSoft : PALETTE.line}`, background: on ? PALETTE.goldSoft : "#fff", color: on ? "#fff" : PALETTE.cream }}>
                                {on ? "✓ " : ""}{c.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                      <button onClick={() => setOpenInsert(openInsert === st.key ? "" : st.key)} style={{ ...ghostBtn, padding: "2px 9px", fontSize: 13, fontWeight: 800 }} title="Ajoute yon varyab">+</button>
                      <span style={{ fontSize: 11, color: `${PALETTE.cream}88` }}>Varyab pou mete nan mesaj la</span>
                    </div>
                    {openInsert === st.key && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 6, padding: 8, border: `1px solid ${PALETTE.line}`, borderRadius: 8, background: "rgba(194,35,142,.04)" }}>
                        {ALL_TICKER_VARS.map((av) => (
                          <button key={av.v} onClick={() => insertVar(st.key, av.v)} title={av.d} style={{ padding: "3px 8px", borderRadius: 6, fontSize: 11.5, fontWeight: 600, cursor: "pointer", border: `1px solid ${PALETTE.line}`, background: "#fff", color: PALETTE.goldSoft }}>
                            {av.v}
                          </button>
                        ))}
                      </div>
                    )}
                    <textarea className="mt-input" style={{ minHeight: 64 }} value={boxVal(st.key)} onChange={(e) => setBoxVal(st.key, e.target.value)} />
                    <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#25D366" }}>Mesaj WhatsApp konekte:</span>
                      <select
                        value={waDraft[st.key] || ""}
                        onChange={(e) => setWaDraft((d) => ({ ...d, [st.key]: e.target.value }))}
                        style={{ flex: 1, minWidth: 150, fontSize: 12.5, padding: "5px 8px", borderRadius: 8, border: `1px solid ${PALETTE.line}`, background: "#fff", color: PALETTE.cream }}
                      >
                        <option value="">(Mesaj WhatsApp default la)</option>
                        {(waMessages || []).map((m) => (<option key={m.id} value={m.id}>{m.name || "Mesaj san non"}</option>))}
                      </select>
                    </div>
                    <p style={{ fontSize: 10.5, color: `${PALETTE.cream}77`, margin: "3px 0 0" }}>Lè yon prospè nan etap sa a, se mesaj WhatsApp sa a bouton WhatsApp la ap sèvi.</p>
                  </div>
                ))}
              </div>
            );
          })}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
            {boxSaved && <span style={{ color: PALETTE.goldSoft, fontSize: 13, alignSelf: "center" }}>Anrejistre ✓</span>}
            <button onClick={saveBox} style={goldBtn}>Anrejistre mesaj yo</button>
          </div>
        </div>
      )}

      {isAdmin && msgPanel && (
        <div style={{ marginBottom: 18, padding: 16, border: `1px solid ${PALETTE.lineStrong}`, borderRadius: 14, background: "rgba(194,35,142,.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 10, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 15 }}>Modèl mesaj WhatsApp yo</strong>
            <button onClick={() => setMsgPanel(false)} style={ghostBtn}>Fèmen</button>
          </div>
          <p style={{ fontSize: 12.5, color: `${PALETTE.cream}aa`, margin: "0 0 14px", lineHeight: 1.5 }}>
            Varyab ou ka mete: <b>{"{non}"}</b> (non moun nan), <b>{"{program}"}</b> (pwogram), <b>{"{dat}"}</b> (dat rezèvasyon), <b>{"{jou_rezervasyon}"}</b> (konbyen jou ki rete avan dat rezèvasyon an, egz. 5), <b>{"{jou_session}"}</b> (konbyen jou ki rete avan dat session an), <b>{"{adres}"}</b> (adrès moun nan). Si prospè a gen yon etikèt, non etikèt la ap ekri otomatikman anba nèt mesaj la (kòm siyati). Modèl ou chwazi nan ti meni an se sa k ap kole nan WhatsApp lè ou klike bouton vèt la.
          </p>

          {(msgDraft || []).length === 0 ? (
            <p style={{ fontSize: 13, color: `${PALETTE.cream}88`, margin: "0 0 12px" }}>Poko gen modèl. Klike "+ Ajoute yon modèl" pou kreye youn. (Si pa gen modèl, app la sèvi ak yon mesaj default.)</p>
          ) : (
            (msgDraft || []).map((m) => (
              <div key={m.id} style={{ border: `1px solid ${PALETTE.line}`, borderRadius: 12, padding: 12, marginBottom: 10, background: "#fff" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                  <input
                    value={m.name || ""}
                    onChange={(e) => updateMsg(m.id, { name: e.target.value })}
                    placeholder="Non modèl la (egz: Premye kontak)"
                    style={{ flex: 1, fontSize: 13.5, padding: "8px 10px", borderRadius: 8, border: `1px solid ${PALETTE.line}`, background: "#fff", color: "#3A0E33", boxSizing: "border-box" }}
                  />
                  <button onClick={() => removeMsg(m.id)} style={miniDanger} aria-label="Efase modèl">✕</button>
                </div>
                <textarea
                  value={m.text || ""}
                  onChange={(e) => updateMsg(m.id, { text: e.target.value })}
                  rows={7}
                  style={{ width: "100%", fontSize: 13.5, padding: 10, borderRadius: 8, border: `1px solid ${PALETTE.line}`, background: "#fff", color: "#3A0E33", boxSizing: "border-box", resize: "vertical", lineHeight: 1.5 }}
                />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: `${PALETTE.cream}88`, fontWeight: 600 }}>+ Varyab:</span>
                  {[["{non}", "non moun nan"], ["{program}", "pwogram"], ["{adres}", "adrès moun nan"], ["{dat_rezervasyon}", "dat rezèvasyon an"], ["{jou_rezervasyon}", "konbyen jou avan rezèvasyon"], ["{dat_session}", "dat session an"], ["{jou_session}", "konbyen jou avan session"]].map(([v, d]) => (
                    <button key={v} onClick={() => updateMsg(m.id, { text: (m.text || "") + v })} title={d} style={{ padding: "3px 8px", borderRadius: 6, fontSize: 11.5, fontWeight: 600, cursor: "pointer", border: `1px solid ${PALETTE.line}`, background: "#fff", color: "#25D366" }}>{v}</button>
                  ))}
                </div>
              </div>
            ))
          )}

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
            <button onClick={addMsg} style={ghostBtn}>+ Ajoute yon modèl</button>
            <label style={{ fontSize: 13, color: `${PALETTE.cream}cc`, display: "inline-flex", alignItems: "center", gap: 6 }}>
              Mesaj k ap voye:
              <select
                value={activeDraft || ""}
                onChange={(e) => setActiveDraft(e.target.value)}
                style={{ fontSize: 13, padding: "8px 10px", borderRadius: 8, border: `1px solid ${PALETTE.line}`, background: "#fff", color: "#3A0E33", colorScheme: "light", cursor: "pointer" }}
              >
                <option value="">Mesaj default</option>
                {(msgDraft || []).map((m) => (
                  <option key={m.id} value={m.id}>{m.name || "(san non)"}</option>
                ))}
              </select>
            </label>
            <button onClick={saveMsgs} style={goldBtn}>{msgSaved ? "✓ Anrejistre" : "Anrejistre modèl yo"}</button>
          </div>
        </div>
      )}

      {items === null ? (
        <p style={{ color: `${PALETTE.cream}99` }}>Ap chaje…</p>
      ) : isStudents ? (
        <AgentsProgressView items={items || []} programs={programs} />
      ) : viewItems.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", border: `1px solid ${PALETTE.line}`, borderRadius: 16, background: "rgba(194,35,142,.04)" }}>
          <p style={{ fontSize: 16, color: `${PALETTE.cream}cc`, margin: 0 }}>
            {isStudents ? "Poko gen okenn etidyan." : isLwen ? "Poko gen okenn moun lwen." : "Poko gen okenn prospè."}
          </p>
          <p style={{ fontSize: 13, color: `${PALETTE.cream}88`, margin: "8px 0 0" }}>
            {isStudents
              ? "Lè ou make yon prospè \"Vini\" nan lis swivi a, l ap parèt isit la."
              : isLwen
              ? "Lè ou make yon prospè \"Lwen\" nan lis swivi a, l ap parèt isit la."
              : "Lè yon moun reponn yon etap Fòmilè sou paj piblik la, l ap parèt isit la."}
          </p>
        </div>
      ) : (
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", padding: "10px 14px", marginBottom: 12, border: `1px solid ${PALETTE.line}`, borderRadius: 12, background: "rgba(194,35,142,.03)" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: PALETTE.cream }}>Kòd koulè bwat mesaj yo:</span>
            {[[1, "Etap 1 — Kontak"], [2, "Etap 2 — Swivi"], [3, "Etap 3 — Rezèvasyon"], [4, "Etap 4 — Recycle"]].map(([n, lbl]) => (
              <span key={n} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: PALETTE.cream }}>
                <span style={{ width: 13, height: 13, borderRadius: 4, background: STEP_COLORS[n], flexShrink: 0 }} />
                {lbl}
              </span>
            ))}
          </div>
          {groups.map(([prog, allRows0]) => {
            const allRows = etqFilter ? allRows0.filter((r) => String(r.etiquette || "").trim() === etqFilter) : allRows0;
            const rows = msgFilter ? allRows.filter((r) => stageKeyOf(r) === msgFilter) : allRows;
            if ((msgFilter || etqFilter) && rows.length === 0) return null;
            const open = !!openProg[prog];
            return (
              <div key={prog} style={{ marginBottom: 12, border: `1px solid ${PALETTE.line}`, borderRadius: 12, overflow: "hidden" }}>
                <button
                  type="button"
                  onClick={() => { if (!open) markGroupSeen(rows); toggleProg(prog); }}
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 14px", background: "rgba(194,35,142,.06)", border: "none", cursor: "pointer", textAlign: "left" }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 12, color: PALETTE.goldSoft, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s", display: "inline-block" }}>▶</span>
                    <strong style={{ fontSize: 15.5, color: PALETTE.cream }}>{prog}</strong>
                    {(() => { const nc = rows.filter(isNew).length; return nc > 0 ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: PALETTE.blush, color: "#fff", fontSize: 11, fontWeight: 800, padding: "2px 9px", borderRadius: 999 }}>🔔 {nc} nouvo</span>
                    ) : null; })()}
                  </span>
                  <span style={{ fontSize: 13, color: `${PALETTE.cream}aa`, fontWeight: 600 }}>{rows.length} moun</span>
                </button>
                {open && (
                  <div style={{ overflowX: "auto", borderTop: `1px solid ${PALETTE.line}` }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                      <thead>
                        <tr>{headCells()}</tr>
                      </thead>
                      <tbody>
                        {rows.map((p, idx) => renderRow(p, idx))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
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
