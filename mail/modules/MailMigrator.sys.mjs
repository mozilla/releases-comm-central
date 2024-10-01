/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This module handles migrating mail-specific preferences, etc. Migration has
 * traditionally been a part of messenger.js, but separating the code out into
 * a module makes unit testing much easier.
 */

import { MailServices } from "resource:///modules/MailServices.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  EventEmitter: "resource://gre/modules/EventEmitter.sys.mjs",
  clearXULToolbarState: "resource:///modules/ToolbarMigration.sys.mjs",
  MailUtils: "resource:///modules/MailUtils.sys.mjs",
  migrateToolbarForSpace: "resource:///modules/ToolbarMigration.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
});

export var MailMigrator = {
  /**
   * Determine if the UI has been upgraded in a way that requires us to reset
   * some user configuration.  If so, performs the resets.
   */
  _migrateUI() {
    // The code for this was ported from
    // mozilla/browser/components/nsBrowserGlue.js
    const UI_VERSION = 45;
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
   * Scan through a profile, removing 'nstmp' / 'nstmp-N'
   * files left over from failed folder compactions.
   * See Bug 1878541.
   */
  async _nstmpCleanup() {
    // Latch to ensure this only ever runs once.
    if (Services.prefs.getBoolPref("mail.nstmp_cleanup_completed", false)) {
      return;
    }

    const logger = console.createInstance({
      prefix: "nstmp cleanup",
      maxLogLevel: "Log",
    });
    logger.log("Looking for left-over nstmp files to remove...");

    // Go through all known folders, building up a list of the directories
    // and all the potential mbox files in those directories.
    // Each entry is a set of the potential mbox filenames in the dir.
    const dirs = {};
    for (const s of MailServices.accounts.allServers) {
      if (s.msgStore.storeType != "mbox") {
        continue;
      }
      // Don't process the root folder here (it shouldn't have an mbox).
      for (const child of s.rootFolder.descendants) {
        const mbox = child.filePath.path;
        const d = PathUtils.parent(mbox);
        if (!Object.hasOwn(dirs, d)) {
          dirs[d] = new Set();
        }
        // We'll be doing case-insensitive compares.
        dirs[d].add(PathUtils.filename(mbox).toLowerCase());
      }
    }

    // For each directory, find nstmp files, excluding names of known folders.
    const doomed = [];
    for (const [dir, mboxes] of Object.entries(dirs)) {
      const files = await IOUtils.getChildren(dir, { ignoreAbsent: true });
      for (const file of files) {
        // Skip anything that isn't a regular file.
        const info = await IOUtils.stat(file);
        if (info.type != "regular") {
          continue;
        }

        // Looks like an nstmp file? (as created by createUnique()).
        const bare = PathUtils.filename(file);
        if (/^nstmp(-[0-9]{1,4})?$/.test(bare)) {
          // Make sure it doesn't match any of the potential mbox files (case
          // insensitive).
          if (mboxes.has(bare.toLowerCase())) {
            continue;
          }
          doomed.push(file);
        }
      }
    }

    if (doomed.length > 0) {
      logger.log("Found left-over nstmp files to remove:", doomed);
    }
    for (const f of doomed) {
      await IOUtils.remove(f);
    }

    Services.prefs.setBoolPref("mail.nstmp_cleanup_completed", true);
    logger.log(`nstmp cleanup completed: ${doomed.length} files removed.`);
  },

  /**
   * Perform any migration work that needs to occur once the user profile has
   * been loaded.
   */
  migrateAtProfileStartup() {
    this._migrateUI();
  },

  /**
   * Perform any migration work that needs to occur once everything is up and
   * running.
   */
  async migrateAfterStartupComplete() {
    await this._nstmpCleanup();
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
