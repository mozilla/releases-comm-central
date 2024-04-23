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

ChromeUtils.defineLazyGetter(lazy, "_selfPath", function () {
  return Services.dirsvc.get("XREExeF", Ci.nsIFile).path;
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

  async startup() {
    // exit if this isn't win7 or higher.
    if (!(await this._initTaskbar())) {
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

  async _buildList() {
    // anything to build?
    if (!this._showTasks) {
      // don't leave the last list hanging on the taskbar.
      await this._deleteActiveJumpList();
      return;
    }

    if (this._showTasks) {
      const taskDescriptions = this._tasks.map(task => {
        return {
          title: task.title,
          description: task.description,
          path: lazy._selfPath,
          arguments: task.args,
          fallbackIconIndex: task.iconIndex,
        };
      });
      await this._builder.populateJumpList(taskDescriptions, "", []);
    }
  },

  /**
   * Taskbar api wrappers
   */

  _deleteActiveJumpList() {
    return this._builder.clearJumpList();
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

  async _initTaskbar() {
    this._builder = lazy._taskbarService.createJumpListBuilder(false);
    if (!this._builder || !(await this._builder.isAvailable())) {
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
