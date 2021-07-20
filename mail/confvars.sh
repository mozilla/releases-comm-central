#! /bin/sh
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

MOZ_APP_NAME=thunderbird
MOZ_UPDATER=1

if test "$OS_ARCH" = "WINNT"; then
  if ! test "$HAVE_64BIT_BUILD"; then
    MOZ_VERIFY_MAR_SIGNATURE=1
  fi
fi

BROWSER_CHROME_URL=chrome://messenger/content/extensionPopup.xhtml

MOZ_BRANDING_DIRECTORY=$commreltopsrcdir/mail/branding/nightly
MOZ_OFFICIAL_BRANDING_DIRECTORY=$commreltopsrcdir/mail/branding/thunderbird

MOZ_APP_ID={3550f703-e582-4d05-9a08-453d09bdfdc6}

# Windows AccessibleHandler.dll GUIDs differ depending on product, channel,
# and officiality. This prevents handlers from installing overtop one another
# when multiple products and channels are present.
# These GUIDs are used for non-official and non-release builds.
# GUIDs used for official shippable builds are in the branding directories.
# This file is evaluated before the branding/configure.sh files.
if test "$DEVELOPER_OPTIONS"; then
  if test "$MOZ_DEBUG"; then
    # Local debug builds
    MOZ_HANDLER_CLSID="276382b8-078f-4a75-b95f-ebcc41b4e561"
    MOZ_IHANDLERCONTROL_IID="55960b36-86ff-4b46-90eb-11e66a8251a0"
    MOZ_ASYNCIHANDLERCONTROL_IID="78b9a700-787e-406a-b94a-e656a2d4595f"
    MOZ_IGECKOBACKCHANNEL_IID="68966673-f742-4f1d-8f1c-d0517f282d8a"
  else
    # Local non-debug builds
    MOZ_HANDLER_CLSID="54b33546-ee72-4ab7-8710-200c4ec74742"
    MOZ_IHANDLERCONTROL_IID="6ee6f1c5-d331-4fa2-8e95-b9680a0f0264"
    MOZ_ASYNCIHANDLERCONTROL_IID="3da29f8e-d8ee-4d60-80f8-74665b7f271c"
    MOZ_IGECKOBACKCHANNEL_IID="0195ae7b-1315-442f-a0b8-d94372d51917"
  fi
else
  # These are fallback GUIDs
  MOZ_HANDLER_CLSID="a1a19c81-bc15-41fc-871e-d156bc600ea7"
  MOZ_IHANDLERCONTROL_IID="458bec8f-de60-4c44-ba08-29d47412feb8"
  MOZ_ASYNCIHANDLERCONTROL_IID="9deb1d0b-766d-47ed-a912-22602ccb4e22"
  MOZ_IGECKOBACKCHANNEL_IID="623aa5c7-eb2c-4807-b5dd-f3e3754de30f"
fi

MOZ_PROFILE_MIGRATOR=1
MOZ_BINARY_EXTENSIONS=1
MOZ_SEPARATE_MANIFEST_FOR_THEME_OVERRIDES=1

# Enable building ./signmar and running libmar signature tests
MOZ_ENABLE_SIGNMAR=1

MOZ_DEVTOOLS=all

NSS_EXTRA_SYMBOLS_FILE=../comm/mailnews/nss-extra.symbols
