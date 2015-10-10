/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://calendar/modules/calUtils.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

var calSleepMonitorClassID = Components.ID("9b987a8d-c2ef-4cb9-9602-1261b4b2f6fa");
var calSleepMonitorInterfaces = [Components.interfaces.nsIObserver];

function calSleepMonitor() {
}

calSleepMonitor.prototype = {
    classID: calSleepMonitorClassID,
    QueryInterface: XPCOMUtils.generateQI(calSleepMonitorInterfaces),
    classInfo: XPCOMUtils.generateCI({
        classID: calSleepMonitorClassID,
        contractID: "@mozilla.org/calendar/sleep-monitor;1",
        classDescription: "Calendar Sleep Monitor",
        interfaces: calSleepMonitorInterfaces,
        flags: Components.interfaces.nsIClassInfo.SINGLETON
    }),

    interval: 60000,
    timer: null,
    expected: null,
    tolerance: 1000,

    callback: function() {
        let now = Date.now();
        if (now - this.expected > this.tolerance) {
            cal.LOG("[calSleepMonitor] Sleep cycle detected, notifying observers.");
            Services.obs.notifyObservers(null, "wake_notification", null);
        }
        this.expected = now + this.interval;
    },
    start: function() {
        this.stop();
        this.expected = Date.now() + this.interval;
        this.timer = Components.classes["@mozilla.org/timer;1"].createInstance(Components.interfaces.nsITimer);
        this.timer.initWithCallback(this.callback.bind(this), this.interval, Components.interfaces.nsITimer.TYPE_REPEATING_PRECISE);
    },
    stop: function() {
        if (this.timer) {
            this.timer.cancel();
            this.timer = null;
        }
    },

    // nsIObserver:
    observe: function observe(aSubject, aTopic, aData) {
        // calSleepMonitor is not used on Windows or OSX.
        if (Services.appinfo.OS == "WINNT" || Services.appinfo.OS == "Darwin") {
            return;
        }

        if (aTopic == "profile-after-change") {
            cal.LOG("[calSleepMonitor] Starting sleep monitor.");
            this.start();

            Services.obs.addObserver(this, "quit-application", false);
        } else if (aTopic == "quit-application") {
            cal.LOG("[calSleepMonitor] Stopping sleep monitor.");
            this.stop();
        }
    }
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([calSleepMonitor]);
