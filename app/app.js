// ---- Data ----
// Everything about WHAT is taught now lives in curriculum.js, keyed on the
// phoneme, so that one sound can have several spellings (/k/ is <c>, <k> and
// <ck> from Autumn 1 week 3). This file only knows how to play it.
if (typeof CURRICULUM === 'undefined') {
  // Loud, not silent: a missing or mistyped curriculum.js would otherwise
  // show an empty stage row and an unplayable game with no clue why.
  document.body.innerHTML =
    '<p style="padding:2rem;font:1rem system-ui">Could not load '
    + '<code>curriculum.js</code>. The app needs it to know what to teach.</p>';
  throw new Error('curriculum.js not loaded');
}

// A grapheme's SOUND comes from its phoneme, so <c>, <k> and <ck> all play
// the same clip - that shared sound is the entire point of the model.
const AUDIO_PATH = (grapheme) => {
  const phoneme = CURRICULUM.phonemes[CURRICULUM.graphemes[grapheme].phoneme];
  return `audio/${phoneme.sound}.wav`;
};
// The grapheme's NAME ("ess", "aitch") is a separate clip from its pure
// SOUND ("sss") - it helps tell apart sounds that are hard to hear on their
// own (f vs h). Doubles and <ck> have no name clip; null means "no name",
// and the button is disabled for that round rather than playing nothing.
const AUDIO_NAME_PATH = (grapheme) => {
  const name = CURRICULUM.graphemes[grapheme].name;
  return name ? `audio/${name}_name.wav` : null;
};
const PHONEME_OF = (grapheme) => CURRICULUM.graphemes[grapheme].phoneme;

// ---- Stages, derived from the school's weeks ----
// A stage is one ELS week that actually introduces something: assess-and-
// review weeks teach no new grapheme, and weeks whose audio hasn't been
// generated yet are held back by `ready: false`. Each stage's pool stays
// CUMULATIVE - every grapheme taught so far, not just the newest - so
// earlier ones keep getting spaced review instead of disappearing.
const TEACHING_WEEKS = CURRICULUM.weeks.filter(
  w => w.ready && w.graphemes.length > 0);
const STAGES = TEACHING_WEEKS.map((week, i) => ({
  id: i + 1,
  // The school's own numbering, not this list's position: Autumn 1 runs
  // 1,2,3,4 then 6, because week 5 is assess-and-review. The buttons show
  // `week`, so a button reading 6 really is the sixth week of his term.
  term: week.term,
  week: week.week,
  label: `${week.term} \u00b7 week ${week.week}`,
  letters: TEACHING_WEEKS.slice(0, i + 1).flatMap(w => w.graphemes),
}));
const MAX_STAGE = STAGES.length;

function stagePool(stageId) {
  return STAGES[stageId - 1].letters;
}

// ---- Splitting a word into the graphemes it is actually spelled with ----
// This is the bit that needs the phoneme model to exist at all. "sock" is
// s-o-ck, three sounds, not s-o-c-k; "kiss" is k-i-ss; "off" is o-ff. Get
// this wrong and the app teaches a child to sound out letters instead of
// graphemes, which is precisely the habit synthetic phonics exists to avoid.
//
// Longest match first, and only against graphemes taught by this stage, so a
// word can never be split using a spelling the child hasn't met. Returns null
// when the word cannot be built from taught graphemes at all - which is the
// honest answer for a word that isn't decodable yet, not an error.
const MAX_GRAPHEME_LEN = 3;          // "igh" is the longest ELS teaches here
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

// Decodable words for a stage: everything taught up to it that can actually
// be spelled out of the graphemes taught up to it. The `hrs` lists are
// deliberately excluded -- "the", "of", "put" are *harder to read and spell*
// precisely because sounding them out doesn't work, so putting them in a
// blending game would teach the wrong lesson.
function stageWords(stageId) {
  const pool = stagePool(stageId);
  return TEACHING_WEEKS.slice(0, stageId)
    .flatMap(w => w.words)
    .map(word => ({ word, parts: segmentWord(word, pool) }))
    .filter(entry => entry.parts !== null);
}

// Progress is shared across both games - it's the same underlying skill,
// not a per-game thing. Persisted so it survives closing the app.
const STAGE_STORAGE_KEY = 'felix_stage_progress';
function loadStageProgress() {
  try {
    const raw = JSON.parse(localStorage.getItem(STAGE_STORAGE_KEY));
    if (raw && typeof raw.current === 'number') {
      // Clamp: a stage number saved before a curriculum edit could now point
      // past the end (a week marked not-ready, say), and stagePool() would
      // hand back undefined and break every round.
      raw.current = Math.min(Math.max(raw.current, 1), MAX_STAGE);
      raw.cleared = (raw.cleared || []).filter(id => id >= 1 && id <= MAX_STAGE);
      return raw;
    }
  } catch {}
  return { current: 1, cleared: [] };
}
function saveStageProgress() {
  localStorage.setItem(STAGE_STORAGE_KEY, JSON.stringify(stageProgress));
}
let stageProgress = loadStageProgress();
// Which stage the CURRENT game session is drawing letters from - defaults
// to the frontier stage each time a game is entered, but a child can pick
// an earlier unlocked stage to go back and practise it.
let selectedStage = stageProgress.current;

// Completing a full session (see ROUNDS_PER_SESSION) while playing the
// frontier stage is what unlocks the next one. Replaying an
// already-cleared stage is just review - it can't unlock anything further.
// Returns true only when this call is what pushed the frontier forward.
function clearStageIfFrontier(stageId) {
  if (stageId !== stageProgress.current) return false;
  if (!stageProgress.cleared.includes(stageId)) stageProgress.cleared.push(stageId);
  if (stageId < MAX_STAGE) {
    stageProgress.current = stageId + 1;
    saveStageProgress();
    return true;
  }
  saveStageProgress();
  return false;
}

// Shared stage-picker row, used identically by every game. `onSelect(stageId)`
// is called when an unlocked stage button is tapped.
//
// A stage IS a school week, so the row says so rather than making anyone
// remember that "stage 3" means Autumn 1 week 3. The caption is for the adult
// in the room - Felix can't read it yet - so it names the week, the graphemes
// that week introduced, and how much is in the review pool.
function renderStageRow(containerId, onSelect) {
  const wrap = document.getElementById(containerId);
  wrap.innerHTML = '';

  // Grouped by term, because the week numbers restart: Autumn 1 runs
  // 1,2,3,4,6 and then Autumn 2 begins at 1 again. Ungrouped, that reads as
  // a numbering bug rather than as a new term.
  const row = document.createElement('div');
  row.className = 'stage-btns';
  let lastTerm = null;
  STAGES.forEach(s => {
    if (s.term !== lastTerm) {
      const tag = document.createElement('span');
      tag.className = 'term-tag';
      // "Autumn 1" -> "A1": the full name is in the caption below and in
      // every button's tooltip, so this only has to disambiguate.
      tag.textContent = s.term.split(' ').map(part =>
        /^\d+$/.test(part) ? part : part[0]).join('');
      tag.title = s.term;
      row.appendChild(tag);
      lastTerm = s.term;
    }
    const unlocked = s.id <= stageProgress.current;
    const btn = document.createElement('button');
    btn.className = 'stage-btn'
      + (s.id === selectedStage ? ' active' : '')
      + (!unlocked ? ' locked' : '');
    // The week number shows even when locked: "which week is he up to, and
    // what's next" should be readable at a glance, and a row of padlocks
    // hides exactly that. Locked buttons are pale and disabled instead.
    btn.textContent = s.week;
    btn.disabled = !unlocked;
    // Named for anyone hovering or using a screen reader, locked or not.
    btn.title = unlocked ? s.label : `${s.label} — locked`;
    btn.setAttribute('aria-label', btn.title);
    btn.addEventListener('click', () => onSelect(s.id));
    row.appendChild(btn);
  });
  wrap.appendChild(row);

  const stage = STAGES[selectedStage - 1];
  const week = TEACHING_WEEKS[selectedStage - 1];
  const caption = document.createElement('div');
  caption.className = 'stage-caption';
  caption.innerHTML =
    `<span class="stage-week">${stage.label}</span>`
    + `<span class="stage-new">new: ${week.graphemes.join(' ')}`
    + `<span class="stage-count"> · practising ${stage.letters.length} `
    + `sound${stage.letters.length === 1 ? '' : 's'}</span></span>`;
  wrap.appendChild(caption);
}

// The home screen says which week Felix is up to, so it's answerable at a
// glance without opening a game.
function renderCurrentWeek() {
  const el = document.getElementById('week-now');
  if (!el) return;
  const stage = STAGES[stageProgress.current - 1];
  el.textContent = `Up to: ${stage.label}`;
}

const DINOSAURS = [
  { file: 'images/trex.svg', name: 'T-Rex' },
  { file: 'images/triceratops.svg', name: 'Triceratops' },
  { file: 'images/stegosaurus.svg', name: 'Stegosaurus' },
  { file: 'images/brontosaurus.svg', name: 'Brontosaurus' },
];

const ROUNDS_PER_SESSION = 6;

// ---- Chime sounds (synthesized, no assets needed) ----
const actx = new (window.AudioContext || window.webkitAudioContext)();

function playTone(freq, startTime, duration, gainPeak = 0.2) {
  const osc = actx.createOscillator();
  const gain = actx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(actx.destination);
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

function playSuccessChime() {
  const now = actx.currentTime;
  playTone(523.25, now, 0.18);
  playTone(659.25, now + 0.1, 0.22);
  playTone(783.99, now + 0.2, 0.3);
}

// A bigger, more triumphant fanfare specifically for scoring a goal -
// distinct from the regular correct-answer chime.
function playGoalCheer() {
  const now = actx.currentTime;
  [392.00, 493.88, 587.33, 783.99].forEach((f, i) => playTone(f, now + i * 0.08, 0.28, 0.18));
}

function playCompleteFanfare() {
  const now = actx.currentTime;
  [523.25, 587.33, 659.25, 783.99, 1046.5].forEach((f, i) => playTone(f, now + i * 0.12, 0.3, 0.18));
}

function playGentleBlip() {
  const now = actx.currentTime;
  playTone(300, now, 0.15, 0.12);
}

// ---- Navigation ----
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

document.querySelectorAll('.game-tile').forEach(btn => {
  btn.addEventListener('click', () => {
    if (actx.state === 'suspended') actx.resume();
    const game = btn.dataset.game;
    if (game === 'football') startFootballGame();
    if (game === 'puzzle') startPuzzleGame();
    if (game === 'soundbuttons') startSoundButtons();
    if (game === 'robot') startRobotTalk();
    if (game === 'catch') startCatchSounds();
  });
});

document.querySelectorAll('[data-back]').forEach(btn => {
  btn.addEventListener('click', () => { renderCurrentWeek(); showScreen('screen-home'); });
});

document.getElementById('home-btn').addEventListener('click', () => { renderCurrentWeek(); showScreen('screen-home'); });

let lastCompletedGame = null;
document.getElementById('play-again-btn').addEventListener('click', () => {
  if (lastCompletedGame === 'football') startFootballGame();
  else if (lastCompletedGame === 'robot') startRobotTalk();
  else if (lastCompletedGame === 'catch') startCatchSounds();
  else startPuzzleGame();
});

// ---- Shared round logic ----
// Distractors must come from a DIFFERENT phoneme than the target, not merely
// be a different grapheme. Once /k/ is spelled <c>, <k> and <ck> (Autumn 1
// week 3), a round offering "c" against "k" and "ck" plays one sound that
// all three answers legitimately say - unanswerable, and it would look like
// the child getting it wrong. One option per distinct sound guarantees
// exactly one right answer.
function pickRound(letterPool) {
  const target = letterPool[Math.floor(Math.random() * letterPool.length)];
  const targetPhoneme = PHONEME_OF(target);

  // Group the rest by phoneme, then take one randomly-chosen spelling from
  // each of two different sounds. Choosing among a phoneme's spellings is
  // deliberate: it's how <ck> and <ss> ever get seen at all.
  const byPhoneme = new Map();
  letterPool.forEach(g => {
    const p = PHONEME_OF(g);
    if (p === targetPhoneme) return;
    if (!byPhoneme.has(p)) byPhoneme.set(p, []);
    byPhoneme.get(p).push(g);
  });

  const distractors = shuffle([...byPhoneme.values()])
    .slice(0, 2)
    .map(spellings => spellings[Math.floor(Math.random() * spellings.length)]);

  return { target, options: shuffle([target, ...distractors]) };
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function playLetterSound(letter) {
  const audio = new Audio(AUDIO_PATH(letter));
  audio.play().catch(() => {});
}

function playLetterName(letter) {
  const path = AUDIO_NAME_PATH(letter);
  if (!path) return;
  const audio = new Audio(path);
  audio.play().catch(() => {});
}

// <ck>, <ss>, <ff>, <ll> and <zz> have no letter-name clip - "double ell"
// was never recorded, and there's no single name for them anyway. Grey the
// button out on those rounds rather than leaving a button that does nothing.
function updateNameButton(btnId, target) {
  document.getElementById(btnId).disabled = !AUDIO_NAME_PATH(target);
}

function renderProgressDots(containerId) {
  const wrap = document.getElementById(containerId);
  wrap.innerHTML = '';
  for (let i = 0; i < ROUNDS_PER_SESSION; i++) {
    const dot = document.createElement('div');
    dot.className = 'dot';
    wrap.appendChild(dot);
  }
}

// ---- Football Sounds (replaces Feed the Monster) ----
// England vs Argentina: teams alternate every correct answer. England
// always shoots at the left goal (Argentina defending), Argentina always
// shoots at the right goal (England defending) - see the .goal-flag markup
// in index.html and the per-side keeper colours in style.css.
let footballRound = 0;
let footballTarget = null;
let footballTeam = 'england'; // whichever team is about to take the next kick
const footballScore = { england: 0, argentina: 0 };

function updateFootballScoreboard() {
  document.getElementById('football-score-england').textContent = footballScore.england;
  document.getElementById('football-score-argentina').textContent = footballScore.argentina;
}

function resetFootballTeams() {
  footballTeam = 'england';
  footballScore.england = 0;
  footballScore.argentina = 0;
  updateFootballScoreboard();
  applyKickerTeam();
}

function applyKickerTeam() {
  const kicker = document.getElementById('football-kicker');
  kicker.classList.toggle('team-england', footballTeam === 'england');
  kicker.classList.toggle('team-argentina', footballTeam === 'argentina');
}

function startFootballGame() {
  selectedStage = stageProgress.current;
  footballRound = 0;
  resetFootballTeams();
  renderProgressDots('football-dots');
  renderStageRow('football-stages', selectFootballStage);
  resetBallPosition();
  showScreen('screen-football');
  nextFootballRound();
}

function selectFootballStage(stageId) {
  selectedStage = stageId;
  footballRound = 0;
  resetFootballTeams();
  renderProgressDots('football-dots');
  renderStageRow('football-stages', selectFootballStage);
  resetBallPosition();
  nextFootballRound();
}

function nextFootballRound() {
  if (footballRound >= ROUNDS_PER_SESSION) {
    finishSession('football');
    return;
  }
  const { target, options } = pickRound(stagePool(selectedStage));
  footballTarget = target;
  updateNameButton('football-play-name', target);

  const choicesWrap = document.getElementById('football-choices');
  choicesWrap.innerHTML = '';
  options.forEach(letter => {
    const btn = document.createElement('button');
    btn.className = letter.length > 1 ? 'letter-btn wide-letter' : 'letter-btn';
    btn.textContent = letter;
    btn.addEventListener('click', () => handleFootballAnswer(letter, btn));
    choicesWrap.appendChild(btn);
  });

  setTimeout(() => playLetterSound(target), 300);
}

document.getElementById('football-play-sound').addEventListener('click', () => {
  if (footballTarget) playLetterSound(footballTarget);
});

document.getElementById('football-play-name').addEventListener('click', () => {
  if (footballTarget) playLetterName(footballTarget);
});

function handleFootballAnswer(letter, btn) {
  if (letter === footballTarget) {
    btn.classList.add('correct-flash');
    playSuccessChime();
    kickBallToGoal();
    document.querySelectorAll('#football-dots .dot')[footballRound].classList.add('done');
    footballRound++;
    setTimeout(nextFootballRound, 1450);
  } else {
    btn.classList.add('wrong-flash');
    playGentleBlip();
    setTimeout(() => btn.classList.remove('wrong-flash'), 400);
  }
}

function kickBallToGoal() {
  const ball = document.getElementById('football-ball');
  const kicker = document.getElementById('football-kicker');
  const scoringTeam = footballTeam; // England shoots left, Argentina shoots right
  const side = scoringTeam === 'england' ? 'left' : 'right';
  const net = document.getElementById(`football-net-${side}`);
  const goalText = document.getElementById('football-goal-text');

  kicker.classList.add('kicking');
  setTimeout(() => kicker.classList.remove('kicking'), 350);

  setTimeout(() => {
    ball.classList.add(`fly-${side}`);
    playGoalCheer();
  }, 150);

  setTimeout(() => {
    net.classList.add('wobble');
    goalText.textContent = scoringTeam === 'england' ? '⚽ ENGLAND SCORE!' : '⚽ ¡GOL ARGENTINA!';
    goalText.classList.add('show');
    footballScore[scoringTeam]++;
    updateFootballScoreboard();
    setTimeout(() => net.classList.remove('wobble'), 450);
    setTimeout(() => goalText.classList.remove('show'), 800);
  }, 650);

  setTimeout(() => {
    resetBallPosition();
    footballTeam = scoringTeam === 'england' ? 'argentina' : 'england';
    applyKickerTeam();
  }, 1300);
}

function resetBallPosition() {
  const ball = document.getElementById('football-ball');
  ball.classList.remove('fly-left', 'fly-right');
}

// ---- Dinosaur Puzzle ----
let puzzleRound = 0;
let puzzleTarget = null;
let puzzleTilesLeft = [];
let currentDino = null;
let lastDinoFile = null;

function startPuzzleGame() {
  selectedStage = stageProgress.current;
  puzzleRound = 0;
  const choices = DINOSAURS.filter(d => d.file !== lastDinoFile);
  currentDino = choices[Math.floor(Math.random() * choices.length)];
  lastDinoFile = currentDino.file;

  document.getElementById('puzzle-image').src = currentDino.file;
  renderPuzzleGrid();
  renderStageRow('puzzle-stages', selectPuzzleStage);
  showScreen('screen-puzzle');
  nextPuzzleRound();
}

function selectPuzzleStage(stageId) {
  selectedStage = stageId;
  puzzleRound = 0;
  renderPuzzleGrid();
  renderStageRow('puzzle-stages', selectPuzzleStage);
  nextPuzzleRound();
}

function renderPuzzleGrid() {
  const grid = document.getElementById('puzzle-grid');
  grid.innerHTML = '';
  puzzleTilesLeft = [];
  for (let i = 0; i < 6; i++) {
    const tile = document.createElement('div');
    tile.className = 'puzzle-tile';
    tile.textContent = '?';
    grid.appendChild(tile);
    puzzleTilesLeft.push(tile);
  }
}

function nextPuzzleRound() {
  if (puzzleRound >= ROUNDS_PER_SESSION) {
    finishSession('puzzle');
    return;
  }
  const { target, options } = pickRound(stagePool(selectedStage));
  puzzleTarget = target;
  updateNameButton('puzzle-play-name', target);

  const choicesWrap = document.getElementById('puzzle-choices');
  choicesWrap.innerHTML = '';
  options.forEach(letter => {
    const btn = document.createElement('button');
    btn.className = letter.length > 1 ? 'letter-btn wide-letter' : 'letter-btn';
    btn.textContent = letter;
    btn.addEventListener('click', () => handlePuzzleAnswer(letter, btn));
    choicesWrap.appendChild(btn);
  });

  setTimeout(() => playLetterSound(target), 300);
}

document.getElementById('puzzle-play-sound').addEventListener('click', () => {
  if (puzzleTarget) playLetterSound(puzzleTarget);
});

document.getElementById('puzzle-play-name').addEventListener('click', () => {
  if (puzzleTarget) playLetterName(puzzleTarget);
});

function handlePuzzleAnswer(letter, btn) {
  if (letter === puzzleTarget) {
    btn.classList.add('correct-flash');
    playSuccessChime();
    const tile = puzzleTilesLeft.splice(Math.floor(Math.random() * puzzleTilesLeft.length), 1)[0];
    tile.classList.add('revealed');
    puzzleRound++;
    setTimeout(nextPuzzleRound, 700);
  } else {
    btn.classList.add('wrong-flash');
    playGentleBlip();
    setTimeout(() => btn.classList.remove('wrong-flash'), 400);
  }
}

// ---- Sound Buttons ----
// Not a quiz. This is the tool schools actually use: the child presses each
// sound in turn, then says the word. There is no right answer to get and no
// way to fail, which is what makes it the right thing to open a session with
// -- and the reason it deliberately does NOT unlock stages. Unlocking should
// mean "can pick the letter out from its sound", which is what the two
// matching games test; nothing here demonstrates that.
let sbWords = [];
let sbCurrent = null;

function startSoundButtons() {
  selectedStage = stageProgress.current;
  renderStageRow('sb-stages', selectSoundButtonsStage);
  showScreen('screen-soundbuttons');
  nextSoundButtonsWord();
}

function selectSoundButtonsStage(stageId) {
  selectedStage = stageId;
  renderStageRow('sb-stages', selectSoundButtonsStage);
  nextSoundButtonsWord();
}

function nextSoundButtonsWord() {
  const pool = stageWords(selectedStage);
  const wordEl = document.getElementById('sb-word');
  const hintEl = document.getElementById('sb-hint');

  if (pool.length === 0) {
    // Reachable honestly: an early stage may teach graphemes before any
    // fully decodable word exists. Say so rather than showing a blank box.
    sbCurrent = null;
    wordEl.innerHTML = '';
    hintEl.textContent = 'No words to build with these sounds yet — '
      + 'try a later stage.';
    document.getElementById('sb-say-word').disabled = true;
    return;
  }

  // Avoid repeating the word that's already on screen when there's a choice.
  const choices = pool.length > 1 && sbCurrent
    ? pool.filter(w => w.word !== sbCurrent.word) : pool;
  sbCurrent = choices[Math.floor(Math.random() * choices.length)];
  hintEl.textContent = 'Tap each sound, then read the word';
  document.getElementById('sb-say-word').disabled = false;

  wordEl.innerHTML = '';
  sbCurrent.parts.forEach(grapheme => {
    const btn = document.createElement('button');
    btn.className = 'grapheme-btn'
      + (grapheme.length > 1 ? ' digraph' : '');
    btn.innerHTML = `<span class="grapheme-text">${grapheme}</span>`
      // The dot under each grapheme is the "sound button" schools draw in
      // pencil under a word - one per SOUND, wider under a digraph, so the
      // child can see that <ck> is one sound and not two.
      + '<span class="sound-dot"></span>';
    btn.addEventListener('click', () => {
      playLetterSound(grapheme);
      btn.classList.add('lit');
      setTimeout(() => btn.classList.remove('lit'), 450);
    });
    wordEl.appendChild(btn);
  });
}

function sayWholeWord() {
  if (!sbCurrent) return;
  const wordEl = document.getElementById('sb-word');
  wordEl.classList.add('blending');
  setTimeout(() => wordEl.classList.remove('blending'), 700);
  const audio = new Audio(`audio/words/${sbCurrent.word}.wav`);
  audio.play().catch(() => {});
}

document.getElementById('sb-say-word').addEventListener('click', sayWholeWord);
document.getElementById('sb-next').addEventListener('click', nextSoundButtonsWord);

// ---- Robot Talk ----
// Oral blending: the robot says c... a... t in separate sounds and the child
// works out the word, then taps its picture. Nothing is written down - that's
// the point. This is the skill that turns knowing letters into reading, and
// ELS teaches it from Nursery onward, before any grapheme at all.
//
// Which is why the pool is allowed to reach FORWARD past the selected stage
// when it has to (below): blending by ear does not require having been taught
// the spellings, so hearing /d/ /o/ /g/ at stage 1 is legitimate practice
// rather than jumping ahead. Without that, stage 1 - which is exactly where
// Felix is now - has only one picturable word and no playable game.
//
// Like Sound Buttons, it doesn't unlock stages: the stages are GRAPHEME
// stages, and blending by ear demonstrates something else.
let rtRound = 0;
let rtTarget = null;
let rtBusy = false;

function picturedWords(stageId) {
  const withPictures = (id) => {
    const pool = stagePool(id);
    return TEACHING_WEEKS.slice(0, id)
      .flatMap(w => w.words)
      .filter(word => CURRICULUM.pictures[word]
        && segmentWord(word, pool) !== null);
  };
  let words = withPictures(stageId);
  // Reach forward until there are enough for a round of three.
  for (let id = stageId + 1; words.length < 3 && id <= MAX_STAGE; id++) {
    words = withPictures(id);
  }
  return words;
}

function startRobotTalk() {
  selectedStage = stageProgress.current;
  rtRound = 0;
  renderStageRow('rt-stages', selectRobotTalkStage);
  renderProgressDots('rt-dots');
  showScreen('screen-robot');
  nextRobotRound();
}

function selectRobotTalkStage(stageId) {
  selectedStage = stageId;
  rtRound = 0;
  renderStageRow('rt-stages', selectRobotTalkStage);
  renderProgressDots('rt-dots');
  nextRobotRound();
}

function nextRobotRound() {
  if (rtRound >= ROUNDS_PER_SESSION) {
    finishSession('robot');
    return;
  }
  const pool = picturedWords(selectedStage);
  const choicesWrap = document.getElementById('rt-choices');
  if (pool.length < 3) {
    rtTarget = null;
    choicesWrap.innerHTML = '';
    document.getElementById('rt-say').disabled = true;
    return;
  }
  document.getElementById('rt-say').disabled = false;

  const shuffled = shuffle(pool);
  rtTarget = shuffled[0];
  const options = shuffle(shuffled.slice(0, 3));

  choicesWrap.innerHTML = '';
  options.forEach(word => {
    const btn = document.createElement('button');
    btn.className = 'picture-btn';
    btn.textContent = CURRICULUM.pictures[word];
    // The word itself is never shown - reading it would answer the question.
    btn.setAttribute('aria-label', word);
    btn.addEventListener('click', () => handleRobotAnswer(word, btn));
    choicesWrap.appendChild(btn);
  });

  setTimeout(sayRobotWord, 400);
}

// Speak the target one phoneme at a time, with a gap between each. Waiting
// for each clip to actually end (rather than guessing at a fixed delay) keeps
// the rhythm right whether the sound is a clipped /t/ or a long /sss/.
function sayRobotWord() {
  if (!rtTarget || rtBusy) return;
  rtBusy = true;
  const robot = document.getElementById('rt-robot');
  const parts = segmentWord(rtTarget, stagePool(MAX_STAGE));

  const speak = (i) => {
    if (i >= parts.length) {
      robot.classList.remove('talking');
      rtBusy = false;
      return;
    }
    robot.classList.add('talking');
    const audio = new Audio(AUDIO_PATH(parts[i]));
    audio.addEventListener('ended', () => setTimeout(() => speak(i + 1), 380));
    audio.play().catch(() => {
      // Autoplay refused or the file is missing - don't strand the button.
      robot.classList.remove('talking');
      rtBusy = false;
    });
  };
  speak(0);
}

function handleRobotAnswer(word, btn) {
  if (rtBusy) return;
  if (word === rtTarget) {
    btn.classList.add('correct-flash');
    playSuccessChime();
    // Only now is the whole word spoken - the reward for blending it, and
    // the confirmation that what they heard in pieces is one word.
    setTimeout(() => {
      const audio = new Audio(`audio/words/${rtTarget}.wav`);
      audio.play().catch(() => {});
    }, 400);
    document.querySelectorAll('#rt-dots .dot')[rtRound].classList.add('done');
    rtRound++;
    setTimeout(nextRobotRound, 1600);
  } else {
    btn.classList.add('wrong-flash');
    playGentleBlip();
    setTimeout(() => btn.classList.remove('wrong-flash'), 400);
  }
}

document.getElementById('rt-say').addEventListener('click', sayRobotWord);

// ---- Catch the Sounds ----
// Segmenting to spell: hear "cat", build it from tiles. The inverse of Robot
// Talk, and the one that feeds writing - it needs RECALL of a spelling, not
// just recognition of one.
//
// Tap to place, not drag. Dragging is fiddly for four-year-old fingers on a
// tablet, and a dropped tile that lands nowhere reads as the app ignoring
// you. Tapping a tile fills the next empty box; tapping a filled box takes
// that sound back out.
//
// Like the other word games it does NOT unlock stages, and here for a
// specific reason: a stage-3 word can be "sat", spelled entirely from
// stage-1 graphemes, so finishing it is weak evidence about the graphemes
// the newest week actually introduced. The matching games draw their target
// from the whole cumulative pool, so clearing those really does say
// something about the newest set.
let ctsRound = 0;
let ctsWord = null;          // { word, parts }
let ctsPlaced = [];          // graphemes placed so far, in order

function startCatchSounds() {
  selectedStage = stageProgress.current;
  ctsRound = 0;
  renderStageRow('cts-stages', selectCatchStage);
  renderProgressDots('cts-dots');
  showScreen('screen-catch');
  nextCatchRound();
}

function selectCatchStage(stageId) {
  selectedStage = stageId;
  ctsRound = 0;
  renderStageRow('cts-stages', selectCatchStage);
  renderProgressDots('cts-dots');
  nextCatchRound();
}

// Tiles the child chooses from: the word's own graphemes, plus decoys that
// are AUDIBLY different. A decoy sharing a phoneme with any part of the
// target (offering <k> or <ck> while spelling "cat") would be a spelling
// distinction the sound cannot possibly settle - unfair at four, and it
// would teach that listening harder is the answer when it isn't.
function catchTiles(parts, pool) {
  const targetSounds = new Set(parts.map(PHONEME_OF));
  const safe = pool.filter(g => !targetSounds.has(PHONEME_OF(g)));
  // One spelling per remaining sound, so the decoys aren't three ways of
  // writing the same thing either.
  const bySound = new Map();
  safe.forEach(g => {
    const p = PHONEME_OF(g);
    if (!bySound.has(p)) bySound.set(p, []);
    bySound.get(p).push(g);
  });
  const decoys = shuffle([...bySound.values()])
    .slice(0, 2)
    .map(spellings => spellings[Math.floor(Math.random() * spellings.length)]);
  return shuffle([...parts, ...decoys]);
}

function nextCatchRound() {
  if (ctsRound >= ROUNDS_PER_SESSION) {
    finishSession('catch');
    return;
  }
  const pool = stageWords(selectedStage);
  if (pool.length === 0) {
    ctsWord = null;
    document.getElementById('cts-boxes').innerHTML = '';
    document.getElementById('cts-tiles').innerHTML = '';
    document.getElementById('cts-say').disabled = true;
    return;
  }
  document.getElementById('cts-say').disabled = false;

  const choices = pool.length > 1 && ctsWord
    ? pool.filter(w => w.word !== ctsWord.word) : pool;
  ctsWord = choices[Math.floor(Math.random() * choices.length)];
  ctsPlaced = [];

  // The picture, when there is one, is a comprehension aid only - it says
  // WHICH word, never how it is spelled.
  const pic = document.getElementById('cts-picture');
  pic.textContent = CURRICULUM.pictures[ctsWord.word] || '';

  renderCatchBoxes();
  const tiles = catchTiles(ctsWord.parts, stagePool(selectedStage));
  const tray = document.getElementById('cts-tiles');
  tray.innerHTML = '';
  tiles.forEach(grapheme => {
    const btn = document.createElement('button');
    btn.className = 'letter-btn small-letter'
      + (grapheme.length > 1 ? ' wide-letter' : '');
    btn.textContent = grapheme;
    btn.addEventListener('click', () => placeCatchTile(grapheme, btn));
    tray.appendChild(btn);
  });

  setTimeout(sayCatchWord, 400);
}

function renderCatchBoxes() {
  const wrap = document.getElementById('cts-boxes');
  wrap.innerHTML = '';
  ctsWord.parts.forEach((_, i) => {
    const box = document.createElement('button');
    const placed = ctsPlaced[i];
    box.className = 'sound-box' + (placed ? ' filled' : '');
    box.textContent = placed || '';
    if (placed) {
      // Tap a filled box to take that sound back out - the undo a child
      // needs when they've placed the right letter in the wrong order.
      box.addEventListener('click', () => {
        ctsPlaced.splice(i, 1);
        renderCatchBoxes();
      });
    }
    wrap.appendChild(box);
  });
}

function placeCatchTile(grapheme, btn) {
  if (!ctsWord || ctsPlaced.length >= ctsWord.parts.length) return;
  const expected = ctsWord.parts[ctsPlaced.length];
  if (grapheme !== expected) {
    btn.classList.add('wrong-flash');
    playGentleBlip();
    setTimeout(() => btn.classList.remove('wrong-flash'), 400);
    return;
  }
  ctsPlaced.push(grapheme);
  playLetterSound(grapheme);
  renderCatchBoxes();

  if (ctsPlaced.length === ctsWord.parts.length) {
    playSuccessChime();
    setTimeout(() => {
      const audio = new Audio(`audio/words/${ctsWord.word}.wav`);
      audio.play().catch(() => {});
    }, 450);
    document.querySelectorAll('#cts-dots .dot')[ctsRound].classList.add('done');
    ctsRound++;
    setTimeout(nextCatchRound, 1700);
  }
}

function sayCatchWord() {
  if (!ctsWord) return;
  const audio = new Audio(`audio/words/${ctsWord.word}.wav`);
  audio.play().catch(() => {});
}

document.getElementById('cts-say').addEventListener('click', sayCatchWord);

// ---- Completion ----
function finishSession(game) {
  lastCompletedGame = game;
  // Only the two grapheme-matching games can unlock a stage. The stages are
  // grapheme stages, and Robot Talk demonstrates blending by ear - a real
  // skill, but not the one being gated.
  const advanced = (game === 'robot' || game === 'catch')
    ? false : clearStageIfFrontier(selectedStage);
  playCompleteFanfare();
  const title = document.getElementById('complete-title');
  const message = document.getElementById('complete-message');
  if (game === 'robot') {
    title.textContent = '🤖 Beep boop — well done!';
    message.textContent = 'You worked out every word from its sounds!';
  } else if (game === 'catch') {
    title.textContent = '🎣 You caught every sound!';
    message.textContent = 'You built each word from the sounds you heard!';
  } else if (game === 'football') {
    const { england, argentina } = footballScore;
    title.textContent = `Full Time! England ${england} – ${argentina} Argentina`;
    if (england > argentina) message.textContent = 'England win! What a match — every sound found the back of the net!';
    else if (argentina > england) message.textContent = 'Argentina win! What a match — every sound found the back of the net!';
    else message.textContent = "It's a draw! What a match — every sound found the back of the net!";
  } else {
    title.textContent = `It's a ${currentDino.name}!`;
    message.textContent = 'You matched every sound to reveal the picture!';
  }
  if (advanced) {
    message.textContent += ` Stage ${stageProgress.current} is now unlocked!`;
  }
  showScreen('screen-complete');
}

// Fill in the home screen's week line on first load.
renderCurrentWeek();
