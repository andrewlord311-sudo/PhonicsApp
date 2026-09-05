#!/usr/bin/env python3
"""Felix's Phonics — whole-word audio generator.

Generates one clean WAV per word with ElevenLabs, in the exact format the app
already uses, so the word-based games (Robot Talk, Sound Buttons, Catch the
Sounds, HRS Word Snap, What starts with?) have something to say.

    ./gen_words.py cat sat pat            generate these words
    ./gen_words.py --from wordlists/els-autumn1.txt
    ./gen_words.py --dry-run --from ...   show what it would do, call nothing
    ./gen_words.py --play cat             generate and play it back
    ./gen_words.py --force cat            regenerate one that already exists

Why this is so much simpler than the letter sounds: TTS is *good* at real
words. All the trimming and by-ear iteration documented in the vault's
`Recording Script` note existed only because an isolated phoneme ("sss", a
clipped "t") is the one thing TTS structurally cannot say -- the workaround
was to generate a real word and cut the sound out of it. A whole word needs
none of that. Generate, convert, done.

Same voice as every existing clip (Melody), same format (22050Hz mono 16-bit
PCM WAV), so a word sits alongside the letters without sounding like a
different app.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
WORD_DIR = HERE / "app" / "audio" / "words"
BACKUP_DIR = HERE / "app" / "audio" / "_backup_words"

# Read in this order: the shared secrets file first (the convention across
# every other project here since 8.8.26), then the older per-project .env the
# 6.8.26 letter regeneration used, so this keeps working either way.
ENV_FILES = [Path.home() / ".secrets/keys.env",
             Path.home() / "Projects/Andrew_Game_Apps/.env"]

# Melody -- the same voice as all 52 existing letter clips. Overridable with
# --voice, but changing it means the words and the letters no longer match.
DEFAULT_VOICE = "Xb7hH8MSUJpSbSDYk0k2"
DEFAULT_MODEL = "eleven_multilingual_v2"
API = "https://api.elevenlabs.io/v1/text-to-speech"

# The app's format, matched exactly rather than approximately: every existing
# clip is 22050Hz mono 16-bit PCM, and a word that arrives at 44100 stereo
# will still play but jars against the letters either side of it.
SAMPLE_RATE = "22050"
CHANNELS = "1"

WORD_RE = re.compile(r"^[a-z]+$")


def load_env() -> dict:
    """Merge the env files, first file wins for any given key."""
    found: dict[str, str] = {}
    for path in ENV_FILES:
        if not path.exists():
            continue
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            line = line.removeprefix("export ").strip()
            if "=" not in line:
                continue
            key, _, value = line.partition("=")
            found.setdefault(key.strip(), value.strip().strip('"').strip("'"))
    return found


def normalise(raw: str) -> str | None:
    """Lowercase and validate one word. Returns None if it can't be a filename.

    Lowercase matters beyond tidiness: macOS filesystems are case-insensitive,
    so "I" and "i" would be the same file. Every word is stored lowercase and
    the app looks them up the same way.
    """
    word = raw.strip().lower()
    return word if WORD_RE.match(word) else None


def read_list(path: Path) -> list[str]:
    """One word per line; blank lines and #comments ignored, so a list can be
    annotated with which ELS week it belongs to."""
    words = []
    for line in path.read_text().splitlines():
        line = line.split("#")[0].strip()
        if line:
            words.append(line)
    return words


def speak(text: str, voice: str, model: str, key: str) -> bytes:
    """One ElevenLabs call. Returns MP3 bytes.

    MP3 rather than asking the API for PCM directly: mp3_44100 is available on
    every account tier, the PCM output formats are not, and ffmpeg has to run
    anyway to hit the app's 22050/mono/16-bit. Fewer ways to fail.
    """
    body = json.dumps({
        # A trailing full stop gives the voice a falling, finished intonation.
        # Without it short words come out clipped or oddly questioning --
        # "cat?" instead of "cat." The letter clips did the same thing.
        "text": text if text.endswith((".", "!", "?")) else text + ".",
        "model_id": model,
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
    }).encode()
    req = urllib.request.Request(
        f"{API}/{voice}",
        data=body,
        headers={"xi-api-key": key, "Content-Type": "application/json",
                 "Accept": "audio/mpeg"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def to_app_wav(mp3: bytes, dest: Path) -> None:
    """Convert MP3 bytes to the app's exact WAV format."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    proc = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-y", "-i", "pipe:0",
         "-ar", SAMPLE_RATE, "-ac", CHANNELS, "-c:a", "pcm_s16le", str(dest)],
        input=mp3, capture_output=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {proc.stderr.decode().strip()}")


def back_up(path: Path) -> None:
    """Move an existing clip aside rather than overwriting it.

    Same rule the 6.8.26 letter regeneration followed: the old audio went to
    `_backup_placeholders/` and was never deleted outright. A regenerated word
    that turns out worse than the one it replaced should be recoverable.
    """
    if not path.exists():
        return
    stamp = datetime.now().strftime("%Y-%m-%d")
    dest = BACKUP_DIR / stamp
    dest.mkdir(parents=True, exist_ok=True)
    shutil.move(str(path), str(dest / path.name))


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Generate whole-word audio for Felix's Phonics.")
    ap.add_argument("words", nargs="*", help="words to generate")
    ap.add_argument("--from", dest="from_file", type=Path,
                    help="read words from a file, one per line")
    ap.add_argument("--force", action="store_true",
                    help="regenerate words that already exist (old file is "
                         "moved to _backup_words/, never deleted)")
    ap.add_argument("--dry-run", action="store_true",
                    help="say what would happen, call nothing, cost nothing")
    ap.add_argument("--play", action="store_true",
                    help="play each clip back after generating it")
    ap.add_argument("--voice", default=DEFAULT_VOICE,
                    help="ElevenLabs voice id (default: Melody, as used by "
                         "every existing letter clip)")
    ap.add_argument("--model", default=DEFAULT_MODEL)
    args = ap.parse_args()

    raw = list(args.words)
    if args.from_file:
        if not args.from_file.exists():
            print(f"error: no such word list: {args.from_file}")
            return 1
        raw += read_list(args.from_file)
    if not raw:
        ap.print_help()
        return 1

    # Validate everything before spending a single credit -- a typo in a long
    # list should not be discovered halfway through a paid batch.
    words, rejected = [], []
    for item in raw:
        word = normalise(item)
        if word is None:
            rejected.append(item)
        elif word not in words:
            words.append(word)
    if rejected:
        print(f"error: not usable as filenames (letters a-z only): "
              f"{', '.join(repr(r) for r in rejected)}")
        return 1

    todo = [w for w in words
            if args.force or not (WORD_DIR / f"{w}.wav").exists()]
    skipped = [w for w in words if w not in todo]
    if skipped:
        print(f"Already have {len(skipped)}: {' '.join(skipped)}")
    if not todo:
        print("Nothing to generate.")
        return 0

    chars = sum(len(w) + 1 for w in todo)
    print(f"To generate ({len(todo)}): {' '.join(todo)}")
    print(f"~{chars} characters of ElevenLabs quota.")
    if args.dry_run:
        print("(dry run -- nothing called, nothing written)")
        return 0

    if not shutil.which("ffmpeg"):
        print("error: ffmpeg not found on PATH.")
        return 1
    key = os.environ.get("ELEVENLABS_API_KEY") or load_env().get(
        "ELEVENLABS_API_KEY")
    if not key:
        print(f"error: no ELEVENLABS_API_KEY in the environment or "
              f"{' / '.join(str(p) for p in ENV_FILES)}")
        return 1

    made, failed = [], []
    for word in todo:
        dest = WORD_DIR / f"{word}.wav"
        try:
            mp3 = speak(word, args.voice, args.model, key)
            back_up(dest)
            to_app_wav(mp3, dest)
        except urllib.error.HTTPError as err:
            # Read the body: ElevenLabs puts the actual reason (quota gone,
            # bad voice id) in there, and "HTTP 401" on its own is useless.
            detail = err.read().decode(errors="replace")[:200]
            print(f"  !! {word}: HTTP {err.code} {detail}")
            failed.append(word)
            continue
        except Exception as err:                       # noqa: BLE001
            print(f"  !! {word}: {err}")
            failed.append(word)
            continue
        size = dest.stat().st_size
        print(f"  ok {word} -> {dest.relative_to(HERE)} ({size:,} bytes)")
        made.append(word)
        if args.play:
            subprocess.run(["afplay", str(dest)], check=False)

    print(f"\nGenerated {len(made)}, failed {len(failed)}, "
          f"skipped {len(skipped)}.")
    if failed:
        print(f"Failed: {' '.join(failed)} -- rerun to retry just those.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
