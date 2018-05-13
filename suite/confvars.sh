#! /bin/sh
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

. ${_topsrcdir}/$MOZ_BUILD_APP/../comm-confvars.sh

MOZ_APP_BASENAME=SeaMonkey
MOZ_APP_VENDOR=Mozilla
MOZ_APP_NAME=seamonkey
MOZ_APP_DISPLAYNAME=SeaMonkey
MOZ_BRANDING_DIRECTORY=$commreltopsrcdir/suite/branding/seamonkey
MOZ_OFFICIAL_BRANDING_DIRECTORY=$commreltopsrcdir/suite/branding/seamonkey
MOZ_UPDATER=1
# This should usually be the same as the value MAR_CHANNEL_ID.
# If more than one ID is needed, then you should use a comma separated list
# of values.
ACCEPTED_MAR_CHANNEL_IDS=seamonkey-comm-central
# The MAR_CHANNEL_ID must not contain the following 3 characters: ",\t "
MAR_CHANNEL_ID=seamonkey-comm-central
MOZ_SERVICES_FXACCOUNTS=1

MOZ_APP_VERSION_TXT=${_topsrcdir}/$MOZ_BUILD_APP/config/version.txt
MOZ_APP_VERSION=`cat $MOZ_APP_VERSION_TXT`
SEAMONKEY_VERSION=$MOZ_APP_VERSION

MOZ_APP_ID={92650c4d-4b8e-4d2a-b7eb-24ecf4f6b63a}
MOZ_PROFILE_MIGRATOR=1

if test "$NIGHTLY_BUILD"; then
  MOZ_RUST_URLPARSE=1
fi

if test "$OS_ARCH" = "WINNT" -o \
        "$OS_ARCH" = "Linux"; then
  MOZ_BUNDLED_FONTS=1
fi

# Include the DevTools client, not just the server (which is the default)
MOZ_DEVTOOLS=all

# Bundled extensions ChatZilla DOM Inspector and debugQA
MOZ_IRC=
MOZ_DOMINSPECTOR=

if [[ $MOZ_APP_VERSION == *a* ]]; then
  MOZ_DEBUGQA=
fi

if [[ $MOZ_IRC == 1 ]]; then
  MOZ_EXTENSIONS_DEFAULT='irc'
fi

if [[ $MOZ_DOMINSPECTOR == 1 ]]; then
  MOZ_EXTENSIONS_DEFAULT+=' inspector'
fi
