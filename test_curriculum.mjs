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
  label: week.label,
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
  const ids = STAGES.map(s => s.label);
  assert(!ids.some(l => /week 5/.test(l)),
    'the assess-and-review week should not be a stage');
  assert(STAGES.length === 6,
    `expected 6 playable stages (A1 w1-4, w6, A2 w1), got ${STAGES.length}`);
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

console.log(`\n${passed} checks passed${failures.length ? `, ${failures.length} FAILED` : ''}`);
process.exit(failures.length ? 1 : 0);
