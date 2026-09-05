// ---- The curriculum spine ----
//
// THIS IS DATA, NOT LOGIC. Nothing in this file does anything; app.js reads
// it. Editing a week here is the whole job of keeping up with school.
//
// Why .js and not .json, given the plan said JSON: fetching a .json file
// fails over file:// (browsers block it as a cross-origin read), and the
// app's whole promise is "open app/index.html and it runs" — no server, no
// build step. A plain script that assigns one object keeps that promise and
// is edited exactly like JSON. If the app ever gets served locally as a
// matter of course, this becomes a five-line change to a fetch.
//
// The model is PHONEME-FIRST, which is the important bit. ELS teaches /k/ as
// <c>, <k> AND <ck> — one sound, three spellings — from Autumn 1 week 3, and
// by Phase 5 /ai/ is ai, ay, a-e, ey, ea, eigh, a. A flat letter list with
// one sound each cannot express that, so:
//
//   phonemes   the sounds. Each owns ONE audio clip.
//   graphemes  the spellings. Each points at the phoneme it says, so <c>,
//              <k> and <ck> all share phase2/c.wav.
//   weeks      what school taught, in order. Graphemes only.
//
// Scheme: Essential Letters and Sounds (ELS), as taught at Boxted St Peter's
// CEVC Primary — confirmed 5.9.26 from the school's own published handbook.
// Their term for the non-decodable words is "harder to read and spell"
// (`hrs` below), not "tricky words" — worth matching what his teacher says.

const CURRICULUM = {
  scheme: 'Essential Letters and Sounds (ELS)',
  school: "Boxted St Peter's CEVC Primary",
  updated: '2026-09-05',

  // Every phoneme, with the clip that speaks it. Paths are relative to
  // audio/ and get .wav appended. Slash notation matches how ELS writes
  // them, so this list can be checked against the handbook by eye.
  phonemes: {
    '/s/': { sound: 'phase2/s' },
    '/a/': { sound: 'phase2/a' },
    '/t/': { sound: 'phase2/t' },
    '/p/': { sound: 'phase2/p' },
    '/i/': { sound: 'phase2/i' },
    '/n/': { sound: 'phase2/n' },
    '/m/': { sound: 'phase2/m' },
    '/d/': { sound: 'phase2/d' },
    '/g/': { sound: 'phase2/g' },
    '/o/': { sound: 'phase2/o' },
    '/k/': { sound: 'phase2/c' },
    '/e/': { sound: 'phase2/e' },
    '/u/': { sound: 'phase2/u' },
    '/r/': { sound: 'phase2/r' },
    '/h/': { sound: 'phase2/h' },
    '/b/': { sound: 'phase2/b' },
    '/f/': { sound: 'phase2/f' },
    '/l/': { sound: 'phase2/l' },
    '/j/': { sound: 'phase3/j' },
    '/v/': { sound: 'phase3/v' },
    '/w/': { sound: 'phase3/w' },
    '/ks/': { sound: 'phase3/x' },
    '/y/': { sound: 'phase3/y' },
    '/z/': { sound: 'phase3/z' },
    '/kw/': { sound: 'phase3/qu' },

    // Autumn 2 onward. None of these clips exist yet — that is what the
    // `ready: false` on their weeks is saying. Declared here so the shape of
    // the term is known and generating the audio is the only thing left.
    '/ch/': { sound: 'phase3/ch' },
    '/sh/': { sound: 'phase3/sh' },
    '/th/': { sound: 'phase3/th' },
    '/ng/': { sound: 'phase3/ng' },
    '/nk/': { sound: 'phase3/nk' },
    '/ai/': { sound: 'phase3/ai' },
    '/ee/': { sound: 'phase3/ee' },
    '/igh/': { sound: 'phase3/igh' },
    '/oa/': { sound: 'phase3/oa' },
  },

  // Every spelling. `name` is the letter-NAME clip ("ess", "aitch"), a second
  // cue for sounds that are hard to tell apart by ear. Doubles and <ck> have
  // no name of their own — "double ell" was never recorded — so they omit it
  // and the app greys the button out for that round.
  graphemes: {
    s:  { phoneme: '/s/',  name: 'phase2/s' },
    a:  { phoneme: '/a/',  name: 'phase2/a' },
    t:  { phoneme: '/t/',  name: 'phase2/t' },
    p:  { phoneme: '/p/',  name: 'phase2/p' },
    i:  { phoneme: '/i/',  name: 'phase2/i' },
    n:  { phoneme: '/n/',  name: 'phase2/n' },
    m:  { phoneme: '/m/',  name: 'phase2/m' },
    d:  { phoneme: '/d/',  name: 'phase2/d' },
    g:  { phoneme: '/g/',  name: 'phase2/g' },
    o:  { phoneme: '/o/',  name: 'phase2/o' },
    c:  { phoneme: '/k/',  name: 'phase2/c' },
    k:  { phoneme: '/k/',  name: 'phase2/k' },
    ck: { phoneme: '/k/' },
    e:  { phoneme: '/e/',  name: 'phase2/e' },
    u:  { phoneme: '/u/',  name: 'phase2/u' },
    r:  { phoneme: '/r/',  name: 'phase2/r' },
    ss: { phoneme: '/s/' },
    h:  { phoneme: '/h/',  name: 'phase2/h' },
    b:  { phoneme: '/b/',  name: 'phase2/b' },
    f:  { phoneme: '/f/',  name: 'phase2/f' },
    ff: { phoneme: '/f/' },
    l:  { phoneme: '/l/',  name: 'phase2/l' },
    ll: { phoneme: '/l/' },
    j:  { phoneme: '/j/',  name: 'phase3/j' },
    v:  { phoneme: '/v/',  name: 'phase3/v' },
    w:  { phoneme: '/w/',  name: 'phase3/w' },
    x:  { phoneme: '/ks/', name: 'phase3/x' },
    y:  { phoneme: '/y/',  name: 'phase3/y' },
    z:  { phoneme: '/z/',  name: 'phase3/z' },
    zz: { phoneme: '/z/' },
    qu: { phoneme: '/kw/', name: 'phase3/qu' },

    // Digraphs. No letter names — a digraph has no name of its own, the same
    // reason <ck> and <ss> have none.
    ch: { phoneme: '/ch/' },
    sh: { phoneme: '/sh/' },
    ng: { phoneme: '/ng/' },
    nk: { phoneme: '/nk/' },
    ai: { phoneme: '/ai/' },
    ee: { phoneme: '/ee/' },
    igh: { phoneme: '/igh/' },
    oa: { phoneme: '/oa/' },

    // KNOWN LIMITATION, to settle before Autumn 2 week 3 goes ready.
    // ELS teaches <th> as two sounds — unvoiced ("thin") and voiced
    // ("that") — so this is one spelling with two phonemes, the exact
    // mirror of the one-sound-many-spellings case this model was built for.
    // Only the unvoiced one is here. Adding the voiced one needs a `display`
    // field (two entries, both shown as "th") AND a rule that a round never
    // offers two options that LOOK identical, which the phoneme rule alone
    // would happily allow. Left undone rather than half-done.
    th: { phoneme: '/th/' },
  },

  // School, week by week. `ready: false` means the audio for it doesn't
  // exist yet, so the app leaves the week out of the playable stages —
  // generate the clips, flip the flag, and it appears. `review: true` is an
  // ELS assess-and-review week: real in school, but it teaches no new
  // grapheme, so it isn't a stage.
  weeks: [
    { id: 'A1.1', label: 'Autumn 1 · week 1', ready: true,
      graphemes: ['s', 'a', 't', 'p'],
      words: ['at', 'sat', 'pat', 'tap', 'sap'],
      hrs: ['i', 'the', 'no'] },

    { id: 'A1.2', label: 'Autumn 1 · week 2', ready: true,
      graphemes: ['i', 'n', 'm', 'd'],
      words: ['it', 'in', 'nip', 'tin', 'tip', 'pin', 'pit', 'sit', 'sip',
              'man', 'map', 'mad', 'dad', 'did', 'mat', 'nap', 'tan', 'sad',
              'dip'],
      hrs: ['put', 'of', 'is'] },

    { id: 'A1.3', label: 'Autumn 1 · week 3', ready: true,
      graphemes: ['g', 'o', 'c', 'k', 'ck'],
      words: ['cat', 'can', 'cap', 'cot', 'cod', 'dog', 'got', 'gap', 'kit',
              'kid', 'sock', 'kick', 'pick', 'sick', 'top', 'pot', 'not',
              'on', 'dot'],
      hrs: ['to', 'go', 'into'] },

    { id: 'A1.4', label: 'Autumn 1 · week 4', ready: true,
      graphemes: ['e', 'u', 'r', 'ss'],
      words: ['red', 'run', 'rug', 'rat', 'rip', 'get', 'pet', 'net', 'ten',
              'up', 'us', 'cut', 'cup', 'mud', 'mug', 'sun', 'kiss', 'miss',
              'mess', 'less'],
      hrs: ['pull'] },

    { id: 'A1.5', label: 'Autumn 1 · week 5', ready: true, review: true,
      graphemes: [], words: [], hrs: [] },

    { id: 'A1.6', label: 'Autumn 1 · week 6', ready: true,
      graphemes: ['h', 'b', 'f', 'ff', 'l', 'll'],
      words: ['hat', 'hit', 'hot', 'hug', 'bat', 'bed', 'big', 'bus', 'fit',
              'fun', 'fan', 'fat', 'leg', 'lot', 'lip', 'bell', 'fell',
              // "full" deliberately absent: its <u> says /oo/, like "pull"
              // (which ELS lists as harder to read and spell for exactly
              // that reason), so it cannot be sounded out with Phase 2 /u/.
              // The clip exists in audio/words/ for when it is taught.
              'tell', 'off', 'hill', 'doll'],
      hrs: ['as', 'his'] },

    // Autumn 2 onward is recorded here so the shape is known, but only the
    // first week has audio. The rest need clips before they can be played —
    // that's what `ready: false` is saying, and it's the honest state rather
    // than a stage that would fail silently on a missing file.
    { id: 'A2.1', label: 'Autumn 2 · week 1', ready: true,
      graphemes: ['j', 'v', 'w', 'x'],
      words: [], hrs: ['he', 'she', 'buses'] },

    { id: 'A2.2', label: 'Autumn 2 · week 2', ready: false,
      graphemes: ['y', 'z', 'zz', 'qu', 'ch'],
      words: [], hrs: ['we', 'me', 'be'],
      needs: ['ch'] },

    { id: 'A2.3', label: 'Autumn 2 · week 3', ready: false,
      graphemes: ['sh', 'th', 'ng', 'nk'],
      words: [], hrs: ['push'],
      needs: ['sh', 'th (voiced)', 'th (unvoiced)', 'ng', 'nk'] },

    { id: 'A2.4', label: 'Autumn 2 · week 4', ready: false,
      graphemes: ['ai', 'ee', 'igh', 'oa'],
      words: [], hrs: ['was', 'her'],
      needs: ['ai', 'ee', 'igh', 'oa'] },
  ],
};
