/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["CalSleepMonitor"];

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

function CalSleepMonitor() {
  this.wrappedJSObject = this;
}

CalSleepMonitor.prototype = {
  QueryInterface: ChromeUtils.generateQI([Ci.nsIObserver]),
  classID: Components.ID("9b987a8d-c2ef-4cb9-9602-1261b4b2f6fa"),

  interval: 60000,
  timer: null,
  expected: null,
  tolerance: 1000,

  callback() {
    let now = Date.now();
    if (now - this.expected > this.tolerance) {
      cal.LOG("[CalSleepMonitor] Sleep cycle detected, notifying observers.");
      Services.obs.notifyObservers(null, "wake_notification");
    }
    this.expected = now + this.interval;
  },
  start() {
    this.stop();
    this.expected = Date.now() + this.interval;
    this.timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    this.timer.initWithCallback(
      this.callback.bind(this),
      this.interval,
      Ci.nsITimer.TYPE_REPEATING_PRECISE
    );
  },
  stop() {
    if (this.timer) {
      this.timer.cancel();
      this.timer = null;
    }
  },

  // nsIObserver:
  observe(aSubject, aTopic, aData) {
    // CalSleepMonitor is not used on Windows or OSX.
    if (Services.appinfo.OS == "WINNT" || Services.appinfo.OS == "Darwin") {
      return;
    }

    if (aTopic == "profile-after-change") {
      cal.LOG("[CalSleepMonitor] Starting sleep monitor.");
      this.start();

      Services.obs.addObserver(this, "quit-application");
    } else if (aTopic == "quit-application") {
      cal.LOG("[CalSleepMonitor] Stopping sleep monitor.");
      this.stop();
    }
  },
};
