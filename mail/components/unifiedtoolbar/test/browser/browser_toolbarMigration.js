/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { migrateToolbarForSpace } = ChromeUtils.importESModule(
  "resource:///modules/ToolbarMigration.sys.mjs"
);
const { getState, storeState } = ChromeUtils.importESModule(
  "resource:///modules/CustomizationState.mjs"
);
const { EXTENSION_PREFIX } = ChromeUtils.importESModule(
  "resource:///modules/CustomizableItems.sys.mjs"
);
const { getCachedAllowedSpaces, setCachedAllowedSpaces } =
  ChromeUtils.importESModule(
    "resource:///modules/ExtensionToolbarButtons.sys.mjs"
  );
const MESSENGER_WINDOW = "chrome://messenger/content/messenger.xhtml";
const EXTENSION_ID = "thunderbird-compact-light@mozilla.org";

add_setup(() => {
  storeState({});
});

add_task(async function test_migrate_extension() {
  Services.xulStore.setValue(MESSENGER_WINDOW, "mail-bar3", "currentset", "");
  Services.xulStore.setValue(
    MESSENGER_WINDOW,
    "mail-bar3",
    "defaultset",
    "button-getmsg,button-newmsg,separator,button-tag,qfb-show-filter-bar,spring,gloda-search,thunderbird-compact-light_mozilla_org-browserAction-toolbarbutton,button-appmenu"
  );
  Services.xulStore.setValue(
    MESSENGER_WINDOW,
    "mail-bar3",
    "extensionset",
    "thunderbird-compact-light_mozilla_org-browserAction-toolbarbutton"
  );
  const extensionPref = Services.prefs.getStringPref(
    "extensions.webextensions.uuids",
    ""
  );
  const parsedPref = JSON.parse(extensionPref || "{}");
  if (!parsedPref.hasOwnProperty(EXTENSION_ID)) {
    parsedPref[EXTENSION_ID] = "foo";
    Services.prefs.setStringPref(
      "extensions.webextensions.uuids",
      JSON.stringify(parsedPref)
    );
  }

  migrateToolbarForSpace("mail");

  const newState = getState();

  Assert.deepEqual(
    newState.mail,
    [
      "get-messages",
      "write-message",
      "tag-message",
      "quick-filter-bar",
      "spacer",
      `${EXTENSION_PREFIX}${EXTENSION_ID}`,
      "spacer",
    ],
    "Extension button was converted to new ID format"
  );
  Assert.ok(
    !Services.xulStore.hasValue(MESSENGER_WINDOW, "mail-bar3", "currentset"),
    "Old toolbar state is cleared"
  );
  Assert.ok(
    !Services.xulStore.hasValue(MESSENGER_WINDOW, "mail-bar3", "defaultset"),
    "Old toolbar default state is cleared"
  );
  Assert.ok(
    !Services.xulStore.hasValue(MESSENGER_WINDOW, "mail-bar3", "extensionset"),
    "Old toolbar extension state is cleared"
  );
  Assert.deepEqual(
    Object.fromEntries(getCachedAllowedSpaces()),
    { [EXTENSION_ID]: ["mail"] },
    "Extension set migrated to new persistent extension state"
  );

  storeState({});
  setCachedAllowedSpaces(new Map());
  if (extensionPref) {
    Services.prefs.setStringPref(
      "extensions.webextensions.uuids",
      extensionPref
    );
  } else {
    Services.prefs.clearUserPref("extensions.webextensions.uuids");
  }
});
