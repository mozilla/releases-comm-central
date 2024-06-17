#! /bin/sh
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

MOZ_APP_NAME=seamonkey
MOZ_APP_DISPLAYNAME=SeaMonkey

MOZ_APP_VERSION=$SEAMONKEY_VERSION
MOZ_APP_VERSION_DISPLAY=$SEAMONKEY_VERSION_DISPLAY
# MOZ_PKG_VERSION=$SEAMONKEY_VERSION_PACKAGE

MOZ_BRANDING_DIRECTORY=comm/suite/branding/seamonkey
MOZ_OFFICIAL_BRANDING_DIRECTORY=comm/suite/branding/seamonkey
MOZ_UPDATER=1
# This should usually be the same as the value MAR_CHANNEL_ID.
# If more than one ID is needed, then you should use a comma separated list
# of values.
ACCEPTED_MAR_CHANNEL_IDS=seamonkey-comm-central
# The MAR_CHANNEL_ID must not contain the following 3 characters: ",\t "
MAR_CHANNEL_ID=seamonkey-comm-central

MOZ_PROFILE_MIGRATOR=1

NSS_EXTRA_SYMBOLS_FILE=../comm/mailnews/nss-extra.symbols
