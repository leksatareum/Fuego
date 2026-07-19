/**
 * ════════════════════════════════════════════════════════════════════════════
 *  FUEGO — Application de gestion HACCP et production pour la restauration
 *
 *  © 2026 Alexandre Valery. Tous droits réservés.
 *
 *  Ce logiciel et son code source sont la propriété exclusive d'Alexandre
 *  Valery. Toute reproduction, distribution, modification ou utilisation,
 *  totale ou partielle, sans autorisation écrite préalable est interdite.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
// ─── SUPABASE REST CLIENT (sans dépendance externe) ─────────────────────────
// Fonctionne dans l'artifact Claude, dans Vite, partout.
// Utilise directement l'API REST Supabase via fetch.

import { SUPABASE_URL, SUPABASE_ANON } from "./config.js";
import { t, LANGS, dirFor } from "./locales/index.js";
// Client REST Supabase léger — pas besoin du SDK
const sbFetch = async (table, opts={}) => {
  if (!SUPABASE_URL || SUPABASE_URL.includes("REMPLACE")) return { data: null, error: "not_configured" };
  const { method="GET", body, params="", single=false } = opts;
  const url = `${SUPABASE_URL}/rest/v1/${table}${params}`;
  const headers = {
    "apikey": SUPABASE_ANON,
    "Authorization": `Bearer ${SUPABASE_ANON}`,
    "Content-Type": "application/json",
    "Prefer": single ? "return=representation,resolution=ignore-duplicates" : "return=representation",
    ...(opts.headers||{}), // en-têtes optionnels (ex. upsert push) — écrasent les défauts
  };
  try {
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) { const e = await res.text(); return { data: null, error: e }; }
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    return { data: single && Array.isArray(data) ? data[0] : data, error: null };
  } catch(e) { return { data: null, error: e.message }; }
};
const sbGet    = (table, params="")    => sbFetch(table, { params });
const sbPost   = (table, body)         => sbFetch(table, { method:"POST", body, single:true });
const sbPatch  = (table, body, params) => sbFetch(table, { method:"PATCH", body, params });
const sbDelete = (table, params)       => sbFetch(table, { method:"DELETE", params });

// ── Notifications push ──────────────────────────────────────────────────────
// Clé PUBLIQUE VAPID : elle identifie l'expéditeur des notifications (Fuego)
// auprès du navigateur. Sans danger à exposer — la clé privée, elle, reste
// uniquement côté serveur (étape 3).
const VAPID_PUBLIC_KEY = "BF3vl3jBGEnprNre9s1_Zkk04y3IiWpVKTPZIOnZGS3jbgGcouFO5PgWX1fMGAdlIWtYMtyQTfJoDySgcZS_CL0";

// Le navigateur fournit la clé au format base64url ; l'API push la réclame en
// tableau d'octets. Conversion nécessaire.
function urlBase64ToUint8Array(base64String){
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// État actuel des notifications sur cet appareil, pour afficher le bon bouton.
function pushSupported(){
  return typeof window!=="undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

// ── Supabase Storage : envoi/suppression de vrais fichiers (PDF de rapports).
// Contrairement aux photos de traçabilité stockées en base, les PDF peuvent
// peser plusieurs Mo : on ne garde que leur chemin en base, le fichier vit
// dans le Storage et n'est téléchargé que si on l'ouvre.
async function sbUpload(bucket, path, file){
  // Même garde-fou que sbFetch : en mode démo (Supabase non configuré), on
  // n'essaie pas d'appeler une URL invalide.
  if (!SUPABASE_URL || SUPABASE_URL.includes("REMPLACE")) return { data:null, error:"not_configured" };
  try{
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}`, "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if(!res.ok){ return { data:null, error: await res.text() }; }
    return { data:{ path }, error:null };
  }catch(e){ return { data:null, error:e.message }; }
}
async function sbRemoveFile(bucket, path){
  if (!SUPABASE_URL || SUPABASE_URL.includes("REMPLACE")) return { data:null, error:"not_configured" };
  try{
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
    });
    if(!res.ok){ return { data:null, error: await res.text() }; }
    return { data:true, error:null };
  }catch(e){ return { data:null, error:e.message }; }
}
// URL publique d'un fichier stocké (le bucket est public, cf. migration SQL).
const sbPublicUrl = (bucket, path) => `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;

// Helpers pour construire les query strings Supabase
const q = {
  eq: (col, val) => `${col}=eq.${encodeURIComponent(val)}`,
  order: (col, asc=true) => `order=${col}.${asc?"asc":"desc"}`,
  limit: (n) => `limit=${n}`,
  select: (cols="*") => `select=${cols}`,
};
const qs = (...parts) => "?" + parts.join("&");

// getSb() kept for compatibility — returns a proxy using sbFetch
function getSb() { return Promise.resolve(null); } // unused now


const DB = {
  async loadAll() {
    const today = todayStr();
    const [
      ru, rhs, rft, rfr, rrec, rcool, rreh, roil,
      rcl, rtr, rlb, rtr2, rpe, rrc, rcat, rtk, rre, rpr, rsh, rcc, rsl
    ] = await Promise.all([
      sbGet("users",           qs(q.order("id"),q.select())),
      sbGet("haccp_settings",  qs(q.limit(1),q.select())),
      sbGet("fridge_targets",  qs(q.order("sort_order"),q.select())),
      sbGet("fridge_releves",  qs(q.order("id",false),q.limit(200),q.select())),
      sbGet("reception",       qs(q.order("created_at",false),q.limit(100),q.select())),
      sbGet("cooling",         qs(q.order("created_at",false),q.limit(100),q.select())),
      sbGet("reheating",       qs(q.order("created_at",false),q.limit(100),q.select())),
      sbGet("oils",            qs(q.order("id"),q.select())),
      sbGet("cleaning",        qs(q.order("sort_order"),q.select())),
      // Colonnes explicites : on exclut volontairement "photo" (base64 lourd),
      // récupérée à la demande via DB.getTraceabilityPhoto(). "photo IS NOT NULL"
      // suffit à savoir s'il y en a une, pour afficher la vignette.
      sbGet("traceability",    qs(q.order("created_at",false),q.limit(100),q.select("id,product,emoji,supplier,lot,dlc,qty,allergenes,status,created_at,photo_present"))),
      sbGet("labels",          qs(`created_at=gte.${new Date(Date.now()-7*86400000).toISOString()}`,q.order("created_at",false),q.limit(300),q.select())),
      sbGet("training",        qs(q.order("id"),q.select())),
      sbGet("pests",           qs(q.order("created_at",false),q.limit(50),q.select())),
      sbGet("recipes",         qs(q.order("id"),q.select())),
      sbGet("task_categories", qs(q.order("sort_order"),q.select())),
      // La mise en place se consulte par créneau (jour + service) sur quelques
      // jours : inutile de charger des mois d'historique.
      sbGet("tasks",           qs(`date=gte.${new Date(Date.now()-14*86400000).toISOString().slice(0,10)}`,q.order("created_at",false),q.limit(300),q.select())),
      sbGet("restaurant",      qs(q.limit(1),q.select())),
      sbGet("products",        qs(q.order("name"),q.select())),
      // Sans limite, le planning chargeait tous les créneaux depuis la création
      // du restaurant. On ne garde que la fenêtre utile : 30 jours en arrière,
      // le reste n'est jamais consulté depuis l'app.
      sbGet("shifts",          qs(`date=gte.${new Date(Date.now()-30*86400000).toISOString().slice(0,10)}`,q.order("date"),q.limit(400),q.select())),
      // Historique de nettoyage : 100 jours en arrière, assez large pour
      // couvrir même les zones trimestrielles (90 jours) sans jamais perdre
      // la preuve d'un passage, contrairement à l'ancien système qui
      // écrasait l'état à chaque changement de service.
      sbGet("cleaning_checks", qs(`date=gte.${isoDate(new Date(Date.now()-100*86400000))}`,q.order("date",false),q.limit(2000),q.select())),
      sbGet("shopping_list",   qs(q.order("created_at",false),q.limit(200),q.select())),
    ]);
    const users   = ru.data   || [];
    const hs      = rhs.data?.[0] || {};
    const ft      = rft.data  || [];
    const fr      = rfr.data  || [];
    const rec     = rrec.data || [];
    const cool    = rcool.data|| [];
    const reheat  = rreh.data || [];
    const oils    = roil.data || [];
    const clean   = rcl.data  || [];
    const cleanChecks = rcc.data || [];
    const shoppingList = rsl.data || [];
    const trace   = rtr.data  || [];
    const labels  = rlb.data  || [];
    const train   = rtr2.data || [];
    const pests   = rpe.data  || [];
    const recipes = rrc.data  || [];
    const cats    = rcat.data || [];
    const tasks   = rtk.data  || [];
    const resto   = (rre.data || [{}])[0] || {};
    const products= rpr.data || [];
    const shifts  = rsh.data || [];

    return {
      restaurant: resto,
      // Planning n'est pas encore persisté en DB : on garde un planning sûr pour éviter la page blanche.
      planning: INIT?.planning || {},
      users: users.map(u=>({id:u.id,name:u.name,initials:u.initials,role:u.role,pin:u.pin,isAdmin:u.is_admin,color:u.color})),
      haccpSettings: {
        fridgeTargets: ft.map(f=>({id:f.id,name:f.name,icon:f.icon,target:f.target,type:f.type})),
        coolingMax:hs.cooling_max||120, reheatMin:hs.reheat_min||63,
        reheatMaxTime:hs.reheat_max_time||60, oilPolarMax:hs.oil_polar_max||25,
        testMealDays:hs.test_meal_days||3, labelDlcDefault:hs.label_dlc_default||3,
        // Horaires de bascule de service, en minutes depuis minuit.
        // Défauts : 16h30 (990) et 03h00 (180). Le ?? est volontaire : une
        // valeur de 0 (= minuit) est légitime et ne doit pas être écrasée.
        resetMidi:hs.reset_midi ?? 990, resetSoir:hs.reset_soir ?? 180,
      },
      fridgeReleves: fr.map(r=>({id:r.id,fridgeId:r.fridge_id,date:r.date,period:r.period,temp:r.temp,time:r.time,operatorId:r.operator_id,createdAt:r.created_at})),
      reception: rec.map(r=>({id:r.id,date:r.date,supplier:r.supplier,product:r.product,qty:r.qty,temp:r.temp,tempOk:r.temp_ok,dlc:r.dlc,lot:r.lot,aspect:r.aspect,emballage:r.emballage,signed:r.signed,createdAt:r.created_at})),
      cooling: cool.map(c=>({id:c.id,product:c.product,qty:c.qty,startTemp:c.start_temp,endTemp:c.end_temp,duration:c.duration,startedMs:c.started_ms,operator:c.operator,status:c.status,date:c.date,dlc:c.dlc,createdAt:c.created_at})),
      reheating: reheat.map(r=>({id:r.id,product:r.product,endTemp:r.end_temp,duration:r.duration,operator:r.operator,status:r.status,date:r.date,createdAt:r.created_at})),
      oils: oils.map(o=>({id:o.id,name:o.name,type:o.type,dateInstall:o.date_install,lastTest:o.last_test,polaires:o.polaires,operator:o.operator,createdAt:o.created_at})),
      cleaning: clean.map(c=>({id:c.id,zone:c.zone,icon:c.icon,freq:c.freq,produit:c.produit,dilution:c.dilution,done:c.done,doneAt:c.done_at,operator:c.operator||null})),
      // Historique permanent — jamais réinitialisé, source du Registre HACCP.
      cleaningChecks: cleanChecks.map(c=>({id:c.id,cleaningId:c.cleaning_id,zone:c.zone,freq:c.freq,date:c.date,period:c.period,operator:c.operator,createdAt:c.created_at})),
      shoppingList: shoppingList.map(s=>({id:s.id,item:s.item,done:s.done,operator:s.operator,createdAt:s.created_at})),
      // hasPhoto : la photo elle-même n'est pas chargée ici (trop lourde), on
      // sait juste si la fiche en a une. photo reste null jusqu'à ce qu'on
      // ouvre la fiche, qui déclenche alors le chargement de l'image.
      // photo n'est pas chargée ici (base64 lourd) : elle est récupérée à la
      // demande quand on ouvre une fiche. photo_present est un booléen léger
      // calculé côté base (cf. migration), qui permet d'afficher l'indicateur
      // sans télécharger l'image.
      traceability: trace.map(t=>({id:t.id,product:t.product,emoji:t.emoji,supplier:t.supplier,lot:t.lot,dlc:t.dlc,qty:t.qty,allergenes:t.allergenes||[],status:t.status,photo:null,hasPhoto:!!t.photo_present,createdAt:t.created_at})),
      labels: labels.map(l=>({id:l.id,product:l.product,dateProd:l.date_prod,dlc:l.dlc,lot:l.lot,allergens:l.allergens,operator:l.operator,createdAt:l.created_at,dateType:l.date_type||"fabrique"})),
      training: train.map(t=>({id:t.id,name:t.name,role:t.role,haccpExp:t.haccp_exp,visaExp:t.visa_exp})),
      pests: pests.map(p=>({id:p.id,date:p.date,type:p.type,company:p.company,result:p.result,nextVisit:p.next_visit,reportPath:p.report_path||null,reportName:p.report_name||null,createdAt:p.created_at})),
      recipes: recipes.map(r=>({id:r.id,name:r.name,emoji:r.emoji,type:r.type,category:r.category,price:r.price,portions:r.portions,yield:r.yield_qty?{qty:r.yield_qty,unit:r.yield_unit}:undefined,components:r.components||[],steps:r.steps||[],allergens:r.allergens||[]})),
      taskCategories: cats.map(c=>({id:c.id,name:c.name,icon:c.icon,color:c.color})),
      tasks: tasks.map(t=>({id:t.id,categoryId:t.category_id,task:t.task,resp:t.resp,qty:t.qty,done:t.done,prio:t.prio,date:t.date,service:t.service||"midi"})),
      products: products.map(p=>({id:p.id,name:p.name,price:p.price,unit:p.unit,category:p.category||"Épicerie"})),
      shifts: shifts.map(s=>({id:s.id,userId:s.user_id,date:s.date,start:s.start,end:s.end})),
    };
  },

  async saveReleve({fridgeId,date,period,temp,time,operatorId,existingId}){
    // Si l'appelant connaît déjà l'id du relevé existant (il l'a dans son état
    // local), on écrit directement — ça évite une requête réseau de lecture
    // avant chaque enregistrement, qui doublait le temps de validation.
    if(existingId)
      return sbPatch("fridge_releves",{temp,time,operator_id:operatorId},qs(`id=eq.${existingId}`));
    // Sinon seulement, on vérifie côté serveur (cas rare : état local pas à jour).
    const {data:ex}=await sbGet("fridge_releves", qs(`fridge_id=eq.${fridgeId}`,`date=eq.${date}`,`period=eq.${period}`,q.limit(1),q.select("id")));
    if(ex&&ex[0])
      return sbPatch("fridge_releves",{temp,time,operator_id:operatorId},qs(`id=eq.${ex[0].id}`));
    return sbPost("fridge_releves",{fridge_id:fridgeId,date,period,temp,time,operator_id:operatorId});
  },
  async addReception(r){return sbPost("reception",{date:r.date,supplier:r.supplier,product:r.product,qty:r.qty,temp:r.temp,temp_ok:r.tempOk,dlc:r.dlc,lot:r.lot,aspect:r.aspect,emballage:r.emballage,signed:r.signed});},
  async startCooling(c){return sbPost("cooling",{product:c.product,qty:c.qty,start_temp:c.startTemp,started_ms:c.startedMs,status:"active",operator:c.operator,date:c.date});},
  async finishCooling(id,{endTemp,duration,status,dlc}){return sbPatch("cooling",{end_temp:endTemp,duration,started_ms:null,status,dlc},qs(`id=eq.${id}`));},
  async addReheating(r){return sbPost("reheating",{product:r.product,end_temp:r.endTemp,duration:r.duration,operator:r.operator,status:r.status,date:r.date});},
  async addOil(o){return sbPost("oils",{name:o.name,type:o.type,date_install:todayStr(),last_test:todayStr(),polaires:0,operator:o.operator});},
  async deleteOil(id){return sbDelete("oils",qs(`id=eq.${id}`));},
  // Formation HACCP : aucune fonction n'existait ici avant — l'écran ne
  // faisait qu'afficher les données de démo sans jamais pouvoir les modifier.
  async addTraining(t){return sbPost("training",{name:t.name,role:t.role,haccp_exp:t.haccpExp,visa_exp:t.visaExp});},
  async updateTraining(id,t){return sbPatch("training",{name:t.name,role:t.role,haccp_exp:t.haccpExp,visa_exp:t.visaExp},qs(`id=eq.${id}`));},
  async deleteTraining(id){return sbDelete("training",qs(`id=eq.${id}`));},
  // Liste "à commander" — pense-bête simple, ouvert à toute l'équipe.
  async addShoppingItem(item,operator){return sbPost("shopping_list",{item,operator});},
  async toggleShoppingItem(id,done){return sbPatch("shopping_list",{done},qs(`id=eq.${id}`));},
  async deleteShoppingItem(id){return sbDelete("shopping_list",qs(`id=eq.${id}`));},
  async updateOil(id,{polaires,operator,changed,dateInstall}){
    const body={polaires,operator,last_test:todayStr()};
    if(changed)body.date_install=dateInstall;
    return sbPatch("oils",body,qs(`id=eq.${id}`));
  },
  async toggleCleaning(id,done,operator){return sbPatch("cleaning",{done,done_at:done?new Date().toISOString():null,operator:done?(operator||null):null},qs(`id=eq.${id}`));},
  // Historique permanent d'un nettoyage — jamais réinitialisé, contrairement
  // à la case à cocher (cleaning.done) qui, elle, repart à zéro. C'est cette
  // table que lit le Registre HACCP : chaque passage matin ET soir y laisse
  // sa propre trace, définitivement.
  async saveCleaningCheck({cleaningId,zone,freq,date,period,operator}){
    return sbPost("cleaning_checks",{cleaning_id:cleaningId,zone,freq,date,period:period||null,operator:operator||null});
  },
  async deleteCleaningCheck(id){return sbDelete("cleaning_checks",qs(`id=eq.${id}`));},
  // Charge la photo d'une fiche à la demande — elle n'est pas incluse dans
  // loadAll() pour ne pas alourdir le démarrage de l'app.
  // Charge un mois d'archives à la demande — jamais tout au démarrage de
  // l'app, sinon on retombe exactement dans le problème de lenteur déjà
  // corrigé ailleurs. Seuls les mois que l'admin consulte vraiment sont
  // interrogés, et seulement ceux-là. Filtré sur created_at (vrai
  // horodatage), pas sur la date affichée qui n'a pas d'année.
  async fetchRegistrePeriod(fromISO,toISO){
    const range=`created_at=gte.${fromISO}&created_at=lt.${toISO}`;
    const [rec,cool,reheat,oils,labels,tm,pests,fr,trace,cleanChecks]=await Promise.all([
      sbGet("reception",   `?${range}&${q.select()}`),
      sbGet("cooling",     `?${range}&${q.select()}`),
      sbGet("reheating",   `?${range}&${q.select()}`),
      sbGet("oils",        `?${range}&${q.select()}`),
      sbGet("labels",      `?${range}&${q.select()}`),
      sbGet("pests",       `?${range}&${q.select()}`),
      sbGet("fridge_releves", `?${range}&${q.select()}`),
      sbGet("traceability",`?${range}&${q.select("id,product,emoji,supplier,lot,dlc,qty,allergenes,status,created_at")}`),
      sbGet("cleaning_checks", `?date=gte.${fromISO.slice(0,10)}&date=lt.${toISO.slice(0,10)}&${q.select()}`),
    ]);
    // Même mapping que loadAll(), pour que buildRegistreEvents() puisse
    // traiter ces lignes exactement comme les données déjà en mémoire.
    return {
      reception: (rec.data||[]).map(r=>({id:r.id,date:r.date,supplier:r.supplier,product:r.product,qty:r.qty,temp:r.temp,tempOk:r.temp_ok,dlc:r.dlc,lot:r.lot,aspect:r.aspect,emballage:r.emballage,signed:r.signed,createdAt:r.created_at})),
      cooling: (cool.data||[]).map(c=>({id:c.id,product:c.product,qty:c.qty,startTemp:c.start_temp,endTemp:c.end_temp,duration:c.duration,startedMs:c.started_ms,operator:c.operator,status:c.status,date:c.date,dlc:c.dlc,createdAt:c.created_at})),
      reheating: (reheat.data||[]).map(r=>({id:r.id,product:r.product,endTemp:r.end_temp,duration:r.duration,operator:r.operator,status:r.status,date:r.date,createdAt:r.created_at})),
      oils: (oils.data||[]).map(o=>({id:o.id,name:o.name,type:o.type,dateInstall:o.date_install,lastTest:o.last_test,polaires:o.polaires,operator:o.operator,createdAt:o.created_at})),
      labels: (labels.data||[]).map(l=>({id:l.id,product:l.product,dateProd:l.date_prod,dlc:l.dlc,lot:l.lot,allergens:l.allergens,operator:l.operator,createdAt:l.created_at,dateType:l.date_type||"fabrique"})),
      pests: (pests.data||[]).map(p=>({id:p.id,date:p.date,type:p.type,company:p.company,result:p.result,nextVisit:p.next_visit,createdAt:p.created_at})),
      fridgeReleves: (fr.data||[]).map(r=>({id:r.id,fridgeId:r.fridge_id,date:r.date,period:r.period,temp:r.temp,time:r.time,operatorId:r.operator_id,createdAt:r.created_at})),
      traceability: (trace.data||[]).map(t=>({id:t.id,product:t.product,emoji:t.emoji,supplier:t.supplier,lot:t.lot,dlc:t.dlc,qty:t.qty,allergenes:t.allergenes||[],status:t.status,createdAt:t.created_at})),
      // La source d'archivage du nettoyage est désormais le vrai historique
      // permanent, pas la case à cocher (qui n'a jamais représenté qu'un
      // état "maintenant", écrasé à chaque service).
      cleaningChecks: (cleanChecks.data||[]).map(c=>({id:c.id,cleaningId:c.cleaning_id,zone:c.zone,freq:c.freq,date:c.date,period:c.period,operator:c.operator,createdAt:c.created_at})),
    };
  },
  // Les étiquettes ne sont chargées que sur 7 jours au démarrage de l'app
  // (pour ne pas alourdir l'écran Étiquetage) — mais le Registre a besoin de
  // voir plus loin (30 jours, mois en cours). Requête ciblée, indépendante
  // de cette limite.
  async fetchLabelsSince(fromISO){
    const res=await sbGet("labels", qs(`created_at=gte.${fromISO}`,q.order("created_at",false),q.select()));
    return (res.data||[]).map(l=>({id:l.id,product:l.product,dateProd:l.date_prod,dlc:l.dlc,lot:l.lot,allergens:l.allergens,operator:l.operator,createdAt:l.created_at}));
  },
  async getTraceabilityPhoto(id){
    const {data,error}=await sbGet("traceability", qs(q.eq("id",id),q.limit(1),q.select("photo")));
    if(error) return {photo:null,error};
    return {photo: data?.[0]?.photo || null, error:null};
  },
  async addTraceability(t){return sbPost("traceability",{product:t.product,emoji:t.emoji,supplier:t.supplier,lot:t.lot,dlc:t.dlc,qty:t.qty,allergenes:t.allergenes,status:t.status,photo:t.photo||null});},
  async addLabel(l){return sbPost("labels",{product:l.product,date_prod:l.dateProd,dlc:l.dlc,lot:l.lot,allergens:l.allergens,operator:l.operator,date_type:l.dateType||"fabrique"});},
  // Purge l'historique des étiquettes antérieures à aujourd'hui. On garde
  // volontairement celles du jour : ce sont celles du service en cours, et
  // elles servent au calcul du numéro de lot.
  async purgeOldLabels(){
    const startOfToday = new Date(); startOfToday.setHours(0,0,0,0);
    return sbDelete("labels", qs(`created_at=lt.${startOfToday.toISOString()}`));
  },
  async addPest(p){return sbPost("pests",{date:p.date,type:p.type,company:p.company,result:p.result,next_visit:p.nextVisit,report_path:p.reportPath||null,report_name:p.reportName||null});},
  // Envoie le PDF dans le Storage. Le nom est rendu unique pour éviter
  // d'écraser un rapport existant portant le même nom de fichier.
  async uploadPestReport(file){
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
    const path = `${Date.now()}_${safe}`;
    const res = await sbUpload("pest-reports", path, file);
    if(res.error) return { error: res.error };
    return { path, name: file.name };
  },
  async deletePestReport(path){ return sbRemoveFile("pest-reports", path); },
  pestReportUrl(path){ return sbPublicUrl("pest-reports", path); },
  async saveRecipe(r){
    const row={name:r.name,emoji:r.emoji,type:r.type,category:r.category,price:r.price,portions:r.portions,yield_qty:r.yield?.qty,yield_unit:r.yield?.unit,components:r.components,steps:r.steps,allergens:r.allergens};
    if(r.id)return sbPatch("recipes",row,qs(`id=eq.${r.id}`));
    return sbPost("recipes",row);
  },
  async deleteRecipe(id){return sbDelete("recipes",qs(`id=eq.${id}`));},
  async deleteTask(id){return sbDelete("tasks",qs(`id=eq.${id}`));},
  // Enregistre l'abonnement push d'un appareil. endpoint est unique : si
  // l'appareil se réabonne, on écrase l'ancienne ligne (upsert via Prefer).
  async savePushSubscription(sub, userId){
    return sbFetch("push_subscriptions", {
      method:"POST",
      body:{ user_id:userId, endpoint:sub.endpoint, p256dh:sub.keys.p256dh, auth:sub.keys.auth },
      single:true,
      headers:{ "Prefer":"resolution=merge-duplicates,return=representation" },
    });
  },
  async deletePushSubscription(endpoint){
    return sbDelete("push_subscriptions", qs(`endpoint=eq.${encodeURIComponent(endpoint)}`));
  },
  async addTask(t){return sbPost("tasks",{category_id:t.categoryId,task:t.task,resp:t.resp,qty:t.qty,prio:t.prio,done:false,date:t.date||todayStr(),service:t.service||"midi"});},
  async toggleTask(id,done){return sbPatch("tasks",{done},qs(`id=eq.${id}`));},
  async clearTasks(dateStr,service){
    if(dateStr&&service)return sbDelete("tasks",qs(`date=eq.${dateStr}`,`service=eq.${service}`));
    return sbDelete("tasks",qs("id=not.is.null")); // fallback : tout (ne devrait plus servir)
  },
  async saveTaskCategory(c){
    if(c.id)return sbPatch("task_categories",{name:c.name,icon:c.icon,color:c.color},qs(`id=eq.${c.id}`));
    return sbPost("task_categories",{name:c.name,icon:c.icon,color:c.color});
  },
  async deleteTaskCategory(id,fallbackId){
    if(fallbackId)await sbPatch("tasks",{category_id:fallbackId},qs(`category_id=eq.${id}`));
    return sbDelete("task_categories",qs(`id=eq.${id}`));
  },
  async addShift(s){return sbPost("shifts",{user_id:s.userId,date:s.date,start:s.start,end:s.end});},
  async updateShift(id,s){return sbPatch("shifts",{user_id:s.userId,date:s.date,start:s.start,end:s.end},qs(`id=eq.${id}`));},
  async deleteShift(id){return sbDelete("shifts",qs(`id=eq.${id}`));},
  async getAppState(key){const r=await sbGet("app_state",qs(`key=eq.${key}`,q.select()));return (r.data&&r.data[0])?r.data[0].value:null;},
  async setAppState(key,value){const r=await sbGet("app_state",qs(`key=eq.${key}`,q.select()));if(r.data&&r.data.length)return sbPatch("app_state",{value},qs(`key=eq.${key}`));return sbPost("app_state",{key,value});},
  // Remet à zéro les listes de travail (mise en place + nettoyage) — idempotent
  // Durée de validité d'un nettoyage, par fréquence. Chaque zone repart de SA
  // propre date de réalisation (done_at) : une hotte nettoyée le 20 reste
  // valide jusqu'au 20 du mois suivant, pas jusqu'au 1er.
  // "Quotidien" est géré à part (remise à zéro à chaque changement de service).
  // "Après usage" n'expire jamais tout seul : c'est ponctuel, décoché à la main.
  // Nettoyage quotidien : remis à zéro à chaque changement de service.
  // (Les tâches de Mise en place ne sont plus "réinitialisées" ici — elles
  // sont désormais supprimées automatiquement par closeSlot() quand leur
  // créneau se termine, ce qui est plus juste : avant, cette fonction
  // décochait TOUTES les tâches faites de TOUS les jours, pas seulement
  // celles du créneau qui vient de finir.)
  // Les zones quotidiennes n'ont plus besoin d'être réinitialisées ici : leur
  // état (fait ou pas) se déduit désormais directement de la présence d'un
  // passage dans l'historique pour AUJOURD'HUI + le créneau (matin/soir) —
  // dès que la date change, une zone redevient naturellement "à faire",
  // sans la moindre écriture destructive. C'est ce qui permet de garder
  // chaque passage, matin ET soir, sans jamais l'effacer.
  async resetServiceLists(){
    return { ok:true }; // conservé pour compatibilité d'appel, ne fait plus rien
  },
  // Fait passer les tâches NON terminées d'un créneau qui vient de se
  // terminer directement dans le créneau qui devient le nouveau "en cours" —
  // ex : le riz à sushi pas cuit le soir atterrit automatiquement dans la
  // liste du lendemain matin, sans action de personne.
  // Les tâches déjà cochées, elles, ne servent plus : on les retire.
  async rolloverSlot(prevDate,prevService,nextDate,nextService){
    if(!prevDate||!prevService)return;
    // Nettoie les tâches déjà faites du créneau qui se termine.
    await sbDelete("tasks",qs(`date=eq.${prevDate}`,`service=eq.${prevService}`,"done=eq.true"));
    // Fait glisser les tâches pas faites vers le créneau qui devient courant.
    return sbPatch("tasks",{date:nextDate,service:nextService},
      qs(`date=eq.${prevDate}`,`service=eq.${prevService}`,"done=eq.false"));
  },
  // Décoche les zones dont le délai de validité est écoulé, fréquence par
  // fréquence. Appelé en même temps que la synchro : une zone hebdo cochée
  // il y a 8 jours redevient à faire, une cochée il y a 3 jours reste verte.
  async expireCleaningByFrequency(){
    const DAYS = { "Hebdomadaire":7, "Mensuel":30, "Trimestriel":90 };
    for(const [freq,days] of Object.entries(DAYS)){
      const limit = new Date(Date.now() - days*86400000).toISOString();
      await sbPatch("cleaning",{done:false,done_at:null},
        qs("done=eq.true",`freq=eq.${encodeURIComponent(freq)}`,`done_at=lt.${limit}`));
    }
  },
  async addProduct(p){return sbPost("products",{name:p.name,price:p.price,unit:p.unit,category:p.category||"Épicerie"});},
  async updateProduct(id,p){return sbPatch("products",{name:p.name,price:p.price,unit:p.unit,category:p.category||"Épicerie"},qs(`id=eq.${id}`));},
  async deleteProduct(id){return sbDelete("products",qs(`id=eq.${id}`));},
  async saveHaccpSettings(s){
    const body={cooling_max:s.coolingMax,reheat_min:s.reheatMin,reheat_max_time:s.reheatMaxTime,oil_polar_max:s.oilPolarMax,test_meal_days:s.testMealDays,label_dlc_default:s.labelDlcDefault};
    // N'envoie les horaires que s'ils sont fournis, pour ne pas les écraser
    // quand on ne modifie qu'un seuil critique.
    if(s.resetMidi!=null) body.reset_midi=s.resetMidi;
    if(s.resetSoir!=null) body.reset_soir=s.resetSoir;
    return sbPatch("haccp_settings",body,qs("id=eq.1"));
  },
  async saveRestaurant(r){const id=r.id;const body={name:r.name,address:r.address,phone:r.phone,siret:r.siret};if(id)return sbPatch("restaurant",body,qs(`id=eq.${id}`));return sbPost("restaurant",body);},
  async addFridgeTarget(f){return sbPost("fridge_targets",{name:f.name,icon:f.icon,target:f.target,type:f.type,sort_order:99});},
  async updateFridgeTarget(id,f){return sbPatch("fridge_targets",{name:f.name,icon:f.icon,target:f.target,type:f.type},qs(`id=eq.${id}`));},
  async deleteFridgeTarget(id){return sbDelete("fridge_targets",qs(`id=eq.${id}`));},
  async addCleaningItem(c){return sbPost("cleaning",{zone:c.zone,icon:c.icon,freq:c.freq,produit:c.produit,dilution:c.dilution,done:false,sort_order:99});},
  async updateCleaningItem(id,c){return sbPatch("cleaning",{zone:c.zone,icon:c.icon,freq:c.freq,produit:c.produit,dilution:c.dilution},qs(`id=eq.${id}`));},
  async deleteCleaningItem(id){return sbDelete("cleaning",qs(`id=eq.${id}`));},
  async addUser(u){return sbPost("users",{name:u.name,initials:u.initials,role:u.role,pin:u.pin,is_admin:u.isAdmin,color:u.color});},
  async updateUser(id,u){return sbPatch("users",u,qs(`id=eq.${id}`));},
  async deleteUser(id){return sbDelete("users",qs(`id=eq.${id}`));},
};



const T = {
  bg0:"#090909", bg1:"#111111", bg2:"#1A1A1A", bg3:"#242424",
  border:"#2A2A2A", borderHi:"#3A3A3A",
  text:"#FFFFFF", textDim:"#A0A0A0", textMute:"#8C8C8C", textGhost:"#383838",
  accent:"#E8390A",     // rouge flamme principal
  accentOrange:"#FF6B00", // orange logo (le O)
  accentDk:"#B82D08",
  accentLt:"#2D1208",
  accentGrad:"linear-gradient(135deg, #FF6B00 0%, #E8390A 100%)",
  good:"#5FB075", goodBg:"#0F2018",
  warn:"#D49340", warnBg:"#251A0A",
  bad:"#D55C5C", badBg:"#251010",
  info:"#5A8FB5", infoBg:"#0E1C28",
};

const S = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  :root{
    /* Système d'animation unifié — 3 durées, 2 courbes, comme un design system Apple */
    --dur-fast:.15s;      /* micro-interactions : press, toggle, hover */
    --dur-base:.28s;      /* transitions standard : apparition, changement d'état */
    --dur-slow:.45s;      /* entrées de contenu, séquences */
    --ease-out:cubic-bezier(.22,1,.36,1);   /* décélération douce (défaut) */
    --ease-spring:cubic-bezier(.34,1.4,.5,1); /* léger rebond pour les entrées marquantes */
  }
  *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
  :focus-visible{outline:2px solid #FF6B00;outline-offset:2px;border-radius:4px;}
  @media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;}}
  html,body{width:100%;height:100%;overflow:hidden;overscroll-behavior:none;}
  #root{width:100%;height:100%;display:flex;flex-direction:column;}
  body{font-family:'Inter',sans-serif;background:${T.bg0};color:${T.text};font-size:15px;-webkit-font-smoothing:antialiased;overscroll-behavior:none;}
  button{font-family:inherit;cursor:pointer;user-select:none;-webkit-user-select:none;touch-action:manipulation;}
  .tabular{font-variant-numeric:tabular-nums;letter-spacing:-0.01em;}

  .shell{display:flex;flex-direction:column;width:100%;height:100vh;height:100dvh;max-width:480px;margin:0 auto;background:${T.bg0};position:relative;overflow:hidden;}
  .topbar{background:${T.bg1};padding:calc(12px + env(safe-area-inset-top)) 18px 12px;border-bottom:1px solid ${T.border};flex-shrink:0;display:flex;align-items:center;justify-content:space-between;}
  .topbar-back{width:36px;height:36px;border-radius:50%;background:${T.bg2};border:none;display:flex;align-items:center;justify-content:center;font-size:20px;color:${T.text};transition:transform var(--dur-fast);}
  .topbar-back:active{transform:scale(.92);}
  .topbar-center{flex:1;text-align:center;min-width:0;padding:0 8px;}
  .topbar-logo{font-family:'Inter',sans-serif;font-size:17px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;}
  .topbar-logo .flame{background:linear-gradient(135deg,#FF6B00,#E8390A);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;color:transparent;}
  .topbar-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:'Inter',sans-serif;font-size:15px;font-weight:700;color:${T.text};letter-spacing:.01em;}
  .topbar-avatar{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#FF6B00,#E8390A);border:none;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:white;transition:transform var(--dur-fast);}
  .topbar-avatar:active{transform:scale(.92);}

  .scroll{flex:1;overflow-y:auto;padding:18px 14px 110px;position:relative;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;}
  .scroll::-webkit-scrollbar{width:0;}
  @keyframes pageIn{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
  @keyframes pageInFade{from{opacity:0;}to{opacity:1;}}
  @keyframes slideFromRight{from{opacity:.4;transform:translateX(28px);}to{opacity:1;transform:translateX(0);}}
  @keyframes slideFromLeft{from{opacity:.4;transform:translateX(-28px);}to{opacity:1;transform:translateX(0);}}
  @keyframes loadBar{0%{transform:translateX(-100%);}100%{transform:translateX(250%);}}
  @keyframes fadeUp{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:translateY(0);}}
  @keyframes inputShake{0%,100%{transform:translateX(0);}20%{transform:translateX(-7px);}40%{transform:translateX(7px);}60%{transform:translateX(-4px);}80%{transform:translateX(4px);}}
  .input-shake{animation:inputShake .4s ease-in-out;}
  .fade-up{animation:fadeUp var(--dur-slow) var(--ease-out) both;}
  .fade-up-1{animation-delay:.05s;}.fade-up-2{animation-delay:.12s;}.fade-up-3{animation-delay:.19s;}
  .scroll.nav-forward{animation:slideFromRight var(--dur-base) var(--ease-out);}
  .scroll.nav-back{animation:slideFromLeft var(--dur-base) var(--ease-out);}
  .scroll.nav-fade{animation:pageInFade var(--dur-base) var(--ease-out);}
  @keyframes pulseGlow{0%,100%{box-shadow:0 0 0 0 rgba(232,57,10,.5);}50%{box-shadow:0 0 0 10px rgba(232,57,10,0);}}
  /* ── VOICE ── */
  .voice-fab{position:fixed;bottom:calc(110px + env(safe-area-inset-bottom));left:max(14px,calc((100vw - 480px)/2 + 14px));width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#FF6B00,#E8390A);color:white;border:none;font-size:22px;box-shadow:0 8px 24px rgba(232,57,10,.5);z-index:35;display:flex;align-items:center;justify-content:center;transition:transform var(--dur-fast);}
  .voice-fab:active{transform:scale(.92);}
  .voice-fab.listening{animation:voicePulse 1.2s ease-in-out infinite;}
  @keyframes voicePulse{0%,100%{box-shadow:0 0 0 0 rgba(232,57,10,.6);}50%{box-shadow:0 0 0 14px rgba(232,57,10,0);}}
  .voice-overlay{position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:200;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;padding:32px;animation:overlayIn .2s ease-out;}
  .voice-orb{width:120px;height:120px;border-radius:50%;background:linear-gradient(135deg,#FF6B00,#E8390A);display:flex;align-items:center;justify-content:center;font-size:52px;animation:orbPulse 1.4s ease-in-out infinite;}
  @keyframes orbPulse{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(232,57,10,.5);}50%{transform:scale(1.06);box-shadow:0 0 0 24px rgba(232,57,10,0);}}
  .voice-orb.thinking{animation:orbSpin 1s linear infinite;}
  @keyframes orbSpin{to{transform:rotate(360deg);}}
  .voice-status{font-size:13px;color:#A0A0A0;text-transform:uppercase;letter-spacing:.12em;font-weight:600;}
  .voice-transcript{font-family:'Inter',sans-serif;font-size:24px;font-weight:600;color:#FFFFFF;text-align:center;min-height:60px;line-height:1.3;}
  .voice-hint{font-size:13px;color:#606060;text-align:center;line-height:1.6;}
  .voice-result{padding:14px 20px;border-radius:14px;font-size:15px;font-weight:600;text-align:center;max-width:320px;}
  .voice-result.ok{background:#0F2018;color:#5FB075;border:1px solid #5FB075;}
  .voice-result.err{background:#251010;color:#D55C5C;border:1px solid #D55C5C;}
  .voice-close{position:fixed;top:calc(20px + env(safe-area-inset-top));right:calc(20px + max(0px,(100vw - 480px)/2));width:40px;height:40px;border-radius:50%;background:#1A1A1A;border:1px solid #2A2A2A;color:#FFFFFF;font-size:20px;display:flex;align-items:center;justify-content:center;z-index:210;}
  .voice-toggle{display:flex;align-items:center;gap:10px;padding:12px 16px;background:#1A1A1A;border-radius:12px;border:1px solid #2A2A2A;margin-bottom:8px;}
  @keyframes toastIn{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
  .save-toast{position:fixed;bottom:calc(96px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);background:rgba(10,10,10,.96);border:1px solid #2A2A2A;color:#5FB075;font-size:13px;font-weight:600;padding:8px 16px;border-radius:999px;z-index:200;display:flex;align-items:center;gap:6px;animation:toastIn .2s ease-out;box-shadow:0 8px 24px rgba(0,0,0,.4);}
  @keyframes pressShrink{to{transform:scale(.96);}}
  .ed-row{position:relative;transition:transform var(--dur-fast),background var(--dur-base);}
  .ed-row.pressing{transform:scale(.96);background:#2D1818;}
  .ed-field{background:transparent;border:none;border-bottom:1.5px solid transparent;color:#F5F1E8;font-family:inherit;outline:none;width:100%;transition:border-color var(--dur-fast);padding:2px 0;}
  .ed-field:focus{border-bottom-color:#B8503F;}
  .inline-add{display:flex;align-items:center;gap:10px;padding:14px;border:1.5px dashed #3A3A3A;border-radius:12px;color:#A8A29A;font-size:14px;font-weight:600;background:transparent;width:100%;justify-content:center;transition:all var(--dur-fast);}
  .inline-add:active{border-color:#B8503F;color:#F5F1E8;}
  .pulse{animation:pulseGlow 1.8s ease-in-out infinite;}

  .bottomnav{position:absolute;bottom:0;left:0;right:0;background:rgba(17,17,17,.88);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-top:1px solid ${T.border};display:flex;padding:8px 4px calc(12px + env(safe-area-inset-bottom));z-index:20;transition:opacity var(--dur-fast),transform var(--dur-fast);}
  .shell:has(.overlay) .bottomnav,.shell:has(.voice-overlay) .bottomnav{opacity:0;pointer-events:none;transform:translateY(100%);}
  .shell:has(.overlay) .btn-fab,.shell:has(.overlay) .voice-fab,.shell:has(.voice-overlay) .voice-fab{opacity:0;pointer-events:none;transform:scale(.9);}
  .nav-item{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 0;border:none;background:transparent;color:${T.textMute};transition:color var(--dur-fast);position:relative;}
  .nav-item.active{color:#FF6B00;}
  .nav-item.active::before{content:"";position:absolute;top:0;left:50%;transform:translateX(-50%);width:24px;height:2px;background:linear-gradient(90deg,#FF6B00,#E8390A);border-radius:0 0 2px 2px;}
  .nav-icon{display:flex;align-items:center;justify-content:center;line-height:1;}
  .nav-label{font-size:10px;font-weight:600;color:inherit;}

  .greet-block{margin-bottom:16px;}
  .greet-line{display:flex;align-items:center;gap:8px;color:${T.textDim};font-size:13px;margin-bottom:2px;}
  .greet-dot{width:6px;height:6px;border-radius:50%;background:#FF6B00;box-shadow:0 0 8px rgba(255,107,0,.6);}
  .greet-name{font-family:'Inter',sans-serif;font-size:28px;font-weight:800;color:${T.text};line-height:1.05;letter-spacing:-.02em;}
  .greet-context{font-size:12px;color:#606060;margin-top:2px;text-transform:capitalize;letter-spacing:.02em;}

  .section-title{font-family:'Inter',sans-serif;font-size:26px;font-weight:800;color:${T.text};margin-bottom:4px;line-height:1.08;letter-spacing:-.02em;}
  .section-sub{font-size:13px;color:#A0A0A0;margin-bottom:20px;letter-spacing:.01em;}
  .bucket-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:${T.textMute};margin-bottom:8px;margin-left:2px;display:flex;align-items:center;gap:6px;}
  .bucket-label-dot{width:5px;height:5px;border-radius:50%;}

  .card{background:${T.bg2};border-radius:14px;padding:14px;margin-bottom:8px;border:1px solid ${T.border};box-shadow:inset 0 1px 0 rgba(255,255,255,0.025);}

  .urgent-card{background:linear-gradient(135deg,#C13030 0%,#8C1A08 100%);border-radius:16px;padding:16px;margin-bottom:14px;border:1px solid rgba(255,255,255,.08);box-shadow:0 8px 28px rgba(213,92,92,.2);color:white;}
  .urgent-label{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.14em;opacity:.9;margin-bottom:6px;display:flex;align-items:center;gap:6px;}
  .urgent-title{font-family:'Inter',sans-serif;font-size:17px;font-weight:800;line-height:1.25;margin-bottom:4px;letter-spacing:-.01em;}
  .urgent-sub{font-size:12px;opacity:.85;margin-bottom:14px;}
  .urgent-cta{background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.2);color:white;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:600;display:inline-flex;align-items:center;gap:6px;}
  .urgent-cta:active{background:rgba(255,255,255,.25);}

  .live-widget{background:${T.bg2};border-radius:14px;padding:14px;margin-bottom:8px;border:1px solid ${T.borderHi};box-shadow:inset 0 1px 0 rgba(255,255,255,.04);position:relative;overflow:hidden;}
  .live-widget::before{content:"";position:absolute;top:0;left:0;width:3px;height:100%;background:linear-gradient(180deg,#FF6B00,#E8390A);}
  .live-widget.danger::before{background:${T.bad};}
  .live-widget-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}
  .live-widget-title{font-size:14px;font-weight:600;color:${T.text};}
  .live-widget-timer{font-family:'Inter',sans-serif;font-size:20px;font-weight:800;color:${T.text};line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-.02em;}
  .live-widget-sub{font-size:11px;color:${T.textDim};margin-bottom:8px;}

  .check-row{display:flex;align-items:center;gap:12px;padding:10px 14px;background:${T.bg2};border-radius:12px;margin-bottom:6px;border:1px solid ${T.border};box-shadow:inset 0 1px 0 rgba(255,255,255,.025);transition:transform var(--dur-fast),border-color var(--dur-fast);}
  .check-row:active{transform:scale(.99);border-color:${T.borderHi};}
  .check-row-icon{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;}
  .check-row-body{flex:1;min-width:0;}
  .check-row-title{font-size:13px;font-weight:600;color:${T.text};}
  .check-row-progress{font-size:11px;color:${T.textDim};margin-top:2px;display:flex;align-items:center;gap:6px;}
  .check-row-bar{flex:1;height:3px;background:${T.border};border-radius:2px;overflow:hidden;}
  .check-row-fill{height:100%;border-radius:2px;transition:width var(--dur-slow);}
  .check-row-pct{font-size:12px;font-weight:600;color:${T.text};flex-shrink:0;}

  .tiles{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;}
  .tile{position:relative;}
  .tile-dot{position:absolute;top:8px;right:8px;width:10px;height:10px;border-radius:50%;box-shadow:0 0 0 2px ${T.bg2};}
  .tile{background:${T.bg2};border-radius:12px;padding:12px;border:1px solid ${T.border};box-shadow:inset 0 1px 0 rgba(255,255,255,.025);transition:transform var(--dur-fast),border-color var(--dur-fast);}
  .tile:active{transform:scale(.97);border-color:${T.borderHi};}
  .tile-icon{font-size:18px;margin-bottom:6px;color:${T.textDim};}
  .tile-label{font-size:11px;color:${T.textMute};font-weight:500;margin-bottom:2px;text-transform:uppercase;letter-spacing:.04em;}
  .tile-value{font-family:'Inter',sans-serif;font-size:22px;font-weight:800;color:${T.text};line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-.02em;}

  .badge{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:600;line-height:1.4;}
  .b-good{background:${T.goodBg};color:${T.good};}
  .b-bad{background:${T.badBg};color:${T.bad};}
  .b-warn{background:${T.warnBg};color:${T.warn};}
  .b-info{background:${T.infoBg};color:${T.info};}
  .b-mute{background:${T.bg3};color:${T.textDim};}

  .item{display:flex;align-items:center;gap:12px;padding:12px 14px;background:${T.bg2};border-radius:12px;margin-bottom:6px;border:1px solid ${T.border};box-shadow:inset 0 1px 0 rgba(255,255,255,.025);transition:transform var(--dur-fast),border-color var(--dur-fast);}
  .item:active{transform:scale(.99);border-color:${T.borderHi};}
  .item-icon{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;}
  .item-body{flex:1;min-width:0;}
  .item-title{font-size:14px;font-weight:600;color:${T.text};margin-bottom:1px;}
  .item-sub{font-size:12px;color:${T.textDim};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .item-arrow{color:${T.textMute};font-size:18px;flex-shrink:0;}

  .btn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;min-height:50px;padding:13px;border-radius:13px;border:none;font-size:15px;font-weight:700;transition:transform var(--dur-fast),opacity var(--dur-fast),background var(--dur-fast);letter-spacing:.01em;}
  .btn:disabled{opacity:.4;}
  .btn:active{transform:scale(.98);}
  .btn-primary{background:linear-gradient(135deg,#FF6B00 0%,#E8390A 100%);color:white;box-shadow:0 4px 16px rgba(232,57,10,.28),inset 0 1px 0 rgba(255,255,255,.18);}
  .btn-primary:active{background:linear-gradient(135deg,#D45A00 0%,#C02808 100%);}
  .btn-ghost{background:${T.bg2};color:${T.text};border:1px solid ${T.border};}
  .btn-sm{padding:8px 14px;font-size:13px;}
  .fab-anchor{display:contents;}
  .btn-fab{position:fixed;bottom:calc(110px + env(safe-area-inset-bottom));right:14px;width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#FF6B00,#E8390A);color:white;border:none;font-size:24px;box-shadow:0 8px 24px rgba(232,57,10,.5);display:flex;align-items:center;justify-content:center;transition:transform var(--dur-fast);z-index:35;}
  .btn-fab:active{transform:scale(.92);}

  .dial{display:flex;align-items:center;gap:4px;background:${T.bg1};border-radius:11px;padding:3px;border:1px solid ${T.border};}
  .dial-arrow{width:38px;height:40px;flex-shrink:0;border-radius:8px;border:none;background:transparent;color:${T.textDim};font-size:17px;font-weight:600;display:flex;align-items:center;justify-content:center;}
  .dial-arrow:active{background:${T.bg2};}
  .dial-vals{display:flex;flex:1;gap:3px;}
  .dial-val{flex:1;height:40px;border-radius:8px;border:none;background:transparent;color:${T.textDim};font-size:14px;font-weight:600;display:flex;align-items:center;justify-content:center;transition:all var(--dur-fast);}
  .dial-val.sel{background:${T.text};color:${T.bg0};font-weight:700;}
  .dial-val.sel.good{background:${T.good};color:${T.bg0};}
  .dial-val.sel.warn{background:${T.warn};color:${T.bg0};}
  .dial-val.sel.bad{background:${T.bad};color:${T.bg0};}

  .binary{display:grid;grid-template-columns:1fr 1fr;gap:6px;}
  .binary-btn{height:46px;border-radius:10px;border:1.5px solid ${T.border};background:${T.bg2};color:${T.textDim};font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:6px;transition:all var(--dur-fast);}
  .binary-btn:active{transform:scale(.97);}
  .binary-btn.sel.good{background:${T.goodBg};border-color:${T.good};color:${T.good};}
  .binary-btn.sel.bad{background:${T.badBg};border-color:${T.bad};color:${T.bad};}
  .binary-btn.sel.neutral{background:${T.bg3};border-color:${T.text};color:${T.text};}

  .seg{display:flex;background:${T.bg1};border-radius:10px;padding:3px;border:1px solid ${T.border};}
  .seg-btn{flex:1;height:32px;border:none;background:transparent;border-radius:7px;color:${T.textDim};font-size:12px;font-weight:600;transition:all var(--dur-fast);}
  .seg-btn.sel{background:#2D1208;color:#FF6B00;}

  .chips{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;}
  .chips::-webkit-scrollbar{display:none;}
  .chip{flex-shrink:0;padding:7px 14px;border-radius:999px;background:${T.bg2};color:${T.textDim};border:1px solid ${T.border};font-size:13px;font-weight:600;white-space:nowrap;transition:all var(--dur-fast);}
  .chip.sel{background:#2D1208;color:#FF6B00;border-color:#5A2810;}
  .dial.swipeable::after{content:"Glisser pour faire défiler";display:block;position:absolute;left:50%;transform:translateX(-50%);bottom:-17px;font-size:10px;color:${T.textMute};white-space:nowrap;}
  .dial{position:relative;}

  .field{margin-bottom:14px;}
  .label{display:block;font-size:11px;font-weight:700;color:${T.textDim};margin-bottom:6px;text-transform:uppercase;letter-spacing:.07em;}
  .input{width:100%;padding:12px 14px;border:1px solid ${T.border};border-radius:10px;font-size:16px;font-family:inherit;outline:none;background:${T.bg2};color:${T.text};transition:border-color .15s,box-shadow .15s;}
  .input:focus{border-color:#E8390A;box-shadow:0 0 0 2px rgba(232,57,10,.12);}
  .sheet .input,.sheet button,.sheet select,.sheet textarea{scroll-margin-bottom:180px;}
  .input option{background:${T.bg1};}
  .input-sm{padding:9px 12px;font-size:16px;}

  @keyframes overlayIn{from{opacity:0;}to{opacity:1;}}
  @keyframes sheetIn{from{transform:translateY(100%);}to{transform:translateY(0);}}
  .overlay{position:fixed;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);z-index:100000;display:flex;align-items:flex-end;justify-content:center;animation:overlayIn 200ms ease-out;isolation:isolate;}
  .sheet{position:relative;z-index:100001;background:${T.bg1};width:100%;max-width:480px;border-radius:24px 24px 0 0;padding:20px 18px calc(34px + env(safe-area-inset-bottom));max-height:min(86dvh,calc(100dvh - 84px));overflow-y:auto;-webkit-overflow-scrolling:touch;animation:sheetIn 300ms cubic-bezier(0.32,0.72,0,1);border-top:1px solid ${T.borderHi};box-shadow:0 -20px 60px rgba(0,0,0,.5);}
  .sheet-handle{width:42px;height:5px;background:${T.textMute};border-radius:999px;margin:0 auto 16px;opacity:.75;}
  .sheet{touch-action:pan-y;}
  .dial.swipeable{touch-action:pan-y;}
  .sheet-title{font-family:'Inter',sans-serif;font-size:20px;font-weight:800;margin-bottom:16px;color:${T.text};}

  .temp-slot{flex:1;min-height:62px;border-radius:11px;border:1.5px solid ${T.border};background:${T.bg1};display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px;transition:all var(--dur-fast);}
  .temp-slot:active{transform:scale(.98);}
  .temp-slot.good{border-color:${T.good};background:${T.goodBg};}
  .temp-slot.warn{border-color:${T.warn};background:${T.warnBg};}
  .temp-slot.bad{border-color:${T.bad};background:${T.badBg};}
  .temp-slot.empty{border-style:dashed;}
  .temp-slot-period{font-size:10px;font-weight:700;color:${T.textDim};text-transform:uppercase;letter-spacing:.08em;margin-bottom:2px;}
  .temp-slot-val{font-family:'Inter',sans-serif;font-size:26px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-.03em;}
  .temp-slot-meta{font-size:10px;color:${T.textDim};margin-top:2px;}
  .temp-slot-cta{font-size:13px;font-weight:600;color:${T.text};}

  .banner{padding:10px 12px;border-radius:10px;margin-bottom:12px;display:flex;align-items:flex-start;gap:8px;font-size:12px;line-height:1.5;}
  .banner-warn{background:${T.warnBg};color:${T.warn};}
  .banner-bad{background:${T.badBg};color:${T.bad};}
  .banner-good{background:${T.goodBg};color:${T.good};}
  .banner-info{background:${T.infoBg};color:${T.info};}
  .banner b{font-weight:700;color:${T.text};}

  .timer-display{font-family:'Inter',sans-serif;font-size:54px;font-weight:800;text-align:center;letter-spacing:-.04em;line-height:1;margin:14px 0;font-variant-numeric:tabular-nums;}
  .step-num{width:24px;height:24px;border-radius:50%;background:${T.accent};color:white;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;}
  .check{width:28px;height:28px;border-radius:50%;border:2px solid ${T.border};display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all var(--dur-fast);color:transparent;font-size:14px;}
  .check.on{background:${T.good};border-color:${T.good};color:white;animation:checkPop .28s cubic-bezier(.34,1.56,.64,1);}
  @keyframes checkPop{0%{transform:scale(.7);}55%{transform:scale(1.15);}100%{transform:scale(1);}}
  .scan{border:1.5px dashed ${T.accent};border-radius:14px;padding:24px 18px;text-align:center;background:${T.accentLt};margin-bottom:14px;}
  .scan-icon{font-size:34px;margin-bottom:6px;}
  .scan-title{font-size:15px;font-weight:700;color:${T.text};margin-bottom:3px;}
  .scan-sub{font-size:12px;color:${T.textDim};}

  .login-screen{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;min-height:100vh;min-height:100dvh;padding:calc(32px + env(safe-area-inset-top)) 20px calc(32px + env(safe-area-inset-bottom));background:${T.bg0};width:100%;max-width:480px;margin:0 auto;overflow-y:auto;-webkit-overflow-scrolling:touch;}
  .login-logo{font-family:'Inter',sans-serif;font-size:44px;font-weight:900;letter-spacing:.28em;text-transform:uppercase;margin-bottom:6px;text-align:center;width:100%;}
  .login-logo .flame{background:linear-gradient(135deg,#FF6B00 0%,#E8390A 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;color:transparent;}
  .login-tagline{font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:${T.textDim};margin-bottom:44px;text-align:center;width:100%;}
  .login-body{width:100%;max-width:340px;}
  .login-prompt{font-size:13px;color:${T.textDim};margin-bottom:14px;text-align:center;}
  .role-btn{width:100%;padding:16px;border-radius:12px;border:1px solid ${T.border};background:${T.bg2};color:${T.text};text-align:left;transition:border-color var(--dur-fast);margin-bottom:8px;}
  .role-btn:active{border-color:${T.accent};}
  .role-btn-name{font-size:16px;font-weight:600;margin-bottom:1px;}
  .role-btn-sub{font-size:11px;color:${T.textDim};}
  .role-badge{display:inline-block;padding:2px 7px;border-radius:4px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-left:6px;}
  .rb-admin{background:linear-gradient(135deg,#FF6B00,#E8390A);color:white;}
  .rb-staff{background:${T.bg3};color:${T.textDim};}

  .profile-avatar{width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#FF6B00,#E8390A);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:white;margin:0 auto 10px;}
  .profile-name{font-family:'Inter',sans-serif;font-size:20px;font-weight:700;text-align:center;margin-bottom:3px;}
  .profile-role{font-size:12px;color:${T.textDim};text-align:center;margin-bottom:18px;}

  .tabs{display:flex;gap:6px;margin-bottom:14px;overflow-x:auto;padding-bottom:2px;}
  .tabs::-webkit-scrollbar{display:none;}
  .tab{padding:8px 14px;border-radius:999px;background:${T.bg2};color:${T.textDim};border:1px solid ${T.border};font-size:12px;font-weight:600;white-space:nowrap;flex-shrink:0;}
  .tab.active{background:#2D1208;color:#FF6B00;border-color:#5A2810;}

  .mult-row{display:flex;align-items:center;gap:10px;background:${T.bg1};border-radius:12px;padding:10px;margin-bottom:12px;border:1px solid ${T.border};}
  .mult-label{font-size:11px;color:${T.textDim};font-weight:600;text-transform:uppercase;letter-spacing:.06em;flex-shrink:0;}
  .mult-btn{width:36px;height:36px;border-radius:9px;background:${T.bg2};border:1px solid ${T.border};color:${T.text};font-size:18px;font-weight:600;flex-shrink:0;}
  .mult-val{flex:1;text-align:center;font-family:'Inter',sans-serif;font-size:22px;font-weight:800;color:${T.text};font-variant-numeric:tabular-nums;letter-spacing:-.02em;}

  .row{display:flex;align-items:center;}
  .between{display:flex;align-items:center;justify-content:space-between;}
  .gap6{gap:6px;}.gap8{gap:8px;}.gap10{gap:10px;}.gap12{gap:12px;}
  .mt4{margin-top:4px;}.mt6{margin-top:6px;}.mt8{margin-top:8px;}.mt12{margin-top:12px;}.mt14{margin-top:14px;}
  .mb4{margin-bottom:4px;}.mb6{margin-bottom:6px;}.mb8{margin-bottom:8px;}.mb10{margin-bottom:10px;}.mb12{margin-bottom:12px;}.mb14{margin-bottom:14px;}
  .text-sm{font-size:12px;}.text-xs{font-size:11px;}.text-dim{color:${T.textDim};}.text-mute{color:${T.textMute};}
  .fw6{font-weight:600;}.fw7{font-weight:700;}.center{text-align:center;}
  .group-label{font-size:11px;font-weight:800;color:${T.textMute};text-transform:uppercase;letter-spacing:.12em;margin:4px 2px 8px;}
  /* Section repliable — esprit réglages iOS : en-tête cliquable, chevron qui
     pivote, contenu qui se déploie en douceur. */
  .collapse-head{display:flex;align-items:center;justify-content:space-between;width:100%;padding:13px 14px;background:${T.bg2};border:1px solid ${T.border};border-radius:12px;cursor:pointer;transition:background var(--dur-fast) var(--ease-out);}
  .collapse-head:active{background:${T.bg3};transform:scale(.995);}
  .collapse-head-left{display:flex;align-items:center;gap:10px;min-width:0;}
  .collapse-title{font-size:14px;font-weight:700;color:${T.text};}
  .collapse-count{font-size:11px;font-weight:700;color:${T.textMute};background:${T.bg3};padding:2px 7px;border-radius:20px;flex-shrink:0;}
  .collapse-chevron{color:${T.textDim};font-size:13px;transition:transform var(--dur-base) var(--ease-out);flex-shrink:0;}
  .collapse-chevron.open{transform:rotate(90deg);}
  .collapse-body{overflow:hidden;animation:collapseIn var(--dur-base) var(--ease-out);}
  @keyframes collapseIn{from{opacity:0;transform:translateY(-6px);}to{opacity:1;transform:translateY(0);}}
  .empty{text-align:center;padding:36px 18px;background:${T.bg2};border-radius:14px;border:1px solid ${T.border};}
  .empty-icon{font-size:38px;margin-bottom:10px;opacity:.6;}
  .empty-title{font-size:16px;font-weight:700;color:${T.text};margin-bottom:4px;}
  .empty-sub{font-size:13px;color:${T.textDim};}
  .pbar{height:5px;background:${T.border};border-radius:3px;overflow:hidden;}
  .pfill{height:100%;border-radius:3px;transition:width var(--dur-slow);}
`;

// ─── HOOKS & MICRO-UX ────────────────────────────────────────────────────────

function useLongPress(onLongPress, ms=550){
  const [pressing,setPressing]=useState(false);
  const timerRef=useRef(null);
  const firedRef=useRef(false);
  const movedRef=useRef(false);
  const startPos=useRef({x:0,y:0});
  const start=(e)=>{
    firedRef.current=false; movedRef.current=false; setPressing(true);
    const pt = e.touches ? e.touches[0] : e;
    startPos.current = { x: pt.clientX, y: pt.clientY };
    timerRef.current=setTimeout(()=>{ if(!movedRef.current){ firedRef.current=true; setPressing(false); onLongPress(); } }, ms);
  };
  const move=(e)=>{
    const pt = e.touches ? e.touches[0] : e;
    const dx=Math.abs(pt.clientX-startPos.current.x), dy=Math.abs(pt.clientY-startPos.current.y);
    // Un léger tremblement de doigt ne doit pas annuler ; seul un vrai glissement (scroll) annule
    if(dx>10||dy>10){ movedRef.current=true; cancel(); }
  };
  const cancel=()=>{ setPressing(false); if(timerRef.current){ clearTimeout(timerRef.current); timerRef.current=null; } };
  return {
    pressing,
    handlers:{
      onTouchStart:start, onTouchEnd:cancel, onTouchMove:move, onTouchCancel:cancel,
      onMouseDown:start, onMouseUp:cancel, onMouseLeave:cancel, onMouseMove:move,
    },
    didFire:()=>firedRef.current,
  };
}

function useSaveToast(){
  const [show,setShow]=useState(false);
  const ping=()=>{haptic.light();setShow(true);setTimeout(()=>setShow(false),1400);};
  const node = show ? <div className="save-toast">✓ Enregistré</div> : null;
  return {ping,node};
}

function TapDial({value,onChange,center,step=1,colorFn,format=(v)=>`${v}°`}){
  const [offset,setOffset]=useState(0);
  const startX=useRef(null);
  const startY=useRef(null);
  const moved=useRef(false);
  const shift=(dir)=>{haptic.light();setOffset(o=>o+(dir*step));};
  const start=(e)=>{const t=e.touches?e.touches[0]:e;startX.current=t.clientX;startY.current=t.clientY;moved.current=false;};
  const move=(e)=>{
    if(startX.current===null)return;
    const t=e.touches?e.touches[0]:e;
    const dx=t.clientX-startX.current, dy=t.clientY-startY.current;
    if(Math.abs(dx)>18 && Math.abs(dx)>Math.abs(dy)*1.15){moved.current=true;e.preventDefault?.();}
  };
  const end=(e)=>{
    if(startX.current===null)return;
    const t=e.changedTouches?e.changedTouches[0]:e;
    const dx=t.clientX-startX.current, dy=t.clientY-startY.current;
    startX.current=startY.current=null;
    if(Math.abs(dx)>46 && Math.abs(dx)>Math.abs(dy)*1.2){
      // swipe gauche = valeurs plus hautes, swipe droite = valeurs plus basses
      shift(dx<0?1:-1);
    }
  };
  const vals=[center-2*step+offset,center-step+offset,center+offset,center+step+offset,center+2*step+offset];
  return(<div className="dial swipeable" onTouchStart={start} onTouchMove={move} onTouchEnd={end} onMouseDown={start} onMouseMove={move} onMouseUp={end}>
    <button className="dial-arrow" onClick={()=>shift(-1)}>‹</button>
    <div className="dial-vals">{vals.map((v,i)=>{const cls=colorFn?colorFn(v):"";return(<button key={i} className={`dial-val ${value===v?"sel":""} ${value===v?cls:""}`} onClick={()=>{haptic.light();onChange(v);}}>{format(v)}</button>);})}</div>
    <button className="dial-arrow" onClick={()=>shift(1)}>›</button>
  </div>);
}

function GlobalSheetSwipe(){
  useEffect(()=>{
    let sx=0, sy=0, sheet=null, dragging=false;
    const onStart=(e)=>{
      const t=e.touches?.[0]; if(!t)return;
      const found=e.target.closest?.('.sheet'); if(!found)return;
      // Certaines fenêtres (ex. un chrono de cellule en cours) ne doivent
      // jamais pouvoir être balayées pour se fermer : le geste ferait
      // disparaître la fenêtre visuellement (manipulation directe du style,
      // hors de React) sans jamais réellement fermer l'état React derrière —
      // ce qui laissait un écran vide et figé, sans plus rien de cliquable.
      if(found.dataset.swipeLock==='true') return;
      // Si le contenu n'est pas déjà tout en haut, glisser vers le bas sert à
      // faire défiler vers le haut, pas à fermer — sinon les deux gestes se
      // ressemblent et l'un déclenche l'autre par erreur. On ne capture le
      // geste de fermeture que si on est déjà au sommet du contenu (même
      // règle que les fenêtres natives iOS).
      if(found.scrollTop>0) return;
      sheet=found;
      sx=t.clientX; sy=t.clientY; dragging=true;
      sheet.style.transition='none';
    };
    const onMove=(e)=>{
      if(!dragging||!sheet)return;
      const t=e.touches?.[0]; if(!t)return;
      const dx=t.clientX-sx, dy=t.clientY-sy;
      if(dy>0 && Math.abs(dy)>Math.abs(dx)*1.15){
        sheet.style.transform=`translateY(${Math.min(dy,220)}px)`;
        sheet.style.opacity=String(Math.max(.82,1-dy/500));
      }
    };
    const onEnd=(e)=>{
      if(!dragging||!sheet)return;
      const t=e.changedTouches?.[0];
      const dy=t?t.clientY-sy:0, dx=t?t.clientX-sx:0;
      const targetSheet=sheet; dragging=false; sheet=null;
      if(dy>92 && Math.abs(dy)>Math.abs(dx)*1.1){
        haptic.light();
        targetSheet.style.transition='transform .18s ease, opacity .18s ease';
        targetSheet.style.transform='translateY(110%)';
        targetSheet.style.opacity='0';
        setTimeout(()=>targetSheet.closest?.('.overlay')?.click(),90);
      }else{
        targetSheet.style.transition='transform .22s cubic-bezier(.22,1,.36,1), opacity .22s';
        targetSheet.style.transform='';
        targetSheet.style.opacity='';
      }
    };
    document.addEventListener('touchstart',onStart,{passive:true});
    document.addEventListener('touchmove',onMove,{passive:true});
    document.addEventListener('touchend',onEnd,{passive:true});
    document.addEventListener('touchcancel',onEnd,{passive:true});
    return()=>{document.removeEventListener('touchstart',onStart);document.removeEventListener('touchmove',onMove);document.removeEventListener('touchend',onEnd);document.removeEventListener('touchcancel',onEnd);};
  },[]);
  return null;
}
function BinaryChoice({value,onChange,options}){return(<div className="binary">{options.map(o=><button key={o.value} className={`binary-btn ${value===o.value?"sel":""} ${o.style||"neutral"}`} onClick={()=>{haptic.light();onChange(o.value);}}>{o.icon&&<span>{o.icon}</span>} {o.label}</button>)}</div>);}
function SegmentedControl({value,onChange,options}){return(<div className="seg">{options.map(o=><button key={o.value} className={`seg-btn ${value===o.value?"sel":""}`} onClick={()=>{haptic.light();onChange(o.value);}}>{o.label}</button>)}</div>);}
function QuickPick({value,onChange,options}){return(<div className="chips">{options.map(o=><button key={o.value} className={`chip ${value===o.value?"sel":""}`} onClick={()=>{haptic.light();onChange(o.value);}}>{o.label}</button>)}</div>);}

const INIT={
  restaurant:{name:"Ô Grain de Sable",address:"123 Boulevard de la Mer, 34000 Montpellier",phone:"04 67 00 00 00",siret:"123 456 789 00012"},
  users:[
    {id:1,name:"Lucas Martin",initials:"LM",role:"Chef de cuisine",pin:"1234",isAdmin:true,color:"#B8503F"},
    {id:2,name:"Marie Dubois",initials:"MD",role:"Chef de partie",pin:"5678",isAdmin:true,color:"#A05030"},
    {id:3,name:"Théo Blanc",initials:"TB",role:"Commis",pin:"9999",isAdmin:false,color:"#6B6862"},
    {id:4,name:"Sarah Petit",initials:"SP",role:"Plonge",pin:"1111",isAdmin:false,color:"#6B6862"},
    {id:5,name:"Alex Torres",initials:"AT",role:"Service",pin:"2222",isAdmin:false,color:"#6B6862"},
  ],
  haccpSettings:{
    fridgeTargets:[
      {id:1,name:"Frigo Entrées",icon:"🥗",target:"0–4",type:"positif"},
      {id:2,name:"Frigo Viandes",icon:"🥩",target:"0–4",type:"positif"},
      {id:3,name:"Frigo Poissons",icon:"🐟",target:"0–2",type:"positif"},
      {id:4,name:"Congélateur",icon:"❄️",target:"-18",type:"negatif"},
      {id:5,name:"Vitrine Desserts",icon:"🍰",target:"0–4",type:"positif"},
    ],
    coolingMax:120,reheatMin:63,reheatMaxTime:60,oilPolarMax:25,testMealDays:3,labelDlcDefault:3,
    resetMidi:990, resetSoir:180, // 16h30 et 03h00
  },
  fridgeReleves:[
    {id:1,fridgeId:1,date:"10/05",period:"matin",temp:3,time:"08:15",operatorId:1},
    {id:2,fridgeId:1,date:"10/05",period:"soir",temp:4,time:"22:30",operatorId:1},
    {id:3,fridgeId:2,date:"10/05",period:"matin",temp:7,time:"08:16",operatorId:1},
    {id:4,fridgeId:3,date:"10/05",period:"matin",temp:2,time:"08:18",operatorId:1},
    {id:5,fridgeId:4,date:"10/05",period:"matin",temp:-18,time:"08:20",operatorId:1},
    {id:6,fridgeId:5,date:"10/05",period:"matin",temp:4,time:"08:22",operatorId:1},
  ],
  reception:[
    {id:1,date:"10/05",supplier:"Marée Pêche Bretagne",product:"Saumon frais",qty:"5 kg",temp:2,tempOk:true,dlc:"13/05",lot:"SP2605A",aspect:"OK",emballage:"OK",signed:"Lucas Martin"},
    {id:2,date:"10/05",supplier:"Boucherie Dupont",product:"Bœuf Angus",qty:"8 kg",temp:3,tempOk:true,dlc:"15/05",lot:"BA0510",aspect:"OK",emballage:"OK",signed:"Lucas Martin"},
  ],
  cooling:[
    {id:99,product:"Ratatouille",qty:"5 kg",startTemp:65,startedMs:Date.now()-47*60*1000,status:"active",operator:"Marie Dubois",date:"10/05"},
    {id:1,product:"Velouté butternut",qty:"3 L",startTemp:68,endTemp:9,duration:80,operator:"Lucas Martin",status:"ok",date:"10/05",dlc:"13/05"},
    {id:2,product:"Lasagnes maison",qty:"4 kg",startTemp:70,endTemp:12,duration:155,operator:"Théo Blanc",status:"alert",date:"09/05",dlc:"12/05"},
  ],
  reheating:[{id:1,product:"Soupe à l'oignon",endTemp:75,duration:30,operator:"Lucas Martin",status:"ok",date:"10/05"}],
  oils:[
    {id:1,name:"Friteuse 1 — Frites",type:"Tournesol",dateInstall:"05/05",lastTest:"10/05",polaires:18,operator:"Théo Blanc"},
    {id:2,name:"Friteuse 2 — Poisson",type:"Arachide",dateInstall:"03/05",lastTest:"10/05",polaires:23,operator:"Théo Blanc"},
  ],
  cleaning:[
    {id:1,zone:"Cuisine chaude",icon:"🔥",freq:"Quotidien",produit:"Dégraissant Pro",dilution:"1:10",done:true},
    {id:2,zone:"Plan de travail froid",icon:"❄️",freq:"Quotidien",produit:"Désinfectant alim.",dilution:"1:50",done:true},
    {id:3,zone:"Sol cuisine",icon:"🧹",freq:"Quotidien",produit:"Détergent sol",dilution:"1:20",done:false},
    {id:4,zone:"Chambre froide",icon:"🥶",freq:"Hebdomadaire",produit:"Désinfectant Pro",dilution:"1:30",done:true},
    {id:5,zone:"Hotte et Filtres",icon:"💨",freq:"Mensuel",produit:"Dégraissant puissant",dilution:"Pur",done:false},
    {id:6,zone:"Salle et Tables",icon:"🪑",freq:"Quotidien",produit:"Désinfectant surface",dilution:"1:100",done:true},
    {id:7,zone:"Trancheuse",icon:"🔪",freq:"Après usage",produit:"Désinfectant alim.",dilution:"1:50",done:true},
    {id:8,zone:"Friteuse",icon:"🍟",freq:"Hebdomadaire",produit:"Dégraissant friteuse",dilution:"Pur",done:false},
  ],
  cleaningChecks:[],
  shoppingList:[],
  traceability:[
    {id:1,product:"Saumon Gravlax",emoji:"🐟",supplier:"Marée Pêche Bretagne",lot:"SP2605A",dlc:"13/05",qty:"2 kg",allergenes:["Poisson"],status:"ok"},
    {id:2,product:"Bœuf Angus",emoji:"🥩",supplier:"Boucherie Dupont",lot:"BA0510",dlc:"15/05",qty:"5 kg",allergenes:[],status:"ok"},
    {id:3,product:"Huîtres Tamaris",emoji:"🦪",supplier:"Huîtres Tamaris",lot:"HT4421",dlc:"11/05",qty:"12 dz",allergenes:["Mollusques"],status:"warn"},
    {id:4,product:"Burrata",emoji:"🧀",supplier:"Fromager Italien",lot:"BU990",dlc:"09/05",qty:"800 g",allergenes:["Lait"],status:"expired"},
  ],
  labels:[{id:1,product:"Ratatouille maison",dateProd:"10/05",dlc:"13/05",lot:"L260510-1",allergens:"Aucun",operator:"Marie Dubois"}],
  training:[
    {id:1,name:"Lucas Martin",role:"Chef de cuisine",haccpExp:"15/03/2027",visaExp:"02/01/2027"},
    {id:2,name:"Marie Dubois",role:"Chef de partie",haccpExp:"20/01/2027",visaExp:"05/02/2027"},
    {id:3,name:"Théo Blanc",role:"Commis",haccpExp:"10/04/2026",visaExp:"15/04/2026"},
  ],
  pests:[{id:1,date:"01/05",type:"Visite contrat",company:"Hygiène 3D Pro",result:"RAS",nextVisit:"01/06"}],
  // Bibliothèque de matières premières : prix d'achat par unité, réutilisée dans toutes les fiches techniques.
  products:[
    {id:1,name:"Citron vert",price:3.20,unit:"kg"},
    {id:2,name:"Lait de coco",price:2.10,unit:"L"},
    {id:3,name:"Gingembre",price:6.00,unit:"kg"},
    {id:4,name:"Coriandre",price:12.00,unit:"kg"},
  ],
  recipes:[
    {id:1,name:"Leche de Tigre",emoji:"🌶️",type:"mere",category:"Bases",yield:{qty:1000,unit:"ml"},
     components:[{kind:"ingredient",item:"Citron vert",qty:300,unit:"ml",cost:1.50},{kind:"ingredient",item:"Lait de coco",qty:400,unit:"ml",cost:1.40},{kind:"ingredient",item:"Gingembre",qty:50,unit:"g",cost:0.30},{kind:"ingredient",item:"Coriandre",qty:30,unit:"g",cost:0.36},{kind:"ingredient",item:"Sel, sucre, ail",qty:1,unit:"u",cost:0.20}],
     steps:["Mixer le gingembre avec le citron","Ajouter le lait de coco","Filtrer","Réserver au froid 24h max"],allergens:["Lait"]},
    {id:2,name:"Ceviche Daurade",emoji:"🐟",type:"plat",category:"Côté Mer",price:24,portions:1,
     components:[{kind:"ingredient",item:"Daurade filet",qty:180,unit:"g",cost:3.24},{kind:"subrecipe",subrecipeId:1,qty:80,unit:"ml"},{kind:"ingredient",item:"Maïs",qty:40,unit:"g",cost:0.08},{kind:"ingredient",item:"Patate douce",qty:80,unit:"g",cost:0.14},{kind:"ingredient",item:"Mesclun",qty:30,unit:"g",cost:0.24}],
     steps:["Tailler la daurade en brunoise","Verser le leche de tigre","Mariner 8 min","Dresser"],allergens:["Poisson"]},
    {id:3,name:"Burger Grain de Sable",emoji:"🍔",type:"plat",category:"Côté Terre",price:21,portions:1,
     components:[{kind:"ingredient",item:"Bun brioche",qty:1,unit:"pce",cost:0.85},{kind:"ingredient",item:"Steak haché",qty:150,unit:"g",cost:2.10},{kind:"ingredient",item:"Cheddar maturé",qty:30,unit:"g",cost:0.48},{kind:"ingredient",item:"Oignons frits",qty:20,unit:"g",cost:0.16},{kind:"ingredient",item:"Pickles",qty:15,unit:"g",cost:0.08},{kind:"ingredient",item:"Frites maison",qty:180,unit:"g",cost:0.22},{kind:"ingredient",item:"Sauce burger",qty:20,unit:"ml",cost:0.08},{kind:"ingredient",item:"Mesclun",qty:20,unit:"g",cost:0.16}],
     steps:["Cuire le steak","Toaster le bun","Fondre le cheddar","Assembler"],allergens:["Gluten","Lait","Œuf"]},
  ],
  planning:{
    "Lun":{1:["Midi","Soir"],2:["Continu"],3:["Midi"],5:["Midi","Soir"]},
    "Mar":{1:["Midi","Soir"],2:["Soir"],4:["Continu"],5:["Midi","Soir"]},
    "Mer":{1:["Midi","Soir"],2:["Continu"],3:["Midi","Soir"],5:["Soir"]},
    "Jeu":{1:["Midi","Soir"],3:["Midi"],4:["Continu"],5:["Midi","Soir"]},
    "Ven":{1:["Midi","Soir"],2:["Midi","Soir"],5:["Midi","Soir"]},
    "Sam":{2:["Midi","Soir"],3:["Midi","Soir"],4:["Continu"],5:["Midi","Soir"]},
    "Dim":{1:["Midi","Soir"],2:["Midi"],3:["Soir"],5:["Midi","Soir"]},
  },
  taskCategories:[
    {id:1,name:"Mise en place froid",icon:"❄️",color:"#5A8FB5"},
    {id:2,name:"Mise en place chaud",icon:"🔥",color:"#D49340"},
    {id:3,name:"Pâtisserie",icon:"🍰",color:"#C97FA8"},
    {id:4,name:"Boulangerie",icon:"🥖",color:"#C9A862"},
  ],
  tasks:[
    {id:1,categoryId:1,task:"Couper légumes poke bowls",resp:"Théo Blanc",qty:"3 kg",done:false,prio:"high"},
    {id:2,categoryId:1,task:"Préparer leche de tigre",resp:"Marie Dubois",qty:"1 L",done:true,prio:"high"},
    {id:3,categoryId:1,task:"Crème de balsamique",resp:"Théo Blanc",qty:"500 ml",done:false,prio:"med"},
    {id:4,categoryId:1,task:"Portionner les saumons",resp:"Marie Dubois",qty:"x8",done:true,prio:"high"},
    {id:5,categoryId:2,task:"Frites maison",resp:"Théo Blanc",qty:"5 kg",done:false,prio:"med"},
    {id:6,categoryId:2,task:"Sauce bolognaise",resp:"Marie Dubois",qty:"3 L",done:false,prio:"high"},
    {id:7,categoryId:3,task:"Verrine yuzu",resp:"Marie Dubois",qty:"x10",done:false,prio:"low"},
    {id:8,categoryId:3,task:"Crème pâtissière",resp:"Marie Dubois",qty:"2 L",done:true,prio:"med"},
  ],
};

// Système haptique sémantique — une grammaire unique et cohérente, à la Apple :
// tap léger pour une sélection, medium pour une validation, motif distinct pour
// une erreur. Reste appelable comme haptic(ms) pour compatibilité.
const haptic=(ms=12)=>{try{if(navigator.vibrate)navigator.vibrate(ms);}catch{}};
haptic.light=()=>haptic(8);      // sélection, tap sur un élément
haptic.medium=()=>haptic(15);    // validation d'une action
haptic.success=()=>haptic(25);   // succès (enregistrement, clôture)
haptic.error=()=>{try{if(navigator.vibrate)navigator.vibrate([30,40,30]);}catch{}}; // motif d'erreur distinct
// Même principe que serviceISODate, mais au format "JJ/MM" (todayStr()) —
// c'est celui qu'utilisent les relevés de température, pas le format ISO.
// Sans ça, un relevé du soir pris juste avant minuit redevenait "d'hier" à
// minuit pile, faisant croire que le frigo n'avait pas été contrôlé alors
// que le service du soir n'était pas terminé.
function serviceDateStr(resetSoir){
  const RESET_SOIR = Math.min(resetSoir ?? (3*60), 9*60);
  const n=new Date(); const mins=n.getHours()*60+n.getMinutes();
  const d=new Date(n);
  if(mins<RESET_SOIR) d.setDate(d.getDate()-1);
  return d.toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit"});
}

const todayStr=()=>new Date().toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit"});
const nowTime=()=>new Date().toTimeString().slice(0,5);
const fmtDateTime=(iso)=>{if(!iso)return "";try{return new Date(iso).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});}catch{return "";}};
const DAYS=["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];

function tempStatus(v,target){if(target==="-18")return v<=-15?"good":v>-12?"bad":"warn";const[lo,hi]=target.split("–").map(Number);return v>=lo&&v<=hi?"good":v>hi+2?"bad":"warn";}
function tempCenter(target){if(target==="-18")return -18;const[lo,hi]=target.split("–").map(Number);return Math.round((lo+hi)/2);}
// date par défaut = date de service (voir serviceDateStr), pas la date
// calendaire brute — sinon un relevé du soir pris juste avant minuit
// semblait "manquant" dès minuit passé, alors que le service n'était pas
// terminé. data contient déjà haccpSettings.resetSoir : aucun appelant n'a
// besoin d'être modifié pour bénéficier de la correction.
function getReleve(data,fridgeId,period,date){return data.fridgeReleves.find(r=>r.fridgeId===fridgeId&&r.period===period&&r.date===(date||serviceDateStr(data?.haccpSettings?.resetSoir)));}
const clamp=(n,min=0,max=100)=>Math.max(min,Math.min(max,Number.isFinite(n)?n:min));
const safePct=(done,total)=>total>0?clamp((done/total)*100):0;
const safeNum=(v,fallback=0)=>{const n=Number(v);return Number.isFinite(n)?n:fallback;};
// Convertit une quantité (qty, unit) vers l'unité d'achat du produit (kg, L, pce) pour calculer le coût.
// ex: 300 g d'un produit acheté au kg → 0.3 kg × prix/kg
const UNIT_TO_BASE = { g:{base:"kg",factor:0.001}, kg:{base:"kg",factor:1}, ml:{base:"L",factor:0.001}, L:{base:"L",factor:1}, pce:{base:"pce",factor:1}, u:{base:"pce",factor:1} };
function computeIngredientCost(qty, unit, product){
  if(!product || !qty) return 0;
  const conv = UNIT_TO_BASE[unit] || {base:unit,factor:1};
  if(conv.base !== product.unit) return null; // unités incompatibles (ex: g vs pièce) → coût non calculable automatiquement
  return qty * conv.factor * product.price;
}
function recipeTotalCost(recipe,allRecipes){return recipe.components.reduce((sum,c)=>{if(c.kind==="ingredient")return sum+(c.cost||0);if(c.kind==="subrecipe"){const sub=allRecipes.find(r=>r.id===c.subrecipeId);if(!sub)return sum;const subTotalCost=recipeTotalCost(sub,allRecipes);const subYield=sub.yield?sub.yield.qty:1;return sum+(subTotalCost*(c.qty/subYield));}return sum;},0);}
function recipeCostPerPortion(recipe,allRecipes){const total=recipeTotalCost(recipe,allRecipes);if(recipe.type==="plat")return total/Math.max(1,safeNum(recipe.portions,1));return recipe.yield?total/Math.max(1,safeNum(recipe.yield.qty,1)):total;}
function recipeMargin(recipe,allRecipes){if(recipe.type!=="plat")return null;const price=safeNum(recipe.price,0);if(price<=0)return 0;const cost=recipeCostPerPortion(recipe,allRecipes);return Math.round(((price-cost)/price)*100);}
function recipeAllergens(recipe,allRecipes){const set=new Set(recipe.allergens||[]);recipe.components.forEach(c=>{if(c.kind==="subrecipe"){const sub=allRecipes.find(r=>r.id===c.subrecipeId);if(sub)recipeAllergens(sub,allRecipes).forEach(a=>set.add(a));}});return[...set];}
function findUsedIn(recipeId,allRecipes){return allRecipes.filter(r=>r.components.some(c=>c.kind==="subrecipe"&&c.subrecipeId===recipeId));}
function getServiceWindow(){const h=new Date().getHours();if(h>=7&&h<11)return{id:"morning",label:"Ouverture",icon:"☀️"};if(h>=11&&h<15)return{id:"lunch",label:"Service midi",icon:"🍽️"};if(h>=15&&h<18)return{id:"prep_pm",label:"Préparation soir",icon:"🔧"};if(h>=18&&h<23)return{id:"dinner",label:"Service soir",icon:"🌙"};return{id:"closing",label:"Clôture",icon:"🌃"};}

// ─── FUEGO LOGO COMPONENTS ────────────────────────────────────────────────────
function FuegoFlame({size=32}) {
  return (
    <svg width={size} height={size*1.2} viewBox="0 0 100 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="flameGrad" x1="50" y1="0" x2="50" y2="120" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FF6B00"/>
          <stop offset="100%" stopColor="#E8230A"/>
        </linearGradient>
      </defs>
      <path fillRule="evenodd" fill="url(#flameGrad)" d="M50 8 C46 26 26 34 26 62 C26 84 38 98 50 104 C62 98 74 84 74 62 C74 46 62 40 58 26 C56 20 52 14 50 8 Z M50 88 C42 84 36 76 36 64 C36 52 46 46 50 38 C54 46 64 52 64 64 C64 76 58 84 50 88 Z"/>
    </svg>
  );
}

// Affiche le vrai logo (fichier /fuego-logo.png dans le dossier public/ du projet Vite).
// Si le fichier est absent (ex: aperçu artifact), retombe sur la flamme SVG.
function FuegoBrand({height=88}){
  const[imgOk,setImgOk]=useState(true);
  if(imgOk) return <img src="/fuego-logo.png" alt="Fuego" style={{height,objectFit:"contain"}} onError={()=>setImgOk(false)}/>;
  return <FuegoFlame size={Math.round(height*0.52)}/>;
}

function FuegoLogo({size="topbar"}) {
  const configs = {
    topbar: {letterSpacing:".2em", fontSize:15, fontWeight:900},
    login:  {letterSpacing:".28em", fontSize:42, fontWeight:900},
    small:  {letterSpacing:".16em", fontSize:12, fontWeight:800},
  };
  const cfg = configs[size]||configs.topbar;
  return (
    <span style={{
      fontFamily:"'Inter',sans-serif",
      fontSize: cfg.fontSize,
      fontWeight: cfg.fontWeight,
      letterSpacing: cfg.letterSpacing,
      textTransform:"uppercase",
      background:"linear-gradient(135deg,#FF6B00 0%,#E8390A 100%)",
      WebkitBackgroundClip:"text",
      WebkitTextFillColor:"transparent",
      backgroundClip:"text",
      color:"transparent",
    }}>FUEGO</span>
  );
}

// ─── ÉCRAN DE CHARGEMENT (splash) ──────────────────────────────────────────
// Affiché ~1.5s au lancement de l'app, le temps que les données Supabase
// arrivent. La flamme "ondule" via une animation SVG légère (pas de lib
// externe), cohérente avec l'identité visuelle FUEGO.
function SplashScreen(){
  return(<div style={{position:"fixed",inset:0,background:"#090909",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}>
    <style>{`
      @keyframes splashPop{
        0%{opacity:0;transform:scale(.4);}
        60%{opacity:1;transform:scale(1.08);}
        80%{transform:scale(.97);}
        100%{opacity:1;transform:scale(1);}
      }
      .splash-logo{height:200px;object-fit:contain;animation:splashPop .8s cubic-bezier(.34,1.56,.64,1) both;filter:drop-shadow(0 6px 30px rgba(255,107,0,.4));}
    `}</style>
    <img className="splash-logo" src="/fuego-logo.png" alt="Fuego"/>
  </div>);
}

function Login({users,onLogin,lang="fr",onChangeLang}){
  const[sel,setSel]=useState(null);const[pin,setPin]=useState("");const[err,setErr]=useState("");const[shake,setShake]=useState(false);
  const selUser=users.find(u=>u.id===sel);
  function tryLogin(){const u=users.find(u=>u.id===sel);if(u&&u.pin===pin){haptic.success();onLogin(u);}else{haptic.error();setErr(t("login_pin_error",lang));setPin("");setShake(true);setTimeout(()=>setShake(false),450);}}
  // Validation automatique dès que le PIN atteint la longueur du code attendu —
  // évite d'avoir à taper "Connexion" en plus sur mobile.
  useEffect(()=>{
    if(selUser && pin.length===selUser.pin.length && pin.length>=4){ tryLogin(); }
  },[pin]);
  return(<div className="login-screen">
    <div className="fade-up" style={{marginBottom:14,display:"flex",justifyContent:"center"}}><FuegoBrand height={104}/></div>
    <div className="login-logo fade-up fade-up-1"><FuegoLogo size="login"/></div>
    <div className="login-tagline fade-up fade-up-2">{t("login_tagline",lang)}</div>
    {/* Choix de langue — appliqué immédiatement, retenu sur cet appareil.
        Volontairement discret : la plupart des membres de l'équipe n'en ont
        pas besoin, seuls ceux qui préfèrent une autre langue le touchent. */}
    {onChangeLang && LANGS.length>1 && (
      <div className="row gap8 fade-up fade-up-2" style={{justifyContent:"center",marginBottom:10}}>
        {LANGS.map(l=>(
          <button key={l.code} onClick={()=>onChangeLang(l.code)}
            style={{padding:"5px 12px",borderRadius:20,fontSize:12,fontWeight:600,border:`1px solid ${lang===l.code?T.accent:T.border}`,background:lang===l.code?T.accentLt:"transparent",color:lang===l.code?T.accent:T.textDim}}>
            {l.flag} {l.label}
          </button>
        ))}
      </div>
    )}
    <div className="login-body fade-up fade-up-3">
    {!sel?<>
      <p className="login-prompt">{t("login_who",lang)}</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
        {users.map(u=>(
          <button key={u.id} onClick={()=>{haptic.light();setSel(u.id);}} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:7,padding:"16px 8px",borderRadius:16,background:T.bg2,border:`1px solid ${T.border}`,cursor:"pointer",position:"relative"}}>
            <div style={{width:52,height:52,borderRadius:"50%",background:u.isAdmin?"linear-gradient(135deg,#FF6B00,#E8390A)":T.bg3,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:800,color:u.isAdmin?"#fff":T.text}}>{u.initials||u.name.split(" ").map(p=>p[0]).slice(0,2).join("")}</div>
            <div style={{fontSize:12.5,fontWeight:600,color:T.text,textAlign:"center",lineHeight:1.2}}>{u.name.split(" ")[0]}</div>
            {u.isAdmin&&<div style={{position:"absolute",top:7,right:7,width:7,height:7,borderRadius:"50%",background:"#FF6B00"}}></div>}
          </button>
        ))}
      </div>
    </>
    :<><p className="login-prompt">{t("login_pin_for",lang)} <b style={{color:T.text}}>{users.find(u=>u.id===sel)?.name}</b></p><div className="field"><input className={`input ${shake?"input-shake":""}`} type="password" inputMode="numeric" maxLength={6} value={pin} autoFocus onChange={e=>{setPin(e.target.value.replace(/\D/g,""));setErr("");}} onKeyDown={e=>e.key==="Enter"&&pin.length>=4&&tryLogin()} placeholder="●●●●" style={{textAlign:"center",fontSize:30,letterSpacing:10,borderColor:shake?T.bad:undefined}}/></div>{err&&<p style={{color:T.bad,fontSize:12,marginBottom:10,textAlign:"center"}}>{err}</p>}<button className="btn btn-ghost" onClick={()=>{setSel(null);setPin("");setErr("");}}>← {t("login_back",lang)}</button></>}
  </div></div>);
}

// Dictée vocale masquée temporairement : l'API SpeechRecognition du navigateur
// ne fonctionne pas de façon fiable sur iOS Safari. Le code de la fonctionnalité
// reste entièrement en place plus bas (useSpeechRecognition, VoiceOverlay) —
// il suffit de repasser ce drapeau à true pour tout réafficher d'un coup.
const VOICE_FEATURE_ENABLED = false;

// Ligne de la liste "à commander" : tap = cocher/décocher, appui long =
// supprimer. Même geste que partout ailleurs dans l'app.
function ShoppingRow({it,onToggle,onDelete}){
  const lp=useLongPress(()=>{ haptic.medium(); onDelete(it); });
  return(
    <div className="item" {...lp.handlers} onClick={()=>{ if(!lp.didFire()) onToggle(it); }} style={{opacity:it.done?.5:1}}>
      <div className={`check ${it.done?"on":""}`}>{it.done?"✓":""}</div>
      <div className="item-body"><div className="item-title" style={{textDecoration:it.done?"line-through":"none"}}>{it.item}</div></div>
    </div>
  );
}

function Aujourdhui({data,setData,go,user,onVoiceOpen,lang,db,reload,markLocalWrite}){
  const[,setTick]=useState(0);
  useEffect(()=>{const i=setInterval(()=>setTick(t=>t+1),30000);return()=>clearInterval(i);},[]);
  const[shopText,setShopText]=useState("");
  async function addShopItem(){
    const text=shopText.trim();
    if(!text)return;
    setShopText("");
    const res=await db.addShoppingItem(text,user?.name);
    if(res?.error||!res?.data){alert("Impossible d'ajouter. Vérifie la connexion Supabase.");await reload?.({force:true});return;}
    markLocalWrite?.();
    const r=res.data;
    setData(d=>({...d,shoppingList:[{id:r.id,item:r.item,done:r.done,operator:r.operator,createdAt:r.created_at},...(d.shoppingList||[])]}));
  }
  async function toggleShopItem(it){
    const next=!it.done;
    markLocalWrite?.();
    setData(d=>({...d,shoppingList:d.shoppingList.map(x=>x.id===it.id?{...x,done:next}:x)}));
    const res=await db.toggleShoppingItem(it.id,next);
    if(res?.error){alert("Impossible d'enregistrer. Vérifie la connexion Supabase.");await reload?.({force:true});}
  }
  async function removeShopItem(it){
    if(!window.confirm(`Retirer "${it.item}" de la liste ?`))return;
    const res=await db.deleteShoppingItem(it.id);
    if(res?.error){alert("La suppression a échoué. Vérifie la connexion Supabase.");await reload?.({force:true});return;}
    markLocalWrite?.();
    setData(d=>({...d,shoppingList:d.shoppingList.filter(x=>x.id!==it.id)}));
  }
  const h=new Date().getHours();const greeting=h<12?t("home_greeting_morning",lang):h<18?t("home_greeting_afternoon",lang):t("home_greeting_evening",lang);
  const today=new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"});
  const win=getServiceWindow();
  const fridgesOutOfNorm=data.haccpSettings.fridgeTargets.filter(f=>{const m=getReleve(data,f.id,"matin"),s=getReleve(data,f.id,"soir");return(m&&tempStatus(m.temp,f.target)==="bad")||(s&&tempStatus(s.temp,f.target)==="bad");});
  const expiredProducts=data.traceability.filter(t=>t.status==="expired");
  const activeCoolings=data.cooling.filter(c=>c.status==="active"&&c.startedMs);
  const criticalAlerts=[];
  fridgesOutOfNorm.forEach(f=>{const r=getReleve(data,f.id,"matin")||getReleve(data,f.id,"soir");criticalAlerts.push({type:"fridge",icon:f.icon,title:`${f.name} — ${r.temp}°C hors norme`,sub:`Cible : ${f.target}°C · Action immédiate requise`,goto:"temps"});});
  expiredProducts.forEach(p=>{criticalAlerts.push({type:"expired",icon:p.emoji,title:`${p.product} — DLC dépassée`,sub:`DLC : ${p.dlc} · Retirer du stock`,goto:"trace"});});
  activeCoolings.forEach(c=>{const el=Math.floor((Date.now()-c.startedMs)/60000);if(el>data.haccpSettings.coolingMax)criticalAlerts.push({type:"cooling",icon:"❄️",title:`${c.product} — refroidissement > ${data.haccpSettings.coolingMax} min`,sub:"Remettre en cuisson ou jeter",goto:"cooling"});});

  const totalFridges=data.haccpSettings.fridgeTargets.length;
  const matinDone=data.haccpSettings.fridgeTargets.filter(f=>getReleve(data,f.id,"matin")).length;
  const soirDone=data.haccpSettings.fridgeTargets.filter(f=>getReleve(data,f.id,"soir")).length;
  // Compte les tâches du créneau EN COURS uniquement — data.tasks contient
  // tous les créneaux (aujourd'hui midi + soir, demain…). Sans ce filtre,
  // l'accueil affichait un total qui ne correspondait pas à l'écran Mise en
  // place, qui lui ne montre qu'un créneau à la fois.
  const homeSlot=(()=>{
    const RESET_MIDI = data?.haccpSettings?.resetMidi ?? (16*60+30);
    const RESET_SOIR = Math.min(data?.haccpSettings?.resetSoir ?? (3*60), 9*60); // plafonné, voir Paramètres → Horaires
    const n=new Date(); const mins=n.getHours()*60+n.getMinutes();
    const d=new Date();
    if(mins < RESET_SOIR){ d.setDate(d.getDate()-1); return {date:isoDate(d), service:"soir"}; }
    if(mins < RESET_MIDI) return {date:isoDate(d), service:"midi"};
    return {date:isoDate(d), service:"soir"};
  })();
  const slotTasks=data.tasks.filter(t=>t.date===homeSlot.date&&(t.service||"midi")===homeSlot.service);
  const tasksTotal=slotTasks.length;const tasksDone=slotTasks.filter(t=>t.done).length;
  const cleanTotal=data.cleaning.length;const cleanDone=data.cleaning.filter(c=>cleaningIsDoneToday(c,data.cleaningChecks,data.haccpSettings?.resetSoir)).length;

  // Statut de chaque module pour la pastille d'accès rapide : vert = complet
  // (ou rien à faire), rouge = il reste des actions en attente aujourd'hui.
  const tempComplete = totalFridges===0 || (matinDone+soirDone)>=totalFridges*2;
  const tasksComplete = tasksTotal===0 || tasksDone>=tasksTotal;
  const cleanComplete = cleanTotal===0 || cleanDone>=cleanTotal;
  const traceAlerts = data.traceability.filter(t=>t.status!=="ok").length;
  const traceComplete = traceAlerts===0;

  const nowItems=[];const upcomingItems=[];
  if(win.id==="morning"){
    if(matinDone<totalFridges)nowItems.push({icon:"☀️",title:t("home_morning_readings",lang),done:matinDone,total:totalFridges,color:T.warn,goto:"temps"});
    if(tasksDone<tasksTotal)nowItems.push({icon:"✅",title:t("home_tasks",lang),done:tasksDone,total:tasksTotal,color:T.accent,goto:"tasks"});
    upcomingItems.push({icon:"🚚",title:t("home_supplier_reception",lang),sub:"Avant 11h",goto:"reception"});
  }else if(win.id==="lunch"||win.id==="dinner"){
    upcomingItems.push({icon:"🧹",title:t("home_end_cleaning",lang),sub:`${cleanDone}/${cleanTotal} fait`,goto:"clean"});
  }else if(win.id==="prep_pm"){
    if(tasksDone<tasksTotal)nowItems.push({icon:"✅",title:t("home_tasks",lang),done:tasksDone,total:tasksTotal,color:T.accent,goto:"tasks"});
    upcomingItems.push({icon:"🌙",title:t("home_evening_readings",lang),sub:"Avant 23h",goto:"temps"});
  }else if(win.id==="closing"){
    if(soirDone<totalFridges)nowItems.push({icon:"🌙",title:t("home_evening_readings",lang),done:soirDone,total:totalFridges,color:T.info,goto:"temps"});
    if(cleanDone<cleanTotal)nowItems.push({icon:"🧹",title:t("home_cleaning",lang),done:cleanDone,total:cleanTotal,color:T.good,goto:"clean"});
    upcomingItems.push({icon:"🏷️",title:t("home_product_labeling",lang),goto:"labels"});
  }

  const allClear=criticalAlerts.length===0&&activeCoolings.length===0&&nowItems.length===0;

  return(<div className="page">
    <div className="greet-block">
      <div className="between" style={{alignItems:"flex-start"}}>
        <div>
          <div className="greet-line"><span className="greet-dot"></span><span>{win.icon} {win.label}</span></div>
          <div className="greet-name">{greeting}, {user.name.split(" ")[0]}</div>
          <div className="greet-context tabular">{today}</div>
        </div>
        {VOICE_FEATURE_ENABLED&&onVoiceOpen&&<button onClick={onVoiceOpen} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:20,background:T.bg2,border:`1px solid ${T.border}`,color:T.text,fontSize:13,fontWeight:600,flexShrink:0,marginTop:2}}><span style={{color:"#FF6B00"}}>🎤</span> Dicter</button>}
      </div>
    </div>

    {criticalAlerts.length>0&&<div className="urgent-card pulse">
      <div className="urgent-label"><span style={{fontSize:14}}>🚨</span>{criticalAlerts.length===1?"ALERTE CRITIQUE":`${criticalAlerts.length} ALERTES CRITIQUES`}</div>
      <div className="urgent-title">{criticalAlerts[0].title}</div>
      <div className="urgent-sub">{criticalAlerts[0].sub}</div>
      <button className="urgent-cta" onClick={()=>go(criticalAlerts[0].goto)}>{t("home_handle_now",lang)}</button>
      {criticalAlerts.length>1&&<div style={{marginTop:10,fontSize:11,opacity:.8}}>+ {criticalAlerts.length-1} autre{criticalAlerts.length>2?"s":""} alerte{criticalAlerts.length>2?"s":""}</div>}
    </div>}

    {activeCoolings.length>0&&<>
      <div className="bucket-label"><span className="bucket-label-dot" style={{background:T.warn}}></span>{t("home_ongoing",lang)}</div>
      {activeCoolings.map(c=>{
        const elMs=Date.now()-c.startedMs;const elMin=Math.floor(elMs/60000);const elSec=Math.floor((elMs%60000)/1000);
        const maxMs=Math.max(1,safeNum(data.haccpSettings.coolingMax,120))*60000;const pct=safePct(elMs,maxMs);
        const isDanger=elMin>data.haccpSettings.coolingMax;const isNear=elMin>data.haccpSettings.coolingMax*0.75;
        const fmt=(m,s)=>`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
        return(<div key={c.id} className={`live-widget ${isDanger?"danger":""}`} onClick={()=>go("cooling")}>
          <div className="live-widget-head"><div className="live-widget-title">❄️ {c.product}</div><div className="live-widget-timer tabular" style={{color:isDanger?T.bad:isNear?T.warn:T.text}}>{fmt(elMin,elSec)}</div></div>
          <div className="live-widget-sub">{c.qty} · Départ {c.startTemp}°C · Limite {data.haccpSettings.coolingMax} min</div>
          <div className="pbar"><div className="pfill" style={{width:`${pct}%`,background:isDanger?T.bad:isNear?T.warn:T.good}}></div></div>
        </div>);
      })}
    </>}

    {nowItems.length>0&&<>
      <div className="bucket-label" style={{marginTop:14}}><span className="bucket-label-dot" style={{background:T.accent}}></span>{t("home_now",lang)}</div>
      {nowItems.map((it,i)=>(<div key={i} className="check-row" onClick={()=>go(it.goto)}>
        <div className="check-row-icon" style={{background:`${it.color}22`,color:it.color}}>{it.icon}</div>
        <div className="check-row-body"><div className="check-row-title">{it.title}</div>
          {it.total!==undefined?<div className="check-row-progress"><div className="check-row-bar"><div className="check-row-fill" style={{width:`${safePct(it.done,it.total)}%`,background:it.color}}></div></div><span className="text-xs tabular text-dim">{it.done}/{it.total}</span></div>:<div className="check-row-progress">{it.sub}</div>}
        </div>
        {it.total!==undefined&&<div className="check-row-pct tabular">{Math.round(safePct(it.done,it.total))}%</div>}
      </div>))}
    </>}

    {upcomingItems.length>0&&<>
      <div className="bucket-label" style={{marginTop:14}}><span className="bucket-label-dot" style={{background:T.textMute}}></span>{t("home_upcoming",lang)}</div>
      {upcomingItems.map((it,i)=>(<div key={i} className="check-row" onClick={()=>go(it.goto)} style={{opacity:.75}}>
        <div className="check-row-icon" style={{background:T.bg3,color:T.textDim}}>{it.icon}</div>
        <div className="check-row-body"><div className="check-row-title">{it.title}</div><div className="check-row-progress">{it.sub||"À planifier"}</div></div>
        <div className="item-arrow">›</div>
      </div>))}
    </>}

    {allClear&&<div className="empty"><div className="empty-icon">✓</div><div className="empty-title">{t("home_all_clear_title",lang)}</div><div className="empty-sub">{t("home_all_clear_sub",lang)}</div></div>}

    <div className="bucket-label" style={{marginTop:18}}><span className="bucket-label-dot" style={{background:T.textMute}}></span>{t("home_quick_access",lang)}</div>
    <div className="tiles">
      <div className="tile" onClick={()=>go("labels")}><div className="tile-icon">🏷️</div><div className="tile-label">{t("home_tile_labeling",lang)}</div><div className="tile-value tabular">{data.labels.length}</div></div>
      <div className="tile" onClick={()=>go("temps")}><span className="tile-dot" style={{background:tempComplete?T.good:T.bad}}></span><div className="tile-icon">🌡️</div><div className="tile-label">{t("home_tile_temps",lang)}</div><div className="tile-value tabular">{matinDone+soirDone}/{totalFridges*2}</div></div>
      <div className="tile" onClick={()=>go("trace")}><span className="tile-dot" style={{background:traceComplete?T.good:T.bad}}></span><div className="tile-icon">📦</div><div className="tile-label">{t("home_tile_trace",lang)}</div><div className="tile-value tabular">{data.traceability.length}</div></div>
      <div className="tile" onClick={()=>go("tasks")}><span className="tile-dot" style={{background:tasksComplete?T.good:T.bad}}></span><div className="tile-icon">✅</div><div className="tile-label">{t("home_tasks",lang)}</div><div className="tile-value tabular">{tasksDone}/{tasksTotal}</div></div>
      <div className="tile" onClick={()=>go("clean")}><span className="tile-dot" style={{background:cleanComplete?T.good:T.bad}}></span><div className="tile-icon">🧹</div><div className="tile-label">{t("home_cleaning",lang)}</div><div className="tile-value tabular">{cleanDone}/{cleanTotal}</div></div>
    </div>

    {/* Pense-bête "à commander" — volontairement simple : texte libre, tap
        pour cocher, appui long pour supprimer. Ouvert à toute l'équipe. */}
    <div className="bucket-label" style={{marginTop:18}}><span className="bucket-label-dot" style={{background:T.textMute}}></span>{t("shop_title",lang)}</div>
    <div className="card">
      <div className="row gap8 mb10">
        <input className="input input-sm" style={{flex:1}} value={shopText} onChange={e=>setShopText(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&addShopItem()} placeholder={t("shop_placeholder",lang)}/>
        <button className="btn btn-primary btn-sm" style={{width:"auto",padding:"0 16px"}} onClick={addShopItem} disabled={!shopText.trim()}>+</button>
      </div>
      {(data.shoppingList||[]).length===0
        ? <div className="text-xs text-dim center" style={{padding:"6px 0"}}>{t("shop_empty",lang)}</div>
        : (data.shoppingList||[]).map(it=><ShoppingRow key={it.id} it={it} onToggle={toggleShopItem} onDelete={removeShopItem}/>)
      }
    </div>
  </div>);
}

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRE HACCP — historique centralisé, filtrable, exportable
// ═══════════════════════════════════════════════════════════════════════════

// Convertit "JJ/MM" (format utilisé partout dans l'app) en objet Date de l'année en cours
// Date "de service" plutôt que date calendaire brute : entre minuit et
// l'horaire réel de bascule (Paramètres → Horaires de service), on est
// encore sur le service du soir de la veille. Sans ça, minuit faisait
// réapparaître le nettoyage du soir comme "à faire" des heures avant la
// vraie fin de service — même logique que celle déjà utilisée pour calculer
// le créneau en cours dans Mise en place.
function serviceISODate(resetSoir){
  // Filet de sécurité : si une valeur incorrecte (ex. proche de minuit)
  // existait déjà quelque part, on la ramène dans une plage sensée plutôt
  // que de laisser le calcul du jour se casser silencieusement.
  const RESET_SOIR = Math.min(resetSoir ?? (3*60), 9*60);
  const n=new Date(); const mins=n.getHours()*60+n.getMinutes();
  const d=new Date(n);
  if(mins<RESET_SOIR) d.setDate(d.getDate()-1);
  return isoDate(d);
}

// Une zone est-elle faite AUJOURD'HUI (au sens du service, pas du calendrier) ?
// Fonction partagée, utilisée partout dans l'app (accueil, menu HACCP,
// pastille de l'icône, écran Nettoyage) — une seule source de vérité, pour
// ne plus jamais désynchroniser un compteur par rapport à un autre. Pour le
// quotidien, matin ET soir sont nécessaires (l'ancienne case "done" ne
// représente plus cet état depuis le passage au double créneau) ; pour les
// autres fréquences, la case reste la référence.
function cleaningIsDoneToday(c, cleaningChecks, resetSoir){
  if(c.freq==="Quotidien"){
    const today=serviceISODate(resetSoir);
    const checks=cleaningChecks||[];
    const hasMatin=checks.some(x=>x.cleaningId===c.id&&x.date===today&&x.period==="matin");
    const hasSoir=checks.some(x=>x.cleaningId===c.id&&x.date===today&&x.period==="soir");
    return hasMatin&&hasSoir;
  }
  return !!c.done;
}

function parseAppDate(dstr){
  if(!dstr) return null;
  const [d,m]=dstr.split("/").map(Number);
  if(!d||!m) return null;
  const now=new Date();
  return new Date(now.getFullYear(),m-1,d);
}

// Horodatage fiable d'un événement : on privilégie createdAt (vrai
// timestamp avec année, posé automatiquement par la base) — la date
// affichée ("18/07") n'a pas d'année et deviendrait ambiguë après un an
// d'utilisation. Pour les enregistrements antérieurs à cette mise à jour
// (qui n'ont pas de createdAt fiable), on retombe sur l'année en cours —
// imprécis mais mieux que rien, et sans impact sur les nouvelles entrées.
function eventTs(createdAt, displayDate){
  if(createdAt){ const d=new Date(createdAt); if(!isNaN(d)) return d; }
  return parseAppDate(displayDate) || new Date();
}

// Construit la liste unifiée de tous les événements HACCP datés, triés du plus récent au plus ancien
function buildRegistreEvents(data){
  const ev=[];

  data.fridgeReleves.forEach(r=>{
    const f=data.haccpSettings.fridgeTargets.find(x=>x.id===r.fridgeId);
    if(!f) return;
    const status=tempStatus(r.temp,f.target);
    ev.push({date:r.date,time:r.time,ts:eventTs(r.createdAt,r.date),type:"temp",icon:f.icon,title:`${f.name} · ${r.period==="matin"?"Matin":"Soir"}`,detail:`${r.temp}°C (cible ${f.target}°C)`,status,module:"Températures",operator:data.users.find(u=>u.id===r.operatorId)?.name||"—"});
  });

  data.reception.forEach(r=>{
    ev.push({date:r.date,time:"—",ts:eventTs(r.createdAt,r.date),type:"reception",icon:"🚚",title:`Réception · ${r.product}`,detail:`${r.supplier||"Fournisseur"} · ${r.temp}°C · Aspect ${r.aspect}`,status:r.tempOk&&r.aspect==="OK"&&r.emballage==="OK"?"good":"bad",module:"Réception",operator:r.signed||"—"});
  });

  data.cooling.forEach(c=>{
    if(c.status==="active") return; // pas encore terminé
    ev.push({date:c.date,time:"—",ts:eventTs(c.createdAt,c.date),type:"cooling",icon:"❄️",title:`Refroidissement · ${c.product}`,detail:`${c.startTemp}°C → ${c.endTemp}°C en ${c.duration} min`,status:c.status==="ok"?"good":"bad",module:"Refroidissement",operator:c.operator||"—"});
  });

  data.reheating.forEach(r=>{
    ev.push({date:r.date,time:"—",ts:eventTs(r.createdAt,r.date),type:"reheating",icon:"🔥",title:`Remise en T° · ${r.product}`,detail:`${r.endTemp}°C en ${r.duration} min`,status:r.status==="ok"?"good":"bad",module:"Remise en température",operator:r.operator||"—"});
  });

  data.labels.forEach(l=>{
    ev.push({date:l.dateProd,time:"—",ts:eventTs(l.createdAt,l.dateProd),type:"label",icon:"🏷️",title:`Étiquette · ${l.product}`,detail:`DLC ${l.dlc} · Lot ${l.lot}`,status:"good",module:"Étiquetage",operator:l.operator||"—"});
  });

  data.pests.forEach(p=>{
    ev.push({date:p.date,time:"—",ts:eventTs(p.createdAt,p.date),type:"pest",icon:"🐀",title:`Contrôle nuisibles · ${p.type}`,detail:`${p.company||"—"} · Résultat : ${p.result}`,status:p.result==="RAS"?"good":"bad",module:"Nuisibles",operator:"—"});
  });

  // Traçabilité : TOUTES les fiches sont archivées, pas seulement les
  // non-conformités — c'est la preuve que chaque produit a bien été
  // contrôlé et photographié à réception, conforme ou pas.
  data.traceability.forEach(t=>{
    ev.push({date:eventTs(t.createdAt,null).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit"}),time:"—",ts:eventTs(t.createdAt,null),type:"trace",icon:t.emoji||"📦",title:`Traçabilité · ${t.product}`,detail:`Lot ${t.lot} · DLC ${t.dlc}${t.status!=="ok"?" · Non-conforme":""}`,status:t.status==="ok"?"good":"bad",module:"Traçabilité",operator:"—"});
  });

  // Nettoyage : archivé depuis l'historique PERMANENT (cleaningChecks), pas
  // depuis la case à cocher qui, elle, ne représente que "maintenant" et est
  // remise à zéro à chaque service. Chaque passage — matin ET soir pour le
  // quotidien — laisse ici sa propre trace, définitivement.
  (data.cleaningChecks||[]).forEach(c=>{
    const periodLabel = c.period==="matin"?" · Matin":c.period==="soir"?" · Soir":"";
    const [y,m,d] = (c.date||"").split("-");
    const displayDate = (d&&m) ? `${d}/${m}` : "";
    ev.push({date:displayDate,time:"—",ts:eventTs(c.createdAt,null),type:"clean",icon:"🧹",title:`Nettoyage · ${c.zone}${periodLabel}`,detail:`${c.freq}`,status:"good",module:"Nettoyage",operator:c.operator||"—"});
  });

  // Huiles de friture : chaque contrôle du taux de polaires est un événement
  // à part entière (comme un relevé de température) — pas seulement les
  // dépassements, pour prouver que le contrôle a bien été fait.
  data.oils.forEach(o=>{
    if(!o.lastTest||o.polaires==null) return;
    const bad = o.polaires >= (data.haccpSettings?.oilPolarMax ?? 25);
    ev.push({date:o.lastTest,time:"—",ts:eventTs(o.createdAt,o.lastTest),type:"oils",icon:"🛢️",title:`Huile · ${o.name}`,detail:`${o.polaires}% polaires${o.type?` · ${o.type}`:""}`,status:bad?"bad":"good",module:"Huiles",operator:o.operator||"—"});
  });

  // Tri du plus récent au plus ancien — sur ts (vrai timestamp), plus fiable
  // que la date affichée qui n'a pas d'année.
  ev.sort((a,b)=> (b.ts?.getTime()||0) - (a.ts?.getTime()||0));
  return ev;
}

function Registre({data,db}){
  const[period,setPeriod]=useState("7j"); // 7j | 30j | mois | archives
  const[moduleFilter,setModuleFilter]=useState("tous");
  const[statusFilter,setStatusFilter]=useState("tous");
  const[showExport,setShowExport]=useState(false);
  // Mois consultés en archives : chargés à la demande, gardés en mémoire le
  // temps de la session seulement (pas dans data global, pour ne jamais
  // alourdir le reste de l'app). Clé "AAAA-MM" → objet partiel type `data`.
  const[archiveMonths,setArchiveMonths]=useState({});
  const[loadingMonth,setLoadingMonth]=useState(null);
  const[openMonth,setOpenMonth]=useState(null);
  // Complète les étiquettes au-delà des 7 jours en mémoire (limite fixée
  // pour l'écran Étiquetage) — sans ça, "30 jours" et "Ce mois" auraient un
  // trou silencieux sur tout ce qui dépasse 7 jours. Chargé une fois par
  // session, pas à chaque rendu.
  const[extraLabels,setExtraLabels]=useState(null);
  useEffect(()=>{
    if(period==="7j") return; // pas besoin, la fenêtre normale suffit déjà
    if(extraLabels!==null) return; // déjà chargé cette session
    const from=new Date(Date.now()-31*86400000).toISOString(); // couvre "30 jours" et "Ce mois"
    db.fetchLabelsSince(from).then(setExtraLabels).catch(()=>setExtraLabels([]));
  },[period]);

  const dataForRegistry = useMemo(()=>{
    if(!extraLabels) return data;
    // Fusionne sans doublons (une étiquette peut être dans les deux lots).
    const seen=new Set(data.labels.map(l=>l.id));
    const merged=[...data.labels, ...extraLabels.filter(l=>!seen.has(l.id))];
    return {...data, labels:merged};
  },[data,extraLabels]);

  const allEvents=useMemo(()=>buildRegistreEvents(dataForRegistry),[dataForRegistry]);

  const now=new Date();
  const cutoffs={"7j":7,"30j":30,"mois":31};
  const filtered = period==="archives" ? [] : allEvents.filter(e=>{
    const d=e.ts;
    if(d){
      const diffDays=Math.floor((now-d)/86400000);
      if(period==="mois"){ if(d.getMonth()!==now.getMonth()||d.getFullYear()!==now.getFullYear()) return false; }
      else if(diffDays>cutoffs[period]||diffDays<0) return false;
    }
    if(moduleFilter!=="tous"&&e.module!==moduleFilter) return false;
    if(statusFilter!=="tous"&&e.status!==statusFilter) return false;
    return true;
  });

  const modules=[...new Set(allEvents.map(e=>e.module))];
  const nbBad=filtered.filter(e=>e.status==="bad").length;
  const nbGood=filtered.filter(e=>e.status==="good").length;

  // Groupe par date pour affichage en timeline (modes 7j/30j/mois)
  const grouped={};
  filtered.forEach(e=>{ (grouped[e.date]=grouped[e.date]||[]).push(e); });
  const dateKeys=Object.keys(grouped).sort((a,b)=>{
    const evA=grouped[a][0],evB=grouped[b][0];
    return (evB.ts?.getTime()||0)-(evA.ts?.getTime()||0);
  });

  // ── Mode Archives : arborescence Année → Mois ───────────────────────────
  // Tout reste consultable, rien n'est jamais supprimé — seuls les mois
  // qu'on ouvre vraiment sont chargés, pour ne jamais alourdir le
  // démarrage de l'app avec des années d'historique.
  const MONTH_NAMES=["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  const thisYear=now.getFullYear(), thisMonth=now.getMonth();
  // On propose l'année en cours + les 2 précédentes : au-delà, l'admin peut
  // encore consulter en ajustant si besoin, mais ça couvre largement la
  // durée de conservation HACCP usuelle.
  const years=[thisYear,thisYear-1,thisYear-2];

  async function openArchiveMonth(year,monthIdx){
    const key=`${year}-${String(monthIdx+1).padStart(2,"0")}`;
    if(openMonth===key){ setOpenMonth(null); return; }
    setOpenMonth(key);
    if(archiveMonths[key]) return; // déjà chargé cette session
    // Si le mois demandé est dans la fenêtre déjà en mémoire (les ~100
    // dernières entrées par table), inutile de retourner sur le serveur.
    const inMemory = year===thisYear && monthIdx===thisMonth;
    if(inMemory) return;
    setLoadingMonth(key);
    const from=new Date(year,monthIdx,1).toISOString();
    const to=new Date(year,monthIdx+1,1).toISOString();
    const res=await db.fetchRegistrePeriod(from,to);
    setLoadingMonth(null);
    setArchiveMonths(m=>({...m,[key]:res}));
  }

  function eventsForMonth(year,monthIdx){
    const key=`${year}-${String(monthIdx+1).padStart(2,"0")}`;
    const inMemory = year===thisYear && monthIdx===thisMonth;
    const source = inMemory ? dataForRegistry : (archiveMonths[key]
      ? {...data, ...archiveMonths[key]} // complète avec haccpSettings/users déjà connus
      : null);
    if(!source) return null;
    return buildRegistreEvents(source).filter(e=>e.ts && e.ts.getFullYear()===year && e.ts.getMonth()===monthIdx);
  }

  return(<div className="page">
    <div className="section-title">Registre HACCP</div>
    <div className="section-sub">Historique complet · {period==="archives"?"navigation par mois":`${filtered.length} événement${filtered.length>1?"s":""}`}</div>

    {/* Résumé conformité (masqué en mode archives, sans objet ici) */}
    {period!=="archives" && (
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
        <div className="tile" style={{background:T.goodBg}}><div className="tile-value tabular" style={{color:T.good}}>{nbGood}</div><div className="tile-label">Conformes</div></div>
        <div className="tile" style={{background:T.badBg}}><div className="tile-value tabular" style={{color:T.bad}}>{nbBad}</div><div className="tile-label">Non-conformités</div></div>
      </div>
    )}

    {/* Filtres */}
    <div className="group-label">Période</div>
    <QuickPick value={period} onChange={setPeriod} options={[
      {value:"7j",label:"7 jours"},{value:"30j",label:"30 jours"},{value:"mois",label:"Ce mois"},{value:"archives",label:"🗂 Archives"},
    ]}/>

    {period!=="archives" && <>
      <div className="group-label mt14">Module</div>
      <div className="chips">
        <button className={`chip ${moduleFilter==="tous"?"sel":""}`} onClick={()=>{haptic.light();setModuleFilter("tous");}}>Tous</button>
        {modules.map(m=><button key={m} className={`chip ${moduleFilter===m?"sel":""}`} onClick={()=>{haptic.light();setModuleFilter(m);}}>{m}</button>)}
      </div>

      <div className="group-label mt14">Statut</div>
      <QuickPick value={statusFilter} onChange={setStatusFilter} options={[
        {value:"tous",label:"Tous"},{value:"good",label:"✓ Conformes"},{value:"bad",label:"⚠ Non-conformités"},
      ]}/>

      <button className="btn btn-ghost mt14 mb14" onClick={()=>setShowExport(true)}>📄 Exporter en PDF</button>

      {/* Timeline groupée par jour — chaque jour est un sous-menu repliable,
          le plus récent ouvert par défaut pour ne pas devoir tout déplier
          juste pour voir ce qui vient de se passer. */}
      {dateKeys.length===0
        ? <div className="empty"><div className="empty-icon">📋</div><div className="empty-title">Aucun événement</div><div className="empty-sub">Ajustez les filtres pour voir l'historique</div></div>
        : dateKeys.map((dateKey,idx)=>(
          <div key={dateKey} style={{marginBottom:10}}>
            <CollapsibleSection title={dateKey} icon="📅" count={grouped[dateKey].length} defaultOpen={idx===0}>
              {grouped[dateKey].map((e,i)=>(
                <div key={i} className="item" style={{marginBottom:5}}>
                  <div className="item-icon" style={{background:e.status==="bad"?T.badBg:T.infoBg,fontSize:18}}>{e.icon}</div>
                  <div className="item-body">
                    <div className="item-title">{e.title}</div>
                    <div className="item-sub">{e.detail} · {e.operator}</div>
                  </div>
                  <span className={`badge ${e.status==="bad"?"b-bad":"b-good"}`}>{e.status==="bad"?"⚠":"✓"}</span>
                </div>
              ))}
            </CollapsibleSection>
          </div>
        ))
      }
    </>}

    {period==="archives" && (
      <div className="mt14">
        <div className="text-xs text-dim mb12" style={{lineHeight:1.5}}>
          Rien n'est jamais supprimé. Les mois les plus anciens ne sont chargés que si tu les ouvres, pour ne pas ralentir l'app.
        </div>
        {years.map(year=>(
          <div key={year} style={{marginBottom:16}}>
            <div className="bucket-label">{year}</div>
            {MONTH_NAMES.map((mName,mIdx)=>{
              // Pas de mois futurs affichés pour l'année en cours.
              if(year===thisYear && mIdx>thisMonth) return null;
              const key=`${year}-${String(mIdx+1).padStart(2,"0")}`;
              const isOpen=openMonth===key;
              const isLoading=loadingMonth===key;
              const monthEvents = isOpen ? eventsForMonth(year,mIdx) : null;
              return (
                <div key={mIdx} style={{marginBottom:6}}>
                  <button className="collapse-head" onClick={()=>openArchiveMonth(year,mIdx)} style={{width:"100%"}}>
                    <span className="collapse-head-left"><span className="collapse-title">{mName}</span></span>
                    <span className={`collapse-chevron ${isOpen?"open":""}`}>›</span>
                  </button>
                  {isOpen && (
                    <div className="collapse-body" style={{paddingTop:8,paddingLeft:6}}>
                      {isLoading
                        ? <div className="text-xs text-dim center" style={{padding:"12px 0"}}>Chargement…</div>
                        : (monthEvents && monthEvents.length>0
                          ? monthEvents.map((e,i)=>(
                            <div key={i} className="item" style={{marginBottom:5}}>
                              <div className="item-icon" style={{background:e.status==="bad"?T.badBg:T.infoBg,fontSize:16}}>{e.icon}</div>
                              <div className="item-body">
                                <div className="item-title">{e.title}</div>
                                <div className="item-sub">{e.date} · {e.detail} · {e.operator}</div>
                              </div>
                              <span className={`badge ${e.status==="bad"?"b-bad":"b-good"}`}>{e.status==="bad"?"⚠":"✓"}</span>
                            </div>
                          ))
                          : <div className="text-xs text-dim center" style={{padding:"12px 0"}}>Aucun événement ce mois-ci</div>
                        )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    )}

    {/* Sheet export */}
    {showExport&&(
      <div className="overlay" onClick={()=>setShowExport(false)}>
        <div className="sheet" onClick={e=>e.stopPropagation()}>
          <div className="sheet-handle"></div>
          <div className="sheet-title">Export PDF</div>
          <div className="text-sm text-dim mb14" style={{lineHeight:1.6}}>
            Génère un document PDF du registre HACCP pour la période et les filtres actuellement sélectionnés — prêt à montrer lors d'un contrôle sanitaire.
          </div>
          <div className="card mb14">
            <div className="between" style={{padding:"4px 0"}}><span className="text-sm text-dim">Période</span><span className="text-sm fw6">{{"7j":"7 jours","30j":"30 jours","mois":"Ce mois-ci"}[period]||"—"}</span></div>
            <div className="between" style={{padding:"4px 0"}}><span className="text-sm text-dim">Module</span><span className="text-sm fw6">{moduleFilter}</span></div>
            <div className="between" style={{padding:"4px 0"}}><span className="text-sm text-dim">Événements</span><span className="text-sm fw6 tabular">{filtered.length}</span></div>
          </div>
          <button className="btn btn-primary mb8" onClick={()=>{ exportRegistrePDF(filtered,{period,moduleFilter}); setShowExport(false); }}>📄 Générer le PDF</button>
          <button className="btn btn-ghost" onClick={()=>setShowExport(false)}>Annuler</button>
        </div>
      </div>
    )}
  </div>);
}

// Génère un PDF imprimable du registre (via la boîte d'impression du navigateur → "Enregistrer en PDF")
function exportRegistrePDF(events,{period,moduleFilter}){
  const w=window.open("","_blank");
  if(!w){ alert("Autorisez les pop-ups pour exporter"); return; }
  const periodLabel={"7j":"7 derniers jours","30j":"30 derniers jours","mois":"Ce mois-ci","tout":"Historique complet"}[period];
  const grouped={};
  events.forEach(e=>{ (grouped[e.date]=grouped[e.date]||[]).push(e); });
  const rows=Object.entries(grouped).map(([date,evs])=>`
    <div class="daygroup">
      <div class="dayhead">${date}</div>
      ${evs.map(e=>`
        <div class="row">
          <div class="col-icon">${e.status==="bad"?"⚠":"✓"}</div>
          <div class="col-main"><b>${e.title}</b><br/><span class="muted">${e.detail}</span></div>
          <div class="col-mod">${e.module}</div>
          <div class="col-op">${e.operator}</div>
        </div>`).join("")}
    </div>`).join("");

  w.document.write(`<html><head><title>Registre HACCP — Fuego</title><style>
    @page{margin:14mm;}
    *{box-sizing:border-box;}
    body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:10pt;margin:0;}
    .closebar{position:sticky;top:0;background:#090909;padding:12px 16px;display:flex;align-items:center;gap:10px;z-index:10;}
    .closebar button{background:linear-gradient(135deg,#FF6B00,#E8390A);color:#fff;border:none;border-radius:10px;padding:10px 18px;font-size:14px;font-weight:700;font-family:Arial,sans-serif;}
    .closebar span{color:#999;font-size:12px;font-family:Arial,sans-serif;}
    .pagebody{padding:14mm;}
    @media print{ .closebar{display:none;} .pagebody{padding:0;} }
    .header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #E8390A;padding-bottom:10px;margin-bottom:16px;}
    .brand{font-weight:900;font-size:20pt;letter-spacing:3px;}
    .brand span{color:#E8390A;}
    .meta{text-align:right;font-size:9pt;color:#555;}
    .summary{display:flex;gap:16px;margin-bottom:20px;}
    .stat{flex:1;border:1px solid #ddd;border-radius:6px;padding:10px;text-align:center;}
    .stat b{font-size:18pt;display:block;}
    .daygroup{margin-bottom:14px;page-break-inside:avoid;}
    .dayhead{font-weight:bold;font-size:11pt;background:#f2f2f2;padding:5px 8px;border-radius:4px;margin-bottom:4px;}
    .row{display:grid;grid-template-columns:24px 1fr 130px 110px;gap:8px;padding:6px 8px;border-bottom:1px solid #eee;align-items:center;font-size:9pt;}
    .col-icon{text-align:center;}
    .col-mod{color:#666;font-size:8pt;}
    .col-op{color:#666;font-size:8pt;text-align:right;}
    .muted{color:#666;font-size:8.5pt;}
    .footer{margin-top:24px;padding-top:10px;border-top:1px solid #ddd;font-size:8pt;color:#888;text-align:center;}
  </style></head><body>
    <div class="closebar">
      <button onclick="window.close()">← Retour à Fuego</button>
      <span>Si le bouton ne fonctionne pas, ferme cet onglet manuellement.</span>
    </div>
    <div class="pagebody">
    <div class="header">
      <div class="brand">FUEG<span>O</span></div>
      <div class="meta">Registre HACCP<br/>${periodLabel}<br/>Généré le ${todayStr()} à ${nowTime()}</div>
    </div>
    <div class="summary">
      <div class="stat"><b>${events.length}</b>Événements</div>
      <div class="stat"><b style="color:#2a7d3f">${events.filter(e=>e.status==="good").length}</b>Conformes</div>
      <div class="stat"><b style="color:#c0392b">${events.filter(e=>e.status==="bad").length}</b>Non-conformités</div>
    </div>
    ${rows}
    <div class="footer">Document généré automatiquement par Fuego · Plan de Maîtrise Sanitaire</div>
    </div>
  </body></html>`);
  w.document.close();
  setTimeout(()=>{ w.focus(); w.print(); }, 400);
}

// ═══════════════════════════════════════════════════════════════════════════
// GUIDE DES BONNES PRATIQUES — aide-mémoire HACCP, reformulé pour un accès
// rapide en cuisine. Ce n'est pas une reproduction du GBPH officiel (protégé),
// mais une synthèse pratique des règles qu'il couvre, organisée par thème.
// ═══════════════════════════════════════════════════════════════════════════

// 8 catégories distinctes, sans mélange thématique : chaque fiche est classée
// selon son enjeu PRINCIPAL (température vs conservation vs sécurité sanitaire),
// même quand une technique touche plusieurs sujets à la fois (ex: la surgélation
// est un enjeu de température, la mise sous vide un enjeu de sécurité sanitaire).
// ═══════════════════════════════════════════════════════════════════════════
//  NOTICE D'UTILISATION — mode d'emploi de l'app (à ne pas confondre avec le
//  guide GBPH, qui porte sur la réglementation hygiène, pas sur l'outil).
//  Deux publics séparés : l'équipe en cuisine / les administrateurs.
// ═══════════════════════════════════════════════════════════════════════════
const MANUAL_SECTIONS = [
  {
    key:"start", icon:"🚀", title:"Démarrer", audience:"equipe", color:"#5A8FB5",
    cards:[
      {q:"Se connecter", a:"Touchez votre pastille avec vos initiales, puis tapez votre code à 4 chiffres. La connexion se fait toute seule dès le dernier chiffre — pas de bouton à valider."},
      {q:"Changer d'utilisateur", a:"Touchez votre avatar en haut à droite, puis « Déconnexion ». Chacun doit utiliser son propre compte : c'est votre nom qui est enregistré sur chaque relevé et chaque étiquette."},
      {q:"L'écran d'accueil", a:"Il montre ce qu'il reste à faire maintenant. Les pastilles de couleur sur les raccourcis : rouge = il reste des choses à faire, vert = tout est fait."},
      {q:"Se repérer dans l'app", a:"En bas : Aujourd'hui (vue du jour), HACCP (tous les contrôles), Recettes (fiches techniques), Mise en place (les tâches), Plus (le reste)."},
    ],
  },
  {
    key:"daily", icon:"📋", title:"Au quotidien", audience:"equipe", color:"#7A9E5C",
    cards:[
      {q:"Relever une température", a:"HACCP → Températures. Choisissez l'onglet Frigos ou Congélateurs, puis touchez « + Relever » sur l'équipement, matin ou soir. Faites glisser pour choisir la température, puis Enregistrer. Un relevé matin et un relevé soir par équipement, chaque jour."},
      {q:"Une température est hors norme", a:"Elle s'affiche en rouge. Enregistrez-la quand même — c'est la preuve que le contrôle a été fait — puis prévenez immédiatement un responsable. Ne jamais saisir une fausse valeur."},
      {q:"Cocher une tâche de mise en place", a:"Mise en place → touchez la ligne. Elle se barre et passe en gris. Retouchez pour décocher si vous vous êtes trompé."},
      {q:"Cocher une zone de nettoyage", a:"HACCP → Nettoyage. Choisissez la fréquence en haut (Quotidien, Hebdo, Mensuel...), puis touchez la zone. Le bouton « ✓ Tout marquer fait » coche d'un coup tout ce qui reste dans l'onglet affiché."},
      {q:"Imprimer une étiquette", a:"HACCP → Étiquetage → bouton +. Renseignez le produit, choisissez le type de date, vérifiez la DLC calculée automatiquement, puis imprimez. L'étiquette sort sur la Brother."},
      {q:"Enregistrer une livraison", a:"HACCP → Réception → bouton +. Contrôlez la température du produit à l'arrivée, l'aspect et l'emballage. Tout est enregistré à votre nom."},
    ],
  },
  {
    key:"slots", icon:"🕐", title:"Les créneaux", audience:"equipe", color:"#C87941",
    cards:[
      {q:"Comprendre midi et soir", a:"La mise en place est séparée en deux services par jour. Le bandeau en haut de l'écran indique toujours où vous êtes : « ● Service en cours » (fond neutre) ou « ◆ Vous préparez un autre créneau » (fond orange)."},
      {q:"Je suis sur le mauvais créneau", a:"Si le bandeau est orange, touchez « ↩ Revenir au service en cours ». Quand vous ajoutez une tâche, le formulaire rappelle toujours où elle va atterrir."},
      {q:"Préparer le service de demain", a:"Utilisez les flèches ‹ › pour changer de jour, et l'onglet Midi/Soir pour le service. Les tâches saisies resteront sur ce créneau."},
      {q:"Quand les listes se vident", a:"La mise en place et le nettoyage quotidien repartent à zéro deux fois par jour : à la fin du service du midi, et pendant la nuit. Le service du soir n'est jamais coupé à minuit — vous pouvez travailler tard sans rien perdre."},
      {q:"Nettoyage hebdo, mensuel, trimestriel", a:"Chaque zone repart de sa propre date : une zone mensuelle cochée le 20 reste verte jusqu'au 20 du mois suivant. Rien ne s'efface entre-temps."},
    ],
  },
  {
    key:"admin-setup", icon:"⚙️", title:"Configurer", audience:"admin", color:"#B8503F",
    cards:[
      {q:"Ajouter un équipement froid", a:"Paramètres → HACCP → Enceintes froides → « + Ajouter une enceinte ». Indiquez le nom, la cible de température et le type (positif/négatif). Il apparaîtra aussitôt dans l'écran Températures."},
      {q:"Créer une zone de nettoyage", a:"Paramètres → HACCP → Plan de nettoyage → « + Ajouter une zone ». Choisissez la fréquence : c'est elle qui détermine quand la zone se redécoche."},
      {q:"Régler les horaires de service", a:"Paramètres → HACCP → Horaires de service. Deux réglages : la fin du service du midi (par défaut 16h30) et celle du soir (par défaut 3h du matin). C'est à ces moments que les listes repartent à zéro."},
      {q:"Modifier les seuils critiques", a:"Paramètres → HACCP → Seuils critiques. Les valeurs légales sont indiquées sous chaque champ. Ne les assouplissez pas sans raison : ce sont elles qui déclenchent les alertes."},
      {q:"Gérer l'équipe", a:"Paramètres → Équipe. Chaque membre a un code à 4 chiffres. Le statut administrateur donne accès aux réglages et à la suppression."},
      {q:"Le catalogue produits", a:"Paramètres → Produits. Renseignez le prix d'achat de vos matières premières, rangées par catégorie. Ces prix alimentent le calcul de coût de vos fiches techniques."},
    ],
  },
  {
    key:"admin-printer", icon:"🖨️", title:"L'imprimante", audience:"admin", color:"#6B6862",
    cards:[
      {q:"Comment ça marche", a:"Safari sur iPhone ne peut pas parler directement à la Brother. On passe par un petit relais installé sur un téléphone Android laissé au restaurant, qui transmet les étiquettes à l'imprimante."},
      {q:"L'adresse du relais a changé", a:"Paramètres → Imprimante. Collez la nouvelle adresse affichée par le relais, puis « Enregistrer et tester ». Accessible à toute l'équipe, pas seulement aux admins — l'adresse peut changer à tout moment."},
      {q:"Rien ne s'imprime", a:"Dans l'ordre : l'imprimante est-elle allumée avec du papier ? Le téléphone relais est-il allumé, avec l'app Termux ouverte ? Le test dans Paramètres → Imprimante répond-il « Relais joignable » ? Si l'adresse IP de l'imprimante a changé, il faut la mettre à jour dans le relais."},
    ],
  },
  {
    key:"admin-data", icon:"🗂️", title:"Données & registre", audience:"admin", color:"#5A8FB5",
    cards:[
      {q:"Sortir le registre HACCP", a:"HACCP → Registre HACCP. Choisissez la période, puis imprimez ou enregistrez en PDF. C'est ce document qui est présenté en cas de contrôle."},
      {q:"Supprimer une tâche saisie par erreur", a:"Mise en place → appui long sur la tâche → confirmez. Réservé aux administrateurs."},
      {q:"Purger l'historique des étiquettes", a:"HACCP → Étiquetage → « 🗑 Purger » à côté de Historique. Supprime les étiquettes des jours précédents ; celles du jour sont conservées. Action définitive."},
      {q:"Joindre un rapport de nuisibles", a:"HACCP → Nuisibles → bouton + → « 📎 Joindre le PDF ». Le rapport de l'entreprise reste attaché à l'intervention et consultable à tout moment."},
      {q:"Où sont stockées les données", a:"Tout est enregistré en ligne, en continu. L'app se synchronise automatiquement : plusieurs personnes peuvent travailler en même temps sur des appareils différents."},
    ],
  },
];

const GBPH_SECTIONS = [
  {
    key: "temp", icon: "🌡️", title: "Températures", color: "#5A8FB5",
    cards: [
      {q:"Réfrigération", a:"0°C à +4°C pour les produits sensibles (viande, poisson, produits laitiers frais). Jusqu'à +8°C pour d'autres denrées selon l'arrêté du produit.", tag:"Réglementaire"},
      {q:"Congélation", a:"−18°C ou moins en continu. Ne jamais recongeler un produit décongelé.", tag:"Réglementaire"},
      {q:"Refroidissement rapide", a:"De +63°C à +10°C à cœur en moins de 2 heures. Au-delà, le produit doit être jeté.", tag:"Réglementaire"},
      {q:"Surgélation", a:"Descente rapide à cœur jusqu'à −18°C. Contrairement à la congélation lente, elle limite la formation de cristaux de glace et préserve mieux la texture.", tag:"Bonnes pratiques"},
      {q:"Remise en température", a:"Atteindre +63°C à cœur en moins d'1 heure avant service.", tag:"Réglementaire"},
      {q:"Maintien au chaud", a:"+63°C minimum en continu jusqu'au service.", tag:"Réglementaire"},
      {q:"Décongélation", a:"À consommer sous 24h. Ne jamais recongeler. Décongeler au réfrigérateur, jamais à température ambiante.", tag:"Réglementaire"},
    ],
  },
  {
    key: "oils", icon: "🍟", title: "Huiles de friture", color: "#D4A340",
    cards: [
      {q:"Seuil de composés polaires", a:"25% maximum — au-delà, l'huile est impropre à la consommation et doit être changée immédiatement.", tag:"Réglementaire"},
      {q:"Contrôle", a:"Mesure régulière (bandelette ou testeur électronique) à chaque service ou selon la fréquence d'utilisation de la friteuse.", tag:"Bonnes pratiques"},
      {q:"Filtrage", a:"Filtrer l'huile entre les services pour retirer les particules alimentaires, qui accélèrent sa dégradation.", tag:"Bonnes pratiques"},
      {q:"Température de friture", a:"Ne pas dépasser 180°C — une température trop élevée dégrade l'huile plus vite et augmente les composés polaires.", tag:"Bonnes pratiques"},
      {q:"Élimination", a:"L'huile usagée est un déchet à filière spécifique — jamais à l'évier. Collecte par un prestataire agréé.", tag:"Réglementaire"},
    ],
  },
  {
    key: "clean", icon: "🧹", title: "Nettoyage & désinfection", color: "#5FB075",
    cards: [
      {q:"Quotidien", a:"Toutes les surfaces en contact direct avec les aliments : plans de travail, sols de cuisine, tables de salle.", tag:"Fréquence"},
      {q:"Hebdomadaire", a:"Équipements moins exposés : chambres froides, friteuses, parois.", tag:"Fréquence"},
      {q:"Mensuel", a:"Zones lourdes : hottes, filtres, conduits d'extraction.", tag:"Fréquence"},
      {q:"Après chaque usage", a:"Ustensiles et équipements à usage ponctuel : trancheuses, planches, couteaux.", tag:"Fréquence"},
      {q:"Méthode", a:"Toujours dans l'ordre : nettoyer (retirer les salissures) puis désinfecter (éliminer les micro-organismes). Respecter les dilutions indiquées sur le produit.", tag:"Méthode"},
    ],
  },
  {
    key: "dlc", icon: "📅", title: "DLC & durées de conservation", color: "#D49340",
    cards: [
      {q:"Préparation maison", a:"3 jours à compter de la fabrication, sauf indication contraire du fournisseur pour les matières premières utilisées.", tag:"Bonnes pratiques"},
      {q:"Produit entamé / ouvert", a:"3 jours après ouverture, à conserver au froid, quelle que soit la DLC d'origine si elle est plus longue.", tag:"Bonnes pratiques"},
      {q:"Congélation maison", a:"6 mois recommandés pour la plupart des produits (variable selon la nature : viande, poisson, légumes).", tag:"Bonnes pratiques"},
      {q:"Conservation au sel (type gravlax)", a:"DLC courte (3 à 5 jours) sauf process de salaison plus poussé. Ne dispense pas du froid pendant et après le salage.", tag:"Bonnes pratiques"},
    ],
  },
  {
    key: "techniques", icon: "🔪", title: "Techniques de conservation", color: "#8A6FB0",
    cards: [
      {q:"Mise sous vide — principe", a:"Prolonge la conservation en limitant l'oxydation, mais ne remplace pas le froid : la chaîne du froid doit être maintenue en parallèle.", tag:"Bonnes pratiques"},
      {q:"Mise sous vide — risque botulisme", a:"Les produits sous vide mal réfrigérés favorisent le développement de la bactérie responsable du botulisme. Ne jamais dépasser +4°C, respecter scrupuleusement les DLC.", tag:"Réglementaire"},
      {q:"Salage à sec (gravlax et similaires)", a:"Le sel et le sucre déshydratent partiellement le produit et abaissent son activité en eau, ce qui ralentit le développement bactérien. Conserver au réfrigérateur pendant le salage et après rinçage.", tag:"Bonnes pratiques"},
      {q:"Fumaison à froid", a:"N'est pas un mode de cuisson : le produit reste cru. La chaîne du froid doit être respectée avant et après le fumage, comme pour tout produit non cuit.", tag:"Bonnes pratiques"},
    ],
  },
  {
    key: "trace", icon: "🏷️", title: "Traçabilité & étiquetage", color: "#FF6B00",
    cards: [
      {q:"Étiquette obligatoire", a:"Nom du produit, date de fabrication ou d'ouverture, DLC, numéro de lot, allergènes visibles.", tag:"Réglementaire"},
      {q:"Allergènes", a:"Les 14 allergènes majeurs doivent être signalés dès qu'ils sont présents dans une préparation, y compris en trace si risque de contamination croisée.", tag:"Réglementaire"},
      {q:"Réception marchandises", a:"Contrôler la température à réception, l'aspect, l'emballage et la DLC avant d'accepter la livraison. Conserver la traçabilité fournisseur (bon de livraison, lot).", tag:"Réglementaire"},
      {q:"Durée d'archivage", a:"Conserver les étiquettes et bons de livraison au moins 3 ans à compter de la date de fin de vie du produit, en cas de contrôle.", tag:"Réglementaire"},
    ],
  },
  {
    key: "hygiene", icon: "🧼", title: "Hygiène du personnel", color: "#B85CB0",
    cards: [
      {q:"Lavage des mains", a:"Avant de commencer le service, après chaque passage aux toilettes, après avoir manipulé des déchets ou des produits crus, après s'être mouché ou avoir touché son visage.", tag:"Obligatoire"},
      {q:"Tenue de travail", a:"Tenue propre et dédiée au poste, changée quotidiennement. Cheveux attachés ou couverts en zone de préparation.", tag:"Obligatoire"},
      {q:"Blessures et coupures", a:"Toute plaie sur les mains doit être protégée par un pansement étanche et une protection supplémentaire (gant, doigtier).", tag:"Obligatoire"},
      {q:"En cas de maladie", a:"Toute personne présentant des symptômes gastro-intestinaux (vomissements, diarrhée) ne doit pas manipuler d'aliments jusqu'à guérison complète.", tag:"Obligatoire"},
      {q:"Bijoux et ongles", a:"Pas de bijoux aux mains et poignets en zone de préparation. Ongles courts, sans vernis, sans faux ongles.", tag:"Obligatoire"},
      {q:"Formation", a:"Chaque membre de l'équipe manipulant des denrées doit être formé aux bases de l'hygiène alimentaire (formation HACCP obligatoire pour au moins une personne de l'établissement).", tag:"Réglementaire"},
    ],
  },
  {
    key: "pest", icon: "🐀", title: "Nuisibles", color: "#D55C5C",
    cards: [
      {q:"Contrôle régulier", a:"Inspection visuelle quotidienne des zones à risque (réserves, angles, arrière des équipements). Contrat avec un prestataire recommandé pour les visites périodiques.", tag:"Bonnes pratiques"},
      {q:"En cas de détection", a:"Isoler immédiatement les denrées potentiellement contaminées, documenter l'incident, faire intervenir le prestataire nuisibles rapidement.", tag:"Réglementaire"},
      {q:"Prévention", a:"Stockage hermétique des denrées, gestion stricte des déchets, absence de zones humides ou d'accumulation de restes alimentaires.", tag:"Bonnes pratiques"},
    ],
  },
];

function GbphCard({card}){
  const[open,setOpen]=useState(false);
  return(
    <div className="card" style={{marginBottom:8,cursor:"pointer"}} onClick={()=>setOpen(!open)}>
      <div className="between">
        <div style={{fontWeight:700,fontSize:14}}>{card.q}</div>
        <span className={`badge ${card.tag==="Réglementaire"||card.tag==="Obligatoire"?"b-bad":"b-info"}`} style={{flexShrink:0,marginLeft:8}}>{card.tag}</span>
      </div>
      {open&&<div className="text-sm text-dim mt8" style={{lineHeight:1.5}}>{card.a}</div>}
    </div>
  );
}

// Écran notice : mode d'emploi de l'app. Filtré par public — l'équipe ne voit
// que ce qui la concerne, les admins ont accès à tout.
function ManualGuide({user}){
  const isAdmin=!!user?.isAdmin;
  const[audience,setAudience]=useState("equipe");
  const[search,setSearch]=useState("");

  // Un non-admin n'a pas accès aux sections d'administration.
  const available=MANUAL_SECTIONS.filter(s=>isAdmin?s.audience===audience:s.audience==="equipe");
  const[section,setSection]=useState(available[0]?.key);
  const current=available.find(s=>s.key===section)||available[0];

  const filtered = search.trim()
    ? MANUAL_SECTIONS
        .filter(s=>isAdmin||s.audience==="equipe")
        .flatMap(s=>s.cards.map(cd=>({...cd,section:s})))
        .filter(cd=>cd.q.toLowerCase().includes(search.toLowerCase())||cd.a.toLowerCase().includes(search.toLowerCase()))
    : null;

  function switchAudience(a){
    haptic.light(); setAudience(a);
    const first=MANUAL_SECTIONS.find(s=>s.audience===a);
    if(first)setSection(first.key);
  }

  return(<div className="page">
    <div className="section-title">Notice d'utilisation</div>
    <div className="section-sub">Comment se servir de Fuego</div>

    <div className="field" style={{marginBottom:14}}>
      <input className="input" placeholder="Rechercher (ex : température, étiquette, créneau…)" value={search} onChange={e=>setSearch(e.target.value)}/>
    </div>

    {filtered ? (
      <>
        <div className="text-xs text-dim mb8">{filtered.length} résultat{filtered.length>1?"s":""}</div>
        {filtered.length===0
          ? <div className="empty"><div className="empty-icon">🔍</div><div className="empty-title">Aucun résultat</div><div className="empty-sub">Essayez un autre mot</div></div>
          : filtered.map((cd,i)=>(
            <div key={i}>
              <div className="text-xs" style={{color:cd.section.color,fontWeight:700,marginBottom:4}}>{cd.section.icon} {cd.section.title}</div>
              <GbphCard card={{...cd,tag:cd.section.audience==="admin"?"Admin":"Équipe"}}/>
            </div>
          ))}
      </>
    ) : (
      <>
        {/* Le sélecteur de public n'a de sens que pour un admin : l'équipe ne
            voit que sa propre notice, sans distraction. */}
        {isAdmin && (
          <>
            <SegmentedControl value={audience} onChange={switchAudience}
              options={[{value:"equipe",label:"👨‍🍳 Équipe"},{value:"admin",label:"⚙️ Admin"}]}/>
            <div style={{height:14}}></div>
          </>
        )}

        <div className="chips" style={{marginBottom:16}}>
          {available.map(s=>(
            <button key={s.key} className={`chip ${section===s.key?"sel":""}`} onClick={()=>{haptic.light();setSection(s.key);}}>{s.icon} {s.title}</button>
          ))}
        </div>
        {current && <>
          <div className="bucket-label">{current.icon} {current.title}</div>
          {current.cards.map((cd,i)=><GbphCard key={i} card={{...cd,tag:current.audience==="admin"?"Admin":"Équipe"}}/>)}
        </>}
      </>
    )}

    <div className="banner banner-info mt14"><span>💡</span><div style={{fontSize:11,lineHeight:1.5}}>
      Cette notice explique l'application. Pour les règles d'hygiène (températures légales, DLC, conservation…), voyez le <b>Guide des bonnes pratiques</b> dans le menu HACCP.
    </div></div>
  </div>);
}

function GbphGuide({initialSection}){
  const[section,setSection]=useState(initialSection||GBPH_SECTIONS[0].key);
  const[search,setSearch]=useState("");
  const current=GBPH_SECTIONS.find(s=>s.key===section)||GBPH_SECTIONS[0];

  const filtered = search.trim()
    ? GBPH_SECTIONS.flatMap(s=>s.cards.map(c=>({...c,section:s})))
        .filter(c=>c.q.toLowerCase().includes(search.toLowerCase())||c.a.toLowerCase().includes(search.toLowerCase()))
    : null;

  return(<div className="page">
    <div className="section-title">Guide des bonnes pratiques</div>
    <div className="section-sub">Aide-mémoire HACCP — accès rapide</div>

    <div className="field" style={{marginBottom:14}}>
      <input className="input" placeholder="Rechercher (ex: température, DLC, mains...)" value={search} onChange={e=>setSearch(e.target.value)}/>
    </div>

    {filtered ? (
      <>
        <div className="text-xs text-dim mb8">{filtered.length} résultat{filtered.length>1?"s":""}</div>
        {filtered.length===0
          ? <div className="empty"><div className="empty-icon">🔍</div><div className="empty-title">Aucun résultat</div><div className="empty-sub">Essaie un autre mot-clé</div></div>
          : filtered.map((c,i)=>(
            <div key={i}>
              <div className="text-xs" style={{color:c.section.color,fontWeight:700,marginBottom:4}}>{c.section.icon} {c.section.title}</div>
              <GbphCard card={c}/>
            </div>
          ))}
      </>
    ) : (
      <>
        <div className="chips" style={{marginBottom:16}}>
          {GBPH_SECTIONS.map(s=>(
            <button key={s.key} className={`chip ${section===s.key?"sel":""}`} onClick={()=>{haptic.light();setSection(s.key);}}>{s.icon} {s.title}</button>
          ))}
        </div>
        <div className="bucket-label">{current.icon} {current.title}</div>
        {current.cards.map((c,i)=><GbphCard key={i} card={c}/>)}
      </>
    )}

    <div className="banner banner-info mt14"><span>ℹ️</span><div style={{fontSize:11,lineHeight:1.5}}>
      Synthèse pratique à titre d'aide-mémoire. Le Guide des Bonnes Pratiques d'Hygiène officiel de ta branche professionnelle reste la référence complète en cas de contrôle.
    </div></div>
  </div>);
}

// Petit bouton d'aide contextuelle — à poser sur n'importe quel écran HACCP.
// Ouvre directement la bonne section du guide.
// Bouton d'aide contextuelle : discret, ancré en haut de la page (pas en
// position flottante fixe), s'intègre au flux normal du contenu — s'affiche
// donc toujours au même endroit relatif, sans risque de recouvrement ni de
// calcul de position instable.
function GbphHelpButton({section,go}){
  return(
    <button
      onClick={()=>go("gbph",{section})}
      style={{display:"inline-flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:20,background:T.bg2,border:`1px solid ${T.border}`,color:T.textDim,fontSize:12,fontWeight:600,marginBottom:12}}
      aria-label="Aide GBPH"
    ><span style={{color:"#FF6B00",fontWeight:800}}>?</span> Aide</button>
  );
}

function HaccpHub({data,go,lang}){
  const total=data.haccpSettings.fridgeTargets.length;
  const fridgesAlert=data.haccpSettings.fridgeTargets.filter(f=>{const m=getReleve(data,f.id,"matin"),s=getReleve(data,f.id,"soir");return(m&&tempStatus(m.temp,f.target)==="bad")||(s&&tempStatus(s.temp,f.target)==="bad");}).length;
  const cleanOk=data.cleaning.filter(c=>cleaningIsDoneToday(c,data.cleaningChecks,data.haccpSettings?.resetSoir)).length;
  const alerts=data.traceability.filter(t=>t.status!=="ok").length;
  const oilAlert=data.oils.filter(o=>o.polaires>=data.haccpSettings.oilPolarMax).length;
  const coolAlert=data.cooling.filter(c=>c.status==="alert").length;
  const trAlert=data.training.filter(t=>new Date(t.haccpExp.split("/").reverse().join("-"))<new Date()).length;
  const groups=[
    {title:t("haccp_group_daily",lang),items:[
      {key:"temps",icon:"🌡️",bg:T.infoBg,title:t("temp_title",lang),sub:t("temp_hub_sub",lang),badge:fridgesAlert>0?{l:`${fridgesAlert} hors norme`,c:"b-bad"}:{l:"OK",c:"b-good"}},
      {key:"reception",icon:"🚚",bg:T.infoBg,title:t("recv_title",lang),sub:t("recv_hub_sub",lang),badge:{l:`${data.reception.length} fiches`,c:"b-info"}},
      {key:"cooling",icon:"❄️",bg:T.infoBg,title:t("cool_title",lang),sub:t("cool_subtitle",lang),badge:coolAlert>0?{l:`${coolAlert} alerte`,c:"b-bad"}:{l:"OK",c:"b-good"}},
      {key:"reheating",icon:"🔥",bg:T.warnBg,title:t("reheat_title",lang),sub:<>{t("reheat_hub_label",lang)} <bdi dir="ltr">≥ 63°C</bdi></>,badge:{l:t("reheat_badge_tracked",lang),c:"b-mute"}},
      {key:"oils",icon:"🍟",bg:T.warnBg,title:t("oils_title",lang),sub:<>{t("oils_subtitle_label",lang)} <bdi dir="ltr">&lt; 25%</bdi></>,badge:oilAlert>0?{l:"À changer",c:"b-bad"}:{l:"OK",c:"b-good"}},
    ]},
    {title:t("haccp_group_trace",lang),items:[
      {key:"trace",icon:"📦",bg:T.warnBg,title:t("trace_title",lang),sub:`${data.traceability.length} ${t("trace_count_products",lang)}`,badge:alerts>0?{l:`${alerts} alerte`,c:"b-bad"}:{l:"OK",c:"b-good"}},
      {key:"labels",icon:"🏷️",bg:T.goodBg,title:t("label_title",lang),sub:t("label_hub_sub",lang),badge:{l:`${data.labels.length}`,c:"b-info"}},
    ]},
    {title:t("haccp_group_hygiene",lang),items:[
      {key:"clean",icon:"🧹",bg:T.goodBg,title:t("clean_title",lang),sub:`${cleanOk}/${data.cleaning.length} ${t("clean_zones_word",lang)}`,badge:cleanOk===data.cleaning.length?{l:t("clean_status_done",lang),c:"b-good"}:{l:t("clean_status_ongoing",lang),c:"b-warn"}},
      {key:"pests",icon:"🐀",bg:T.badBg,title:t("pest_title",lang),sub:t("pest_hub_sub",lang),badge:{l:"À jour",c:"b-good"}},
      {key:"training",icon:"🎓",bg:T.infoBg,title:t("train_title",lang),sub:t("train_hub_sub",lang),badge:trAlert>0?{l:`${trAlert} expiré`,c:"b-bad"}:{l:"OK",c:"b-good"}},
    ]},
  ];
  return(<div className="page"><div className="section-title">{t("haccp_hub_title",lang)}</div><div className="section-sub">{t("haccp_hub_subtitle",lang)}</div>
    <div className="item" onClick={()=>go("registre")} style={{background:"linear-gradient(135deg,#1A1A1A,#242424)",border:"1px solid #FF6B00",marginBottom:10}}>
      <div className="item-icon" style={{background:"linear-gradient(135deg,#FF6B00,#E8390A)"}}>📋</div>
      <div className="item-body"><div className="item-title">Registre HACCP</div><div className="item-sub">Historique complet, filtres, export PDF</div></div>
      <span className="item-arrow">›</span>
    </div>
    <div className="item" onClick={()=>go("gbph")} style={{background:T.bg2,border:`1px solid ${T.border}`,marginBottom:20}}>
      <div className="item-icon" style={{background:"#B85CB025"}}>📖</div>
      <div className="item-body"><div className="item-title">Guide des bonnes pratiques</div><div className="item-sub">Aide-mémoire hygiène, températures, DLC</div></div>
      <span className="item-arrow">›</span>
    </div>
    {groups.map(g=>(<div key={g.title} style={{marginBottom:20}}><div className="bucket-label">{g.title}</div>{g.items.map(it=><div key={it.key} className="item" onClick={()=>go(it.key)}><div className="item-icon" style={{background:it.bg}}>{it.icon}</div><div className="item-body"><div className="item-title">{it.title}</div><div className="item-sub">{it.sub}</div></div><span className={`badge ${it.badge.c}`}>{it.badge.l}</span></div>)}</div>))}
  </div>);
}

function Temperatures({data,setData,user,db,reload,go,markLocalWrite,lang}){
  const[editing,setEditing]=useState(null);const[pickedTemp,setPickedTemp]=useState(null);
  const[tempTab,setTempTab]=useState("positif"); // positif = frigos, negatif = congélateurs
  function openSlot(f,p){const e=getReleve(data,f.id,p);setEditing({fridge:f,period:p});setPickedTemp(e?e.temp:tempCenter(f.target));}
  async function save(){
    if(!editing||pickedTemp===null)return;
    const date=serviceDateStr(data?.haccpSettings?.resetSoir);
    const fridgeId=editing.fridge.id, period=editing.period, time=nowTime();
    // On connaît déjà le relevé existant côté local : on passe son id pour
    // éviter une requête de lecture supplémentaire avant l'écriture.
    const existing=data.fridgeReleves.find(r=>r.fridgeId===fridgeId&&r.date===date&&r.period===period);
    const res=await db.saveReleve({fridgeId,date,period,temp:pickedTemp,time,operatorId:user.id,existingId:existing?.id});
    if(res?.error){alert("Le relevé n'a pas été enregistré. Vérifie la connexion Supabase.");await reload({force:true});return;}
    // Mise à jour locale immédiate (pas de reload complet des 20 tables juste
    // pour un relevé) : on remplace ou ajoute l'entrée directement dans l'état.
    markLocalWrite?.();
    setData(d=>{
      const existingIdx=d.fridgeReleves.findIndex(r=>r.fridgeId===fridgeId&&r.date===date&&r.period===period);
      const entry={id:existingIdx>=0?d.fridgeReleves[existingIdx].id:Date.now(),fridgeId,date,period,temp:pickedTemp,time,operatorId:user.id};
      const next=existingIdx>=0
        ? d.fridgeReleves.map((r,i)=>i===existingIdx?entry:r)
        : [...d.fridgeReleves,entry];
      return {...d,fridgeReleves:next};
    });
    setEditing(null);setPickedTemp(null);
  }
  function cancel(){setEditing(null);setPickedTemp(null);}
  const userById=id=>data.users.find(u=>u.id===id);
  const allBad=data.haccpSettings.fridgeTargets.filter(f=>{const m=getReleve(data,f.id,"matin"),s=getReleve(data,f.id,"soir");return(m&&tempStatus(m.temp,f.target)==="bad")||(s&&tempStatus(s.temp,f.target)==="bad");});
  // Un équipement sans type explicite est considéré comme un frigo (positif) par défaut.
  const isNeg=f=>f.type==="negatif";
  const frigos=data.haccpSettings.fridgeTargets.filter(f=>!isNeg(f));
  const congels=data.haccpSettings.fridgeTargets.filter(f=>isNeg(f));
  const shown=tempTab==="negatif"?congels:frigos;
  return(<div className="page">
    <GbphHelpButton section="temp" go={go}/>
    <div className="section-title">{t("temp_title",lang)}</div><div className="section-sub">{t("temp_subtitle",lang)}</div>
    {allBad.length>0&&<div className="urgent-card" style={{padding:"12px 14px",margin:"0 0 12px"}}><div className="urgent-label" style={{marginBottom:4}}>🚨 {allBad.length} {t("temp_out_of_range",lang)}</div><div style={{fontSize:12,opacity:.9}}>{t("temp_check_now",lang)}</div></div>}
    <SegmentedControl value={tempTab} onChange={setTempTab} options={[{value:"positif",label:`❄️ ${t("temp_fridges",lang)}${frigos.length?` (${frigos.length})`:""}`},{value:"negatif",label:`🧊 ${t("temp_freezers",lang)}${congels.length?` (${congels.length})`:""}`}]}/>
    <div style={{height:14}}></div>
    {shown.length===0&&<div className="empty"><div className="empty-icon">{tempTab==="negatif"?"🧊":"❄️"}</div><div className="empty-title">{tempTab==="negatif"?t("temp_empty_freezer",lang):t("temp_empty_fridge",lang)}</div><div className="empty-sub">{t("temp_empty_sub",lang)}</div></div>}
    {shown.map(f=>{
      const m=getReleve(data,f.id,"matin"),s=getReleve(data,f.id,"soir");
      const mOp=m?userById(m.operatorId):null,sOp=s?userById(s.operatorId):null;
      const mC=m?tempStatus(m.temp,f.target):"",sC=s?tempStatus(s.temp,f.target):"";
      return(<div key={f.id} className="card">
        <div className="between mb12"><div className="row gap10"><div style={{fontSize:24}}>{f.icon}</div><div><div className="item-title">{f.name}</div><div className="text-xs text-dim">{t("temp_target",lang)} : {f.target}°C</div></div></div></div>
        <div className="row gap8">
          <button className={`temp-slot ${m?mC:"empty"}`} onClick={()=>openSlot(f,"matin")}><div className="temp-slot-period">☀️ {t("temp_morning",lang)}</div>{m?<><div className="temp-slot-val tabular">{m.temp}°</div><div className="temp-slot-meta tabular">{m.time} · {mOp?.initials}</div></>:<div className="temp-slot-cta">{t("temp_add",lang)}</div>}</button>
          <button className={`temp-slot ${s?sC:"empty"}`} onClick={()=>openSlot(f,"soir")}><div className="temp-slot-period">🌙 {t("temp_evening",lang)}</div>{s?<><div className="temp-slot-val tabular">{s.temp}°</div><div className="temp-slot-meta tabular">{s.time} · {sOp?.initials}</div></>:<div className="temp-slot-cta">{t("temp_add",lang)}</div>}</button>
        </div>
      </div>);
    })}
    {editing&&<div className="overlay" onClick={cancel}><div className="sheet" onClick={e=>e.stopPropagation()}>
      <div className="sheet-handle"></div>
      <div className="sheet-title">{editing.fridge.icon} {editing.fridge.name}</div>
      <div className="text-sm text-dim mb14">{t("temp_reading_for",lang)} {editing.period==="matin"?t("temp_morning",lang):t("temp_evening",lang)} · {t("temp_target",lang)} : {editing.fridge.target}°C</div>
      <div className="field"><label className="label">{t("temp_title",lang)}</label><TapDial value={pickedTemp} onChange={setPickedTemp} center={tempCenter(editing.fridge.target)} colorFn={v=>tempStatus(v,editing.fridge.target)}/></div>
      {pickedTemp!==null&&tempStatus(pickedTemp,editing.fridge.target)==="bad"&&<div className="banner banner-bad mb12"><span>🚨</span><div><b>{t("temp_out_of_range_warn",lang)}</b></div></div>}
      <div className="text-xs text-dim mb12 center">{t("temp_signed",lang)} : <b style={{color:T.text}}>{user.name}</b> à {nowTime()}</div>
      <button className="btn btn-primary mb8" onClick={save}>✓ {t("temp_save",lang)}</button>
      <button className="btn btn-ghost" onClick={cancel}>{t("temp_cancel",lang)}</button>
    </div></div>}
  </div>);
}

function Reception({data,setData,user,db,reload,go,markLocalWrite,lang}){
  const[show,setShow]=useState(false);const[temp,setTemp]=useState(3);const[aspect,setAspect]=useState("OK");const[emb,setEmb]=useState("OK");
  const[form,setForm]=useState({supplier:"",product:"",qty:"",dlc:"",lot:""});
  async function save(){
    if(!form.product)return;
    const res=await db.addReception({date:todayStr(),supplier:form.supplier,product:form.product,qty:form.qty,dlc:form.dlc,lot:form.lot,temp,tempOk:temp<=4,aspect,emballage:emb,signed:user.name});
    if(res?.error){alert("La réception n'a pas été enregistrée. Vérifie la connexion Supabase.");await reload({force:true});return;}
    // Mise à jour locale immédiate à partir de la ligne réellement créée
    // (avec son vrai id Supabase) — pas de reload complet des 20 tables.
    if(res?.data){
      const r=res.data;
      markLocalWrite?.();
      setData(d=>({...d,reception:[{id:r.id,date:r.date,supplier:r.supplier,product:r.product,qty:r.qty,temp:r.temp,tempOk:r.temp_ok,dlc:r.dlc,lot:r.lot,aspect:r.aspect,emballage:r.emballage,signed:r.signed},...d.reception]}));
    }
    setShow(false);setTemp(3);setAspect("OK");setEmb("OK");setForm({supplier:"",product:"",qty:"",dlc:"",lot:""});
  }
  return(<div className="page">
    <GbphHelpButton section="trace" go={go}/>
    <div className="section-title">{t("recv_title",lang)}</div><div className="section-sub">{t("recv_subtitle",lang)}</div>
    {data.reception.length===0 && (
      <div className="empty">
        <div className="empty-icon">🚚</div>
        <div className="empty-title">{t("recv_empty_title",lang)}</div>
        <div className="empty-sub">{t("recv_empty_sub",lang)}</div>
      </div>
    )}
    {data.reception.map(r=><div key={r.id} className="card">
      <div className="between mb6"><div><div className="item-title">{r.product}</div><div className="item-sub">{r.supplier} · {r.qty}</div></div><span className={`badge ${r.tempOk?"b-good":"b-bad"} tabular`}>{r.temp}°C</span></div>
      <div className="row gap6 mb6" style={{flexWrap:"wrap"}}><span className={`badge ${r.aspect==="OK"?"b-good":"b-bad"}`}>Aspect {r.aspect}</span><span className={`badge ${r.emballage==="OK"?"b-good":"b-bad"}`}>Emb. {r.emballage}</span><span className="badge b-mute">{r.signed}</span></div>
      <div className="text-xs text-dim">DLC {r.dlc} · Lot {r.lot} · {r.date}</div>
    </div>)}
    <div className="fab-anchor"><button className="btn-fab" onClick={()=>setShow(true)}>+</button></div>
    {show&&<div className="overlay" onClick={()=>setShow(false)}><div className="sheet" onClick={e=>e.stopPropagation()}>
      <div className="sheet-handle"></div><div className="sheet-title">{t("recv_new",lang)}</div>
      <div className="field"><label className="label">{t("recv_product",lang)}</label><input className="input" value={form.product} onChange={e=>setForm({...form,product:e.target.value})} placeholder="ex : Saumon frais"/></div>
      <div className="field"><label className="label">{t("recv_supplier",lang)}</label><input className="input" value={form.supplier} onChange={e=>setForm({...form,supplier:e.target.value})}/></div>
      <div className="row gap8 mb14"><div style={{flex:1}}><label className="label">{t("recv_qty",lang)}</label><input className="input input-sm" value={form.qty} onChange={e=>setForm({...form,qty:e.target.value})}/></div><div style={{flex:1}}><label className="label">{t("recv_lot",lang)}</label><input className="input input-sm" value={form.lot} onChange={e=>setForm({...form,lot:e.target.value})}/></div></div>
      <div className="field"><label className="label">{t("recv_dlc",lang)}</label><input className="input" type="date" value={form.dlc} onChange={e=>setForm({...form,dlc:e.target.value})}/></div>
      <div className="field"><label className="label">{t("recv_temp_at_arrival",lang)}</label><TapDial value={temp} onChange={setTemp} center={3} colorFn={v=>v<=4?"good":v<=6?"warn":"bad"}/>{temp>4&&<div className="text-xs mt6" style={{color:T.bad}}>⚠ {t("recv_out_of_range",lang)}</div>}</div>
      <div className="field"><label className="label">{t("recv_aspect",lang)}</label><BinaryChoice value={aspect} onChange={setAspect} options={[{value:"OK",label:t("recv_conform",lang),icon:"✓",style:"good"},{value:"NON CONFORME",label:t("recv_not_conform",lang),icon:"✗",style:"bad"}]}/></div>
      <div className="field"><label className="label">{t("recv_packaging",lang)}</label><BinaryChoice value={emb} onChange={setEmb} options={[{value:"OK",label:t("recv_intact",lang),icon:"✓",style:"good"},{value:"ENDOMMAGÉ",label:t("recv_damaged",lang),icon:"✗",style:"bad"}]}/></div>
      <button className="btn btn-primary mt8" onClick={save} disabled={!form.product}>{t("recv_save",lang)}</button>
    </div></div>}
  </div>);
}

// Deux modes de passage en cellule, avec cibles et DLC réglementaires distinctes
const CELL_MODES = {
  refroid: { key:"refroid", label:"Refroidissement", icon:"❄️", sub:"63°C → 10°C à cœur", targetEnd:10, startCenter:65, endCenter:8, dlcMonths:0 },
  surgel:  { key:"surgel",  label:"Surgélation",     icon:"🧊", sub:"jusqu'à −18°C à cœur", targetEnd:-18, startCenter:65, endCenter:-18, dlcMonths:6 },
};
function Cooling({data,setData,user,db,reload,go,markLocalWrite,lang}){
  const[show,setShow]=useState(false);const[step,setStep]=useState(0);
  const[mode,setMode]=useState("refroid");
  const[form,setForm]=useState({product:"",qty:""});const[startTemp,setStartTemp]=useState(65);const[endTemp,setEndTemp]=useState(8);
  const[startMs,setStartMs]=useState(null);const[elapsed,setElapsed]=useState(0);
  const[activeCoolingId,setActiveCoolingId]=useState(null);
  const M=CELL_MODES[mode];
  // freezingMax n'a jamais été vraiment câblé (pas de colonne en base, pas de
  // champ dans les Paramètres) — il n'existait que dans les données de démo,
  // donc en production la limite retombait toujours sur 240 min en dur, sans
  // aucun moyen de la changer. coolingMax, lui, est le seul seuil réellement
  // paramétrable (Paramètres → Seuils critiques) : on l'utilise pour les deux
  // modes plutôt que de maintenir un réglage fantôme.
  const maxMin=data.haccpSettings.coolingMax;
  useEffect(()=>{if(step!==2)return;const i=setInterval(()=>setElapsed(Math.floor((Date.now()-startMs)/1000)),1000);return()=>clearInterval(i);},[step,startMs]);
  const fmt=s=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  const limitSec=Math.max(1,safeNum(maxMin,120))*60;const overtime=elapsed>limitSec;const progress=startMs?safePct(elapsed,limitSec):0;
  async function start(){
    const r=await db.startCooling({product:form.product,qty:form.qty,startTemp,startedMs:Date.now(),operator:user.name,date:todayStr()});
    if(r?.error){alert("Le passage en cellule n'a pas pu démarrer. Vérifie la connexion Supabase.");return;}
    // La ligne créée est déjà renvoyée par Supabase : on l'ajoute localement
    // plutôt que de recharger les 20 tables.
    if(r?.data){
      const x=r.data;
      setActiveCoolingId(x.id);
      markLocalWrite?.();
      setData(d=>({...d,cooling:[{id:x.id,product:x.product,qty:x.qty,startTemp:x.start_temp,endTemp:x.end_temp,duration:x.duration,startedMs:x.started_ms,operator:x.operator,status:x.status,date:x.date,dlc:x.dlc},...d.cooling]}));
    }
    setStartMs(Date.now());setElapsed(0);setStep(2);
  }
  async function finish(){const dur=Math.floor(elapsed/60);const conform=mode==="surgel"?(endTemp<=-18):(dur<=maxMin&&endTemp<=10);const status=conform?"ok":"alert";
    const dlc=M.dlcMonths
      ? (()=>{const d=new Date();d.setMonth(d.getMonth()+M.dlcMonths);return d.toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"2-digit"});})()
      : new Date(Date.now()+data.haccpSettings.labelDlcDefault*86400000).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit"});
    if(activeCoolingId){
      const res=await db.finishCooling(activeCoolingId,{endTemp,duration:dur,status,dlc,mode});
      if(res?.error){alert("Le passage en cellule n'a pas été clôturé. Vérifie la connexion Supabase.");await reload({force:true});return;}
      markLocalWrite?.();
      setData(d=>({...d,cooling:d.cooling.map(x=>x.id===activeCoolingId?{...x,endTemp,duration:dur,status,dlc,mode}:x)}));
    }
    setShow(false);setStep(0);setMode("refroid");setStartMs(null);setElapsed(0);setStartTemp(65);setEndTemp(8);setForm({product:"",qty:""});setActiveCoolingId(null);}
  const coolingDone=data.cooling.filter(c=>c.status!=="active");
  // Refroidissement en cours quelque part (même si on a quitté l'écran, swipe,
  // app fermée par iOS...) : on le retrouve depuis la vraie donnée persistée
  // (statut "active" en base), pas depuis un état local qui, lui, se perd.
  const activeCooling = data.cooling.find(c=>c.status==="active");
  function resumeActive(){
    if(!activeCooling)return;
    haptic.light();
    setActiveCoolingId(activeCooling.id);
    setMode(activeCooling.mode||"refroid");
    setForm({product:activeCooling.product,qty:activeCooling.qty});
    setStartTemp(activeCooling.startTemp);
    setEndTemp(CELL_MODES[activeCooling.mode||"refroid"].endCenter);
    // startMs vient de la vraie donnée enregistrée au démarrage (started_ms),
    // pas de Date.now() : le temps écoulé reste exact même après une longue
    // absence, pile ce qui manquait pour pouvoir vraiment "y retourner".
    setStartMs(activeCooling.startedMs);
    setElapsed(Math.floor((Date.now()-activeCooling.startedMs)/1000));
    setStep(2);
    setShow(true);
  }
  return(<div className="page">
    <GbphHelpButton section="temp" go={go}/>
    <div className="section-title">{t("cool_title",lang)}</div><div className="section-sub">{t("cool_subtitle",lang)}</div>
    {activeCooling && (
      <div className="card mb14" onClick={resumeActive} style={{cursor:"pointer",border:`1.5px solid ${T.warn}`,background:T.warnBg}}>
        <div className="between">
          <div><div className="item-title">⏳ {activeCooling.product}</div><div className="item-sub">{CELL_MODES[activeCooling.mode||"refroid"].label} en cours · démarré à {new Date(activeCooling.startedMs).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</div></div>
          <span className="item-arrow" style={{color:T.warn}}>↩</span>
        </div>
      </div>
    )}
    {coolingDone.length===0 && !activeCooling && <div className="empty"><div className="empty-icon">❄️</div><div className="empty-title">{t("cool_empty_title",lang)}</div><div className="empty-sub">{t("cool_empty_sub",lang)}</div></div>}
    {coolingDone.map(c=>{const cm=CELL_MODES[c.mode||"refroid"];const okTemp=(c.mode==="surgel")?c.endTemp<=-18:c.endTemp<=10;return(<div key={c.id} className="card">
      <div className="between mb6"><div><div className="item-title">{cm.icon} {c.product}</div><div className="item-sub">{cm.label} · {c.qty} · {c.date}</div></div><span className={`badge ${c.status==="ok"?"b-good":"b-bad"}`}>{c.status==="ok"?"✓ OK":"⚠"}</span></div>
      <div className="row gap12" style={{flexWrap:"wrap"}}><div><div className="text-xs text-dim">Départ</div><div className="text-sm fw7 tabular">{c.startTemp}°C</div></div><div><div className="text-xs text-dim">Arrivée</div><div className="text-sm fw7 tabular" style={{color:okTemp?T.good:T.bad}}>{c.endTemp}°C</div></div><div><div className="text-xs text-dim">Durée</div><div className="text-sm fw7 tabular" style={{color:c.duration<=maxMin?T.good:T.bad}}>{c.duration} min</div></div></div>
      <div className="text-xs text-dim mt6">DLC : {c.dlc} · {c.operator}</div>
    </div>);})}
    <div className="fab-anchor"><button className="btn-fab" onClick={()=>{setStep(0);setMode("refroid");setShow(true);}}>+</button></div>
    {show&&<div className="overlay" onClick={()=>setShow(false)}><div className="sheet" onClick={e=>e.stopPropagation()}>
      <div className="sheet-handle"></div>
      {step===0&&<><div className="sheet-title">{t("cool_new",lang)}</div>
        <div className="text-sm text-dim center mb14">{t("cool_which_operation",lang)}</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:8}}>
          {Object.values(CELL_MODES).map(cm=>{
            // CELL_MODES est une constante hors composant : on traduit ici,
            // au rendu, comme pour CLEAN_FREQS.
            const lbl = cm.key==="refroid" ? t("cool_mode_refroid",lang) : t("cool_mode_surgel",lang);
            const sb = cm.key==="refroid" ? t("cool_mode_refroid_sub",lang) : t("cool_mode_surgel_sub",lang);
            return (
              <button key={cm.key} onClick={()=>{haptic.light();setMode(cm.key);setEndTemp(cm.endCenter);setStep(1);}}
                style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,padding:"22px 10px",borderRadius:16,border:`1.5px solid ${T.border}`,background:T.bg2,color:T.text,cursor:"pointer"}}>
                <span style={{fontSize:34}}>{cm.icon}</span>
                <span style={{fontSize:14,fontWeight:800}}>{lbl}</span>
                <span style={{fontSize:10.5,color:T.textDim,textAlign:"center",lineHeight:1.2}}>{sb}</span>
              </button>
            );
          })}
        </div></>}
      {step===1&&<><div className="sheet-title">{M.icon} {mode==="refroid"?t("cool_mode_refroid",lang):t("cool_mode_surgel",lang)}</div>
        <div className="text-xs text-dim center mb12">{mode==="refroid"?t("cool_mode_refroid_sub",lang):t("cool_mode_surgel_sub",lang)}{M.dlcMonths?` · DLC +${M.dlcMonths} mois`:""}</div>
        <div className="field"><label className="label">{t("cool_product",lang)}</label><input className="input" value={form.product} onChange={e=>setForm({...form,product:e.target.value})}/></div>
        <div className="field"><label className="label">{t("cool_qty",lang)}</label><input className="input" value={form.qty} onChange={e=>setForm({...form,qty:e.target.value})}/></div>
        <div className="field"><label className="label">{t("cool_start_temp",lang)}</label><TapDial value={startTemp} onChange={setStartTemp} center={65} step={2} colorFn={v=>v>=63?"good":"warn"}/></div>
        <div className="row gap8"><button className="btn btn-ghost" style={{flex:"0 0 auto",width:52}} onClick={()=>setStep(0)}>←</button><button className="btn btn-primary" style={{flex:1}} onClick={start} disabled={!form.product}>{t("cool_start_timer",lang)}</button></div></>}
      {step===2&&<><div className="sheet-title center">{form.product}</div>
        <div className="text-sm text-dim center mb6">{t("cool_departure",lang)} : {startTemp}°C · {t("cool_limit",lang)} : {maxMin} min</div>
        <div className="timer-display tabular" style={{color:overtime?T.bad:elapsed>maxMin*60*.75?T.warn:T.text}}>{fmt(elapsed)}</div>
        <div className="center mb12"><span style={{fontSize:12,fontWeight:600,color:overtime?T.bad:elapsed>maxMin*60*.75?T.warn:T.good}}>{overtime?t("cool_over_limit",lang):elapsed>maxMin*60*.75?t("cool_near_limit",lang):t("cool_on_time",lang)}</span></div>
        <div className="pbar mb12"><div className="pfill" style={{width:`${progress}%`,background:overtime?T.bad:elapsed>maxMin*60*.75?T.warn:T.good}}></div></div>
        <button className="btn btn-primary" onClick={()=>setStep(3)}>{t("cool_read_final",lang)}</button></>}
      {step===3&&<><div className="sheet-title">{t("cool_final_temp",lang)}</div>
        <div className="text-sm text-dim mb12">{t("cool_duration",lang)} : <b style={{color:T.text}}>{Math.floor(elapsed/60)} min</b></div>
        {mode==="surgel"
          ? <div className="field"><label className="label">{t("cool_core_temp_surgel",lang)}</label><TapDial value={endTemp} onChange={setEndTemp} center={-18} step={2} colorFn={v=>v<=-18?"good":"bad"}/></div>
          : <div className="field"><label className="label">{t("cool_core_temp_refroid",lang)}</label><TapDial value={endTemp} onChange={setEndTemp} center={8} colorFn={v=>v<=10?"good":"bad"}/></div>}
        {mode==="surgel"&&endTemp>-18&&<div className="banner banner-bad mb12"><span>⚠️</span><div><b>{t("cool_nonconform",lang)}</b> {t("cool_continue_freezing",lang)}</div></div>}
        {mode==="surgel"&&endTemp<=-18&&<div className="banner banner-good mb12"><span>✓</span><div><b>{t("cool_conform",lang)}</b> {t("cool_frozen_dlc",lang)}</div></div>}
        {mode==="refroid"&&endTemp>10&&<div className="banner banner-bad mb12"><span>⚠️</span><div><b>{t("cool_nonconform",lang)}</b> {t("cool_recook_discard",lang)}</div></div>}
        {mode==="refroid"&&endTemp<=10&&elapsed<=maxMin*60&&<div className="banner banner-good mb12"><span>✓</span><div><b>{t("cool_conform",lang)}</b> {t("cool_dlc_j",lang)}{data.haccpSettings.labelDlcDefault}.</div></div>}
        <button className="btn btn-primary" onClick={finish}>{t("cool_save",lang)}</button></>}
    </div></div>}
  </div>);
}

function Reheating({data,setData,user,db,reload,go,markLocalWrite,lang}){
  const[show,setShow]=useState(false);const[form,setForm]=useState({product:""});const[endTemp,setEndTemp]=useState(65);const[duration,setDuration]=useState(30);
  const{reheatMin,reheatMaxTime}=data.haccpSettings;
  async function save(){
    if(!form.product)return;
    const status=endTemp>=reheatMin&&duration<=reheatMaxTime?"ok":"alert";
    const res=await db.addReheating({product:form.product,endTemp,duration,operator:user.name,status,date:todayStr()});
    if(res?.error){alert("La remise en température n'a pas été enregistrée. Vérifie la connexion Supabase.");await reload({force:true});return;}
    // Mise à jour locale immédiate — évite de recharger les 20 tables.
    if(res?.data){const r=res.data;markLocalWrite?.();setData(d=>({...d,reheating:[{id:r.id,product:r.product,endTemp:r.end_temp,duration:r.duration,operator:r.operator,status:r.status,date:r.date},...d.reheating]}));}
    setShow(false);setForm({product:""});setEndTemp(65);setDuration(30);
  }
  return(<div className="page">
    <GbphHelpButton section="temp" go={go}/>
    <div className="section-title">{t("reheat_title",lang)}</div><div className="section-sub"><bdi dir="ltr">≥ {reheatMin}°C</bdi> {t("common_within",lang)} <bdi dir="ltr">{reheatMaxTime} min</bdi></div>
    {data.reheating.length===0 && <div className="empty"><div className="empty-icon">🔥</div><div className="empty-title">{t("reheat_empty_title",lang)}</div><div className="empty-sub">{t("reheat_empty_sub",lang)}</div></div>}
    {data.reheating.map(r=><div key={r.id} className="card">
      <div className="between mb6"><div><div className="item-title">{r.product}</div><div className="item-sub">{r.date} · {r.operator}</div></div><span className={`badge ${r.status==="ok"?"b-good":"b-bad"}`}>{r.status==="ok"?"✓":"⚠"}</span></div>
      <div className="row gap12" style={{flexWrap:"wrap"}}><div><div className="text-xs text-dim">{t("reheat_final_temp",lang)}</div><div className="text-sm fw7 tabular" style={{color:r.endTemp>=reheatMin?T.good:T.bad}}>{r.endTemp}°C</div></div><div><div className="text-xs text-dim">{t("reheat_duration",lang)}</div><div className="text-sm fw7 tabular" style={{color:r.duration<=reheatMaxTime?T.good:T.bad}}>{r.duration} min</div></div></div>
    </div>)}
    <div className="fab-anchor"><button className="btn-fab" onClick={()=>setShow(true)}>+</button></div>
    {show&&<div className="overlay" onClick={()=>setShow(false)}><div className="sheet" onClick={e=>e.stopPropagation()}>
      <div className="sheet-handle"></div><div className="sheet-title">{t("reheat_new",lang)}</div>
      <div className="field"><label className="label">{t("reheat_product",lang)}</label><input className="input" value={form.product} onChange={e=>setForm({...form,product:e.target.value})}/></div>
      <div className="field"><label className="label">{t("reheat_core_temp",lang)}</label><TapDial value={endTemp} onChange={setEndTemp} center={65} colorFn={v=>v>=reheatMin?"good":"bad"}/></div>
      <div className="field"><label className="label">{t("reheat_duration_min",lang)}</label><TapDial value={duration} onChange={setDuration} center={30} step={5} colorFn={v=>v<=reheatMaxTime?"good":"bad"} format={v=>`${v}'`}/></div>
      {endTemp>=reheatMin&&duration<=reheatMaxTime&&<div className="banner banner-good mb8"><span>✓</span><div><b>{t("reheat_conform",lang)}</b></div></div>}
      <button className="btn btn-primary mt8" onClick={save} disabled={!form.product}>{t("reheat_save",lang)}</button>
    </div></div>}
  </div>);
}

function Oils({data,setData,user,db,reload,go,markLocalWrite,lang}){
  const[selOil,setSelOil]=useState(null);const[polaires,setPolaires]=useState(15);const[action,setAction]=useState("filtered");
  const[showAdd,setShowAdd]=useState(false);const[newOil,setNewOil]=useState({name:"",type:"Tournesol"});
  const max=data.haccpSettings.oilPolarMax;

  async function save(){
    const oilId=selOil.id, changed=action==="changed", today=todayStr();
    const res=await db.updateOil(oilId,{polaires,operator:user.name,changed,dateInstall:today});
    if(res?.error){alert("Le test n'a pas été enregistré. Vérifie la connexion Supabase.");await reload({force:true});return;}
    // Mise à jour locale immédiate — évite de recharger les 20 tables.
    markLocalWrite?.();
    setData(d=>({...d,oils:d.oils.map(o=>o.id===oilId
      ? {...o,polaires,operator:user.name,lastTest:today,...(changed?{dateInstall:today}:{})}
      : o)}));
    setSelOil(null);setPolaires(15);setAction("filtered");
  }

  async function addOil(){
    if(!newOil.name.trim())return;
    const res=await db.addOil({name:newOil.name.trim(),type:newOil.type,operator:user.name});
    if(res?.error){alert("La friteuse n'a pas été ajoutée. Vérifie la connexion Supabase.");await reload({force:true});return;}
    if(res?.data){const o=res.data;markLocalWrite?.();setData(d=>({...d,oils:[...d.oils,{id:o.id,name:o.name,type:o.type,dateInstall:o.date_install,lastTest:o.last_test,polaires:o.polaires,operator:o.operator}]}));}
    setShowAdd(false);setNewOil({name:"",type:"Tournesol"});
  }

  async function removeOil(o){
    if(!window.confirm(`Retirer "${o.name}" du suivi des huiles ?`))return;
    const res=await db.deleteOil(o.id);
    if(res?.error){alert("La suppression a échoué. Vérifie la connexion Supabase.");await reload({force:true});return;}
    markLocalWrite?.();
    setData(d=>({...d,oils:d.oils.filter(x=>x.id!==o.id)}));
  }

  return(<div className="page">
    <GbphHelpButton section="oils" go={go}/>
    <div className="section-title">{t("oils_title",lang)}</div>
    <div className="section-sub">{t("oils_legal_threshold",lang)} <bdi dir="ltr">{max}%</bdi></div>

    {data.oils.length===0 ? (
      <div className="empty">
        <div className="empty-icon">🍟</div>
        <div className="empty-title">{t("oils_empty_title",lang)}</div>
        <div className="empty-sub">{t("oils_empty_sub",lang)}</div>
        <button className="btn btn-primary mt14" onClick={()=>setShowAdd(true)} style={{maxWidth:220,marginLeft:"auto",marginRight:"auto",display:"block"}}>{t("oils_add",lang)}</button>
      </div>
    ) : (
      <>
        {data.oils.map(o=>{const danger=o.polaires>=max;const warn=o.polaires>=max-5&&!danger;return(<div key={o.id} className="card">
          <div className="between mb10">
            <div><div className="item-title">{o.name}</div><div className="item-sub">Huile {o.type} · depuis {o.dateInstall}</div></div>
            <div style={{textAlign:"right"}}><div className="tabular" style={{fontFamily:"'Inter',sans-serif",letterSpacing:"-.03em",fontSize:28,fontWeight:700,lineHeight:1,color:danger?T.bad:warn?T.warn:T.good}}>{o.polaires}%</div><div className="text-xs text-dim">polaires</div></div>
          </div>
          <div className="pbar mb10"><div className="pfill" style={{width:`${safePct(o.polaires,max)}%`,background:danger?T.bad:warn?T.warn:T.good}}></div></div>
          <div className="row gap6 mb10"><span className={`badge ${danger?"b-bad":warn?"b-warn":"b-good"}`}>{danger?"🚨 Changer":warn?"⚠ Surveiller":"✓ OK"}</span><span className="badge b-mute">Test {o.lastTest}</span></div>
          {selOil?.id===o.id?<>
            <div className="field">
              <label className="label">Action</label>
              <SegmentedControl value={action} onChange={v=>{
                // Une huile qu'on vient de changer est neuve : 0% de composés
                // polaires par définition. Le forcer ici évite l'erreur —
                // avant, il fallait penser à redescendre le curseur à la main,
                // et l'oubli laissait une valeur trompeuse (souvent 15%) sur
                // une huile qui n'a pourtant jamais servi.
                if(v==="changed") setPolaires(0);
                // Si on revient en arrière depuis "Changée", garder 0%
                // serait faux pour une huile qui n'a en réalité pas été
                // remplacée — on repart de sa dernière mesure connue.
                else if(action==="changed") setPolaires(o.polaires ?? 15);
                setAction(v);
              }} options={[{value:"none",label:"Aucune"},{value:"filtered",label:"Filtrée"},{value:"changed",label:"Changée"}]}/>
            </div>
            {action==="changed" ? (
              <div className="banner banner-good mb10"><span>🆕</span><div style={{fontSize:12,lineHeight:1.5}}>
                Huile neuve enregistrée à <b>0%</b> de composés polaires. Prochain contrôle réel à la prochaine utilisation.
              </div></div>
            ) : (
              <div className="field"><label className="label">Composés polaires</label><TapDial value={polaires} onChange={setPolaires} center={15} step={2} colorFn={v=>v<max-5?"good":v<max?"warn":"bad"} format={v=>`${v}%`}/></div>
            )}
            <div className="row gap6 mt8"><button className="btn btn-ghost btn-sm" style={{flex:1}} onClick={()=>setSelOil(null)}>Annuler</button><button className="btn btn-primary btn-sm" style={{flex:2}} onClick={save}>Enregistrer</button></div>
          </>:(
            <div className="row gap6">
              <button className="btn btn-primary btn-sm" style={{flex:1}} onClick={()=>{setSelOil(o);setPolaires(15);setAction("filtered");}}>{t("oils_new_test",lang)}</button>
              <button className="btn btn-ghost btn-sm" style={{flex:"0 0 auto",width:40,color:T.bad}} onClick={()=>removeOil(o)}>🗑</button>
            </div>
          )}
        </div>);})}
        <button className="btn btn-ghost mt8" onClick={()=>setShowAdd(true)}>{t("oils_add_another",lang)}</button>
      </>
    )}

    {showAdd&&<div className="overlay" onClick={()=>setShowAdd(false)}><div className="sheet" onClick={e=>e.stopPropagation()}>
      <div className="sheet-handle"></div>
      <div className="sheet-title">{t("oils_new_fryer",lang)}</div>
      <div className="field"><label className="label">{t("oils_name",lang)}</label><input className="input" value={newOil.name} onChange={e=>setNewOil({...newOil,name:e.target.value})} placeholder="ex : Friteuse 1 — Frites"/></div>
      <div className="field"><label className="label">{t("oils_type",lang)}</label>
        <QuickPick value={newOil.type} onChange={v=>setNewOil({...newOil,type:v})} options={[
          {value:"Tournesol",label:"Tournesol"},{value:"Arachide",label:"Arachide"},{value:"Colza",label:"Colza"},{value:"Spéciale friture",label:"Spéciale friture"},
        ]}/>
      </div>
      <button className="btn btn-primary mt8" onClick={addOil} disabled={!newOil.name.trim()}>Ajouter</button>
    </div></div>}
  </div>);
}

// Ligne d'une fiche de traçabilité, réutilisée qu'on soit en liste plate
// (filtre précis) ou groupée par statut (vue "Tous").
function TraceRow({t,onOpen}){
  return (
    <div className="item" onClick={()=>t.hasPhoto&&onOpen(t)} style={{cursor:t.hasPhoto?"pointer":"default"}}>
      <div className="item-icon" style={{background:t.status==="expired"?T.badBg:t.status==="warn"?T.warnBg:T.infoBg,position:"relative"}}>
        {t.emoji}
        {/* Pastille photo : indique qu'une image existe, sans avoir à la
            télécharger (les vignettes de 200 photos plombaient le démarrage). */}
        {t.hasPhoto&&<span style={{position:"absolute",bottom:-2,right:-2,fontSize:10,background:T.bg2,borderRadius:"50%",width:15,height:15,display:"flex",alignItems:"center",justifyContent:"center"}}>📷</span>}
      </div>
      <div className="item-body"><div className="item-title">{t.product}</div><div className="item-sub">{t.supplier} · DLC {t.dlc}</div></div>
      <span className={`badge ${t.status==="ok"?"b-good":t.status==="warn"?"b-warn":"b-bad"}`}>{t.status==="ok"?"OK":t.status==="warn"?"Proche":"Expiré"}</span>
    </div>
  );
}

function Traceability({data,setData,db,reload,go,markLocalWrite,lang}){
  const[show,setShow]=useState(false);const[photo,setPhoto]=useState(null); // base64 de la photo capturée, en attente d'enregistrement
  const[filter,setFilter]=useState("all");
  const[detail,setDetail]=useState(null); // fiche sélectionnée pour voir sa photo en grand
  const[form,setForm]=useState({product:"",supplier:"",lot:"",dlc:"",qty:"",allergenes:""});
  function handlePhoto(e){
    const file=e.target.files[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=(ev)=>{ setPhoto(ev.target.result); }; // garde le data-URL tel quel (ré-affichable directement dans une <img>)
    reader.readAsDataURL(file);
  }
  async function save(){
    if(!form.product)return;
    const res=await db.addTraceability({product:form.product,emoji:"📦",supplier:form.supplier,lot:form.lot,dlc:form.dlc,qty:form.qty,allergenes:form.allergenes?form.allergenes.split(",").map(a=>a.trim()).filter(Boolean):[],status:"ok",photo});
    if(res?.error){alert("Le produit n'a pas été enregistré. Vérifie la connexion Supabase.");await reload({force:true});return;}
    if(res?.data){const t=res.data;markLocalWrite?.();setData(d=>({...d,traceability:[{id:t.id,product:t.product,emoji:t.emoji,supplier:t.supplier,lot:t.lot,dlc:t.dlc,qty:t.qty,allergenes:t.allergenes||[],status:t.status,photo:t.photo||null,hasPhoto:!!t.photo},...d.traceability]}));}
    setShow(false);setPhoto(null);setForm({product:"",supplier:"",lot:"",dlc:"",qty:"",allergenes:""});
  }
  // Ouvre une fiche : la photo n'est pas en mémoire (exclue du chargement
  // initial pour ne pas ralentir l'app), on la récupère seulement maintenant.
  const[loadingPhoto,setLoadingPhoto]=useState(false);
  async function openDetail(t){
    setDetail(t);
    if(!t.hasPhoto || t.photo) return; // rien à charger
    setLoadingPhoto(true);
    const res=await db.getTraceabilityPhoto?.(t.id);
    setLoadingPhoto(false);
    if(res?.photo){
      setDetail(d=>d&&d.id===t.id?{...d,photo:res.photo}:d);
      // Garde la photo en mémoire pour ne pas la retélécharger si on rouvre.
      setData(d=>({...d,traceability:d.traceability.map(x=>x.id===t.id?{...x,photo:res.photo}:x)}));
    }
  }
  const filtered=filter==="all"?data.traceability:filter==="alerts"?data.traceability.filter(t=>t.status!=="ok"):data.traceability.filter(t=>t.status==="ok");
  return(<div className="page">
    <GbphHelpButton section="trace" go={go}/>
    <div className="section-title">{t("trace_title",lang)}</div><div className="section-sub">{data.traceability.length} {t("trace_count_products",lang)}</div>
    <SegmentedControl value={filter} onChange={setFilter} options={[{value:"all",label:"Tous"},{value:"alerts",label:"⚠ Alertes"},{value:"ok",label:"✓ OK"}]}/>
    <div style={{height:14}}></div>
    {filtered.length===0?<div className="empty"><div className="empty-icon">✓</div><div className="empty-title">{t("trace_all_ok",lang)}</div></div>:(
      filter!=="all" ? (
        // Un filtre précis est déjà actif (Alertes ou OK) : liste plate,
        // pas besoin d'un sous-menu supplémentaire au-dessus.
        filtered.map(t=><TraceRow key={t.id} t={t} onOpen={openDetail}/>)
      ) : (() => {
        // Vue "Tous" : regroupée par statut, alertes ouvertes par défaut —
        // c'est ce qui a besoin d'attention immédiate. Les produits
        // conformes restent disponibles, repliés, plutôt que de noyer
        // les alertes dans une liste qui peut vite s'allonger.
        const alerts=filtered.filter(t=>t.status!=="ok");
        const oks=filtered.filter(t=>t.status==="ok");
        return (<>
          {alerts.length>0 && (
            <CollapsibleSection title="Alertes" icon="⚠️" count={alerts.length} defaultOpen={true}>
              {alerts.map(t=><TraceRow key={t.id} t={t} onOpen={openDetail}/>)}
            </CollapsibleSection>
          )}
          {oks.length>0 && (
            <div style={{marginTop:alerts.length>0?10:0}}>
              <CollapsibleSection title="Conformes" icon="✓" count={oks.length} defaultOpen={alerts.length===0}>
                {oks.map(t=><TraceRow key={t.id} t={t} onOpen={openDetail}/>)}
              </CollapsibleSection>
            </div>
          )}
        </>);
      })()
    )}
    {detail&&<div className="overlay" onClick={()=>setDetail(null)}><div className="sheet" onClick={e=>e.stopPropagation()}>
      <div className="sheet-handle"></div><div className="sheet-title">{detail.product}</div>
      {loadingPhoto&&!detail.photo&&<div style={{width:"100%",height:180,borderRadius:14,marginBottom:12,background:T.bg3,display:"flex",alignItems:"center",justifyContent:"center",color:T.textDim,fontSize:12}}>Chargement de la photo…</div>}
      {detail.photo&&<img src={detail.photo} alt="" style={{width:"100%",borderRadius:14,marginBottom:12}}/>}
      <div className="text-sm text-dim">{detail.supplier} · DLC {detail.dlc} · Lot {detail.lot}</div>
      <button className="btn btn-ghost mt14" onClick={()=>setDetail(null)}>Fermer</button>
    </div></div>}
    <div className="fab-anchor"><button className="btn-fab" onClick={()=>setShow(true)}>+</button></div>
    {show&&<div className="overlay" onClick={()=>setShow(false)}><div className="sheet" onClick={e=>e.stopPropagation()}>
      <div className="sheet-handle"></div><div className="sheet-title">{t("trace_add_product",lang)}</div>
      {photo
        ? <div style={{position:"relative",marginBottom:14}}><img src={photo} alt="" style={{width:"100%",borderRadius:14}}/><button onClick={()=>setPhoto(null)} style={{position:"absolute",top:8,right:8,width:44,height:44,borderRadius:"50%",background:"rgba(0,0,0,.6)",border:"none",color:"#fff",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button></div>
        : <label className="scan" style={{cursor:"pointer",display:"block"}}><div className="scan-icon">📸</div><div className="scan-title">{t("trace_photo",lang)}</div><div className="scan-sub">{t("trace_photo_sub",lang)}</div><input type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={handlePhoto}/></label>
      }
      <div className="field"><label className="label">{t("trace_product",lang)}</label><input className="input" value={form.product} onChange={e=>setForm({...form,product:e.target.value})}/></div>
      <div className="field"><label className="label">{t("trace_supplier",lang)}</label><input className="input" value={form.supplier} onChange={e=>setForm({...form,supplier:e.target.value})}/></div>
      <div className="row gap8 mb14"><div style={{flex:1}}><label className="label">{t("trace_lot",lang)}</label><input className="input input-sm" value={form.lot} onChange={e=>setForm({...form,lot:e.target.value})}/></div><div style={{flex:1}}><label className="label">{t("trace_qty",lang)}</label><input className="input input-sm" value={form.qty} onChange={e=>setForm({...form,qty:e.target.value})}/></div></div>
      <div className="field"><label className="label">DLC</label><input className="input" type="date" value={form.dlc} onChange={e=>setForm({...form,dlc:e.target.value})}/></div>
      <div className="field"><label className="label">Allergènes</label><input className="input" value={form.allergenes} onChange={e=>setForm({...form,allergenes:e.target.value})} placeholder="Gluten, Lait..."/></div>
      <button className="btn btn-primary mt8" onClick={save} disabled={!form.product}>Enregistrer</button>
    </div></div>}
  </div>);
}

// Ordre réglementaire des fréquences de nettoyage (GBPH restauration) :
// quotidien (surfaces de contact alimentaire) → hebdomadaire (équipements moins exposés)
// → mensuel (zones lourdes : hottes, filtres) → après usage (ustensiles ponctuels, hors calendrier).
const CLEAN_FREQS = [
  {key:"Quotidien",label:"Quotidien",icon:"☀️"},
  {key:"Hebdomadaire",label:"Hebdo",icon:"📅"},
  {key:"Mensuel",label:"Mensuel",icon:"🗓️"},
  {key:"Trimestriel",label:"Trimestriel",icon:"📆"},
  {key:"Après usage",label:"Après usage",icon:"🔁"},
];

function Cleaning({data,setData,db,reload,go,markLocalWrite,user,lang}){
  const[busy,setBusy]=useState(null);
  const[tab,setTab]=useState("Quotidien");
  // Même logique que Mise en place : entre minuit et l'horaire réel de
  // bascule (Paramètres → Horaires de service, 3h par défaut), on est encore
  // sur le service du soir de la veille. Utiliser la date calendaire brute
  // faisait réapparaître le nettoyage du soir comme "à faire" à minuit pile,
  // des heures avant la vraie fin de service.
  const todayISO=serviceISODate(data?.haccpSettings?.resetSoir);

  // Retrouve un passage du jour pour une zone/période donnée, dans
  // l'historique permanent — c'est CETTE présence (pas cleaning.done) qui
  // détermine si une case quotidienne est cochée aujourd'hui.
  function findCheck(cleaningId,period){
    return (data.cleaningChecks||[]).find(c=>c.cleaningId===cleaningId&&c.date===todayISO&&(c.period||null)===(period||null));
  }

  // Coche/décoche UN créneau précis (matin ou soir) d'une zone quotidienne.
  // Contrairement à l'ancien système, ceci n'écrase jamais rien : cocher
  // crée une ligne permanente dans l'historique, décocher ne fait que
  // supprimer CETTE ligne précise (l'autre créneau n'est jamais touché).
  async function toggleSlot(zone,period){
    if(busy)return;
    haptic.light();
    const existing=findCheck(zone.id,period);
    setBusy(`${zone.id}-${period}`);
    markLocalWrite?.();
    if(existing){
      setData(d=>({...d,cleaningChecks:d.cleaningChecks.filter(c=>c.id!==existing.id)}));
      const res=await db.deleteCleaningCheck(existing.id);
      if(res?.error){ alert("Impossible de décocher. Vérifie la connexion Supabase."); await reload?.({force:true}); setBusy(null); return; }
    }else{
      const res=await db.saveCleaningCheck({cleaningId:zone.id,zone:zone.zone,freq:zone.freq,date:todayISO,period,operator:user?.name});
      if(res?.error||!res?.data){ alert("Le nettoyage n'a pas été enregistré. Vérifie la connexion Supabase."); await reload?.({force:true}); setBusy(null); return; }
      const row=res.data;
      setData(d=>({...d,cleaningChecks:[...d.cleaningChecks,{id:row.id,cleaningId:zone.id,zone:zone.zone,freq:zone.freq,date:todayISO,period,operator:user?.name,createdAt:row.created_at}]}));
    }
    setBusy(null);
    haptic.success();
  }

  // Coche/décoche une zone à passage unique (Hebdo/Mensuel/Trimestriel/Après
  // usage) : un seul créneau (period=null), mais on écrit désormais AUSSI
  // dans l'historique permanent — la case cleaning.done reste comme avant
  // pour l'affichage rapide (accueil, pastilles), mais n'est plus la seule
  // trace de ce nettoyage.
  async function toggle(id){
    if(busy)return;
    haptic.light();
    const c=data.cleaning.find(x=>x.id===id);
    const next=!c.done;
    const stamp=next?new Date().toISOString():null;
    const op=next?(user?.name||null):null;
    setBusy(id);
    markLocalWrite?.();
    setData(d=>({...d,cleaning:d.cleaning.map(x=>x.id===id?{...x,done:next,doneAt:stamp,operator:op}:x)}));
    const res=await db.toggleCleaning(id,next,op);
    if(res?.error){
      alert("Le nettoyage n'a pas été enregistré. Vérifie la connexion Supabase.");
      await reload?.({force:true});
      setBusy(null);
      return;
    }
    if(next){
      // Trace permanente du passage — jamais réinitialisée, contrairement à
      // cleaning.done qui, lui, repart à zéro à l'expiration de la fréquence.
      const chk=await db.saveCleaningCheck({cleaningId:id,zone:c.zone,freq:c.freq,date:todayISO,period:null,operator:op});
      if(chk?.data){
        setData(d=>({...d,cleaningChecks:[...d.cleaningChecks,{id:chk.data.id,cleaningId:id,zone:c.zone,freq:c.freq,date:todayISO,period:null,operator:op,createdAt:chk.data.created_at}]}));
      }
    }
    setBusy(null);
  }

  // Répartit les zones existantes par fréquence ; celles dont la fréquence ne
  // correspond à aucune des 4 catégories connues tombent dans "Quotidien" par défaut
  // (sécurité anti-perte de donnée si une fréquence inattendue arrive de la base).
  const byFreq = CLEAN_FREQS.reduce((acc,f)=>{acc[f.key]=data.cleaning.filter(c=>c.freq===f.key);return acc;},{});
  const known = new Set(CLEAN_FREQS.map(f=>f.key));
  const orphans = data.cleaning.filter(c=>!known.has(c.freq));
  if(orphans.length) byFreq["Quotidien"]=[...byFreq["Quotidien"],...orphans];

  const list = byFreq[tab]||[];
  const isDaily = tab==="Quotidien";

  // Pour le quotidien, une zone compte comme "faite" seulement si matin ET
  // soir sont cochés aujourd'hui — dérivé de l'historique réel, pas d'un
  // état qu'on aurait pu oublier de resynchroniser.
  function dailyDone(zone){ return cleaningIsDoneToday(zone,data.cleaningChecks,data.haccpSettings?.resetSoir); }

  const done = isDaily ? list.filter(dailyDone).length : list.filter(c=>c.done).length;
  const pct = safePct(done, list.length);
  const totalDone = data.cleaning.filter(c=>c.freq==="Quotidien"?dailyDone(c):c.done).length;
  const totalPct = safePct(totalDone, data.cleaning.length);

  // Coche d'un coup tout ce qui manque sur la fréquence affichée. Pour le
  // quotidien, complète les créneaux manquants (matin et/ou soir) de chaque
  // zone ; pour les autres fréquences, coche les zones restantes comme avant.
  async function markAllDone(period){
    if(busy)return;
    if(isDaily){
      // Séparé matin/soir : cocher "tout fait" pendant le service du matin ne
      // doit jamais pouvoir marquer le soir comme fait par erreur (et
      // inversement) — chaque bouton n'agit que sur son propre créneau.
      const missing=list.filter(zone=>!findCheck(zone.id,period));
      if(!missing.length) return;
      const periodLabel = period==="matin"?"Matin":"Soir";
      const ok=window.confirm(`Marquer ${missing.length} zone${missing.length>1?"s":""} du créneau « ${periodLabel} » comme faite${missing.length>1?"s":""} ?`);
      if(!ok) return;
      haptic.medium(); setBusy(`all-${period}`);
      const results=await Promise.all(missing.map(zone=>db.saveCleaningCheck({cleaningId:zone.id,zone:zone.zone,freq:zone.freq,date:todayISO,period,operator:user?.name})));
      setBusy(null);
      if(results.some(r=>r?.error||!r?.data)){ alert("Certains créneaux n'ont pas été enregistrés. Vérifie la connexion Supabase."); await reload?.({force:true}); return; }
      markLocalWrite?.();
      setData(d=>({...d,cleaningChecks:[...d.cleaningChecks,...results.map((r,i)=>({id:r.data.id,cleaningId:missing[i].id,zone:missing[i].zone,freq:missing[i].freq,date:todayISO,period,operator:user?.name,createdAt:r.data.created_at}))]}));
      haptic.success();
      return;
    }
    const pending = list.filter(c=>!c.done);
    if(!pending.length) return;
    const ok = window.confirm(`Marquer les ${pending.length} zone${pending.length>1?"s":""} restante${pending.length>1?"s":""} de « ${tab} » comme faite${pending.length>1?"s":""} ?`);
    if(!ok) return;
    haptic.medium();
    setBusy("all");
    const stamp = new Date().toISOString();
    const ids = pending.map(c=>c.id);
    markLocalWrite?.();
    setData(d=>({...d,cleaning:d.cleaning.map(x=>ids.includes(x.id)?{...x,done:true,doneAt:stamp,operator:user?.name}:x)}));
    const results = await Promise.all(ids.map(id=>db.toggleCleaning(id,true,user?.name)));
    if(results.some(r=>r?.error)){
      alert("Certaines zones n'ont pas été enregistrées. Vérifie la connexion Supabase.");
      await reload?.({force:true});
      setBusy(null);
      return;
    }
    const checks = await Promise.all(pending.map(c=>db.saveCleaningCheck({cleaningId:c.id,zone:c.zone,freq:c.freq,date:todayISO,period:null,operator:user?.name})));
    setBusy(null);
    setData(d=>({...d,cleaningChecks:[...d.cleaningChecks,...checks.filter(c=>c?.data).map(c=>({id:c.data.id,cleaningId:c.data.cleaning_id,zone:c.data.zone,freq:c.data.freq,date:todayISO,period:null,operator:user?.name,createdAt:c.data.created_at}))]}));
    haptic.success();
  }

  return(<div className="page">
    <GbphHelpButton section="clean" go={go}/>
    <div className="section-title">{t("clean_title",lang)}</div>
    <div className="section-sub">{t("clean_overall",lang)} : {totalDone} / {data.cleaning.length} · {Math.round(totalPct)}%</div>

    <div className="tabs" style={{marginBottom:16}}>
      {CLEAN_FREQS.map(f=>{
        const n=byFreq[f.key]?.length||0;
        // Traduction du libellé de fréquence, clé par clé (pas de texte
        // traduit stocké dans CLEAN_FREQS lui-même — il reste en français,
        // c'est ici qu'on choisit la bonne langue à l'affichage).
        const FREQ_KEYS={"Quotidien":"clean_freq_daily","Hebdomadaire":"clean_freq_weekly","Mensuel":"clean_freq_monthly","Trimestriel":"clean_freq_quarterly","Après usage":"clean_freq_after_use"};
        const label = FREQ_KEYS[f.key] ? t(FREQ_KEYS[f.key],lang) : f.label;
        return <button key={f.key} className={`tab ${tab===f.key?"active":""}`} onClick={()=>{haptic.light();setTab(f.key);}}>{f.icon} {label}{n>0?` (${n})`:""}</button>;
      })}
    </div>

    {list.length>0 && (
      <div className="card mb14"><div className="pbar"><div className="pfill" style={{width:`${pct}%`,background:T.accent}}></div></div></div>
    )}

    {isDaily ? (
      <div className="row gap8 mb14">
        {list.some(z=>!findCheck(z.id,"matin")) && (
          <button className="btn" style={{flex:1,borderColor:T.good,color:T.good,background:T.goodBg}} onClick={()=>markAllDone("matin")} disabled={busy==="all-matin"}>
            {busy==="all-matin" ? t("clean_saving",lang) : `☀️ ${t("clean_mark_all",lang)} — Matin`}
          </button>
        )}
        {list.some(z=>!findCheck(z.id,"soir")) && (
          <button className="btn" style={{flex:1,borderColor:T.good,color:T.good,background:T.goodBg}} onClick={()=>markAllDone("soir")} disabled={busy==="all-soir"}>
            {busy==="all-soir" ? t("clean_saving",lang) : `🌙 ${t("clean_mark_all",lang)} — Soir`}
          </button>
        )}
      </div>
    ) : (
      list.some(c=>!c.done) && (
        <button className="btn mb14" onClick={()=>markAllDone()} disabled={busy==="all"} style={{borderColor:T.good,color:T.good,background:T.goodBg}}>
          {busy==="all" ? t("clean_saving",lang) : `✓ ${t("clean_mark_all",lang)} — ${tab}`}
        </button>
      )
    )}

    {list.length===0
      ? <div className="empty"><div className="empty-icon">🧹</div><div className="empty-title">{t("clean_empty_title",lang)}</div><div className="empty-sub">{t("clean_empty_sub",lang)}</div></div>
      : isDaily
        ? list.map(zone=>{
          const cMatin=findCheck(zone.id,"matin"), cSoir=findCheck(zone.id,"soir");
          return (
            <div key={zone.id} className="card" style={{marginBottom:10}}>
              <div className="row gap10 mb10"><div style={{fontSize:20}}>{zone.icon}</div><div className="item-title">{zone.zone}</div></div>
              <div className="row gap8">
                <button className={`temp-slot ${cMatin?"good":"empty"}`} onClick={()=>toggleSlot(zone,"matin")} disabled={busy===`${zone.id}-matin`}>
                  <div className="temp-slot-period">☀️ {t("temp_morning",lang)}</div>
                  {cMatin?<div className="temp-slot-meta tabular">✓ {cMatin.operator||""}</div>:<div className="temp-slot-cta">{busy===`${zone.id}-matin`?"…":"Cocher"}</div>}
                </button>
                <button className={`temp-slot ${cSoir?"good":"empty"}`} onClick={()=>toggleSlot(zone,"soir")} disabled={busy===`${zone.id}-soir`}>
                  <div className="temp-slot-period">🌙 {t("temp_evening",lang)}</div>
                  {cSoir?<div className="temp-slot-meta tabular">✓ {cSoir.operator||""}</div>:<div className="temp-slot-cta">{busy===`${zone.id}-soir`?"…":"Cocher"}</div>}
                </button>
              </div>
            </div>
          );
        })
        : list.map(c=>(
          <div key={c.id} className="item" onClick={()=>toggle(c.id)} style={{opacity:c.done?.6:1,pointerEvents:busy?"none":"auto"}}>
            <div className="item-icon" style={{background:T.bg3}}>{c.icon}</div>
            <div className="item-body">
              <div className="item-title" style={{textDecoration:c.done?"line-through":"none"}}>{c.zone}</div>
              <div className="item-sub">{c.produit} · {c.dilution}{c.done&&c.doneAt?` · ${t("clean_done_on",lang)} ${fmtDateTime(c.doneAt)}${c.operator?` ${t("clean_done_by",lang)} ${c.operator}`:""}`:""}</div>
            </div>
            <div className={`check ${c.done?"on":""}`}>{busy===c.id?"…":c.done?"✓":""}</div>
          </div>
        ))}
  </div>);
}

// ─── DLC RÉGLEMENTAIRE selon le type de date ─────────────────────────────────
// Chaque type d'opération a sa propre règle de conservation (bonnes pratiques + décrets).
// dlcDefault = valeur par défaut modifiable dans les Paramètres HACCP.
const DATE_TYPES = [
  { key:"fabrique",   label:"Fabriqué le",   icon:"👨‍🍳", verb:"Fabriqué",   rule:{days:3},    hint:"Préparation maison" },
  { key:"ouvert",     label:"Ouvert le",     icon:"📦", verb:"Ouvert",     rule:{days:3},    hint:"Produit entamé" },
  { key:"tranche",    label:"Tranché le",    icon:"🔪", verb:"Tranché",    rule:{days:3},    hint:"Charcuterie, fromage" },
  { key:"congele",    label:"Congelé le",    icon:"❄️", verb:"Congelé",    rule:{months:6},  hint:"Congélation maison" },
  { key:"decongele",  label:"Décongelé le",  icon:"💧", verb:"Décongelé",  rule:{days:1},    hint:"À consommer vite · ne jamais recongeler" },
];
function dateTypeByKey(k){ return DATE_TYPES.find(d=>d.key===k) || DATE_TYPES[0]; }
// Calcule la date de DLC à partir d'une date de départ (Date) et d'une règle
function computeDlc(startDate, rule, overrideDays){
  const d = new Date(startDate);
  if(overrideDays!=null){ d.setDate(d.getDate()+overrideDays); }
  else if(rule.months){ d.setMonth(d.getMonth()+rule.months); }
  else { d.setDate(d.getDate()+(rule.days||0)); }
  return d;
}
const fmtDM = (d)=> d.toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit"});
const fmtDMY = (d)=> d.toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"2-digit"});

// Format étiquette Brother — 57,15 × 50,8 mm. Opérateur mis en évidence, type de date dynamique.
// ─── RELAIS D'IMPRESSION RÉSEAU ────────────────────────────────────────────
// Safari/iOS ne peut pas parler directement à une imprimante réseau (Brother
// TD-2125NWB incluse). On passe par un petit serveur relais (sur un Android
// dédié en cuisine, via Termux) qui, lui, peut envoyer les données brutes à
// l'imprimante. L'adresse du relais est enregistrée dans Paramètres > Imprimante.
function getRelayUrl(){
  try{ return localStorage.getItem("fuego_relay_url") || ""; }catch{ return ""; }
}
function setRelayUrl(url){
  try{ localStorage.setItem("fuego_relay_url", url); }catch{}
}
async function testRelay(url){
  try{
    const res = await fetch(`${url}/ping`, { method:"GET", signal:AbortSignal.timeout(4000) });
    if(!res.ok) return {ok:false, error:"Réponse invalide"};
    const data = await res.json();
    return {ok:true, printer:data.printer};
  }catch(e){ return {ok:false, error:e.message||"Injoignable"}; }
}

// Construit la commande ESC/POS brute pour une étiquette texte simple.
// (Format basique — suffisant pour du texte, sans mise en page avancée.)
// ─── Générateur ESC/P Brother (langage RÉEL des imprimantes d'étiquettes
// Brother QL/TD, dont la TD-2125NWB) ───────────────────────────────────────
// À ne pas confondre avec l'ESC/POS générique (imprimantes de tickets de
// caisse Epson) : les deux partagent le préfixe "ESC" mais sont des langages
// différents. Brother documente explicitement que ses imprimantes d'étiquettes
// n'exécutent pas de vrai ESC/POS. Référence officielle : "Software Developer's
// Manual — ESC/P Command Reference" (séries QL/TD Brother).
// ─── Génération d'étiquette en mode RASTER (image pixel par pixel) ────────
// Contrairement à l'ESC/P texte (qui laisse l'imprimante interpréter les
// tailles de police — peu fiable selon le firmware), on dessine ici
// l'étiquette nous-mêmes sur un <canvas>, puis on l'envoie comme une image
// déjà prête. L'imprimante n'a plus qu'à la reproduire telle quelle.
// Référence protocole : commandes raster Brother (ESC i a 01h = mode raster,
// ESC i z = info média, "g" = ligne raster, 0x1A = fin de job).

const LABEL_DPI = 203; // résolution RÉELLE de la TD-2125NWB — confirmée par plusieurs
// fiches techniques Brother officielles. La série TD-2000 a deux variantes :
// 203 dpi (TD-2020A/2120N/2125N/2125NWB — la nôtre) et 300 dpi (2130N/2135N/2135NWB).
// La valeur précédente (300) causait un débordement massif du texte hors de
// l'étiquette physique : l'imprimante interprète chaque pixel envoyé selon SA
// propre résolution, donc une image dimensionnée pour 300 dpi s'affiche à une
// taille réelle ~48% plus grande que prévu (675px/203dpi ≈ 84mm au lieu de 57mm).
const LABEL_WIDTH_MM = 57.15, LABEL_HEIGHT_MM = 50.8;
const mmToPx = mm => Math.round(mm / 25.4 * LABEL_DPI);

async function drawLabelCanvas({product, qty, dateType, startDateStr, dlc, lot, allergens, operator}){
  const dt = dateTypeByKey(dateType||"fabrique");
  const dlcLabel = dt.key==="congele" ? "A consommer avant" : "DLC";
  const strip = s => (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"");

  const W = mmToPx(LABEL_WIDTH_MM), H = mmToPx(LABEL_HEIGHT_MM);
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0,0,W,H);
  ctx.fillStyle = "#000"; ctx.textAlign = "center";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const cx = W/2;
  const marginX = W*0.1;
  let y = Math.round(H*0.08);
  const lineGap = size => Math.round(size*1.32);
  const thinLine = (yPos, widthFactor=0.7)=>{
    const lw = W*widthFactor;
    ctx.beginPath();
    ctx.moveTo(cx-lw/2, yPos); ctx.lineTo(cx+lw/2, yPos);
    ctx.lineWidth = Math.max(1.5, H*0.0022);
    ctx.strokeStyle = "#000";
    ctx.stroke();
  };

  // ─── Titre "FUEGO" en haut, discret ────────────────────────────────────
  ctx.font = `700 ${Math.round(H*0.06)}px Arial`;
  ctx.fillText("FUEGO", cx, y+H*0.05);
  y += Math.round(H*0.09);

  thinLine(y, 0.62);
  y += lineGap(H*0.05);

  // ─── Nom du produit — le plus visible, avec léger tracking pour le style ──
  const productText = strip(product).toUpperCase();
  let productSize = Math.round(H*0.135);
  ctx.font = `800 ${productSize}px Arial`;
  while(ctx.measureText(productText).width > W-marginX*2 && productSize>Math.round(H*0.065)){
    productSize -= 2; ctx.font = `800 ${productSize}px Arial`;
  }
  ctx.fillText(productText, cx, y+productSize*0.72);
  y += lineGap(productSize) + Math.round(H*0.025);

  // ─── Corps normal, espacement aéré ─────────────────────────────────────
  ctx.font = `400 ${Math.round(H*0.05)}px Arial`;
  ctx.fillStyle = "#222";
  if(qty){ ctx.fillText(`Qte : ${strip(qty)}`, cx, y); y += lineGap(H*0.05); }
  ctx.fillText(`${strip(dt.verb)} le ${startDateStr}`, cx, y);
  y += lineGap(H*0.065);
  ctx.fillStyle = "#000";

  // ─── DLC — encadrée légèrement pour ressortir sans être écrasante ──────
  const dlcSize = Math.round(H*0.072);
  ctx.font = `800 ${dlcSize}px Arial`;
  const dlcText = `${dlcLabel} : ${dlc}`;
  const dlcW = ctx.measureText(dlcText).width + W*0.08;
  const dlcH = dlcSize*1.5;
  const dlcBoxTop = y;
  ctx.strokeStyle = "#000"; ctx.lineWidth = Math.max(1.5,H*0.0022);
  ctx.strokeRect(cx-dlcW/2, dlcBoxTop, dlcW, dlcH);
  // Centre le texte verticalement dans le cadre via textBaseline="middle",
  // plus fiable que de recalculer une position de ligne de base à la main.
  ctx.textBaseline = "middle";
  ctx.fillText(dlcText, cx, dlcBoxTop + dlcH/2);
  ctx.textBaseline = "alphabetic"; // remet la valeur par défaut pour le reste du dessin
  y = dlcBoxTop + dlcH + Math.round(H*0.035);

  thinLine(y, 0.62);
  y += lineGap(H*0.055);

  // ─── Signature, discrète ───────────────────────────────────────────────
  ctx.font = `400 ${Math.round(H*0.044)}px Arial`;
  ctx.fillStyle = "#444";
  ctx.fillText(`Par ${strip(operator)} · ${nowTime()}`, cx, y);

  return {canvas, W, H};
}

function canvasToRasterBits(canvas, W, H){
  // Logique confirmée par l'utilisateur : la toute première version (aperçu à
  // l'endroit) est sortie à l'envers/en miroir sur la vraie imprimante. Donc un
  // aperçu déjà retourné devrait, par symétrie, ressortir correctement sur le
  // papier — l'imprimante applique une transformation fixe qu'on doit
  // anticiper en amont. On réapplique donc le flip vertical.
  const flipped = document.createElement("canvas");
  flipped.width = W; flipped.height = H;
  const rctx = flipped.getContext("2d");
  rctx.translate(0, H);
  rctx.scale(1, -1);
  rctx.drawImage(canvas, 0, 0);

  const ctx = flipped.getContext("2d");
  const img = ctx.getImageData(0,0,W,H).data;
  const bytesPerRow = Math.ceil(W/8);
  const rows = [];
  for(let py=0; py<H; py++){
    const row = new Uint8Array(bytesPerRow);
    for(let px=0; px<W; px++){
      const idx = (py*W+px)*4;
      // Luminance simple ; seuil à mi-chemin (fonctionne bien pour du texte noir sur blanc).
      const lum = (img[idx]+img[idx+1]+img[idx+2])/3;
      if(lum < 128){
        const byteIndex = Math.floor(px/8);
        const bitIndex = 7-(px%8);
        row[byteIndex] |= (1<<bitIndex);
      }
    }
    rows.push(row);
  }
  return rows;
}

function buildRasterCommand(rows, W, H){
  const bytesPerRow = Math.ceil(W/8);
  const parts = [];
  const push = (...bytes)=>{ for(const b of bytes) parts.push(b & 0xFF); };

  push(0x1B,0x40);                                  // ESC @ — initialise
  push(0x1B,0x69,0x61,0x01);                        // ESC i a 01h — mode raster
  push(0x1B,0x69,0x7A, 0x02,                        // ESC i z — info média (étiquette découpée, pas continue)
       W & 0xFF, (W>>8)&0xFF, H & 0xFF, (H>>8)&0xFF, 0x00,0x00);
  push(0x1B,0x69,0x4D,0x40);                        // ESC i M 40h — découpe auto activée
  push(0x1B,0x69,0x4B,0x08);                        // ESC i K 08h — découpe à chaque étiquette
  push(0x1B,0x69,0x64,0x00,0x00);                   // ESC i d — marges à 0 (on gère l'espacement nous-mêmes dans le dessin)
  push(0x4D,0x00);                                  // M 00h — compression désactivée (lignes envoyées telles quelles)

  for(const row of rows){
    const isBlank = row.every(b=>b===0);
    if(isBlank){ push(0x5A); }                      // Z — ligne vide (raccourci)
    else{ push(0x67,0x00,bytesPerRow); for(const b of row) push(b); } // g 00 NN <données>
  }
  push(0x1A);                                        // fin de job

  // Convertit en chaîne binaire (1 caractère = 1 octet), pour rester
  // compatible avec le body texte déjà envoyé au relais via fetch().
  let out = "";
  for(const b of parts) out += String.fromCharCode(b);
  return out;
}

async function buildEscPos(labelData){
  // Devenue asynchrone : drawLabelCanvas attend maintenant le chargement du
  // logo Fuego avant de dessiner. Nom conservé pour compatibilité avec le
  // reste de l'app (printBrotherLabel appelle buildEscPos).
  const {canvas, W, H} = await drawLabelCanvas(labelData);
  const rows = canvasToRasterBits(canvas, W, H);
  return buildRasterCommand(rows, W, H);
}



async function printBrotherLabel(labelData){
  const relayUrl = getRelayUrl();

  // Méthode 1 — relais réseau configuré : envoi direct, sans passer par Safari
  if(relayUrl){
    try{
      const escpos = await buildEscPos(labelData);
      // Important : escpos est une chaîne où chaque caractère représente UN
      // octet brut (0-255) — construite via String.fromCharCode(). Envoyée
      // telle quelle comme texte, fetch() l'encoderait en UTF-8 et
      // corromprait tout octet supérieur à 127 (multi-octets), détruisant
      // l'image raster. On la convertit donc explicitement en octets bruts.
      const bytes = new Uint8Array(escpos.length);
      for(let i=0;i<escpos.length;i++) bytes[i] = escpos.charCodeAt(i) & 0xFF;
      const res = await fetch(`${relayUrl}/print`, {
        method:"POST",
        headers:{"Content-Type":"application/octet-stream"},
        body: bytes,
        signal: AbortSignal.timeout(8000),
      });
      const result = await res.json();
      if(result.success){ haptic(15); return {ok:true}; }
      alert(`Erreur d'impression : ${result.error||"inconnue"}`);
      return {ok:false};
    }catch(e){
      alert(`Relais d'impression injoignable : ${e.message}\n\nVérifie que le téléphone relais est allumé et connecté au WiFi.`);
      return {ok:false};
    }
  }

  // Méthode 2 — secours : boîte d'impression Safari (fonctionne si l'imprimante
  // est accessible via AirPrint ou un pilote installé sur l'appareil).
  const dt = dateTypeByKey(labelData.dateType||"fabrique");
  const {product, qty, startDateStr, dlc, lot, allergens, operator} = labelData;
  const w = window.open("","_blank","width=420,height=420");
  if(!w){ alert("Autorisez les pop-ups pour imprimer"); return {ok:false}; }
  w.document.write(`<html><head><title>Étiquette Fuego</title>
  <style>
    @page { size: 57.15mm 50.8mm; margin: 0; }
    *{box-sizing:border-box;margin:0;padding:0;}
    html{background:#090909;}
    .label{width:57.15mm;height:50.8mm;font-family:Arial,Helvetica,sans-serif;padding:2mm 3mm;display:flex;flex-direction:column;background:#fff;margin:0 auto;}
    .closebar{padding:14px 16px;text-align:center;}
    .closebar button{background:linear-gradient(135deg,#FF6B00,#E8390A);color:#fff;border:none;border-radius:10px;padding:10px 20px;font-size:14px;font-weight:700;font-family:Arial,sans-serif;width:100%;}
    @media print{ .closebar{display:none;} html{background:#fff;} }
    .brand{font-weight:900;font-size:8pt;letter-spacing:2px;text-align:center;border-bottom:1.5px solid #000;padding-bottom:0.8mm;margin-bottom:0.8mm;}
    .prod{font-weight:bold;font-size:12pt;line-height:1.05;margin-bottom:0.5mm;}
    .qty{font-size:7pt;color:#333;margin-bottom:0.5mm;}
    .rows{flex:1;}
    .row{display:flex;justify-content:space-between;font-size:8pt;padding:0.2mm 0;}
    .row b{font-weight:bold;}
    .dlc{font-weight:bold;font-size:11pt;}
    .al{font-size:6pt;background:#000;color:#fff;padding:0.7mm 1.5mm;border-radius:1mm;margin-top:0.8mm;line-height:1.15;}
    .foot{font-size:7pt;text-align:center;margin-top:0.8mm;border-top:1px solid #000;padding-top:0.6mm;}
    .foot b{font-weight:bold;}
  </style></head><body>
    <div class="closebar"><button onclick="window.close()">← Retour à Fuego</button></div>
    <div class="label">
      <div class="brand">FUEGO</div>
      <div class="prod">${product}</div>
      ${qty?`<div class="qty">Qté : ${qty}</div>`:""}
      <div class="rows">
        <div class="row"><span>${dt.verb} le</span><b>${startDateStr}</b></div>
        <div class="row"><span>${dt.key==="congele"?"À consommer avant":"DLC"}</span><b class="dlc">${dlc}</b></div>
        <div class="row"><span>Lot</span><b>${lot}</b></div>
      </div>
      <div class="al">⚠ ALLERGÈNES : ${(allergens||"Aucun").toUpperCase()}</div>
      <div class="foot">Par <b>${operator}</b> · ${nowTime()}</div>
    </div>
  </body></html>`);
  w.document.close();
  setTimeout(()=>{ w.focus(); w.print(); }, 350);
  return {ok:true};
}

function Labels({data,setData,user,db,reload,go,markLocalWrite,lang}){
  const[show,setShow]=useState(false);
  const[form,setForm]=useState({product:"",allergens:"",qty:""});
  const[dateType,setDateType]=useState("fabrique");           // clé DATE_TYPES
  const[startDate,setStartDate]=useState("");                  // vide = aujourd'hui
  const[customDlc,setCustomDlc]=useState(null);                // null = DLC réglementaire auto
  const[copies,setCopies]=useState(1);

  const dt = dateTypeByKey(dateType);
  const startD = startDate ? new Date(startDate) : new Date();
  const dlcD = computeDlc(startD, dt.rule, customDlc);
  const isMonthsRule = !!dt.rule.months && customDlc==null;

  async function purgeHistory(){
    const todayShort = fmtDM(new Date());
    const oldOnes = data.labels.filter(l=>l.dateProd!==todayShort);
    if(!oldOnes.length){ alert("Rien à purger : l'historique ne contient que les étiquettes du jour."); return; }
    const ok = window.confirm(`Purger ${oldOnes.length} étiquette${oldOnes.length>1?"s":""} des jours précédents ?\n\nLes étiquettes d'aujourd'hui sont conservées. Cette action est définitive.`);
    if(!ok) return;
    const res = await db.purgeOldLabels?.();
    if(res?.error){ alert("La purge a échoué. Vérifie la connexion Supabase."); await reload?.({force:true}); return; }
    markLocalWrite?.();
    setData(d=>({...d,labels:d.labels.filter(l=>l.dateProd===todayShort)}));
    haptic.success();
  }

  function buildLabel(){
    // Compte uniquement les étiquettes du jour : le total chargé est plafonné
    // (7 jours d'historique), s'y fier créerait des numéros de lot en double.
    const todayShort = fmtDM(new Date());
    const todayCount = data.labels.filter(l=>l.dateProd===todayShort).length;
    const lot=`L${new Date().toLocaleDateString("fr-FR").replace(/\//g,"")}-${todayCount+1}`;
    return {
      product:form.product, qty:form.qty,
      dateType,
      startDateStr: isMonthsRule ? fmtDMY(startD) : fmtDM(startD),
      dlc: isMonthsRule ? fmtDMY(dlcD) : fmtDM(dlcD),
      lot, allergens:form.allergens||"Aucun", operator:user.name,
    };
  }

  async function printAndSave(){
    const label=buildLabel();
    const n=Math.max(1,parseInt(copies)||1);
    for(let i=0;i<n;i++){ printBrotherLabel(label); }
    const res=await db.addLabel({product:label.product,dateProd:label.startDateStr,dlc:label.dlc,lot:label.lot,allergens:label.allergens,operator:user.name,dateType});
    if(res?.error){alert("L'étiquette a été imprimée mais pas enregistrée dans l'historique.");await reload({force:true});return;}
    // Ajout local depuis la ligne renvoyée — recharger 20 tables après chaque
    // impression rendait l'étiquetage lent en plein service.
    if(res?.data){
      const l=res.data;
      markLocalWrite?.();
      setData(d=>({...d,labels:[{id:l.id,product:l.product,dateProd:l.date_prod,dlc:l.dlc,lot:l.lot,allergens:l.allergens,operator:l.operator,dateType:l.date_type||"fabrique"},...d.labels]}));
    }
    setShow(false); setForm({product:"",allergens:"",qty:""}); setDateType("fabrique"); setStartDate(""); setCustomDlc(null); setCopies(1);
  }

  function reprint(l){
    printBrotherLabel({product:l.product,qty:"",dateType:l.dateType||"fabrique",startDateStr:l.dateProd,dlc:l.dlc,lot:l.lot,allergens:l.allergens,operator:l.operator||user.name});
  }

  return(<div className="page">
    <GbphHelpButton section="trace" go={go}/>
    <div className="section-title">{t("label_title",lang)}</div>
    <div className="section-sub">Brother · 57,15 × 50,8 mm</div>

    <button className="btn btn-primary mb14" onClick={()=>setShow(true)}>{t("label_new",lang)}</button>

    <div className="between" style={{marginBottom:8}}>
      <div className="bucket-label" style={{margin:0}}>{t("label_history",lang)}</div>
      {user?.isAdmin && data.labels.length>0 && (
        <button onClick={purgeHistory} style={{background:"none",border:"none",color:T.textDim,fontSize:12,fontWeight:600,padding:"4px 8px"}}>{t("label_purge",lang)}</button>
      )}
    </div>
    {data.labels.length===0
      ? <div className="empty"><div className="empty-icon">🏷️</div><div className="empty-title">Aucune étiquette</div><div className="empty-sub">Créez votre première étiquette</div></div>
      : data.labels.map(l=>{const lt=dateTypeByKey(l.dateType||"fabrique");return(
        <div key={l.id} className="item">
          <div className="item-icon" style={{background:T.infoBg}}>{lt.icon}</div>
          <div className="item-body"><div className="item-title">{l.product}</div><div className="item-sub">{lt.verb} {l.dateProd} · DLC {l.dlc} · {l.operator||""}</div></div>
          <button onClick={()=>reprint(l)} style={{background:T.bg3,border:`1px solid ${T.border}`,color:T.text,borderRadius:9,padding:"7px 11px",fontSize:13,flexShrink:0}}>🖨️</button>
        </div>
      );})}

    {show&&<div className="overlay" onClick={()=>setShow(false)}><div className="sheet" onClick={e=>e.stopPropagation()}>
      <div className="sheet-handle"></div>
      <div className="sheet-title">Nouvelle étiquette</div>

      {/* Aperçu format réel */}
      <div style={{margin:"0 auto 16px",width:171,height:152,background:"#fff",borderRadius:6,padding:"7px 9px",color:"#000",fontFamily:"Arial",display:"flex",flexDirection:"column",boxShadow:"0 4px 16px rgba(0,0,0,.4)"}}>
        <div style={{fontWeight:900,fontSize:9,letterSpacing:2,textAlign:"center",borderBottom:"1.5px solid #000",paddingBottom:2,marginBottom:2}}>FUEGO</div>
        <div style={{fontWeight:"bold",fontSize:14,lineHeight:1.02,marginBottom:1}}>{form.product||"Produit"}</div>
        <div style={{flex:1,fontSize:8.5}}>
          <div style={{display:"flex",justifyContent:"space-between"}}><span>{dt.verb} le</span><b>{isMonthsRule?fmtDMY(startD):fmtDM(startD)}</b></div>
          <div style={{display:"flex",justifyContent:"space-between"}}><span>{dt.key==="congele"?"À conso. avant":"DLC"}</span><b>{isMonthsRule?fmtDMY(dlcD):fmtDM(dlcD)}</b></div>
        </div>
        <div style={{fontSize:6.5,background:"#000",color:"#fff",padding:"2px 4px",borderRadius:3}}>⚠ {(form.allergens||"Aucun").toUpperCase()}</div>
        <div style={{fontSize:7,textAlign:"center",borderTop:"1px solid #000",marginTop:2,paddingTop:2}}>Par <b>{user.name}</b></div>
      </div>

      <div className="field"><label className="label">Produit</label><input className="input" value={form.product} onChange={e=>setForm({...form,product:e.target.value})} placeholder="ex : Rôti de bœuf"/></div>
      <div className="field"><label className="label">Quantité (optionnel)</label><input className="input" value={form.qty} onChange={e=>setForm({...form,qty:e.target.value})} placeholder="ex : 3 kg"/></div>

      {/* SÉLECTEUR DE TYPE DE DATE — gros boutons visuels */}
      <div className="field"><label className="label">Type d'opération</label>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
          {DATE_TYPES.map(o=>(
            <button key={o.key} onClick={()=>{haptic.light();setDateType(o.key);setCustomDlc(null);}}
              style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"11px 4px",borderRadius:12,
                border:`1.5px solid ${dateType===o.key?T.accentOrange:T.border}`,
                background:dateType===o.key?"linear-gradient(135deg,rgba(255,107,0,.16),rgba(232,57,10,.16))":T.bg2,
                color:dateType===o.key?T.text:T.textDim,transition:"all .12s",cursor:"pointer"}}>
              <span style={{fontSize:20}}>{o.icon}</span>
              <span style={{fontSize:10.5,fontWeight:700,lineHeight:1.1,textAlign:"center"}}>{o.label}</span>
            </button>
          ))}
        </div>
        <div className="text-xs text-dim mt6" style={{textAlign:"center"}}>{dt.hint}</div>
      </div>

      {/* Date de départ (défaut = aujourd'hui) */}
      <div className="field"><label className="label">{dt.verb} le</label>
        <div className="row gap8">
          <button className={`chip ${!startDate?"sel":""}`} onClick={()=>setStartDate("")} style={{flexShrink:0}}>Aujourd'hui</button>
          <input className="input input-sm" type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} style={{flex:1}}/>
        </div>
      </div>

      {/* DLC RÉGLEMENTAIRE calculée + possibilité d'override */}
      <div className="field">
        <label className="label">Date limite de consommation</label>
        <div className="card" style={{background:dt.key==="decongele"?T.badBg:T.goodBg,border:`1px solid ${dt.key==="decongele"?T.bad:T.good}`,padding:"12px 14px",marginBottom:8}}>
          <div className="between">
            <div>
              <div style={{fontSize:11,color:T.textDim,marginBottom:2}}>{customDlc!=null?"DLC personnalisée":"DLC réglementaire"}</div>
              <div style={{fontFamily:"'Inter',sans-serif",fontWeight:800,fontSize:20,letterSpacing:"-.02em",color:dt.key==="decongele"?T.bad:T.good}} className="tabular">{isMonthsRule?fmtDMY(dlcD):fmtDM(dlcD)}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <span className="badge b-mute">{dt.rule.months?`+${dt.rule.months} mois`:`J+${customDlc!=null?customDlc:dt.rule.days}`}</span>
            </div>
          </div>
          {dt.key==="congele"&&<div className="text-xs mt6" style={{color:T.textDim}}>❄️ Congélation maison : 6 mois recommandés (bonnes pratiques)</div>}
          {dt.key==="decongele"&&<div className="text-xs mt6" style={{color:T.bad,fontWeight:600}}>⚠ Consommer sous 24h · ne JAMAIS recongeler</div>}
        </div>
        <div className="text-xs text-dim mb4">Ajuster (jours) si besoin :</div>
        <QuickPick value={customDlc!=null?customDlc:(dt.rule.days||"reg")} onChange={v=>setCustomDlc(v)} options={[
          ...(dt.rule.months?[{value:"reg",label:`Régl. (+${dt.rule.months}m)`}]:[]),
          {value:1,label:"J+1"},{value:2,label:"J+2"},{value:3,label:"J+3"},{value:5,label:"J+5"},{value:7,label:"J+7"},{value:14,label:"J+14"},
        ]}/>
        {customDlc!=null&&<button className="btn btn-ghost btn-sm mt6" onClick={()=>setCustomDlc(null)}>↺ Revenir à la DLC réglementaire</button>}
      </div>

      <div className="field"><label className="label">Allergènes</label><input className="input" value={form.allergens} onChange={e=>setForm({...form,allergens:e.target.value})} placeholder="ex : Gluten, Lait"/></div>

      <div className="field"><label className="label">Nombre de copies</label>
        <div className="row gap10" style={{justifyContent:"center"}}>
          <button className="mult-btn" onClick={()=>setCopies(Math.max(1,(parseInt(copies)||1)-1))}>−</button>
          <input type="number" inputMode="numeric" min={1} max={99} value={copies}
            onChange={e=>{const v=e.target.value;setCopies(v===""?"":Math.max(1,Math.min(99,parseInt(v)||1)));}}
            onBlur={e=>{if(!e.target.value||parseInt(e.target.value)<1)setCopies(1);}}
            style={{width:72,height:48,textAlign:"center",fontFamily:"'Inter',sans-serif",fontSize:24,fontWeight:800,background:T.bg3,border:`1px solid ${T.border}`,borderRadius:10,color:T.text,outline:"none",fontVariantNumeric:"tabular-nums"}}/>
          <button className="mult-btn" onClick={()=>setCopies((parseInt(copies)||0)+1)}>+</button>
        </div>
        <div className="text-xs text-dim center mt6">Touchez le chiffre pour saisir directement (max 99)</div>
      </div>

      <button className="btn btn-primary" onClick={printAndSave} disabled={!form.product}>🖨️ Imprimer{(parseInt(copies)||1)>1?` ×${parseInt(copies)||1}`:""}</button>
    </div></div>}
  </div>);
}

function Pests({data,setData,db,reload,go,markLocalWrite,lang}){
  const[show,setShow]=useState(false);
  const[form,setForm]=useState({type:"Visite contrat",company:"",result:"RAS",nextVisit:""});
  const[reportFile,setReportFile]=useState(null); // PDF sélectionné, pas encore envoyé
  const[busy,setBusy]=useState(false);

  function pickReport(e){
    const f=e.target.files?.[0];
    if(!f)return;
    // Garde-fou : au-delà de 10 Mo, c'est probablement un scan mal compressé.
    if(f.size > 10*1024*1024){ alert("Ce fichier dépasse 10 Mo. Demande à l'entreprise un PDF plus léger."); return; }
    setReportFile(f);
  }

  async function save(){
    if(busy)return;
    setBusy(true);
    let reportPath=null, reportName=null;
    // 1) On envoie d'abord le PDF dans le Storage (s'il y en a un)…
    if(reportFile){
      const up=await db.uploadPestReport(reportFile);
      if(up?.error){ setBusy(false); alert("Le rapport n'a pas pu être envoyé. Vérifie la connexion."); return; }
      reportPath=up.path; reportName=up.name;
    }
    // 2) …puis on enregistre l'intervention avec le chemin du fichier.
    const res=await db.addPest({date:todayStr(),type:form.type,company:form.company,result:form.result,nextVisit:form.nextVisit,reportPath,reportName});
    setBusy(false);
    if(res?.error){
      // L'intervention a échoué : on nettoie le PDF déjà envoyé pour ne pas
      // laisser de fichier orphelin dans le Storage.
      if(reportPath) await db.deletePestReport(reportPath);
      alert("L'intervention n'a pas été enregistrée. Vérifie la connexion Supabase.");
      await reload({force:true});
      return;
    }
    if(res?.data){
      const p=res.data;
      markLocalWrite?.();
      setData(d=>({...d,pests:[{id:p.id,date:p.date,type:p.type,company:p.company,result:p.result,nextVisit:p.next_visit,reportPath:p.report_path||null,reportName:p.report_name||null},...d.pests]}));
    }
    setShow(false);setForm({type:"Visite contrat",company:"",result:"RAS",nextVisit:""});setReportFile(null);
  }

  return(<div className="page">
    <GbphHelpButton section="pest" go={go}/>
    <div className="section-title">{t("pest_title",lang)}</div><div className="section-sub">{t("pest_subtitle",lang)}</div>
    {data.pests.length===0 && <div className="empty"><div className="empty-icon">🐀</div><div className="empty-title">{t("pest_empty_title",lang)}</div><div className="empty-sub">{t("pest_empty_sub",lang)}</div></div>}
    {(() => {
      // Groupé par mois — createdAt (vrai timestamp avec année) plutôt que la
      // date affichée "JJ/MM", qui deviendrait ambiguë au-delà d'un an.
      const MONTH_NAMES=["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
      const groups={};
      data.pests.forEach(p=>{
        const d = p.createdAt ? new Date(p.createdAt) : null;
        const key = d && !isNaN(d) ? `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}` : "Date inconnue";
        (groups[key]=groups[key]||[]).push(p);
      });
      const keys=Object.keys(groups); // déjà dans l'ordre d'arrivée (plus récent d'abord, data.pests est trié ainsi)
      return keys.map((key,idx)=>(
        <div key={key} style={{marginBottom:10}}>
          <CollapsibleSection title={key} icon="📅" count={groups[key].length} defaultOpen={idx===0}>
            {groups[key].map(p=>(
              <div key={p.id} className="card" style={{marginBottom:8}}>
                <div className="between mb6"><div><div className="item-title">{p.type}</div><div className="item-sub">{p.company}</div></div><span className={`badge ${p.result==="RAS"?"b-good":"b-warn"}`}>{p.result}</span></div>
                <div className="text-xs text-dim">Visite : {p.date} · Prochaine : {p.nextVisit}</div>
                {p.reportPath && (
                  <a href={db.pestReportUrl(p.reportPath)} target="_blank" rel="noopener noreferrer"
                     style={{display:"flex",alignItems:"center",gap:8,marginTop:10,padding:"9px 12px",background:T.bg3,border:`1px solid ${T.border}`,borderRadius:10,textDecoration:"none"}}>
                    <span style={{fontSize:16}}>📄</span>
                    <span style={{flex:1,fontSize:12,fontWeight:600,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.reportName||"Rapport de passage"}</span>
                    <span style={{color:T.textDim,fontSize:12}}>Ouvrir ›</span>
                  </a>
                )}
              </div>
            ))}
          </CollapsibleSection>
        </div>
      ));
    })()}
    <div className="fab-anchor"><button className="btn-fab" onClick={()=>setShow(true)}>+</button></div>
    {show&&<div className="overlay" onClick={()=>!busy&&setShow(false)}><div className="sheet" onClick={e=>e.stopPropagation()}>
      <div className="sheet-handle"></div><div className="sheet-title">{t("pest_new",lang)}</div>
      <div className="field"><label className="label">Type</label><select className="input" value={form.type} onChange={e=>setForm({...form,type:e.target.value})}><option>Visite contrat</option><option>Intervention urgente</option><option>Observation interne</option></select></div>
      <div className="field"><label className="label">Société</label><input className="input" value={form.company} onChange={e=>setForm({...form,company:e.target.value})}/></div>
      <div className="field"><label className="label">Résultat</label><BinaryChoice value={form.result} onChange={v=>setForm({...form,result:v})} options={[{value:"RAS",label:"RAS",icon:"✓",style:"good"},{value:"Présence détectée",label:"Alerte",icon:"⚠",style:"bad"}]}/></div>
      <div className="field"><label className="label">Prochaine visite</label><input className="input" type="date" value={form.nextVisit} onChange={e=>setForm({...form,nextVisit:e.target.value})}/></div>

      <div className="field"><label className="label">Rapport de passage (PDF)</label>
        {reportFile
          ? <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",background:T.goodBg,border:`1px solid ${T.good}44`,borderRadius:10}}>
              <span style={{fontSize:16}}>📄</span>
              <span style={{flex:1,fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{reportFile.name}</span>
              <button onClick={()=>setReportFile(null)} style={{background:"none",border:"none",color:T.textDim,fontSize:15,minWidth:44,minHeight:44,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
            </div>
          : <label style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"12px",background:T.bg3,border:`1px dashed ${T.border}`,borderRadius:10,cursor:"pointer",color:T.textDim,fontSize:13,fontWeight:600}}>
              {t("pest_join_pdf",lang)}
              <input type="file" accept="application/pdf,.pdf" style={{display:"none"}} onChange={pickReport}/>
            </label>
        }
        <div className="text-xs text-mute mt6">Facultatif · 10 Mo maximum</div>
      </div>

      <button className="btn btn-primary mt8" onClick={save} disabled={busy}>{busy?"Enregistrement…":"Enregistrer"}</button>
    </div></div>}
  </div>);
}

// Ligne d'une fiche de formation, extraite dans son propre composant : un
// hook (useLongPress) ne peut jamais être appelé à l'intérieur d'un .map(),
// sinon le nombre d'appels de hooks change dès que la liste change de
// taille (ex. une suppression) — ce qui casse React de façon violente
// (écran figé). Un composant par ligne règle ça proprement.
function TrainingRow({t,isAdmin,onEdit,onDelete}){
  const hOk=new Date(t.haccpExp.split("/").reverse().join("-"))>=new Date();
  const vOk=new Date(t.visaExp.split("/").reverse().join("-"))>=new Date();
  const lp=useLongPress(()=>{ if(isAdmin){ haptic.medium(); onDelete(t); } });
  return (
    <div className="card" {...(isAdmin?lp.handlers:{})} onClick={()=>{ if(!lp.didFire()) onEdit(t); }} style={{cursor:"pointer"}}>
      <div className="item-title mb8">{t.name} <span className="text-xs text-dim">· {t.role}</span></div>
      <div className="between mb6"><span className="text-sm">🎓 HACCP</span><span className={`badge ${hOk?"b-good":"b-bad"}`}>{hOk?"Valide":"Expirée"} · {t.haccpExp}</span></div>
      <div className="between"><span className="text-sm">🩺 Visite médicale</span><span className={`badge ${vOk?"b-good":"b-bad"}`}>{vOk?"Valide":"Expirée"} · {t.visaExp}</span></div>
    </div>
  );
}

function Training({data,setData,go,db,reload,markLocalWrite,user,lang}){
  const isAdmin=!!user?.isAdmin;
  const[sheet,setSheet]=useState(null); // {item|null} — null = nouvelle fiche
  const[form,setForm]=useState({name:"",role:"",haccpExp:"",visaExp:""});
  const[busy,setBusy]=useState(false);

  function openAdd(){ setForm({name:"",role:"",haccpExp:"",visaExp:""}); setSheet({item:null}); }
  function openEdit(t){ setForm({name:t.name,role:t.role,haccpExp:t.haccpExp,visaExp:t.visaExp}); setSheet({item:t}); }

  async function save(){
    if(!form.name.trim()||busy)return;
    setBusy(true);
    const payload={name:form.name.trim(),role:form.role.trim(),haccpExp:form.haccpExp,visaExp:form.visaExp};
    const res = sheet.item ? await db.updateTraining(sheet.item.id,payload) : await db.addTraining(payload);
    setBusy(false);
    if(res?.error){alert("La fiche n'a pas été enregistrée. Vérifie la connexion Supabase.");await reload?.({force:true});return;}
    markLocalWrite?.();
    if(sheet.item){
      setData(d=>({...d,training:d.training.map(t=>t.id===sheet.item.id?{...t,...payload}:t)}));
    }else if(res?.data){
      const r=res.data;
      setData(d=>({...d,training:[...d.training,{id:r.id,name:r.name,role:r.role,haccpExp:r.haccp_exp,visaExp:r.visa_exp}]}));
    }
    setSheet(null);
  }

  async function remove(t){
    if(!isAdmin)return;
    if(!window.confirm(`Supprimer la fiche de ${t.name} ?`))return;
    const res=await db.deleteTraining(t.id);
    if(res?.error){alert("La suppression a échoué. Vérifie la connexion Supabase.");await reload?.({force:true});return;}
    markLocalWrite?.();
    setData(d=>({...d,training:d.training.filter(x=>x.id!==t.id)}));
  }

  return(<div className="page">
    <GbphHelpButton section="hygiene" go={go}/>
    <div className="section-title">{t("train_title",lang)}</div><div className="section-sub">{t("train_subtitle",lang)}</div>
    {data.training.length===0 && <div className="empty"><div className="empty-icon">🎓</div><div className="empty-title">{t("train_empty_title",lang)}</div><div className="empty-sub">{t("train_empty_sub",lang)}</div></div>}
    {data.training.map(t=><TrainingRow key={t.id} t={t} isAdmin={isAdmin} onEdit={openEdit} onDelete={remove}/>)}
    {isAdmin&&<div className="text-xs text-mute center mt8">Touchez pour modifier · appui long pour supprimer</div>}
    <div className="fab-anchor"><button className="btn-fab" onClick={openAdd}>+</button></div>

    {sheet&&<div className="overlay" onClick={()=>setSheet(null)}><div className="sheet" onClick={e=>e.stopPropagation()}>
      <div className="sheet-handle"></div>
      <div className="sheet-title">{sheet.item?t("train_edit",lang):t("train_new",lang)}</div>
      <div className="field"><label className="label">{t("train_name",lang)}</label><input className="input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="ex : Lucas Martin"/></div>
      <div className="field"><label className="label">{t("train_role",lang)}</label><input className="input" value={form.role} onChange={e=>setForm({...form,role:e.target.value})} placeholder="ex : Chef de cuisine"/></div>
      <div className="row gap8 mb14">
        <div style={{flex:1}}><label className="label">{t("train_haccp_until",lang)}</label><input className="input input-sm" type="text" value={form.haccpExp} onChange={e=>setForm({...form,haccpExp:e.target.value})} placeholder="JJ/MM"/></div>
        <div style={{flex:1}}><label className="label">{t("train_visa_until",lang)}</label><input className="input input-sm" type="text" value={form.visaExp} onChange={e=>setForm({...form,visaExp:e.target.value})} placeholder="JJ/MM"/></div>
      </div>
      <button className="btn btn-primary mb8" onClick={save} disabled={!form.name.trim()||busy}>{busy?"Enregistrement…":sheet.item?t("train_update",lang):t("train_save",lang)}</button>
      {sheet.item&&isAdmin&&<button className="btn btn-ghost" style={{color:T.bad}} onClick={()=>{setSheet(null);remove(sheet.item);}}>{t("train_delete",lang)}</button>}
    </div></div>}
  </div>);
}

function RecipeDetail({recipe,allRecipes,onBack,onEdit,lang}){
  const[mult,setMult]=useState(1);
  const cost=recipeTotalCost(recipe,allRecipes);
  const costPerPortion=recipeCostPerPortion(recipe,allRecipes);
  const m=recipeMargin(recipe,allRecipes);
  const allergens=recipeAllergens(recipe,allRecipes);
  const usedIn=recipe.type==="mere"?findUsedIn(recipe.id,allRecipes):[];
  return(<div className="page"><button className="btn btn-ghost mb14" onClick={onBack}>{t("rdet_back",lang)}</button>
    <div className="card"><div style={{fontSize:42,textAlign:"center",marginBottom:8}}>{recipe.emoji}</div><div className="center" style={{fontFamily:"'Inter',sans-serif",letterSpacing:"-.03em",fontSize:22,fontWeight:600,color:T.text}}>{recipe.name}</div><div className="center text-xs text-dim mb14">{recipe.type==="mere"?`🧪 ${t("rdet_prep",lang)} · ${t("rdet_yield",lang)} ${recipe.yield.qty} ${recipe.yield.unit}`:`${recipe.category} · ${recipe.portions} portion${recipe.portions>1?"s":""}`}</div>
      <div className="tiles">
        {recipe.type==="plat"&&<div style={{background:T.infoBg,padding:12,borderRadius:10,textAlign:"center"}}><div className="text-xs text-dim mb6">{t("rdet_price",lang)}</div><div className="tabular" style={{fontFamily:"'Inter',sans-serif",letterSpacing:"-.03em",fontSize:24,fontWeight:700,color:T.info}}>{recipe.price} €</div></div>}
        <div style={{background:m>=70?T.goodBg:T.infoBg,padding:12,borderRadius:10,textAlign:"center"}}><div className="text-xs text-dim mb6">{recipe.type==="mere"?t("rdet_cost_total",lang):t("rdet_cost_portion",lang)}</div><div className="tabular" style={{fontFamily:"'Inter',sans-serif",letterSpacing:"-.03em",fontSize:24,fontWeight:700,color:T.text}}>{recipe.type==="mere"?cost.toFixed(2):costPerPortion.toFixed(2)} €</div></div>
        {recipe.type==="plat"&&<div style={{background:m>=70?T.goodBg:T.infoBg,padding:12,borderRadius:10,textAlign:"center"}}><div className="text-xs text-dim mb6">{t("rdet_margin",lang)}</div><div className="tabular" style={{fontFamily:"'Inter',sans-serif",letterSpacing:"-.03em",fontSize:24,fontWeight:700,color:m>=70?T.good:T.info}}>{m}%</div></div>}
      </div>
    </div>
    <div className="card"><div className="bucket-label mb8">{t("rdet_production_mode",lang)}</div>
      <div className="mult-row"><span className="mult-label">{t("rdet_multiply",lang)}</span><button className="mult-btn" onClick={()=>setMult(Math.max(.5,mult-.5))}>−</button><div className="mult-val tabular">{mult}</div><button className="mult-btn" onClick={()=>setMult(mult+.5)}>+</button></div>
      <div className="chips mt8">{[1,2,3,5,10,20].map(v=><button key={v} className={`chip ${mult===v?"sel":""}`} onClick={()=>setMult(v)}>×{v}</button>)}</div>
      {recipe.type==="plat"&&<div className="text-xs text-dim mt8 center">→ <b style={{color:T.text}}>{recipe.portions*mult} portion{recipe.portions*mult>1?"s":""}</b> · Coût : <b style={{color:T.text}}>{(cost*mult).toFixed(2)} €</b></div>}
      {recipe.type==="mere"&&<div className="text-xs text-dim mt8 center">→ <b style={{color:T.text}}>{recipe.yield.qty*mult} {recipe.yield.unit}</b> · Coût : <b style={{color:T.text}}>{(cost*mult).toFixed(2)} €</b></div>}
    </div>
    <div className="card"><div className="bucket-label mb8">{t("rdet_ingredients",lang)}</div>
      {recipe.components.map((c,i)=>{const isLast=i===recipe.components.length-1;if(c.kind==="ingredient")return(<div key={i} className="between" style={{padding:"9px 0",borderBottom:isLast?"none":`1px solid ${T.border}`}}><span style={{fontSize:13,color:T.text}}>{c.item}</span><span className="text-xs text-dim tabular">{(c.qty*mult).toFixed(c.qty<10?1:0)} {c.unit} · {(c.cost*mult).toFixed(2)} €</span></div>);const sub=allRecipes.find(r=>r.id===c.subrecipeId);if(!sub)return null;const subUnitCost=recipeTotalCost(sub,allRecipes)/Math.max(1,safeNum(sub.yield?.qty,1));return(<div key={i} className="between" style={{padding:"9px 0",borderBottom:isLast?"none":`1px solid ${T.border}`}}><span style={{fontSize:13,color:T.text}}><span style={{color:T.warn}}>🧪</span> {sub.name} <span className="text-xs text-dim">{t("rdet_recipe_tag",lang)}</span></span><span className="text-xs text-dim tabular">{(c.qty*mult).toFixed(c.qty<10?1:0)} {c.unit} · {(c.qty*mult*subUnitCost).toFixed(2)} €</span></div>);})}
    </div>
    <div className="card"><div className="bucket-label mb8">{t("rdet_preparation",lang)}</div>{recipe.steps.map((s,i)=><div key={i} className="row gap10 mb8"><div className="step-num">{i+1}</div><div style={{fontSize:13,paddingTop:4,color:T.text}}>{s}</div></div>)}</div>
    <div className="card"><div className="bucket-label mb8">{t("rdet_allergens",lang)}</div>{allergens.length===0?<span className="badge b-mute">{t("rdet_none",lang)}</span>:<div className="row gap6" style={{flexWrap:"wrap"}}>{allergens.map(a=><span key={a} className="badge b-warn">{a}</span>)}</div>}</div>
    {recipe.type==="mere"&&usedIn.length>0&&<div className="card"><div className="bucket-label mb8">{t("rdet_used_in",lang)}</div>{usedIn.map(r=><div key={r.id} className="row gap8 mb6"><span style={{fontSize:16}}>{r.emoji}</span><span style={{fontSize:13,color:T.text}}>{r.name}</span></div>)}</div>}
    <button className="btn btn-ghost mt8" onClick={onEdit}>{t("rdet_edit",lang)}</button>
  </div>);
}

function RecipeEditor({recipe,allRecipes,products=[],defaultType="plat",onSave,onCancel,lang}){
  const isEditing=!!recipe;
  const[type,setType]=useState(recipe?.type||defaultType);
  const[name,setName]=useState(recipe?.name||"");
  const[emoji,setEmoji]=useState(recipe?.emoji||"🍽️");
  const[category,setCategory]=useState(recipe?.category||"");
  const[price,setPrice]=useState(recipe?.price?.toString()||"");
  const[portions,setPortions]=useState(recipe?.portions?.toString()||"1");
  const[yieldQty,setYieldQty]=useState(recipe?.yield?.qty?.toString()||"1000");
  const[yieldUnit,setYieldUnit]=useState(recipe?.yield?.unit||"ml");
  const[components,setComponents]=useState(recipe?.components||[]);
  const[steps,setSteps]=useState(recipe?.steps||[]);
  const[allergensStr,setAllergensStr]=useState((recipe?.allergens||[]).join(", "));
  const otherRecipes=allRecipes.filter(r=>r.type==="mere"&&(!recipe||r.id!==recipe.id));
  // Ajout en tête de liste plutôt qu'en fin — sur une grande recette, ça
  // évite de devoir scroller jusqu'en bas à chaque nouvel ingrédient.
  function addIngredient(){setComponents([{kind:"ingredient",item:"",qty:"",unit:"g",cost:"",productId:null},...components]);}
  function addSubrecipe(){if(!otherRecipes.length)return alert("Créez d'abord une préparation");setComponents([{kind:"subrecipe",subrecipeId:otherRecipes[0].id,qty:"",unit:otherRecipes[0].yield.unit},...components]);}
  function updateComp(i,patch){setComponents(components.map((c,idx)=>idx===i?{...c,...patch}:c));}
  function removeComp(i){setComponents(components.filter((_,idx)=>idx!==i));}
  function addStep(){setSteps([...steps,""]);}
  function updateStep(i,val){setSteps(steps.map((s,idx)=>idx===i?val:s));}
  function removeStep(i){setSteps(steps.filter((_,idx)=>idx!==i));}
  function save(){if(!name)return alert("Nom requis");
    const normComponents=components.map(c=>{
      const qty=parseFloat(String(c.qty).replace(",","."))||0;
      if(c.kind==="ingredient"&&c.productId){
        const prod=products.find(p=>p.id===c.productId);
        const autoCost=computeIngredientCost(qty,c.unit,prod);
        return {...c,qty,cost:autoCost!=null?autoCost:(parseFloat(String(c.cost).replace(",","."))||0)};
      }
      return {...c,qty,cost:c.cost!=null?parseFloat(String(c.cost).replace(",","."))||0:undefined};
    });
    const rec={id:recipe?.id,name,emoji,type,category,components:normComponents.filter(c=>c.kind==="ingredient"?c.item&&c.qty>0:c.qty>0),steps:steps.filter(s=>s.trim()),allergens:allergensStr.split(",").map(a=>a.trim()).filter(Boolean)};
    if(type==="plat"){rec.price=parseFloat(price)||0;rec.portions=parseInt(portions)||1;}else{rec.yield={qty:parseFloat(yieldQty)||0,unit:yieldUnit};}
    onSave(rec);}
  const normForPreview=components.map(c=>{
    const qty=parseFloat(String(c.qty).replace(",","."))||0;
    if(c.kind==="ingredient"&&c.productId){
      const prod=products.find(p=>p.id===c.productId);
      const autoCost=computeIngredientCost(qty,c.unit,prod);
      return {...c,qty,cost:autoCost!=null?autoCost:0};
    }
    return {...c,qty,cost:parseFloat(String(c.cost).replace(",","."))||0};
  });
  const preview={components:normForPreview,type,price:parseFloat(price)||0,portions:parseInt(portions)||1,yield:{qty:parseFloat(yieldQty)||1,unit:yieldUnit},allergens:[],id:-1};
  const previewCost=recipeCostPerPortion(preview,allRecipes);
  const previewMargin=type==="plat"&&price?Math.round(((parseFloat(price)-previewCost)/parseFloat(price))*100):null;
  return(<div className="page"><div className="between mb14"><button className="btn btn-ghost btn-sm" style={{width:"auto"}} onClick={onCancel}>{t("redit_cancel",lang)}</button><button className="btn btn-primary btn-sm" style={{width:"auto"}} onClick={save}>✓ {isEditing?t("redit_update",lang):t("redit_create",lang)}</button></div>
    <div className="section-title">{isEditing?t("redit_title_edit",lang):t("redit_title_new",lang)}</div><div className="section-sub">{t("redit_subtitle",lang)}</div>
    <div className="card">
      <div className="field"><label className="label">{t("redit_type",lang)}</label><SegmentedControl value={type} onChange={setType} options={[{value:"plat",label:t("redit_type_dish",lang)},{value:"mere",label:t("redit_type_prep",lang)}]}/></div>
      <div className="row gap8"><div style={{flex:0}}><label className="label">{t("redit_icon",lang)}</label><input className="input input-sm" style={{width:60,textAlign:"center"}} value={emoji} onChange={e=>setEmoji(e.target.value)} maxLength={2}/></div><div style={{flex:1}}><label className="label">{t("redit_name",lang)}</label><input className="input input-sm" value={name} onChange={e=>setName(e.target.value)}/></div></div>
      <div style={{height:14}}></div>
      <div className="field"><label className="label">{t("redit_category",lang)}</label><input className="input input-sm" value={category} onChange={e=>setCategory(e.target.value)} placeholder={type==="plat"?"ex : Côté Mer":"ex : Bases"}/></div>
      {type==="plat"?<div className="row gap8"><div style={{flex:1}}><label className="label">{t("redit_price",lang)}</label><input className="input input-sm" type="number" step="0.5" value={price} onChange={e=>setPrice(e.target.value)}/></div><div style={{flex:1}}><label className="label">{t("redit_portions",lang)}</label><input className="input input-sm" type="number" value={portions} onChange={e=>setPortions(e.target.value)}/></div></div>:<div className="row gap8"><div style={{flex:1}}><label className="label">{t("redit_yield",lang)}</label><input className="input input-sm" type="number" value={yieldQty} onChange={e=>setYieldQty(e.target.value)}/></div><div style={{flex:0,width:80}}><label className="label">{t("redit_unit",lang)}</label><select className="input input-sm" value={yieldUnit} onChange={e=>setYieldUnit(e.target.value)}><option>ml</option><option>L</option><option>g</option><option>kg</option><option>pce</option></select></div></div>}
    </div>
    <div className="card" style={{background:T.bg3}}><div className="bucket-label mb8">{t("redit_cost_preview",lang)}</div>
      <div className="row gap12" style={{flexWrap:"wrap"}}>{type==="plat"?<><div><div className="text-xs text-dim">{t("redit_cost_per_portion",lang)}</div><div className="fw7 tabular" style={{color:T.text}}>{previewCost.toFixed(2)} €</div></div>{price&&<div><div className="text-xs text-dim">{t("redit_margin",lang)}</div><div className="fw7 tabular" style={{color:previewMargin>=70?T.good:previewMargin>=50?T.info:T.bad}}>{previewMargin}%</div></div>}</>:<><div><div className="text-xs text-dim">{t("redit_total_cost",lang)}</div><div className="fw7 tabular" style={{color:T.text}}>{normForPreview.reduce((a,c)=>a+(c.cost||0),0).toFixed(2)} €</div></div></>}</div>
    </div>
    <div className="card"><div className="between mb8"><div className="bucket-label">{t("redit_ingredients",lang)}</div><div className="row gap6"><button className="btn btn-ghost btn-sm" style={{width:"auto",padding:"6px 10px"}} onClick={addIngredient}>{t("redit_add_ingredient",lang)}</button>{otherRecipes.length>0&&<button className="btn btn-ghost btn-sm" style={{width:"auto",padding:"6px 10px"}} onClick={addSubrecipe}>{t("redit_add_prep",lang)}</button>}</div></div>
      {components.length===0&&<div className="text-xs text-dim center" style={{padding:"10px 0"}}>{t("redit_no_ingredient",lang)}</div>}
      {components.map((c,i)=>{
        if(c.kind!=="ingredient")return(<div key={i} style={{padding:"10px 0",borderBottom:i<components.length-1?`1px solid ${T.border}`:"none"}}><div className="row gap6 mb6"><span style={{fontSize:16}}>🧪</span><select className="input input-sm" style={{flex:1}} value={c.subrecipeId} onChange={e=>{const sub=allRecipes.find(r=>r.id===parseInt(e.target.value));updateComp(i,{subrecipeId:parseInt(e.target.value),unit:sub.yield.unit});}}>{otherRecipes.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></div><div className="row gap6"><input className="input input-sm" style={{flex:1}} type="text" inputMode="decimal" value={c.qty} onChange={e=>{const v=e.target.value;if(/^\d*[.,]?\d*$/.test(v))updateComp(i,{qty:v.replace(",",".")});}}/><span style={{padding:"9px 12px",color:T.textDim,fontSize:13}}>{c.unit}</span><button style={{width:44,height:44,borderRadius:9,background:T.badBg,color:T.bad,border:"none",fontSize:16,flexShrink:0}} onClick={()=>removeComp(i)}>×</button></div></div>);
        // Ligne ingrédient : soit lié à un produit du catalogue (coût auto), soit saisie libre
        const linkedProduct=c.productId?products.find(p=>p.id===c.productId):null;
        const autoCost=linkedProduct?computeIngredientCost(parseFloat(String(c.qty).replace(",","."))||0,c.unit,linkedProduct):null;
        const unitMismatch=linkedProduct&&autoCost===null;
        return(<div key={i} style={{padding:"10px 0",borderBottom:i<components.length-1?`1px solid ${T.border}`:"none"}}>
          <div className="field" style={{marginBottom:6}}>
            <select className="input input-sm" value={c.productId||""} onChange={e=>{
              const pid=e.target.value?parseInt(e.target.value):null;
              const prod=pid?products.find(p=>p.id===pid):null;
              updateComp(i,{productId:pid,item:prod?prod.name:c.item});
            }}>
              <option value="">{t("redit_free_entry",lang)}</option>
              {products.map(p=><option key={p.id} value={p.id}>{p.name} ({p.price.toFixed(2)}€/{p.unit})</option>)}
            </select>
          </div>
          {!c.productId&&<input className="input input-sm mb6" value={c.item} onChange={e=>updateComp(i,{item:e.target.value})} placeholder={t("redit_ingredient_name",lang)}/>}
          <div className="row gap6">
            <input className="input input-sm" style={{flex:1}} type="text" inputMode="decimal" value={c.qty} onChange={e=>{const v=e.target.value;if(/^\d*[.,]?\d*$/.test(v))updateComp(i,{qty:v.replace(",",".")});}} placeholder={t("redit_qty",lang)}/>
            <select className="input input-sm" style={{flex:0,width:60}} value={c.unit} onChange={e=>updateComp(i,{unit:e.target.value})}><option>g</option><option>kg</option><option>ml</option><option>L</option><option>pce</option><option>u</option></select>
            {c.productId
              ? <div className="input input-sm" style={{flex:1,display:"flex",alignItems:"center",color:unitMismatch?T.bad:T.good,fontWeight:700,background:T.bg3}}>{unitMismatch?"⚠ unité":`${(autoCost||0).toFixed(2)} €`}</div>
              : <input className="input input-sm" style={{flex:1}} type="text" inputMode="decimal" value={c.cost} onChange={e=>{const v=e.target.value;if(/^\d*[.,]?\d*$/.test(v))updateComp(i,{cost:v.replace(",",".")});}} placeholder="€"/>}
            <button style={{width:44,height:44,borderRadius:9,background:T.badBg,color:T.bad,border:"none",fontSize:16,flexShrink:0}} onClick={()=>removeComp(i)}>×</button>
          </div>
          {unitMismatch&&<div className="text-xs mt4" style={{color:T.bad}}>Ce produit est acheté au {linkedProduct.unit} — choisissez une unité compatible ({linkedProduct.unit==="kg"?"g ou kg":linkedProduct.unit==="L"?"ml ou L":"pce"}).</div>}
        </div>);
      })}
    </div>
    <div className="card"><div className="between mb8"><div className="bucket-label">{t("redit_steps",lang)}</div><button className="btn btn-ghost btn-sm" style={{width:"auto",padding:"6px 10px"}} onClick={addStep}>{t("redit_add_step",lang)}</button></div>
      {steps.length===0&&<div className="text-xs text-dim center" style={{padding:"10px 0"}}>{t("redit_no_step",lang)}</div>}
      {steps.map((s,i)=><div key={i} className="row gap8 mb6"><div className="step-num">{i+1}</div><input className="input input-sm" style={{flex:1}} value={s} onChange={e=>updateStep(i,e.target.value)} placeholder={t("redit_describe",lang)}/><button style={{width:44,height:44,borderRadius:8,background:T.badBg,color:T.bad,border:"none",fontSize:14,flexShrink:0}} onClick={()=>removeStep(i)}>×</button></div>)}
    </div>
    <div className="card"><div className="field" style={{marginBottom:0}}><label className="label">{t("redit_allergens",lang)}</label><input className="input input-sm" value={allergensStr} onChange={e=>setAllergensStr(e.target.value)} placeholder="Gluten, Lait..."/></div></div>
    <button className="btn btn-primary mb14" onClick={save}>✓ {isEditing?t("redit_update",lang):t("redit_create",lang)}</button>
  </div>);
}

// Ligne de recette : tap = ouvrir le détail, appui long = supprimer (admin
// seul). Remplace le swipe pour uniformiser avec le reste de l'app.
function RecipeRow({rec,cost,m,canDelete,onOpen,onDelete}){
  const lp=useLongPress(()=>{ if(!canDelete)return; haptic.medium(); onDelete(rec); });
  return(
    <div className="item" {...(canDelete?lp.handlers:{})} style={{marginBottom:0}} onClick={()=>{ if(!lp.didFire()) onOpen(rec); }}>
      <div className="item-icon" style={{background:rec.type==="mere"?T.warnBg:T.infoBg}}>{rec.emoji}</div>
      <div className="item-body"><div className="item-title">{rec.name}</div><div className="item-sub">{rec.type==="mere"?<>{rec.yield?.qty||0} {rec.yield?.unit||"u"} · {cost.toFixed(2)} €/{rec.yield?.unit||"u"}</>:<>{rec.category} · {rec.price} €</>}</div></div>
      {rec.type==="plat"?<span className={`badge ${m>=70?"b-good":m>=50?"b-info":"b-bad"}`}>{m}%</span>:<span className="badge b-warn tabular">{cost.toFixed(2)} €</span>}
    </div>
  );
}

function Recipes({data,setData,db,reload,user,markLocalWrite,lang}){
  const[view,setView]=useState("list");const[sel,setSel]=useState(null);const[typeFilter,setTypeFilter]=useState("plat");
  const allRecipes=data.recipes;
  const filtered=allRecipes.filter(r=>r.type===typeFilter);
  const nbPlats=allRecipes.filter(r=>r.type==="plat").length;
  const nbPreps=allRecipes.filter(r=>r.type==="mere").length;
  if(view==="edit")return<RecipeEditor recipe={sel?allRecipes.find(r=>r.id===sel):null} defaultType={typeFilter} allRecipes={allRecipes} products={data.products||[]} lang={lang} onSave={async(rec)=>{
    const res=await db.saveRecipe(rec);
    if(res?.error){alert("La fiche n'a pas été enregistrée. Vérifie la connexion Supabase.");await reload({force:true});return;}
    // Une fiche technique est un objet riche (composants, étapes…) : on
    // recharge uniquement si Supabase ne renvoie pas la ligne complète.
    if(res?.data){
      const r=res.data;
      const entry={id:r.id,name:r.name,emoji:r.emoji,type:r.type,category:r.category,price:r.price,portions:r.portions,yield:r.yield_qty?{qty:r.yield_qty,unit:r.yield_unit}:undefined,components:r.components||[],steps:r.steps||[],allergens:r.allergens||[]};
      markLocalWrite?.();
      setData(d=>({...d,recipes: d.recipes.some(x=>x.id===entry.id) ? d.recipes.map(x=>x.id===entry.id?entry:x) : [...d.recipes,entry]}));
    } else { await reload({force:true}); }
    setView("list");setSel(null);
  }} onCancel={()=>{setView("list");setSel(null);}}/>;
  if(view==="detail"&&sel)return<RecipeDetail recipe={allRecipes.find(r=>r.id===sel)} allRecipes={allRecipes} onBack={()=>{setView("list");setSel(null);}} onEdit={()=>setView("edit")} lang={lang}/>;
  return(<div className="page"><div className="section-title">{t("recipe_title",lang)}</div><div className="section-sub">{nbPlats} {nbPlats>1?t("recipe_count_dishes",lang):t("recipe_count_dish",lang)} · {nbPreps} {nbPreps>1?t("recipe_count_preps",lang):t("recipe_count_prep",lang)}</div>
    <SegmentedControl value={typeFilter} onChange={setTypeFilter} options={[{value:"plat",label:`🍽️ ${t("recipe_tab_dishes",lang)}${nbPlats?` (${nbPlats})`:""}`},{value:"mere",label:`🧪 ${t("recipe_tab_preps",lang)}${nbPreps?` (${nbPreps})`:""}`}]}/>
    <div style={{height:14}}></div>
    {filtered.length===0 && <div className="empty"><div className="empty-icon">{typeFilter==="mere"?"🧪":"🍽️"}</div><div className="empty-title">{typeFilter==="mere"?t("recipe_empty_prep",lang):t("recipe_empty_dish",lang)}</div><div className="empty-sub">{typeFilter==="mere"?t("recipe_empty_prep_sub",lang):t("recipe_empty_dish_sub",lang)}</div></div>}
    {filtered.map(rec=>{
      const cost=recipeCostPerPortion(rec,allRecipes);const m=recipeMargin(rec,allRecipes);
      return(<RecipeRow key={rec.id} rec={rec} cost={cost} m={m} canDelete={!!user?.isAdmin}
        onOpen={r=>{setSel(r.id);setView("detail");}}
        onDelete={async(r)=>{
          if(!window.confirm(`Supprimer "${r.name}" ?`))return;
          const res=await db.deleteRecipe(r.id);
          if(res?.error){alert("La suppression a échoué. Vérifie la connexion Supabase.");await reload({force:true});return;}
          markLocalWrite?.();
          setData(d=>({...d,recipes:d.recipes.filter(x=>x.id!==r.id)}));
        }}/>);
    })}
    <div className="fab-anchor"><button className="btn-fab" onClick={()=>{setSel(null);setView("edit");}}>+</button></div>
  </div>);
}

// Ligne de tâche : tap = cocher/décocher, appui long = supprimer (admin seul).
// L'appui long remplace le swipe, qui entrait en conflit avec le bouton "+"
// de chaque catégorie.
function TaskRow({t,cat,onToggle,onDelete,canDelete}){
  const lp=useLongPress(()=>{ if(!canDelete)return; haptic.medium(); onDelete(); });
  return(
    <div className={`item ${lp.pressing?"pressing":""}`}
      {...(canDelete?lp.handlers:{})}
      onClick={()=>{ if(!lp.didFire()) onToggle(); }}
      style={{opacity:t.done?.45:1,borderLeftColor:cat.color,borderLeftWidth:3,borderLeftStyle:"solid"}}>
      <div className={`check ${t.done?"on":""}`}>{t.done?"✓":""}</div>
      <div className="item-body">
        <div className="item-title" style={{textDecoration:t.done?"line-through":"none"}}>{t.task}</div>
        <div className="item-sub">{[t.resp,t.qty].filter(Boolean).join(" · ")||"—"}</div>
      </div>
    </div>
  );
}

function Tasks({data,setData,db,reload,user,lang}){
  const[show,setShow]=useState(false);const[filter,setFilter]=useState("all");const[busy,setBusy]=useState(false);
  const[form,setForm]=useState({task:"",resp:"",qty:"",prio:"med",categoryId:null});
  // Seuls les admins peuvent supprimer une tâche (appui long).
  const isAdmin=!!user?.isAdmin;
  // Créneau réellement en cours, calé sur les horaires paramétrés du restaurant
  // (Paramètres → HACCP → Horaires de service) — et non sur un 15h en dur.
  // Entre minuit et resetSoir, on est encore sur le service du soir de la veille.
  const currentSlot=(()=>{
    const RESET_MIDI = data?.haccpSettings?.resetMidi ?? (16*60+30);
    const RESET_SOIR = Math.min(data?.haccpSettings?.resetSoir ?? (3*60), 9*60); // plafonné, voir Paramètres → Horaires
    const n=new Date(); const mins=n.getHours()*60+n.getMinutes();
    if(mins < RESET_SOIR)  return {offset:-1, service:"soir"}; // nuit → service de la veille
    if(mins < RESET_MIDI)  return {offset:0,  service:"midi"};
    return {offset:0, service:"soir"};
  })();

  // Créneau sélectionné : décalage en jours (0=aujourd'hui) + service (midi/soir)
  // Pas de Math.max(...,0) ici : un décalage de -1 (encore le service d'hier
  // soir, entre minuit et l'horaire de bascule) est une valeur légitime, pas
  // une erreur à corriger. L'écraser à 0 faisait apparaître une liste vide
  // "d'aujourd'hui" à la place des tâches d'hier soir encore en cours —
  // exactement la confusion remontée.
  const[dayOffset,setDayOffset]=useState(currentSlot.offset);
  const[service,setService]=useState(currentSlot.service);
  const categories=data.taskCategories||[];

  // Sommes-nous sur le créneau du service en cours ? Sert de repère visuel :
  // toute la carte d'en-tête change de couleur si on prépare un autre créneau.
  const isCurrentSlot = dayOffset===currentSlot.offset && service===currentSlot.service;
  function goToCurrentSlot(){ haptic.light(); setDayOffset(currentSlot.offset); setService(currentSlot.service); }

  const crenauDate=new Date();crenauDate.setDate(crenauDate.getDate()+dayOffset);
  const crenauDateStr=isoDate(crenauDate);
  const dayLabel=dayOffset===0?"Aujourd'hui":dayOffset===1?"Demain":dayOffset===-1?"Hier":crenauDate.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"short"});

  // Ne garde que les tâches du créneau affiché.
  const crenauTasks=data.tasks.filter(t=>t.date===crenauDateStr&&(t.service||"midi")===service);

  async function toggle(id){
    if(busy)return;
    haptic.light();
    const t=data.tasks.find(x=>x.id===id); if(!t)return;
    const next=!t.done;
    setData(d=>({...d,tasks:d.tasks.map(x=>x.id===id?{...x,done:next}:x)}));
    const res=await db.toggleTask(id,next);
    if(res?.error){alert("La tâche n'a pas été enregistrée. Vérifie la connexion Supabase.");await reload?.({force:true});}
  }
  async function add(){
    const cleanTask=form.task.trim();
    const catId=form.categoryId||(categories[0]?.id);
    if(!cleanTask||!catId||busy)return;
    setBusy(true);
    const payload={...form,task:cleanTask,resp:form.resp.trim(),qty:form.qty.trim(),categoryId:catId,date:crenauDateStr,service};
    const res=await db.addTask(payload);
    setBusy(false);
    if(res?.error){alert("Impossible d'ajouter la tâche. Vérifie la connexion Supabase.");return;}
    await reload({force:true});setShow(false);setForm({task:"",resp:"",qty:"",prio:"med",categoryId:null});
  }
  // endService() supprimé : la clôture des créneaux est désormais entièrement
  // automatique (voir closeSlot() dans App, déclenché au changement de
  // service). Plus de bouton manuel — personne ne peut clôturer par erreur
  // ou oublier de le faire.
  async function removeTask(t){
    // Ouvert à toute l'équipe : la confirmation reste le seul garde-fou
    // contre une suppression accidentelle.
    if(!window.confirm(`Supprimer "${t.task}" ?`))return;
    const res=await db.deleteTask?.(t.id);
    if(res?.error){alert("La tâche n'a pas été supprimée. Vérifie la connexion Supabase.");await reload?.({force:true});return;}
    setData(d=>({...d,tasks:d.tasks.filter(x=>x.id!==t.id)}));
    haptic.success();
  }
  function openAddFor(catId){setForm({task:"",resp:"",qty:"",prio:"med",categoryId:catId});setShow(true);}
  const visibleTasks=filter==="all"?crenauTasks:crenauTasks.filter(t=>t.categoryId===filter);
  const done=visibleTasks.filter(t=>t.done).length;const total=visibleTasks.length;const pct=safePct(done,total);
  const urgentLeft=visibleTasks.filter(t=>t.prio==="high"&&!t.done).length;
  const filterOptions=[{value:"all",label:`Tous (${crenauTasks.length})`},...categories.map(c=>({value:c.id,label:`${c.icon} ${c.name.replace("Mise en place ","")} (${crenauTasks.filter(t=>t.categoryId===c.id).length})`}))];
  const grouped=filter==="all"?categories.map(cat=>({cat,tasks:crenauTasks.filter(t=>t.categoryId===cat.id)})).filter(g=>g.tasks.length>0):[{cat:categories.find(c=>c.id===filter),tasks:visibleTasks}];
  const prios=[{k:"high",l:"⚡ Urgent",c:T.bad},{k:"med",l:"Normal",c:T.warn},{k:"low",l:"Quand possible",c:T.textDim}];
  const suggestions=["Pain burger","Sauce du jour","Tailler tomates","Bacs de frites","Vinaigrette","Préparer garnitures"];
  return(<div className="page"><div className="section-title">Mise en place</div><div className="section-sub">{done} / {total} · {Math.round(pct)}%</div>

    {/* Bandeau de créneau : c'est LE repère de l'écran. Il change de couleur
        selon qu'on est sur le service en cours ou ailleurs, pour qu'on ne
        saisisse jamais une tâche dans le mauvais créneau sans s'en rendre compte. */}
    <div className="card mb14" style={{
      background: isCurrentSlot ? T.bg2 : T.warnBg,
      border: `1px solid ${isCurrentSlot ? T.border : T.warn+"66"}`,
    }}>
      <div className="between">
        <button className="btn btn-ghost btn-sm" style={{width:"auto",padding:"6px 10px"}} onClick={()=>setDayOffset(o=>Math.max(o-1,currentSlot.offset))} disabled={dayOffset<=currentSlot.offset}>‹</button>
        <div style={{textAlign:"center",flex:1}}>
          <div style={{fontWeight:800,fontSize:16,textTransform:"capitalize",lineHeight:1.2}}>
            {service==="midi"?"☀️":"🌙"} {dayLabel} · {service==="midi"?t("tasks_slot_midi",lang):t("tasks_slot_soir",lang)}
          </div>
          <div style={{fontSize:11,fontWeight:700,color:isCurrentSlot?T.good:T.warn,marginTop:3}}>
            {isCurrentSlot ? `● ${t("tasks_current_service",lang)}` : `◆ ${t("tasks_other_slot",lang)}`}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" style={{width:"auto",padding:"6px 10px"}} onClick={()=>setDayOffset(o=>o+1)}>›</button>
      </div>

      <div style={{height:12}}></div>
      <SegmentedControl value={service} onChange={setService} options={[{value:"midi",label:`☀️ ${t("tasks_slot_midi",lang)}`},{value:"soir",label:`🌙 ${t("tasks_slot_soir",lang)}`}]}/>

      {/* Retour rapide au service en cours, visible seulement si on s'en est éloigné */}
      {!isCurrentSlot && (
        <button className="btn btn-sm mt10" onClick={goToCurrentSlot} style={{borderColor:T.warn,color:T.warn,background:"transparent"}}>
          ↩ {t("tasks_back_to_current",lang)}
        </button>
      )}

      <div style={{height:12}}></div>
      <div className="between mb6">
        <span className="text-xs" style={{fontWeight:700,color:T.textDim}}>{done} / {total} {t("tasks_done_count",lang)}</span>
        {urgentLeft>0&&<span className="badge b-bad">{urgentLeft} urgent{urgentLeft>1?"s":""}</span>}
      </div>
      <div className="pbar"><div className="pfill" style={{width:`${pct}%`,background:T.accent}}></div></div>
    </div>
    {/* Le bouton manuel de clôture a été retiré : la fermeture des créneaux
        est désormais automatique, calée sur les horaires de service. */}
    <div className="chips mb14">{filterOptions.map(opt=><button key={opt.value} className={`chip ${filter===opt.value?"sel":""}`} onClick={()=>setFilter(opt.value)}>{opt.label}</button>)}</div>
    {grouped.length===0&&<div className="empty"><div className="empty-icon">📋</div><div className="empty-title">Aucune tâche</div><div className="empty-sub">{dayOffset>0?`Prépare la mise en place de ${dayLabel.toLowerCase()} ${service}`:"Ajoutez votre première tâche"}</div></div>}
    {grouped.map(({cat,tasks})=>{if(!cat)return null;const catDone=tasks.filter(t=>t.done).length;return(<div key={cat.id} style={{marginBottom:18}}>
      <div className="between mb8" style={{padding:"0 4px"}}><div className="row gap8"><span style={{fontSize:18}}>{cat.icon}</span><span style={{fontSize:13,fontWeight:700,color:cat.color}}>{cat.name}</span><span className="text-xs text-dim">· {catDone}/{tasks.length}</span></div><button onClick={()=>openAddFor(cat.id)} style={{background:"transparent",border:"none",color:cat.color,fontSize:18,fontWeight:700,padding:"4px 8px",cursor:"pointer"}}>+</button></div>
      {prios.map(p=>{const pt=tasks.filter(t=>t.prio===p.k);if(!pt.length)return null;return(<div key={p.k} style={{marginBottom:8}}><div style={{fontSize:10,fontWeight:700,color:p.c,marginBottom:4,marginLeft:6,letterSpacing:".06em",textTransform:"uppercase"}}>{p.l}</div>{pt.map(t=>(
      <TaskRow key={t.id} t={t} cat={cat} canDelete={true}
        onToggle={()=>toggle(t.id)}
        onDelete={()=>removeTask(t)}/>
    ))}</div>);})}
    </div>);})}
    {/* Reprend la catégorie affichée par le filtre actif (l'onglet "Froid",
        "Chaud"...) : pas besoin de la resélectionner dans le formulaire.
        Sur "Tous", rien à présélectionner — openAddFor(null) garde le
        comportement d'avant. */}
    <div className="fab-anchor"><button className="btn-fab" onClick={()=>openAddFor(filter==="all"?null:filter)}>+</button></div>
    {show&&<div className="overlay" onClick={()=>setShow(false)}><div className="sheet" onClick={e=>e.stopPropagation()}>
      <div className="sheet-handle"></div><div className="sheet-title">{t("tasks_add",lang)}</div>
      {/* Rappel du créneau de destination : c'est ici que les erreurs se
          produisaient — rien n'indiquait où la tâche allait atterrir. */}
      <div className="banner mb14" style={{background:isCurrentSlot?T.infoBg:T.warnBg,border:`1px solid ${isCurrentSlot?T.info+"44":T.warn+"66"}`}}>
        <span>{service==="midi"?"☀️":"🌙"}</span>
        <div style={{fontSize:12,lineHeight:1.45}}>
          {t("tasks_will_be_added_to",lang)} <b style={{textTransform:"capitalize"}}>{dayLabel} · {service==="midi"?t("tasks_slot_midi",lang):t("tasks_slot_soir",lang)}</b>
          {!isCurrentSlot && <span style={{display:"block",color:T.warn,fontWeight:700,marginTop:2}}>{t("tasks_not_current",lang)}</span>}
        </div>
      </div>
      <div className="field"><label className="label">Catégorie</label><div className="chips">{categories.map(c=><button key={c.id} className={`chip ${form.categoryId===c.id?"sel":""}`} onClick={()=>setForm({...form,categoryId:c.id})}>{c.icon} {c.name.replace("Mise en place ","")}</button>)}</div></div>
      <div className="field"><label className="label">Description</label><input className="input" value={form.task} onChange={e=>setForm({...form,task:e.target.value})} placeholder="ex : Tailler tomates"/></div>
      {!form.task&&<div className="chips mb14">{suggestions.map(s=><button key={s} className="chip" onClick={()=>setForm(f=>({...f,task:s}))}>{s}</button>)}</div>}
      <div className="row gap8 mb14"><div style={{flex:1}}><label className="label">Resp.</label><input className="input input-sm" value={form.resp} onChange={e=>setForm({...form,resp:e.target.value})} placeholder="ex : Kevin"/></div><div style={{flex:1}}><label className="label">Qté</label><input className="input input-sm" value={form.qty} onChange={e=>setForm({...form,qty:e.target.value})} placeholder="ex : 2 bacs"/></div></div>
      <div className="field"><label className="label">Priorité</label><SegmentedControl value={form.prio} onChange={v=>setForm({...form,prio:v})} options={[{value:"high",label:"⚡ Urgent"},{value:"med",label:"Normal"},{value:"low",label:"+ tard"}]}/></div>
      <button className="btn btn-primary mt8" onClick={add} disabled={!form.task.trim()||!(form.categoryId||categories[0]?.id)||busy}>{busy?"Ajout…":"Ajouter"}</button>
    </div></div>}
  </div>);
}

function Margins({data}){
  const plats=data.recipes.filter(r=>r.type==="plat");
  const margins=plats.map(r=>({recipe:r,m:recipeMargin(r,data.recipes),cost:recipeCostPerPortion(r,data.recipes)}));
  const avg=margins.length?(margins.reduce((a,b)=>a+b.m,0)/margins.length).toFixed(0):0;
  return(<div className="page"><div className="section-title">Marges</div><div className="section-sub">Rentabilité par plat</div>
    <div className="urgent-card" style={{background:`linear-gradient(135deg, ${T.accent} 0%, ${T.accentDk} 100%)`,boxShadow:"none"}}><div className="urgent-label">Marge moyenne</div><div><span style={{fontFamily:"'Inter',sans-serif",letterSpacing:"-.03em",fontSize:46,fontWeight:700,color:"white"}} className="tabular">{avg}</span><span style={{fontSize:16,opacity:.85,marginLeft:4,color:"white"}}>%</span></div><div className="urgent-sub" style={{marginBottom:0,marginTop:6}}>{margins.filter(x=>x.m>=70).length} excellents · {margins.filter(x=>x.m<50).length} à revoir</div></div>
    {margins.map((x,i)=><div key={i} className="card"><div className="between mb10"><div style={{flex:1}}><div className="item-title">{x.recipe.name}</div><div className="text-xs text-dim">{x.recipe.price} € · coût {x.cost.toFixed(2)} €</div></div><div className="tabular" style={{fontFamily:"'Inter',sans-serif",letterSpacing:"-.03em",fontSize:26,fontWeight:700,color:x.m>=70?T.good:x.m>=50?T.info:T.bad}}>{x.m}%</div></div><div className="pbar"><div className="pfill" style={{width:`${x.m}%`,background:x.m>=70?T.good:x.m>=50?T.info:T.bad}}></div></div></div>)}
  </div>);
}

// ─── PLANNING ÉQUIPE — semaine réelle, créneaux stockés en base ───────────────
// Date au format AAAA-MM-JJ en heure LOCALE. Ne pas utiliser toISOString(),
// qui convertit en UTC : en France (UTC+1/+2), une saisie faite à 1h du matin
// se retrouvait rangée à la date de la veille — précisément le créneau du
// service du soir qui traverse minuit.
const isoDate=(d)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
function mondayOf(d){const x=new Date(d);const wd=(x.getDay()+6)%7;x.setDate(x.getDate()-wd);x.setHours(0,0,0,0);return x;}
// Ligne de créneau planning : tap = modifier (admin), appui long =
// supprimer (admin). Remplace le swipe pour uniformiser avec le reste de
// l'app.
function ShiftRow({s,u,canEdit,onOpen,onDelete}){
  const lp=useLongPress(()=>{ if(!canEdit)return; haptic.medium(); onDelete(s); });
  return(
    <div className="item" {...(canEdit?lp.handlers:{})} style={{marginBottom:0}} onClick={()=>{ if(!lp.didFire()&&canEdit) onOpen(s); }}>
      <div className="item-icon" style={{background:T.infoBg,fontWeight:700,fontSize:14}}>{u?.initials||"?"}</div>
      <div className="item-body"><div className="item-title">{u?.name||"Inconnu"}</div><div className="item-sub">{u?.role||""}</div></div>
      <span className="badge b-info tabular">{s.start} – {s.end}</span>
    </div>
  );
}

function Planning({data,setData,user,db,reload,markLocalWrite,lang}){
  const[weekStart,setWeekStart]=useState(()=>mondayOf(new Date()));
  const[dayIdx,setDayIdx]=useState(()=>((new Date().getDay()+6)%7));
  const[sheet,setSheet]=useState(null); // null | {shift?} pour ajout/édition
  const users=Array.isArray(data?.users)?data.users:[];
  const shifts=Array.isArray(data?.shifts)?data.shifts:[];
  const isAdmin=user?.isAdmin||user?.role?.toLowerCase().includes("chef");

  const days=[...Array(7)].map((_,i)=>{const d=new Date(weekStart);d.setDate(d.getDate()+i);return d;});
  const selDate=isoDate(days[dayIdx]);
  const dayShifts=shifts.filter(s=>s.date===selDate).sort((a,b)=>(a.start||"").localeCompare(b.start||""));
  const fmtRange=`${days[0].getDate()} ${days[0].toLocaleDateString("fr-FR",{month:"short"})} — ${days[6].getDate()} ${days[6].toLocaleDateString("fr-FR",{month:"short"})}`;

  function openAdd(){setSheet({userId:users[0]?.id,date:selDate,start:"09:00",end:"15:00"});}
  function openEdit(s){setSheet({...s});}
  async function save(){
    if(!sheet.userId||!sheet.start||!sheet.end)return;
    const res = sheet.id ? await db.updateShift(sheet.id,sheet) : await db.addShift(sheet);
    if(res?.error){ alert("Le créneau n'a pas été enregistré. Vérifie la connexion Supabase."); await reload({force:true}); return; }
    await reload({force:true});setSheet(null);
  }
  async function remove(){
    if(!sheet?.id)return;
    if(!window.confirm("Supprimer ce créneau ?"))return;
    const shiftId=sheet.id;
    const res=await db.deleteShift(shiftId);
    if(res?.error){alert("La suppression a échoué. Vérifie la connexion Supabase.");await reload({force:true});return;}
    markLocalWrite?.();
    setData(d=>({...d,shifts:d.shifts.filter(x=>x.id!==shiftId)}));
    setSheet(null);
  }
  const totalWeekH=(uid)=>{
    const mins=shifts.filter(s=>s.userId===uid&&days.some(d=>isoDate(d)===s.date)).reduce((a,s)=>{
      const [h1,m1]=(s.start||"0:0").split(":").map(Number);const [h2,m2]=(s.end||"0:0").split(":").map(Number);
      return a+Math.max(0,(h2*60+m2)-(h1*60+m1));},0);
    return (mins/60).toFixed(1).replace(".0","");
  };

  const[viewMode,setViewMode]=useState("table"); // table | day

  // Créneaux du jour groupés par personne, pour une cellule tableau compacte.
  function shiftsFor(userId,dayDate){
    const dstr=isoDate(dayDate);
    return shifts.filter(s=>s.userId===userId&&s.date===dstr).sort((a,b)=>(a.start||"").localeCompare(b.start||""));
  }
  function openAddFor(userId,dayDate){setSheet({userId,date:isoDate(dayDate),start:"09:00",end:"15:00"});}

  return(<div className="page">
    <div className="section-title">{t("planning_title",lang)}</div>
    <div className="between mb12">
      <button className="btn btn-ghost btn-sm" style={{width:"auto"}} onClick={()=>{const d=new Date(weekStart);d.setDate(d.getDate()-7);setWeekStart(d);}}>‹</button>
      <div className="section-sub" style={{margin:0}}>{fmtRange}</div>
      <button className="btn btn-ghost btn-sm" style={{width:"auto"}} onClick={()=>{const d=new Date(weekStart);d.setDate(d.getDate()+7);setWeekStart(d);}}>›</button>
    </div>

    <SegmentedControl value={viewMode} onChange={setViewMode} options={[{value:"table",label:`📋 ${t("planning_view_table",lang)}`},{value:"day",label:`📅 ${t("planning_view_day",lang)}`}]}/>
    <div style={{height:14}}></div>

    {viewMode==="table" ? (
      <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch",marginBottom:16,borderRadius:12,border:`1px solid ${T.border}`}}>
        <table style={{borderCollapse:"collapse",width:"100%",minWidth:560,fontSize:12.5}}>
          <thead>
            <tr style={{background:T.bg2}}>
              <th style={{position:"sticky",left:0,background:T.bg2,padding:"10px 12px",textAlign:"left",fontWeight:700,fontSize:12,color:T.textDim,zIndex:1,minWidth:104}}>{t("planning_team",lang)}</th>
              {days.map((d,i)=>{const isToday=isoDate(d)===isoDate(new Date());return(
                <th key={i} style={{padding:"10px 8px",textAlign:"center",fontWeight:700,fontSize:11.5,color:isToday?T.accent:T.textDim,minWidth:78}}>{DAYS[i]}<br/><span className="tabular">{d.getDate()}</span></th>
              );})}
            </tr>
          </thead>
          <tbody>
            {users.map(u=>(
              <tr key={u.id} style={{borderTop:`1px solid ${T.border}`}}>
                <td style={{position:"sticky",left:0,background:T.bg1,padding:"8px 12px",fontWeight:600,whiteSpace:"nowrap"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{width:22,height:22,borderRadius:"50%",background:T.infoBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9.5,fontWeight:700,flexShrink:0}}>{u.initials}</span>
                    <span style={{fontSize:12}}>{u.name.split(" ")[0]}</span>
                  </div>
                </td>
                {days.map((d,i)=>{
                  const cellShifts=shiftsFor(u.id,d);
                  return(
                    <td key={i} style={{padding:"6px 4px",textAlign:"center",verticalAlign:"middle"}} onClick={()=>isAdmin&&cellShifts.length===0&&openAddFor(u.id,d)}>
                      {cellShifts.length===0
                        ? (isAdmin ? <div style={{color:T.textMute,fontSize:16,cursor:"pointer"}}>+</div> : <div style={{color:T.textMute}}>—</div>)
                        : cellShifts.map(s=>(
                          <div key={s.id} onClick={(e)=>{e.stopPropagation();if(isAdmin)openEdit(s);}} className="tabular" style={{background:T.infoBg,color:T.info,borderRadius:6,padding:"3px 5px",fontSize:10.5,fontWeight:700,marginBottom:2,cursor:isAdmin?"pointer":"default"}}>{s.start}–{s.end}</div>
                        ))
                      }
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <>
        <div className="tabs" style={{marginBottom:16}}>{days.map((d,i)=>{
          const isToday=isoDate(d)===isoDate(new Date());
          return <button key={i} className={`tab ${dayIdx===i?"active":""}`} onClick={()=>setDayIdx(i)}>{DAYS[i]} {d.getDate()}{isToday?" •":""}</button>;})}
        </div>

        <div className="bucket-label">Créneaux — {DAYS[dayIdx]} {days[dayIdx].getDate()}</div>
        {dayShifts.length===0&&<div className="empty"><div className="empty-icon">📅</div><div className="empty-title">Aucun créneau</div><div className="empty-sub">{isAdmin?"Ajoutez les horaires de l'équipe":"Aucun membre planifié ce jour"}</div></div>}
        {dayShifts.map(s=>{const u=users.find(x=>x.id===s.userId);
          return(<ShiftRow key={s.id} s={s} u={u} canEdit={isAdmin}
            onOpen={openEdit}
            onDelete={async(shift)=>{
              if(!window.confirm(`Supprimer le créneau de ${u?.name||"ce membre"} (${shift.start}–${shift.end}) ?`))return;
              const res=await db.deleteShift(shift.id);
              if(res?.error){alert("La suppression a échoué. Vérifie la connexion Supabase.");await reload({force:true});return;}
              markLocalWrite?.();
              setData(d=>({...d,shifts:d.shifts.filter(x=>x.id!==shift.id)}));
            }}/>);
        })}
      </>
    )}

    <div className="bucket-label mt14">Heures de la semaine</div>
    {users.map(u=>{const h=totalWeekH(u.id);if(h==="0")return null;return(
      <div key={u.id} className="item"><div className="item-icon" style={{background:T.bg3,fontWeight:700,fontSize:14}}>{u.initials}</div>
      <div className="item-body"><div className="item-title">{u.name}</div></div>
      <span className="fw7 tabular">{h} h</span></div>);})}

    {isAdmin&&<div className="fab-anchor"><button className="btn-fab" onClick={openAdd}>+</button></div>}

    {sheet&&<div className="overlay" onClick={()=>setSheet(null)}><div className="sheet" onClick={e=>e.stopPropagation()}>
      <div className="sheet-handle"></div>
      <div className="sheet-title">{sheet.id?"Modifier le créneau":"Nouveau créneau"}</div>
      <div className="field"><label className="label">Membre</label>
        <select className="input" value={sheet.userId} onChange={e=>setSheet({...sheet,userId:parseInt(e.target.value)})}>
          {users.map(u=><option key={u.id} value={u.id}>{u.name} — {u.role}</option>)}
        </select></div>
      <div className="field"><label className="label">Date</label><input className="input" type="date" value={sheet.date} onChange={e=>setSheet({...sheet,date:e.target.value})}/></div>
      <div className="row gap8">
        <div style={{flex:1}}><label className="label">Début</label><input className="input" type="time" value={sheet.start} onChange={e=>setSheet({...sheet,start:e.target.value})}/></div>
        <div style={{flex:1}}><label className="label">Fin</label><input className="input" type="time" value={sheet.end} onChange={e=>setSheet({...sheet,end:e.target.value})}/></div>
      </div>
      <button className="btn btn-primary mt12" onClick={save}>{sheet.id?"Mettre à jour":"Ajouter"}</button>
      {sheet.id&&<button className="btn btn-ghost mt8" style={{color:T.bad}} onClick={remove}>🗑 Supprimer ce créneau</button>}
    </div></div>}
  </div>);
}

// Catégories proposées par défaut. Ce ne sont que des suggestions : la colonne
// en base est du texte libre, l'utilisateur peut créer les siennes depuis le
// formulaire produit ("+ Autre").
const PRODUCT_CATEGORIES = ["Poissons","Viandes","Légumes","Fruits","Crémerie","Épicerie","Boissons","Surgelés"];
const CATEGORY_ICONS = {
  "Poissons":"🐟","Viandes":"🥩","Légumes":"🥕","Fruits":"🍋",
  "Crémerie":"🧀","Épicerie":"🧂","Boissons":"🍷","Surgelés":"🧊",
};

function ProductsEditor({data,setData,db,reload,markLocalWrite}){
  const[showAdd,setShowAdd]=useState(false);const[editing,setEditing]=useState(null);
  const[form,setForm]=useState({name:"",price:"",unit:"kg",category:"Épicerie"});
  const[customCat,setCustomCat]=useState(""); // saisie d'une catégorie hors liste

  function openAdd(){setEditing(null);setForm({name:"",price:"",unit:"kg",category:"Épicerie"});setCustomCat("");setShowAdd(true);}
  function openEdit(p){setEditing(p);setForm({name:p.name,price:p.price.toString(),unit:p.unit,category:p.category||"Épicerie"});setCustomCat("");setShowAdd(true);}

  async function save(){
    if(!form.name.trim())return;
    const category = (customCat.trim() || form.category || "Épicerie");
    const payload={name:form.name.trim(),price:parseFloat(String(form.price).replace(",","."))||0,unit:form.unit,category};
    const res = editing ? await db.updateProduct(editing.id,payload) : await db.addProduct(payload);
    if(res?.error){alert("Le produit n'a pas été enregistré. Vérifie la connexion Supabase.");await reload({force:true});return;}
    // Mise à jour locale immédiate à partir de la ligne réellement renvoyée par
    // Supabase — recharger les 20 tables ici rendait l'ajout très lent.
    if(res?.data){
      const p=res.data;
      const entry={id:p.id,name:p.name,price:p.price,unit:p.unit,category:p.category||"Épicerie"};
      markLocalWrite?.();
      setData(d=>({...d,products: editing
        ? d.products.map(x=>x.id===entry.id?entry:x)
        : [...d.products, entry]}));
    }
    setShowAdd(false); setEditing(null); setCustomCat("");
  }

  async function remove(p){
    if(!window.confirm(`Supprimer "${p.name}" du catalogue ?`))return;
    const res=await db.deleteProduct(p.id);
    if(res?.error){alert("La suppression a échoué. Vérifie la connexion Supabase.");await reload({force:true});return;}
    markLocalWrite?.();
    setData(d=>({...d,products:d.products.filter(x=>x.id!==p.id)}));
  }

  const all=[...(data.products||[])];
  // Regroupe par catégorie. Les catégories créées par l'utilisateur (hors liste
  // par défaut) apparaissent aussi, après les catégories standard.
  const usedCats=[...new Set(all.map(p=>p.category||"Épicerie"))];
  const orderedCats=[
    ...PRODUCT_CATEGORIES.filter(cat=>usedCats.includes(cat)),
    ...usedCats.filter(cat=>!PRODUCT_CATEGORIES.includes(cat)).sort(),
  ];

  return(<><div className="text-xs text-dim mb12" style={{lineHeight:1.5}}>Prix d'achat de vos matières premières. Utilisés pour calculer automatiquement le coût de vos fiches techniques.</div>
    {all.length===0&&<div className="empty"><div className="empty-icon">🧾</div><div className="empty-title">Aucun produit</div><div className="empty-sub">Ajoutez vos matières premières et leurs prix</div></div>}

    {orderedCats.map(cat=>{
      const items=all.filter(p=>(p.category||"Épicerie")===cat).sort((a,b)=>a.name.localeCompare(b.name));
      return(
        <CollapsibleSection key={cat} title={cat} icon={CATEGORY_ICONS[cat]||"📦"} count={items.length}>
          {items.map(p=><div key={p.id} className="item">
            <div className="item-icon" style={{background:T.infoBg}}>{CATEGORY_ICONS[cat]||"🧾"}</div>
            <div className="item-body"><div className="item-title">{p.name}</div><div className="item-sub">{p.price.toFixed(2)} € / {p.unit}</div></div>
            <div className="row gap6"><button onClick={()=>openEdit(p)} style={{background:"transparent",border:"none",color:T.textDim,fontSize:16,minWidth:44,minHeight:44,display:"flex",alignItems:"center",justifyContent:"center"}}>✏️</button><button onClick={()=>remove(p)} style={{background:"transparent",border:"none",color:T.bad,fontSize:16,minWidth:44,minHeight:44,display:"flex",alignItems:"center",justifyContent:"center"}}>🗑</button></div>
          </div>)}
        </CollapsibleSection>
      );
    })}

    <button className="btn btn-primary mt14" onClick={openAdd}>+ Nouveau produit</button>

    {showAdd&&<div className="overlay" onClick={()=>setShowAdd(false)}><div className="sheet" onClick={e=>e.stopPropagation()}>
      <div className="sheet-handle"></div><div className="sheet-title">{editing?"Modifier le produit":"Nouveau produit"}</div>
      <div className="field"><label className="label">Nom</label><input className="input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="ex : Filet de bar"/></div>

      <div className="field"><label className="label">Catégorie</label>
        <div className="chips">
          {PRODUCT_CATEGORIES.map(cat=>(
            <button key={cat} className={`chip ${!customCat && form.category===cat?"sel":""}`} onClick={()=>{setForm({...form,category:cat});setCustomCat("");}}>
              {CATEGORY_ICONS[cat]} {cat}
            </button>
          ))}
          {/* Catégories déjà créées par l'utilisateur, pour les réutiliser d'un tap */}
          {usedCats.filter(cat=>!PRODUCT_CATEGORIES.includes(cat)).map(cat=>(
            <button key={cat} className={`chip ${!customCat && form.category===cat?"sel":""}`} onClick={()=>{setForm({...form,category:cat});setCustomCat("");}}>
              📦 {cat}
            </button>
          ))}
        </div>
        <input className="input input-sm mt6" value={customCat} onChange={e=>setCustomCat(e.target.value)} placeholder="+ Autre catégorie (ex : Épices)"/>
      </div>

      <div className="row gap8"><div style={{flex:1}}><label className="label">Prix d'achat</label><input className="input input-sm" type="text" inputMode="decimal" value={form.price} onChange={e=>{const v=e.target.value;if(/^\d*[.,]?\d*$/.test(v))setForm({...form,price:v});}} placeholder="ex : 18.50"/></div>
        <div style={{flex:0,width:90}}><label className="label">Pour</label><select className="input input-sm" value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})}><option value="kg">1 kg</option><option value="L">1 L</option><option value="pce">1 pièce</option></select></div></div>
      <div className="text-xs text-dim mb14">Le coût sera calculé automatiquement selon la quantité utilisée dans chaque recette (g, kg, ml, L ou pièces).</div>
      <button className="btn btn-primary mt8" onClick={save} disabled={!form.name.trim()}>{editing?"Mettre à jour":"Ajouter au catalogue"}</button>
    </div></div>}
  </>);
}

function TaskCategoriesEditor({data,setData,db,reload,markLocalWrite}){
  const[showAdd,setShowAdd]=useState(false);const[editing,setEditing]=useState(null);
  const[form,setForm]=useState({name:"",icon:"📋",color:"#5A8FB5"});
  const PRESET_COLORS=["#5A8FB5","#D49340","#C97FA8","#C9A862","#5FB075","#A78BFA","#D55C5C","#5EEAD4"];
  const PRESET_ICONS=["❄️","🔥","🍰","🥖","🥩","🐟","🥗","🍷","🧀","☕","🧂","📋"];
  function openAdd(){setEditing(null);setForm({name:"",icon:"📋",color:PRESET_COLORS[0]});setShowAdd(true);}
  function openEdit(cat){setEditing(cat);setForm({name:cat.name,icon:cat.icon,color:cat.color});setShowAdd(true);}
  async function save(){
    if(!form.name.trim())return;
    const res=await db.saveTaskCategory(editing?{...form,id:editing.id}:{...form});
    if(res?.error){alert("La catégorie n'a pas été enregistrée. Vérifie la connexion Supabase.");await reload({force:true});return;}
    if(res?.data){
      const x=res.data;
      const entry={id:x.id,name:x.name,icon:x.icon,color:x.color};
      markLocalWrite?.();
      setData(d=>({...d,taskCategories: d.taskCategories.some(c2=>c2.id===entry.id) ? d.taskCategories.map(c2=>c2.id===entry.id?entry:c2) : [...d.taskCategories,entry]}));
    } else { await reload({force:true}); }
    setShowAdd(false);setEditing(null);
  }
  async function remove(catId){const tasksInCat=data.tasks.filter(t=>t.categoryId===catId).length;const msg=tasksInCat>0?`${tasksInCat} tâche(s) seront déplacées. Supprimer ?`:"Supprimer cette catégorie ?";if(!window.confirm(msg))return;const remaining=data.taskCategories.filter(c=>c.id!==catId);const fallbackId=remaining[0]?.id;await db.deleteTaskCategory(catId,fallbackId);await reload({force:true});}
  return(<><div className="text-xs text-dim mb12" style={{lineHeight:1.5}}>Organisez votre mise en place par zones de production.</div>
    {data.taskCategories.map(cat=>{const count=data.tasks.filter(t=>t.categoryId===cat.id).length;return(<div key={cat.id} className="item" style={{borderLeft:`3px solid ${cat.color}`}}><div className="item-icon" style={{background:`${cat.color}22`}}>{cat.icon}</div><div className="item-body"><div className="item-title">{cat.name}</div><div className="item-sub">{count} tâche{count>1?"s":""}</div></div><div className="row gap6"><button onClick={()=>openEdit(cat)} style={{background:"transparent",border:"none",color:T.textDim,fontSize:16,minWidth:44,minHeight:44,display:"flex",alignItems:"center",justifyContent:"center"}}>✏️</button><button onClick={()=>remove(cat.id)} style={{background:"transparent",border:"none",color:T.bad,fontSize:16,minWidth:44,minHeight:44,display:"flex",alignItems:"center",justifyContent:"center"}}>🗑</button></div></div>);})}
    <button className="btn btn-primary mt8" onClick={openAdd}>+ Nouvelle catégorie</button>
    {showAdd&&<div className="overlay" onClick={()=>setShowAdd(false)}><div className="sheet" onClick={e=>e.stopPropagation()}>
      <div className="sheet-handle"></div><div className="sheet-title">{editing?"Modifier":"Nouvelle catégorie"}</div>
      <div className="field"><label className="label">Nom</label><input className="input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="ex : Mise en place froid"/></div>
      <div className="field"><label className="label">Icône</label><div className="chips">{PRESET_ICONS.map(ic=><button key={ic} className={`chip ${form.icon===ic?"sel":""}`} onClick={()=>setForm({...form,icon:ic})} style={{fontSize:18,padding:"6px 12px"}}>{ic}</button>)}</div></div>
      <div className="field"><label className="label">Couleur</label><div className="row gap8" style={{flexWrap:"wrap"}}>{PRESET_COLORS.map(c=><button key={c} onClick={()=>setForm({...form,color:c})} style={{width:34,height:34,borderRadius:"50%",background:c,border:form.color===c?`3px solid ${T.text}`:`2px solid ${T.border}`,flexShrink:0}}/>)}</div></div>
      <div className="card" style={{background:T.bg3,borderLeft:`3px solid ${form.color}`}}><div className="row gap10"><div className="item-icon" style={{background:`${form.color}22`}}>{form.icon}</div><div><div className="text-xs text-dim">Aperçu</div><div className="item-title">{form.name||"Nom"}</div></div></div></div>
      <button className="btn btn-primary mt8" onClick={save} disabled={!form.name.trim()}>{editing?"Mettre à jour":"Créer"}</button>
    </div></div>}
  </>);
}

function More({go,user,lang}){
  const items=[{key:"margins",icon:"📊",bg:T.goodBg,title:t("more_margins",lang),sub:t("more_margins_sub",lang)},{key:"planning",icon:"📅",bg:T.warnBg,title:t("more_team_planning",lang),sub:t("more_team_planning_sub",lang)}];
  return(<div className="page"><div className="section-title">{t("more_title",lang)}</div><div className="section-sub">{t("more_subtitle",lang)}</div>
    {items.map(it=><div key={it.key} className="item" onClick={()=>go(it.key)}><div className="item-icon" style={{background:it.bg}}>{it.icon}</div><div className="item-body"><div className="item-title">{it.title}</div><div className="item-sub">{it.sub}</div></div><div className="item-arrow">›</div></div>)}
    <div className="bucket-label mt14">{t("more_help",lang)}</div>
    <div className="item" onClick={()=>go("manual")}><div className="item-icon" style={{background:T.infoBg}}>📖</div><div className="item-body"><div className="item-title">{t("more_manual",lang)}</div><div className="item-sub">{t("more_manual_sub",lang)}</div></div><div className="item-arrow">›</div></div>
    <div className="item" onClick={()=>go("gbph")}><div className="item-icon" style={{background:T.goodBg}}>🛡️</div><div className="item-body"><div className="item-title">{t("more_gbph",lang)}</div><div className="item-sub">{t("more_gbph_sub",lang)}</div></div><div className="item-arrow">›</div></div>
    <div className="bucket-label mt14">{user.isAdmin?"Administration":t("more_settings_group_staff",lang)}</div>
    <div className="item" onClick={()=>go("settings")}><div className="item-icon" style={{background:T.accentLt}}>⚙️</div><div className="item-body"><div className="item-title">{t("more_settings",lang)}</div><div className="item-sub">{user.isAdmin?"Restaurant, équipe, HACCP":t("more_settings_printer_sub",lang)}</div></div><div className="item-arrow">›</div></div>
  </div>);
}

// ─── SETTINGS TABS ───────────────────────────────────────────────────────────

function SettingsRestaurant({data,setData,db}){
  const[form,setForm]=useState({...data.restaurant});
  const toast=useSaveToast();
  async function commit(k){
    await db.saveRestaurant?.(form);
    setData(d=>({...d,restaurant:{...form}}));
    toast.ping();
  }
  return(<>
    <div className="group-label">Établissement</div>
    <div className="text-xs text-dim mb12" style={{lineHeight:1.5}}>Touchez un champ pour le modifier. Les changements s'enregistrent automatiquement.</div>
    {[["Nom du restaurant","name","ex : Ô Grain de Sable"],["Adresse complète","address","Rue, code postal, ville"],["Téléphone","phone","04 ..."],["N° SIRET","siret","123 456 789 00012"]].map(([l,k,ph])=>(
      <div key={k} className="card" style={{padding:"12px 14px",marginBottom:8}}>
        <label className="label" style={{marginBottom:4}}>{l}</label>
        <input className="ed-field" style={{fontSize:15}} value={form[k]||""} placeholder={ph}
          onChange={e=>setForm({...form,[k]:e.target.value})}
          onBlur={()=>commit(k)}/>
      </div>
    ))}
    {toast.node}
  </>);
}

// Ligne éditable générique : tap = focus champ, appui long = supprimer
// Section de réglages repliable : évite les listes interminables quand le
// nombre d'enceintes ou de zones grandit. Fermée par défaut, elle affiche le
// nombre d'éléments qu'elle contient pour rester informative sans être ouverte.
function CollapsibleSection({title, icon, count, defaultOpen=false, children}){
  const[open,setOpen]=useState(defaultOpen);
  return(
    <div style={{marginTop:16}}>
      <button className="collapse-head" onClick={()=>{haptic.light();setOpen(o=>!o);}}>
        <span className="collapse-head-left">
          {icon&&<span style={{fontSize:17}}>{icon}</span>}
          <span className="collapse-title">{title}</span>
          {count>0&&<span className="collapse-count">{count}</span>}
        </span>
        <span className={`collapse-chevron ${open?"open":""}`}>›</span>
      </button>
      {open&&<div className="collapse-body" style={{paddingTop:10}}>{children}</div>}
    </div>
  );
}

function EditableRow({icon,iconBg,onDelete,children,onOpen}){
  const lp=useLongPress(()=>{ if(navigator.vibrate)navigator.vibrate(20); onDelete(); });
  return(
    <div className={`item ed-row ${lp.pressing?"pressing":""}`} style={{marginBottom:6}} {...lp.handlers}
      onClick={()=>{ if(!lp.didFire()&&onOpen)onOpen(); }}>
      <div className="item-icon" style={{background:iconBg,fontSize:20}}>{icon}</div>
      <div className="item-body">{children}</div>
      <div className="item-arrow">›</div>
    </div>
  );
}

function SettingsHaccp({data,setData,db,reload}){
  const toast=useSaveToast();
  const[seuils,setSeuils]=useState({
    coolingMax:String(data.haccpSettings.coolingMax),
    reheatMin:String(data.haccpSettings.reheatMin),
    reheatMaxTime:String(data.haccpSettings.reheatMaxTime),
    oilPolarMax:String(data.haccpSettings.oilPolarMax),
    testMealDays:String(data.haccpSettings.testMealDays),
    labelDlcDefault:String(data.haccpSettings.labelDlcDefault),
  });
  const fridges=data.haccpSettings.fridgeTargets;
  const cleaningItems=data.cleaning;
  const[sheet,setSheet]=useState(null); // {kind:"fridge"|"clean", item|null}
  const[fForm,setFForm]=useState({name:"",icon:"🧊",target:"0–4",type:"positif"});
  const[cForm,setCForm]=useState({zone:"",icon:"🧹",freq:"Quotidien",produit:"",dilution:""});

  const FRIDGE_ICONS=["🥗","🥩","🐟","🍰","🧀","🥚","🥦","❄️","🍷","🧊"];
  const CLEAN_ICONS=["🔥","❄️","🧹","🥶","💨","🪑","🔪","🍟","🚿","🪣","🧽","💧"];
  const FREQS=["Quotidien","Après usage","Hebdomadaire","Mensuel","Trimestriel"];

  async function commitSeuils(){
    const s={coolingMax:parseInt(seuils.coolingMax)||0,reheatMin:parseInt(seuils.reheatMin)||0,reheatMaxTime:parseInt(seuils.reheatMaxTime)||0,oilPolarMax:parseInt(seuils.oilPolarMax)||0,testMealDays:parseInt(seuils.testMealDays)||0,labelDlcDefault:parseInt(seuils.labelDlcDefault)||0};
    setData(d=>({...d,haccpSettings:{...d.haccpSettings,...s}}));
    const res=await db.saveHaccpSettings(s);
    if(res?.error){alert("Les seuils n'ont pas été enregistrés. Vérifie la connexion Supabase.");await reload?.({force:true});return;}
    toast.ping();
  }

  // Horaires de bascule : convertis en minutes depuis minuit pour le stockage,
  // affichés en HH:MM dans l'interface.
  const minsToHHMM = m => `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;
  const hhmmToMins = s => { const [h,m]=(s||"").split(":").map(Number); return (h||0)*60+(m||0); };

  // Saisie en cours, séparée de la valeur enregistrée : un champ "time"
  // déclenche onChange à chaque chiffre tapé — on n'enregistre donc qu'à la
  // sortie du champ, pas à chaque frappe.
  const[horaires,setHoraires]=useState({
    resetMidi: minsToHHMM(data.haccpSettings.resetMidi ?? 990),
    resetSoir: minsToHHMM(data.haccpSettings.resetSoir ?? 180),
  });

  async function commitHoraire(field){
    const hhmm = horaires[field];
    if(!hhmm) return;
    let mins = hhmmToMins(hhmm);
    // Ce réglage représente "jusqu'où, après minuit, on considère qu'on est
    // encore sur le service de la veille" — un concept de petit matin, pas
    // une heure de fermeture. Un réglage proche de minuit (ex. 23h59) ferait
    // que TOUTE la journée soit interprétée comme "encore hier soir" (23h59
    // > presque n'importe quelle heure), bloquant l'app en permanence sur la
    // veille. On plafonne donc à 9h — largement suffisant pour couvrir même
    // un service de nuit tardif, sans jamais pouvoir casser le calcul.
    if(field==="resetSoir" && mins>540){
      mins=540;
      setHoraires(h=>({...h,resetSoir:"09:00"}));
      alert("L'heure de bascule du soir doit rester dans la nuit (avant 9h) — sinon l'application resterait bloquée sur la veille toute la journée. Réglée sur 9h00.");
    }
    if(mins === data.haccpSettings[field]) return; // rien n'a changé
    const s = {...data.haccpSettings, [field]: mins};
    setData(d=>({...d,haccpSettings:{...d.haccpSettings,[field]:mins}}));
    const res=await db.saveHaccpSettings(s);
    if(res?.error){
      alert("L'horaire n'a pas été enregistré. Vérifie la connexion Supabase.");
      // Remet le champ sur la dernière valeur connue, pour ne pas laisser
      // croire que le changement est pris en compte.
      setHoraires(h=>({...h,[field]:minsToHHMM(data.haccpSettings[field] ?? (field==="resetMidi"?990:180))}));
      await reload?.({force:true});
      return;
    }
    toast.ping();
  }

  function openFridge(f){ setFForm(f?{name:f.name,icon:f.icon,target:f.target,type:f.type}:{name:"",icon:"🧊",target:"0–4",type:"positif"}); setSheet({kind:"fridge",item:f||null}); }
  function openClean(c){ setCForm(c?{zone:c.zone,icon:c.icon,freq:c.freq,produit:c.produit,dilution:c.dilution}:{zone:"",icon:"🧹",freq:"Quotidien",produit:"",dilution:""}); setSheet({kind:"clean",item:c||null}); }

  async function saveFridge(){
    if(!fForm.name)return;
    let res;
    if(sheet.item){
      const upd=fridges.map(f=>f.id===sheet.item.id?{...f,...fForm}:f);
      setData(d=>({...d,haccpSettings:{...d.haccpSettings,fridgeTargets:upd}}));
      res=await db.updateFridgeTarget?.(sheet.item.id,fForm);
    }else{
      const nf={id:Date.now(),...fForm};
      setData(d=>({...d,haccpSettings:{...d.haccpSettings,fridgeTargets:[...fridges,nf]}}));
      res=await db.addFridgeTarget?.(fForm);
    }
    if(res?.error){alert("L'équipement n'a pas été enregistré. Vérifie la connexion Supabase.");await reload?.({force:true});return;}
    setSheet(null); toast.ping(); reload?.();
  }
  async function delFridge(f){
    setData(d=>({...d,haccpSettings:{...d.haccpSettings,fridgeTargets:fridges.filter(x=>x.id!==f.id)}}));
    const res=await db.deleteFridgeTarget?.(f.id);
    if(res?.error){alert("La suppression a échoué. Vérifie la connexion Supabase.");await reload?.({force:true});return;}
    toast.ping();
  }
  async function saveClean(){
    if(!cForm.zone)return;
    let res;
    if(sheet.item){
      const upd=cleaningItems.map(c=>c.id===sheet.item.id?{...c,...cForm}:c);
      setData(d=>({...d,cleaning:upd}));
      res=await db.updateCleaningItem?.(sheet.item.id,cForm);
    }else{
      const nc={id:Date.now(),...cForm,done:false};
      setData(d=>({...d,cleaning:[...cleaningItems,nc]}));
      res=await db.addCleaningItem?.(cForm);
    }
    if(res?.error){alert("La zone n'a pas été enregistrée. Vérifie la connexion Supabase.");await reload?.({force:true});return;}
    setSheet(null); toast.ping(); reload?.();
  }
  async function delClean(c){
    setData(d=>({...d,cleaning:cleaningItems.filter(x=>x.id!==c.id)}));
    const res=await db.deleteCleaningItem?.(c.id);
    if(res?.error){alert("La suppression a échoué. Vérifie la connexion Supabase.");await reload?.({force:true});return;}
    toast.ping();
  }

  return(<>
    <CollapsibleSection title="Seuils critiques" icon="⚖️" count={6} defaultOpen={true}>
    {[
      ["Refroidissement max","coolingMax","min","Légal : 120"],
      ["Remise en T° minimum","reheatMin","°C","Légal : 63"],
      ["Remise en T° durée max","reheatMaxTime","min","Légal : 60"],
      ["Huile — polaires max","oilPolarMax","%","Décret : 25"],
      ["DLC étiquettes défaut","labelDlcDefault","j","Max 3 sans analyse"],
    ].map(([l,k,u,hint])=>(
      <div key={k} className="card" style={{padding:"10px 14px",marginBottom:6}}>
        <div className="between">
          <div><div className="item-title" style={{fontSize:13}}>{l}</div><div className="text-xs text-mute">{hint}</div></div>
          <div className="row gap6" style={{flexShrink:0}}>
            <input type="number" value={seuils[k]} onChange={e=>setSeuils({...seuils,[k]:e.target.value})} onBlur={commitSeuils}
              style={{width:56,padding:"6px 8px",background:T.bg3,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:16,fontWeight:700,textAlign:"center",fontFamily:"inherit"}}/>
            <span className="text-xs text-dim" style={{width:24}}>{u}</span>
          </div>
        </div>
      </div>
    ))}
    </CollapsibleSection>

    <CollapsibleSection title="Horaires de service" icon="🕐" count={2}>
      <div className="text-xs text-dim mb12" style={{lineHeight:1.5,marginLeft:2}}>
        Moments où la mise en place et le nettoyage quotidien repartent à zéro pour toute l'équipe.
      </div>
      <div className="item" style={{marginBottom:8}}>
        <div className="item-icon" style={{background:T.warnBg}}>☀️</div>
        <div className="item-body">
          <div className="item-title">Fin du service du midi</div>
          <div className="item-sub">Purge la liste du midi, pendant la coupure</div>
        </div>
        <input className="input input-sm" type="time" style={{width:104,flexShrink:0}}
          value={horaires.resetMidi}
          onChange={e=>setHoraires(h=>({...h,resetMidi:e.target.value}))}
          onBlur={()=>commitHoraire("resetMidi")}/>
      </div>
      <div className="item">
        <div className="item-icon" style={{background:T.infoBg}}>🌙</div>
        <div className="item-body">
          <div className="item-title">Bascule après minuit</div>
          <div className="item-sub">Jusqu'à cette heure, la nuit, on est encore "hier soir"</div>
        </div>
        <input className="input input-sm" type="time" max="09:00" style={{width:104,flexShrink:0}}
          value={horaires.resetSoir}
          onChange={e=>setHoraires(h=>({...h,resetSoir:e.target.value}))}
          onBlur={()=>commitHoraire("resetSoir")}/>
      </div>
      <div className="banner banner-info mt10"><span>ℹ️</span><div style={{fontSize:11,lineHeight:1.5}}>
        Le service du soir traverse minuit : entre minuit et l'heure ci-dessus, l'app considère qu'on est toujours sur le service de la veille — les listes ne s'effacent pas en plein travail. Cette heure doit rester dans la nuit (avant 9h) : ce n'est pas une heure de fermeture, mais jusqu'où on remonte après minuit.
      </div></div>
    </CollapsibleSection>

    <CollapsibleSection title="Enceintes froides" icon="🌡️" count={fridges.length}>
      <div className="text-xs text-dim mb8" style={{marginLeft:2}}>Touchez pour modifier · appui long pour supprimer</div>
      {fridges.map(f=>{
        const lastR=data.fridgeReleves.filter(r=>r.fridgeId===f.id).sort((a,b)=>b.id-a.id)[0];
        return(
          <EditableRow key={f.id} icon={f.icon} iconBg={T.infoBg} onOpen={()=>openFridge(f)} onDelete={()=>{if(window.confirm(`Supprimer ${f.name} ?`))delFridge(f);}}>
            <div className="item-title">{f.name}</div>
            <div className="item-sub">Cible {f.target}°C · {f.type==="negatif"?"Négatif":"Positif"}{lastR?` · ${lastR.temp}°`:""}</div>
          </EditableRow>
        );
      })}
      <button className="inline-add mt6" onClick={()=>openFridge(null)}>+ Ajouter une enceinte</button>
    </CollapsibleSection>

    <CollapsibleSection title="Plan de nettoyage" icon="🧹" count={cleaningItems.length}>
      <div className="text-xs text-dim mb8" style={{marginLeft:2}}>Touchez pour modifier · appui long pour supprimer</div>
      {(() => {
        // Même ordre que l'écran de travail Nettoyage, pour ne pas avoir deux
        // logiques différentes selon qu'on configure ou qu'on utilise l'app.
        // Une fréquence non reconnue (saisie libre ancienne, etc.) atterrit
        // dans un dernier groupe "Autre" plutôt que d'être perdue.
        const order = CLEAN_FREQS.map(f=>f.key);
        const groups = {};
        cleaningItems.forEach(c=>{
          const key = order.includes(c.freq) ? c.freq : "__autre__";
          (groups[key]=groups[key]||[]).push(c);
        });
        const orderedKeys = [...order.filter(k=>groups[k]), ...(groups["__autre__"]?["__autre__"]:[])];
        return orderedKeys.map(key=>{
          const freqMeta = CLEAN_FREQS.find(f=>f.key===key);
          const label = freqMeta ? freqMeta.label : "Autre";
          const icon = freqMeta ? freqMeta.icon : "📦";
          return (
            <div key={key} style={{marginBottom:8,marginLeft:8}}>
              <CollapsibleSection title={label} icon={icon} count={groups[key].length}>
                {groups[key].map(c=>(
                  <EditableRow key={c.id} icon={c.icon} iconBg={T.goodBg} onOpen={()=>openClean(c)} onDelete={()=>{if(window.confirm(`Supprimer ${c.zone} ?`))delClean(c);}}>
                    <div className="item-title">{c.zone}</div>
                    <div className="item-sub">{c.freq} · {c.produit}{c.dilution?` · ${c.dilution}`:""}</div>
                  </EditableRow>
                ))}
              </CollapsibleSection>
            </div>
          );
        });
      })()}
      <button className="inline-add mt6" onClick={()=>openClean(null)}>+ Ajouter une zone</button>
    </CollapsibleSection>

    {sheet?.kind==="fridge"&&(
      <div className="overlay" onClick={()=>setSheet(null)}>
        <div className="sheet" onClick={e=>e.stopPropagation()}>
          <div className="sheet-handle"></div>
          <div className="sheet-title">{sheet.item?"Modifier l'enceinte":"Nouvelle enceinte"}</div>
          <div className="field"><label className="label">Nom</label><input className="input" value={fForm.name} onChange={e=>setFForm({...fForm,name:e.target.value})} placeholder="ex : Frigo Entrées"/></div>
          <div className="field"><label className="label">Icône</label><div className="chips">{FRIDGE_ICONS.map(ic=><button key={ic} className={`chip ${fForm.icon===ic?"sel":""}`} onClick={()=>setFForm({...fForm,icon:ic})} style={{fontSize:20,padding:"6px 12px"}}>{ic}</button>)}</div></div>
          <div className="field"><label className="label">Type</label><SegmentedControl value={fForm.type} onChange={v=>setFForm({...fForm,type:v,target:v==="negatif"?"-18":"0–4"})} options={[{value:"positif",label:"❄️ Positif"},{value:"negatif",label:"🧊 Négatif"}]}/></div>
          <div className="field"><label className="label">Cible de température</label>
            {fForm.type==="positif"
              ? <QuickPick value={fForm.target} onChange={v=>setFForm({...fForm,target:v})} options={["0–2","0–3","0–4","0–6","2–6","3–5"].map(v=>({value:v,label:v+"°C"}))}/>
              : <QuickPick value={fForm.target} onChange={v=>setFForm({...fForm,target:v})} options={["-25","-22","-20","-18","-15"].map(v=>({value:v,label:v+"°C"}))}/>}
          </div>
          <button className="btn btn-primary mt12" onClick={saveFridge} disabled={!fForm.name}>{sheet.item?"Mettre à jour":"Ajouter"}</button>
        </div>
      </div>
    )}

    {sheet?.kind==="clean"&&(
      <div className="overlay" onClick={()=>setSheet(null)}>
        <div className="sheet" onClick={e=>e.stopPropagation()}>
          <div className="sheet-handle"></div>
          <div className="sheet-title">{sheet.item?"Modifier la zone":"Nouvelle zone"}</div>
          <div className="field"><label className="label">Nom de la zone</label><input className="input" value={cForm.zone} onChange={e=>setCForm({...cForm,zone:e.target.value})} placeholder="ex : Sol cuisine"/></div>
          <div className="field"><label className="label">Icône</label><div className="chips">{CLEAN_ICONS.map(ic=><button key={ic} className={`chip ${cForm.icon===ic?"sel":""}`} onClick={()=>setCForm({...cForm,icon:ic})} style={{fontSize:20,padding:"6px 12px"}}>{ic}</button>)}</div></div>
          <div className="field"><label className="label">Fréquence</label><QuickPick value={cForm.freq} onChange={v=>setCForm({...cForm,freq:v})} options={FREQS.map(f=>({value:f,label:f}))}/></div>
          <div className="field"><label className="label">Produit</label><input className="input" value={cForm.produit} onChange={e=>setCForm({...cForm,produit:e.target.value})} placeholder="ex : Dégraissant Pro"/></div>
          <div className="field"><label className="label">Dilution</label><input className="input" value={cForm.dilution} onChange={e=>setCForm({...cForm,dilution:e.target.value})} placeholder="ex : 1:10 ou Pur"/></div>
          <button className="btn btn-primary mt8" onClick={saveClean} disabled={!cForm.zone}>{sheet.item?"Mettre à jour":"Ajouter"}</button>
        </div>
      </div>
    )}
    {toast.node}
  </>);
}

function UserRow({u,isSelf,onOpen,onDelete}){
  const lp=useLongPress(()=>{ if(isSelf)return; if(navigator.vibrate)navigator.vibrate(20); onDelete(); });
  return(
    <div className={`item ed-row ${lp.pressing?"pressing":""}`} style={{marginBottom:6}} {...lp.handlers}
      onClick={()=>{ if(!lp.didFire())onOpen(); }}>
      <div style={{width:40,height:40,borderRadius:"50%",background:u.color,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:14,color:"white",flexShrink:0}}>{u.initials}</div>
      <div className="item-body"><div className="item-title">{u.name}</div><div className="item-sub">{u.role}</div></div>
      <span className={`badge ${u.isAdmin?"b-bad":"b-mute"}`}>{u.isAdmin?"Admin":"Équipe"}</span>
    </div>
  );
}

function SettingsUsers({data,setData,user,db,reload,onLogout}){
  const toast=useSaveToast();
  const[sheet,setSheet]=useState(null); // {item|null}
  const[form,setForm]=useState({name:"",role:"",pin:"",isAdmin:false});
  const COLORS=["#B8503F","#5A8FB5","#5FB075","#D49340","#C97FA8","#6B6862"];

  function open(u){ setForm(u?{name:u.name,role:u.role,pin:u.pin,isAdmin:u.isAdmin}:{name:"",role:"",pin:"",isAdmin:false}); setSheet({item:u||null}); }
  async function save(){
    if(!form.name||!form.role||form.pin.length<4)return;
    const initials=form.name.split(" ").map(n=>n[0]).join("").toUpperCase().slice(0,2);
    if(sheet.item){
      const upd={...form,initials};
      setData(d=>({...d,users:d.users.map(u=>u.id===sheet.item.id?{...u,...upd}:u)}));
      await db.updateUser?.(sheet.item.id,{name:form.name,role:form.role,pin:form.pin,is_admin:form.isAdmin,initials});
    }else{
      const nu={id:Date.now(),...form,initials,color:COLORS[data.users.length%COLORS.length]};
      setData(d=>({...d,users:[...d.users,nu]}));
      await db.addUser?.(nu);
    }
    setSheet(null); toast.ping(); reload?.();
  }
  async function del(u){
    if(u.id===user.id)return;
    setData(d=>({...d,users:d.users.filter(x=>x.id!==u.id)}));
    await db.deleteUser?.(u.id); toast.ping();
  }

  return(<>
    <CollapsibleSection title="Équipe" icon="👥" count={data.users.length}>
      <div className="text-xs text-dim mb8" style={{marginLeft:2}}>Touchez pour modifier · appui long pour supprimer</div>
      {data.users.map(u=>(
        <UserRow key={u.id} u={u} isSelf={u.id===user.id} onOpen={()=>open(u)} onDelete={()=>{if(window.confirm(`Supprimer ${u.name} ?`))del(u);}}/>
      ))}
      <button className="inline-add mt6" onClick={()=>open(null)}>+ Ajouter un membre</button>
    </CollapsibleSection>

    {sheet&&(
      <div className="overlay" onClick={()=>setSheet(null)}>
        <div className="sheet" onClick={e=>e.stopPropagation()}>
          <div className="sheet-handle"></div>
          <div className="sheet-title">{sheet.item?"Modifier le membre":"Nouveau membre"}</div>
          <div className="field"><label className="label">Nom complet</label><input className="input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="ex : Jean Dupont"/></div>
          <div className="field"><label className="label">Poste</label><input className="input" value={form.role} onChange={e=>setForm({...form,role:e.target.value})} placeholder="ex : Chef de partie"/></div>
          <div className="field"><label className="label">Code PIN (4 chiffres min.)</label><input className="input" type="password" inputMode="numeric" value={form.pin} onChange={e=>setForm({...form,pin:e.target.value})} style={{textAlign:"center",fontSize:24,letterSpacing:8}}/></div>
          <div className="field"><label className="label">Droits</label>
            <SegmentedControl value={form.isAdmin?"admin":"staff"} onChange={v=>setForm({...form,isAdmin:v==="admin"})} options={[{value:"staff",label:"👤 Équipe"},{value:"admin",label:"🔑 Admin"}]}/>
            <div className="text-xs text-dim mt6">{form.isAdmin?"Accès complet + paramètres + gestion équipe":"Accès opérationnel uniquement"}</div>
          </div>
          {sheet.item&&sheet.item.id!==user.id&&<button className="btn mb8" style={{background:T.badBg,color:T.bad}} onClick={()=>{if(window.confirm(`Supprimer ${sheet.item.name} ?`)){del(sheet.item);setSheet(null);}}}>Supprimer ce membre</button>}
          <button className="btn btn-primary" onClick={save} disabled={!form.name||!form.role||form.pin.length<4}>{sheet.item?"Mettre à jour":"Ajouter"}</button>
        </div>
      </div>
    )}

    <div style={{height:1,background:T.border,margin:"24px 0"}}></div>
    <button className="btn" style={{background:T.badBg,color:T.bad}} onClick={onLogout}>Déconnexion</button>
    {toast.node}
  </>);
}

// Réglage personnel (par appareil) : activer les rappels sur ce téléphone.
// Placé dans le menu profil car chacun décide pour son propre appareil.
function NotificationToggle({user,db}){
  const[state,setState]=useState("checking"); // checking | unsupported | off | on | denied | busy
  const[endpoint,setEndpoint]=useState(null);

  useEffect(()=>{
    if(!pushSupported()){ setState("unsupported"); return; }
    if(Notification.permission==="denied"){ setState("denied"); return; }
    // Un abonnement existe-t-il déjà sur cet appareil ?
    navigator.serviceWorker.ready
      .then(reg=>reg.pushManager.getSubscription())
      .then(sub=>{ if(sub){ setEndpoint(sub.endpoint); setState("on"); } else setState("off"); })
      .catch(()=>setState("off"));
  },[]);

  async function enable(){
    setState("busy");
    try{
      const perm = await Notification.requestPermission();
      if(perm!=="granted"){ setState(perm==="denied"?"denied":"off"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const json = sub.toJSON();
      const res = await db.savePushSubscription(
        { endpoint:sub.endpoint, keys:{ p256dh:json.keys.p256dh, auth:json.keys.auth } },
        user.id
      );
      if(res?.error){ alert("L'activation a échoué côté serveur. Réessaie plus tard."); setState("off"); return; }
      setEndpoint(sub.endpoint); setState("on"); haptic.success();
    }catch(e){
      alert("Impossible d'activer les notifications sur cet appareil.");
      setState("off");
    }
  }

  async function disable(){
    setState("busy");
    try{
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if(sub){ await sub.unsubscribe(); await db.deletePushSubscription?.(sub.endpoint); }
      setEndpoint(null); setState("off"); haptic.light();
    }catch(e){ setState("on"); }
  }

  if(state==="unsupported") return null; // navigateur incompatible : on n'affiche rien
  if(state==="checking") return null;

  return(
    <div style={{marginBottom:12}}>
      {state==="denied" ? (
        <div className="banner banner-warn"><span>🔕</span><div style={{fontSize:11,lineHeight:1.5}}>
          Les notifications sont bloquées pour Fuego. Pour les réactiver : réglages du téléphone → Fuego → Notifications.
        </div></div>
      ) : (
        <>
          <button className="btn btn-ghost" style={{width:"100%",justifyContent:"space-between"}}
            onClick={state==="on"?disable:enable} disabled={state==="busy"}>
            <span style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:18}}>{state==="on"?"🔔":"🔕"}</span>
              <span style={{fontSize:13,fontWeight:600}}>Rappels sur ce téléphone</span>
            </span>
            <span style={{width:42,height:24,borderRadius:999,background:state==="on"?"linear-gradient(135deg,#FF6B00,#E8390A)":"#2A2A2A",position:"relative",transition:"background .2s",flexShrink:0}}>
              <span style={{position:"absolute",top:2,left:state==="on"?20:2,width:20,height:20,borderRadius:"50%",background:"white",transition:"left .2s"}}></span>
            </span>
          </button>
          <div className="text-xs text-mute mb12" style={{paddingLeft:4}}>
            {state==="on"
              ? "Ce téléphone recevra les rappels (relevés, tâches…) même Fuego fermé."
              : "Activez pour être prévenu des relevés et tâches à faire, même sans ouvrir l'app."}
          </div>
        </>
      )}
    </div>
  );
}

// Changement de code PIN personnel — chacun peut changer LE SIEN, jamais
// celui d'un autre (contrairement à la modification via Paramètres → Équipe,
// réservée aux admins). Redemande l'ancien code avant d'accepter le
// changement : sans ça, un téléphone laissé déverrouillé permettrait à
// n'importe qui de reprendre le compte de la personne connectée.
function PinChangeButton({user,db,onUserUpdated}){
  const[open,setOpen]=useState(false);
  const[step,setStep]=useState("current"); // current | new | confirm
  const[current,setCurrent]=useState("");
  const[next,setNext]=useState("");
  const[confirm,setConfirm]=useState("");
  const[err,setErr]=useState("");
  const[busy,setBusy]=useState(false);

  function reset(){ setOpen(false); setStep("current"); setCurrent(""); setNext(""); setConfirm(""); setErr(""); }

  function submitCurrent(){
    if(current!==user.pin){ haptic.error(); setErr("Code actuel incorrect"); setCurrent(""); return; }
    setErr(""); setStep("new");
  }
  function submitNew(){
    if(next.length<4){ setErr("4 chiffres minimum"); return; }
    setErr(""); setStep("confirm");
  }
  async function submitConfirm(){
    if(confirm!==next){ haptic.error(); setErr("Les deux codes ne correspondent pas"); setConfirm(""); return; }
    setBusy(true);
    const res=await db.updateUser(user.id,{pin:next});
    setBusy(false);
    if(res?.error){ alert("Le code n'a pas été changé. Vérifie la connexion Supabase."); return; }
    haptic.success();
    onUserUpdated({...user,pin:next});
    reset();
  }

  return(<>
    <button className="btn btn-ghost mb8" onClick={()=>setOpen(true)}>🔑 Changer mon code PIN</button>
    {open&&<div className="overlay" onClick={reset}><div className="sheet" onClick={e=>e.stopPropagation()}>
      <div className="sheet-handle"></div>
      <div className="sheet-title">Changer mon code PIN</div>
      {step==="current"&&<>
        <p className="text-sm text-dim mb14">Entre ton code actuel pour confirmer que c'est bien toi.</p>
        <input className="input" type="password" inputMode="numeric" maxLength={6} value={current} autoFocus
          onChange={e=>{setCurrent(e.target.value.replace(/\D/g,""));setErr("");}}
          onKeyDown={e=>e.key==="Enter"&&current.length>=4&&submitCurrent()}
          placeholder="Code actuel" style={{textAlign:"center",fontSize:26,letterSpacing:8}}/>
        {err&&<p style={{color:T.bad,fontSize:12,margin:"8px 0",textAlign:"center"}}>{err}</p>}
        <button className="btn btn-primary mt14" onClick={submitCurrent} disabled={current.length<4}>Continuer</button>
      </>}
      {step==="new"&&<>
        <p className="text-sm text-dim mb14">Choisis ton nouveau code (4 à 6 chiffres).</p>
        <input className="input" type="password" inputMode="numeric" maxLength={6} value={next} autoFocus
          onChange={e=>{setNext(e.target.value.replace(/\D/g,""));setErr("");}}
          onKeyDown={e=>e.key==="Enter"&&next.length>=4&&submitNew()}
          placeholder="Nouveau code" style={{textAlign:"center",fontSize:26,letterSpacing:8}}/>
        {err&&<p style={{color:T.bad,fontSize:12,margin:"8px 0",textAlign:"center"}}>{err}</p>}
        <button className="btn btn-primary mt14" onClick={submitNew} disabled={next.length<4}>Continuer</button>
      </>}
      {step==="confirm"&&<>
        <p className="text-sm text-dim mb14">Retape le même code pour confirmer.</p>
        <input className="input" type="password" inputMode="numeric" maxLength={6} value={confirm} autoFocus
          onChange={e=>{setConfirm(e.target.value.replace(/\D/g,""));setErr("");}}
          onKeyDown={e=>e.key==="Enter"&&confirm.length>=4&&submitConfirm()}
          placeholder="Confirme le code" style={{textAlign:"center",fontSize:26,letterSpacing:8}}/>
        {err&&<p style={{color:T.bad,fontSize:12,margin:"8px 0",textAlign:"center"}}>{err}</p>}
        <button className="btn btn-primary mt14" onClick={submitConfirm} disabled={confirm.length<4||busy}>{busy?"Enregistrement…":"Valider"}</button>
      </>}
      <button className="btn btn-ghost mt8" onClick={reset}>Annuler</button>
    </div></div>}
  </>);
}

function SettingsPrinter({user}){
  const[relayInput,setRelayInput]=useState(getRelayUrl());
  const[testState,setTestState]=useState(null); // null | "testing" | {ok,...}
  const[printDone,setPrintDone]=useState(false);

  async function saveAndTestRelay(){
    const url = relayInput.trim().replace(/\/$/,"");
    setTestState("testing");
    const result = await testRelay(url);
    if(result.ok){ setRelayUrl(url); setTestState({ok:true}); }
    else{ setTestState({ok:false, error:result.error}); }
  }

  function clearRelay(){
    setRelayUrl(""); setRelayInput(""); setTestState(null);
  }

  async function testPrint(){
    await printBrotherLabel({product:"TEST FUEGO",qty:"",dateType:"fabrique",startDateStr:todayStr(),dlc:todayStr(),lot:"TEST-001",allergens:"Aucun",operator:user.name});
    setPrintDone(true); setTimeout(()=>setPrintDone(false),3000);
  }

  const relayActive = !!getRelayUrl();

  return(<>
    <div className="group-label">Imprimante d'étiquettes</div>
    <div className="card" style={{marginBottom:12}}>
      <div className="row gap10 mb8">
        <div style={{fontSize:28}}>🖨️</div>
        <div><div className="item-title">Brother — Ethernet</div><div className="text-xs text-dim">Format 57,15 × 50,8 mm</div></div>
      </div>
      <div className="text-xs text-dim" style={{lineHeight:1.6}}>
        Sur iPhone, Safari ne peut pas parler directement à la Brother. On passe par un petit relais installé sur un Android du réseau, qui transmet les étiquettes à l'imprimante.
      </div>
    </div>

    <div className="group-label">Relais d'impression {relayActive&&<span className="badge b-good" style={{marginLeft:6}}>Actif</span>}</div>
    <div className="card" style={{marginBottom:12}}>
      <div className="field" style={{marginBottom:8}}>
        <label className="label">Adresse du relais (affichée au démarrage de Termux)</label>
        <input className="input input-sm" placeholder="http://192.168.2.XX:9191" value={relayInput} onChange={e=>setRelayInput(e.target.value)}/>
      </div>
      <div className="row gap8">
        <button className="btn btn-primary" style={{flex:1}} onClick={saveAndTestRelay} disabled={!relayInput.trim()||testState==="testing"}>
          {testState==="testing"?"Test en cours…":"Enregistrer et tester"}
        </button>
        {relayActive&&<button className="btn btn-ghost" style={{flex:"0 0 auto",width:44}} onClick={clearRelay}>🗑</button>}
      </div>
      {testState&&testState!=="testing"&&(
        testState.ok
          ? <div className="banner banner-good mt8"><span>✓</span><div>Relais joignable. L'imprimante répond.</div></div>
          : <div className="banner banner-bad mt8"><span>⚠️</span><div>Injoignable : {testState.error}. Vérifie que Termux tourne sur l'Android et que les deux appareils sont sur le même WiFi.</div></div>
      )}
    </div>

    <CollapsibleSection title="Installation du relais" icon="📖" count={4}>
    {[
      ["1","Installer Termux","Sur l'Android dédié, depuis F-Droid (pas le Play Store, qui a une version obsolète)."],
      ["2","Lancer le serveur","Dans Termux : installer Node.js, copier server.js, taper « node server.js »."],
      ["3","Noter l'adresse affichée","Termux affiche une adresse du type http://192.168.x.x:9191 — c'est celle à coller ci-dessus."],
      ["4","Laisser tourner","Termux doit rester ouvert en arrière-plan sur l'Android en permanence."],
    ].map(([n,t,d])=>(
      <div key={n} className="item" style={{marginBottom:6}}>
        <div className="item-icon" style={{background:"linear-gradient(135deg,#FF6B00,#E8390A)",color:"white",fontWeight:800,fontSize:15}}>{n}</div>
        <div className="item-body"><div className="item-title">{t}</div><div className="item-sub" style={{whiteSpace:"normal"}}>{d}</div></div>
      </div>
    ))}
    </CollapsibleSection>

    <button className="btn btn-primary mt12" onClick={testPrint}>🖨️ Imprimer une étiquette test</button>
    {printDone&&<div className="banner banner-good mt8"><span>✓</span><div>{relayActive?"Étiquette envoyée au relais.":"Fenêtre d'impression ouverte (mode secours Safari)."}</div></div>}

    {!relayActive&&<div className="banner banner-warn mt12"><span>⚠️</span><div style={{fontSize:11,lineHeight:1.5}}>
      Sans relais configuré, le bouton ci-dessus utilise la boîte d'impression Safari — qui ne trouvera probablement pas la Brother (limitation connue sur ce modèle).
    </div></div>}
  </>);
}

function Settings({data,setData,user,onLogout,db,reload,markLocalWrite}){
  // L'adresse du relais d'impression peut changer à tout moment (redémarrage
  // de l'Android, changement de réseau) — bloquer sa mise à jour derrière un
  // compte admin paralyse toute l'équipe. Les non-admins accèdent donc à
  // l'onglet Imprimante uniquement ; le reste (HACCP, équipe, produits…)
  // reste réservé aux administrateurs.
  const ALL_TABS=[{k:"haccp",l:"🛡️ HACCP"},{k:"products",l:"🧾 Produits"},{k:"printer",l:"🖨️ Imprimante"},{k:"tasks",l:"📋 Tâches"},{k:"users",l:"👥 Équipe"},{k:"restaurant",l:"🏠 Resto"}];
  const tabs = user.isAdmin ? ALL_TABS : ALL_TABS.filter(t=>t.k==="printer");
  const[tab,setTab]=useState(user.isAdmin?"haccp":"printer");
  return(
    <div className="page">
      <div className="section-title">Paramètres</div>
      <div className="section-sub">{user.isAdmin?"Administration Fuego":"Configuration imprimante"}</div>
      {tabs.length>1&&<div className="tabs" style={{marginBottom:20}}>
        {tabs.map(t=><button key={t.k} className={`tab ${tab===t.k?"active":""}`} onClick={()=>setTab(t.k)}>{t.l}</button>)}
      </div>}
      {/* Double garde : même si l'onglet était forcé, le contenu admin reste protégé. */}
      {tab==="haccp"&&user.isAdmin&&<SettingsHaccp data={data} setData={setData} db={db} reload={reload}/>}
      {tab==="products"&&user.isAdmin&&<ProductsEditor data={data} setData={setData} db={db} reload={reload} markLocalWrite={markLocalWrite}/>}
      {tab==="printer"&&<SettingsPrinter user={user}/>}
      {tab==="tasks"&&user.isAdmin&&<TaskCategoriesEditor data={data} setData={setData} db={db} reload={reload} markLocalWrite={markLocalWrite}/>}
      {tab==="users"&&user.isAdmin&&<SettingsUsers data={data} setData={setData} user={user} db={db} reload={reload} onLogout={onLogout}/>}
      {tab==="restaurant"&&user.isAdmin&&<SettingsRestaurant data={data} setData={setData} db={db}/>}
    </div>
  );
}

// Icônes de navigation — en SVG directement dans le fichier plutôt qu'une
// dépendance externe (type lucide-react) : ça évite de toucher au
// package.json et donc tout risque de déploiement supplémentaire. Traits
// simples, monochromes, cohérents entre eux (contrairement aux émojis
// précédents, qui n'avaient ni le même style ni la même épaisseur).
function NavIcon({name}){
  const common={width:22,height:22,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};
  switch(name){
    case "home": return(<svg {...common}><path d="M3 11l9-8 9 8"/><path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"/></svg>);
    case "haccp": return(<svg {...common}><path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg>);
    case "recipes": return(<svg {...common}><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22.5v-18z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/></svg>);
    case "tasks": return(<svg {...common}><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 2h6v3H9z"/><path d="M9 12l2 2 4-4"/></svg>);
    case "more": return(<svg {...common}><circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/></svg>);
    default: return null;
  }
}

const NAV=[{k:"home",i:"home",l:"Aujourd'hui"},{k:"haccp",i:"haccp",l:"HACCP"},{k:"recipes",i:"recipes",l:"Recettes"},{k:"tasks",i:"tasks",l:"Mise en place"},{k:"more",i:"more",l:"Plus"}];
const TITLES={home:"Aujourd'hui",haccp:"HACCP",temps:"Températures",reception:"Réception",cooling:"Cellule",reheating:"Remise en T°",oils:"Huiles friture",trace:"Traçabilité",labels:"Étiquetage",clean:"Nettoyage",pests:"Nuisibles",training:"Formation",registre:"Registre HACCP",gbph:"Guide des bonnes pratiques",manual:"Notice d'utilisation",recipes:"Recettes",margins:"Marges",planning:"Planning",tasks:"Mise en place",more:"Plus",settings:"Paramètres"};
const ROOT_PAGES=["home","haccp","recipes","tasks","more"];
const HACCP_PAGES=["temps","reception","cooling","reheating","oils","trace","labels","clean","pests","training","registre","gbph"];
const MORE_PAGES=["margins","planning","settings"];

// ═══════════════════════════════════════════════════════════════════════════
// CONTRÔLE VOCAL
// ═══════════════════════════════════════════════════════════════════════════

// Normalise une chaîne : minuscules, sans accents, sans ponctuation
function normalize(s){
  return (s||"").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9\s]/g," ")
    .replace(/\s+/g," ").trim();
}

// Interprète une phrase et renvoie une action structurée (mots-clés)
function parseVoiceCommand(text, data){
  const t = normalize(text);

  // ── ÉTIQUETTE ─────────────────────────────────────────────────────────────
  // "imprime/fais/crée une étiquette de/pour <produit>"
  if (/\b(etiquette|etiquettes|imprime|imprimer|impression)\b/.test(t)){
    // extraire le produit après "de", "pour", "d", sinon dernier groupe de mots
    let produit = "";
    const m = t.match(/\b(?:etiquette|etiquettes)\b(?:\s+(?:de|d|du|des|pour|de la|le|la|les))?\s+(.+)$/);
    if (m && m[1]) produit = m[1];
    else {
      const m2 = t.match(/\b(?:de|d|du|des|pour|de la|le|la|les)\s+(.+)$/);
      if (m2 && m2[1]) produit = m2[1];
    }
    produit = produit.replace(/\b(une|un|le|la|les|des|du|de)\b/g,"").trim();
    if (produit){
      const clean = produit.charAt(0).toUpperCase()+produit.slice(1);
      return { type:"label", product:clean, raw:text };
    }
    return { type:"label", product:"", raw:text, needProduct:true };
  }

  // ── TÂCHE / MISE EN PLACE ─────────────────────────────────────────────────
  // "ajoute une tâche <texte>" / "note <texte>" / "rappelle de <texte>"
  if (/\b(tache|taches|mise en place|ajoute|note|rappelle|rappel|todo|a faire)\b/.test(t)){
    let task = "";
    const m = t.match(/\b(?:tache|taches|ajoute|note|rappelle|rappel|todo|a faire|mise en place)\b(?:\s+(?:une|de|d|du|des|pour|que|moi|la|le|les))?\s+(.+)$/);
    if (m && m[1]) task = m[1];
    task = task.replace(/^(une|un|de|d|du|des|la|le|les)\s+/,"").trim();
    if (task){
      // Devine la catégorie selon mots-clés
      let categoryId = data.taskCategories?.[0]?.id;
      if (/\b(froid|salade|crudite|tartare|ceviche|entree)\b/.test(task)) categoryId = data.taskCategories?.find(c=>/froid/i.test(c.name))?.id || categoryId;
      else if (/\b(chaud|sauce|cuisson|frite|mijote|braise)\b/.test(task)) categoryId = data.taskCategories?.find(c=>/chaud/i.test(c.name))?.id || categoryId;
      else if (/\b(dessert|patisserie|creme|gateau|tarte)\b/.test(task)) categoryId = data.taskCategories?.find(c=>/patiss/i.test(c.name))?.id || categoryId;
      const clean = task.charAt(0).toUpperCase()+task.slice(1);
      return { type:"task", task:clean, categoryId, raw:text };
    }
  }

  return { type:"unknown", raw:text };
}

// Hook reconnaissance vocale (Web Speech API)
function useSpeechRecognition({onResult, wakeWord, wakeEnabled}){
  const recognitionRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(()=>{
    const SR = typeof window!=="undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SR){ setSupported(false); return; }
  },[]);

  const start = useCallback((continuous=false)=>{
    const SR = typeof window!=="undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SR) return;
    const rec = new SR();
    rec.lang = "fr-FR";
    rec.continuous = continuous;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let finalText = "";
    rec.onresult = (e)=>{
      let interim = "";
      for (let i=e.resultIndex; i<e.results.length; i++){
        const tr = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += tr;
        else interim += tr;
      }
      onResult({ interim, final: e.results[e.results.length-1].isFinal ? finalText : "" });
    };
    rec.onend = ()=>{ setListening(false); };
    rec.onerror = ()=>{ setListening(false); };
    recognitionRef.current = rec;
    try{ rec.start(); setListening(true); }catch{}
  },[onResult]);

  const stop = useCallback(()=>{
    try{ recognitionRef.current?.stop(); }catch{}
    setListening(false);
  },[]);

  return { start, stop, listening, supported };
}

// Overlay d'écoute vocale
function VoiceOverlay({ data, db, reload, user, onClose, go }){
  const [phase, setPhase] = useState("listening"); // listening | thinking | done | error
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState(null);

  const handleResult = useCallback(async ({interim, final})=>{
    if (interim) setTranscript(interim);
    if (final){
      setTranscript(final);
      setPhase("thinking");
      const cmd = parseVoiceCommand(final, data);
      await executeCommand(cmd);
    }
  },[data]);

  const { start, stop, listening, supported } = useSpeechRecognition({ onResult: handleResult });

  useEffect(()=>{
    if (supported) start(false);
    return ()=>stop();
  },[]);

  async function executeCommand(cmd){
    if (cmd.type === "label"){
      if (!cmd.product){
        setResult({ ok:false, msg:"Quel produit ? Réessayez : « étiquette de frites »" });
        setPhase("error"); return;
      }
      const dlcDays = data.haccpSettings.labelDlcDefault;
      const dateProd = todayStr();
      const dlcDate = new Date(Date.now()+dlcDays*86400000).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit"});
      const todayShort = fmtDM(new Date());
      const todayCount = (data.labels||[]).filter(l=>l.dateProd===todayShort).length;
      const lot = `L${new Date().toLocaleDateString("fr-FR").replace(/\//g,"")}-${todayCount+1}`;
      // Imprime
      printVoiceLabel(cmd.product, dateProd, dlcDate, lot, user.name);
      // Enregistre
      await db.addLabel?.({product:cmd.product,dateProd,dlc:dlcDate,lot,allergens:"À vérifier",operator:user.name});
      await reload?.({force:true});
      setResult({ ok:true, msg:`Étiquette imprimée : ${cmd.product} · DLC ${dlcDate}` });
      setPhase("done");
    }
    else if (cmd.type === "task"){
      await db.addTask?.({task:cmd.task, resp:user.name, qty:"", prio:"med", categoryId:cmd.categoryId});
      await reload?.({force:true});
      const catName = data.taskCategories?.find(c=>c.id===cmd.categoryId)?.name || "Mise en place";
      setResult({ ok:true, msg:`Tâche ajoutée à « ${catName} » : ${cmd.task}` });
      setPhase("done");
    }
    else {
      setResult({ ok:false, msg:"Commande non comprise. Essayez : « imprime une étiquette de frites » ou « ajoute une tâche couper les oignons »" });
      setPhase("error");
    }
  }

  if (!supported){
    return (
      <div className="voice-overlay" onClick={onClose}>
        <button className="voice-close" onClick={onClose}>✕</button>
        <div style={{fontSize:48}}>🎤</div>
        <div className="voice-transcript">Reconnaissance vocale indisponible</div>
        <div className="voice-hint">Votre navigateur ne supporte pas la reconnaissance vocale.<br/>Essayez Chrome ou Safari sur mobile.</div>
        <button className="btn btn-ghost" style={{maxWidth:200}} onClick={onClose}>Fermer</button>
      </div>
    );
  }

  return (
    <div className="voice-overlay">
      <button className="voice-close" onClick={onClose}>✕</button>

      <div className={`voice-orb ${phase==="thinking"?"thinking":""}`}>
        {phase==="listening"?"🎤":phase==="thinking"?"⚙️":phase==="done"?"✓":"!"}
      </div>

      <div className="voice-status">
        {phase==="listening"?"À l'écoute…":phase==="thinking"?"Traitement…":phase==="done"?"Fait":"Non compris"}
      </div>

      {transcript && <div className="voice-transcript">« {transcript} »</div>}

      {phase==="listening" && !transcript && (
        <div className="voice-hint">
          Dites par exemple :<br/>
          <b style={{color:"#A0A0A0"}}>« Imprime une étiquette de frites »</b><br/>
          <b style={{color:"#A0A0A0"}}>« Ajoute une tâche couper les oignons »</b>
        </div>
      )}

      {result && (
        <div className={`voice-result ${result.ok?"ok":"err"}`}>{result.msg}</div>
      )}

      {(phase==="done"||phase==="error") && (
        <div style={{display:"flex",gap:8}}>
          <button className="btn btn-ghost" style={{width:"auto",padding:"10px 20px"}} onClick={()=>{
            setTranscript(""); setResult(null); setPhase("listening"); start(false);
          }}>🎤 Encore</button>
          <button className="btn btn-primary" style={{width:"auto",padding:"10px 20px"}} onClick={onClose}>Terminé</button>
        </div>
      )}
    </div>
  );
}

// Impression étiquette via voix — réutilise le format Brother 57,15×50,8mm
function printVoiceLabel(product, dateProd, dlc, lot, operator){
  printBrotherLabel({product, qty:"", dateProd, dlc, lot, allergens:"À vérifier", operator});
}


export default function App(){
  const[user,setUser]=useState(null);
  const[page,setPage]=useState("home");
  const[data,setData]=useState(null);
  const[dbError,setDbError]=useState(null);
  const[profile,setProfile]=useState(false);
  const[voiceOpen,setVoiceOpen]=useState(false);
  const[wakeEnabled,setWakeEnabled]=useState(false);
  const[showSplash,setShowSplash]=useState(true);
  useEffect(()=>{const t=setTimeout(()=>setShowSplash(false),1500);return()=>clearTimeout(t);},[]);

  // Verrou d'écriture : après une action de l'utilisateur (relevé, réception…),
  // on met à jour l'état local immédiatement pour que l'écran réagisse sans
  // délai. Mais la synchro automatique (toutes les 25 s) recharge tout depuis
  // Supabase et écraserait cette mise à jour si l'écriture n'a pas encore fini
  // de se propager côté serveur — d'où des données qui "disparaissent" juste
  // après avoir été saisies. Ce verrou bloque la synchro pendant quelques
  // secondes après chaque écriture, le temps que le serveur soit à jour.
  // ── Pastille sur l'icône de l'app (écran d'accueil iPhone) ──────────────
  // Affiche le nombre d'actions en attente, comme les Messages. Nécessite
  // iOS 16.4+ ET que l'app soit ajoutée à l'écran d'accueil : dans un onglet
  // Safari classique, l'API n'existe pas (le code se contente alors de ne
  // rien faire, sans erreur).
  useEffect(()=>{
    if(!("setAppBadge" in navigator)) return; // navigateur sans support
    // Déconnecté : on efface la pastille, sinon elle resterait figée sur le
    // dernier chiffre affiché.
    if(!data || !user){ navigator.clearAppBadge?.().catch(()=>{}); return; }

    const s = data.haccpSettings;
    // Relevés de température manquants aujourd'hui (matin + soir par enceinte)
    const fridges = s?.fridgeTargets || [];
    const relevesManquants = fridges.reduce((n,f)=>
      n + (getReleve(data,f.id,"matin")?0:1) + (getReleve(data,f.id,"soir")?0:1), 0);

    // Tâches du créneau en cours restant à cocher
    const RESET_MIDI = s?.resetMidi ?? (16*60+30);
    const RESET_SOIR = s?.resetSoir ?? (3*60);
    const now = new Date(); const mins = now.getHours()*60+now.getMinutes();
    const slotDate = new Date();
    let slotService;
    if(mins < RESET_SOIR){ slotDate.setDate(slotDate.getDate()-1); slotService="soir"; }
    else if(mins < RESET_MIDI){ slotService="midi"; }
    else { slotService="soir"; }
    const slotIso = isoDate(slotDate);
    const tachesRestantes = (data.tasks||[]).filter(t=>
      t.date===slotIso && (t.service||"midi")===slotService && !t.done).length;

    // Zones de nettoyage à faire + produits en alerte DLC
    const nettoyageRestant = (data.cleaning||[]).filter(c=>!cleaningIsDoneToday(c,data.cleaningChecks,data.haccpSettings?.resetSoir)).length;
    const alertesDlc = (data.traceability||[]).filter(t=>t.status!=="ok").length;

    const total = relevesManquants + tachesRestantes + nettoyageRestant + alertesDlc;

    // setAppBadge(0) afficherait une pastille vide : on l'efface plutôt.
    if(total>0) navigator.setAppBadge(total).catch(()=>{});
    else navigator.clearAppBadge?.().catch(()=>{});
  },[data,user]);

  // Langue de l'équipe, choisie à la connexion et gardée sur cet appareil.
  // Phase 1 : ne couvre que les écrans du quotidien (connexion, nav,
  // Températures, Nettoyage, Mise en place) — le reste de l'app reste en
  // français pour tout le monde. Voir locales/ps.js pour le statut de
  // relecture avant élargissement.
  const[lang,setLang]=useState(()=>{
    try{ return localStorage.getItem("fuego_lang")||"fr"; }catch{ return "fr"; }
  });
  function changeLang(l){
    setLang(l);
    try{ localStorage.setItem("fuego_lang",l); }catch{}
  }
  useEffect(()=>{ document.documentElement.dir = dirFor(lang); },[lang]);

  const lastWriteRef = useRef(0);
  const markLocalWrite = useCallback(()=>{ lastWriteRef.current = Date.now(); },[]);
  const WRITE_LOCK_MS = 6000;

  const reload=useCallback(async({force=false}={})=>{
    // Ne pas écraser une saisie toute fraîche avec des données serveur
    // potentiellement en retard (sauf rechargement explicite après une erreur).
    if(!force && Date.now()-lastWriteRef.current < WRITE_LOCK_MS) return;
    // Si Supabase pas configuré → mode démo avec données INIT
    const notConfigured = !SUPABASE_URL || SUPABASE_URL.includes("REMPLACE");
    if(notConfigured){ setData(INIT); setDbError(null); return; }
    try{
      const loaded=await DB.loadAll();
      // Si la DB est vide (pas encore peuplée), fallback sur INIT
      if(!loaded.users || loaded.users.length===0){ setData(INIT); return; }
      setData({...loaded, planning: loaded.planning || INIT.planning}); setDbError(null);
    }
    catch(e){ console.error("Supabase:",e); setDbError(e.message||"Erreur connexion"); if(!data)setData(INIT); }
  },[]);
  useEffect(()=>{reload({force:true});},[]);

  // ── Temps réel : re-synchronise les données toutes les 25 s + au retour sur l'app.
  //    (Le client REST n'a pas de websocket ; le polling suffit pour une équipe de cuisine.)
  // ── Reset fin de service : quand on change de période (fin du midi 15h00, fin du soir 23h30),
  //    les listes Mise en place + Nettoyage repassent à zéro pour toute l'équipe.
  //    Les relevés de température sont déjà remis à zéro chaque jour (matin/soir par date).
  useEffect(()=>{
    // Deux bascules par jour, dont les horaires sont paramétrables
    // (Paramètres → HACCP → Horaires de service) :
    //  · resetMidi → fin du service du midi (défaut 16h30, pendant la coupure)
    //  · resetSoir → fin du service du soir (défaut 03h00, liste neuve au matin)
    // Le créneau du soir traverse minuit : avant resetSoir, on est encore
    // rattaché au service de la VEILLE. Sans ça, le changement de date à minuit
    // provoquerait une remise à zéro parasite en plein service.
    const RESET_MIDI = data?.haccpSettings?.resetMidi ?? (16*60+30);
    const RESET_SOIR = Math.min(data?.haccpSettings?.resetSoir ?? (3*60), 9*60); // plafonné, voir Paramètres → Horaires
    const serviceKey=()=>{
      const n=new Date();
      const mins=n.getHours()*60+n.getMinutes();
      const day=new Date(n);
      let period;
      if(mins < RESET_SOIR){
        // Entre minuit et 3h : encore le service du soir de la veille.
        period="soir";
        day.setDate(day.getDate()-1);
      } else if(mins < RESET_MIDI){
        period="midi";
      } else {
        period="soir";
      }
      // Date locale (pas ISO/UTC, qui décalerait le jour selon le fuseau).
      const ymd=`${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,"0")}-${String(day.getDate()).padStart(2,"0")}`;
      return `${ymd}-${period}`;
    };
    let busy=false;
    const tick=async()=>{
      if(busy||document.hidden)return; busy=true;
      try{
        const key=serviceKey();
        const last=await DB.getAppState("last_service");
        if(last!==null&&last!==key){
          // "last" = créneau qui vient de se terminer, "key" = celui qui
          // devient courant. On y fait glisser les tâches non faites.
          const prevDate = last.slice(0,10);
          const prevService = last.slice(11);
          const nextDate = key.slice(0,10);
          const nextService = key.slice(11);
          await DB.rolloverSlot(prevDate, prevService, nextDate, nextService);
          await DB.resetServiceLists();
        }
        if(last!==key){ await DB.setAppState("last_service",key); }
        // Les nettoyages hebdo/mensuel/trimestriel expirent selon leur propre
        // date de réalisation, indépendamment des services : on vérifie donc à
        // chaque synchro, pas seulement quand le service change.
        await DB.expireCleaningByFrequency();
        await reload();
      }catch(e){/* silencieux : prochaine tentative au tick suivant */}
      busy=false;
    };
    const iv=setInterval(tick,25000);
    const onVisible=()=>{ if(!document.hidden) tick(); };
    document.addEventListener("visibilitychange",onVisible);
    window.addEventListener("focus",onVisible);
    return()=>{clearInterval(iv);document.removeEventListener("visibilitychange",onVisible);window.removeEventListener("focus",onVisible);};
  },[reload, data?.haccpSettings?.resetMidi, data?.haccpSettings?.resetSoir]);

  // ── Mot-clé "Fuego" (écoute passive en arrière-plan) ──
  useEffect(()=>{
    if(!wakeEnabled || voiceOpen) return;
    const SR = typeof window!=="undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if(!SR) return;
    let rec; let stopped=false;
    try{
      rec = new SR();
      rec.lang="fr-FR"; rec.continuous=true; rec.interimResults=true;
      rec.onresult=(e)=>{
        const last=e.results[e.results.length-1][0].transcript.toLowerCase();
        if(/\bfuego\b|\bweego\b|\bfwego\b/.test(last)){
          try{rec.stop();}catch{}
          setVoiceOpen(true);
        }
      };
      rec.onend=()=>{ if(!stopped && wakeEnabled && !voiceOpen){ try{rec.start();}catch{} } };
      rec.onerror=()=>{};
      rec.start();
    }catch{}
    return ()=>{ stopped=true; try{rec&&rec.stop();}catch{} };
  },[wakeEnabled,voiceOpen]);

  const[gbphSection,setGbphSection]=useState(null);
  const[navDir,setNavDir]=useState("fade"); // forward | back | fade
  const go=(k,opts)=>{
    if(opts?.section)setGbphSection(opts.section);
    // Détermine le sens de la transition, façon iOS :
    // vers une sous-page = forward (glisse depuis la droite),
    // retour vers une racine = back (glisse depuis la gauche),
    // entre deux onglets racine = fade simple.
    const goingToRoot=ROOT_PAGES.includes(k);
    const comingFromRoot=ROOT_PAGES.includes(page);
    if(goingToRoot&&comingFromRoot) setNavDir("fade");
    else if(goingToRoot&&!comingFromRoot) setNavDir("back");
    else setNavDir("forward");
    setPage(k); setProfile(false);
  };
  const logout=()=>{setUser(null);setPage("home");};

  // ── Service worker : socle des notifications (étape 1) ──────────────────
  // Il ne fait rien de visible pour l'instant — il se contente d'exister, pour
  // pouvoir recevoir des notifications plus tard. Volontairement isolé : si le
  // fichier /sw.js est absent ou refusé, on ignore silencieusement. L'app
  // fonctionne exactement comme avant, sans le moindre impact.
  useEffect(()=>{
    if(!("serviceWorker" in navigator)) return;
    // Ne s'enregistre qu'en HTTPS (ou en local pour le développement) : le
    // navigateur refuse les service workers sur une connexion non sécurisée.
    const secure = window.isSecureContext || location.hostname==="localhost";
    if(!secure) return;
    navigator.serviceWorker.register("/sw.js").catch(()=>{
      /* Pas de service worker : les notifications seront simplement
         indisponibles. Aucune autre fonction de l'app n'en dépend. */
    });
  },[]);

  if(showSplash)return<><style>{S}</style><SplashScreen/></>;

  if(!data)return(
    <><style>{S}</style>
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",background:T.bg0,gap:16}}>
      <div className="fade-up" style={{display:"flex",justifyContent:"center"}}><FuegoBrand height={96}/></div>
      <div className="fade-up fade-up-1" style={{fontFamily:"'Inter',sans-serif",fontSize:34,fontWeight:900,letterSpacing:".28em",textTransform:"uppercase",background:"linear-gradient(135deg,#FF6B00,#E8390A)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",color:"transparent"}}>FUEGO</div>
      {dbError
        ?<div style={{color:T.bad,fontSize:13,textAlign:"center",maxWidth:280,lineHeight:1.5,padding:"0 20px"}}>
           <div style={{marginBottom:8}}>⚠ Connexion Supabase</div>
           <div style={{color:T.textDim,fontSize:12}}>{dbError}</div>
           <div style={{marginTop:8,color:T.textDim,fontSize:11}}>Vérifie SUPABASE_URL et SUPABASE_ANON dans App.jsx</div>
           <button className="btn btn-ghost" style={{marginTop:16}} onClick={reload}>Réessayer</button>
         </div>
        :<div className="fade-up fade-up-2" style={{width:140,height:3,borderRadius:2,background:"#1A1A1A",overflow:"hidden",position:"relative"}}>
           <div style={{position:"absolute",top:0,left:0,width:"40%",height:"100%",borderRadius:2,background:"linear-gradient(90deg,#FF6B00,#E8390A)",animation:"loadBar 1.1s ease-in-out infinite"}}></div>
         </div>
      }
    </div></>
  );

  if(!user)return(<><style>{S}</style><Login users={data.users} onLogin={u=>setUser(u)} lang={lang} onChangeLang={changeLang}/></>);

  const isRoot=ROOT_PAGES.includes(page);
  const backTo=HACCP_PAGES.includes(page)?"haccp":MORE_PAGES.includes(page)?"more":"home";
  const activeTab=ROOT_PAGES.includes(page)?page:HACCP_PAGES.includes(page)?"haccp":MORE_PAGES.includes(page)?"more":page;
  const props={data,setData,user,go,db:DB,reload,markLocalWrite,onVoiceOpen:()=>setVoiceOpen(true),lang};
  const pages={
    home:<Aujourdhui {...props}/>,haccp:<HaccpHub {...props}/>,
    temps:<Temperatures {...props}/>,reception:<Reception {...props}/>,
    cooling:<Cooling {...props}/>,reheating:<Reheating {...props}/>,
    oils:<Oils {...props}/>,trace:<Traceability {...props}/>,
    labels:<Labels {...props}/>,
    clean:<Cleaning {...props}/>,pests:<Pests {...props}/>,
    training:<Training data={data} go={go} setData={setData} db={DB} reload={reload} markLocalWrite={markLocalWrite} user={user} lang={lang}/>,registre:<Registre data={data} db={DB}/>,gbph:<GbphGuide initialSection={gbphSection}/>,manual:<ManualGuide user={user}/>,
    recipes:<Recipes data={data} setData={setData} db={DB} reload={reload} user={user} markLocalWrite={markLocalWrite} lang={lang}/>,
    margins:<Margins data={data}/>,planning:<Planning {...props}/>,
    tasks:<Tasks data={data} setData={setData} db={DB} reload={reload} user={user} lang={lang}/>,
    more:<More go={go} user={user} lang={lang}/>,
    settings:<Settings data={data} setData={setData} user={user} onLogout={logout} db={DB} reload={reload} markLocalWrite={markLocalWrite}/>,
  };
  return(<><style>{S}</style><GlobalSheetSwipe/><div className="shell">
    <div className="topbar">
      {isRoot?<><div style={{width:36}}></div><div className="topbar-center">{page==="home"?<div className="topbar-logo"><FuegoLogo/></div>:<div className="topbar-title">{TITLES[page]}</div>}</div><button className="topbar-avatar" onClick={()=>setProfile(!profile)}>{user.initials}</button></>:<><button className="topbar-back" onClick={()=>go(backTo)}>‹</button><div className="topbar-center"><div className="topbar-title">{TITLES[page]}</div></div><div style={{width:36}}></div></>}
    </div>
    {profile&&<div className="overlay" onClick={()=>setProfile(false)}><div className="sheet" onClick={e=>e.stopPropagation()}>
      <div className="sheet-handle"></div><div className="profile-avatar">{user.initials}</div><div className="profile-name">{user.name}</div><div className="profile-role">{user.role}</div>
      <div className="center mb14"><span className={`badge ${user.isAdmin?"b-bad":"b-mute"}`}>{user.isAdmin?"Administrateur":"Équipe"}</span></div>
      {VOICE_FEATURE_ENABLED&&<>
      <button className="voice-toggle" style={{width:"100%",justifyContent:"space-between",cursor:"pointer"}} onClick={()=>setWakeEnabled(w=>!w)}>
        <span style={{display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:18}}>🎤</span><span style={{fontSize:13,fontWeight:600}}>Mot-clé « Fuego »</span></span>
        <span style={{width:42,height:24,borderRadius:999,background:wakeEnabled?"linear-gradient(135deg,#FF6B00,#E8390A)":"#2A2A2A",position:"relative",transition:"background .2s",flexShrink:0}}>
          <span style={{position:"absolute",top:2,left:wakeEnabled?20:2,width:20,height:20,borderRadius:"50%",background:"white",transition:"left .2s"}}></span>
        </span>
      </button>
      <div className="text-xs text-mute mb12" style={{paddingLeft:4}}>{wakeEnabled?"Dites « Fuego » pour activer la commande vocale sans toucher l'écran":"Activez pour piloter à la voix, mains libres"}</div>
      </>}
      <NotificationToggle user={user} db={DB}/>
      <PinChangeButton user={user} db={DB} onUserUpdated={(updated)=>{
        setUser(updated);
        setData(d=>({...d,users:d.users.map(u=>u.id===updated.id?updated:u)}));
      }}/>
      <button className="btn btn-ghost mb8" onClick={()=>{setProfile(false);go("settings");}}>⚙️ Paramètres</button>
      <button className="btn" style={{background:T.badBg,color:T.bad}} onClick={logout}>Déconnexion</button>
      {/* Mention de propriété — année calculée automatiquement pour ne jamais
          devenir obsolète. */}
      <div style={{textAlign:"center",marginTop:18,fontSize:10,color:T.textMute,letterSpacing:".03em",lineHeight:1.6}}>
        <div style={{fontWeight:700,color:T.textDim}}>Fuego</div>
        <div>© {new Date().getFullYear()} Alexandre Valery</div>
        <div>Tous droits réservés</div>
      </div>
    </div></div>}
    <div className={`scroll nav-${navDir}`} key={page}>{pages[page]||pages.home}</div>

    {/* Overlay vocal */}
    {voiceOpen && (
      <VoiceOverlay
        data={data} db={DB} reload={reload} user={user} go={go}
        onClose={()=>setVoiceOpen(false)}
      />
    )}

    {!voiceOpen && !profile && <div className="bottomnav">{NAV.map(n=>{
      // Traduction seulement pour les 4 onglets du quotidien (phase 1) ; les
      // autres (ex. Recettes) restent en français pour l'instant.
      const NAV_KEYS={home:"nav_home",haccp:"nav_haccp",recipes:"nav_recipes",tasks:"nav_tasks",more:"nav_more"};
      const label = NAV_KEYS[n.k] ? t(NAV_KEYS[n.k],lang) : n.l;
      return <button key={n.k} className={`nav-item ${activeTab===n.k?"active":""}`} onClick={()=>go(n.k)}><span className="nav-icon"><NavIcon name={n.i}/></span><span className="nav-label">{label}</span></button>;
    })}</div>}
  </div></>);
}
