#!/bin/bash
# Fetch one checkpoint to a local directory outside the repository.
#
# Uses curl with byte-range resume rather than huggingface_hub because the CDN
# truncates unauthenticated transfers mid-file — a ~2.4 GB weight file arrived as a
# silent 1,024,000,000-byte stall, and the library's own retry did not resume it.
# `curl -C -` picks up from whatever is on disk, and the loop re-enters until the
# size matches what the API reports.
#
# NEVER run this into the repository. Weights are not committed (§4).
set -u

REPO="${1:?usage: fetch-checkpoint.sh <hf-repo> <dest-dir>}"
DEST="${2:?usage: fetch-checkpoint.sh <hf-repo> <dest-dir>}"
BASE="https://huggingface.co/${REPO}/resolve/main"

mkdir -p "$DEST"

SMALL=(config.json preprocessor_config.json tokenizer_config.json vocab.json
       special_tokens_map.json added_tokens.json README.md)

for f in "${SMALL[@]}"; do
  if [ ! -s "$DEST/$f" ]; then
    curl -sSL --retry 5 --retry-delay 2 --max-time 120 -o "$DEST/$f" "$BASE/$f" \
      && echo "got $f" || echo "skip $f (not present)"
  fi
done

# Authoritative size from the API, so "finished" is a comparison rather than a guess.
EXPECTED=$(curl -sSL --max-time 60 "https://huggingface.co/api/models/${REPO}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["safetensors"]["total"]*4)' 2>/dev/null)
[ -z "$EXPECTED" ] && EXPECTED=0

W="$DEST/model.safetensors"
for attempt in $(seq 1 200); do
  have=$(stat -f %z "$W" 2>/dev/null || echo 0)
  # Header size is the truth; the parameter-count estimate above is only a fallback.
  total=$(curl -sSLI --max-time 60 "$BASE/model.safetensors" \
    | awk 'BEGIN{IGNORECASE=1}/^content-length:/{v=$2}END{gsub(/\r/,"",v);print v}')
  [ -z "$total" ] && total=$EXPECTED
  if [ "$have" -gt 0 ] && [ "$total" -gt 0 ] && [ "$have" -ge "$total" ]; then
    echo "model.safetensors complete: $have bytes"
    break
  fi
  echo "attempt $attempt: have $have of ${total:-?} bytes"
  curl -sSL -C - --retry 3 --retry-delay 3 --max-time 900 -o "$W" "$BASE/model.safetensors"
  sleep 2
done

echo "--- $DEST ---"
ls -l "$DEST"
shasum -a 256 "$W" | tee "$DEST/model.safetensors.sha256"
