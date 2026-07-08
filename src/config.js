// ═══════════════════════════════════════════════════════════════════
//  CONFIGURATION FUEGO — LE SEUL FICHIER À MODIFIER
// ═══════════════════════════════════════════════════════════════════
//
//  Remplace les deux valeurs ci-dessous par TES clés Supabase.
//  Tu les trouveras dans Supabase → Settings (roue crantée) → Data API
//
//  ⚠️  Garde bien les guillemets " " autour de chaque valeur.
//
// ═══════════════════════════════════════════════════════════════════

const env = import.meta.env || {};

export const SUPABASE_URL =
  env.VITE_SUPABASE_URL || "https://xrzrpjuapwiyfpnnwbdw.supabase.co";

export const SUPABASE_ANON =
  env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhyenJwanVhcHdpeWZwbm53YmR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0NTQxNzYsImV4cCI6MjA5OTAzMDE3Nn0.kMV9TDcNw3qWZwxwfpK0ok9-krIwKC4PeiHxfeN5gXg";

// Exemple de ce à quoi ça doit ressembler une fois rempli :
//
// export const SUPABASE_URL  = "https://abcdefgh.supabase.co";
// export const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6...";
