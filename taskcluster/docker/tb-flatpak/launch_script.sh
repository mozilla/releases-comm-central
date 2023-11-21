#!/bin/bash
export TMPDIR="$XDG_RUNTIME_DIR/app/$FLATPAK_ID"
exec /app/lib/thunderbird/thunderbird --name org.mozilla.Thunderbird "$@"
