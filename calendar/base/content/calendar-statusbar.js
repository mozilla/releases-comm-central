/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

/* exported gCalendarStatusFeedback */

/**
 * This code might change soon if we support Thunderbird's activity manager.
 * NOTE: The naming "Meteors" is historical.
 */
var gCalendarStatusFeedback = {
    mCalendarStep: 0,
    mCalendarCount: 0,
    mWindow: null,
    mStatusText: null,
    mStatusBar: null,
    mStatusProgressPanel: null,
    mThrobber: null,
    mProgressMode: Components.interfaces.calIStatusObserver.NO_PROGRESS,
    mCurIndex: 0,
    mInitialized: false,
    mCalendars: {},

    QueryInterface: XPCOMUtils.generateQI([Components.interfaces.calIStatusObserver]),

    initialize: function(aWindow) {
        if (!this.mInitialized) {
            this.mWindow = aWindow;
            this.mStatusText = this.mWindow.document.getElementById("statusText");
            this.mStatusBar = this.mWindow.document.getElementById("statusbar-icon");
            this.mStatusProgressPanel = this.mWindow.document.getElementById("statusbar-progresspanel");
            this.mThrobber = this.mWindow.document.getElementById("navigator-throbber");
            this.mInitialized = true;
        }
    },

    showStatusString: function(status) {
        this.mStatusText.setAttribute("label", status);
    },

    get spinning() {
        return this.mProgressMode;
    },

    startMeteors: function(aProgressMode, aCalendarCount) {
        if (aProgressMode != Components.interfaces.calIStatusObserver.NO_PROGRESS) {
            if (!this.mInitialized) {
                Components.utils.reportError("StatusObserver has not been initialized!");
                return;
            }
            this.mCalendars = {};
            this.mCurIndex = 0;
            if (aCalendarCount) {
                this.mCalendarCount = this.mCalendarCount + aCalendarCount;
                this.mCalendarStep = Math.trunc(100 / this.mCalendarCount);
            }
            this.mProgressMode = aProgressMode;
            this.mStatusProgressPanel.removeAttribute("collapsed");
            if (this.mProgressMode == Components.interfaces.calIStatusObserver.DETERMINED_PROGRESS) {
                this.mStatusBar.removeAttribute("collapsed");
                this.mStatusBar.setAttribute("mode", "determined");
                this.mStatusBar.value = 0;
                let commonStatus = calGetString("calendar", "gettingCalendarInfoCommon");
                this.showStatusString(commonStatus);
            }
            if (this.mThrobber) {
                this.mThrobber.setAttribute("busy", true);
            }
        }
    },

    stopMeteors: function() {
        if (!this.mInitialized) {
            return;
        }
        if (this.spinning != Components.interfaces.calIStatusObserver.NO_PROGRESS) {
            this.mProgressMode = Components.interfaces.calIStatusObserver.NO_PROGRESS;
            this.mStatusProgressPanel.collapsed = true;
            this.mStatusBar.setAttribute("mode", "normal");
            this.mStatusBar.value = 0;
            this.mCalendarCount = 0;
            this.showStatusString("");
            if (this.mThrobber) {
                this.mThrobber.setAttribute("busy", false);
            }
        }
    },

    calendarCompleted: function(aCalendar) {
        if (!this.mInitialized) {
            return;
        }
        if (this.spinning != Components.interfaces.calIStatusObserver.NO_PROGRESS) {
            if (this.spinning == Components.interfaces.calIStatusObserver.DETERMINED_PROGRESS) {
                if (!this.mCalendars[aCalendar.id] || this.mCalendars[aCalendar.id] === undefined) {
                    this.mCalendars[aCalendar.id] = true;
                    this.mStatusBar.value = parseInt(this.mStatusBar.value, 10) + this.mCalendarStep;
                    this.mCurIndex++;
                    let curStatus = calGetString("calendar", "gettingCalendarInfoDetail",
                                                 [this.mCurIndex, this.mCalendarCount]);
                    this.showStatusString(curStatus);
                }
            }
            if (this.mThrobber) {
                this.mThrobber.setAttribute("busy", true);
            }
        }
    }
};
