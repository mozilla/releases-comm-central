/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Execute periodic filters at the correct rate.
 *
 * The only external call required for this is setupFiltering(). This should be
 * called before the mail-startup-done notification.
 */

const EXPORTED_SYMBOLS = ["PeriodicFilterManager"];

const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

const log = console.createInstance({
  prefix: "mail.periodicfilters",
  maxLogLevel: "Warn",
  maxLogLevelPref: "mail.periodicfilters.loglevel",
});

var PeriodicFilterManager = {
  _timer: null,
  _checkRateMilliseconds: 60000, // How often do we check if servers are ready to run?
  _defaultFilterRateMinutes: Services.prefs
    .getDefaultBranch("")
    .getIntPref("mail.server.default.periodicFilterRateMinutes"),
  _initialized: false, // Has this been initialized?
  _running: false, // Are we executing filters already?

  // Initial call to begin startup.
  setupFiltering() {
    if (this._initialized) {
      return;
    }

    this._initialized = true;
    Services.obs.addObserver(this, "mail-startup-done");
  },

  // Main call to start the periodic filter process
  init() {
    log.info("PeriodicFilterManager init()");
    // set the next filter time
    for (const server of MailServices.accounts.allServers) {
      const nowTime = parseInt(Date.now() / 60000);
      // Make sure that the last filter time of all servers was in the past.
      const lastFilterTime = server.getIntValue("lastFilterTime");
      // Schedule next filter run.
      const nextFilterTime =
        lastFilterTime < nowTime
          ? lastFilterTime + this.getServerPeriod(server)
          : nowTime;
      server.setIntValue("nextFilterTime", nextFilterTime);
    }

    // kickoff the timer to run periodic filters
    this._timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    this._timer.initWithCallback(
      this,
      this._checkRateMilliseconds,
      Ci.nsITimer.TYPE_REPEATING_SLACK
    );
    Services.obs.addObserver(this, "quit-application-granted");
  },

  /**
   * Periodic callback to check if any periodic filters need to be run.
   *
   * The periodic filter manager does not guarantee that filters will be run
   * precisely at the specified interval.
   * The server may be busy (e.g. downloading messages) or another filter run
   * is still ongoing, in which cases running periodic filter of any server
   * may be postponed.
   */
  notify(timer) {
    log.debug("PeriodicFilterManager timer callback");
    if (this._running) {
      log.debug("PeriodicFilterManager Previous filter run still executing");
      return;
    }
    this._running = true;
    const nowTime = parseInt(Date.now() / 60000);
    for (const server of MailServices.accounts.allServers) {
      if (!server.canHaveFilters) {
        continue;
      }
      if (server.getIntValue("nextFilterTime") > nowTime) {
        continue;
      }
      if (server.serverBusy) {
        continue;
      }

      // Schedule next time this account's filters should be run.
      server.setIntValue(
        "nextFilterTime",
        nowTime + this.getServerPeriod(server)
      );
      server.setIntValue("lastFilterTime", nowTime);

      // Build a temporary list of periodic filters.
      // XXX TODO: make applyFiltersToFolders() take a filterType instead (bug 1551043).
      const curFilterList = server.getFilterList(null);
      const tempFilterList = MailServices.filters.getTempFilterList(
        server.rootFolder
      );
      const numFilters = curFilterList.filterCount;
      tempFilterList.loggingEnabled = curFilterList.loggingEnabled;
      tempFilterList.logStream = curFilterList.logStream;
      let newFilterIndex = 0;
      for (let i = 0; i < numFilters; i++) {
        const curFilter = curFilterList.getFilterAt(i);
        // Only add enabled, UI visible filters that are of the Periodic type.
        if (
          curFilter.enabled &&
          !curFilter.temporary &&
          curFilter.filterType & Ci.nsMsgFilterType.Periodic
        ) {
          tempFilterList.insertFilterAt(newFilterIndex, curFilter);
          newFilterIndex++;
        }
      }
      if (newFilterIndex == 0) {
        continue;
      }
      const foldersToFilter = server.rootFolder.getFoldersWithFlags(
        Ci.nsMsgFolderFlags.Inbox
      );
      if (foldersToFilter.length == 0) {
        continue;
      }

      log.debug(
        "PeriodicFilterManager apply periodic filters to server " +
          server.prettyName
      );
      MailServices.filters.applyFiltersToFolders(
        tempFilterList,
        foldersToFilter,
        null
      );
    }
    this._running = false;
  },

  /**
   * Gets the periodic filter interval for the given server.
   * If the server's interval is not sane, clean it up.
   *
   * @param {nsIMsgIncomingServer} server - The server to return interval for.
   */
  getServerPeriod(server) {
    const minimumPeriodMinutes = 1;
    const serverRateMinutes = server.getIntValue("periodicFilterRateMinutes");
    // Check if period is too short.
    if (serverRateMinutes < minimumPeriodMinutes) {
      // If the server.default pref is too low, clear that one first.
      if (
        Services.prefs.getIntPref(
          "mail.server.default.periodicFilterRateMinutes"
        ) == serverRateMinutes
      ) {
        Services.prefs.clearUserPref(
          "mail.server.default.periodicFilterRateMinutes"
        );
      }
      // If the server still has its own specific value and it is still too low, sanitize it.
      if (
        server.getIntValue("periodicFilterRateMinutes") < minimumPeriodMinutes
      ) {
        server.setIntValue(
          "periodicFilterRateMinutes",
          this._defaultFilterRateMinutes
        );
      }

      return this._defaultFilterRateMinutes;
    }

    return serverRateMinutes;
  },

  observe(subject, topic, data) {
    Services.obs.removeObserver(this, topic);
    if (topic == "mail-startup-done") {
      this.init();
    } else if (topic == "quit-application-granted") {
      this.shutdown();
    }
  },

  shutdown() {
    log.info("PeriodicFilterManager shutdown");
    if (this._timer) {
      this._timer.cancel();
      this._timer = null;
    }
  },
};
