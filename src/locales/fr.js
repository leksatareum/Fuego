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
};
