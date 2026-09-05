# Felix's Phonics

A synthetic-phonics game for a four-year-old. Plain HTML/JS/CSS, no build step,
no dependencies — open `app/index.html` and it runs.

**Play:** https://andrewlord311-sudo.github.io/PhonicsApp/

## Games

| Game | What it does |
|---|---|
| **Football Sounds** | Hear a letter sound, tap the matching letter, score a goal. Stages unlock one by one. |
| **Dinosaur Puzzle** | Same sound-to-letter matching, revealing a dinosaur picture piece by piece. |
| **Sound Buttons** | A word on screen split into its graphemes, each tappable to hear its sound, then "Read the word" to hear it blended. |
| **Robot Talk** | A robot says `c… a… t` in separate sounds; tap the picture of the word. Nothing is written down. |
| **Catch the Sounds** | Hear a word, build it from letter tiles — one box per sound. |

**Sound Buttons is not a quiz** — there's no right answer to get and no way
to fail. It's the tool schools actually use: press each sound in turn, then
say the word. That also means it deliberately **doesn't unlock stages** —
unlocking should mean "can pick the letter out from its sound", which is what
the two matching games test and this one doesn't.

It only ever shows **decodable** words. The `hrs` lists are excluded on
purpose: "the", "of" and "put" are *harder to read and spell* precisely
because sounding them out gives the wrong word.

**Robot Talk is oral blending** — the skill that turns knowing letters into
reading. The robot speaks the sounds one at a time (waiting for each clip to
finish, so a clipped `/t/` and a long `/sss/` both get the right rhythm), and
the whole word is only spoken *after* a correct answer, as the reward for
having blended it. Nothing is ever written on screen; reading it would answer
the question.

Two consequences of it being *oral*:

- **It reaches forward past the selected stage when it has to.** Blending by
  ear needs no knowledge of spellings — ELS teaches it from Nursery, before
  any grapheme — so hearing `/d/ /o/ /g/` at stage 1 is legitimate practice,
  not jumping ahead. Without this, stage 1 has exactly one picturable word
  and no playable game, which is where Felix is right now.
- **It doesn't unlock stages either.** The stages are *grapheme* stages.

Pictures are emoji, in `curriculum.pictures`. Two rules when adding: never
repeat an emoji (two words sharing a picture makes a round with two identical
answers — there's a test), and stick to long-established emoji, since newer
ones like 🪆 and 🪭 render as an empty box on older tablets.

**Catch the Sounds is segmenting** — the inverse of Robot Talk, and the one
that feeds writing, because it needs *recall* of a spelling rather than
recognition of one. One box per sound, so `sock` gets three, not four.

It is **tap to place, not drag**. Dragging is fiddly for four-year-old
fingers on a tablet, and a tile that lands nowhere reads as the app ignoring
you. Tapping a tile fills the next box; tapping a filled box takes that sound
back out, which is the undo needed when the right letter goes in the wrong
order.

**Every decoy tile is audibly wrong.** A decoy never shares a phoneme with
any part of the target — spelling "cat" will never offer `k` or `ck`. Those
say the same /k/, so no amount of listening could settle it: it's a spelling
convention, and marking it wrong would teach that listening harder is the
answer when it isn't. There's a test.

It doesn't unlock stages either, for a specific reason: a stage-3 word can be
"sat", spelled entirely from stage-1 graphemes, so finishing it says little
about the graphemes the newest week introduced. The matching games draw their
target from the whole cumulative pool, so clearing those does.

The two **matching** games (Football, Puzzle) have a **Letter name** button
alongside **Hear it again**, so the sound (`sss`) and the name (`ess`) stay
separable — that distinction is the whole point of synthetic phonics. They
are also the only two games that unlock stages, for the reasons below.

## Audio

`app/audio/phase2/` and `app/audio/phase3/` hold two clips per letter:
`<letter>.wav` (the sound) and `<letter>_name.wav` (the letter's name).
Generated with ElevenLabs.

`record.sh` is the alternative: it records the sounds from the Mac's own mic,
auto-trims silence, plays each take back for approval and saves straight into
the right folder in the right format. Useful for replacing any clip where the
generated pronunciation isn't quite right.

### Whole words — `gen_words.py`

`app/audio/words/<word>.wav` holds one clip per whole word, for the games that
need words rather than letters (blending, segmenting, harder-to-read-and-spell
words).

```sh
./gen_words.py cat sat pat                      # generate these
./gen_words.py --from wordlists/els-autumn1.txt # a whole term
./gen_words.py --dry-run --from wordlists/...   # cost nothing, just look
./gen_words.py --play --force cat               # redo one and hear it
```

This is far simpler than the letter sounds were, and deliberately so. All the
trimming and by-ear iteration behind the letters existed because an isolated
phoneme (`sss`, a clipped `t`) is the one thing TTS structurally cannot say —
the workaround was to generate a real word and cut the sound out of it. A
whole word needs none of that: generate, convert, done.

It uses the same **Melody** voice as all 52 letter clips and converts to the
same 22050Hz mono 16-bit PCM WAV, so words and letters sound like one app.
Words that already exist are skipped unless `--force`, and a forced
regeneration moves the old clip to `app/audio/_backup_words/<date>/` rather
than overwriting it — TTS is non-deterministic, so a second take of the same
word is a genuinely different clip and not always a better one.

The key comes from `~/.secrets/keys.env`, falling back to
`Andrew_Game_Apps/.env` (where the letter regeneration read it from).

`wordlists/els-autumn1.txt` is the whole of Reception Autumn 1 — 97 decodable
and HRS words, grouped by the ELS teaching week the school actually follows.

## The curriculum spine

`app/curriculum.js` is the one file to edit when school moves on. It is data
only — app.js reads it and does everything else.

**It is phoneme-first, and that's the point.** The school teaches Essential
Letters and Sounds (ELS), which introduces /k/ as `c`, `k` *and* `ck` from
Autumn 1 week 3 — one sound, three spellings — and by Phase 5 /ai/ is
`ai ay a-e ey ea eigh a`. So:

- **`phonemes`** — the sounds. Each owns exactly one audio clip.
- **`graphemes`** — the spellings. Each points at the phoneme it says, so
  `c`, `k` and `ck` all play `phase2/c.wav`.
- **`weeks`** — what school taught, in ELS order, graphemes only.

### A stage is a school week, and says so

The stage buttons show **the school's own week number**, grouped by term:
`A1 1 2 3 4 6 · A2 1`. The jump from 4 to 6 is real — ELS week 5 is
assess-and-review, so it teaches no grapheme and isn't a stage. Locked weeks
still show their number rather than a padlock, so "what's next" stays
readable; they're just pale and disabled.

Under the buttons, a caption names the selected week in full and what it
covers — *"Autumn 1 · week 3 / new: g o c k ck · practising 13 sounds"* — and
the home screen carries an **"Up to: Autumn 1 · week 3"** line. All of that is
for the adult in the room; Felix can't read it yet, but "which week is he
practising?" should be answerable at a glance.

The numbering comes from `term` and `week` on each curriculum entry, not from
its position in the list, and there's a test asserting the buttons would read
exactly `A1:1 A1:2 A1:3 A1:4 A1:6 A2:1`.

A **stage** is derived, not written down: it's a week that introduces
something. Assess-and-review weeks teach no new grapheme so they aren't
stages, and a week with `ready: false` is one whose audio doesn't exist yet —
generate the clips, flip the flag, and the stage appears. Stages stay
cumulative, so earlier graphemes keep getting spaced review.

Two consequences worth knowing:

- **Distractors are picked by sound, not by spelling.** Once `c`, `k` and
  `ck` are all in the pool, offering them together would give three correct
  answers to one clip — and look like the child getting it wrong twice. A
  round takes one spelling from each of three *different* phonemes.
- **`ck`, `ss`, `ff`, `ll` and `zz` grey out the "Letter name" button.**
  There is no name for them; the button used to be always-on and would have
  played nothing.

Why `.js` and not `.json`: `fetch` of a local `.json` is blocked over
`file://`, and the app's promise is that you can open `app/index.html` with
no server. A plain script assigning one object keeps that and is edited
exactly like JSON.

### Splitting a word into graphemes

`segmentWord()` is what Sound Buttons is built on, and it's the reason the
spine had to be phoneme-first. **"sock" is `s-o-ck` — three sounds, not
four.** So is `kiss` → `k-i-ss`, `off` → `o-ff`, `bell` → `b-e-ll`. Getting
this wrong would teach a child to sound out *letters* instead of *graphemes*,
which is the exact habit synthetic phonics exists to prevent.

It matches longest-first (`igh` is the longest ELS teaches at this stage) and
only against graphemes the current stage has actually taught, so a word can
never be split using a spelling the child hasn't met. A word that can't be
built from taught graphemes returns null and is simply not offered — the
honest answer for a word that isn't decodable yet.

```sh
node test_curriculum.mjs   # 30 checks
```

The tests read the real shipped `curriculum.js`, so a typo in the data fails
them. They check every grapheme resolves, every clip a ready week needs is
actually on disk, stages stay cumulative, and — the one that matters — that
no round can ever offer two spellings of the same sound.

## Structure

```
index.html        redirect to app/ so the short Pages URL works
app/index.html    the game shell
app/curriculum.js WHAT is taught — the one file to edit each week
app/app.js        all game logic
app/style.css     all styling
app/audio/        letter sounds and letter names
app/audio/words/  whole-word clips (gen_words.py)
app/images/       dinosaur SVGs
gen_words.py      whole-word audio generator
wordlists/        word lists by ELS teaching week
```
