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

  // ─── Vague 2 : écrans HACCP — BROUILLON, non relu, mêmes réserves qu'en
  // haut de fichier. Le français est en commentaire à côté de chaque ligne
  // pour faciliter la relecture par un locuteur natif.

  // Réception
  recv_title: "وصولی",                              // Réception
  recv_subtitle: "ہر ترسیل کی جانچ",                 // Contrôle de chaque livraison
  recv_empty_title: "کوئی وصولی نہیں",                // Aucune réception
  recv_empty_sub: "+ بٹن سے اپنی اگلی ترسیل ریکارڈ کریں", // Enregistre ta prochaine livraison avec le bouton +
  recv_new: "نئی وصولی",                             // Nouvelle réception
  recv_product: "پروڈکٹ",                            // Produit
  recv_supplier: "سپلائر",                           // Fournisseur
  recv_qty: "مقدار",                                 // Quantité
  recv_lot: "لاٹ نمبر",                              // N° lot
  recv_dlc: "میعاد ختم ہونے کی تاریخ",                // DLC
  recv_temp_at_arrival: "وصولی پر درجہ حرارت",        // Température à réception
  recv_out_of_range: "معیار سے باہر",                 // Hors norme
  recv_aspect: "ظاہری حالت",                          // Aspect
  recv_packaging: "پیکنگ",                            // Emballage
  recv_conform: "درست",                               // Conforme
  recv_not_conform: "غیر درست",                       // Non conforme
  recv_intact: "برقرار",                              // Intact
  recv_damaged: "خراب",                               // Endommagé
  recv_save: "محفوظ کریں",                            // Enregistrer

  // Cellule
  cool_title: "کولنگ سیل",                            // Cellule
  cool_subtitle: "ٹھنڈا کرنا اور منجمد کرنا",          // Refroidissement & surgélation
  cool_empty_title: "کوئی کولنگ نہیں",                 // Aucun passage en cellule
  cool_empty_sub: "+ بٹن سے ٹھنڈا کرنا یا منجمد کرنا شروع کریں", // Lance un refroidissement ou une surgélation
  cool_new: "کولنگ سیل میں داخلہ",                     // Passage en cellule
  cool_which_operation: "کس قسم کا عمل؟",              // Quel type d'opération ?
  cool_product: "پروڈکٹ",                             // Produit
  cool_qty: "مقدار",                                  // Quantité
  cool_start_temp: "ابتدائی درجہ حرارت",               // Température de départ
  cool_start_timer: "▶ ٹائمر شروع کریں",               // Lancer le chronomètre
  cool_final_temp: "حتمی درجہ حرارت",                  // Température finale
  cool_read_final: "⏹ حتمی درجہ حرارت ریکارڈ کریں",    // Relever la T° finale

  // Huiles de friture
  oils_title: "فرائینگ آئل",                          // Huiles de friture
  oils_subtitle: "پولر مرکبات < 25%",                  // Composés polaires < 25%
  oils_empty_title: "کوئی فرائر ٹریک نہیں",             // Aucune friteuse suivie
  oils_empty_sub: "آئل ٹریکنگ شروع کرنے کے لیے اپنے فرائرز شامل کریں", // Ajoute tes friteuses
  oils_add: "+ فرائر شامل کریں",                       // + Ajouter une friteuse
  oils_add_another: "+ ایک اور فرائر شامل کریں",        // + Ajouter une autre friteuse
  oils_new_fryer: "نیا فرائر",                         // Nouvelle friteuse
  oils_new_test: "+ نیا ٹیسٹ",                         // + Nouveau test
  oils_name: "نام",                                   // Nom
  oils_type: "تیل کی قسم",                             // Type d'huile
  oils_polar: "پولر مرکبات",                           // Composés polaires

  // Traçabilité
  trace_title: "ٹریسیبیلیٹی",                          // Traçabilité
  trace_all_ok: "سب کچھ ٹھیک ہے",                      // Tout est en ordre
  trace_add_product: "پروڈکٹ شامل کریں",                // Ajouter un produit
  trace_photo: "لیبل کی تصویر",                        // Photo de l'étiquette
  trace_photo_sub: "فائل کے ساتھ محفوظ",                // Conservée avec la fiche
  trace_product: "پروڈکٹ",                             // Produit
  trace_supplier: "سپلائر",                            // Fournisseur
  trace_lot: "لاٹ",                                    // Lot
  trace_qty: "مقدار",                                  // Quantité

  // Étiquetage
  label_title: "لیبلنگ",                               // Étiquetage
  label_new: "🏷️ نیا لیبل",                            // Nouvelle étiquette
  label_history: "تاریخچہ · پچھلے 7 دن",                // Historique · 7 derniers jours
  label_purge: "🗑 صاف کریں",                           // Purger

  // Nuisibles
  pest_title: "پیسٹ کنٹرول",                           // Nuisibles
  pest_subtitle: "3D کنٹرول پلان",                     // Plan de lutte 3D
  pest_empty_title: "کوئی مداخلت نہیں",                 // Aucune intervention
  pest_empty_sub: "+ بٹن سے وزٹ یا مشاہدہ ریکارڈ کریں", // Enregistre une visite ou une observation
  pest_new: "نئی مداخلت",                              // Nouvelle intervention
  pest_join_pdf: "📎 کمپنی کی PDF منسلک کریں",          // Joindre le PDF de l'entreprise

  // Formation HACCP
  train_title: "HACCP تربیت",                          // Formation HACCP
  train_subtitle: "سرٹیفکیٹس اور طبی معائنہ",           // Attestations et visas
  train_empty_title: "کوئی فائل نہیں",                  // Aucune fiche
  train_empty_sub: "+ بٹن سے اپنی ٹیم کے سرٹیفکیٹس شامل کریں", // Ajoute les attestations
  train_new: "نئی فائل",                               // Nouvelle fiche
  train_edit: "فائل میں ترمیم کریں",                    // Modifier la fiche
  train_name: "نام",                                   // Nom
  train_role: "عہدہ",                                  // Poste
  train_haccp_until: "HACCP سرٹیفکیٹ کب تک درست ہے",    // Attestation HACCP valide jusqu'au
  train_visa_until: "طبی معائنہ کب تک درست ہے",         // Visite médicale valide jusqu'au
  train_save: "شامل کریں",                             // Ajouter
  train_update: "اپ ڈیٹ کریں",                          // Mettre à jour
  train_delete: "🗑 یہ فائل حذف کریں",                  // Supprimer cette fiche
};
