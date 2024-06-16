#! /bin/sh
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

MOZ_APP_NAME=thunderbird
MOZ_APP_PROFILE=thunderbird

if test "$OS_ARCH" = "WINNT"; then
  if ! test "$HAVE_64BIT_BUILD"; then
    MOZ_VERIFY_MAR_SIGNATURE=1
  fi
fi

MOZ_BRANDING_DIRECTORY=comm/mail/branding/nightly
MOZ_OFFICIAL_BRANDING_DIRECTORY=comm/mail/branding/thunderbird
# This looks silly, but it's for the benefit of MSIX repackaging.
if test -n "$THUNDERBIRD_OFFICIAL_BRANDING"; then
  MOZ_OFFICIAL_BRANDING_DIRECTORY=comm/mail/branding/$THUNDERBIRD_OFFICIAL_BRANDING
fi

MOZ_PROFILE_MIGRATOR=1
MOZ_BINARY_EXTENSIONS=1
MOZ_SEPARATE_MANIFEST_FOR_THEME_OVERRIDES=1

# Enable building ./signmar and running libmar signature tests
MOZ_ENABLE_SIGNMAR=1

NSS_EXTRA_SYMBOLS_FILE=../comm/mailnews/nss-extra.symbols
