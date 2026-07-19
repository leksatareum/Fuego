// ═══════════════════════════════════════════════════════════════════════════
//  FUEGO — Textes en français (référence)
//  © 2026 Alexandre Valery. Tous droits réservés.
// ═══════════════════════════════════════════════════════════════════════════
//
//  Ce fichier ne contient QUE du texte, volontairement séparé de App.jsx pour
//  ne pas alourdir le code principal avec des blocs de texte étranger. Chaque
//  langue ajoutée est un fichier de plus ici, jamais une modification de la
//  logique de l'app.
//
//  PÉRIMÈTRE ACTUEL (phase 1) : uniquement les écrans du quotidien —
//  connexion, navigation, Températures, Nettoyage, Mise en place. Le reste de
//  l'app (Paramètres, GBPH, Registre, Recettes…) reste en français pour tout
//  le monde à ce stade.
// ═══════════════════════════════════════════════════════════════════════════

export default {
  // Navigation du bas
  nav_home: "Aujourd'hui",
  nav_haccp: "HACCP",
  nav_tasks: "Mise en place",
  nav_more: "Plus",

  // Connexion
  login_tagline: "Le système d'exploitation de votre restaurant",
  login_who: "Qui êtes-vous ?",
  login_pin_for: "Code PIN pour",
  login_back: "Retour",
  login_pin_error: "PIN incorrect",

  // Températures
  temp_title: "Températures",
  temp_subtitle: "Un relevé matin et un soir, par équipement",
  temp_fridges: "Frigos",
  temp_freezers: "Congélateurs",
  temp_target: "Cible",
  temp_morning: "Matin",
  temp_evening: "Soir",
  temp_add: "+ Relever",
  temp_out_of_range: "équipement(s) hors norme",
  temp_check_now: "Vérification immédiate requise",
  temp_empty_fridge: "Aucun frigo",
  temp_empty_freezer: "Aucun congélateur",
  temp_empty_sub: "Ajoute tes équipements dans Paramètres → Réglages HACCP",
  temp_reading_for: "Relevé",
  temp_out_of_range_warn: "Hors norme. Vérifier le frigo, transférer les produits si nécessaire.",
  temp_signed: "Signé",
  temp_save: "Enregistrer",
  temp_cancel: "Annuler",

  // Nettoyage
  clean_title: "Nettoyage",
  clean_overall: "Ensemble",
  clean_mark_all: "Tout marquer fait",
  clean_saving: "Enregistrement…",
  clean_empty_title: "Aucune zone",
  clean_empty_sub: "Rien de programmé sur cette fréquence",
  clean_done_on: "fait le",
  clean_done_by: "par",
  clean_freq_daily: "Quotidien",
  clean_freq_weekly: "Hebdomadaire",
  clean_freq_monthly: "Mensuel",
  clean_freq_quarterly: "Trimestriel",
  clean_freq_after_use: "Après usage",

  // Mise en place
  tasks_title: "Mise en place",
  tasks_current_service: "Service en cours",
  tasks_other_slot: "Vous préparez un autre créneau",
  tasks_back_to_current: "Revenir au service en cours",
  tasks_done_count: "fait",
  tasks_add: "Ajouter une tâche",
  tasks_will_be_added_to: "Cette tâche sera ajoutée à",
  tasks_not_current: "Ce n'est pas le service en cours",
  tasks_task_name: "Tâche",
  tasks_responsible: "Responsable",
  tasks_quantity: "Quantité",
  tasks_priority: "Priorité",
  tasks_save: "Ajouter",
  tasks_cancel: "Annuler",
  tasks_slot_midi: "Midi",
  tasks_slot_soir: "Soir",

  // Communs
  common_save: "Enregistrer",
  common_cancel: "Annuler",
  common_yes: "Oui",
  common_no: "Non",

  // ─── Vague 2 : écrans HACCP (Réception, Cellule, Huiles, Traçabilité,
  // Étiquetage, Nuisibles, Formation). Couvre l'essentiel visible — titres,
  // sous-titres, états vides, boutons principaux, libellés de champs. Les
  // textes très imbriqués (ex. bannières de conformité à chaque étape de la
  // Cellule) restent en français pour l'instant.

  // Réception
  recv_title: "Réception",
  recv_subtitle: "Contrôle de chaque livraison",
  recv_empty_title: "Aucune réception",
  recv_empty_sub: "Enregistre ta prochaine livraison avec le bouton +",
  recv_new: "Nouvelle réception",
  recv_product: "Produit",
  recv_supplier: "Fournisseur",
  recv_qty: "Quantité",
  recv_lot: "N° lot",
  recv_dlc: "DLC",
  recv_temp_at_arrival: "Température à réception",
  recv_out_of_range: "Hors norme",
  recv_aspect: "Aspect",
  recv_packaging: "Emballage",
  recv_conform: "Conforme",
  recv_not_conform: "Non conforme",
  recv_intact: "Intact",
  recv_damaged: "Endommagé",
  recv_save: "Enregistrer",

  // Cellule
  cool_title: "Cellule",
  cool_subtitle: "Refroidissement & surgélation",
  cool_empty_title: "Aucun passage en cellule",
  cool_empty_sub: "Lance un refroidissement ou une surgélation avec le bouton +",
  cool_new: "Passage en cellule",
  cool_which_operation: "Quel type d'opération ?",
  cool_product: "Produit",
  cool_qty: "Quantité",
  cool_start_temp: "Température de départ",
  cool_start_timer: "▶ Lancer le chronomètre",
  cool_final_temp: "Température finale",
  cool_read_final: "⏹ Relever la T° finale",

  // Huiles de friture
  oils_title: "Huiles de friture",
  oils_subtitle: "Composés polaires < 25%",
  oils_empty_title: "Aucune friteuse suivie",
  oils_empty_sub: "Ajoute tes friteuses pour commencer le suivi des huiles",
  oils_add: "+ Ajouter une friteuse",
  oils_add_another: "+ Ajouter une autre friteuse",
  oils_new_fryer: "Nouvelle friteuse",
  oils_new_test: "+ Nouveau test",
  oils_name: "Nom",
  oils_type: "Type d'huile",
  oils_polar: "Composés polaires",

  // Traçabilité
  trace_title: "Traçabilité",
  trace_all_ok: "Tout est en ordre",
  trace_add_product: "Ajouter un produit",
  trace_photo: "Photo de l'étiquette",
  trace_photo_sub: "Conservée avec la fiche",
  trace_product: "Produit",
  trace_supplier: "Fournisseur",
  trace_lot: "Lot",
  trace_qty: "Quantité",

  // Étiquetage
  label_title: "Étiquetage",
  label_new: "🏷️ Nouvelle étiquette",
  label_history: "Historique · 7 derniers jours",
  label_purge: "🗑 Purger",

  // Nuisibles
  pest_title: "Nuisibles",
  pest_subtitle: "Plan de lutte 3D",
  pest_empty_title: "Aucune intervention",
  pest_empty_sub: "Enregistre une visite ou une observation avec le bouton +",
  pest_new: "Nouvelle intervention",
  pest_join_pdf: "📎 Joindre le PDF de l'entreprise",

  // Formation HACCP
  train_title: "Formation HACCP",
  train_subtitle: "Attestations et visas",
  train_empty_title: "Aucune fiche",
  train_empty_sub: "Ajoute les attestations de ton équipe avec le bouton +",
  train_new: "Nouvelle fiche",
  train_edit: "Modifier la fiche",
  train_name: "Nom",
  train_role: "Poste",
  train_haccp_until: "Attestation HACCP valide jusqu'au",
  train_visa_until: "Visite médicale valide jusqu'au",
  train_save: "Ajouter",
  train_update: "Mettre à jour",
  train_delete: "🗑 Supprimer cette fiche",

  // ─── Vague 3 : Accueil, menu Plus, Recettes (liste), Planning (vue).
  // Les bannières très dynamiques de la Cellule et de la Réception, ainsi
  // que l'éditeur complet de fiches techniques, restent en français pour
  // l'instant (textes très imbriqués, plus complexes à couvrir proprement).

  // Accueil
  home_greeting_morning: "Bonjour",
  home_greeting_afternoon: "Bon après-midi",
  home_greeting_evening: "Bonsoir",
  home_all_clear_title: "Tout est sous contrôle",
  home_all_clear_sub: "Profitez d'un moment de calme",
  home_now: "Maintenant",
  home_upcoming: "À venir",
  home_ongoing: "En cours",
  home_quick_access: "Accès rapide",
  home_handle_now: "Traiter maintenant →",
  home_morning_readings: "Relevés matin",
  home_evening_readings: "Relevés soir",
  home_tasks: "Mise en place",
  home_cleaning: "Nettoyage",
  home_end_cleaning: "Nettoyage de fin",
  home_supplier_reception: "Réception fournisseurs",
  home_product_labeling: "Étiquetage produits",
  home_tile_labeling: "Étiquetage",
  home_tile_temps: "Températures",
  home_tile_trace: "Traçabilité",

  // Menu Plus
  more_title: "Outils",
  more_subtitle: "Toutes les fonctions",
  more_margins: "Marges",
  more_margins_sub: "Rentabilité",
  more_team_planning: "Planning équipe",
  more_team_planning_sub: "Horaires",
  more_help: "Aide",
  more_manual: "Notice d'utilisation",
  more_manual_sub: "Comment se servir de Fuego",
  more_gbph: "Guide des bonnes pratiques",
  more_gbph_sub: "Règles d'hygiène HACCP",
  more_settings_group_staff: "Réglages",
  more_settings: "Paramètres",
  more_settings_printer_sub: "Imprimante d'étiquettes",

  // Recettes (vue liste)
  recipe_title: "Fiches techniques",
  recipe_tab_dishes: "Plats",
  recipe_tab_preps: "Préparations",
  recipe_empty_prep: "Aucune préparation",
  recipe_empty_dish: "Aucun plat",
  recipe_empty_prep_sub: "Crée tes bases (sauces, fonds…) avec le bouton +",
  recipe_empty_dish_sub: "Crée ton premier plat avec le bouton +",

  // Planning
  planning_title: "Planning",
  planning_view_table: "Tableau",
  planning_view_day: "Par jour",
  planning_team: "Équipe",

  // ─── Vague finale : bannières dynamiques Cellule, Remise en température
  // (jamais couverte avant), éditeur et détail de fiche technique.

  // Cellule — bannières et minuteur
  cool_mode_refroid: "Refroidissement",
  cool_mode_refroid_sub: "63°C → 10°C à cœur",
  cool_mode_surgel: "Surgélation",
  cool_mode_surgel_sub: "jusqu'à −18°C à cœur",
  cool_departure: "Départ",
  cool_limit: "Limite",
  cool_over_limit: "⚠ Limite dépassée",
  cool_near_limit: "⚠ Bientôt la limite",
  cool_on_time: "✓ Dans les temps",
  cool_duration: "Durée",
  cool_core_temp_surgel: "T° à cœur — cible ≤ −18°C",
  cool_core_temp_refroid: "T° à cœur — cible ≤ 10°C",
  cool_nonconform: "Non conforme.",
  cool_continue_freezing: "Poursuivre la surgélation.",
  cool_conform: "Conforme.",
  cool_frozen_dlc: "Surgelé · DLC +6 mois.",
  cool_recook_discard: "Remettre en cuisson ou jeter.",
  cool_dlc_j: "DLC J+",
  cool_save: "Enregistrer",

  // Remise en température
  reheat_title: "Remise en T°",
  reheat_empty_title: "Aucune remise en température",
  reheat_empty_sub: "Enregistre ta prochaine remise en T° avec le bouton +",
  reheat_final_temp: "T° finale",
  reheat_duration: "Durée",
  reheat_new: "Remise en température",
  reheat_product: "Produit",
  reheat_core_temp: "T° finale à cœur",
  reheat_duration_min: "Durée (minutes)",
  reheat_conform: "Conforme.",
  reheat_save: "Enregistrer",

  // Éditeur de fiche technique
  redit_cancel: "← Annuler",
  redit_update: "Mettre à jour",
  redit_create: "Créer",
  redit_title_new: "Nouvelle recette",
  redit_title_edit: "Modifier",
  redit_subtitle: "Coûts calculés automatiquement",
  redit_type: "Type",
  redit_type_dish: "🍽️ Plat",
  redit_type_prep: "🧪 Préparation",
  redit_icon: "Icône",
  redit_name: "Nom",
  redit_category: "Catégorie",
  redit_price: "Prix (€)",
  redit_portions: "Portions",
  redit_yield: "Rendement",
  redit_unit: "Unité",
  redit_cost_preview: "Aperçu coûts",
  redit_cost_per_portion: "Coût/portion",
  redit_margin: "Marge",
  redit_total_cost: "Coût total",
  redit_ingredients: "Ingrédients",
  redit_add_ingredient: "+ Ingrédient",
  redit_add_prep: "+ 🧪 Prépa",
  redit_no_ingredient: "Aucun ingrédient",
  redit_free_entry: "— Saisie libre —",
  redit_ingredient_name: "Nom de l'ingrédient",
  redit_qty: "Qté",
  redit_steps: "Étapes",
  redit_add_step: "+ Étape",
  redit_no_step: "Aucune étape",
  redit_describe: "Décrire…",
  redit_allergens: "Allergènes",

  // Détail de fiche technique
  rdet_back: "← Retour",
  rdet_prep: "Préparation",
  rdet_yield: "Rendement",
  rdet_price: "PRIX",
  rdet_cost_total: "COÛT TOTAL",
  rdet_cost_portion: "COÛT / PORTION",
  rdet_margin: "MARGE",
  rdet_production_mode: "Mode production",
  rdet_multiply: "Multiplier ×",
  rdet_ingredients: "Ingrédients",
  rdet_recipe_tag: "(recette)",
  rdet_preparation: "Préparation",
  rdet_allergens: "Allergènes",
  rdet_none: "Aucun",
  rdet_used_in: "Utilisée dans",
  rdet_edit: "✏️ Modifier",

  // Menu HACCP (page d'accueil du module) — Registre et GBPH restent en
  // français (documents de référence/admin), le reste reprend les titres
  // déjà traduits ailleurs.
  haccp_hub_title: "HACCP",
  haccp_hub_subtitle: "Plan de Maîtrise Sanitaire",
  haccp_group_daily: "Contrôles quotidiens",
  haccp_group_trace: "Traçabilité",
  haccp_group_hygiene: "Hygiène et personnel",
  temp_hub_sub: "Matin et soir, par frigo",
  recv_hub_sub: "Contrôle livraisons",
  reheat_hub_sub: "≥ 63°C en moins d'1h",
  label_hub_sub: "Impression DLC + allergènes",
  pest_hub_sub: "Visites et contrôles",
  train_hub_sub: "Attestations",
};
