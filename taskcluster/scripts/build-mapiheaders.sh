#!/bin/bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

set -x -e

WORKSPACE=$HOME/workspace
UPLOAD_DIR=${UPLOAD_DIR:=/tmp}
PROJECT=mapiheader

cd $WORKSPACE

# Redirected from "https://www.microsoft.com/en-us/download/confirmation.aspx?id=12905"
SHA256SUM="536c5bc59f65e9d97b1350d5df9f7e53e58b07f2de62202e6bf08f376b3ae9ea"
wget -O MAPIHeaders.exe \
    "https://download.microsoft.com/download/B/6/4/B645F2C9-715A-4EAB-B561-CC0C9779C249/Outlook2010MAPIHeaders.EXE"

echo "$SHA256SUM MAPIHeaders.exe" | sha256sum --check -

mkdir "$PROJECT" && \
    ( 7z x MAPIHeaders.exe && \
      7z x -o$PROJECT/ OUTLOO~1.EXE ) || rm -rf "$PROJECT"

rm -f "OUTLOO~1.EXE" MAPIHeaders.exe
# Disable the MAPI.h hera we want the one in the SDK
mv -f "$PROJECT"/MAPI.h "$PROJECT"/__DISABLED_MAPI.h

# Make the filenames all lowercase characters
_HDR_FILES=$PROJECT/*.h
for _hdr_path in ${_HDR_FILES}; do
    _hdr_file=${_hdr_path##*/}
    mv ${_hdr_path} ${PROJECT}/${_hdr_file,,}
done

tar caf mapiheader.tar.xz "$PROJECT"
mkdir -p "$UPLOAD_DIR"
cp mapiheader.tar.xz "$UPLOAD_DIR"
