#! /bin/sh
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

MOZ_APP_BASENAME=Thunderbird
MOZ_APP_NAME=thunderbird
MOZ_UPDATER=1

if test "$OS_ARCH" = "WINNT"; then
  if ! test "$HAVE_64BIT_BUILD"; then
    MOZ_VERIFY_MAR_SIGNATURE=1
  fi
fi

BROWSER_CHROME_URL=chrome://messenger/content/messengercompose/messengercompose.xul

MOZ_BRANDING_DIRECTORY=$commreltopsrcdir/mail/branding/nightly
MOZ_OFFICIAL_BRANDING_DIRECTORY=$commreltopsrcdir/mail/branding/thunderbird

MOZ_APP_ID={3550f703-e582-4d05-9a08-453d09bdfdc6}
# This should usually be the same as the value MAR_CHANNEL_ID.
# If more than one ID is needed, then you should use a comma separated list
# of values.
ACCEPTED_MAR_CHANNEL_IDS=thunderbird-comm-central
# The MAR_CHANNEL_ID must not contain the following 3 characters: ",\t "
MAR_CHANNEL_ID=thunderbird-comm-central
MOZ_PROFILE_MIGRATOR=1
MOZ_BINARY_EXTENSIONS=1
MOZ_SEPARATE_MANIFEST_FOR_THEME_OVERRIDES=1

# Enable building ./signmar and running libmar signature tests
MOZ_ENABLE_SIGNMAR=1

MOZ_DEVTOOLS=all
