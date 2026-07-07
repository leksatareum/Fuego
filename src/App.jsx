import { useState, useEffect, useCallback, useRef, useMemo } from "react";
// ─── SUPABASE REST CLIENT (sans dépendance externe) ─────────────────────────
// Fonctionne dans l'artifact Claude, dans Vite, partout.
// Utilise directement l'API REST Supabase via fetch.

import { SUPABASE_URL, SUPABASE_ANON } from "./config.js";
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
      rcl, rtr, rlb, rtm, rtr2, rpe, rrc, rcat, rtk, rre, rpr
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
      sbGet("traceability",    qs(q.order("created_at",false),q.limit(200),q.select())),
      sbGet("labels",          qs(q.order("created_at",false),q.limit(200),q.select())),
      sbGet("test_meals",      qs(q.order("created_at",false),q.limit(100),q.select())),
      sbGet("training",        qs(q.order("id"),q.select())),
      sbGet("pests",           qs(q.order("created_at",false),q.limit(50),q.select())),
      sbGet("recipes",         qs(q.order("id"),q.select())),
      sbGet("task_categories", qs(q.order("sort_order"),q.select())),
      sbGet("tasks",           qs(q.order("created_at",false),q.limit(500),q.select())),
      sbGet("restaurant",      qs(q.limit(1),q.select())),
      sbGet("products",        qs(q.order("name"),q.select())),
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
    const trace   = rtr.data  || [];
    const labels  = rlb.data  || [];
    const tm      = rtm.data  || [];
    const train   = rtr2.data || [];
    const pests   = rpe.data  || [];
    const recipes = rrc.data  || [];
    const cats    = rcat.data || [];
    const tasks   = rtk.data  || [];
    const resto   = (rre.data || [{}])[0] || {};
    const products= rpr.data || [];

    return {
      restaurant: resto,
      users: users.map(u=>({id:u.id,name:u.name,initials:u.initials,role:u.role,pin:u.pin,isAdmin:u.is_admin,color:u.color})),
      haccpSettings: {
        fridgeTargets: ft.map(f=>({id:f.id,name:f.name,icon:f.icon,target:f.target,type:f.type})),
        coolingMax:hs.cooling_max||120, reheatMin:hs.reheat_min||63,
        reheatMaxTime:hs.reheat_max_time||60, oilPolarMax:hs.oil_polar_max||25,
        testMealDays:hs.test_meal_days||3, labelDlcDefault:hs.label_dlc_default||3,
      },
      fridgeReleves: fr.map(r=>({id:r.id,fridgeId:r.fridge_id,date:r.date,period:r.period,temp:r.temp,time:r.time,operatorId:r.operator_id})),
      reception: rec.map(r=>({id:r.id,date:r.date,supplier:r.supplier,product:r.product,qty:r.qty,temp:r.temp,tempOk:r.temp_ok,dlc:r.dlc,lot:r.lot,aspect:r.aspect,emballage:r.emballage,signed:r.signed})),
      cooling: cool.map(c=>({id:c.id,product:c.product,qty:c.qty,startTemp:c.start_temp,endTemp:c.end_temp,duration:c.duration,startedMs:c.started_ms,operator:c.operator,status:c.status,date:c.date,dlc:c.dlc})),
      reheating: reheat.map(r=>({id:r.id,product:r.product,endTemp:r.end_temp,duration:r.duration,operator:r.operator,status:r.status,date:r.date})),
      oils: oils.map(o=>({id:o.id,name:o.name,type:o.type,dateInstall:o.date_install,lastTest:o.last_test,polaires:o.polaires,operator:o.operator})),
      cleaning: clean.map(c=>({id:c.id,zone:c.zone,icon:c.icon,freq:c.freq,produit:c.produit,dilution:c.dilution,done:c.done})),
      traceability: trace.map(t=>({id:t.id,product:t.product,emoji:t.emoji,supplier:t.supplier,lot:t.lot,dlc:t.dlc,qty:t.qty,allergenes:t.allergenes||[],status:t.status})),
      labels: labels.map(l=>({id:l.id,product:l.product,dateProd:l.date_prod,dlc:l.dlc,lot:l.lot,allergens:l.allergens,operator:l.operator})),
      testMeals: tm.map(m=>({id:m.id,date:m.date,service:m.service,product:m.product,qty:m.qty,destroyAt:m.destroy_at,operator:m.operator})),
      training: train.map(t=>({id:t.id,name:t.name,role:t.role,haccpExp:t.haccp_exp,visaExp:t.visa_exp})),
      pests: pests.map(p=>({id:p.id,date:p.date,type:p.type,company:p.company,result:p.result,nextVisit:p.next_visit})),
      recipes: recipes.map(r=>({id:r.id,name:r.name,emoji:r.emoji,type:r.type,category:r.category,price:r.price,portions:r.portions,yield:r.yield_qty?{qty:r.yield_qty,unit:r.yield_unit}:undefined,components:r.components||[],steps:r.steps||[],allergens:r.allergens||[]})),
      taskCategories: cats.map(c=>({id:c.id,name:c.name,icon:c.icon,color:c.color})),
      tasks: tasks.map(t=>({id:t.id,categoryId:t.category_id,task:t.task,resp:t.resp,qty:t.qty,done:t.done,prio:t.prio})),
      products: products.map(p=>({id:p.id,name:p.name,price:p.price,unit:p.unit})),
    };
  },

  async saveReleve({fridgeId,date,period,temp,time,operatorId}){
    // Cherche un releve existant pour ce frigo/date/period
    const {data:ex}=await sbGet("fridge_releves", qs(`fridge_id=eq.${fridgeId}`,`date=eq.${date}`,`period=eq.${period}`,q.limit(1),q.select("id")));
    if(ex&&ex[0])
      return sbPatch("fridge_releves",{temp,time,operator_id:operatorId},qs(`id=eq.${ex[0].id}`));
    return sbPost("fridge_releves",{fridge_id:fridgeId,date,period,temp,time,operator_id:operatorId});
  },
  async addReception(r){return sbPost("reception",{date:r.date,supplier:r.supplier,product:r.product,qty:r.qty,temp:r.temp,temp_ok:r.tempOk,dlc:r.dlc,lot:r.lot,aspect:r.aspect,emballage:r.emballage,signed:r.signed});},
  async startCooling(c){return sbPost("cooling",{product:c.product,qty:c.qty,start_temp:c.startTemp,started_ms:c.startedMs,status:"active",operator:c.operator,date:c.date});},
  async finishCooling(id,{endTemp,duration,status,dlc}){return sbPatch("cooling",{end_temp:endTemp,duration,started_ms:null,status,dlc},qs(`id=eq.${id}`));},
  async addReheating(r){return sbPost("reheating",{product:r.product,end_temp:r.endTemp,duration:r.duration,operator:r.operator,status:r.status,date:r.date});},
  async updateOil(id,{polaires,operator,changed,dateInstall}){
    const body={polaires,operator,last_test:todayStr()};
    if(changed)body.date_install=dateInstall;
    return sbPatch("oils",body,qs(`id=eq.${id}`));
  },
  async toggleCleaning(id,done){return sbPatch("cleaning",{done,done_at:done?new Date().toISOString():null},qs(`id=eq.${id}`));},
  async addTraceability(t){return sbPost("traceability",{product:t.product,emoji:t.emoji,supplier:t.supplier,lot:t.lot,dlc:t.dlc,qty:t.qty,allergenes:t.allergenes,status:t.status});},
  async addLabel(l){return sbPost("labels",{product:l.product,date_prod:l.dateProd,dlc:l.dlc,lot:l.lot,allergens:l.allergens,operator:l.operator});},
  async addTestMeal(m){return sbPost("test_meals",{date:m.date,service:m.service,product:m.product,qty:m.qty,destroy_at:m.destroyAt,operator:m.operator});},
  async addPest(p){return sbPost("pests",{date:p.date,type:p.type,company:p.company,result:p.result,next_visit:p.nextVisit});},
  async saveRecipe(r){
    const row={name:r.name,emoji:r.emoji,type:r.type,category:r.category,price:r.price,portions:r.portions,yield_qty:r.yield?.qty,yield_unit:r.yield?.unit,components:r.components,steps:r.steps,allergens:r.allergens};
    if(r.id)return sbPatch("recipes",row,qs(`id=eq.${r.id}`));
    return sbPost("recipes",row);
  },
  async addTask(t){return sbPost("tasks",{category_id:t.categoryId,task:t.task,resp:t.resp,qty:t.qty,prio:t.prio,done:false,date:todayStr()});},
  async toggleTask(id,done){return sbPatch("tasks",{done},qs(`id=eq.${id}`));},
  async saveTaskCategory(c){
    if(c.id)return sbPatch("task_categories",{name:c.name,icon:c.icon,color:c.color},qs(`id=eq.${c.id}`));
    return sbPost("task_categories",{name:c.name,icon:c.icon,color:c.color});
  },
  async deleteTaskCategory(id,fallbackId){
    if(fallbackId)await sbPatch("tasks",{category_id:fallbackId},qs(`category_id=eq.${id}`));
    return sbDelete("task_categories",qs(`id=eq.${id}`));
  },
  async addProduct(p){return sbPost("products",{name:p.name,price:p.price,unit:p.unit});},
  async updateProduct(id,p){return sbPatch("products",{name:p.name,price:p.price,unit:p.unit},qs(`id=eq.${id}`));},
  async deleteProduct(id){return sbDelete("products",qs(`id=eq.${id}`));},
  async saveHaccpSettings(s){return sbPatch("haccp_settings",{cooling_max:s.coolingMax,reheat_min:s.reheatMin,reheat_max_time:s.reheatMaxTime,oil_polar_max:s.oilPolarMax,test_meal_days:s.testMealDays,label_dlc_default:s.labelDlcDefault},qs("id=eq.1"));},
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
  text:"#FFFFFF", textDim:"#A0A0A0", textMute:"#606060", textGhost:"#383838",
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
  *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
  :focus-visible{outline:2px solid #FF6B00;outline-offset:2px;border-radius:4px;}
  @media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;}}
  html,body,#root{height:100%;position:fixed;inset:0;overflow:hidden;overscroll-behavior:none;-webkit-user-select:none;}
  #root{display:flex;flex-direction:column;}
  body{font-family:'Inter',sans-serif;background:${T.bg0};color:${T.text};font-size:15px;-webkit-font-smoothing:antialiased;overscroll-behavior:none;}
  button{font-family:inherit;cursor:pointer;user-select:none;-webkit-user-select:none;touch-action:manipulation;}
  .tabular{font-variant-numeric:tabular-nums;letter-spacing:-0.01em;}

  .shell{display:flex;flex-direction:column;height:100vh;height:100dvh;max-width:480px;margin:0 auto;background:${T.bg0};position:relative;overflow:hidden;}
  .topbar{background:${T.bg1};padding:calc(12px + env(safe-area-inset-top)) 18px 12px;border-bottom:1px solid ${T.border};flex-shrink:0;display:flex;align-items:center;justify-content:space-between;}
  .topbar-back{width:36px;height:36px;border-radius:50%;background:${T.bg2};border:none;display:flex;align-items:center;justify-content:center;font-size:20px;color:${T.text};transition:transform .15s;}
  .topbar-back:active{transform:scale(.92);}
  .topbar-center{flex:1;text-align:center;}
  .topbar-logo{font-family:'Inter',sans-serif;font-size:17px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;}
  .topbar-logo .flame{background:linear-gradient(135deg,#FF6B00,#E8390A);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;color:transparent;}
  .topbar-title{font-family:'Inter',sans-serif;font-size:15px;font-weight:700;color:${T.text};letter-spacing:.01em;}
  .topbar-avatar{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#FF6B00,#E8390A);border:none;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:white;transition:transform .15s;}
  .topbar-avatar:active{transform:scale(.92);}

  .scroll{flex:1;overflow-y:auto;padding:18px 14px 110px;position:relative;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;}
  .scroll::-webkit-scrollbar{width:0;}
  @keyframes pageIn{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
  @keyframes loadBar{0%{transform:translateX(-100%);}100%{transform:translateX(250%);}}
  @keyframes fadeUp{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:translateY(0);}}
  @keyframes inputShake{0%,100%{transform:translateX(0);}20%{transform:translateX(-7px);}40%{transform:translateX(7px);}60%{transform:translateX(-4px);}80%{transform:translateX(4px);}}
  .input-shake{animation:inputShake .4s ease-in-out;}
  .fade-up{animation:fadeUp .45s cubic-bezier(.22,1,.36,1) both;}
  .fade-up-1{animation-delay:.05s;}.fade-up-2{animation-delay:.12s;}.fade-up-3{animation-delay:.19s;}
  .page{animation:pageIn 220ms cubic-bezier(0.4,0,0.2,1);}
  @keyframes pulseGlow{0%,100%{box-shadow:0 0 0 0 rgba(232,57,10,.5);}50%{box-shadow:0 0 0 10px rgba(232,57,10,0);}}
  /* ── VOICE ── */
  .voice-fab{position:absolute;bottom:80px;left:14px;width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#FF6B00,#E8390A);color:white;border:none;font-size:22px;box-shadow:0 8px 24px rgba(232,57,10,.5);z-index:49;display:flex;align-items:center;justify-content:center;transition:transform .15s;}
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
  .voice-close{position:absolute;top:20px;right:20px;width:40px;height:40px;border-radius:50%;background:#1A1A1A;border:1px solid #2A2A2A;color:#FFFFFF;font-size:20px;display:flex;align-items:center;justify-content:center;}
  .voice-toggle{display:flex;align-items:center;gap:10px;padding:12px 16px;background:#1A1A1A;border-radius:12px;border:1px solid #2A2A2A;margin-bottom:8px;}
  @keyframes toastIn{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
  .save-toast{position:fixed;bottom:calc(96px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);background:rgba(10,10,10,.96);border:1px solid #2A2A2A;color:#5FB075;font-size:13px;font-weight:600;padding:8px 16px;border-radius:999px;z-index:200;display:flex;align-items:center;gap:6px;animation:toastIn .2s ease-out;box-shadow:0 8px 24px rgba(0,0,0,.4);}
  @keyframes pressShrink{to{transform:scale(.96);}}
  .ed-row{position:relative;transition:transform .12s,background .2s;}
  .ed-row.pressing{transform:scale(.96);background:#2D1818;}
  .ed-field{background:transparent;border:none;border-bottom:1.5px solid transparent;color:#F5F1E8;font-family:inherit;outline:none;width:100%;transition:border-color .15s;padding:2px 0;}
  .ed-field:focus{border-bottom-color:#B8503F;}
  .inline-add{display:flex;align-items:center;gap:10px;padding:14px;border:1.5px dashed #3A3A3A;border-radius:12px;color:#A8A29A;font-size:14px;font-weight:600;background:transparent;width:100%;justify-content:center;transition:all .15s;}
  .inline-add:active{border-color:#B8503F;color:#F5F1E8;}
  .pulse{animation:pulseGlow 1.8s ease-in-out infinite;}

  .bottomnav{position:absolute;bottom:0;left:0;right:0;background:rgba(17,17,17,.88);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-top:1px solid ${T.border};display:flex;padding:8px 4px calc(12px + env(safe-area-inset-bottom));z-index:50;}
  .nav-item{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 0;border:none;background:transparent;color:${T.textMute};transition:color .18s;position:relative;}
  .nav-item.active{color:#FF6B00;}
  .nav-item.active::before{content:"";position:absolute;top:0;left:50%;transform:translateX(-50%);width:24px;height:2px;background:linear-gradient(90deg,#FF6B00,#E8390A);border-radius:0 0 2px 2px;}
  .nav-icon{font-size:20px;line-height:1;}
  .nav-label{font-size:10px;font-weight:600;color:inherit;}

  .greet-block{margin-bottom:16px;}
  .greet-line{display:flex;align-items:center;gap:8px;color:${T.textDim};font-size:13px;margin-bottom:2px;}
  .greet-dot{width:6px;height:6px;border-radius:50%;background:#FF6B00;box-shadow:0 0 8px rgba(255,107,0,.6);}
  .greet-name{font-family:'Inter',sans-serif;font-size:22px;font-weight:700;color:${T.text};line-height:1.1;}
  .greet-context{font-size:12px;color:#606060;margin-top:2px;text-transform:capitalize;letter-spacing:.02em;}

  .section-title{font-family:'Inter',sans-serif;font-size:20px;font-weight:800;color:${T.text};margin-bottom:3px;line-height:1.1;letter-spacing:-.01em;}
  .section-sub{font-size:12px;color:#A0A0A0;margin-bottom:16px;letter-spacing:.02em;}
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

  .check-row{display:flex;align-items:center;gap:12px;padding:10px 14px;background:${T.bg2};border-radius:12px;margin-bottom:6px;border:1px solid ${T.border};box-shadow:inset 0 1px 0 rgba(255,255,255,.025);transition:transform .12s,border-color .12s;}
  .check-row:active{transform:scale(.99);border-color:${T.borderHi};}
  .check-row-icon{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;}
  .check-row-body{flex:1;min-width:0;}
  .check-row-title{font-size:13px;font-weight:600;color:${T.text};}
  .check-row-progress{font-size:11px;color:${T.textDim};margin-top:2px;display:flex;align-items:center;gap:6px;}
  .check-row-bar{flex:1;height:3px;background:${T.border};border-radius:2px;overflow:hidden;}
  .check-row-fill{height:100%;border-radius:2px;transition:width .4s;}
  .check-row-pct{font-size:12px;font-weight:600;color:${T.text};flex-shrink:0;}

  .tiles{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;}
  .tile{background:${T.bg2};border-radius:12px;padding:12px;border:1px solid ${T.border};box-shadow:inset 0 1px 0 rgba(255,255,255,.025);transition:transform .12s,border-color .12s;}
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

  .item{display:flex;align-items:center;gap:12px;padding:12px 14px;background:${T.bg2};border-radius:12px;margin-bottom:6px;border:1px solid ${T.border};box-shadow:inset 0 1px 0 rgba(255,255,255,.025);transition:transform .12s,border-color .12s;}
  .item:active{transform:scale(.99);border-color:${T.borderHi};}
  .item-icon{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;}
  .item-body{flex:1;min-width:0;}
  .item-title{font-size:14px;font-weight:600;color:${T.text};margin-bottom:1px;}
  .item-sub{font-size:12px;color:${T.textDim};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .item-arrow{color:${T.textMute};font-size:18px;flex-shrink:0;}

  .btn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;min-height:50px;padding:13px;border-radius:13px;border:none;font-size:15px;font-weight:700;transition:transform .12s,opacity .12s,background .12s;letter-spacing:.01em;}
  .btn:disabled{opacity:.4;}
  .btn:active{transform:scale(.98);}
  .btn-primary{background:linear-gradient(135deg,#FF6B00 0%,#E8390A 100%);color:white;box-shadow:0 4px 16px rgba(232,57,10,.28),inset 0 1px 0 rgba(255,255,255,.18);}
  .btn-primary:active{background:linear-gradient(135deg,#D45A00 0%,#C02808 100%);}
  .btn-ghost{background:${T.bg2};color:${T.text};border:1px solid ${T.border};}
  .btn-sm{padding:8px 14px;font-size:13px;}
  .btn-fab{position:absolute;bottom:80px;right:14px;width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#FF6B00,#E8390A);color:white;border:none;font-size:24px;box-shadow:0 8px 24px rgba(232,57,10,.5);z-index:49;display:flex;align-items:center;justify-content:center;transition:transform .15s;}
  .btn-fab:active{transform:scale(.92);}

  .dial{display:flex;align-items:center;gap:4px;background:${T.bg1};border-radius:11px;padding:3px;border:1px solid ${T.border};}
  .dial-arrow{width:38px;height:40px;flex-shrink:0;border-radius:8px;border:none;background:transparent;color:${T.textDim};font-size:17px;font-weight:600;display:flex;align-items:center;justify-content:center;}
  .dial-arrow:active{background:${T.bg2};}
  .dial-vals{display:flex;flex:1;gap:3px;}
  .dial-val{flex:1;height:40px;border-radius:8px;border:none;background:transparent;color:${T.textDim};font-size:14px;font-weight:600;display:flex;align-items:center;justify-content:center;transition:all .12s;}
  .dial-val.sel{background:${T.text};color:${T.bg0};font-weight:700;}
  .dial-val.sel.good{background:${T.good};color:${T.bg0};}
  .dial-val.sel.warn{background:${T.warn};color:${T.bg0};}
  .dial-val.sel.bad{background:${T.bad};color:${T.bg0};}

  .binary{display:grid;grid-template-columns:1fr 1fr;gap:6px;}
  .binary-btn{height:46px;border-radius:10px;border:1.5px solid ${T.border};background:${T.bg2};color:${T.textDim};font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:6px;transition:all .12s;}
  .binary-btn:active{transform:scale(.97);}
  .binary-btn.sel.good{background:${T.goodBg};border-color:${T.good};color:${T.good};}
  .binary-btn.sel.bad{background:${T.badBg};border-color:${T.bad};color:${T.bad};}
  .binary-btn.sel.neutral{background:${T.bg3};border-color:${T.text};color:${T.text};}

  .seg{display:flex;background:${T.bg1};border-radius:10px;padding:3px;border:1px solid ${T.border};}
  .seg-btn{flex:1;height:32px;border:none;background:transparent;border-radius:7px;color:${T.textDim};font-size:12px;font-weight:600;transition:all .12s;}
  .seg-btn.sel{background:linear-gradient(135deg,#FF6B00,#E8390A);color:white;}

  .chips{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;}
  .chips::-webkit-scrollbar{display:none;}
  .chip{flex-shrink:0;padding:7px 14px;border-radius:999px;background:${T.bg2};color:${T.textDim};border:1px solid ${T.border};font-size:13px;font-weight:600;white-space:nowrap;transition:all .12s;}
  .chip.sel{background:linear-gradient(135deg,#FF6B00,#E8390A);color:white;border-color:#E8390A;}

  .field{margin-bottom:14px;}
  .label{display:block;font-size:11px;font-weight:700;color:${T.textDim};margin-bottom:6px;text-transform:uppercase;letter-spacing:.07em;}
  .input{width:100%;padding:12px 14px;border:1px solid ${T.border};border-radius:10px;font-size:16px;font-family:inherit;outline:none;background:${T.bg2};color:${T.text};transition:border-color .15s,box-shadow .15s;}
  .input:focus{border-color:#E8390A;box-shadow:0 0 0 2px rgba(232,57,10,.12);}
  .input option{background:${T.bg1};}
  .input-sm{padding:9px 12px;font-size:16px;}

  @keyframes overlayIn{from{opacity:0;}to{opacity:1;}}
  @keyframes sheetIn{from{transform:translateY(100%);}to{transform:translateY(0);}}
  .overlay{position:fixed;inset:0;background:rgba(0,0,0,.65);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:100;display:flex;align-items:flex-end;justify-content:center;animation:overlayIn 200ms ease-out;}
  .sheet{background:${T.bg1};width:100%;max-width:480px;border-radius:24px 24px 0 0;padding:20px 18px calc(24px + env(safe-area-inset-bottom));max-height:88vh;overflow-y:auto;animation:sheetIn 300ms cubic-bezier(0.32,0.72,0,1);border-top:1px solid ${T.borderHi};box-shadow:0 -20px 60px rgba(0,0,0,.5);}
  .sheet-handle{width:36px;height:4px;background:${T.textMute};border-radius:2px;margin:0 auto 16px;}
  .sheet-title{font-family:'Inter',sans-serif;font-size:20px;font-weight:800;margin-bottom:16px;color:${T.text};}

  .temp-slot{flex:1;min-height:62px;border-radius:11px;border:1.5px solid ${T.border};background:${T.bg1};display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px;transition:all .15s;}
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
  .check{width:28px;height:28px;border-radius:50%;border:2px solid ${T.border};display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s;color:transparent;font-size:14px;}
  .check.on{background:${T.good};border-color:${T.good};color:white;animation:checkPop .28s cubic-bezier(.34,1.56,.64,1);}
  @keyframes checkPop{0%{transform:scale(.7);}55%{transform:scale(1.15);}100%{transform:scale(1);}}
  .scan{border:1.5px dashed ${T.accent};border-radius:14px;padding:24px 18px;text-align:center;background:${T.accentLt};margin-bottom:14px;}
  .scan-icon{font-size:34px;margin-bottom:6px;}
  .scan-title{font-size:15px;font-weight:700;color:${T.text};margin-bottom:3px;}
  .scan-sub{font-size:12px;color:${T.textDim};}

  .login-screen{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;min-height:100dvh;padding:32px 20px;background:${T.bg0};width:100%;max-width:480px;margin:0 auto;}
  .login-logo{font-family:'Inter',sans-serif;font-size:44px;font-weight:900;letter-spacing:.28em;text-transform:uppercase;margin-bottom:6px;text-align:center;width:100%;}
  .login-logo .flame{background:linear-gradient(135deg,#FF6B00 0%,#E8390A 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;color:transparent;}
  .login-tagline{font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:${T.textDim};margin-bottom:44px;text-align:center;width:100%;}
  .login-body{width:100%;max-width:340px;}
  .login-prompt{font-size:13px;color:${T.textDim};margin-bottom:14px;text-align:center;}
  .role-btn{width:100%;padding:16px;border-radius:12px;border:1px solid ${T.border};background:${T.bg2};color:${T.text};text-align:left;transition:border-color .15s;margin-bottom:8px;}
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
  .tab.active{background:linear-gradient(135deg,#FF6B00,#E8390A);color:white;border-color:#E8390A;}

  .mult-row{display:flex;align-items:center;gap:10px;background:${T.bg1};border-radius:12px;padding:10px;margin-bottom:12px;border:1px solid ${T.border};}
  .mult-label{font-size:11px;color:${T.textDim};font-weight:600;text-transform:uppercase;letter-spacing:.06em;flex-shrink:0;}
  .mult-btn{width:36px;height:36px;border-radius:9px;background:${T.bg2};border:1px solid ${T.border};color:${T.text};font-size:18px;font-weight:600;flex-shrink:0;}
  .mult-val{flex:1;text-align:center;font-family:'Inter',sans-serif;font-size:22px;font-weight:800;color:${T.text};font-variant-numeric:tabular-nums;letter-spacing:-.02em;}

  .row{display:flex;align-items:center;}
  .between{display:flex;align-items:center;justify-content:space-between;}
  .gap6{gap:6px;}.gap8{gap:8px;}.gap10{gap:10px;}.gap12{gap:12px;}
  .mt4{margin-top:4px;}.mt6{margin-top:6px;}.mt8{margin-top:8px;}.mt12{margin-top:12px;}.mt14{margin-top:14px;}
  .mb4{margin-bottom:4px;}.mb6{margin-bottom:6px;}.mb8{margin-bottom:8px;}.mb12{margin-bottom:12px;}.mb14{margin-bottom:14px;}
  .text-sm{font-size:12px;}.text-xs{font-size:11px;}.text-dim{color:${T.textDim};}.text-mute{color:${T.textMute};}
  .fw6{font-weight:600;}.fw7{font-weight:700;}.center{text-align:center;}
  .empty{text-align:center;padding:36px 18px;background:${T.bg2};border-radius:14px;border:1px solid ${T.border};}
  .empty-icon{font-size:38px;margin-bottom:10px;opacity:.6;}
  .empty-title{font-size:16px;font-weight:700;color:${T.text};margin-bottom:4px;}
  .empty-sub{font-size:13px;color:${T.textDim};}
  .pbar{height:5px;background:${T.border};border-radius:3px;overflow:hidden;}
  .pfill{height:100%;border-radius:3px;transition:width .4s;}
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
  const ping=()=>{haptic(10);setShow(true);setTimeout(()=>setShow(false),1400);};
  const node = show ? <div className="save-toast">✓ Enregistré</div> : null;
  return {ping,node};
}

function TapDial({value,onChange,center,step=1,colorFn,format=(v)=>`${v}°`}){
  const [offset,setOffset]=useState(0);
  const vals=[center-2*step+offset,center-step+offset,center+offset,center+step+offset,center+2*step+offset];
  return(<div className="dial"><button className="dial-arrow" onClick={()=>{haptic(6);setOffset(o=>o-step);}}>‹</button><div className="dial-vals">{vals.map((v,i)=>{const cls=colorFn?colorFn(v):"";return(<button key={i} className={`dial-val ${value===v?"sel":""} ${value===v?cls:""}`} onClick={()=>{haptic(10);onChange(v);}}>{format(v)}</button>);})}</div><button className="dial-arrow" onClick={()=>{haptic(6);setOffset(o=>o+step);}}>›</button></div>);
}
function BinaryChoice({value,onChange,options}){return(<div className="binary">{options.map(o=><button key={o.value} className={`binary-btn ${value===o.value?"sel":""} ${o.style||"neutral"}`} onClick={()=>{haptic(10);onChange(o.value);}}>{o.icon&&<span>{o.icon}</span>} {o.label}</button>)}</div>);}
function SegmentedControl({value,onChange,options}){return(<div className="seg">{options.map(o=><button key={o.value} className={`seg-btn ${value===o.value?"sel":""}`} onClick={()=>{haptic(8);onChange(o.value);}}>{o.label}</button>)}</div>);}
function QuickPick({value,onChange,options}){return(<div className="chips">{options.map(o=><button key={o.value} className={`chip ${value===o.value?"sel":""}`} onClick={()=>{haptic(8);onChange(o.value);}}>{o.label}</button>)}</div>);}

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
    coolingMax:120,freezingMax:240,reheatMin:63,reheatMaxTime:60,oilPolarMax:25,testMealDays:3,labelDlcDefault:3,
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
  traceability:[
    {id:1,product:"Saumon Gravlax",emoji:"🐟",supplier:"Marée Pêche Bretagne",lot:"SP2605A",dlc:"13/05",qty:"2 kg",allergenes:["Poisson"],status:"ok"},
    {id:2,product:"Bœuf Angus",emoji:"🥩",supplier:"Boucherie Dupont",lot:"BA0510",dlc:"15/05",qty:"5 kg",allergenes:[],status:"ok"},
    {id:3,product:"Huîtres Tamaris",emoji:"🦪",supplier:"Huîtres Tamaris",lot:"HT4421",dlc:"11/05",qty:"12 dz",allergenes:["Mollusques"],status:"warn"},
    {id:4,product:"Burrata",emoji:"🧀",supplier:"Fromager Italien",lot:"BU990",dlc:"09/05",qty:"800 g",allergenes:["Lait"],status:"expired"},
  ],
  labels:[{id:1,product:"Ratatouille maison",dateProd:"10/05",dlc:"13/05",lot:"L260510-1",allergens:"Aucun",operator:"Marie Dubois"}],
  testMeals:[{id:1,date:"10/05",service:"Midi",product:"Bœuf bourguignon",qty:"100 g",destroyAt:"13/05",operator:"Lucas Martin"}],
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

const haptic=(ms=12)=>{try{if(navigator.vibrate)navigator.vibrate(ms);}catch{}};
const todayStr=()=>new Date().toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit"});
const nowTime=()=>new Date().toTimeString().slice(0,5);
const DAYS=["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];

function tempStatus(v,target){if(target==="-18")return v<=-15?"good":v>-12?"bad":"warn";const[lo,hi]=target.split("–").map(Number);return v>=lo&&v<=hi?"good":v>hi+2?"bad":"warn";}
function tempCenter(target){if(target==="-18")return -18;const[lo,hi]=target.split("–").map(Number);return Math.round((lo+hi)/2);}
function getReleve(data,fridgeId,period,date){return data.fridgeReleves.find(r=>r.fridgeId===fridgeId&&r.period===period&&r.date===(date||todayStr()));}
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
function recipeCostPerPortion(recipe,allRecipes){const total=recipeTotalCost(recipe,allRecipes);if(recipe.type==="plat")return total/(recipe.portions||1);return recipe.yield?total/recipe.yield.qty:total;}
function recipeMargin(recipe,allRecipes){if(recipe.type!=="plat")return null;const cost=recipeCostPerPortion(recipe,allRecipes);return Math.round(((recipe.price-cost)/recipe.price)*100);}
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

function Login({users,onLogin}){
  const[sel,setSel]=useState(null);const[pin,setPin]=useState("");const[err,setErr]=useState("");const[shake,setShake]=useState(false);
  function tryLogin(){const u=users.find(u=>u.id===sel);if(u.pin===pin){haptic(15);onLogin(u);}else{haptic(30);setErr("PIN incorrect");setPin("");setShake(true);setTimeout(()=>setShake(false),450);}}
  return(<div className="login-screen">
    <div className="fade-up" style={{marginBottom:14,display:"flex",justifyContent:"center"}}><FuegoBrand height={104}/></div>
    <div className="login-logo fade-up fade-up-1"><FuegoLogo size="login"/></div>
    <div className="login-tagline fade-up fade-up-2">Le système d'exploitation de votre restaurant</div>
    <div className="login-body fade-up fade-up-3">
    {!sel?<><p className="login-prompt">Qui êtes-vous ?</p>{users.map(u=><button key={u.id} className="role-btn" onClick={()=>setSel(u.id)}><div className="between"><div><div className="role-btn-name">{u.name}</div><div className="role-btn-sub">{u.role}</div></div><span className={`role-badge ${u.isAdmin?"rb-admin":"rb-staff"}`}>{u.isAdmin?"Admin":"Équipe"}</span></div></button>)}</>
    :<><p className="login-prompt">Code PIN pour <b style={{color:T.text}}>{users.find(u=>u.id===sel)?.name}</b></p><div className="field"><input className={`input ${shake?"input-shake":""}`} type="password" inputMode="numeric" maxLength={6} value={pin} onChange={e=>{setPin(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&pin.length>=4&&tryLogin()} placeholder="●●●●" style={{textAlign:"center",fontSize:30,letterSpacing:10,borderColor:shake?T.bad:undefined}} autoFocus/></div>{err&&<p style={{color:T.bad,fontSize:12,marginBottom:10,textAlign:"center"}}>{err}</p>}<button className="btn btn-primary mb8" onClick={tryLogin} disabled={pin.length<4}>Connexion</button><button className="btn btn-ghost" onClick={()=>{setSel(null);setPin("");setErr("");}}>← Retour</button></>}
  </div></div>);
}

function Aujourdhui({data,go,user}){
  const[,setTick]=useState(0);
  useEffect(()=>{const i=setInterval(()=>setTick(t=>t+1),30000);return()=>clearInterval(i);},[]);
  const h=new Date().getHours();const greeting=h<12?"Bonjour":h<18?"Bon après-midi":"Bonsoir";
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
  const tasksTotal=data.tasks.length;const tasksDone=data.tasks.filter(t=>t.done).length;
  const cleanTotal=data.cleaning.length;const cleanDone=data.cleaning.filter(c=>c.done).length;

  const nowItems=[];const upcomingItems=[];
  if(win.id==="morning"){
    if(matinDone<totalFridges)nowItems.push({icon:"☀️",title:"Relevés matin",done:matinDone,total:totalFridges,color:T.warn,goto:"temps"});
    if(tasksDone<tasksTotal)nowItems.push({icon:"✅",title:"Mise en place",done:tasksDone,total:tasksTotal,color:T.accent,goto:"tasks"});
    upcomingItems.push({icon:"🚚",title:"Réception fournisseurs",sub:"Avant 11h",goto:"reception"});
  }else if(win.id==="lunch"||win.id==="dinner"){
    nowItems.push({icon:"🧪",title:"Plats témoins",sub:"Service en cours",color:T.info,goto:"testmeals"});
    upcomingItems.push({icon:"🧹",title:"Nettoyage de fin",sub:`${cleanDone}/${cleanTotal} fait`,goto:"clean"});
  }else if(win.id==="prep_pm"){
    if(tasksDone<tasksTotal)nowItems.push({icon:"✅",title:"Mise en place",done:tasksDone,total:tasksTotal,color:T.accent,goto:"tasks"});
    upcomingItems.push({icon:"🌙",title:"Relevés soir",sub:"Avant 23h",goto:"temps"});
  }else if(win.id==="closing"){
    if(soirDone<totalFridges)nowItems.push({icon:"🌙",title:"Relevés soir",done:soirDone,total:totalFridges,color:T.info,goto:"temps"});
    if(cleanDone<cleanTotal)nowItems.push({icon:"🧹",title:"Nettoyage",done:cleanDone,total:cleanTotal,color:T.good,goto:"clean"});
    upcomingItems.push({icon:"🏷️",title:"Étiquetage produits",goto:"labels"});
  }

  const allClear=criticalAlerts.length===0&&activeCoolings.length===0&&nowItems.length===0;

  return(<div className="page">
    <div className="greet-block">
      <div className="greet-line"><span className="greet-dot"></span><span>{win.icon} {win.label}</span></div>
      <div className="greet-name">{greeting}, {user.name.split(" ")[0]}</div>
      <div className="greet-context tabular">{today}</div>
    </div>

    {criticalAlerts.length>0&&<div className="urgent-card pulse">
      <div className="urgent-label"><span style={{fontSize:14}}>🚨</span>{criticalAlerts.length===1?"ALERTE CRITIQUE":`${criticalAlerts.length} ALERTES CRITIQUES`}</div>
      <div className="urgent-title">{criticalAlerts[0].title}</div>
      <div className="urgent-sub">{criticalAlerts[0].sub}</div>
      <button className="urgent-cta" onClick={()=>go(criticalAlerts[0].goto)}>Traiter maintenant →</button>
      {criticalAlerts.length>1&&<div style={{marginTop:10,fontSize:11,opacity:.8}}>+ {criticalAlerts.length-1} autre{criticalAlerts.length>2?"s":""} alerte{criticalAlerts.length>2?"s":""}</div>}
    </div>}

    {activeCoolings.length>0&&<>
      <div className="bucket-label"><span className="bucket-label-dot" style={{background:T.warn}}></span>En cours</div>
      {activeCoolings.map(c=>{
        const elMs=Date.now()-c.startedMs;const elMin=Math.floor(elMs/60000);const elSec=Math.floor((elMs%60000)/1000);
        const maxMs=data.haccpSettings.coolingMax*60000;const pct=Math.min((elMs/maxMs)*100,100);
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
      <div className="bucket-label" style={{marginTop:14}}><span className="bucket-label-dot" style={{background:T.accent}}></span>Maintenant</div>
      {nowItems.map((it,i)=>(<div key={i} className="check-row" onClick={()=>go(it.goto)}>
        <div className="check-row-icon" style={{background:`${it.color}22`,color:it.color}}>{it.icon}</div>
        <div className="check-row-body"><div className="check-row-title">{it.title}</div>
          {it.total!==undefined?<div className="check-row-progress"><div className="check-row-bar"><div className="check-row-fill" style={{width:`${(it.done/it.total)*100}%`,background:it.color}}></div></div><span className="text-xs tabular text-dim">{it.done}/{it.total}</span></div>:<div className="check-row-progress">{it.sub}</div>}
        </div>
        {it.total!==undefined&&<div className="check-row-pct tabular">{Math.round((it.done/it.total)*100)}%</div>}
      </div>))}
    </>}

    {upcomingItems.length>0&&<>
      <div className="bucket-label" style={{marginTop:14}}><span className="bucket-label-dot" style={{background:T.textMute}}></span>À venir</div>
      {upcomingItems.map((it,i)=>(<div key={i} className="check-row" onClick={()=>go(it.goto)} style={{opacity:.75}}>
        <div className="check-row-icon" style={{background:T.bg3,color:T.textDim}}>{it.icon}</div>
        <div className="check-row-body"><div className="check-row-title">{it.title}</div><div className="check-row-progress">{it.sub||"À planifier"}</div></div>
        <div className="item-arrow">›</div>
      </div>))}
    </>}

    {allClear&&<div className="empty"><div className="empty-icon">✓</div><div className="empty-title">Tout est sous contrôle</div><div className="empty-sub">Profitez d'un moment de calme</div></div>}

    <div className="bucket-label" style={{marginTop:18}}><span className="bucket-label-dot" style={{background:T.textMute}}></span>Accès rapide</div>
    <div className="tiles">
      <div className="tile" onClick={()=>go("temps")}><div className="tile-icon">🌡️</div><div className="tile-label">Températures</div><div className="tile-value tabular">{matinDone+soirDone}/{totalFridges*2}</div></div>
      <div className="tile" onClick={()=>go("trace")}><div className="tile-icon">📦</div><div className="tile-label">Traçabilité</div><div className="tile-value tabular">{data.traceability.length}</div></div>
      <div className="tile" onClick={()=>go("tasks")}><div className="tile-icon">✅</div><div className="tile-label">Mise en place</div><div className="tile-value tabular">{tasksDone}/{tasksTotal}</div></div>
      <div className="tile" onClick={()=>go("clean")}><div className="tile-icon">🧹</div><div className="tile-label">Nettoyage</div><div className="tile-value tabular">{cleanDone}/{cleanTotal}</div></div>
    </div>
  </div>);
}

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRE HACCP — historique centralisé, filtrable, exportable
// ═══════════════════════════════════════════════════════════════════════════

// Convertit "JJ/MM" (format utilisé partout dans l'app) en objet Date de l'année en cours
function parseAppDate(dstr){
  if(!dstr) return null;
  const [d,m]=dstr.split("/").map(Number);
  if(!d||!m) return null;
  const now=new Date();
  return new Date(now.getFullYear(),m-1,d);
}

// Construit la liste unifiée de tous les événements HACCP datés, triés du plus récent au plus ancien
function buildRegistreEvents(data){
  const ev=[];

  data.fridgeReleves.forEach(r=>{
    const f=data.haccpSettings.fridgeTargets.find(x=>x.id===r.fridgeId);
    if(!f) return;
    const status=tempStatus(r.temp,f.target);
    ev.push({date:r.date,time:r.time,type:"temp",icon:f.icon,title:`${f.name} · ${r.period==="matin"?"Matin":"Soir"}`,detail:`${r.temp}°C (cible ${f.target}°C)`,status,module:"Températures",operator:data.users.find(u=>u.id===r.operatorId)?.name||"—"});
  });

  data.reception.forEach(r=>{
    ev.push({date:r.date,time:"—",type:"reception",icon:"🚚",title:`Réception · ${r.product}`,detail:`${r.supplier||"Fournisseur"} · ${r.temp}°C · Aspect ${r.aspect}`,status:r.tempOk&&r.aspect==="OK"&&r.emballage==="OK"?"good":"bad",module:"Réception",operator:r.signed||"—"});
  });

  data.cooling.forEach(c=>{
    if(c.status==="active") return; // pas encore terminé
    ev.push({date:c.date,time:"—",type:"cooling",icon:"❄️",title:`Refroidissement · ${c.product}`,detail:`${c.startTemp}°C → ${c.endTemp}°C en ${c.duration} min`,status:c.status==="ok"?"good":"bad",module:"Refroidissement",operator:c.operator||"—"});
  });

  data.reheating.forEach(r=>{
    ev.push({date:r.date,time:"—",type:"reheating",icon:"🔥",title:`Remise en T° · ${r.product}`,detail:`${r.endTemp}°C en ${r.duration} min`,status:r.status==="ok"?"good":"bad",module:"Remise en température",operator:r.operator||"—"});
  });

  data.labels.forEach(l=>{
    ev.push({date:l.dateProd,time:"—",type:"label",icon:"🏷️",title:`Étiquette · ${l.product}`,detail:`DLC ${l.dlc} · Lot ${l.lot}`,status:"good",module:"Étiquetage",operator:l.operator||"—"});
  });

  data.testMeals.forEach(m=>{
    ev.push({date:m.date,time:"—",type:"testmeal",icon:"🧪",title:`Plat témoin · ${m.product}`,detail:`${m.service} · Conservation jusqu'au ${m.destroyAt}`,status:"good",module:"Plats témoins",operator:m.operator||"—"});
  });

  data.pests.forEach(p=>{
    ev.push({date:p.date,time:"—",type:"pest",icon:"🐀",title:`Contrôle nuisibles · ${p.type}`,detail:`${p.company||"—"} · Résultat : ${p.result}`,status:p.result==="RAS"?"good":"bad",module:"Nuisibles",operator:"—"});
  });

  data.traceability.forEach(t=>{
    if(t.status==="ok") return; // on ne remonte que les non-conformités dans le registre (le stock OK n'est pas un événement)
    ev.push({date:todayStr(),time:"—",type:"trace",icon:t.emoji||"📦",title:`Non-conformité · ${t.product}`,detail:`Lot ${t.lot} · DLC ${t.dlc}`,status:"bad",module:"Traçabilité",operator:"—"});
  });

  // Tri du plus récent au plus ancien (par date puis heure)
  ev.sort((a,b)=>{
    const da=parseAppDate(a.date), db_=parseAppDate(b.date);
    if(da&&db_&&da.getTime()!==db_.getTime()) return db_-da;
    return (b.time||"").localeCompare(a.time||"");
  });
  return ev;
}

function Registre({data}){
  const[period,setPeriod]=useState("7j"); // 7j | 30j | mois | tout
  const[moduleFilter,setModuleFilter]=useState("tous");
  const[statusFilter,setStatusFilter]=useState("tous");
  const[showExport,setShowExport]=useState(false);

  const allEvents=useMemo(()=>buildRegistreEvents(data),[data]);

  const now=new Date();
  const cutoffs={"7j":7,"30j":30,"mois":31,"tout":99999};
  const filtered=allEvents.filter(e=>{
    const d=parseAppDate(e.date);
    if(period!=="tout"&&d){
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

  // Groupe par date pour affichage en timeline
  const grouped={};
  filtered.forEach(e=>{ (grouped[e.date]=grouped[e.date]||[]).push(e); });
  const dateKeys=Object.keys(grouped).sort((a,b)=>{
    const da=parseAppDate(a), db_=parseAppDate(b);
    if(da&&db_) return db_-da;
    return 0;
  });

  return(<div className="page">
    <div className="section-title">Registre HACCP</div>
    <div className="section-sub">Historique complet · {filtered.length} événement{filtered.length>1?"s":""}</div>

    {/* Résumé conformité */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
      <div className="tile" style={{background:T.goodBg}}><div className="tile-value tabular" style={{color:T.good}}>{nbGood}</div><div className="tile-label">Conformes</div></div>
      <div className="tile" style={{background:T.badBg}}><div className="tile-value tabular" style={{color:T.bad}}>{nbBad}</div><div className="tile-label">Non-conformités</div></div>
    </div>

    {/* Filtres */}
    <div className="group-label">Période</div>
    <QuickPick value={period} onChange={setPeriod} options={[
      {value:"7j",label:"7 jours"},{value:"30j",label:"30 jours"},{value:"mois",label:"Ce mois"},{value:"tout",label:"Tout"},
    ]}/>

    <div className="group-label mt14">Module</div>
    <div className="chips">
      <button className={`chip ${moduleFilter==="tous"?"sel":""}`} onClick={()=>{haptic(8);setModuleFilter("tous");}}>Tous</button>
      {modules.map(m=><button key={m} className={`chip ${moduleFilter===m?"sel":""}`} onClick={()=>{haptic(8);setModuleFilter(m);}}>{m}</button>)}
    </div>

    <div className="group-label mt14">Statut</div>
    <QuickPick value={statusFilter} onChange={setStatusFilter} options={[
      {value:"tous",label:"Tous"},{value:"good",label:"✓ Conformes"},{value:"bad",label:"⚠ Non-conformités"},
    ]}/>

    <button className="btn btn-ghost mt14 mb14" onClick={()=>setShowExport(true)}>📄 Exporter en PDF</button>

    {/* Timeline groupée par jour */}
    {dateKeys.length===0
      ? <div className="empty"><div className="empty-icon">📋</div><div className="empty-title">Aucun événement</div><div className="empty-sub">Ajustez les filtres pour voir l'historique</div></div>
      : dateKeys.map(dateKey=>(
        <div key={dateKey} style={{marginBottom:18}}>
          <div className="bucket-label">{dateKey}</div>
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
        </div>
      ))
    }

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
            <div className="between" style={{padding:"4px 0"}}><span className="text-sm text-dim">Période</span><span className="text-sm fw6">{{"7j":"7 jours","30j":"30 jours","mois":"Ce mois-ci","tout":"Tout l'historique"}[period]}</span></div>
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
    body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:10pt;}
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
  </body></html>`);
  w.document.close();
  setTimeout(()=>{ w.focus(); w.print(); }, 400);
}

function HaccpHub({data,go}){
  const total=data.haccpSettings.fridgeTargets.length;
  const fridgesAlert=data.haccpSettings.fridgeTargets.filter(f=>{const m=getReleve(data,f.id,"matin"),s=getReleve(data,f.id,"soir");return(m&&tempStatus(m.temp,f.target)==="bad")||(s&&tempStatus(s.temp,f.target)==="bad");}).length;
  const cleanOk=data.cleaning.filter(c=>c.done).length;
  const alerts=data.traceability.filter(t=>t.status!=="ok").length;
  const oilAlert=data.oils.filter(o=>o.polaires>=data.haccpSettings.oilPolarMax).length;
  const coolAlert=data.cooling.filter(c=>c.status==="alert").length;
  const trAlert=data.training.filter(t=>new Date(t.haccpExp.split("/").reverse().join("-"))<new Date()).length;
  const groups=[
    {title:"Contrôles quotidiens",items:[
      {key:"temps",icon:"🌡️",bg:T.infoBg,title:"Températures",sub:"Matin et soir, par frigo",badge:fridgesAlert>0?{l:`${fridgesAlert} hors norme`,c:"b-bad"}:{l:"OK",c:"b-good"}},
      {key:"reception",icon:"🚚",bg:T.infoBg,title:"Réception",sub:"Contrôle livraisons",badge:{l:`${data.reception.length} fiches`,c:"b-info"}},
      {key:"cooling",icon:"❄️",bg:T.infoBg,title:"Cellule",sub:"Refroidissement & surgélation",badge:coolAlert>0?{l:`${coolAlert} alerte`,c:"b-bad"}:{l:"OK",c:"b-good"}},
      {key:"reheating",icon:"🔥",bg:T.warnBg,title:"Remise en température",sub:"≥ 63°C en moins d'1h",badge:{l:"Suivi",c:"b-mute"}},
      {key:"oils",icon:"🍟",bg:T.warnBg,title:"Huiles de friture",sub:"Composés polaires < 25%",badge:oilAlert>0?{l:"À changer",c:"b-bad"}:{l:"OK",c:"b-good"}},
    ]},
    {title:"Traçabilité",items:[
      {key:"trace",icon:"📦",bg:T.warnBg,title:"Traçabilité produits",sub:`${data.traceability.length} produits`,badge:alerts>0?{l:`${alerts} alerte`,c:"b-bad"}:{l:"OK",c:"b-good"}},
      {key:"labels",icon:"🏷️",bg:T.goodBg,title:"Étiquetage Brother",sub:"Impression DLC + allergènes",badge:{l:`${data.labels.length}`,c:"b-info"}},
      {key:"testmeals",icon:"🧪",bg:T.infoBg,title:"Plats témoins",sub:`Conservation ${data.haccpSettings.testMealDays}j`,badge:{l:`${data.testMeals.length}`,c:"b-mute"}},
    ]},
    {title:"Hygiène et personnel",items:[
      {key:"clean",icon:"🧹",bg:T.goodBg,title:"Nettoyage",sub:`${cleanOk}/${data.cleaning.length} zones`,badge:cleanOk===data.cleaning.length?{l:"Terminé",c:"b-good"}:{l:"En cours",c:"b-warn"}},
      {key:"pests",icon:"🐀",bg:T.badBg,title:"Nuisibles",sub:"Visites et contrôles",badge:{l:"À jour",c:"b-good"}},
      {key:"training",icon:"🎓",bg:T.infoBg,title:"Formation HACCP",sub:"Attestations",badge:trAlert>0?{l:`${trAlert} expiré`,c:"b-bad"}:{l:"OK",c:"b-good"}},
    ]},
  ];
  return(<div className="page"><div className="section-title">HACCP</div><div className="section-sub">Plan de Maîtrise Sanitaire</div>
    <div className="item" onClick={()=>go("registre")} style={{background:"linear-gradient(135deg,#1A1A1A,#242424)",border:"1px solid #FF6B00",marginBottom:20}}>
      <div className="item-icon" style={{background:"linear-gradient(135deg,#FF6B00,#E8390A)"}}>📋</div>
      <div className="item-body"><div className="item-title">Registre HACCP</div><div className="item-sub">Historique complet, filtres, export PDF</div></div>
      <span className="item-arrow">›</span>
    </div>
    {groups.map(g=>(<div key={g.title} style={{marginBottom:20}}><div className="bucket-label">{g.title}</div>{g.items.map(it=><div key={it.key} className="item" onClick={()=>go(it.key)}><div className="item-icon" style={{background:it.bg}}>{it.icon}</div><div className="item-body"><div className="item-title">{it.title}</div><div className="item-sub">{it.sub}</div></div><span className={`badge ${it.badge.c}`}>{it.badge.l}</span></div>)}</div>))}
  </div>);
}

function Temperatures({data,setData,user,db,reload}){
  const[editing,setEditing]=useState(null);const[pickedTemp,setPickedTemp]=useState(null);
  function openSlot(f,p){const e=getReleve(data,f.id,p);setEditing({fridge:f,period:p});setPickedTemp(e?e.temp:tempCenter(f.target));}
  async function save(){if(!editing||pickedTemp===null)return;const date=todayStr();await db.saveReleve({fridgeId:editing.fridge.id,date,period:editing.period,temp:pickedTemp,time:nowTime(),operatorId:user.id});await reload();setEditing(null);setPickedTemp(null);}
  function cancel(){setEditing(null);setPickedTemp(null);}
  const userById=id=>data.users.find(u=>u.id===id);
  const allBad=data.haccpSettings.fridgeTargets.filter(f=>{const m=getReleve(data,f.id,"matin"),s=getReleve(data,f.id,"soir");return(m&&tempStatus(m.temp,f.target)==="bad")||(s&&tempStatus(s.temp,f.target)==="bad");});
  return(<div className="page"><div className="section-title">Températures</div><div className="section-sub">Un relevé matin et un soir, par frigo</div>
    {allBad.length>0&&<div className="urgent-card" style={{padding:"12px 14px",margin:"0 0 12px"}}><div className="urgent-label" style={{marginBottom:4}}>🚨 {allBad.length} frigo{allBad.length>1?"s":""} hors norme</div><div style={{fontSize:12,opacity:.9}}>Vérification immédiate requise</div></div>}
    {data.haccpSettings.fridgeTargets.map(f=>{
      const m=getReleve(data,f.id,"matin"),s=getReleve(data,f.id,"soir");
      const mOp=m?userById(m.operatorId):null,sOp=s?userById(s.operatorId):null;
      const mC=m?tempStatus(m.temp,f.target):"",sC=s?tempStatus(s.temp,f.target):"";
      return(<div key={f.id} className="card">
        <div className="between mb12"><div className="row gap10"><div style={{fontSize:24}}>{f.icon}</div><div><div className="item-title">{f.name}</div><div className="text-xs text-dim">Cible : {f.target}°C</div></div></div></div>
        <div className="row gap8">
          <button className={`temp-slot ${m?mC:"empty"}`} onClick={()=>openSlot(f,"matin")}><div className="temp-slot-period">☀️ Matin</div>{m?<><div className="temp-slot-val tabular">{m.temp}°</div><div className="temp-slot-meta tabular">{m.time} · {mOp?.initials}</div></>:<div className="temp-slot-cta">+ Relever</div>}</button>
          <button className={`temp-slot ${s?sC:"empty"}`} onClick={()=>openSlot(f,"soir")}><div className="temp-slot-period">🌙 Soir</div>{s?<><div className="temp-slot-val tabular">{s.temp}°</div><div className="temp-slot-meta tabular">{s.time} · {sOp?.initials}</div></>:<div className="temp-slot-cta">+ Relever</div>}</button>
        </div>
      </div>);
    })}
    {editing&&<div className="overlay" onClick={cancel}><div className="sheet" onClick={e=>e.stopPropagation()}>
      <div className="sheet-handle"></div>
      <div className="sheet-title">{editing.fridge.icon} {editing.fridge.name}</div>
      <div className="text-sm text-dim mb14">Relevé {editing.period} · Cible : {editing.fridge.target}°C</div>
      <div className="field"><label className="label">Température</label><TapDial value={pickedTemp} onChange={setPickedTemp} center={tempCenter(editing.fridge.target)} colorFn={v=>tempStatus(v,editing.fridge.target)}/></div>
      {pickedTemp!==null&&tempStatus(pickedTemp,editing.fridge.target)==="bad"&&<div className="banner banner-bad mb12"><span>🚨</span><div><b>Hors norme.</b> Vérifier le frigo, transférer les produits si nécessaire.</div></div>}
      <div className="text-xs text-dim mb12 center">Signé : <b style={{color:T.text}}>{user.name}</b> à {nowTime()}</div>
      <button className="btn btn-primary mb8" onClick={save}>✓ Enregistrer</button>
      <button className="btn btn-ghost" onClick={cancel}>Annuler</button>
    </div></div>}
  </div>);
}

function Reception({data,setData,user,db,reload}){
  const[show,setShow]=useState(false);const[temp,setTemp]=useState(3);const[aspect,setAspect]=useState("OK");const[emb,setEmb]=useState("OK");
  const[form,setForm]=useState({supplier:"",product:"",qty:"",dlc:"",lot:""});
  async function save(){if(!form.product)return;await db.addReception({date:todayStr(),supplier:form.supplier,product:form.product,qty:form.qty,dlc:form.dlc,lot:form.lot,temp,tempOk:temp<=4,aspect,emballage:emb,signed:user.name});await reload();setShow(false);setTemp(3);setAspect("OK");setEmb("OK");setForm({supplier:"",product:"",qty:"",dlc:"",lot:""});}
  return(<div className="page"><div className="section-title">Réception</div><div className="section-sub">Contrôle de chaque livraison</div>
    {data.reception.map(r=><div key={r.id} className="card">
      <div className="between mb6"><div><div className="item-title">{r.product}</div><div className="item-sub">{r.supplier} · {r.qty}</div></div><span className={`badge ${r.tempOk?"b-good":"b-bad"} tabular`}>{r.temp}°C</span></div>
      <div className="row gap6 mb6" style={{flexWrap:"wrap"}}><span className={`badge ${r.aspect==="OK"?"b-good":"b-bad"}`}>Aspect {r.aspect}</span><span className={`badge ${r.emballage==="OK"?"b-good":"b-bad"}`}>Emb. {r.emballage}</span><span className="badge b-mute">{r.signed}</span></div>
      <div className="text-xs text-dim">DLC {r.dlc} · Lot {r.lot} · {r.date}</div>
    </div>)}
    <button className="btn-fab" onClick={()=>setShow(true)}>+</button>
    {show&&<div className="overlay" onClick={()=>setShow(false)}><div className="sheet" onClick={e=>e.stopPropagation()}>
      <div className="sheet-handle"></div><div className="sheet-title">Nouvelle réception</div>
      <div className="field"><label className="label">Produit</label><input className="input" value={form.product} onChange={e=>setForm({...form,product:e.target.value})} placeholder="ex : Saumon frais" autoFocus/></div>
      <div className="field"><label className="label">Fournisseur</label><input className="input" value={form.supplier} onChange={e=>setForm({...form,supplier:e.target.value})}/></div>
      <div className="row gap8 mb14"><div style={{flex:1}}><label className="label">Quantité</label><input className="input input-sm" value={form.qty} onChange={e=>setForm({...form,qty:e.target.value})}/></div><div style={{flex:1}}><label className="label">N° lot</label><input className="input input-sm" value={form.lot} onChange={e=>setForm({...form,lot:e.target.value})}/></div></div>
      <div className="field"><label className="label">DLC</label><input className="input" type="date" value={form.dlc} onChange={e=>setForm({...form,dlc:e.target.value})}/></div>
      <div className="field"><label className="label">Température à réception</label><TapDial value={temp} onChange={setTemp} center={3} colorFn={v=>v<=4?"good":v<=6?"warn":"bad"}/>{temp>4&&<div className="text-xs mt6" style={{color:T.bad}}>⚠ Hors norme</div>}</div>
      <div className="field"><label className="label">Aspect</label><BinaryChoice value={aspect} onChange={setAspect} options={[{value:"OK",label:"Conforme",icon:"✓",style:"good"},{value:"NON CONFORME",label:"Non conforme",icon:"✗",style:"bad"}]}/></div>
      <div className="field"><label className="label">Emballage</label><BinaryChoice value={emb} onChange={setEmb} options={[{value:"OK",label:"Intact",icon:"✓",style:"good"},{value:"ENDOMMAGÉ",label:"Endommagé",icon:"✗",style:"bad"}]}/></div>
      <button className="btn btn-primary mt8" onClick={save} disabled={!form.product}>Enregistrer</button>
    </div></div>}
  </div>);
}

// Deux modes de passage en cellule, avec cibles et DLC réglementaires distinctes
const CELL_MODES = {
  refroid: { key:"refroid", label:"Refroidissement", icon:"❄️", sub:"63°C → 10°C à cœur", targetEnd:10, startCenter:65, endCenter:8, dlcMonths:0 },
  surgel:  { key:"surgel",  label:"Surgélation",     icon:"🧊", sub:"jusqu'à −18°C à cœur", targetEnd:-18, startCenter:65, endCenter:-18, dlcMonths:6 },
};
function Cooling({data,setData,user,db,reload}){
  const[show,setShow]=useState(false);const[step,setStep]=useState(0);
  const[mode,setMode]=useState("refroid");
  const[form,setForm]=useState({product:"",qty:""});const[startTemp,setStartTemp]=useState(65);const[endTemp,setEndTemp]=useState(8);
  const[startMs,setStartMs]=useState(null);const[elapsed,setElapsed]=useState(0);
  const[activeCoolingId,setActiveCoolingId]=useState(null);
  const M=CELL_MODES[mode];
  const maxMin=mode==="surgel"?(data.haccpSettings.freezingMax||240):data.haccpSettings.coolingMax;
  useEffect(()=>{if(step!==2)return;const i=setInterval(()=>setElapsed(Math.floor((Date.now()-startMs)/1000)),1000);return()=>clearInterval(i);},[step,startMs]);
  const fmt=s=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  const overtime=elapsed>maxMin*60;const progress=startMs?Math.min(elapsed/(maxMin*60)*100,100):0;
  async function start(){const r=await db.startCooling({product:form.product,qty:form.qty,startTemp,startedMs:Date.now(),operator:user.name,date:todayStr()});if(r.data)setActiveCoolingId(r.data.id);setStartMs(Date.now());setElapsed(0);setStep(2);await reload();}
  async function finish(){const dur=Math.floor(elapsed/60);const conform=mode==="surgel"?(endTemp<=-18):(dur<=maxMin&&endTemp<=10);const status=conform?"ok":"alert";
    const dlc=M.dlcMonths
      ? (()=>{const d=new Date();d.setMonth(d.getMonth()+M.dlcMonths);return d.toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"2-digit"});})()
      : new Date(Date.now()+data.haccpSettings.labelDlcDefault*86400000).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit"});
    if(activeCoolingId)await db.finishCooling(activeCoolingId,{endTemp,duration:dur,status,dlc,mode});await reload();setShow(false);setStep(0);setMode("refroid");setStartMs(null);setElapsed(0);setStartTemp(65);setEndTemp(8);setForm({product:"",qty:""});setActiveCoolingId(null);}
  return(<div className="page"><div className="section-title">Cellule</div><div className="section-sub">Refroidissement & surgélation</div>
    {data.cooling.filter(c=>c.status!=="active").map(c=>{const cm=CELL_MODES[c.mode||"refroid"];const okTemp=(c.mode==="surgel")?c.endTemp<=-18:c.endTemp<=10;return(<div key={c.id} className="card">
      <div className="between mb6"><div><div className="item-title">{cm.icon} {c.product}</div><div className="item-sub">{cm.label} · {c.qty} · {c.date}</div></div><span className={`badge ${c.status==="ok"?"b-good":"b-bad"}`}>{c.status==="ok"?"✓ OK":"⚠"}</span></div>
      <div className="row gap12" style={{flexWrap:"wrap"}}><div><div className="text-xs text-dim">Départ</div><div className="text-sm fw7 tabular">{c.startTemp}°C</div></div><div><div className="text-xs text-dim">Arrivée</div><div className="text-sm fw7 tabular" style={{color:okTemp?T.good:T.bad}}>{c.endTemp}°C</div></div><div><div className="text-xs text-dim">Durée</div><div className="text-sm fw7 tabular" style={{color:c.duration<=maxMin?T.good:T.bad}}>{c.duration} min</div></div></div>
      <div className="text-xs text-dim mt6">DLC : {c.dlc} · {c.operator}</div>
    </div>);})}
    <button className="btn-fab" onClick={()=>{setStep(0);setMode("refroid");setShow(true);}}>+</button>
    {show&&<div className="overlay" onClick={()=>step<=1&&setShow(false)}><div className="sheet" onClick={e=>e.stopPropagation()}>
      <div className="sheet-handle"></div>
      {step===0&&<><div className="sheet-title">Passage en cellule</div>
        <div className="text-sm text-dim center mb14">Quel type d'opération ?</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:8}}>
          {Object.values(CELL_MODES).map(cm=>(
            <button key={cm.key} onClick={()=>{haptic(10);setMode(cm.key);setEndTemp(cm.endCenter);setStep(1);}}
              style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,padding:"22px 10px",borderRadius:16,border:`1.5px solid ${T.border}`,background:T.bg2,color:T.text,cursor:"pointer"}}>
              <span style={{fontSize:34}}>{cm.icon}</span>
              <span style={{fontSize:14,fontWeight:800}}>{cm.label}</span>
              <span style={{fontSize:10.5,color:T.textDim,textAlign:"center",lineHeight:1.2}}>{cm.sub}</span>
            </button>
          ))}
        </div></>}
      {step===1&&<><div className="sheet-title">{M.icon} {M.label}</div>
        <div className="text-xs text-dim center mb12">{M.sub}{M.dlcMonths?` · DLC +${M.dlcMonths} mois`:""}</div>
        <div className="field"><label className="label">Produit</label><input className="input" value={form.product} onChange={e=>setForm({...form,product:e.target.value})} autoFocus/></div>
        <div className="field"><label className="label">Quantité</label><input className="input" value={form.qty} onChange={e=>setForm({...form,qty:e.target.value})}/></div>
        <div className="field"><label className="label">Température de départ</label><TapDial value={startTemp} onChange={setStartTemp} center={65} step={2} colorFn={v=>v>=63?"good":"warn"}/></div>
        <div className="row gap8"><button className="btn btn-ghost" style={{flex:"0 0 auto",width:52}} onClick={()=>setStep(0)}>←</button><button className="btn btn-primary" style={{flex:1}} onClick={start} disabled={!form.product}>▶ Lancer le chronomètre</button></div></>}
      {step===2&&<><div className="sheet-title center">{form.product}</div>
        <div className="text-sm text-dim center mb6">Départ : {startTemp}°C · Limite : {maxMin} min</div>
        <div className="timer-display tabular" style={{color:overtime?T.bad:elapsed>maxMin*60*.75?T.warn:T.text}}>{fmt(elapsed)}</div>
        <div className="center mb12"><span style={{fontSize:12,fontWeight:600,color:overtime?T.bad:elapsed>maxMin*60*.75?T.warn:T.good}}>{overtime?"⚠ Limite dépassée":elapsed>maxMin*60*.75?"⚠ Bientôt la limite":"✓ Dans les temps"}</span></div>
        <div className="pbar mb12"><div className="pfill" style={{width:`${progress}%`,background:overtime?T.bad:elapsed>maxMin*60*.75?T.warn:T.good}}></div></div>
        <button className="btn btn-primary" onClick={()=>setStep(3)}>⏹ Relever la T° finale</button></>}
      {step===3&&<><div className="sheet-title">Température finale</div>
        <div className="text-sm text-dim mb12">Durée : <b style={{color:T.text}}>{Math.floor(elapsed/60)} min</b></div>
        {mode==="surgel"
          ? <div className="field"><label className="label">T° à cœur — cible ≤ −18°C</label><TapDial value={endTemp} onChange={setEndTemp} center={-18} step={2} colorFn={v=>v<=-18?"good":"bad"}/></div>
          : <div className="field"><label className="label">T° à cœur — cible ≤ 10°C</label><TapDial value={endTemp} onChange={setEndTemp} center={8} colorFn={v=>v<=10?"good":"bad"}/></div>}
        {mode==="surgel"&&endTemp>-18&&<div className="banner banner-bad mb12"><span>⚠️</span><div><b>Non conforme.</b> Poursuivre la surgélation.</div></div>}
        {mode==="surgel"&&endTemp<=-18&&<div className="banner banner-good mb12"><span>✓</span><div><b>Conforme.</b> Surgelé · DLC +6 mois.</div></div>}
        {mode==="refroid"&&endTemp>10&&<div className="banner banner-bad mb12"><span>⚠️</span><div><b>Non conforme.</b> Remettre en cuisson ou jeter.</div></div>}
        {mode==="refroid"&&endTemp<=10&&elapsed<=maxMin*60&&<div className="banner banner-good mb12"><span>✓</span><div><b>Conforme.</b> DLC J+{data.haccpSettings.labelDlcDefault}.</div></div>}
        <button className="btn btn-primary" onClick={finish}>Enregistrer</button></>}
    </div></div>}
  </div>);
}

function Reheating({data,setData,user,db,reload}){
  const[show,setShow]=useState(false);const[form,setForm]=useState({product:""});const[endTemp,setEndTemp]=useState(65);const[duration,setDuration]=useState(30);
  const{reheatMin,reheatMaxTime}=data.haccpSettings;
  async function save(){if(!form.product)return;const status=endTemp>=reheatMin&&duration<=reheatMaxTime?"ok":"alert";await db.addReheating({product:form.product,endTemp,duration,operator:user.name,status,date:todayStr()});await reload();setShow(false);setForm({product:""});setEndTemp(65);setDuration(30);}
  return(<div className="page"><div className="section-title">Remise en T°</div><div className="section-sub">≥ {reheatMin}°C en moins de {reheatMaxTime} min</div>
    {data.reheating.map(r=><div key={r.id} className="card">
      <div className="between mb6"><div><div className="item-title">{r.product}</div><div className="item-sub">{r.date} · {r.operator}</div></div><span className={`badge ${r.status==="ok"?"b-good":"b-bad"}`}>{r.status==="ok"?"✓":"⚠"}</span></div>
      <div className="row gap12" style={{flexWrap:"wrap"}}><div><div className="text-xs text-dim">T° finale</div><div className="text-sm fw7 tabular" style={{color:r.endTemp>=reheatMin?T.good:T.bad}}>{r.endTemp}°C</div></div><div><div className="text-xs text-dim">Durée</div><div className="text-sm fw7 tabular" style={{color:r.duration<=reheatMaxTime?T.good:T.bad}}>{r.duration} min</div></div></div>
    </div>)}
    <button className="btn-fab" onClick={()=>setShow(true)}>+</button>
    {show&&<div className="overlay" onClick={()=>setShow(false)}><div className="sheet" onClick={e=>e.stopPropagation()}>
      <div className="sheet-handle"></div><div className="sheet-title">Remise en température</div>
      <div className="field"><label className="label">Produit</label><input className="input" value={form.product} onChange={e=>setForm({...form,product:e.target.value})} autoFocus/></div>
      <div className="field"><label className="label">T° finale à cœur</label><TapDial value={endTemp} onChange={setEndTemp} center={65} colorFn={v=>v>=reheatMin?"good":"bad"}/></div>
      <div className="field"><label className="label">Durée (minutes)</label><TapDial value={duration} onChange={setDuration} center={30} step={5} colorFn={v=>v<=reheatMaxTime?"good":"bad"} format={v=>`${v}'`}/></div>
      {endTemp>=reheatMin&&duration<=reheatMaxTime&&<div className="banner banner-good mb8"><span>✓</span><div><b>Conforme.</b></div></div>}
      <button className="btn btn-primary mt8" onClick={save} disabled={!form.product}>Enregistrer</button>
    </div></div>}
  </div>);
}

function Oils({data,setData,user,db,reload}){
  const[selOil,setSelOil]=useState(null);const[polaires,setPolaires]=useState(15);const[action,setAction]=useState("filtered");
  const max=data.haccpSettings.oilPolarMax;
  async function save(){await db.updateOil(selOil.id,{polaires,operator:user.name,changed:action==="changed",dateInstall:todayStr()});await reload();setSelOil(null);setPolaires(15);setAction("filtered");}
  return(<div className="page"><div className="section-title">Huiles de friture</div><div className="section-sub">Polaires — seuil légal : {max}%</div>
    {data.oils.map(o=>{const danger=o.polaires>=max;const warn=o.polaires>=max-5&&!danger;return(<div key={o.id} className="card">
      <div className="between mb10"><div><div className="item-title">{o.name}</div><div className="item-sub">Huile {o.type} · depuis {o.dateInstall}</div></div><div style={{textAlign:"right"}}><div className="tabular" style={{fontFamily:"'Inter',sans-serif",letterSpacing:"-.03em",fontSize:28,fontWeight:700,lineHeight:1,color:danger?T.bad:warn?T.warn:T.good}}>{o.polaires}%</div><div className="text-xs text-dim">polaires</div></div></div>
      <div className="pbar mb10"><div className="pfill" style={{width:`${Math.min((o.polaires/max)*100,100)}%`,background:danger?T.bad:warn?T.warn:T.good}}></div></div>
      <div className="row gap6 mb10"><span className={`badge ${danger?"b-bad":warn?"b-warn":"b-good"}`}>{danger?"🚨 Changer":warn?"⚠ Surveiller":"✓ OK"}</span><span className="badge b-mute">Test {o.lastTest}</span></div>
      {selOil?.id===o.id?<>
        <div className="field"><label className="label">Composés polaires</label><TapDial value={polaires} onChange={setPolaires} center={15} step={2} colorFn={v=>v<max-5?"good":v<max?"warn":"bad"} format={v=>`${v}%`}/></div>
        <div className="field"><label className="label">Action</label><SegmentedControl value={action} onChange={setAction} options={[{value:"none",label:"Aucune"},{value:"filtered",label:"Filtrée"},{value:"changed",label:"Changée"}]}/></div>
        <div className="row gap6 mt8"><button className="btn btn-ghost btn-sm" style={{flex:1}} onClick={()=>setSelOil(null)}>Annuler</button><button className="btn btn-primary btn-sm" style={{flex:2}} onClick={save}>Enregistrer</button></div>
      </>:<button className="btn btn-primary btn-sm" onClick={()=>{setSelOil(o);setPolaires(15);setAction("filtered");}}>+ Nouveau test</button>}
    </div>);})}
  </div>);
}

function Traceability({data,setData,db,reload}){
  const[show,setShow]=useState(false);const[scanning,setScanning]=useState(false);const[scanOk,setScanOk]=useState(false);const[scanErr,setScanErr]=useState("");
  const[filter,setFilter]=useState("all");
  const[form,setForm]=useState({product:"",supplier:"",lot:"",dlc:"",qty:"",allergenes:""});
  async function handleScan(e){const file=e.target.files[0];if(!file)return;setScanning(true);setScanOk(false);setScanErr("");const reader=new FileReader();reader.onload=async(ev)=>{const b64=ev.target.result.split(",")[1];try{const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:600,messages:[{role:"user",content:[{type:"image",source:{type:"base64",media_type:file.type,data:b64}},{type:"text",text:"Analyse cette etiquette alimentaire. Reponds UNIQUEMENT avec ce JSON : {\"product\":\"\",\"supplier\":\"\",\"lot\":\"\",\"dlc\":\"YYYY-MM-DD\",\"qty\":\"\",\"allergenes\":[]}"}]}]})});const d=await res.json();const raw=d.content&&d.content[0]&&d.content[0].text?d.content[0].text:"{}";const p=JSON.parse(raw.replace(/```json/g,"").replace(/```/g,"").trim());setForm({product:p.product||"",supplier:p.supplier||"",lot:p.lot||"",dlc:p.dlc||"",qty:p.qty||"",allergenes:(p.allergenes||[]).join(", ")});setScanOk(true);}catch{setScanErr("Analyse impossible — remplir manuellement.");}setScanning(false);};reader.readAsDataURL(file);}
  async function save(){if(!form.product)return;await db.addTraceability({product:form.product,emoji:"📦",supplier:form.supplier,lot:form.lot,dlc:form.dlc,qty:form.qty,allergenes:form.allergenes?form.allergenes.split(",").map(a=>a.trim()).filter(Boolean):[],status:"ok"});await reload();setShow(false);setScanOk(false);setScanErr("");setForm({product:"",supplier:"",lot:"",dlc:"",qty:"",allergenes:""});}
  const filtered=filter==="all"?data.traceability:filter==="alerts"?data.traceability.filter(t=>t.status!=="ok"):data.traceability.filter(t=>t.status==="ok");
  return(<div className="page"><div className="section-title">Traçabilité</div><div className="section-sub">{data.traceability.length} produits</div>
    <SegmentedControl value={filter} onChange={setFilter} options={[{value:"all",label:"Tous"},{value:"alerts",label:"⚠ Alertes"},{value:"ok",label:"✓ OK"}]}/>
    <div style={{height:14}}></div>
    {filtered.length===0?<div className="empty"><div className="empty-icon">✓</div><div className="empty-title">Tout est en ordre</div></div>:filtered.map(t=><div key={t.id} className="item"><div className="item-icon" style={{background:t.status==="expired"?T.badBg:t.status==="warn"?T.warnBg:T.infoBg}}>{t.emoji}</div><div className="item-body"><div className="item-title">{t.product}</div><div className="item-sub">{t.supplier} · DLC {t.dlc}</div></div><span className={`badge ${t.status==="ok"?"b-good":t.status==="warn"?"b-warn":"b-bad"}`}>{t.status==="ok"?"OK":t.status==="warn"?"Proche":"Expiré"}</span></div>)}
    <button className="btn-fab" onClick={()=>setShow(true)}>+</button>
    {show&&<div className="overlay" onClick={()=>setShow(false)}><div className="sheet" onClick={e=>e.stopPropagation()}>
      <div className="sheet-handle"></div><div className="sheet-title">Ajouter un produit</div>
      <label className="scan" style={{cursor:"pointer",display:"block"}}><div className="scan-icon">📸</div><div className="scan-title">Scanner l'étiquette</div><div className="scan-sub">L'IA remplit les champs</div><input type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={handleScan}/></label>
      {scanning&&<div className="center" style={{color:T.accent,fontWeight:600,padding:10}}>Analyse en cours…</div>}
      {scanErr&&<div className="banner banner-bad mb12"><span>⚠️</span><div>{scanErr}</div></div>}
      {scanOk&&<div className="banner banner-good mb12"><span>✓</span><div><b>Pré-rempli.</b> Vérifiez.</div></div>}
      <div className="field"><label className="label">Produit</label><input className="input" value={form.product} onChange={e=>setForm({...form,product:e.target.value})}/></div>
      <div className="field"><label className="label">Fournisseur</label><input className="input" value={form.supplier} onChange={e=>setForm({...form,supplier:e.target.value})}/></div>
      <div className="row gap8 mb14"><div style={{flex:1}}><label className="label">Lot</label><input className="input input-sm" value={form.lot} onChange={e=>setForm({...form,lot:e.target.value})}/></div><div style={{flex:1}}><label className="label">Qté</label><input className="input input-sm" value={form.qty} onChange={e=>setForm({...form,qty:e.target.value})}/></div></div>
      <div className="field"><label className="label">DLC</label><input className="input" type="date" value={form.dlc} onChange={e=>setForm({...form,dlc:e.target.value})}/></div>
      <div className="field"><label className="label">Allergènes</label><input className="input" value={form.allergenes} onChange={e=>setForm({...form,allergenes:e.target.value})} placeholder="Gluten, Lait..."/></div>
      <button className="btn btn-primary mt8" onClick={save} disabled={!form.product}>Enregistrer</button>
    </div></div>}
  </div>);
}

function Cleaning({data,setData,db,reload}){
  async function toggle(id){haptic(10);const c=data.cleaning.find(x=>x.id===id);await db.toggleCleaning(id,!c.done);setData(d=>({...d,cleaning:d.cleaning.map(x=>x.id===id?{...x,done:!x.done}:x)}));}
  const done=data.cleaning.filter(c=>c.done).length;const pct=Math.round(done/data.cleaning.length*100);
  return(<div className="page"><div className="section-title">Nettoyage</div><div className="section-sub">{done} / {data.cleaning.length} · {pct}%</div>
    <div className="card mb14"><div className="pbar"><div className="pfill" style={{width:`${pct}%`,background:T.accent}}></div></div></div>
    {data.cleaning.map(c=><div key={c.id} className="item" onClick={()=>toggle(c.id)} style={{opacity:c.done?.6:1}}><div className="item-icon" style={{background:T.bg3}}>{c.icon}</div><div className="item-body"><div className="item-title" style={{textDecoration:c.done?"line-through":"none"}}>{c.zone}</div><div className="item-sub">{c.freq} · {c.produit} · {c.dilution}</div></div><div className={`check ${c.done?"on":""}`}>{c.done?"✓":""}</div></div>)}
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
function printBrotherLabel({product, qty, dateType, startDateStr, dlc, lot, allergens, operator}){
  const dt = dateTypeByKey(dateType||"fabrique");
  const w = window.open("","_blank","width=420,height=420");
  if(!w){ alert("Autorisez les pop-ups pour imprimer"); return; }
  w.document.write(`<html><head><title>Étiquette Fuego</title>
  <style>
    @page { size: 57.15mm 50.8mm; margin: 0; }
    *{box-sizing:border-box;margin:0;padding:0;}
    html,body{width:57.15mm;height:50.8mm;}
    body{font-family:Arial,Helvetica,sans-serif;padding:2mm 3mm;display:flex;flex-direction:column;}
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
  </body></html>`);
  w.document.close();
  setTimeout(()=>{ w.focus(); w.print(); }, 350);
}

function Labels({data,setData,user,db,reload}){
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

  function buildLabel(){
    const lot=`L${new Date().toLocaleDateString("fr-FR").replace(/\//g,"")}-${data.labels.length+1}`;
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
    await db.addLabel({product:label.product,dateProd:label.startDateStr,dlc:label.dlc,lot:label.lot,allergens:label.allergens,operator:user.name,dateType});
    await reload();
    setShow(false); setForm({product:"",allergens:"",qty:""}); setDateType("fabrique"); setStartDate(""); setCustomDlc(null); setCopies(1);
  }

  function reprint(l){
    printBrotherLabel({product:l.product,qty:"",dateType:l.dateType||"fabrique",startDateStr:l.dateProd,dlc:l.dlc,lot:l.lot,allergens:l.allergens,operator:l.operator||user.name});
  }

  return(<div className="page">
    <div className="section-title">Étiquetage</div>
    <div className="section-sub">Brother · 57,15 × 50,8 mm</div>

    <button className="btn btn-primary mb14" onClick={()=>setShow(true)}>🏷️ Nouvelle étiquette</button>

    <div className="bucket-label">Historique</div>
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

      <div className="field"><label className="label">Produit</label><input className="input" value={form.product} onChange={e=>setForm({...form,product:e.target.value})} placeholder="ex : Rôti de bœuf" autoFocus/></div>
      <div className="field"><label className="label">Quantité (optionnel)</label><input className="input" value={form.qty} onChange={e=>setForm({...form,qty:e.target.value})} placeholder="ex : 3 kg"/></div>

      {/* SÉLECTEUR DE TYPE DE DATE — gros boutons visuels */}
      <div className="field"><label className="label">Type d'opération</label>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
          {DATE_TYPES.map(o=>(
            <button key={o.key} onClick={()=>{haptic(10);setDateType(o.key);setCustomDlc(null);}}
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

function TestMeals({data,setData,user,db,reload}){
  const[show,setShow]=useState(false);const[form,setForm]=useState({product:"",service:"Midi",qty:"100 g"});
  const days=data.haccpSettings.testMealDays;
  async function save(){const destroy=new Date(Date.now()+days*86400000).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit"});await db.addTestMeal({date:todayStr(),product:form.product,service:form.service,qty:form.qty,destroyAt:destroy,operator:user.name});await reload();setShow(false);setForm({product:"",service:"Midi",qty:"100 g"});}
  return(<div className="page"><div className="section-title">Plats témoins</div><div className="section-sub">Conservation {days} jours à ≤ 3°C</div>
    {data.testMeals.map(m=>{const expired=new Date(m.destroyAt.split("/").reverse().join("-"))<new Date();return(<div key={m.id} className="card"><div className="between mb6"><div><div className="item-title">{m.product}</div><div className="item-sub">{m.service} · {m.qty}</div></div><span className={`badge ${expired?"b-bad":"b-good"}`}>{expired?"À jeter":"OK"}</span></div><div className="text-xs text-dim">Prélevé {m.date} · Détruire le <b style={{color:T.text}}>{m.destroyAt}</b></div></div>);})}
    <button className="btn-fab" onClick={()=>setShow(true)}>+</button>
    {show&&<div className="overlay" onClick={()=>setShow(false)}><div className="sheet" onClick={e=>e.stopPropagation()}>
      <div className="sheet-handle"></div><div className="sheet-title">Nouveau plat témoin</div>
      <div className="field"><label className="label">Plat</label><input className="input" value={form.product} onChange={e=>setForm({...form,product:e.target.value})} autoFocus/></div>
      <div className="field"><label className="label">Service</label><SegmentedControl value={form.service} onChange={v=>setForm({...form,service:v})} options={[{value:"Midi",label:"☀️ Midi"},{value:"Soir",label:"🌙 Soir"}]}/></div>
      <button className="btn btn-primary mt8" onClick={save} disabled={!form.product}>Enregistrer</button>
    </div></div>}
  </div>);
}

function Pests({data,setData,db,reload}){
  const[show,setShow]=useState(false);const[form,setForm]=useState({type:"Visite contrat",company:"",result:"RAS",nextVisit:""});
  async function save(){await db.addPest({date:todayStr(),type:form.type,company:form.company,result:form.result,nextVisit:form.nextVisit});await reload();setShow(false);setForm({type:"Visite contrat",company:"",result:"RAS",nextVisit:""});}
  return(<div className="page"><div className="section-title">Nuisibles</div><div className="section-sub">Plan de lutte 3D</div>
    {data.pests.map(p=><div key={p.id} className="card"><div className="between mb6"><div><div className="item-title">{p.type}</div><div className="item-sub">{p.company}</div></div><span className={`badge ${p.result==="RAS"?"b-good":"b-warn"}`}>{p.result}</span></div><div className="text-xs text-dim">Visite : {p.date} · Prochaine : {p.nextVisit}</div></div>)}
    <button className="btn-fab" onClick={()=>setShow(true)}>+</button>
    {show&&<div className="overlay" onClick={()=>setShow(false)}><div className="sheet" onClick={e=>e.stopPropagation()}>
      <div className="sheet-handle"></div><div className="sheet-title">Nouvelle intervention</div>
      <div className="field"><label className="label">Type</label><select className="input" value={form.type} onChange={e=>setForm({...form,type:e.target.value})}><option>Visite contrat</option><option>Intervention urgente</option><option>Observation interne</option></select></div>
      <div className="field"><label className="label">Société</label><input className="input" value={form.company} onChange={e=>setForm({...form,company:e.target.value})}/></div>
      <div className="field"><label className="label">Résultat</label><BinaryChoice value={form.result} onChange={v=>setForm({...form,result:v})} options={[{value:"RAS",label:"RAS",icon:"✓",style:"good"},{value:"Présence détectée",label:"Alerte",icon:"⚠",style:"bad"}]}/></div>
      <div className="field"><label className="label">Prochaine visite</label><input className="input" type="date" value={form.nextVisit} onChange={e=>setForm({...form,nextVisit:e.target.value})}/></div>
      <button className="btn btn-primary mt8" onClick={save}>Enregistrer</button>
    </div></div>}
  </div>);
}

function Training({data}){
  return(<div className="page"><div className="section-title">Formation HACCP</div><div className="section-sub">Attestations et visas</div>
    {data.training.map(t=>{const hOk=new Date(t.haccpExp.split("/").reverse().join("-"))>=new Date();const vOk=new Date(t.visaExp.split("/").reverse().join("-"))>=new Date();return(<div key={t.id} className="card"><div className="item-title mb8">{t.name} <span className="text-xs text-dim">· {t.role}</span></div><div className="between mb6"><span className="text-sm">🎓 HACCP</span><span className={`badge ${hOk?"b-good":"b-bad"}`}>{hOk?"Valide":"Expirée"} · {t.haccpExp}</span></div><div className="between"><span className="text-sm">🩺 Visite médicale</span><span className={`badge ${vOk?"b-good":"b-bad"}`}>{vOk?"Valide":"Expirée"} · {t.visaExp}</span></div></div>);})}
  </div>);
}

function RecipeDetail({recipe,allRecipes,onBack,onEdit}){
  const[mult,setMult]=useState(1);
  const cost=recipeTotalCost(recipe,allRecipes);
  const costPerPortion=recipeCostPerPortion(recipe,allRecipes);
  const m=recipeMargin(recipe,allRecipes);
  const allergens=recipeAllergens(recipe,allRecipes);
  const usedIn=recipe.type==="mere"?findUsedIn(recipe.id,allRecipes):[];
  return(<div className="page"><button className="btn btn-ghost mb14" onClick={onBack}>← Retour</button>
    <div className="card"><div style={{fontSize:42,textAlign:"center",marginBottom:8}}>{recipe.emoji}</div><div className="center" style={{fontFamily:"'Inter',sans-serif",letterSpacing:"-.03em",fontSize:22,fontWeight:600,color:T.text}}>{recipe.name}</div><div className="center text-xs text-dim mb14">{recipe.type==="mere"?`🧪 Recette mère · Rendement ${recipe.yield.qty} ${recipe.yield.unit}`:`${recipe.category} · ${recipe.portions} portion${recipe.portions>1?"s":""}`}</div>
      <div className="tiles">
        {recipe.type==="plat"&&<div style={{background:T.infoBg,padding:12,borderRadius:10,textAlign:"center"}}><div className="text-xs text-dim mb6">PRIX</div><div className="tabular" style={{fontFamily:"'Inter',sans-serif",letterSpacing:"-.03em",fontSize:24,fontWeight:700,color:T.info}}>{recipe.price} €</div></div>}
        <div style={{background:m>=70?T.goodBg:T.infoBg,padding:12,borderRadius:10,textAlign:"center"}}><div className="text-xs text-dim mb6">COÛT {recipe.type==="mere"?"TOTAL":"/ PORTION"}</div><div className="tabular" style={{fontFamily:"'Inter',sans-serif",letterSpacing:"-.03em",fontSize:24,fontWeight:700,color:T.text}}>{recipe.type==="mere"?cost.toFixed(2):costPerPortion.toFixed(2)} €</div></div>
        {recipe.type==="plat"&&<div style={{background:m>=70?T.goodBg:T.infoBg,padding:12,borderRadius:10,textAlign:"center"}}><div className="text-xs text-dim mb6">MARGE</div><div className="tabular" style={{fontFamily:"'Inter',sans-serif",letterSpacing:"-.03em",fontSize:24,fontWeight:700,color:m>=70?T.good:T.info}}>{m}%</div></div>}
      </div>
    </div>
    <div className="card"><div className="bucket-label mb8">Mode production</div>
      <div className="mult-row"><span className="mult-label">Multiplier ×</span><button className="mult-btn" onClick={()=>setMult(Math.max(.5,mult-.5))}>−</button><div className="mult-val tabular">{mult}</div><button className="mult-btn" onClick={()=>setMult(mult+.5)}>+</button></div>
      <div className="chips mt8">{[1,2,3,5,10,20].map(v=><button key={v} className={`chip ${mult===v?"sel":""}`} onClick={()=>setMult(v)}>×{v}</button>)}</div>
      {recipe.type==="plat"&&<div className="text-xs text-dim mt8 center">→ <b style={{color:T.text}}>{recipe.portions*mult} portion{recipe.portions*mult>1?"s":""}</b> · Coût : <b style={{color:T.text}}>{(cost*mult).toFixed(2)} €</b></div>}
      {recipe.type==="mere"&&<div className="text-xs text-dim mt8 center">→ <b style={{color:T.text}}>{recipe.yield.qty*mult} {recipe.yield.unit}</b> · Coût : <b style={{color:T.text}}>{(cost*mult).toFixed(2)} €</b></div>}
    </div>
    <div className="card"><div className="bucket-label mb8">Ingrédients</div>
      {recipe.components.map((c,i)=>{const isLast=i===recipe.components.length-1;if(c.kind==="ingredient")return(<div key={i} className="between" style={{padding:"9px 0",borderBottom:isLast?"none":`1px solid ${T.border}`}}><span style={{fontSize:13,color:T.text}}>{c.item}</span><span className="text-xs text-dim tabular">{(c.qty*mult).toFixed(c.qty<10?1:0)} {c.unit} · {(c.cost*mult).toFixed(2)} €</span></div>);const sub=allRecipes.find(r=>r.id===c.subrecipeId);if(!sub)return null;const subUnitCost=recipeTotalCost(sub,allRecipes)/sub.yield.qty;return(<div key={i} className="between" style={{padding:"9px 0",borderBottom:isLast?"none":`1px solid ${T.border}`}}><span style={{fontSize:13,color:T.text}}><span style={{color:T.warn}}>🧪</span> {sub.name} <span className="text-xs text-dim">(recette)</span></span><span className="text-xs text-dim tabular">{(c.qty*mult).toFixed(c.qty<10?1:0)} {c.unit} · {(c.qty*mult*subUnitCost).toFixed(2)} €</span></div>);})}
    </div>
    <div className="card"><div className="bucket-label mb8">Préparation</div>{recipe.steps.map((s,i)=><div key={i} className="row gap10 mb8"><div className="step-num">{i+1}</div><div style={{fontSize:13,paddingTop:4,color:T.text}}>{s}</div></div>)}</div>
    <div className="card"><div className="bucket-label mb8">Allergènes</div>{allergens.length===0?<span className="badge b-mute">Aucun</span>:<div className="row gap6" style={{flexWrap:"wrap"}}>{allergens.map(a=><span key={a} className="badge b-warn">{a}</span>)}</div>}</div>
    {recipe.type==="mere"&&usedIn.length>0&&<div className="card"><div className="bucket-label mb8">Utilisée dans</div>{usedIn.map(r=><div key={r.id} className="row gap8 mb6"><span style={{fontSize:16}}>{r.emoji}</span><span style={{fontSize:13,color:T.text}}>{r.name}</span></div>)}</div>}
    <button className="btn btn-ghost mt8" onClick={onEdit}>✏️ Modifier</button>
  </div>);
}

function RecipeEditor({recipe,allRecipes,products=[],onSave,onCancel}){
  const isEditing=!!recipe;
  const[type,setType]=useState(recipe?.type||"plat");
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
  function addIngredient(){setComponents([...components,{kind:"ingredient",item:"",qty:"",unit:"g",cost:"",productId:null}]);}
  function addSubrecipe(){if(!otherRecipes.length)return alert("Créez d'abord une recette mère");setComponents([...components,{kind:"subrecipe",subrecipeId:otherRecipes[0].id,qty:"",unit:otherRecipes[0].yield.unit}]);}
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
  return(<div className="page"><div className="between mb14"><button className="btn btn-ghost btn-sm" style={{width:"auto"}} onClick={onCancel}>← Annuler</button><button className="btn btn-primary btn-sm" style={{width:"auto"}} onClick={save}>✓ {isEditing?"Mettre à jour":"Créer"}</button></div>
    <div className="section-title">{isEditing?"Modifier":"Nouvelle recette"}</div><div className="section-sub">Coûts calculés automatiquement</div>
    <div className="card">
      <div className="field"><label className="label">Type</label><SegmentedControl value={type} onChange={setType} options={[{value:"plat",label:"Plat servi"},{value:"mere",label:"Recette mère"}]}/></div>
      <div className="row gap8"><div style={{flex:0}}><label className="label">Icône</label><input className="input input-sm" style={{width:60,textAlign:"center"}} value={emoji} onChange={e=>setEmoji(e.target.value)} maxLength={2}/></div><div style={{flex:1}}><label className="label">Nom</label><input className="input input-sm" value={name} onChange={e=>setName(e.target.value)}/></div></div>
      <div style={{height:14}}></div>
      <div className="field"><label className="label">Catégorie</label><input className="input input-sm" value={category} onChange={e=>setCategory(e.target.value)} placeholder={type==="plat"?"ex : Côté Mer":"ex : Bases"}/></div>
      {type==="plat"?<div className="row gap8"><div style={{flex:1}}><label className="label">Prix (€)</label><input className="input input-sm" type="number" step="0.5" value={price} onChange={e=>setPrice(e.target.value)}/></div><div style={{flex:1}}><label className="label">Portions</label><input className="input input-sm" type="number" value={portions} onChange={e=>setPortions(e.target.value)}/></div></div>:<div className="row gap8"><div style={{flex:1}}><label className="label">Rendement</label><input className="input input-sm" type="number" value={yieldQty} onChange={e=>setYieldQty(e.target.value)}/></div><div style={{flex:0,width:80}}><label className="label">Unité</label><select className="input input-sm" value={yieldUnit} onChange={e=>setYieldUnit(e.target.value)}><option>ml</option><option>L</option><option>g</option><option>kg</option><option>pce</option></select></div></div>}
    </div>
    <div className="card" style={{background:T.bg3}}><div className="bucket-label mb8">Aperçu coûts</div>
      <div className="row gap12" style={{flexWrap:"wrap"}}>{type==="plat"?<><div><div className="text-xs text-dim">Coût/portion</div><div className="fw7 tabular" style={{color:T.text}}>{previewCost.toFixed(2)} €</div></div>{price&&<div><div className="text-xs text-dim">Marge</div><div className="fw7 tabular" style={{color:previewMargin>=70?T.good:previewMargin>=50?T.info:T.bad}}>{previewMargin}%</div></div>}</>:<><div><div className="text-xs text-dim">Coût total</div><div className="fw7 tabular" style={{color:T.text}}>{normForPreview.reduce((a,c)=>a+(c.cost||0),0).toFixed(2)} €</div></div></>}</div>
    </div>
    <div className="card"><div className="between mb8"><div className="bucket-label">Ingrédients</div><div className="row gap6"><button className="btn btn-ghost btn-sm" style={{width:"auto",padding:"6px 10px"}} onClick={addIngredient}>+ Ingrédient</button>{otherRecipes.length>0&&<button className="btn btn-ghost btn-sm" style={{width:"auto",padding:"6px 10px"}} onClick={addSubrecipe}>+ 🧪</button>}</div></div>
      {components.length===0&&<div className="text-xs text-dim center" style={{padding:"10px 0"}}>Aucun ingrédient</div>}
      {components.map((c,i)=>{
        if(c.kind!=="ingredient")return(<div key={i} style={{padding:"10px 0",borderBottom:i<components.length-1?`1px solid ${T.border}`:"none"}}><div className="row gap6 mb6"><span style={{fontSize:16}}>🧪</span><select className="input input-sm" style={{flex:1}} value={c.subrecipeId} onChange={e=>{const sub=allRecipes.find(r=>r.id===parseInt(e.target.value));updateComp(i,{subrecipeId:parseInt(e.target.value),unit:sub.yield.unit});}}>{otherRecipes.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></div><div className="row gap6"><input className="input input-sm" style={{flex:1}} type="text" inputMode="decimal" value={c.qty} onChange={e=>{const v=e.target.value;if(/^\d*[.,]?\d*$/.test(v))updateComp(i,{qty:v.replace(",",".")});}}/><span style={{padding:"9px 12px",color:T.textDim,fontSize:13}}>{c.unit}</span><button style={{width:34,height:34,borderRadius:9,background:T.badBg,color:T.bad,border:"none",fontSize:16,flexShrink:0}} onClick={()=>removeComp(i)}>×</button></div></div>);
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
              <option value="">— Saisie libre —</option>
              {products.map(p=><option key={p.id} value={p.id}>{p.name} ({p.price.toFixed(2)}€/{p.unit})</option>)}
            </select>
          </div>
          {!c.productId&&<input className="input input-sm mb6" value={c.item} onChange={e=>updateComp(i,{item:e.target.value})} placeholder="Nom de l'ingrédient"/>}
          <div className="row gap6">
            <input className="input input-sm" style={{flex:1}} type="text" inputMode="decimal" value={c.qty} onChange={e=>{const v=e.target.value;if(/^\d*[.,]?\d*$/.test(v))updateComp(i,{qty:v.replace(",",".")});}} placeholder="Qté"/>
            <select className="input input-sm" style={{flex:0,width:60}} value={c.unit} onChange={e=>updateComp(i,{unit:e.target.value})}><option>g</option><option>kg</option><option>ml</option><option>L</option><option>pce</option><option>u</option></select>
            {c.productId
              ? <div className="input input-sm" style={{flex:1,display:"flex",alignItems:"center",color:unitMismatch?T.bad:T.good,fontWeight:700,background:T.bg3}}>{unitMismatch?"⚠ unité":`${(autoCost||0).toFixed(2)} €`}</div>
              : <input className="input input-sm" style={{flex:1}} type="text" inputMode="decimal" value={c.cost} onChange={e=>{const v=e.target.value;if(/^\d*[.,]?\d*$/.test(v))updateComp(i,{cost:v.replace(",",".")});}} placeholder="€"/>}
            <button style={{width:34,height:34,borderRadius:9,background:T.badBg,color:T.bad,border:"none",fontSize:16,flexShrink:0}} onClick={()=>removeComp(i)}>×</button>
          </div>
          {unitMismatch&&<div className="text-xs mt4" style={{color:T.bad}}>Ce produit est acheté au {linkedProduct.unit} — choisissez une unité compatible ({linkedProduct.unit==="kg"?"g ou kg":linkedProduct.unit==="L"?"ml ou L":"pce"}).</div>}
        </div>);
      })}
    </div>
    <div className="card"><div className="between mb8"><div className="bucket-label">Étapes</div><button className="btn btn-ghost btn-sm" style={{width:"auto",padding:"6px 10px"}} onClick={addStep}>+ Étape</button></div>
      {steps.length===0&&<div className="text-xs text-dim center" style={{padding:"10px 0"}}>Aucune étape</div>}
      {steps.map((s,i)=><div key={i} className="row gap8 mb6"><div className="step-num">{i+1}</div><input className="input input-sm" style={{flex:1}} value={s} onChange={e=>updateStep(i,e.target.value)} placeholder="Décrire…"/><button style={{width:30,height:30,borderRadius:8,background:T.badBg,color:T.bad,border:"none",fontSize:14,flexShrink:0}} onClick={()=>removeStep(i)}>×</button></div>)}
    </div>
    <div className="card"><div className="field" style={{marginBottom:0}}><label className="label">Allergènes</label><input className="input input-sm" value={allergensStr} onChange={e=>setAllergensStr(e.target.value)} placeholder="Gluten, Lait..."/></div></div>
    <button className="btn btn-primary mb14" onClick={save}>✓ {isEditing?"Mettre à jour":"Créer"}</button>
  </div>);
}

function Recipes({data,setData,db,reload}){
  const[view,setView]=useState("list");const[sel,setSel]=useState(null);const[typeFilter,setTypeFilter]=useState("all");
  const allRecipes=data.recipes;
  const filtered=allRecipes.filter(r=>typeFilter==="all"||r.type===typeFilter);
  if(view==="edit")return<RecipeEditor recipe={sel?allRecipes.find(r=>r.id===sel):null} allRecipes={allRecipes} products={data.products||[]} onSave={async(rec)=>{await db.saveRecipe(rec);await reload();setView("list");setSel(null);}} onCancel={()=>{setView("list");setSel(null);}}/>;
  if(view==="detail"&&sel)return<RecipeDetail recipe={allRecipes.find(r=>r.id===sel)} allRecipes={allRecipes} onBack={()=>{setView("list");setSel(null);}} onEdit={()=>setView("edit")}/>;
  return(<div className="page"><div className="section-title">Fiches techniques</div><div className="section-sub">{allRecipes.filter(r=>r.type==="plat").length} plats · {allRecipes.filter(r=>r.type==="mere").length} mères</div>
    <SegmentedControl value={typeFilter} onChange={setTypeFilter} options={[{value:"all",label:"Tous"},{value:"plat",label:"Plats"},{value:"mere",label:"Mères"}]}/>
    <div style={{height:14}}></div>
    {filtered.map(rec=>{const cost=recipeCostPerPortion(rec,allRecipes);const m=recipeMargin(rec,allRecipes);return(<div key={rec.id} className="item" onClick={()=>{setSel(rec.id);setView("detail");}}><div className="item-icon" style={{background:rec.type==="mere"?T.warnBg:T.infoBg}}>{rec.emoji}</div><div className="item-body"><div className="item-title">{rec.name}</div><div className="item-sub">{rec.type==="mere"?<>🧪 Mère · {rec.yield.qty} {rec.yield.unit} · {cost.toFixed(2)}€/{rec.yield.unit}</>:<>{rec.category} · {rec.price} €</>}</div></div>{rec.type==="plat"?<span className={`badge ${m>=70?"b-good":m>=50?"b-info":"b-bad"}`}>{m}%</span>:<span className="badge b-warn">Base</span>}</div>);})}
    <button className="btn-fab" onClick={()=>{setSel(null);setView("edit");}}>+</button>
  </div>);
}

function Tasks({data,setData,db,reload}){
  const[show,setShow]=useState(false);const[filter,setFilter]=useState("all");
  const[form,setForm]=useState({task:"",resp:"",qty:"",prio:"med",categoryId:null});
  const categories=data.taskCategories||[];
  async function toggle(id){haptic(10);const t=data.tasks.find(x=>x.id===id);await db.toggleTask(id,!t.done);setData(d=>({...d,tasks:d.tasks.map(x=>x.id===id?{...x,done:!x.done}:x)}));}
  async function add(){const catId=form.categoryId||(categories[0]?.id);await db.addTask({...form,categoryId:catId});await reload();setShow(false);setForm({task:"",resp:"",qty:"",prio:"med",categoryId:null});}
  function openAddFor(catId){setForm({task:"",resp:"",qty:"",prio:"med",categoryId:catId});setShow(true);}
  const visibleTasks=filter==="all"?data.tasks:data.tasks.filter(t=>t.categoryId===filter);
  const done=visibleTasks.filter(t=>t.done).length;const total=visibleTasks.length;const pct=total?Math.round(done/total*100):0;
  const filterOptions=[{value:"all",label:`Tous (${data.tasks.length})`},...categories.map(c=>({value:c.id,label:`${c.icon} ${c.name.replace("Mise en place ","")} (${data.tasks.filter(t=>t.categoryId===c.id).length})`}))];
  const grouped=filter==="all"?categories.map(cat=>({cat,tasks:data.tasks.filter(t=>t.categoryId===cat.id)})).filter(g=>g.tasks.length>0):[{cat:categories.find(c=>c.id===filter),tasks:visibleTasks}];
  const prios=[{k:"high",l:"⚡ Urgent",c:T.bad},{k:"med",l:"Normal",c:T.warn},{k:"low",l:"Quand possible",c:T.textDim}];
  return(<div className="page"><div className="section-title">Mise en place</div><div className="section-sub">{done} / {total} · {pct}%</div>
    <div className="card mb14"><div className="pbar"><div className="pfill" style={{width:`${pct}%`,background:T.accent}}></div></div></div>
    <div className="chips mb14">{filterOptions.map(opt=><button key={opt.value} className={`chip ${filter===opt.value?"sel":""}`} onClick={()=>setFilter(opt.value)}>{opt.label}</button>)}</div>
    {grouped.length===0&&<div className="empty"><div className="empty-icon">📋</div><div className="empty-title">Aucune tâche</div><div className="empty-sub">Ajoutez votre première tâche</div></div>}
    {grouped.map(({cat,tasks})=>{if(!cat)return null;const catDone=tasks.filter(t=>t.done).length;return(<div key={cat.id} style={{marginBottom:18}}>
      <div className="between mb8" style={{padding:"0 4px"}}><div className="row gap8"><span style={{fontSize:18}}>{cat.icon}</span><span style={{fontSize:13,fontWeight:700,color:cat.color}}>{cat.name}</span><span className="text-xs text-dim">· {catDone}/{tasks.length}</span></div><button onClick={()=>openAddFor(cat.id)} style={{background:"transparent",border:"none",color:cat.color,fontSize:18,fontWeight:700,padding:"4px 8px",cursor:"pointer"}}>+</button></div>
      {prios.map(p=>{const pt=tasks.filter(t=>t.prio===p.k);if(!pt.length)return null;return(<div key={p.k} style={{marginBottom:8}}><div style={{fontSize:10,fontWeight:700,color:p.c,marginBottom:4,marginLeft:6,letterSpacing:".06em",textTransform:"uppercase"}}>{p.l}</div>{pt.map(t=><div key={t.id} className="item" onClick={()=>toggle(t.id)} style={{opacity:t.done?.45:1,borderLeftColor:cat.color,borderLeftWidth:3,borderLeftStyle:"solid"}}><div className={`check ${t.done?"on":""}`}>{t.done?"✓":""}</div><div className="item-body"><div className="item-title" style={{textDecoration:t.done?"line-through":"none"}}>{t.task}</div><div className="item-sub">{t.resp} · {t.qty}</div></div></div>)}</div>);})}
    </div>);})}
    <button className="btn-fab" onClick={()=>setShow(true)}>+</button>
    {show&&<div className="overlay" onClick={()=>setShow(false)}><div className="sheet" onClick={e=>e.stopPropagation()}>
      <div className="sheet-handle"></div><div className="sheet-title">Nouvelle tâche</div>
      <div className="field"><label className="label">Catégorie</label><div className="chips">{categories.map(c=><button key={c.id} className={`chip ${form.categoryId===c.id?"sel":""}`} onClick={()=>setForm({...form,categoryId:c.id})}>{c.icon} {c.name.replace("Mise en place ","")}</button>)}</div></div>
      <div className="field"><label className="label">Description</label><input className="input" value={form.task} onChange={e=>setForm({...form,task:e.target.value})} autoFocus/></div>
      <div className="row gap8 mb14"><div style={{flex:1}}><label className="label">Resp.</label><input className="input input-sm" value={form.resp} onChange={e=>setForm({...form,resp:e.target.value})}/></div><div style={{flex:1}}><label className="label">Qté</label><input className="input input-sm" value={form.qty} onChange={e=>setForm({...form,qty:e.target.value})}/></div></div>
      <div className="field"><label className="label">Priorité</label><SegmentedControl value={form.prio} onChange={v=>setForm({...form,prio:v})} options={[{value:"high",label:"⚡ Urgent"},{value:"med",label:"Normal"},{value:"low",label:"+ tard"}]}/></div>
      <button className="btn btn-primary mt8" onClick={add} disabled={!form.task||!form.categoryId}>{form.categoryId?"Ajouter":"Choisir une catégorie"}</button>
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

function Planning({data}){
  const[day,setDay]=useState("Lun");const shifts=data.planning[day]||{};
  return(<div className="page"><div className="section-title">Planning</div><div className="section-sub">Semaine du 12 au 18 mai</div>
    <div className="tabs">{DAYS.map(d=><button key={d} className={`tab ${day===d?"active":""}`} onClick={()=>setDay(d)}>{d}</button>)}</div>
    <div className="bucket-label">En service — {day}</div>
    {data.users.filter(u=>shifts[u.id]).map(u=><div key={u.id} className="item"><div className="item-icon" style={{background:`${u.color}25`,color:u.color,fontWeight:700,fontSize:14}}>{u.initials}</div><div className="item-body"><div className="item-title">{u.name}</div><div className="item-sub">{u.role}</div></div><div style={{textAlign:"right"}}>{shifts[u.id].map((sh,i)=><div key={i} className="badge b-info" style={{marginBottom:3,display:"block"}}>{sh}</div>)}</div></div>)}
  </div>);
}

function ProductsEditor({data,setData,db,reload}){
  const[showAdd,setShowAdd]=useState(false);const[editing,setEditing]=useState(null);
  const[form,setForm]=useState({name:"",price:"",unit:"kg"});
  function openAdd(){setEditing(null);setForm({name:"",price:"",unit:"kg"});setShowAdd(true);}
  function openEdit(p){setEditing(p);setForm({name:p.name,price:p.price.toString(),unit:p.unit});setShowAdd(true);}
  async function save(){
    if(!form.name.trim())return;
    const payload={name:form.name.trim(),price:parseFloat(String(form.price).replace(",","."))||0,unit:form.unit};
    if(editing)await db.updateProduct(editing.id,payload); else await db.addProduct(payload);
    await reload(); setShowAdd(false); setEditing(null);
  }
  async function remove(p){if(!window.confirm(`Supprimer "${p.name}" du catalogue ?`))return;await db.deleteProduct(p.id);await reload();}
  const sorted=[...(data.products||[])].sort((a,b)=>a.name.localeCompare(b.name));
  return(<><div className="text-xs text-dim mb12" style={{lineHeight:1.5}}>Prix d'achat de vos matières premières. Utilisés pour calculer automatiquement le coût de vos fiches techniques.</div>
    {sorted.length===0&&<div className="empty"><div className="empty-icon">🧾</div><div className="empty-title">Aucun produit</div><div className="empty-sub">Ajoutez vos matières premières et leurs prix</div></div>}
    {sorted.map(p=><div key={p.id} className="item">
      <div className="item-icon" style={{background:T.infoBg}}>🧾</div>
      <div className="item-body"><div className="item-title">{p.name}</div><div className="item-sub">{p.price.toFixed(2)} € / {p.unit}</div></div>
      <div className="row gap6"><button onClick={()=>openEdit(p)} style={{background:"transparent",border:"none",color:T.textDim,fontSize:16,padding:"6px 8px"}}>✏️</button><button onClick={()=>remove(p)} style={{background:"transparent",border:"none",color:T.bad,fontSize:16,padding:"6px 8px"}}>🗑</button></div>
    </div>)}
    <button className="btn btn-primary mt8" onClick={openAdd}>+ Nouveau produit</button>
    {showAdd&&<div className="overlay" onClick={()=>setShowAdd(false)}><div className="sheet" onClick={e=>e.stopPropagation()}>
      <div className="sheet-handle"></div><div className="sheet-title">{editing?"Modifier le produit":"Nouveau produit"}</div>
      <div className="field"><label className="label">Nom</label><input className="input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="ex : Filet de bar" autoFocus/></div>
      <div className="row gap8"><div style={{flex:1}}><label className="label">Prix d'achat</label><input className="input input-sm" type="text" inputMode="decimal" value={form.price} onChange={e=>{const v=e.target.value;if(/^\d*[.,]?\d*$/.test(v))setForm({...form,price:v});}} placeholder="ex : 18.50"/></div>
        <div style={{flex:0,width:90}}><label className="label">Pour</label><select className="input input-sm" value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})}><option value="kg">1 kg</option><option value="L">1 L</option><option value="pce">1 pièce</option></select></div></div>
      <div className="text-xs text-dim mb14">Le coût sera calculé automatiquement selon la quantité utilisée dans chaque recette (g, kg, ml, L ou pièces).</div>
      <button className="btn btn-primary mt8" onClick={save} disabled={!form.name.trim()}>{editing?"Mettre à jour":"Ajouter au catalogue"}</button>
    </div></div>}
  </>);
}

function TaskCategoriesEditor({data,setData,db,reload}){
  const[showAdd,setShowAdd]=useState(false);const[editing,setEditing]=useState(null);
  const[form,setForm]=useState({name:"",icon:"📋",color:"#5A8FB5"});
  const PRESET_COLORS=["#5A8FB5","#D49340","#C97FA8","#C9A862","#5FB075","#A78BFA","#D55C5C","#5EEAD4"];
  const PRESET_ICONS=["❄️","🔥","🍰","🥖","🥩","🐟","🥗","🍷","🧀","☕","🧂","📋"];
  function openAdd(){setEditing(null);setForm({name:"",icon:"📋",color:PRESET_COLORS[0]});setShowAdd(true);}
  function openEdit(cat){setEditing(cat);setForm({name:cat.name,icon:cat.icon,color:cat.color});setShowAdd(true);}
  async function save(){if(!form.name.trim())return;await db.saveTaskCategory(editing?{...form,id:editing.id}:{...form});await reload();setShowAdd(false);setEditing(null);}
  async function remove(catId){const tasksInCat=data.tasks.filter(t=>t.categoryId===catId).length;const msg=tasksInCat>0?`${tasksInCat} tâche(s) seront déplacées. Supprimer ?`:"Supprimer cette catégorie ?";if(!window.confirm(msg))return;const remaining=data.taskCategories.filter(c=>c.id!==catId);const fallbackId=remaining[0]?.id;await db.deleteTaskCategory(catId,fallbackId);await reload();}
  return(<><div className="text-xs text-dim mb12" style={{lineHeight:1.5}}>Organisez votre mise en place par zones de production.</div>
    {data.taskCategories.map(cat=>{const count=data.tasks.filter(t=>t.categoryId===cat.id).length;return(<div key={cat.id} className="item" style={{borderLeft:`3px solid ${cat.color}`}}><div className="item-icon" style={{background:`${cat.color}22`}}>{cat.icon}</div><div className="item-body"><div className="item-title">{cat.name}</div><div className="item-sub">{count} tâche{count>1?"s":""}</div></div><div className="row gap6"><button onClick={()=>openEdit(cat)} style={{background:"transparent",border:"none",color:T.textDim,fontSize:16,padding:"6px 8px"}}>✏️</button><button onClick={()=>remove(cat.id)} style={{background:"transparent",border:"none",color:T.bad,fontSize:16,padding:"6px 8px"}}>🗑</button></div></div>);})}
    <button className="btn btn-primary mt8" onClick={openAdd}>+ Nouvelle catégorie</button>
    {showAdd&&<div className="overlay" onClick={()=>setShowAdd(false)}><div className="sheet" onClick={e=>e.stopPropagation()}>
      <div className="sheet-handle"></div><div className="sheet-title">{editing?"Modifier":"Nouvelle catégorie"}</div>
      <div className="field"><label className="label">Nom</label><input className="input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="ex : Mise en place froid" autoFocus/></div>
      <div className="field"><label className="label">Icône</label><div className="chips">{PRESET_ICONS.map(ic=><button key={ic} className={`chip ${form.icon===ic?"sel":""}`} onClick={()=>setForm({...form,icon:ic})} style={{fontSize:18,padding:"6px 12px"}}>{ic}</button>)}</div></div>
      <div className="field"><label className="label">Couleur</label><div className="row gap8" style={{flexWrap:"wrap"}}>{PRESET_COLORS.map(c=><button key={c} onClick={()=>setForm({...form,color:c})} style={{width:34,height:34,borderRadius:"50%",background:c,border:form.color===c?`3px solid ${T.text}`:`2px solid ${T.border}`,flexShrink:0}}/>)}</div></div>
      <div className="card" style={{background:T.bg3,borderLeft:`3px solid ${form.color}`}}><div className="row gap10"><div className="item-icon" style={{background:`${form.color}22`}}>{form.icon}</div><div><div className="text-xs text-dim">Aperçu</div><div className="item-title">{form.name||"Nom"}</div></div></div></div>
      <button className="btn btn-primary mt8" onClick={save} disabled={!form.name.trim()}>{editing?"Mettre à jour":"Créer"}</button>
    </div></div>}
  </>);
}

function More({go,user}){
  const items=[{key:"margins",icon:"📊",bg:T.goodBg,title:"Marges",sub:"Rentabilité"},{key:"planning",icon:"📅",bg:T.warnBg,title:"Planning équipe",sub:"Horaires"}];
  return(<div className="page"><div className="section-title">Outils</div><div className="section-sub">Toutes les fonctions</div>
    {items.map(it=><div key={it.key} className="item" onClick={()=>go(it.key)}><div className="item-icon" style={{background:it.bg}}>{it.icon}</div><div className="item-body"><div className="item-title">{it.title}</div><div className="item-sub">{it.sub}</div></div><div className="item-arrow">›</div></div>)}
    {user.isAdmin&&<><div className="bucket-label mt14">Administration</div><div className="item" onClick={()=>go("settings")}><div className="item-icon" style={{background:T.accentLt}}>⚙️</div><div className="item-body"><div className="item-title">Paramètres</div><div className="item-sub">Restaurant, équipe, HACCP</div></div><div className="item-arrow">›</div></div></>}
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
    await db.saveHaccpSettings(s); toast.ping();
  }

  function openFridge(f){ setFForm(f?{name:f.name,icon:f.icon,target:f.target,type:f.type}:{name:"",icon:"🧊",target:"0–4",type:"positif"}); setSheet({kind:"fridge",item:f||null}); }
  function openClean(c){ setCForm(c?{zone:c.zone,icon:c.icon,freq:c.freq,produit:c.produit,dilution:c.dilution}:{zone:"",icon:"🧹",freq:"Quotidien",produit:"",dilution:""}); setSheet({kind:"clean",item:c||null}); }

  async function saveFridge(){
    if(!fForm.name)return;
    if(sheet.item){
      const upd=fridges.map(f=>f.id===sheet.item.id?{...f,...fForm}:f);
      setData(d=>({...d,haccpSettings:{...d.haccpSettings,fridgeTargets:upd}}));
      await db.updateFridgeTarget?.(sheet.item.id,fForm);
    }else{
      const nf={id:Date.now(),...fForm};
      setData(d=>({...d,haccpSettings:{...d.haccpSettings,fridgeTargets:[...fridges,nf]}}));
      await db.addFridgeTarget?.(fForm);
    }
    setSheet(null); toast.ping(); reload?.();
  }
  async function delFridge(f){
    setData(d=>({...d,haccpSettings:{...d.haccpSettings,fridgeTargets:fridges.filter(x=>x.id!==f.id)}}));
    await db.deleteFridgeTarget?.(f.id); toast.ping();
  }
  async function saveClean(){
    if(!cForm.zone)return;
    if(sheet.item){
      const upd=cleaningItems.map(c=>c.id===sheet.item.id?{...c,...cForm}:c);
      setData(d=>({...d,cleaning:upd}));
      await db.updateCleaningItem?.(sheet.item.id,cForm);
    }else{
      const nc={id:Date.now(),...cForm,done:false};
      setData(d=>({...d,cleaning:[...cleaningItems,nc]}));
      await db.addCleaningItem?.(cForm);
    }
    setSheet(null); toast.ping(); reload?.();
  }
  async function delClean(c){
    setData(d=>({...d,cleaning:cleaningItems.filter(x=>x.id!==c.id)}));
    await db.deleteCleaningItem?.(c.id); toast.ping();
  }

  return(<>
    <div className="group-label">Seuils critiques</div>
    {[
      ["Refroidissement max","coolingMax","min","Légal : 120"],
      ["Remise en T° minimum","reheatMin","°C","Légal : 63"],
      ["Remise en T° durée max","reheatMaxTime","min","Légal : 60"],
      ["Huile — polaires max","oilPolarMax","%","Décret : 25"],
      ["Plats témoins","testMealDays","j","Comm. 3 / Coll. 5"],
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

    <div className="group-label" style={{marginTop:20}}>Enceintes froides</div>
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

    <div className="group-label" style={{marginTop:20}}>Plan de nettoyage</div>
    <div className="text-xs text-dim mb8" style={{marginLeft:2}}>Touchez pour modifier · appui long pour supprimer</div>
    {cleaningItems.map(c=>(
      <EditableRow key={c.id} icon={c.icon} iconBg={T.goodBg} onOpen={()=>openClean(c)} onDelete={()=>{if(window.confirm(`Supprimer ${c.zone} ?`))delClean(c);}}>
        <div className="item-title">{c.zone}</div>
        <div className="item-sub">{c.freq} · {c.produit}{c.dilution?` · ${c.dilution}`:""}</div>
      </EditableRow>
    ))}
    <button className="inline-add mt6" onClick={()=>openClean(null)}>+ Ajouter une zone</button>

    {sheet?.kind==="fridge"&&(
      <div className="overlay" onClick={()=>setSheet(null)}>
        <div className="sheet" onClick={e=>e.stopPropagation()}>
          <div className="sheet-handle"></div>
          <div className="sheet-title">{sheet.item?"Modifier l'enceinte":"Nouvelle enceinte"}</div>
          <div className="field"><label className="label">Nom</label><input className="input" value={fForm.name} onChange={e=>setFForm({...fForm,name:e.target.value})} placeholder="ex : Frigo Entrées" autoFocus/></div>
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
          <div className="field"><label className="label">Nom de la zone</label><input className="input" value={cForm.zone} onChange={e=>setCForm({...cForm,zone:e.target.value})} placeholder="ex : Sol cuisine" autoFocus/></div>
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
    <div className="group-label">Équipe</div>
    <div className="text-xs text-dim mb8" style={{marginLeft:2}}>Touchez pour modifier · appui long pour supprimer</div>
    {data.users.map(u=>(
      <UserRow key={u.id} u={u} isSelf={u.id===user.id} onOpen={()=>open(u)} onDelete={()=>{if(window.confirm(`Supprimer ${u.name} ?`))del(u);}}/>
    ))}
    <button className="inline-add mt6" onClick={()=>open(null)}>+ Ajouter un membre</button>

    {sheet&&(
      <div className="overlay" onClick={()=>setSheet(null)}>
        <div className="sheet" onClick={e=>e.stopPropagation()}>
          <div className="sheet-handle"></div>
          <div className="sheet-title">{sheet.item?"Modifier le membre":"Nouveau membre"}</div>
          <div className="field"><label className="label">Nom complet</label><input className="input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="ex : Jean Dupont" autoFocus/></div>
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

function SettingsPrinter({user}){
  const[testDone,setTestDone]=useState(false);
  function testPrint(){
    printBrotherLabel({product:"TEST FUEGO",qty:"",dateProd:todayStr(),dlc:todayStr(),lot:"TEST-001",allergens:"Aucun",operator:user.name});
    setTestDone(true); setTimeout(()=>setTestDone(false),3000);
  }
  return(<>
    <div className="group-label">Imprimante d'étiquettes</div>
    <div className="card" style={{marginBottom:12}}>
      <div className="row gap10 mb8">
        <div style={{fontSize:28}}>🖨️</div>
        <div><div className="item-title">Brother — Ethernet</div><div className="text-xs text-dim">Format 57,15 × 50,8 mm</div></div>
      </div>
      <div className="text-xs text-dim" style={{lineHeight:1.6}}>
        Ton imprimante Brother est branchée en Ethernet sur ta box. Chaque téléphone connecté au même WiFi peut imprimer via la boîte d'impression du téléphone.
      </div>
    </div>

    <div className="banner banner-info mb12"><span>ℹ️</span><div style={{fontSize:11,lineHeight:1.5}}>
      <b>Configuration une seule fois par téléphone :</b> installe l'app <b>Brother iPrint&amp;Label</b> (iOS/Android) OU active AirPrint. Ensuite, au moment d'imprimer, choisis ta Brother dans la liste.
    </div></div>

    <div className="group-label">Étapes de configuration</div>
    {[
      ["1","Vérifier le réseau","Le téléphone doit être sur le même WiFi que la box où est branchée la Brother."],
      ["2","Installer Brother iPrint&Label","Depuis l'App Store ou Google Play — gratuit. L'app détecte l'imprimante sur le réseau."],
      ["3","Régler le format","Dans les réglages d'impression, choisir l'étiquette 57 × 50 mm (DK-11221 ou équivalent découpe)."],
      ["4","Imprimer un test","Bouton ci-dessous → choisir la Brother dans la boîte d'impression."],
    ].map(([n,t,d])=>(
      <div key={n} className="item" style={{marginBottom:6}}>
        <div className="item-icon" style={{background:"linear-gradient(135deg,#FF6B00,#E8390A)",color:"white",fontWeight:800,fontSize:15}}>{n}</div>
        <div className="item-body"><div className="item-title">{t}</div><div className="item-sub" style={{whiteSpace:"normal"}}>{d}</div></div>
      </div>
    ))}

    <button className="btn btn-primary mt12" onClick={testPrint}>🖨️ Imprimer une étiquette test</button>
    {testDone&&<div className="banner banner-good mt8"><span>✓</span><div>Fenêtre d'impression ouverte. Choisis ta Brother et vérifie le cadrage.</div></div>}

    <div className="banner banner-warn mt12"><span>⚠️</span><div style={{fontSize:11,lineHeight:1.5}}>
      Si le texte est coupé ou mal centré : dans la boîte d'impression, mets les marges à <b>zéro</b> et l'échelle à <b>100 %</b> (pas "ajuster à la page").
    </div></div>
  </>);
}

function Settings({data,setData,user,onLogout,db,reload}){
  const[tab,setTab]=useState("haccp");
  return(
    <div className="page">
      <div className="section-title">Paramètres</div>
      <div className="section-sub">Administration Fuego</div>
      <div className="tabs" style={{marginBottom:20}}>
        {[{k:"haccp",l:"🛡️ HACCP"},{k:"products",l:"🧾 Produits"},{k:"printer",l:"🖨️ Imprimante"},{k:"tasks",l:"📋 Tâches"},{k:"users",l:"👥 Équipe"},{k:"restaurant",l:"🏠 Resto"}].map(t=><button key={t.k} className={`tab ${tab===t.k?"active":""}`} onClick={()=>setTab(t.k)}>{t.l}</button>)}
      </div>
      {tab==="haccp"&&<SettingsHaccp data={data} setData={setData} db={db} reload={reload}/>}
      {tab==="products"&&<ProductsEditor data={data} setData={setData} db={db} reload={reload}/>}
      {tab==="printer"&&<SettingsPrinter user={user}/>}
      {tab==="tasks"&&<TaskCategoriesEditor data={data} setData={setData} db={db} reload={reload}/>}
      {tab==="users"&&<SettingsUsers data={data} setData={setData} user={user} db={db} reload={reload} onLogout={onLogout}/>}
      {tab==="restaurant"&&<SettingsRestaurant data={data} setData={setData} db={db}/>}
    </div>
  );
}

const NAV=[{k:"home",i:"🏠",l:"Aujourd'hui"},{k:"haccp",i:"🛡️",l:"HACCP"},{k:"recipes",i:"📖",l:"Recettes"},{k:"tasks",i:"✅",l:"Mise en place"},{k:"more",i:"⋯",l:"Plus"}];
const TITLES={home:"Aujourd'hui",haccp:"HACCP",temps:"Températures",reception:"Réception",cooling:"Cellule",reheating:"Remise en T°",oils:"Huiles friture",trace:"Traçabilité",labels:"Étiquetage",testmeals:"Plats témoins",clean:"Nettoyage",pests:"Nuisibles",training:"Formation",registre:"Registre HACCP",recipes:"Recettes",margins:"Marges",planning:"Planning",tasks:"Mise en place",more:"Plus",settings:"Paramètres"};
const ROOT_PAGES=["home","haccp","recipes","tasks","more"];
const HACCP_PAGES=["temps","reception","cooling","reheating","oils","trace","labels","testmeals","clean","pests","training","registre"];
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
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR){ setSupported(false); return; }
  },[]);

  const start = useCallback((continuous=false)=>{
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
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
      const lot = `L${new Date().toLocaleDateString("fr-FR").replace(/\//g,"")}-${(data.labels?.length||0)+1}`;
      // Imprime
      printVoiceLabel(cmd.product, dateProd, dlcDate, lot, user.name);
      // Enregistre
      await db.addLabel?.({product:cmd.product,dateProd,dlc:dlcDate,lot,allergens:"À vérifier",operator:user.name});
      await reload?.();
      setResult({ ok:true, msg:`Étiquette imprimée : ${cmd.product} · DLC ${dlcDate}` });
      setPhase("done");
    }
    else if (cmd.type === "task"){
      await db.addTask?.({task:cmd.task, resp:user.name, qty:"", prio:"med", categoryId:cmd.categoryId});
      await reload?.();
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

  const reload=useCallback(async()=>{
    // Si Supabase pas configuré → mode démo avec données INIT
    const notConfigured = !SUPABASE_URL || SUPABASE_URL.includes("REMPLACE");
    if(notConfigured){ setData(INIT); setDbError(null); return; }
    try{
      const loaded=await DB.loadAll();
      // Si la DB est vide (pas encore peuplée), fallback sur INIT
      if(!loaded.users || loaded.users.length===0){ setData(INIT); return; }
      setData(loaded); setDbError(null);
    }
    catch(e){ console.error("Supabase:",e); setDbError(e.message||"Erreur connexion"); if(!data)setData(INIT); }
  },[]);
  useEffect(()=>{reload();},[]);

  // ── Mot-clé "Fuego" (écoute passive en arrière-plan) ──
  useEffect(()=>{
    if(!wakeEnabled || voiceOpen) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
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

  const go=k=>{setPage(k);setProfile(false);};
  const logout=()=>{setUser(null);setPage("home");};

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

  if(!user)return(<><style>{S}</style><Login users={data.users} onLogin={u=>setUser(u)}/></>);

  const isRoot=ROOT_PAGES.includes(page);
  const backTo=HACCP_PAGES.includes(page)?"haccp":MORE_PAGES.includes(page)?"more":"home";
  const activeTab=ROOT_PAGES.includes(page)?page:HACCP_PAGES.includes(page)?"haccp":MORE_PAGES.includes(page)?"more":page;
  const props={data,setData,user,go,db:DB,reload};
  const pages={
    home:<Aujourdhui {...props}/>,haccp:<HaccpHub {...props}/>,
    temps:<Temperatures {...props}/>,reception:<Reception {...props}/>,
    cooling:<Cooling {...props}/>,reheating:<Reheating {...props}/>,
    oils:<Oils {...props}/>,trace:<Traceability {...props}/>,
    labels:<Labels {...props}/>,testmeals:<TestMeals {...props}/>,
    clean:<Cleaning {...props}/>,pests:<Pests {...props}/>,
    training:<Training data={data}/>,registre:<Registre data={data}/>,
    recipes:<Recipes data={data} setData={setData} db={DB} reload={reload}/>,
    margins:<Margins data={data}/>,planning:<Planning data={data}/>,
    tasks:<Tasks data={data} setData={setData} db={DB} reload={reload}/>,
    more:<More go={go} user={user}/>,
    settings:user.isAdmin?<Settings data={data} setData={setData} user={user} onLogout={logout} db={DB} reload={reload}/>:<div style={{textAlign:"center",padding:40,color:T.textDim}}><div style={{fontSize:42}}>🔒</div><div>Réservé aux administrateurs</div></div>,
  };
  return(<><style>{S}</style><div className="shell">
    <div className="topbar">
      {isRoot?<><div style={{width:36}}></div><div className="topbar-center">{page==="home"?<div className="topbar-logo"><FuegoLogo/></div>:<div className="topbar-title">{TITLES[page]}</div>}</div><button className="topbar-avatar" onClick={()=>setProfile(!profile)}>{user.initials}</button></>:<><button className="topbar-back" onClick={()=>go(backTo)}>‹</button><div className="topbar-center"><div className="topbar-title">{TITLES[page]}</div></div><div style={{width:36}}></div></>}
    </div>
    {profile&&<div className="overlay" onClick={()=>setProfile(false)}><div className="sheet" onClick={e=>e.stopPropagation()}>
      <div className="sheet-handle"></div><div className="profile-avatar">{user.initials}</div><div className="profile-name">{user.name}</div><div className="profile-role">{user.role}</div>
      <div className="center mb14"><span className={`badge ${user.isAdmin?"b-bad":"b-mute"}`}>{user.isAdmin?"Administrateur":"Équipe"}</span></div>
      <button className="voice-toggle" style={{width:"100%",justifyContent:"space-between",cursor:"pointer"}} onClick={()=>setWakeEnabled(w=>!w)}>
        <span style={{display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:18}}>🎤</span><span style={{fontSize:13,fontWeight:600}}>Mot-clé « Fuego »</span></span>
        <span style={{width:42,height:24,borderRadius:999,background:wakeEnabled?"linear-gradient(135deg,#FF6B00,#E8390A)":"#2A2A2A",position:"relative",transition:"background .2s",flexShrink:0}}>
          <span style={{position:"absolute",top:2,left:wakeEnabled?20:2,width:20,height:20,borderRadius:"50%",background:"white",transition:"left .2s"}}></span>
        </span>
      </button>
      <div className="text-xs text-mute mb12" style={{paddingLeft:4}}>{wakeEnabled?"Dites « Fuego » pour activer la commande vocale sans toucher l'écran":"Activez pour piloter à la voix, mains libres"}</div>
      {user.isAdmin&&<button className="btn btn-ghost mb8" onClick={()=>{setProfile(false);go("settings");}}>⚙️ Paramètres</button>}
      <button className="btn" style={{background:T.badBg,color:T.bad}} onClick={logout}>Déconnexion</button>
    </div></div>}
    <div className="scroll" key={page}>{pages[page]}</div>

    {/* Bouton micro vocal — visible sur l'accueil */}
    {isRoot && page==="home" && (
      <button className={`voice-fab ${wakeEnabled?"listening":""}`} onClick={()=>setVoiceOpen(true)} title="Commande vocale">🎤</button>
    )}

    {/* Overlay vocal */}
    {voiceOpen && (
      <VoiceOverlay
        data={data} db={DB} reload={reload} user={user} go={go}
        onClose={()=>setVoiceOpen(false)}
      />
    )}

    <div className="bottomnav">{NAV.map(n=><button key={n.k} className={`nav-item ${activeTab===n.k?"active":""}`} onClick={()=>go(n.k)}><span className="nav-icon">{n.i}</span><span className="nav-label">{n.l}</span></button>)}</div>
  </div></>);
}
