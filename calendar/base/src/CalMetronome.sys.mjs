/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

import { EventEmitter } from "resource://gre/modules/EventEmitter.sys.mjs";

const MINUTE_IN_MS = 60000;
const HOUR_IN_MS = 3600000;
const DAY_IN_MS = 86400000;

/**
 * Keeps calendar UI/components in sync by ticking regularly. Fires a "minute"
 * event every minute on the minute, an "hour" event on the hour, and a "day"
 * event at midnight. Each event also fires if longer than the time period in
 * question has elapsed since the last event, e.g. because the computer has
 * been asleep.
 *
 * It automatically corrects clock skew: if a minute event is more than one
 * second late, the time to the next event is recalculated and should fire a
 * few milliseconds late at worst.
 *
 * @implements {nsIObserver}
 * @implements {EventEmitter}
 */
export var CalMetronome = {
  QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),

  /**
   * The time when the minute event last fired, in milliseconds since the epoch.
   *
   * @type {integer}
   */
  _lastFireTime: 0,

  /**
   * The last minute for which the minute event fired.
   *
   * @type {integer} (0-59)
   */
  _lastMinute: -1,

  /**
   * The last hour for which the hour event fired.
   *
   * @type {integer} (0-23)
   */
  _lastHour: -1,

  /**
   * The last day of the week for which the day event fired.
   *
   * @type {integer} (0-7)
   */
  _lastDay: -1,

  /**
   * The timer running everything.
   *
   * @type {nsITimer}
   */
  _timer: Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer),

  init() {
    const now = new Date();
    this._lastFireTime = now.valueOf();
    this._lastHour = now.getHours();
    this._lastDay = now.getDay();

    EventEmitter.decorate(this);

    Services.obs.addObserver(this, "wake_notification");
    Services.obs.addObserver(this, "quit-application");
    this._startNext();
  },

  observe(subject, topic) {
    if (topic == "wake_notification") {
      cal.LOGverbose("[CalMetronome] Observed wake_notification");
      this.notify();
    } else if (topic == "quit-application") {
      this._timer.cancel();
      Services.obs.removeObserver(this, "wake_notification");
      Services.obs.removeObserver(this, "quit-application");
    }
  },

  _startNext() {
    this._timer.cancel();

    const now = new Date();
    const next = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours(),
      now.getMinutes() + 1,
      0
    );
    cal.LOGverbose(`[CalMetronome] Scheduling one-off event in ${next - now}ms`);
    this._timer.initWithCallback(this, next - now, Ci.nsITimer.TYPE_ONE_SHOT);
  },

  _startRepeating() {
    cal.LOGverbose(`[CalMetronome] Starting repeating events`);
    this._timer.initWithCallback(this, MINUTE_IN_MS, Ci.nsITimer.TYPE_REPEATING_SLACK);
  },

  notify() {
    const now = new Date();
    const elapsedSinceLastFire = now.valueOf() - this._lastFireTime;
    this._lastFireTime = now.valueOf();

    const minute = now.getMinutes();
    if (minute != this._lastMinute || elapsedSinceLastFire > MINUTE_IN_MS) {
      this._lastMinute = minute;
      this.emit("minute", now);
    }

    const hour = now.getHours();
    if (hour != this._lastHour || elapsedSinceLastFire > HOUR_IN_MS) {
      this._lastHour = hour;
      this.emit("hour", now);
    }

    const day = now.getDay();
    if (day != this._lastDay || elapsedSinceLastFire > DAY_IN_MS) {
      this._lastDay = day;
      this.emit("day", now);
    }

    const slack = now.getSeconds();
    if (slack >= 1 && slack < 59) {
      this._startNext();
    } else if (this._timer.type == Ci.nsITimer.TYPE_ONE_SHOT) {
      this._startRepeating();
    }
  },
};

CalMetronome.init();
