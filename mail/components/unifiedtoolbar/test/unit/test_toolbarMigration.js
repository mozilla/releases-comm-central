/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { migrateToolbarForSpace, clearXULToolbarState } =
  ChromeUtils.importESModule("resource:///modules/ToolbarMigration.sys.mjs");
const { getState, storeState } = ChromeUtils.importESModule(
  "resource:///modules/CustomizationState.mjs"
);
const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
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

  Assert.ok(!newState.mail, "New default state was preserved");
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

add_task(function test_calendar_migration() {
  setXULToolbarState(
    "calendar-synchronize-button,calendar-newevent-button,separator,calendar-edit-button,calendar-delete-button,spring,calendar-unifinder-button,calendar-appmenu-button",
    "",
    "calendar-toolbar2"
  );
  setXULToolbarState(
    "menubar-items,spring,button-addons",
    "",
    "toolbar-menubar"
  );
  setXULToolbarState("button-delete", "", "tabbar-toolbar");

  migrateToolbarForSpace("calendar");

  const newState = getState();

  Assert.deepEqual(
    newState.calendar,
    [
      "synchronize",
      "new-event",
      "edit-event",
      "delete-event",
      "spacer",
      "unifinder",
      "spacer",
      "add-ons-and-themes",
    ],
    "Items were combined and migrated"
  );
  Assert.ok(
    !Services.xulStore.hasValue(
      MESSENGER_WINDOW,
      "calendar-toolbar2",
      "currentset"
    ),
    "Old toolbar state is cleared"
  );
  Assert.ok(
    !Services.xulStore.hasValue(
      MESSENGER_WINDOW,
      "calendar-toolbar2",
      "defaultset"
    ),
    "Old toolbar default state is cleared"
  );

  storeState({});
});

add_task(function test_calendar_migration_defaults() {
  setXULToolbarState("", "", "calendar-toolbar2");
  setXULToolbarState("", "", "toolbar-menubar");
  setXULToolbarState("", "", "tabbar-toolbar");

  migrateToolbarForSpace("calendar");

  const newState = getState();

  Assert.deepEqual(
    newState.calendar,
    [
      "synchronize",
      "new-event",
      "new-task",
      "edit-event",
      "delete-event",
      "spacer",
    ],
    "Default states were combined and migrated"
  );
  Assert.ok(
    !Services.xulStore.hasValue(
      MESSENGER_WINDOW,
      "calendar-toolbar2",
      "currentset"
    ),
    "Old toolbar state is cleared"
  );
  Assert.ok(
    !Services.xulStore.hasValue(
      MESSENGER_WINDOW,
      "calendar-toolbar2",
      "defaultset"
    ),
    "Old toolbar default state is cleared"
  );

  storeState({});
});

add_task(function test_tasks_migration() {
  setXULToolbarState(
    "task-synchronize-button,task-newtask-button,task-edit-button,task-delete-button,task-print-button,spring,task-appmenu-button",
    "",
    "task-toolbar2"
  );
  setXULToolbarState(
    "menubar-items,spring,button-addons",
    "",
    "toolbar-menubar"
  );
  setXULToolbarState("button-delete", "", "tabbar-toolbar");

  migrateToolbarForSpace("tasks");

  const newState = getState();

  Assert.deepEqual(
    newState.tasks,
    [
      "synchronize",
      "new-task",
      "edit-event",
      "delete-event",
      "print-event",
      "spacer",
      "add-ons-and-themes",
    ],
    "Items were combined and migrated"
  );
  Assert.ok(
    !Services.xulStore.hasValue(
      MESSENGER_WINDOW,
      "task-toolbar2",
      "currentset"
    ),
    "Old toolbar state is cleared"
  );
  Assert.ok(
    !Services.xulStore.hasValue(
      MESSENGER_WINDOW,
      "task-toolbar2",
      "defaultset"
    ),
    "Old toolbar default state is cleared"
  );

  storeState({});
});

add_task(function test_tasks_migration_defaults() {
  setXULToolbarState("", "", "task-toolbar2");
  setXULToolbarState("", "", "toolbar-menubar");
  setXULToolbarState("", "", "tabbar-toolbar");

  migrateToolbarForSpace("tasks");

  const newState = getState();

  Assert.deepEqual(
    newState.tasks,
    [
      "synchronize",
      "new-event",
      "new-task",
      "edit-event",
      "delete-event",
      "spacer",
    ],
    "Default states were combined and migrated"
  );
  Assert.ok(
    !Services.xulStore.hasValue(
      MESSENGER_WINDOW,
      "task-toolbar2",
      "currentset"
    ),
    "Old toolbar state is cleared"
  );
  Assert.ok(
    !Services.xulStore.hasValue(
      MESSENGER_WINDOW,
      "task-toolbar2",
      "defaultset"
    ),
    "Old toolbar default state is cleared"
  );

  storeState({});
});

add_task(function test_global_items_migration() {
  setXULToolbarState(
    "menubar-items,spring,button-addons",
    "",
    "toolbar-menubar"
  );
  setXULToolbarState("button-delete", "", "tabbar-toolbar");

  migrateToolbarForSpace("settings");

  const newState = getState();

  Assert.deepEqual(newState.settings, [
    "spacer",
    "search-bar",
    "spacer",
    "add-ons-and-themes",
  ]);

  storeState({});
});

add_task(function test_global_items_migration_defaults() {
  setXULToolbarState("", "", "toolbar-menubar");
  setXULToolbarState("", "", "tabbar-toolbar");

  migrateToolbarForSpace("settings");

  const newState = getState();

  Assert.deepEqual(newState.settings, ["spacer", "search-bar", "spacer"]);

  storeState({});
});

add_task(function test_clear_xul_toolbar_state() {
  setXULToolbarState(
    "menubar-items,spring,button-addons",
    "menubar-items,spring",
    "toolbar-menubar"
  );

  clearXULToolbarState("toolbar-menubar");

  Assert.ok(
    !Services.xulStore.hasValue(
      MESSENGER_WINDOW,
      "toolbar-menubar",
      "currentset"
    ),
    "Old toolbar state is cleared"
  );
  Assert.ok(
    !Services.xulStore.hasValue(
      MESSENGER_WINDOW,
      "toolbar-menubar",
      "defaultset"
    ),
    "Old toolbar default state is cleared"
  );
});

add_task(function test_migration_defaults_with_extension() {
  setXULToolbarState(
    AppConstants.platform == "macosx"
      ? "button-getmsg,button-newmsg,button-tag,qfb-show-filter-bar,spring,gloda-search,extension1,extension2,button-appmenu"
      : "button-getmsg,button-newmsg,separator,button-tag,qfb-show-filter-bar,spring,gloda-search,extension1,extension2,button-appmenu"
  );
  setXULToolbarState("", "", "toolbar-menubar");
  setXULToolbarState("", "", "tabbar-toolbar");
  Services.xulStore.setValue(
    MESSENGER_WINDOW,
    "mail-bar3",
    "extensionset",
    "extension1,extension2"
  );

  migrateToolbarForSpace("mail");

  const newState = getState();

  Assert.ok(!newState.mail, "New default state was preserved");
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

  storeState({});
});
