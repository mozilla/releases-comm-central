#! /bin/sh
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

MOZ_APP_BASENAME=Instantbird
MOZ_APP_NAME=instantbird
MOZ_APP_STATIC_INI=1
MOZ_XUL_APP=1
MOZ_ENABLE_LIBXUL=1
MOZ_CHROME_FILE_FORMAT=omni
MOZ_DISABLE_EXPORT_JS=1
MOZ_UPDATER=1
MOZ_MATHML=
MOZ_MEDIA_NAVIGATOR=1
MOZ_BINARY_EXTENSIONS=1

MOZ_APP_VERSION_TXT=${_topsrcdir}/$MOZ_BUILD_APP/config/version.txt
MOZ_APP_VERSION=`cat $MOZ_APP_VERSION_TXT`
INSTANTBIRD_VERSION=$MOZ_APP_VERSION

MOZ_BRANDING_DIRECTORY=im/branding/nightly
MOZ_OFFICIAL_BRANDING_DIRECTORY=other-licenses/branding/instantbird
MOZ_APP_ID={33cb9019-c295-46dd-be21-8c4936574bee}
# Enable generational GC on desktop.
JSGC_GENERATIONAL=1
if test "$OS_TARGET" = "WINNT"; then
  NSS_EXTRA_SYMBOLS_FILE=../../../../chat/nss-purple.def
fi
