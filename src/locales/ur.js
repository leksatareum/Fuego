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

  // ─── Vague 3 : Accueil, menu Plus, Recettes (liste), Planning — BROUILLON,
  // mêmes réserves qu'en haut de fichier.

  // Accueil
  home_greeting_morning: "السلام علیکم",              // Bonjour
  home_greeting_afternoon: "دن بخیر",                 // Bon après-midi
  home_greeting_evening: "شام بخیر",                  // Bonsoir
  home_all_clear_title: "سب کچھ قابو میں ہے",          // Tout est sous contrôle
  home_all_clear_sub: "سکون کا لمحہ لیں",              // Profitez d'un moment de calme
  home_now: "ابھی",                                    // Maintenant
  home_upcoming: "آنے والا",                           // À venir
  home_ongoing: "جاری",                                // En cours
  home_quick_access: "فوری رسائی",                     // Accès rapide
  home_handle_now: "ابھی حل کریں →",                    // Traiter maintenant →
  home_morning_readings: "صبح کی ریڈنگ",                // Relevés matin
  home_evening_readings: "شام کی ریڈنگ",                // Relevés soir
  home_tasks: "تیاری",                                 // Mise en place
  home_cleaning: "صفائی",                               // Nettoyage
  home_end_cleaning: "اختتامی صفائی",                    // Nettoyage de fin
  home_supplier_reception: "سپلائرز کی وصولی",           // Réception fournisseurs
  home_product_labeling: "پروڈکٹ لیبلنگ",               // Étiquetage produits
  home_tile_labeling: "لیبلنگ",                         // Étiquetage
  home_tile_temps: "درجہ حرارت",                        // Températures
  home_tile_trace: "ٹریسیبیلیٹی",                       // Traçabilité

  // Menu Plus
  more_title: "ٹولز",                                  // Outils
  more_subtitle: "تمام فنکشنز",                        // Toutes les fonctions
  more_margins: "منافع",                               // Marges
  more_margins_sub: "منافع بخشی",                       // Rentabilité
  more_team_planning: "ٹیم پلاننگ",                    // Planning équipe
  more_team_planning_sub: "اوقاتِ کار",                 // Horaires
  more_help: "مدد",                                    // Aide
  more_manual: "استعمال کی ہدایات",                     // Notice d'utilisation
  more_manual_sub: "Fuego کیسے استعمال کریں",           // Comment se servir de Fuego
  more_gbph: "اچھے طریقوں کی رہنمائی",                  // Guide des bonnes pratiques
  more_gbph_sub: "HACCP حفظان صحت کے اصول",             // Règles d'hygiène HACCP
  more_settings_group_staff: "ترتیبات",                 // Réglages
  more_settings: "ترتیبات",                             // Paramètres
  more_settings_printer_sub: "لیبل پرنٹر",              // Imprimante d'étiquettes

  // Recettes
  recipe_title: "تکنیکی شیٹس",                          // Fiches techniques
  recipe_tab_dishes: "کھانے",                           // Plats
  recipe_tab_preps: "تیاریاں",                          // Préparations
  recipe_empty_prep: "کوئی تیاری نہیں",                  // Aucune préparation
  recipe_empty_dish: "کوئی ڈش نہیں",                    // Aucun plat
  recipe_empty_prep_sub: "+ بٹن سے اپنی بنیادی تیاریاں شامل کریں", // Crée tes bases avec le bouton +
  recipe_empty_dish_sub: "+ بٹن سے اپنی پہلی ڈش بنائیں", // Crée ton premier plat avec le bouton +

  // Planning
  planning_title: "پلاننگ",                            // Planning
  planning_view_table: "جدول",                         // Tableau
  planning_view_day: "دن کے حساب سے",                   // Par jour
  planning_team: "ٹیم",                                // Équipe

  // ─── Vague finale : Cellule (bannières), Remise en température, éditeur
  // et détail de fiche technique — BROUILLON, mêmes réserves.

  // Cellule
  cool_mode_refroid: "ٹھنڈا کرنا",                      // Refroidissement
  cool_mode_refroid_sub: "63°C → 10°C دل تک",           // 63°C → 10°C à cœur
  cool_mode_surgel: "منجمد کرنا",                        // Surgélation
  cool_mode_surgel_sub: "−18°C دل تک",                  // jusqu'à −18°C à cœur
  cool_departure: "شروع",                               // Départ
  cool_limit: "حد",                                     // Limite
  cool_over_limit: "⚠ حد سے تجاوز",                      // ⚠ Limite dépassée
  cool_near_limit: "⚠ حد قریب ہے",                       // ⚠ Bientôt la limite
  cool_on_time: "✓ وقت پر",                             // ✓ Dans les temps
  cool_duration: "دورانیہ",                             // Durée
  cool_core_temp_surgel: "دل کا درجہ حرارت — ہدف ≤ −18°C", // T° à cœur — cible ≤ −18°C
  cool_core_temp_refroid: "دل کا درجہ حرارت — ہدف ≤ 10°C", // T° à cœur — cible ≤ 10°C
  cool_nonconform: "غیر درست۔",                          // Non conforme.
  cool_continue_freezing: "منجمد کرنا جاری رکھیں۔",        // Poursuivre la surgélation.
  cool_conform: "درست۔",                                // Conforme.
  cool_frozen_dlc: "منجمد · میعاد +6 ماہ۔",              // Surgelé · DLC +6 mois.
  cool_recook_discard: "دوبارہ پکائیں یا پھینک دیں۔",      // Remettre en cuisson ou jeter.
  cool_dlc_j: "میعاد J+",                               // DLC J+
  cool_save: "محفوظ کریں",                              // Enregistrer

  // Remise en température
  reheat_title: "دوبارہ گرم کرنا",                       // Remise en T°
  reheat_empty_title: "کوئی ریکارڈ نہیں",                // Aucune remise en température
  reheat_empty_sub: "+ بٹن سے اگلا ریکارڈ درج کریں",     // Enregistre ta prochaine remise en T°
  reheat_final_temp: "حتمی درجہ حرارت",                  // T° finale
  reheat_duration: "دورانیہ",                           // Durée
  reheat_new: "دوبارہ گرم کرنا",                         // Remise en température
  reheat_product: "پروڈکٹ",                             // Produit
  reheat_core_temp: "دل کا حتمی درجہ حرارت",             // T° finale à cœur
  reheat_duration_min: "دورانیہ (منٹ)",                  // Durée (minutes)
  reheat_conform: "درست۔",                              // Conforme.
  reheat_save: "محفوظ کریں",                            // Enregistrer

  // Éditeur de fiche technique
  redit_cancel: "← منسوخ کریں",                          // Annuler
  redit_update: "اپ ڈیٹ کریں",                          // Mettre à jour
  redit_create: "بنائیں",                               // Créer
  redit_title_new: "نئی ترکیب",                         // Nouvelle recette
  redit_title_edit: "ترمیم کریں",                        // Modifier
  redit_subtitle: "لاگت خودکار طور پر شمار",             // Coûts calculés automatiquement
  redit_type: "قسم",                                    // Type
  redit_type_dish: "🍽️ ڈش",                            // Plat
  redit_type_prep: "🧪 تیاری",                          // Préparation
  redit_icon: "آئیکن",                                  // Icône
  redit_name: "نام",                                    // Nom
  redit_category: "زمرہ",                                // Catégorie
  redit_price: "قیمت (€)",                              // Prix (€)
  redit_portions: "پورشنز",                             // Portions
  redit_yield: "پیداوار",                               // Rendement
  redit_unit: "اکائی",                                  // Unité
  redit_cost_preview: "لاگت کا جائزہ",                   // Aperçu coûts
  redit_cost_per_portion: "لاگت/پورشن",                  // Coût/portion
  redit_margin: "منافع",                                // Marge
  redit_total_cost: "کل لاگت",                          // Coût total
  redit_ingredients: "اجزاء",                            // Ingrédients
  redit_add_ingredient: "+ جزو",                        // + Ingrédient
  redit_add_prep: "+ 🧪 تیاری",                          // + Prépa
  redit_no_ingredient: "کوئی جزو نہیں",                   // Aucun ingrédient
  redit_free_entry: "— آزاد اندراج —",                   // — Saisie libre —
  redit_ingredient_name: "جزو کا نام",                    // Nom de l'ingrédient
  redit_qty: "مقدار",                                   // Qté
  redit_steps: "مراحل",                                 // Étapes
  redit_add_step: "+ مرحلہ",                             // + Étape
  redit_no_step: "کوئی مرحلہ نہیں",                       // Aucune étape
  redit_describe: "تفصیل بیان کریں…",                    // Décrire…
  redit_allergens: "الرجن",                              // Allergènes

  // Détail de fiche technique
  rdet_back: "← واپس",                                  // Retour
  rdet_prep: "تیاری",                                   // Préparation
  rdet_yield: "پیداوار",                                // Rendement
  rdet_price: "قیمت",                                   // PRIX
  rdet_cost_total: "کل لاگت",                           // COÛT TOTAL
  rdet_cost_portion: "لاگت / پورشن",                     // COÛT / PORTION
  rdet_margin: "منافع",                                 // MARGE
  rdet_production_mode: "پیداواری موڈ",                  // Mode production
  rdet_multiply: "ضرب ×",                               // Multiplier ×
  rdet_ingredients: "اجزاء",                             // Ingrédients
  rdet_recipe_tag: "(ترکیب)",                            // (recette)
  rdet_preparation: "تیاری",                             // Préparation
  rdet_allergens: "الرجن",                              // Allergènes
  rdet_none: "کوئی نہیں",                                // Aucun
  rdet_used_in: "استعمال ہوتا ہے",                       // Utilisée dans
  rdet_edit: "✏️ ترمیم کریں",                            // Modifier

  // Menu HACCP
  haccp_hub_title: "HACCP",                             // HACCP
  haccp_hub_subtitle: "حفاظتی نگرانی کا منصوبہ",          // Plan de Maîtrise Sanitaire
  haccp_group_daily: "روزانہ کے معائنے",                  // Contrôles quotidiens
  haccp_group_trace: "ٹریسیبیلیٹی",                      // Traçabilité
  haccp_group_hygiene: "حفظان صحت اور عملہ",              // Hygiène et personnel
  temp_hub_sub: "صبح اور شام، ہر فریج کے لیے",            // Matin et soir, par frigo
  recv_hub_sub: "ترسیل کی جانچ",                          // Contrôle livraisons
  reheat_hub_sub: "≥ 63°C ایک گھنٹے سے کم میں",           // ≥ 63°C en moins d'1h
  label_hub_sub: "میعاد اور الرجن پرنٹنگ",                // Impression DLC + allergènes
  pest_hub_sub: "وزٹس اور معائنے",                       // Visites et contrôles
  train_hub_sub: "سرٹیفکیٹس",                            // Attestations
};
