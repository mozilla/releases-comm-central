/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

// Prefs
var PREF_TASKBAR_BRANCH = "mail.taskbar.lists.";
var PREF_TASKBAR_ENABLED = "enabled";
var PREF_TASKBAR_TASKS = "tasks.enabled";

const lazy = {};

ChromeUtils.defineLazyGetter(lazy, "_stringBundle", function () {
  return Services.strings.createBundle(
    "chrome://messenger/locale/taskbar.properties"
  );
});

XPCOMUtils.defineLazyServiceGetter(
  lazy,
  "_taskbarService",
  "@mozilla.org/windows-taskbar;1",
  "nsIWinTaskbar"
);

ChromeUtils.defineLazyGetter(lazy, "_prefs", function () {
  return Services.prefs.getBranch(PREF_TASKBAR_BRANCH);
});

function _getString(aName) {
  return lazy._stringBundle.GetStringFromName(aName);
}

/**
 * Task list
 */
var gTasks = [
  // Write new message
  {
    get title() {
      return _getString("taskbar.tasks.composeMessage.label");
    },
    get description() {
      return _getString("taskbar.tasks.composeMessage.description");
    },
    args: "-compose",
    iconIndex: 2, // Write message icon
  },

  // Open address book
  {
    get title() {
      return _getString("taskbar.tasks.openAddressBook.label");
    },
    get description() {
      return _getString("taskbar.tasks.openAddressBook.description");
    },
    args: "-addressbook",
    iconIndex: 3, // Open address book icon
  },
];

export var WinTaskbarJumpList = {
  /**
   * Startup, shutdown, and update
   */

  startup() {
    // exit if this isn't win7 or higher.
    if (!this._initTaskbar()) {
      return;
    }

    // Store our task list config data
    this._tasks = gTasks;

    // retrieve taskbar related prefs.
    this._refreshPrefs();

    // observer for our prefs branch
    this._initObs();

    this.update();
  },

  update() {
    // are we disabled via prefs? don't do anything!
    if (!this._enabled) {
      return;
    }

    // do what we came here to do, update the taskbar jumplist
    this._buildList();
  },

  _shutdown() {
    this._shuttingDown = true;

    this._free();
  },

  /**
   * List building
   */

  _buildList() {
    // anything to build?
    if (!this._showTasks) {
      // don't leave the last list hanging on the taskbar.
      this._deleteActiveJumpList();
      return;
    }

    if (!this._startBuild()) {
      return;
    }

    if (this._showTasks) {
      this._buildTasks();
    }

    this._commitBuild();
  },

  /**
   * Taskbar api wrappers
   */

  _startBuild() {
    // This is useful if there are any async tasks pending. Since we don't right
    // now, it's just harmless.
    this._builder.abortListBuild();
    // Since our list is static right now, we won't actually get back any
    // removed items.
    const removedItems = Cc["@mozilla.org/array;1"].createInstance(
      Ci.nsIMutableArray
    );
    return this._builder.initListBuild(removedItems);
  },

  _commitBuild() {
    this._builder.commitListBuild(succeed => {
      if (!succeed) {
        this._builder.abortListBuild();
      }
    });
  },

  _buildTasks() {
    if (this._tasks.length > 0) {
      var items = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
      for (const item of this._tasks.map(task =>
        this._createHandlerAppItem(task)
      )) {
        items.appendElement(item);
      }
      this._builder.addListToBuild(
        this._builder.JUMPLIST_CATEGORY_TASKS,
        items
      );
    }
  },

  _deleteActiveJumpList() {
    this._builder.deleteActiveList();
  },

  /**
   * Jump list item creation helpers
   */

  _createHandlerAppItem(aTask) {
    const file = Services.dirsvc.get("XCurProcD", Ci.nsIFile);

    // XXX where can we grab this from in the build? Do we need to?
    file.append("thunderbird.exe");

    const handlerApp = Cc[
      "@mozilla.org/uriloader/local-handler-app;1"
    ].createInstance(Ci.nsILocalHandlerApp);
    handlerApp.executable = file;
    // handlers default to the leaf name if a name is not specified
    const title = aTask.title;
    if (title && title.length != 0) {
      handlerApp.name = title;
    }
    handlerApp.detailedDescription = aTask.description;
    handlerApp.appendParameter(aTask.args);

    const item = Cc["@mozilla.org/windows-jumplistshortcut;1"].createInstance(
      Ci.nsIJumpListShortcut
    );
    item.app = handlerApp;
    item.iconIndex = aTask.iconIndex;
    return item;
  },

  _createSeparatorItem() {
    return Cc["@mozilla.org/windows-jumplistseparator;1"].createInstance(
      Ci.nsIJumpListSeparator
    );
  },

  /**
   * Prefs utilities
   */

  _refreshPrefs() {
    this._enabled = lazy._prefs.getBoolPref(PREF_TASKBAR_ENABLED);
    this._showTasks = lazy._prefs.getBoolPref(PREF_TASKBAR_TASKS);
  },

  /**
   * Init and shutdown utilities
   */

  _initTaskbar() {
    this._builder = lazy._taskbarService.createJumpListBuilder(false);
    if (!this._builder || !this._builder.available) {
      return false;
    }

    return true;
  },

  _initObs() {
    Services.obs.addObserver(this, "profile-before-change");
    lazy._prefs.addObserver("", this);
  },

  _freeObs() {
    Services.obs.removeObserver(this, "profile-before-change");
    lazy._prefs.removeObserver("", this);
  },

  observe(aSubject, aTopic) {
    switch (aTopic) {
      case "nsPref:changed":
        if (this._enabled && !lazy._prefs.getBoolPref(PREF_TASKBAR_ENABLED)) {
          this._deleteActiveJumpList();
        }
        this._refreshPrefs();
        this.update();
        break;

      case "profile-before-change":
        this._shutdown();
        break;
    }
  },

  _free() {
    this._freeObs();
    delete this._builder;
  },
};
