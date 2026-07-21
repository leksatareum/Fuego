// ═══════════════════════════════════════════════════════════════════════════
//  FUEGO — logic.js
//  Fonctions de calcul pures, extraites de App.jsx pour pouvoir être testées
//  automatiquement (voir logic.test.js). Ce sont précisément les fonctions
//  qui ont été à l'origine de bugs réels au fil des sessions : dates de
//  service autour de minuit, fenêtre de service selon les horaires réglés,
//  conformité d'un refroidissement calculée à deux endroits différents...
//  Les garder ici, importées par App.jsx plutôt que dupliquées, élimine
//  structurellement le risque qu'une correction faite à un endroit soit
//  oubliée à un autre.
// ═══════════════════════════════════════════════════════════════════════════

export function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
}

export function safePct(done, total) {
  return total > 0 ? clamp((done / total) * 100) : 0;
}

export function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Date "de service" (format ISO) plutôt que date calendaire brute : entre
// minuit et l'horaire réel de bascule (Paramètres → Horaires de service), on
// est encore sur le service du soir de la veille. Sans ça, minuit faisait
// réapparaître le nettoyage du soir comme "à faire" des heures avant la
// vraie fin de service.
//
// `now` est injectable (sert aux tests) — en usage normal, ne pas le passer
// utilise l'heure réelle.
export function serviceISODate(resetSoir, now = new Date()) {
  // Filet de sécurité : si une valeur incorrecte (ex. proche de minuit)
  // existait déjà quelque part, on la ramène dans une plage sensée plutôt
  // que de laisser le calcul du jour se casser silencieusement.
  const RESET_SOIR = Math.min(resetSoir ?? (3 * 60), 9 * 60);
  const mins = now.getHours() * 60 + now.getMinutes();
  const d = new Date(now);
  if (mins < RESET_SOIR) d.setDate(d.getDate() - 1);
  return isoDate(d);
}

// Même principe que serviceISODate, mais au format "JJ/MM" — celui
// qu'utilisent les relevés de température et la réception, pas le format ISO.
export function serviceDateStr(resetSoir, now = new Date()) {
  const RESET_SOIR = Math.min(resetSoir ?? (3 * 60), 9 * 60);
  const mins = now.getHours() * 60 + now.getMinutes();
  const d = new Date(now);
  if (mins < RESET_SOIR) d.setDate(d.getDate() - 1);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

// Les horaires de service suivent le réglage réel (Paramètres → Horaires de
// service, resetMidi), pas une heure fixe codée en dur — sinon "préparation
// soir" démarrait à la même heure pour tout le monde, sans lien avec l'heure
// de bascule que chaque restaurant règle vraiment.
export function getServiceWindow(resetMidiMinutes, now = new Date()) {
  const mins = now.getHours() * 60 + now.getMinutes();
  // Plafonné à 17h59 : si jamais réglé après 18h, "préparation soir" doit
  // quand même garder une fenêtre avant le début du service du soir.
  const RESET_MIDI = Math.min(resetMidiMinutes ?? (16 * 60 + 30), 17 * 60 + 59);
  if (mins >= 7 * 60 && mins < 11 * 60) return { id: "morning", label: "Ouverture", icon: "☀️" };
  if (mins >= 11 * 60 && mins < RESET_MIDI) return { id: "lunch", label: "Service midi", icon: "🍽️" };
  if (mins >= RESET_MIDI && mins < 18 * 60) return { id: "prep_pm", label: "Préparation soir", icon: "🔧" };
  if (mins >= 18 * 60 && mins < 23 * 60) return { id: "dinner", label: "Service soir", icon: "🌙" };
  return { id: "closing", label: "Clôture", icon: "🌃" };
}

// Une zone est-elle faite AUJOURD'HUI (au sens du service, pas du
// calendrier) ? Fonction partagée, utilisée partout dans l'app (accueil,
// menu HACCP, pastille de l'icône, écran Nettoyage) — une seule source de
// vérité, pour ne plus jamais désynchroniser un compteur par rapport à un
// autre. Pour le quotidien, matin ET soir sont nécessaires ; pour les autres
// fréquences, la case "done" reste la référence.
export function cleaningIsDoneToday(c, cleaningChecks, resetSoir, now = new Date()) {
  if (c.freq === "Quotidien") {
    const today = serviceISODate(resetSoir, now);
    const checks = cleaningChecks || [];
    const hasMatin = checks.some(x => x.cleaningId === c.id && x.date === today && x.period === "matin");
    const hasSoir  = checks.some(x => x.cleaningId === c.id && x.date === today && x.period === "soir");
    return hasMatin && hasSoir;
  }
  return !!c.done;
}

// Conformité d'un refroidissement/surgélation — règle unique, utilisée à la
// fois par le suivi en direct (chrono) ET par la saisie rétroactive. Ces
// deux écrans avaient chacun leur propre copie de cette règle avant
// extraction ; un correctif appliqué à l'un sans l'autre serait passé
// inaperçu pendant des mois.
export function coolingConformity(mode, durationMin, endTemp, maxMin) {
  const conform = mode === "surgel" ? (endTemp <= -18) : (durationMin <= maxMin && endTemp <= 10);
  return conform ? "ok" : "alert";
}

// Regroupement à trois niveaux du registre — catégorie réglementaire, puis
// module, puis jour. Reprend les 3 mêmes groupes que le menu HACCP (calé sur
// la structure du GBPH), pour correspondre à la façon dont un contrôleur
// DDPP parcourt habituellement un dossier.
export const REGISTRE_CATEGORIES = [
  { name: "Contrôles quotidiens", icon: "🌡️", modules: ["Températures", "Réception", "Refroidissement", "Remise en température", "Huiles"] },
  { name: "Traçabilité", icon: "📦", modules: ["Traçabilité"] },
  { name: "Hygiène et nettoyage", icon: "🧹", modules: ["Nettoyage", "Nuisibles"] },
];

export function groupRegistreEvents(events) {
  return REGISTRE_CATEGORIES.map(cat => {
    const catEvents = events.filter(e => cat.modules.includes(e.module));
    if (catEvents.length === 0) return null;
    const modules = cat.modules.map(modName => {
      const modEvents = catEvents.filter(e => e.module === modName);
      if (modEvents.length === 0) return null;
      const byDate = {};
      modEvents.forEach(e => { (byDate[e.date] = byDate[e.date] || []).push(e); });
      const dateKeys = Object.keys(byDate).sort((a, b) => {
        const evA = byDate[a][0], evB = byDate[b][0];
        return (evB.ts?.getTime() || 0) - (evA.ts?.getTime() || 0);
      });
      return { module: modName, count: modEvents.length, dates: dateKeys.map(d => ({ date: d, events: byDate[d] })) };
    }).filter(Boolean);
    return { category: cat.name, icon: cat.icon, count: catEvents.length, modules };
  }).filter(Boolean);
}
