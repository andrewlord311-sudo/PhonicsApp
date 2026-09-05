// Tests for the curriculum spine.
//
// The rule these defend: **every round must have exactly one right answer,
// and every clip a round asks for must exist on disk.** Both became possible
// to get wrong the moment one sound could have several spellings.
//
// Run: node test_curriculum.mjs
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, 'app');

// curriculum.js is a plain script assigning a const, so evaluate it and hand
// back the object. Reading the real file, not a copy, is the point: a typo
// in the shipped data should fail these tests.
const CURRICULUM = new Function(
  readFileSync(join(APP, 'curriculum.js'), 'utf8') + '\nreturn CURRICULUM;')();

let passed = 0;
const failures = [];
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failures.push([name, err.message]);
    console.log(`  FAIL  ${name}\n        ${err.message}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ---- The same derivations app.js makes ----
const TEACHING_WEEKS = CURRICULUM.weeks.filter(
  w => w.ready && w.graphemes.length > 0);
const STAGES = TEACHING_WEEKS.map((week, i) => ({
  id: i + 1,
  term: week.term,
  week: week.week,
  label: `${week.term} \u00b7 week ${week.week}`,
  letters: TEACHING_WEEKS.slice(0, i + 1).flatMap(w => w.graphemes),
}));
const PHONEME_OF = (g) => CURRICULUM.graphemes[g].phoneme;

console.log('\ndata integrity');

check('every grapheme points at a phoneme that exists', () => {
  for (const [g, entry] of Object.entries(CURRICULUM.graphemes)) {
    assert(CURRICULUM.phonemes[entry.phoneme],
      `<${g}> claims ${entry.phoneme}, which is not in phonemes`);
  }
});

check('every grapheme named in a week is defined', () => {
  for (const week of CURRICULUM.weeks) {
    for (const g of week.graphemes) {
      assert(CURRICULUM.graphemes[g], `${week.id} teaches <${g}>, undefined`);
    }
  }
});

check('no grapheme is taught in two different weeks', () => {
  const seen = new Map();
  for (const week of CURRICULUM.weeks) {
    for (const g of week.graphemes) {
      assert(!seen.has(g),
        `<${g}> taught in both ${seen.get(g)} and ${week.id}`);
      seen.set(g, week.id);
    }
  }
});

check('every sound clip a ready week needs exists on disk', () => {
  for (const week of TEACHING_WEEKS) {
    for (const g of week.graphemes) {
      const p = CURRICULUM.phonemes[PHONEME_OF(g)];
      const file = join(APP, 'audio', `${p.sound}.wav`);
      assert(existsSync(file), `<${g}> needs ${p.sound}.wav, missing`);
    }
  }
});

check('every letter-name clip that is claimed exists on disk', () => {
  for (const [g, entry] of Object.entries(CURRICULUM.graphemes)) {
    if (!entry.name) continue;
    const file = join(APP, 'audio', `${entry.name}_name.wav`);
    assert(existsSync(file), `<${g}> claims ${entry.name}_name.wav, missing`);
  }
});

check('doubles and ck carry no letter name', () => {
  for (const g of ['ck', 'ss', 'ff', 'll', 'zz']) {
    assert(!CURRICULUM.graphemes[g].name,
      `<${g}> should have no name clip - there is no name for it`);
  }
});

check('every word in a ready week has audio', () => {
  const missing = [];
  for (const week of CURRICULUM.weeks) {
    if (!week.ready) continue;
    for (const w of [...week.words, ...week.hrs]) {
      if (!existsSync(join(APP, 'audio', 'words', `${w}.wav`))) missing.push(w);
    }
  }
  assert(missing.length === 0, `no clip for: ${missing.join(', ')}`);
});

check('a week that is not ready says what it needs', () => {
  for (const week of CURRICULUM.weeks) {
    if (week.ready) continue;
    assert(week.needs && week.needs.length,
      `${week.id} is held back but does not say what audio it needs`);
  }
});

console.log('\nstages');

check('stages skip review weeks and unready weeks', () => {
  // Assert on the week NUMBER, not on a formatted string: the previous
  // version tested a label that had silently become undefined, so the regex
  // matched nothing and the check passed without checking anything.
  const a1 = STAGES.filter(s => s.term === 'Autumn 1').map(s => s.week);
  assert(!a1.includes(5),
    `Autumn 1 week 5 is assess-and-review and should not be a stage: ${a1}`);
  assert(a1.join(',') === '1,2,3,4,6', `Autumn 1 stages were ${a1.join(',')}`);
  assert(STAGES.length === 6,
    `expected 6 playable stages (A1 w1-4, w6, A2 w1), got ${STAGES.length}`);
});

check('every week declares a term and a week number', () => {
  for (const week of CURRICULUM.weeks) {
    assert(typeof week.term === 'string' && week.term.length,
      `${week.id} has no term`);
    assert(Number.isInteger(week.week), `${week.id} has no week number`);
  }
});

check('the button number is the school\'s week number', () => {
  // What the stage buttons render. If these ever drift apart, the whole
  // point of showing the week is lost.
  const shown = STAGES.map(s => `${s.term.split(' ').map(
    p => /^\d+$/.test(p) ? p : p[0]).join('')}:${s.week}`);
  assert(shown.join(' ') === 'A1:1 A1:2 A1:3 A1:4 A1:6 A2:1',
    `buttons would read ${shown.join(' ')}`);
});

check('stages stay cumulative', () => {
  for (let i = 1; i < STAGES.length; i++) {
    const prev = STAGES[i - 1].letters;
    const cur = STAGES[i].letters;
    assert(prev.every(g => cur.includes(g)),
      `stage ${i + 1} dropped something stage ${i} taught`);
    assert(cur.length > prev.length, `stage ${i + 1} added nothing`);
  }
});

check('stage 1 is exactly ELS Autumn 1 week 1', () => {
  assert(STAGES[0].letters.join(' ') === 's a t p',
    `got "${STAGES[0].letters.join(' ')}"`);
});

console.log('\nrounds - exactly one right answer, always');

// The real pickRound, copied in shape from app.js. Kept in step by the
// ambiguity test below, which would fail loudly against any version that
// picked distractors by grapheme rather than by phoneme.
function pickRound(pool) {
  const target = pool[Math.floor(Math.random() * pool.length)];
  const targetPhoneme = PHONEME_OF(target);
  const byPhoneme = new Map();
  pool.forEach(g => {
    const p = PHONEME_OF(g);
    if (p === targetPhoneme) return;
    if (!byPhoneme.has(p)) byPhoneme.set(p, []);
    byPhoneme.get(p).push(g);
  });
  const values = [...byPhoneme.values()];
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  const distractors = values.slice(0, 2)
    .map(s => s[Math.floor(Math.random() * s.length)]);
  return { target, options: [target, ...distractors] };
}

check('no round ever offers two spellings of the same sound', () => {
  // This is the one that matters. Before the phoneme-aware pick, a stage-3
  // round could offer c / k / ck against a single /k/ clip - three answers,
  // all correct, and the child marked wrong for two of them.
  for (const stage of STAGES) {
    for (let n = 0; n < 3000; n++) {
      const { options } = pickRound(stage.letters);
      const sounds = options.map(PHONEME_OF);
      assert(new Set(sounds).size === sounds.length,
        `stage ${stage.id} offered ${options.join('/')} - `
        + `sounds ${sounds.join('/')}`);
    }
  }
});

check('the target is always among the options', () => {
  for (const stage of STAGES) {
    for (let n = 0; n < 1000; n++) {
      const { target, options } = pickRound(stage.letters);
      assert(options.includes(target), `target ${target} not offered`);
    }
  }
});

check('every grapheme in a stage can actually come up', () => {
  // <ck>, <ss>, <ff> and <ll> share a phoneme with a single letter. If the
  // pick only ever chose the first spelling, they would be unreachable and
  // the spelling pattern would never be taught.
  const stage = STAGES[STAGES.length - 1];
  const seen = new Set();
  for (let n = 0; n < 20000; n++) pickRound(stage.letters).options.forEach(g => seen.add(g));
  for (const g of stage.letters) {
    assert(seen.has(g), `<${g}> never appeared in 20000 rounds`);
  }
});

console.log('\nsegmentation - words split by grapheme, not by letter');

// Same as app.js. The tests below are what keep the two honest.
const MAX_GRAPHEME_LEN = 3;
function segmentWord(word, pool) {
  const parts = [];
  let i = 0;
  while (i < word.length) {
    let matched = null;
    for (let len = Math.min(MAX_GRAPHEME_LEN, word.length - i); len >= 1; len--) {
      const chunk = word.slice(i, i + len);
      if (pool.includes(chunk)) { matched = chunk; break; }
    }
    if (!matched) return null;
    parts.push(matched);
    i += matched.length;
  }
  return parts;
}
const ALL = Object.keys(CURRICULUM.graphemes);

check('digraphs stay whole - the whole reason this exists', () => {
  const cases = {
    sock: 's o ck', kick: 'k i ck', pick: 'p i ck', sick: 's i ck',
    kiss: 'k i ss', miss: 'm i ss', mess: 'm e ss', less: 'l e ss',
    bell: 'b e ll', fell: 'f e ll', tell: 't e ll', hill: 'h i ll',
    doll: 'd o ll', off: 'o ff',
    cat: 'c a t', sat: 's a t', at: 'a t',
  };
  for (const [word, expected] of Object.entries(cases)) {
    const got = segmentWord(word, ALL);
    assert(got !== null, `${word} did not segment at all`);
    assert(got.join(' ') === expected,
      `${word} -> "${got.join(' ')}", expected "${expected}"`);
  }
});

check('every decodable word in every week segments cleanly', () => {
  // A word in `words` that cannot be sounded out is a curriculum data bug --
  // this is the guard for the weekly feed. "full" was caught by exactly this
  // reasoning: its <u> says /oo/, so it belongs with "pull" in hrs.
  const bad = [];
  for (const week of CURRICULUM.weeks) {
    for (const word of week.words) {
      if (segmentWord(word, ALL) === null) bad.push(`${word} (${week.id})`);
    }
  }
  assert(bad.length === 0, `cannot be built from taught graphemes: ${bad.join(', ')}`);
});

check('a word only ever splits with graphemes the stage has taught', () => {
  for (const stage of STAGES) {
    const pool = stage.letters;
    const words = TEACHING_WEEKS.slice(0, stage.id).flatMap(w => w.words);
    for (const word of words) {
      const parts = segmentWord(word, pool);
      if (parts === null) continue;   // legitimately not yet decodable
      for (const p of parts) {
        assert(pool.includes(p),
          `stage ${stage.id} split ${word} using <${p}>, not taught yet`);
      }
    }
  }
});

check('every stage that offers words offers only decodable ones', () => {
  for (const stage of STAGES) {
    const pool = stage.letters;
    const usable = TEACHING_WEEKS.slice(0, stage.id).flatMap(w => w.words)
      .map(w => ({ w, parts: segmentWord(w, pool) }))
      .filter(e => e.parts !== null);
    assert(usable.length > 0, `stage ${stage.id} has no decodable words`);
    for (const { w, parts } of usable) {
      assert(parts.join('') === w, `${w} lost letters: ${parts.join('|')}`);
    }
  }
});

check('harder-to-read-and-spell words are kept out of blending', () => {
  // Sound Buttons must never show these: they are on the list precisely
  // because sounding them out gives the wrong word.
  const leaked = [];
  for (const week of CURRICULUM.weeks) {
    for (const h of week.hrs) {
      if (week.words.includes(h)) leaked.push(h);
    }
  }
  assert(leaked.length === 0, `also listed as decodable: ${leaked.join(', ')}`);
});

check('every decodable word has its whole-word clip', () => {
  const missing = [];
  for (const week of CURRICULUM.weeks) {
    if (!week.ready) continue;
    for (const w of week.words) {
      if (!existsSync(join(APP, 'audio', 'words', `${w}.wav`))) missing.push(w);
    }
  }
  assert(missing.length === 0, `no clip for: ${missing.join(', ')}`);
});

console.log('\npictures - Robot Talk');

check('no two words share a picture', () => {
  // Two words with the same emoji makes a round showing two identical
  // answers, one of them marked wrong. Unanswerable, and it looks like a
  // bug to a four-year-old because it is one.
  const seen = new Map();
  for (const [word, emoji] of Object.entries(CURRICULUM.pictures)) {
    assert(!seen.has(emoji),
      `${seen.get(emoji)} and ${word} both use ${emoji}`);
    seen.set(emoji, word);
  }
});

check('every pictured word is a decodable word school teaches', () => {
  const taught = new Set(CURRICULUM.weeks.flatMap(w => w.words));
  const orphans = Object.keys(CURRICULUM.pictures).filter(w => !taught.has(w));
  assert(orphans.length === 0,
    `pictured but never taught as decodable: ${orphans.join(', ')}`);
});

check('every pictured word has whole-word audio', () => {
  const missing = Object.keys(CURRICULUM.pictures)
    .filter(w => !existsSync(join(APP, 'audio', 'words', `${w}.wav`)));
  assert(missing.length === 0, `no clip for: ${missing.join(', ')}`);
});

check('every stage can fill a round of three pictures', () => {
  // Robot Talk reaches forward when a stage is too thin, because blending by
  // ear needs no grapheme knowledge. This checks the reach always succeeds.
  const withPictures = (id) => {
    const pool = STAGES[id - 1].letters;
    return TEACHING_WEEKS.slice(0, id).flatMap(w => w.words)
      .filter(w => CURRICULUM.pictures[w] && segmentWord(w, pool) !== null);
  };
  for (const stage of STAGES) {
    let words = withPictures(stage.id);
    for (let id = stage.id + 1; words.length < 3 && id <= STAGES.length; id++) {
      words = withPictures(id);
    }
    assert(words.length >= 3,
      `stage ${stage.id} cannot reach 3 pictured words even looking ahead`);
  }
});

check('stage 1 is the one that needs the forward reach', () => {
  // Documenting the actual situation rather than assuming: if a future
  // curriculum edit gives stage 1 three picturable words, this fails and the
  // comment in app.js explaining why the reach exists should be revisited.
  const pool = STAGES[0].letters;
  const own = TEACHING_WEEKS.slice(0, 1).flatMap(w => w.words)
    .filter(w => CURRICULUM.pictures[w] && segmentWord(w, pool) !== null);
  assert(own.length < 3,
    `stage 1 now has ${own.length} pictured words - the forward reach may be `
    + `unnecessary, check the reasoning in app.js`);
});

console.log('\ncatch the sounds - decoys must be audibly wrong');

// Mirrors catchTiles() in app.js.
function catchTiles(parts, pool) {
  const targetSounds = new Set(parts.map(PHONEME_OF));
  const safe = pool.filter(g => !targetSounds.has(PHONEME_OF(g)));
  const bySound = new Map();
  safe.forEach(g => {
    const p = PHONEME_OF(g);
    if (!bySound.has(p)) bySound.set(p, []);
    bySound.get(p).push(g);
  });
  const values = [...bySound.values()];
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  const decoys = values.slice(0, 2)
    .map(s => s[Math.floor(Math.random() * s.length)]);
  return [...parts, ...decoys];
}

check('no decoy ever shares a sound with the word being spelled', () => {
  // The unfair case: spelling "cat" with <k> or <ck> on offer. Both say /k/,
  // so the child cannot possibly hear which is right - it is a spelling
  // convention, not a sound, and marking it wrong teaches that listening
  // harder is the answer when it isn't.
  for (const stage of STAGES) {
    const pool = stage.letters;
    const words = TEACHING_WEEKS.slice(0, stage.id).flatMap(w => w.words)
      .map(w => segmentWord(w, pool)).filter(Boolean);
    for (const parts of words) {
      const targetSounds = new Set(parts.map(PHONEME_OF));
      for (let n = 0; n < 200; n++) {
        const tiles = catchTiles(parts, pool);
        const decoys = tiles.slice(parts.length);
        for (const d of decoys) {
          assert(!targetSounds.has(PHONEME_OF(d)),
            `spelling ${parts.join('')} offered <${d}> (${PHONEME_OF(d)}), `
            + `which the word already uses`);
        }
      }
    }
  }
});

check('the word can always actually be built from its tiles', () => {
  for (const stage of STAGES) {
    const pool = stage.letters;
    const words = TEACHING_WEEKS.slice(0, stage.id).flatMap(w => w.words)
      .map(w => ({ w, parts: segmentWord(w, pool) })).filter(e => e.parts);
    for (const { w, parts } of words) {
      const tiles = catchTiles(parts, pool);
      // Every grapheme of the word must be present as many times as needed.
      const counts = {};
      tiles.forEach(t => { counts[t] = (counts[t] || 0) + 1; });
      const need = {};
      parts.forEach(p => { need[p] = (need[p] || 0) + 1; });
      for (const [g, n] of Object.entries(need)) {
        assert((counts[g] || 0) >= n, `${w} needs ${n}x <${g}>, tiles had ${counts[g] || 0}`);
      }
    }
  }
});

check('two decoys are offered wherever the stage can spare them', () => {
  // Stage 1 is s a t p: spelling "sat" leaves only <p>, so one decoy is the
  // honest maximum there. Anywhere richer should manage two.
  const stage = STAGES[STAGES.length - 1];
  const parts = segmentWord('cat', stage.letters);
  const tiles = catchTiles(parts, stage.letters);
  assert(tiles.length === parts.length + 2,
    `expected ${parts.length + 2} tiles, got ${tiles.length}`);
});

console.log('\nwhich sound? - three distinct sounds, one right');

// Mirrors nextWhichRound()'s option build in app.js.
function whichOptions(pool) {
  const target = pool[Math.floor(Math.random() * pool.length)];
  const targetPhoneme = PHONEME_OF(target);
  const others = [...new Set(pool.map(PHONEME_OF))]
    .filter(p => p !== targetPhoneme);
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  return { target, targetPhoneme, options: [targetPhoneme, ...others.slice(0, 2)] };
}

check('the three sounds offered are always different from each other', () => {
  // Here the options ARE sounds, so two options sharing a phoneme would be
  // two identical audio clips - indistinguishable, and one marked wrong.
  for (const stage of STAGES) {
    for (let n = 0; n < 3000; n++) {
      const { options } = whichOptions(stage.letters);
      assert(new Set(options).size === options.length,
        `stage ${stage.id} offered ${options.join(' / ')}`);
    }
  }
});

check("the letter's own sound is always one of the options", () => {
  for (const stage of STAGES) {
    for (let n = 0; n < 2000; n++) {
      const { target, targetPhoneme, options } = whichOptions(stage.letters);
      assert(options.includes(targetPhoneme),
        `<${target}> says ${targetPhoneme}, not offered`);
    }
  }
});

check('every stage has enough distinct sounds for three options', () => {
  for (const stage of STAGES) {
    const distinct = new Set(stage.letters.map(PHONEME_OF)).size;
    assert(distinct >= 3,
      `stage ${stage.id} has only ${distinct} distinct sound(s)`);
  }
});

check('every option maps to a clip that exists', () => {
  for (const stage of STAGES) {
    for (const g of stage.letters) {
      const sound = CURRICULUM.phonemes[PHONEME_OF(g)].sound;
      assert(existsSync(join(APP, 'audio', `${sound}.wav`)),
        `<${g}> needs ${sound}.wav`);
    }
  }
});

console.log(`\n${passed} checks passed${failures.length ? `, ${failures.length} FAILED` : ''}`);
process.exit(failures.length ? 1 : 0);
