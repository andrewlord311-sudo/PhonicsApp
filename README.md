# Felix's Phonics

A synthetic-phonics game for a four-year-old. Plain HTML/JS/CSS, no build step,
no dependencies — open `app/index.html` and it runs.

**Play:** https://andrewlord311-sudo.github.io/PhonicsApp/

## Games

| Game | What it does |
|---|---|
| **Football Sounds** | Hear a letter sound, tap the matching letter, score a goal. Five stages, each unlocked by the one before. |
| **Dinosaur Puzzle** | Same sound-to-letter matching, revealing a dinosaur picture piece by piece. |

Both have a **Letter name** button alongside **Hear it again**, so the sound
(`sss`) and the name (`ess`) stay separable — that distinction is the whole
point of synthetic phonics.

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

```sh
node test_curriculum.mjs   # 14 checks
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
