// ═══════════════════════════════════════════════════════════════════════════
//  FUEGO — اردو (Urdu) — BROUILLON, PAS ENCORE VALIDÉ
//  © 2026 Alexandre Valery. Tous droits réservés.
// ═══════════════════════════════════════════════════════════════════════════
//
//  Ce fichier remplace locales/ps.js : la langue de l'équipe est l'ourdou,
//  pas le pachto (les deux s'écrivent de droite à gauche mais sont des
//  langues différentes, avec un vocabulaire distinct — vérifie que
//  locales/ps.js a bien été supprimé de ton dépôt pour ne pas laisser
//  traîner un fichier obsolète).
//
//  ⚠️ IMPORTANT — À LIRE AVANT DE METTRE EN PRODUCTION ⚠️
//
//  Ces traductions ont été produites par une IA (Claude), qui n'a PAS de
//  maîtrise fiable de l'ourdou. Elles sont un point de départ, pas un texte
//  validé. AVANT toute mise en service pour l'équipe :
//
//    1. Faire relire ce fichier ligne par ligne par un locuteur natif —
//       le commentaire français à côté de chaque ligne facilite cette
//       relecture, pour comparer le sens.
//    2. Vérifier en particulier les tournures liées à la sécurité :
//       "Hors norme", "Vérification immédiate requise" — un contresens ici
//       a un vrai impact sur la sécurité alimentaire, pas juste sur le style.
//    3. Corriger directement les valeurs ci-dessous (garder les clés à
//       gauche identiques, ne changer que le texte à droite).
//
//  Tant que ce fichier n'a pas été relu, il est recommandé de ne PAS annoncer
//  l'ourdou comme langue disponible à l'équipe — le laisser dans le code ne
//  pose pas de risque, c'est l'usage réel qui doit attendre la relecture.
//
//  Le sigle "HACCP" est volontairement laissé tel quel.
// ═══════════════════════════════════════════════════════════════════════════

export default {
  // Navigation du bas
  nav_home: "آج",                  // Aujourd'hui
  nav_haccp: "HACCP",               // HACCP (sigle conservé)
  nav_tasks: "تیاری",               // Mise en place
  nav_more: "مزید",                 // Plus

  // Connexion
  login_tagline: "آپ کے ریستوران کا آپریٹنگ سسٹم", // Le système d'exploitation de votre restaurant
  login_who: "آپ کون ہیں؟",          // Qui êtes-vous ?
  login_pin_for: "پن کوڈ برائے",     // Code PIN pour
  login_back: "واپس",               // Retour
  login_pin_error: "غلط پن",        // PIN incorrect

  // Températures
  temp_title: "درجہ حرارت",                                    // Températures
  temp_subtitle: "ہر آلے کے لیے صبح اور شام ایک ریڈنگ",         // Un relevé matin et un soir, par équipement
  temp_fridges: "فریج",                                        // Frigos
  temp_freezers: "فریزر",                                      // Congélateurs
  temp_target: "ہدف",                                          // Cible
  temp_morning: "صبح",                                         // Matin
  temp_evening: "شام",                                         // Soir
  temp_add: "+ ریکارڈ کریں",                                    // + Relever
  temp_out_of_range: "آلات معیار سے باہر",                      // équipement(s) hors norme
  temp_check_now: "فوری معائنہ ضروری ہے",                       // Vérification immédiate requise
  temp_empty_fridge: "کوئی فریج نہیں",                          // Aucun frigo
  temp_empty_freezer: "کوئی فریزر نہیں",                        // Aucun congélateur
  temp_empty_sub: "ترتیبات میں اپنے آلات شامل کریں",             // Ajoute tes équipements dans Paramètres
  temp_reading_for: "ریڈنگ",                                    // Relevé
  temp_out_of_range_warn: "معیار سے باہر۔ فریج چیک کریں، ضرورت ہو تو مصنوعات منتقل کریں۔", // Hors norme. Vérifier le frigo, transférer les produits si nécessaire.
  temp_signed: "دستخط شدہ",                                     // Signé
  temp_save: "محفوظ کریں",                                      // Enregistrer
  temp_cancel: "منسوخ کریں",                                    // Annuler

  // Nettoyage
  clean_title: "صفائی",                                        // Nettoyage
  clean_overall: "کل",                                          // Ensemble
  clean_mark_all: "سب کو مکمل نشان زد کریں",                    // Tout marquer fait
  clean_saving: "محفوظ ہو رہا ہے…",                             // Enregistrement…
  clean_empty_title: "کوئی زون نہیں",                            // Aucune zone
  clean_empty_sub: "اس تعدد پر کچھ طے شدہ نہیں",                 // Rien de programmé sur cette fréquence
  clean_done_on: "مکمل ہوا بتاریخ",                              // fait le
  clean_done_by: "بذریعہ",                                      // par
  clean_freq_daily: "روزانہ",                                   // Quotidien
  clean_freq_weekly: "ہفتہ وار",                                // Hebdomadaire
  clean_freq_monthly: "ماہانہ",                                 // Mensuel
  clean_freq_quarterly: "سہ ماہی",                              // Trimestriel
  clean_freq_after_use: "استعمال کے بعد",                        // Après usage

  // Mise en place
  tasks_title: "تیاری",                                        // Mise en place
  tasks_current_service: "جاری سروس",                            // Service en cours
  tasks_other_slot: "آپ ایک اور وقت کی تیاری کر رہے ہیں",        // Vous préparez un autre créneau
  tasks_back_to_current: "جاری سروس پر واپس جائیں",              // Revenir au service en cours
  tasks_done_count: "مکمل",                                     // fait
  tasks_add: "کام شامل کریں",                                   // Ajouter une tâche
  tasks_will_be_added_to: "یہ کام شامل کیا جائے گا",             // Cette tâche sera ajoutée à
  tasks_not_current: "یہ جاری سروس نہیں ہے",                     // Ce n'est pas le service en cours
  tasks_task_name: "کام",                                       // Tâche
  tasks_responsible: "ذمہ دار",                                 // Responsable
  tasks_quantity: "مقدار",                                      // Quantité
  tasks_priority: "ترجیح",                                      // Priorité
  tasks_save: "شامل کریں",                                      // Ajouter
  tasks_cancel: "منسوخ کریں",                                   // Annuler
  tasks_slot_midi: "دوپہر",                                     // Midi
  tasks_slot_soir: "شام",                                       // Soir

  // Communs
  common_save: "محفوظ کریں",  // Enregistrer
  common_cancel: "منسوخ کریں", // Annuler
  common_yes: "ہاں",           // Oui
  common_no: "نہیں",           // Non
};
