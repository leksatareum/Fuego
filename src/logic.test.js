// ═══════════════════════════════════════════════════════════════════════════
//  FUEGO — logic.test.js
//  Filet de sécurité minimal : chaque test ici correspond à un bug réel
//  rencontré au fil des sessions, pas un test générique. Le but n'est pas la
//  couverture à 100%, mais que ces bugs précis ne puissent plus jamais
//  revenir sans qu'on le sache tout de suite.
//
//  Lancer avec : npm test
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  clamp, safePct, isoDate,
  serviceISODate, serviceDateStr, getServiceWindow,
  cleaningIsDoneToday, coolingConformity, groupRegistreEvents,
} from "./logic.js";

describe("clamp / safePct", () => {
  it("borne correctement une valeur", () => {
    expect(clamp(150)).toBe(100);
    expect(clamp(-10)).toBe(0);
    expect(clamp(50)).toBe(50);
  });
  it("ne divise jamais par zéro", () => {
    expect(safePct(3, 0)).toBe(0);
  });
  it("calcule un pourcentage normal", () => {
    expect(safePct(3, 8)).toBeCloseTo(37.5);
  });
});

describe("serviceISODate — le bug de minuit (session du 20/07)", () => {
  // Bug réel : le nettoyage du soir redevenait "à faire" à minuit pile,
  // des heures avant la vraie fin de service (réglée à 3h par défaut).
  const RESET_SOIR = 3 * 60; // 3h00

  it("23h50 la veille reste sur la date de la veille", () => {
    expect(serviceISODate(RESET_SOIR, new Date("2026-07-19T23:50:00"))).toBe("2026-07-19");
  });
  it("00h05 — juste après minuit — reste sur la date de la veille (le vrai bug corrigé)", () => {
    expect(serviceISODate(RESET_SOIR, new Date("2026-07-20T00:05:00"))).toBe("2026-07-19");
  });
  it("02h59 — juste avant la bascule — reste sur la date de la veille", () => {
    expect(serviceISODate(RESET_SOIR, new Date("2026-07-20T02:59:00"))).toBe("2026-07-19");
  });
  it("03h05 — juste après la bascule — passe au nouveau jour", () => {
    expect(serviceISODate(RESET_SOIR, new Date("2026-07-20T03:05:00"))).toBe("2026-07-20");
  });
  it("plafonne un réglage aberrant (23h59) pour ne jamais bloquer sur la veille toute la journée", () => {
    const RESET_SOIR_ABERRANT = 23 * 60 + 59;
    // Sans le plafond à 9h, TOUTE la journée serait "encore hier soir"
    expect(serviceISODate(RESET_SOIR_ABERRANT, new Date("2026-07-20T14:00:00"))).toBe("2026-07-20");
  });
});

describe("serviceDateStr — même logique, format JJ/MM (Températures/Réception)", () => {
  it("22h30 la veille donne bien la date de la veille au format JJ/MM", () => {
    expect(serviceDateStr(3 * 60, new Date("2026-07-19T22:30:00"))).toBe("19/07");
  });
  it("00h15 reste sur la date de la veille, pas celle du jour calendaire", () => {
    expect(serviceDateStr(3 * 60, new Date("2026-07-20T00:15:00"))).toBe("19/07");
  });
});

describe("getServiceWindow — le seuil de 15h codé en dur (dernier bug trouvé)", () => {
  it("15h30 reste en service midi si resetMidi est réglé à 16h30 (pas l'ancien 15h en dur)", () => {
    const RESET_MIDI = 16 * 60 + 30;
    expect(getServiceWindow(RESET_MIDI, new Date("2026-07-20T15:30:00")).id).toBe("lunch");
  });
  it("16h45 passe bien en préparation soir après 16h30", () => {
    const RESET_MIDI = 16 * 60 + 30;
    expect(getServiceWindow(RESET_MIDI, new Date("2026-07-20T16:45:00")).id).toBe("prep_pm");
  });
  it("respecte un réglage personnalisé à 17h plutôt que la valeur par défaut", () => {
    const RESET_MIDI = 17 * 60;
    expect(getServiceWindow(RESET_MIDI, new Date("2026-07-20T16:45:00")).id).toBe("lunch");
    expect(getServiceWindow(RESET_MIDI, new Date("2026-07-20T17:05:00")).id).toBe("prep_pm");
  });
  it("un réglage aberrant après 18h garde quand même une fenêtre de préparation soir", () => {
    const RESET_MIDI_ABERRANT = 20 * 60; // 20h, plus tard que le début du service du soir (18h)
    // Sans le plafond à 17h59, "prep_pm" n'aurait plus jamais de fenêtre du tout
    expect(getServiceWindow(RESET_MIDI_ABERRANT, new Date("2026-07-20T18:30:00")).id).toBe("dinner");
  });
  it("couvre les 5 fenêtres dans l'ordre", () => {
    const RESET_MIDI = 16 * 60 + 30;
    expect(getServiceWindow(RESET_MIDI, new Date("2026-07-20T08:00:00")).id).toBe("morning");
    expect(getServiceWindow(RESET_MIDI, new Date("2026-07-20T12:00:00")).id).toBe("lunch");
    expect(getServiceWindow(RESET_MIDI, new Date("2026-07-20T17:00:00")).id).toBe("prep_pm");
    expect(getServiceWindow(RESET_MIDI, new Date("2026-07-20T20:00:00")).id).toBe("dinner");
    expect(getServiceWindow(RESET_MIDI, new Date("2026-07-20T23:30:00")).id).toBe("closing");
  });
});

describe("cleaningIsDoneToday — nettoyage quotidien à deux créneaux", () => {
  const RESET_SOIR = 3 * 60;
  const zone = { id: 1, freq: "Quotidien" };
  const now = new Date("2026-07-20T14:00:00");

  it("pas fait du tout -> false", () => {
    expect(cleaningIsDoneToday(zone, [], RESET_SOIR, now)).toBe(false);
  });
  it("seulement le matin fait -> false (le soir manque encore)", () => {
    const checks = [{ cleaningId: 1, date: "2026-07-20", period: "matin" }];
    expect(cleaningIsDoneToday(zone, checks, RESET_SOIR, now)).toBe(false);
  });
  it("matin ET soir faits -> true", () => {
    const checks = [
      { cleaningId: 1, date: "2026-07-20", period: "matin" },
      { cleaningId: 1, date: "2026-07-20", period: "soir" },
    ];
    expect(cleaningIsDoneToday(zone, checks, RESET_SOIR, now)).toBe(true);
  });
  it("une fréquence non-quotidienne se base juste sur .done", () => {
    const zoneHebdo = { id: 2, freq: "Hebdomadaire", done: true };
    expect(cleaningIsDoneToday(zoneHebdo, [], RESET_SOIR, now)).toBe(true);
  });
});

describe("coolingConformity — même règle pour le direct et la saisie rétroactive", () => {
  const maxMin = 120;

  it("refroidissement conforme (90 min, 8°C)", () => {
    expect(coolingConformity("refroid", 90, 8, maxMin)).toBe("ok");
  });
  it("refroidissement NON conforme — trop long (150 min, 8°C)", () => {
    expect(coolingConformity("refroid", 150, 8, maxMin)).toBe("alert");
  });
  it("refroidissement NON conforme — trop chaud (90 min, 12°C)", () => {
    expect(coolingConformity("refroid", 90, 12, maxMin)).toBe("alert");
  });
  it("surgélation conforme (-20°C, durée sans importance)", () => {
    expect(coolingConformity("surgel", 999, -20, maxMin)).toBe("ok");
  });
  it("surgélation NON conforme (-10°C)", () => {
    expect(coolingConformity("surgel", 60, -10, maxMin)).toBe("alert");
  });
});

describe("groupRegistreEvents — la contradiction 23/38 vs \"rien ne manque\"", () => {
  it("range chaque événement dans sa catégorie/module, triés par jour récent d'abord", () => {
    const events = [
      { module: "Huiles", date: "18/07", ts: new Date("2026-07-18T10:00:00") },
      { module: "Huiles", date: "20/07", ts: new Date("2026-07-20T10:00:00") },
      { module: "Traçabilité", date: "19/07", ts: new Date("2026-07-19T10:00:00") },
    ];
    const tree = groupRegistreEvents(events);
    const controles = tree.find(c => c.category === "Contrôles quotidiens");
    const tracabilite = tree.find(c => c.category === "Traçabilité");

    expect(controles.modules[0].module).toBe("Huiles");
    expect(controles.modules[0].dates.map(d => d.date)).toEqual(["20/07", "18/07"]); // récent d'abord
    expect(tracabilite.count).toBe(1);
  });
  it("ne montre jamais de catégorie vide", () => {
    const tree = groupRegistreEvents([{ module: "Huiles", date: "20/07", ts: new Date() }]);
    expect(tree.find(c => c.category === "Hygiène et nettoyage")).toBeUndefined();
  });
});
