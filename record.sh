#!/bin/bash
# Felix's Phonics — interactive sound recorder.
#
# Records straight from your MacBook's mic via ffmpeg, auto-trims leading/
# trailing silence, plays the take back for you to approve, then saves it
# directly as audio/phase2/<letter>.wav in the exact format the app needs -
# no manual export, rename, or format conversion.
#
# Usage:
#   ./record.sh              walk through all 19 Phase 2 sounds in order
#   ./record.sh s a t p      only record specific letters
#
# Run this yourself in Terminal (it needs a live mic + your voice in real
# time) - the first run will trigger a macOS "Terminal would like to access
# the microphone" prompt; approve it once and it'll stick for future runs.

set -uo pipefail
cd "$(dirname "$0")/app"

DEFAULT_LETTERS=(s a t p i n m d g o c k e u r h b f l)
if [ "$#" -gt 0 ]; then
  LETTERS=("$@")
else
  LETTERS=("${DEFAULT_LETTERS[@]}")
fi

AUDIO_DIR="audio/phase2"
mkdir -p "$AUDIO_DIR"

saved=()
skipped=()

echo "Felix's Phonics — sound recorder"
echo "Pure sound rule: no \"uh\" after consonants. \"sss\" not \"suh\", clipped \"t\" not \"tuh\"."
echo "Say each sound twice per take."
echo ""

for letter in "${LETTERS[@]}"; do
  while true; do
    echo "=== $letter ==="
    read -r -p "Press Enter to start recording '$letter' (or type s + Enter to skip): " action
    if [ "$action" = "s" ]; then
      echo "Skipped $letter."
      skipped+=("$letter")
      break
    fi

    raw="/tmp/phonics_raw_${letter}.wav"
    trimmed="/tmp/phonics_trimmed_${letter}.wav"
    rm -f "$raw" "$trimmed"

    ffmpeg -loglevel error -f avfoundation -i ":0" -ar 22050 -ac 1 -acodec pcm_s16le -y "$raw" &
    FFPID=$!
    read -r -p "Recording... press Enter to stop: "
    kill -INT "$FFPID" 2>/dev/null
    wait "$FFPID" 2>/dev/null

    if [ ! -s "$raw" ]; then
      echo "No audio captured - check mic permissions for Terminal in System Settings > Privacy & Security > Microphone."
      continue
    fi

    ffmpeg -loglevel error -y -i "$raw" -af "silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.1:stop_periods=1:stop_threshold=-40dB:stop_silence=0.3" "$trimmed"

    echo "Playing back..."
    afplay "$trimmed"

    read -r -p "Keep this take? [Y/n/r=redo]: " keep
    case "$keep" in
      [nN]*)
        echo "Discarded."
        skipped+=("$letter")
        rm -f "$raw" "$trimmed"
        break
        ;;
      [rR]*)
        echo "Redoing $letter..."
        rm -f "$raw" "$trimmed"
        continue
        ;;
      *)
        mv "$trimmed" "$AUDIO_DIR/${letter}.wav"
        rm -f "$raw"
        saved+=("$letter")
        echo "Saved $AUDIO_DIR/${letter}.wav"
        break
        ;;
    esac
  done
  echo ""
done

echo "----------------------------------------"
echo "Done! Saved: ${saved[*]:-none}"
if [ "${#skipped[@]}" -gt 0 ]; then
  echo "Skipped: ${skipped[*]}"
fi
