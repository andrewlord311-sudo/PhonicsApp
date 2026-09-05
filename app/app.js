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
  label: week.label,
  letters: TEACHING_WEEKS.slice(0, i + 1).flatMap(w => w.graphemes),
}));
const MAX_STAGE = STAGES.length;

function stagePool(stageId) {
  return STAGES[stageId - 1].letters;
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

// Shared stage-picker row, used identically in both games. `onSelect(stageId)`
// is called when an unlocked stage button is tapped.
function renderStageRow(containerId, onSelect) {
  const wrap = document.getElementById(containerId);
  wrap.innerHTML = '';
  STAGES.forEach(s => {
    const unlocked = s.id <= stageProgress.current;
    const btn = document.createElement('button');
    btn.className = 'stage-btn'
      + (s.id === selectedStage ? ' active' : '')
      + (!unlocked ? ' locked' : '');
    btn.textContent = unlocked ? s.id : '🔒';
    btn.disabled = !unlocked;
    btn.addEventListener('click', () => onSelect(s.id));
    wrap.appendChild(btn);
  });
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
  });
});

document.querySelectorAll('[data-back]').forEach(btn => {
  btn.addEventListener('click', () => showScreen('screen-home'));
});

document.getElementById('home-btn').addEventListener('click', () => showScreen('screen-home'));

let lastCompletedGame = null;
document.getElementById('play-again-btn').addEventListener('click', () => {
  if (lastCompletedGame === 'football') startFootballGame();
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

// ---- Completion ----
function finishSession(game) {
  lastCompletedGame = game;
  const advanced = clearStageIfFrontier(selectedStage);
  playCompleteFanfare();
  const title = document.getElementById('complete-title');
  const message = document.getElementById('complete-message');
  if (game === 'football') {
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
