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

const MESSENGER_WINDOW = "chrome://messenger/content/messenger.xhtml";

function setXULToolbarState(
  currentSet = "",
  defaultSet = "",
  toolbarId = "mail-bar3"
) {
  Services.xulStore.setValue(
    MESSENGER_WINDOW,
    toolbarId,
    "currentset",
    currentSet
  );
  Services.xulStore.setValue(
    MESSENGER_WINDOW,
    toolbarId,
    "defaultset",
    defaultSet
  );
}

add_setup(() => {
  do_get_profile();
  storeState({});
});

add_task(function test_migration_customized() {
  setXULToolbarState(
    "button-getmsg,button-newmsg,button-reply,spacer,qfb-show-filter-bar,button-file,folder-location-container,spring,gloda-search,button-appmenu"
  );
  setXULToolbarState(
    "menubar-items,spring,button-addons",
    "",
    "toolbar-menubar"
  );
  setXULToolbarState("button-delete", "", "tabbar-toolbar");

  migrateToolbarForSpace("mail");

  const newState = getState();

  Assert.deepEqual(
    newState.mail,
    [
      "get-messages",
      "write-message",
      "reply",
      "spacer",
      "quick-filter-bar",
      "move-to",
      "folder-location",
      "spacer",
      "search-bar",
      "spacer",
      "add-ons-and-themes",
      "delete",
    ],
    "Items were combined and migrated"
  );
  Assert.ok(
    !Services.xulStore.hasValue(MESSENGER_WINDOW, "mail-bar3", "currentset"),
    "Old toolbar state is cleared"
  );
  Assert.ok(
    !Services.xulStore.hasValue(MESSENGER_WINDOW, "mail-bar3", "defaultset"),
    "Old toolbar default state is cleared"
  );

  storeState({});
});

add_task(function test_migration_defaults() {
  setXULToolbarState();
  setXULToolbarState("", "", "toolbar-menubar");
  setXULToolbarState("", "", "tabbar-toolbar");

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
      "search-bar",
      "spacer",
    ],
    "Default states were combined and migrated"
  );
  Assert.ok(
    !Services.xulStore.hasValue(MESSENGER_WINDOW, "mail-bar3", "currentset"),
    "Old toolbar state is cleared"
  );
  Assert.ok(
    !Services.xulStore.hasValue(MESSENGER_WINDOW, "mail-bar3", "defaultset"),
    "Old toolbar default state is cleared"
  );

  storeState({});
});

add_task(function test_migration_empty() {
  setXULToolbarState("__empty");
  setXULToolbarState("__empty", "menubar-items,spring", "toolbar-menubar");
  setXULToolbarState("__empty", "", "tabbar-toolbar");

  migrateToolbarForSpace("mail");

  const newState = getState();

  Assert.deepEqual(newState.mail, [], "The toolbar contents were emptied");
  Assert.ok(
    !Services.xulStore.hasValue(MESSENGER_WINDOW, "mail-bar3", "currentset"),
    "Old toolbar state is cleared"
  );
  Assert.ok(
    !Services.xulStore.hasValue(MESSENGER_WINDOW, "mail-bar3", "defaultset"),
    "Old toolbar default state is cleared"
  );

  storeState({});
});

add_task(function test_migration_noop() {
  const state = { mail: ["spacer", "search-bar", "spacer"] };
  storeState(state);

  migrateToolbarForSpace("mail");

  const newState = getState();

  Assert.deepEqual(newState, state, "Customization state is not modified");
  Assert.ok(
    !Services.xulStore.hasValue(MESSENGER_WINDOW, "mail-bar3", "currentset"),
    "Old toolbar state is cleared"
  );
  Assert.ok(
    !Services.xulStore.hasValue(MESSENGER_WINDOW, "mail-bar3", "defaultset"),
    "Old toolbar default state is cleared"
  );

  storeState({});
});
