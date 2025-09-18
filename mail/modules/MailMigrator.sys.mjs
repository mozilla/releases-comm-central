/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This module handles migrating mail-specific preferences, etc. Migration has
 * traditionally been a part of messenger.js, but separating the code out into
 * a module makes unit testing much easier.
 */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";
import { MailServices } from "resource:///modules/MailServices.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  EventEmitter: "resource://gre/modules/EventEmitter.sys.mjs",
  clearXULToolbarState: "resource:///modules/ToolbarMigration.sys.mjs",
  MailUtils: "resource:///modules/MailUtils.sys.mjs",
  migrateToolbarForSpace: "resource:///modules/ToolbarMigration.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
  SearchIntegration: "resource:///modules/SearchIntegration.sys.mjs",
});

export var MailMigrator = {
  /**
   * Determine if the UI has been upgraded in a way that requires us to reset
   * some user configuration.  If so, performs the resets.
   */
  _migrateUI() {
    // The code for this was ported from
    // mozilla/browser/components/nsBrowserGlue.js
    const UI_VERSION = 54;
    const UI_VERSION_PREF = "mail.ui-rdf.version";
    let currentUIVersion = Services.prefs.getIntPref(UI_VERSION_PREF, 0);

    if (currentUIVersion >= UI_VERSION) {
      return;
    }

    const newProfile = currentUIVersion == 0;
    if (newProfile) {
      // Set to current version to skip all the migration below.
      currentUIVersion = UI_VERSION;
    }

    try {
      if (currentUIVersion < 35) {
        // Both IMAP and POP settings currently use this domain
        this._migrateIncomingToOAuth2("outlook.office365.com");
        this._migrateOutgoingServerToOAuth2("smtp.office365.com");
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

      if (currentUIVersion < 42) {
        // Update the display name version pref so we force clear the cache of
        // sender names.
        Services.prefs.setIntPref(
          "mail.displayname.version",
          Services.prefs.getIntPref("mail.displayname.version", 0) + 1
        );
      }

      if (currentUIVersion < 43) {
        // Set the `type` property of existing SMTP servers.
        const serverKeys = Services.prefs
          .getCharPref("mail.smtpservers", "")
          .split(",")
          .filter(Boolean);

        serverKeys.forEach(key => {
          Services.prefs.setCharPref(`mail.smtpserver.${key}.type`, "smtp");
        });
      }

      if (currentUIVersion < 44) {
        // Upgrade all (former) tryStartTLS (==1) uses to alwaysStartTLS.
        for (const account of MailServices.accounts.accounts) {
          const server = account.incomingServer;
          if (server.socketType == 1) {
            server.socketType = Ci.nsMsgSocketType.alwaysSTARTTLS;
          }
        }
        for (const server of MailServices.outgoingServer.servers) {
          if (server.socketType == 1) {
            server.socketType = Ci.nsMsgSocketType.alwaysSTARTTLS;
          }
        }
      }

      if (currentUIVersion < 45) {
        // Fix bad hostName for feeds in anchient profiles.
        // Newer profiles use a valid hostname which is Feeds, Feeds-2 etc.
        // This migration is a bit of a hack and for proper functionality
        // of these feeds, a restart will be required...
        let i = 2;
        const migrations = [];
        for (const server of MailServices.accounts.accounts
          .map(a => a.incomingServer)
          .filter(s => s.type == "rss" && !s.hostName.startsWith("Feeds"))) {
          server.QueryInterface(Ci.nsIRssIncomingServer);
          const path = server.subscriptionsPath.path;
          const migrateJSON = async () => {
            const feeds = await IOUtils.readJSON(path);
            let hostname = "Feeds"; // What the corrected hostname will be.
            while (
              MailServices.accounts.findServer("nobody", hostname, "rss")
            ) {
              // If "Feeds" exists, try "Feeds-2", then "Feeds-3", etc.
              hostname = "Feeds-" + i++;
            }
            for (const feed of feeds) {
              // Values are like "mailbox://nobody@RSS-News & Weblogs/comm-central%20Changelog"
              feed.destFolder = feed.destFolder.replace(
                /mailbox:\/\/([^@])+[^\/]+/,
                `mailbox://nobody@${hostname}`
              );
            }
            await IOUtils.writeJSON(path, feeds);
            server.hostName = hostname;
          };
          migrations.push(migrateJSON());
        }
        if (migrations.length) {
          // Restart after migrations, as the UI can't really handle this.
          Promise.all(migrations).then(() => {
            lazy.MailUtils.restartApplication();
          });
        }
      }

      if (currentUIVersion < 46) {
        // Clean out an old default value that got stuck in a lot of profiles.
        try {
          // This will throw if no value is set since the pref doesn't exist any more.
          if (Services.prefs.getIntPref("mail.purge_threshhold_mb") == 20) {
            Services.prefs.clearUserPref("mail.purge_threshhold_mb");
          }
        } catch (ex) {}
      }

      if (currentUIVersion < 47) {
        // Use value in mail.purge_threshhold_mb/mail.prompt_purge_threshhold if any.
        try {
          const old = Services.prefs.getIntPref("mail.purge_threshhold_mb");
          Services.prefs.setIntPref("mail.purge_threshold_mb", old);
          Services.prefs.clearUserPref("mail.purge_threshhold_mb");
        } catch (ex) {}
        try {
          const old = Services.prefs.getBoolPref(
            "mail.prompt_purge_threshhold"
          );
          Services.prefs.setBoolPref("mail.prompt_purge_threshold", old);
          Services.prefs.clearUserPref("mail.prompt_purge_threshhold");
        } catch (ex) {}

        // This is the first migration of ESR 140. If we're here and there's
        // no value for this attribute, set the value of the attribute to
        // match the default behaviour in ESR 128.
        if (
          AppConstants.platform != "macosx" &&
          !Services.xulStore.hasValue(
            "chrome://messenger/content/messenger.xhtml",
            "toolbar-menubar",
            "autohide"
          )
        ) {
          Services.xulStore.setValue(
            "chrome://messenger/content/messenger.xhtml",
            "toolbar-menubar",
            "autohide",
            "false"
          );
        }
      }

      if (currentUIVersion < 48) {
        // Reflect the actual state of the search integration in the platform
        // independent pref.
        Services.prefs.setBoolPref(
          "searchintegration.enable",
          lazy.SearchIntegration?.prefEnabled ?? false
        );
      }

      if (currentUIVersion < 49) {
        // Migrate xulStore UI settings to actual prefs if we have them.
        const docURL = "chrome://messenger/content/messenger.xhtml";
        if (Services.xulStore.hasValue(docURL, "threadPane", "view")) {
          const view = Services.xulStore.getValue(docURL, "threadPane", "view");
          Services.prefs.setIntPref(
            "mail.threadpane.listview",
            view == "table" ? 1 : 0
          );
          Services.xulStore.removeValue(docURL, "threadPane", "view");
        }
      }

      if (currentUIVersion < 50) {
        // Previous UI let users set this. Non-default value interacts badly
        // with current dark mode.
        Services.prefs.clearUserPref("browser.display.document_color_use");
      }

      if (currentUIVersion < 51) {
        // Bug 1968963: Re-run migration 48 and 49 because they were skipped on
        // release due to the uplifting of the patch containing migration 50.
        Services.prefs.setBoolPref(
          "searchintegration.enable",
          lazy.SearchIntegration?.prefEnabled ?? false
        );

        const docURL = "chrome://messenger/content/messenger.xhtml";
        if (Services.xulStore.hasValue(docURL, "threadPane", "view")) {
          const view = Services.xulStore.getValue(docURL, "threadPane", "view");
          Services.prefs.setIntPref(
            "mail.threadpane.listview",
            view == "table" ? 1 : 0
          );
          Services.xulStore.removeValue(docURL, "threadPane", "view");
        }
      }

      if (currentUIVersion < 52) {
        // Preset the user sort order of all NNTP folders in a way so that they
        // keep their existing order.
        MailServices.accounts.accounts
          .filter(a => a.incomingServer.type == "nntp")
          .forEach(a => {
            const folders = MailServices.folderLookup.getFolderForURL(
              a.incomingServer.serverURI
            ).subFolders;
            for (let i = 0; i < folders.length; i++) {
              folders[i].userSortOrder = i + 1;
            }
          });
      }

      if (currentUIVersion < 53) {
        function removeStaleValue(url, id) {
          if (Services.xulStore.hasValue(url, id, "hidden")) {
            if (Services.xulStore.getValue(url, id, "hidden") == "false") {
              Services.xulStore.removeValue(url, id, "hidden");
            }
          }
        }

        for (const elementID of [
          "bottom-events-box",
          "calendar-view-splitter",
          "status-bar",
        ]) {
          removeStaleValue(
            "chrome://messenger/content/messenger.xhtml",
            elementID
          );
        }

        for (const elementID of ["FormatToolbar", "status-bar"]) {
          removeStaleValue(
            "chrome://messenger/content/messengercompose/messengercompose.xhtml",
            elementID
          );
        }
      }

      if (currentUIVersion < 54) {
        if (
          Services.xulStore.getValue(
            "chrome://messenger/content/messenger.xhtml",
            "toolbar-menubar",
            "autohide"
          ) == "false"
        ) {
          Services.xulStore.setValue(
            "chrome://messenger/content/messenger.xhtml",
            "toolbar-menubar",
            "autohide",
            "-moz-missing\n"
          );
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
  _migrateOutgoingServerToOAuth2(hostnameHint) {
    for (const server of MailServices.outgoingServer.servers) {
      // Skip if not a matching server.
      if (!server.serverURI.host.endsWith(hostnameHint)) {
        continue;
      }

      // Change outgoing server to OAuth2.
      server.authMethod = Ci.nsMsgAuthMethod.OAuth2;
    }
  },

  /**
   * Perform any migration work that needs to occur once the user profile has
   * been loaded.
   */
  migrateAtProfileStartup() {
    this._migrateUI();
  },
};

/**
 * Controls migration tasks, including (if the migration is taking a while)
 * presenting the user with a pop-up window showing the current status.
 */
export var MigrationTasks = {
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
   * @type {MigrationTask[]}
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
   * @type {string}
   */
  fluentID = null;

  /**
   * Smaller tasks for this task. If there are sub-tasks, a progress bar will
   * be displayed to the user, showing how many sub-tasks are complete.
   *
   * Note: A sub-task may not have sub-sub-tasks.
   *
   * @type {MigrationTask[]}
   */
  subTasks = [];

  /**
   * Current status of the task. Either "pending", "running" or "finished".
   *
   * @type {string}
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
   * @type {string}
   */
  get status() {
    return this._status;
  }

  set status(value) {
    this._status = value;
    this.emit("status-change", value);
  }
}
