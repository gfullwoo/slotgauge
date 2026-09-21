// Distinguishing features for Delaware species that anglers (and vision models) mix up.
// Keyed by DNREC species id. Used to build the identification prompt and the head-to-head verify pass.
export const LOOKALIKES = [
  {
    group: 'Tautog vs Black Sea Bass vs Oyster Toadfish',
    ids: [187, 93, 143],
    notes: {
      187: 'Tautog: blunt rounded (not flattened) head, thick rubbery lips, small mouth with visible front teeth, body fully SCALED, dark mottled olive/brown/black with a pale chin, rounded tail with no filaments, long low dorsal fin, stout deep body that stays deep to the tail.',
      143: 'Oyster Toadfish: very wide FLATTENED head that is the widest part of the fish, huge gaping mouth, fleshy tabs/barbels along the jaw, scaleless slimy skin, body tapers sharply to a small tail, fan-like pectorals; looks like a tadpole/frog. If the head is not flattened and the body has scales, it is NOT a toadfish.',
      93: 'Black Sea Bass: large mouth, pointed head, dorsal spines with white or blue-white fleshy tabs/filaments, tail with an elongated upper filament, blue/white spotting on scales and fins, pale belly, bright blue accents on breeding males.',
    },
  },
  {
    group: 'Summer vs Winter vs Windowpane Flounder',
    ids: [185, 197, 196],
    notes: {
      185: 'Summer Flounder (fluke): eyes on LEFT side, large mouth with teeth reaching back past the eye, 5+ distinct ocellated (eye-like ringed) spots, jaw extends past eye.',
      197: 'Winter Flounder: eyes on RIGHT side, tiny mouth ending before the eye, no ocellated spots, uniform dark brown, thick body.',
      196: 'Windowpane: thin nearly translucent body, eyes on left, round outline, mottled with small dark speckles, fringed first dorsal rays.',
    },
  },
  {
    group: 'Weakfish vs Spotted Seatrout',
    ids: [192, 183],
    notes: {
      192: 'Weakfish: spots are small, irregular, arranged in wavy diagonal rows on the upper body only, none on fins, yellow-tinged pelvic/anal fins, iridescent purple/green back, two large canine teeth.',
      183: 'Spotted Seatrout: large distinct round black spots scattered on body AND on dorsal fin and tail, silvery-gray, spots continue onto the tail.',
    },
  },
  {
    group: 'Striped Bass vs Hybrid vs White Perch',
    ids: [203, 54, 204],
    notes: {
      203: 'Striped Bass: 7–8 continuous unbroken horizontal black stripes, streamlined body, two separate dorsal fins, sloping forehead, typically 18+ inches.',
      54: 'Hybrid Striped Bass: stripes broken or interrupted, especially below the lateral line; deeper body, arched back, more compact than a striper.',
      204: 'White Perch: no clear stripes or only faint ones, deep body, silvery-green, small (under 14 inches), dorsal fins joined.',
    },
  },
  {
    group: 'Bluefish vs Spanish Mackerel',
    ids: [100, 176],
    notes: {
      100: 'Bluefish: blue-green back, plain silver sides with no spots, prominent sharp teeth in a strong jaw, moderately forked tail, black blotch at pectoral fin base.',
      176: 'Spanish Mackerel: many yellow/bronze oval spots on the sides, deeply forked tail, slender torpedo body, lateral line curves gently, no black spot on first dorsal.',
    },
  },
  {
    group: 'Largemouth vs Smallmouth Bass',
    ids: [38, 53],
    notes: {
      38: 'Largemouth: jaw extends behind the eye, dark horizontal band along the side, deep notch between dorsal fins, greenish.',
      53: 'Smallmouth: jaw ends below the eye, vertical dark bars, shallow dorsal notch, bronze/brown, red eyes common.',
    },
  },
  {
    group: 'Croaker vs Spot vs Kingfish',
    ids: [79, 180],
    notes: {
      79: 'Atlantic Croaker: silvery-pink with faint oblique dark bars/spots on the back, small chin barbels, slightly forked tail, no shoulder spot.',
      180: 'Spot: single dark spot behind the gill cover at the shoulder, 12–15 faint diagonal bars, deep body, forked tail.',
    },
  },
  {
    group: 'Black Drum vs Red Drum',
    ids: [92, 150],
    notes: {
      92: 'Black Drum: gray/black, chin barbels, deep high-backed body, 4–5 vertical bars on juveniles, no tail spot.',
      150: 'Red Drum (redfish): copper-bronze, one or more black spots at the base of the tail, no chin barbels, streamlined.',
    },
  },
  {
    group: 'Scup vs Sheepshead-like porgies',
    ids: [160],
    notes: {
      160: 'Scup (porgy): silvery with faint blue/gold stripes, deep compressed body, small mouth, spiny dorsal, concave head profile.',
    },
  },
];

export function lookalikeText(species) {
  const byId = new Map(species.map((s) => [s.id, s]));
  return LOOKALIKES.map((g) => `${g.group}:\n` + Object.entries(g.notes).filter(([id]) => byId.has(+id)).map(([id, n]) => `  [${id}] ${n}`).join('\n')).join('\n');
}

/** Notes for a specific set of candidate ids (for the verify pass). */
export function notesFor(ids) {
  const out = [];
  for (const g of LOOKALIKES) for (const [id, n] of Object.entries(g.notes)) if (ids.includes(+id)) out.push(`[${id}] ${n}`);
  return out.join('\n');
}
