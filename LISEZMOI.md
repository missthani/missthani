# Miss Thani — Enskripsyon (Gid pou mete l live)

Pwojè sa a se app enskripsyon an, ki konekte ak **Supabase** pou sere
konfigirasyon an ak prospè yo. Swiv etap yo nan lòd.

Ou bezwen 3 kont gratis: **Supabase**, **GitHub**, ak **Vercel**.

---

## ETAP 1 — Prepare Supabase (baz done a)

1. Ale sou https://supabase.com epi konekte (oswa kreye yon kont).
2. Louvri pwojè Miss Thani Online Club ou a (oswa klike **New project** pou kreye yon nouvo).
3. Nan meni a gòch, klike **SQL Editor**, apre klike **New query**.
4. Louvri fichye **`supabase.sql`** (li nan dosye pwojè a), kopi TOUT tèks la,
   kole l nan editè a, epi klike **RUN**. Sa ap kreye 2 tab: `app_config` ak `prospects`.
5. Toujou nan Supabase, klike **Project Settings** (anba) -> **API**. Note de bagay sa yo:
   - **Project URL** (egz: `https://abcd1234.supabase.co`)
   - **anon public** key (yon long kòd)

   Kenbe de valè sa yo — ou pral bezwen yo nan ETAP 3.

---

## ETAP 2 — Mete pwojè a sou GitHub

1. Ale sou https://github.com epi konekte (oswa kreye yon kont).
2. Klike **+** anwo adwat -> **New repository**.
   - Bay li yon non (egz: `missthani-enskripsyon`), kite l **Public** oswa **Private**, klike **Create repository**.
3. Sou paj ki parèt la, klike lyen **uploading an existing file**.
4. Glise (drag-and-drop) **TOUT fichye ak dosye** ki nan pwojè sa a ladan l
   (`index.html`, `package.json`, `vite.config.js`, dosye `src`, `supabase.sql`, elatriye).
   - PA mete dosye `node_modules` si li ta egziste — nou pa bezwen l.
5. Anba paj la, klike **Commit changes**.

---

## ETAP 3 — Deplwaye sou Vercel

1. Ale sou https://vercel.com epi klike **Sign up** -> chwazi **Continue with GitHub**.
2. Sou tablo a, klike **Add New...** -> **Project**.
3. Jwenn repository `missthani-enskripsyon` ou a nan lis la, klike **Import**.
4. Vercel ap rekonèt se yon pwojè **Vite** otomatikman. **PA chanje** Build Command
   ni Output Directory.
5. **TRÈ ENPÒTAN** — anvan ou klike Deploy, louvri seksyon **Environment Variables**
   epi ajoute de varyab sa yo (egzakteman konsa):

   | Name (Non)                 | Value (Valè)                          |
   |----------------------------|---------------------------------------|
   | `VITE_SUPABASE_URL`        | Project URL ou a (soti ETAP 1)        |
   | `VITE_SUPABASE_ANON_KEY`   | anon public key ou a (soti ETAP 1)    |

   Klike **Add** pou chak youn.
6. Klike **Deploy**. Tann kèk minit.
7. Lè li fini, Vercel ap ba w yon adrès tankou `https://missthani-enskripsyon.vercel.app`.
   Sa se app live ou a — pataje l sou TikTok/Facebook!

---

## Kijan ou itilize l apre

- **Paj piblik la**: se adrès Vercel la. Se sa moun yo wè.
- **Espas admin**: sou paj piblik la, **kenbe dwèt ou 10 segond nan kwen anba adwat**
  la, epi mete modpas la.
- **Modpas la** se `missthani2026`. Pou chanje l: louvri fichye `src/App.jsx` sou GitHub,
  chanje liy `const ADMIN_PASSWORD = "missthani2026";`, commit — Vercel ap remete l live otomatikman.

---

## Mete pwòp non domèn ou (opsyonèl)

Nan Vercel: pwojè a -> **Settings** -> **Domains** -> ajoute domèn ou
(egz: `enskripsyon.missthani.com`) epi swiv enstriksyon yo.

---

## Pou teste sou òdinatè w anvan (opsyonèl, pou moun ki gen Node.js)

```
npm install
# kreye yon fichye .env ak de liy yo (gade .env.example)
npm run dev
```

---

## Nòt sou sekirite

Modpas admin nan se yon baryè senp nan navigatè a. Anplis, "anon key" Supabase la
piblik (li nan app la), donk an teyori yon moun ki konn teknik ka li prospè yo.
Pou yon vrè sekirite admin (vrè login), nou ka ajoute **Supabase Auth** pita —
fè m konnen lè ou pare pou sa.
