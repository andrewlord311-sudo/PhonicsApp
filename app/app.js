// ---- Data ----
// Full lowercase alphabet, in Letters and Sounds teaching order (Phase 2 then Phase 3 singles).
const ALPHABET = [
  { id: 's', phase: 2 }, { id: 'a', phase: 2 }, { id: 't', phase: 2 }, { id: 'p', phase: 2 },
  { id: 'i', phase: 2 }, { id: 'n', phase: 2 }, { id: 'm', phase: 2 }, { id: 'd', phase: 2 },
  { id: 'g', phase: 2 }, { id: 'o', phase: 2 }, { id: 'c', phase: 2 }, { id: 'k', phase: 2 },
  { id: 'e', phase: 2 }, { id: 'u', phase: 2 }, { id: 'r', phase: 2 },
  { id: 'h', phase: 2 }, { id: 'b', phase: 2 }, { id: 'f', phase: 2 }, { id: 'l', phase: 2 },
  { id: 'j', phase: 3 }, { id: 'v', phase: 3 }, { id: 'w', phase: 3 }, { id: 'x', phase: 3 },
  { id: 'y', phase: 3 }, { id: 'z', phase: 3 }, { id: 'qu', phase: 3 },
];
const AUDIO_PATH = (letter) => {
  const entry = ALPHABET.find(l => l.id === letter);
  return `audio/phase${entry.phase}/${letter}.wav`;
};
// The letter's NAME ("ess", "aitch") read as a separate clip from its pure
// SOUND ("sss") - helps tell apart sounds that are hard to hear on their
// own (f vs h, for instance).
const AUDIO_NAME_PATH = (letter) => {
  const entry = ALPHABET.find(l => l.id === letter);
  return `audio/phase${entry.phase}/${letter}_name.wav`;
};

// ---- Staged difficulty (confirmed 2026-08-06) ----
// Five sets, taught in this order for real-word-building reasons (see vault
// doc). Each stage's pool is CUMULATIVE - every set introduced so far, not
// just the newest one - so earlier letters keep getting spaced review
// rather than disappearing once a new set arrives.
const STAGE_SETS = [
  ['s', 'a', 't', 'p'],
  ['i', 'n', 'm', 'd'],
  ['g', 'o', 'c', 'k'],
  ['e', 'u', 'r'],
  ['h', 'b', 'f', 'l'],
];
const STAGES = STAGE_SETS.map((_, i) => ({
  id: i + 1,
  letters: STAGE_SETS.slice(0, i + 1).flat(),
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
    if (raw && typeof raw.current === 'number') return raw;
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
function pickRound(letterPool) {
  const target = letterPool[Math.floor(Math.random() * letterPool.length)];
  const distractors = letterPool.filter(l => l !== target);
  shuffle(distractors);
  const options = shuffle([target, ...distractors.slice(0, Math.min(2, distractors.length))]);
  return { target, options };
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
  const audio = new Audio(AUDIO_NAME_PATH(letter));
  audio.play().catch(() => {});
}

function updateNameButton(btnId, target) {
  document.getElementById(btnId).disabled = false;
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
