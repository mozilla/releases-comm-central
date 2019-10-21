#!/bin/bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, you can obtain one at http://mozilla.org/MPL/2.0/.

if test -z "$GECKO_PATH"
then
  echo "GECKO_PATH is not set"
  exit 1
fi
if test -z "$MOZ_FETCHES_DIR"
then
  echo "MOZ_FETCHES_DIR is not set"
  exit 1
fi

if [[ $GECKO_HEAD_REPOSITORY =~ beta|esr ]]
then
  path='distribution/extensions/{e2fda1a4-762b-4020-b5ad-a41df1933103}.xpi'
else
  path='extensions/{e2fda1a4-762b-4020-b5ad-a41df1933103}.xpi'
fi

cd "$MOZ_FETCHES_DIR" || exit 1
unzip lightning.xpi chrome.manifest

for l in *
do
  if [[ $l == ja-JP-mac ]]
  then
    pushd "$l" || exit 1
    "$MOZ_FETCHES_DIR/dmg/dmg" extract target.dmg target.hfs
    "$MOZ_FETCHES_DIR/dmg/hfsplus" target.hfs extractall
    prepath='Thunderbird.app/Contents/Resources'
    if test ! -f "$prepath/$path"
    then
      prepath='Thunderbird Daily.app/Contents/Resources'
    fi
    popd || exit 1
  else
    prepath='thunderbird'
  fi

  if test -f "$l/$prepath/$path"
  then
    pushd "$l" || exit 1

    unzip "$prepath/$path" "chrome/calendar-$l/*" "chrome/lightning-$l/*"
    find chrome -type f | sort | zip -@ ../lightning.xpi

    mkdir -p "_locales/$l"
    if [[ $GECKO_HEAD_REPOSITORY =~ esr68 ]]
    then
      echo "locale calendar $l chrome/calendar-$l/locale/$l/calendar/" >> ../chrome.manifest
      echo "locale lightning $l chrome/lightning-$l/locale/$l/lightning/" >> ../chrome.manifest
      python3 "$GECKO_PATH/comm/calendar/lightning/repack/webextify.py" "chrome/lightning-$l/locale/$l/lightning/lightning.properties" "_locales/$l/messages.json"
    else
      echo "locale calendar $l chrome/calendar-$l/" >> ../chrome.manifest
      echo "locale lightning $l chrome/lightning-$l/" >> ../chrome.manifest
      python3 "$GECKO_PATH/comm/calendar/lightning/repack/webextify.py" "chrome/lightning-$l/lightning.properties" "_locales/$l/messages.json"
    fi
    touch -d 20100101 "_locales/$l/messages.json"
    zip ../lightning.xpi "_locales/$l/messages.json"

    popd || exit 1
  elif test -d "$l"
  then
    echo "$prepath/$path not found in $l"
  fi
done

touch -d 20100101 chrome.manifest
zip lightning.xpi chrome.manifest

mkdir -p "_locales/en-US"
if [[ $GECKO_HEAD_REPOSITORY =~ esr68 ]]
then
  unzip lightning.xpi chrome/lightning-en-US/locale/en-US/lightning/lightning.properties
  python3 "$GECKO_PATH/comm/calendar/lightning/repack/webextify.py" "chrome/lightning-en-US/locale/en-US/lightning/lightning.properties" "_locales/en-US/messages.json"
else
  unzip lightning.xpi chrome/lightning-en-US/lightning.properties
  python3 "$GECKO_PATH/comm/calendar/lightning/repack/webextify.py" "chrome/lightning-en-US/lightning.properties" "_locales/en-US/messages.json"
fi
touch -d 20100101 "_locales/en-US/messages.json"
zip lightning.xpi "_locales/en-US/messages.json"

unzip lightning.xpi manifest.json
python3 "$GECKO_PATH/comm/calendar/lightning/repack/modify-manifest.py"
touch -d 20100101 manifest.json
zip lightning.xpi manifest.json

if test -n "$UPLOAD_DIR"
then
  mkdir "$UPLOAD_DIR"
  cp lightning.xpi "$UPLOAD_DIR"
fi
