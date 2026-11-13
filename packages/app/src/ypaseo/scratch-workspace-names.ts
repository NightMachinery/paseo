// YPaseo fork: see YPASEO.md. Friendly names for scratch repositories, such as
// "rabbit-runs-wryly": a noun, a verb that agrees with it, and an adverb.

const NOUNS = [
  "badger",
  "beetle",
  "bison",
  "comet",
  "cricket",
  "falcon",
  "ferret",
  "finch",
  "gecko",
  "heron",
  "koala",
  "lemur",
  "lynx",
  "magpie",
  "marmot",
  "moose",
  "newt",
  "otter",
  "owl",
  "panda",
  "pebble",
  "puffin",
  "rabbit",
  "raven",
  "robin",
  "salmon",
  "sparrow",
  "squid",
  "tapir",
  "toad",
  "walrus",
  "wombat",
] as const;

const VERBS = [
  "bakes",
  "climbs",
  "dances",
  "digs",
  "dreams",
  "drifts",
  "floats",
  "glides",
  "hops",
  "hums",
  "jogs",
  "juggles",
  "knits",
  "naps",
  "paints",
  "ponders",
  "roams",
  "rows",
  "runs",
  "sails",
  "sings",
  "skates",
  "sketches",
  "swims",
  "tinkers",
  "wanders",
  "whistles",
  "writes",
] as const;

const ADVERBS = [
  "boldly",
  "briskly",
  "calmly",
  "cheerily",
  "deftly",
  "eagerly",
  "gently",
  "gladly",
  "keenly",
  "kindly",
  "lazily",
  "merrily",
  "neatly",
  "nimbly",
  "proudly",
  "quietly",
  "quickly",
  "shyly",
  "slowly",
  "smoothly",
  "softly",
  "swiftly",
  "warmly",
  "wisely",
  "wryly",
  "zestily",
] as const;

function pick<T>(words: readonly T[], random: () => number): T {
  const index = Math.min(words.length - 1, Math.floor(random() * words.length));
  return words[index]!;
}

/** A name like "rabbit-runs-wryly". `random` returns a number in [0, 1), like `Math.random`. */
export function createScratchProjectName(random: () => number = Math.random): string {
  return `${pick(NOUNS, random)}-${pick(VERBS, random)}-${pick(ADVERBS, random)}`;
}
