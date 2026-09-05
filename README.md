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

## Structure

```
index.html        redirect to app/ so the short Pages URL works
app/index.html    the game shell
app/app.js        all game logic
app/style.css     all styling
app/audio/        letter sounds and letter names
app/audio/words/  whole-word clips (gen_words.py)
app/images/       dinosaur SVGs
gen_words.py      whole-word audio generator
wordlists/        word lists by ELS teaching week
```
