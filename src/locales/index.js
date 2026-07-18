// ═══════════════════════════════════════════════════════════════════════════
//  FUEGO — Sélecteur de langue
//  © 2026 Alexandre Valery. Tous droits réservés.
//
//  Fichier volontairement minuscule : aucun texte traduit n'y vit, juste le
//  branchement entre une clé de langue et son fichier. Ajouter une langue =
//  ajouter un fichier locales/xx.js + une ligne ici, jamais toucher App.jsx.
// ═══════════════════════════════════════════════════════════════════════════
import fr from "./fr.js";
import ur from "./ur.js";

export const LOCALES = { fr, ur };

// Métadonnées d'affichage + sens d'écriture par langue.
export const LANGS = [
  { code: "fr", label: "Français", flag: "🇫🇷", dir: "ltr" },
  { code: "ur", label: "اردو",     flag: "🇵🇰", dir: "rtl" },
];

// t("clé", "ps") → texte pachto, ou repli sur le français si la clé manque,
// ou la clé elle-même en dernier recours (jamais un écran vide).
export function t(key, lang = "fr") {
  return LOCALES[lang]?.[key] ?? LOCALES.fr[key] ?? key;
}

export function dirFor(lang) {
  return LANGS.find(l => l.code === lang)?.dir || "ltr";
}

