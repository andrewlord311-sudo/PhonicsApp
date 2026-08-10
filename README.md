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

## Structure

```
index.html        redirect to app/ so the short Pages URL works
app/index.html    the game shell
app/app.js        all game logic
app/style.css     all styling
app/audio/        letter sounds and letter names
app/images/       dinosaur SVGs
```
