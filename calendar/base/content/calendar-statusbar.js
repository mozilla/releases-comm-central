/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

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
  mProgressMode: Ci.calIStatusObserver.NO_PROGRESS,
  mCurIndex: 0,
  mInitialized: false,
  mCalendars: {},

  QueryInterface: ChromeUtils.generateQI(["calIStatusObserver"]),

  initialize(aWindow) {
    if (!this.mInitialized) {
      this.mWindow = aWindow;
      this.mStatusText = this.mWindow.document.getElementById("statusText");
      this.mStatusBar = this.mWindow.document.getElementById("statusbar-icon");
      this.mStatusProgressPanel = this.mWindow.document.getElementById("statusbar-progresspanel");
      this.mThrobber = this.mWindow.document.getElementById("navigator-throbber");
      this.mInitialized = true;
    }
  },

  showStatusString(status) {
    this.mStatusText.setAttribute("label", status);
  },

  get spinning() {
    return this.mProgressMode;
  },

  startMeteors(aProgressMode, aCalendarCount) {
    if (aProgressMode != Ci.calIStatusObserver.NO_PROGRESS) {
      if (!this.mInitialized) {
        console.error("StatusObserver has not been initialized!");
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
      if (this.mProgressMode == Ci.calIStatusObserver.DETERMINED_PROGRESS) {
        this.mStatusBar.value = 0;
        const commonStatus = cal.l10n.getCalString("gettingCalendarInfoCommon");
        this.showStatusString(commonStatus);
      }
      if (this.mThrobber) {
        this.mThrobber.setAttribute("busy", true);
      }
    }
  },

  stopMeteors() {
    if (!this.mInitialized) {
      return;
    }
    if (this.spinning != Ci.calIStatusObserver.NO_PROGRESS) {
      this.mProgressMode = Ci.calIStatusObserver.NO_PROGRESS;
      this.mStatusProgressPanel.collapsed = true;
      this.mStatusBar.value = 0;
      this.mCalendarCount = 0;
      this.showStatusString("");
      if (this.mThrobber) {
        this.mThrobber.setAttribute("busy", false);
      }
    }
  },

  calendarCompleted(aCalendar) {
    if (!this.mInitialized) {
      return;
    }
    if (this.spinning != Ci.calIStatusObserver.NO_PROGRESS) {
      if (this.spinning == Ci.calIStatusObserver.DETERMINED_PROGRESS) {
        if (!this.mCalendars[aCalendar.id] || this.mCalendars[aCalendar.id] === undefined) {
          this.mCalendars[aCalendar.id] = true;
          this.mStatusBar.value = parseInt(this.mStatusBar.value, 10) + this.mCalendarStep;
          this.mCurIndex++;
          const curStatus = cal.l10n.getCalString("gettingCalendarInfoDetail", [
            this.mCurIndex,
            this.mCalendarCount,
          ]);
          this.showStatusString(curStatus);
        }
      }
      if (this.mThrobber) {
        this.mThrobber.setAttribute("busy", true);
      }
    }
  },
};
