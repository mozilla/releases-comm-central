/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This module handles migrating mail-specific preferences, etc. Migration has
 * traditionally been a part of messenger.js, but separating the code out into
 * a module makes unit testing much easier.
 */

const EXPORTED_SYMBOLS = ["MailMigrator", "MigrationTasks"];

const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  EventEmitter: "resource://gre/modules/EventEmitter.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
  migrateToolbarForSpace: "resource:///modules/ToolbarMigration.sys.mjs",
  clearXULToolbarState: "resource:///modules/ToolbarMigration.sys.mjs",
});

XPCOMUtils.defineLazyModuleGetters(lazy, {
  migrateMailnews: "resource:///modules/MailnewsMigrator.jsm",
});

var MailMigrator = {
  /**
   * Determine if the UI has been upgraded in a way that requires us to reset
   * some user configuration.  If so, performs the resets.
   */
  _migrateUI() {
    // The code for this was ported from
    // mozilla/browser/components/nsBrowserGlue.js
    const UI_VERSION = 41;
    const MESSENGER_DOCURL = "chrome://messenger/content/messenger.xhtml";
    const MESSENGERCOMPOSE_DOCURL =
      "chrome://messenger/content/messengercompose/messengercompose.xhtml";
    const UI_VERSION_PREF = "mail.ui-rdf.version";
    let currentUIVersion = Services.prefs.getIntPref(UI_VERSION_PREF, 0);

    if (currentUIVersion >= UI_VERSION) {
      return;
    }

    const xulStore = Services.xulStore;

    const newProfile = currentUIVersion == 0;
    if (newProfile) {
      // Collapse the main menu by default if the override pref
      // "mail.main_menu.collapse_by_default" is set to true.
      if (Services.prefs.getBoolPref("mail.main_menu.collapse_by_default")) {
        xulStore.setValue(
          MESSENGER_DOCURL,
          "toolbar-menubar",
          "autohide",
          "true"
        );
      }

      // Set to current version to skip all the migration below.
      currentUIVersion = UI_VERSION;
    }

    try {
      // Migrate mail.biff.use_new_count_in_mac_dock to
      // mail.biff.use_new_count_in_badge.
      if (currentUIVersion < 29) {
        if (
          Services.prefs.getBoolPref(
            "mail.biff.use_new_count_in_mac_dock",
            false
          )
        ) {
          Services.prefs.setBoolPref("mail.biff.use_new_count_in_badge", true);
          Services.prefs.clearUserPref("mail.biff.use_new_count_in_mac_dock");
        }
      }

      // Clear ui.systemUsesDarkTheme after bug 1736252.
      if (currentUIVersion < 30) {
        Services.prefs.clearUserPref("ui.systemUsesDarkTheme");
      }

      if (currentUIVersion < 32) {
        this._migrateIncomingToOAuth2("imap.gmail.com");
        this._migrateIncomingToOAuth2("pop.gmail.com");
        this._migrateSMTPToOAuth2("smtp.gmail.com");
      }

      if (currentUIVersion < 33) {
        // Put button-encryption and button-encryption-options on the
        // Composition Toolbar.
        // First, get value of currentset (string of comma-separated button ids).
        let cs = xulStore.getValue(
          MESSENGERCOMPOSE_DOCURL,
          "composeToolbar2",
          "currentset"
        );
        if (cs) {
          // Button ids from currentset string.
          const buttonIds = cs.split(",");

          // We want to insert the two buttons at index 2 and 3.
          buttonIds.splice(2, 0, "button-encryption");
          buttonIds.splice(3, 0, "button-encryption-options");

          cs = buttonIds.join(",");
          // Apply changes to currentset.
          xulStore.setValue(
            MESSENGERCOMPOSE_DOCURL,
            "composeToolbar2",
            "currentset",
            cs
          );
        }
      }

      if (currentUIVersion < 34) {
        // Migrate from
        // + mailnews.sendformat.auto_downgrade - Whether we should
        //   auto-downgrade to plain text when the message is plain.
        // + mail.default_html_action - The default sending format if we didn't
        //   auto-downgrade.
        // to mail.default_send_format
        const defaultHTMLAction = Services.prefs.getIntPref(
          "mail.default_html_action",
          3
        );
        Services.prefs.clearUserPref("mail.default_html_action");
        const autoDowngrade = Services.prefs.getBoolPref(
          "mailnews.sendformat.auto_downgrade",
          true
        );
        Services.prefs.clearUserPref("mailnews.sendformat.auto_downgrade");

        let sendFormat;
        switch (defaultHTMLAction) {
          case 0:
            // Was AskUser. Move to the new Auto default.
            sendFormat = Ci.nsIMsgCompSendFormat.Auto;
            break;
          case 1:
            // Was PlainText only. Keep as plain text. Note, autoDowngrade has
            // no effect on this option.
            sendFormat = Ci.nsIMsgCompSendFormat.PlainText;
            break;
          case 2:
            // Was HTML. Keep as HTML if autoDowngrade was false, otherwise use
            // the Auto default.
            sendFormat = autoDowngrade
              ? Ci.nsIMsgCompSendFormat.Auto
              : Ci.nsIMsgCompSendFormat.HTML;
            break;
          case 3:
            // Was Both. If autoDowngrade was true, this is the same as the
            // new Auto default. Otherwise, keep as Both.
            sendFormat = autoDowngrade
              ? Ci.nsIMsgCompSendFormat.Auto
              : Ci.nsIMsgCompSendFormat.Both;
            break;
          default:
            sendFormat = Ci.nsIMsgCompSendFormat.Auto;
            break;
        }
        Services.prefs.setIntPref("mail.default_send_format", sendFormat);
      }

      if (currentUIVersion < 35) {
        // Both IMAP and POP settings currently use this domain
        this._migrateIncomingToOAuth2("outlook.office365.com");
        this._migrateSMTPToOAuth2("smtp.office365.com");
      }

      if (currentUIVersion < 36) {
        lazy.migrateToolbarForSpace("mail");
      }

      if (currentUIVersion < 37) {
        if (!Services.prefs.prefHasUserValue("mail.uidensity")) {
          Services.prefs.setIntPref("mail.uidensity", 0);
        }
      }

      if (currentUIVersion < 38) {
        lazy.migrateToolbarForSpace("calendar");
        lazy.migrateToolbarForSpace("tasks");
        lazy.migrateToolbarForSpace("chat");
        lazy.migrateToolbarForSpace("settings");
        lazy.migrateToolbarForSpace("addressbook");
        // Clear menubar and tabbar XUL toolbar state.
        lazy.clearXULToolbarState("tabbar-toolbar");
        lazy.clearXULToolbarState("toolbar-menubar");
      }

      if (currentUIVersion < 39) {
        // Set old defaults for message header customization in existing
        // profiles without any customization settings.
        if (
          !Services.xulStore.hasValue(
            "chrome://messenger/content/messenger.xhtml",
            "messageHeader",
            "layout"
          )
        ) {
          Services.xulStore.setValue(
            "chrome://messenger/content/messenger.xhtml",
            "messageHeader",
            "layout",
            JSON.stringify({
              showAvatar: false,
              showBigAvatar: false,
              showFullAddress: false,
              hideLabels: false,
              subjectLarge: false,
              buttonStyle: "default",
            })
          );
        }
      }

      if (currentUIVersion < 40) {
        // Keep the view to table for existing profiles if the user never
        // customized the thread pane view.
        if (
          !Services.xulStore.hasValue(
            "chrome://messenger/content/messenger.xhtml",
            "threadPane",
            "view"
          )
        ) {
          Services.xulStore.setValue(
            "chrome://messenger/content/messenger.xhtml",
            "threadPane",
            "view",
            "table"
          );
        }

        // Maintain the default horizontal layout for existing profiles if the
        // user never changed it.
        if (!Services.prefs.prefHasUserValue("mail.pane_config.dynamic")) {
          Services.prefs.setIntPref("mail.pane_config.dynamic", 0);
        }
      }

      if (currentUIVersion < 41) {
        // Maintain the default ascending order for existing profiles if the
        // user never changed it.
        if (!Services.prefs.prefHasUserValue("mailnews.default_sort_order")) {
          Services.prefs.setIntPref("mailnews.default_sort_order", 1);
        }
        if (
          !Services.prefs.prefHasUserValue("mailnews.default_news_sort_order")
        ) {
          Services.prefs.setIntPref("mailnews.default_news_sort_order", 1);
        }
      }

      // Migration tasks that may take a long time are not run immediately, but
      // added to the MigrationTasks object then run at the end.
      //
      // See the documentation on MigrationTask and MigrationTasks for how to
      // add a task.
      MigrationTasks.runTasks();

      // Update the migration version.
      Services.prefs.setIntPref(UI_VERSION_PREF, UI_VERSION);
    } catch (e) {
      console.error(
        "Migrating from UI version " +
          currentUIVersion +
          " to " +
          UI_VERSION +
          " failed. Error message was: " +
          e +
          " -- " +
          "Will reattempt on next start."
      );
    }
  },

  /**
   * Migrate incoming server to using OAuth2 as authMethod.
   *
   * @param {string} hostnameHint - What the hostname should end with.
   */
  _migrateIncomingToOAuth2(hostnameHint) {
    for (const account of MailServices.accounts.accounts) {
      // Skip if not a matching account.
      if (!account.incomingServer.hostName.endsWith(hostnameHint)) {
        continue;
      }

      // Change Incoming server to OAuth2.
      account.incomingServer.authMethod = Ci.nsMsgAuthMethod.OAuth2;
    }
  },

  /**
   * Migrate outgoing server to using OAuth2 as authMethod.
   *
   * @param {string} hostnameHint - What the hostname should end with.
   */
  _migrateSMTPToOAuth2(hostnameHint) {
    for (const server of MailServices.smtp.servers) {
      // Skip if not a matching server.
      if (!server.hostname.endsWith(hostnameHint)) {
        continue;
      }

      // Change Outgoing SMTP server to OAuth2.
      server.authMethod = Ci.nsMsgAuthMethod.OAuth2;
    }
  },

  /**
   * Perform any migration work that needs to occur once the user profile has
   * been loaded.
   */
  migrateAtProfileStartup() {
    lazy.migrateMailnews();
    this._migrateUI();
  },
};

/**
 * Controls migration tasks, including (if the migration is taking a while)
 * presenting the user with a pop-up window showing the current status.
 */
var MigrationTasks = {
  _finished: false,
  _progressWindow: null,
  _start: null,
  _tasks: [],
  _waitThreshold: 1000,

  /**
   * Adds a simple task to be completed.
   *
   * @param {string} [fluentID] - The name of this task. If specified, a string
   *   for this name MUST be in migration.ftl. If not specified, this task
   *   won't appear in the list of migration tasks.
   * @param {Function} action
   */
  addSimpleTask(fluentID, action) {
    this._tasks.push(new MigrationTask(fluentID, action));
  },

  /**
   * Adds a task to be completed. Subclasses of MigrationTask are allowed,
   * allowing more complex tasks than `addSimpleTask`.
   *
   * @param {MigrationTask} task
   */
  addComplexTask(task) {
    if (!(task instanceof MigrationTask)) {
      throw new Error("Task is not a MigrationTask");
    }
    this._tasks.push(task);
  },

  /**
   * Runs the tasks in sequence.
   */
  async _runTasksInternal() {
    this._start = Date.now();

    // Do not optimise this for-loop. More tasks could be added.
    for (let t = 0; t < this._tasks.length; t++) {
      const task = this._tasks[t];
      task.status = "running";

      await task.action();

      for (let i = 0; i < task.subTasks.length; i++) {
        task.emit("progress", i, task.subTasks.length);
        const subTask = task.subTasks[i];
        subTask.status = "running";

        await subTask.action();
        subTask.status = "finished";
      }
      if (task.subTasks.length) {
        task.emit("progress", task.subTasks.length, task.subTasks.length);
        // Pause long enough for the user to see the progress bar at 100%.
        await new Promise(resolve => lazy.setTimeout(resolve, 150));
      }

      task.status = "finished";
    }

    this._tasks.length = 0;
    this._finished = true;
  },

  /**
   * Runs the migration tasks. Controls the opening and closing of the pop-up.
   */
  runTasks() {
    this._runTasksInternal();

    Services.tm.spinEventLoopUntil("MigrationTasks", () => {
      if (this._finished) {
        return true;
      }

      if (
        !this._progressWindow &&
        Date.now() - this._start > this._waitThreshold
      ) {
        this._progressWindow = Services.ww.openWindow(
          null,
          "chrome://messenger/content/migrationProgress.xhtml",
          "_blank",
          "centerscreen,width=640",
          Services.ww
        );
        this.addSimpleTask(undefined, async () => {
          await new Promise(r => lazy.setTimeout(r, 1000));
          this._progressWindow.close();
        });
      }

      return false;
    });

    delete this._progressWindow;
  },

  /**
   * @type MigrationTask[]
   */
  get tasks() {
    return this._tasks;
  },
};

/**
 * A single task to be completed.
 */
class MigrationTask {
  /**
   * The name of this task. If specified, a string for this name MUST be in
   * migration.ftl. If not specified, this task won't appear in the list of
   * migration tasks.
   *
   * @type string
   */
  fluentID = null;

  /**
   * Smaller tasks for this task. If there are sub-tasks, a progress bar will
   * be displayed to the user, showing how many sub-tasks are complete.
   *
   * @note A sub-task may not have sub-sub-tasks.
   *
   * @type MigrationTask[]
   */
  subTasks = [];

  /**
   * Current status of the task. Either "pending", "running" or "finished".
   *
   * @type string
   */
  _status = "pending";

  /**
   * @param {string} [fluentID]
   * @param {Function} action
   */
  constructor(fluentID, action) {
    this.fluentID = fluentID;
    this.action = action;
    lazy.EventEmitter.decorate(this);
  }

  /**
   * Current status of the task. Either "pending", "running" or "finished".
   * Emits a "status-change" notification on change.
   *
   * @type string
   */
  get status() {
    return this._status;
  }

  set status(value) {
    this._status = value;
    this.emit("status-change", value);
  }
}
