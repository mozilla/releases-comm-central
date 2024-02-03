#!/bin/bash

# Set TMPDIR to be under the user's default Downloads directory
TMPDIR=$(xdg-user-dir DOWNLOAD)/thunderbird.tmp
export TMPDIR

exec "$@"
