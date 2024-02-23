/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export function ActivityManager() {}

ActivityManager.prototype = {
  log: console.createInstance({
    prefix: "mail.activity",
    maxLogLevel: "Warn",
    maxLogLevelPref: "mail.activity.loglevel",
  }),
  _listeners: [],
  _processCount: 0,
  _db: null,
  _idCounter: 1,
  _activities: new Map(),

  get processCount() {
    let count = 0;
    for (const value of this._activities.values()) {
      if (value instanceof Ci.nsIActivityProcess) {
        count++;
      }
    }

    return count;
  },

  getProcessesByContext(aContextType, aContextObj) {
    const list = [];
    for (const activity of this._activities.values()) {
      if (
        activity instanceof Ci.nsIActivityProcess &&
        activity.contextType == aContextType &&
        activity.contextObj == aContextObj
      ) {
        list.push(activity);
      }
    }
    return list;
  },

  get db() {
    return null;
  },

  get nextId() {
    return this._idCounter++;
  },

  addActivity(aActivity) {
    try {
      this.log.info("adding Activity");
      // get the next valid id for this activity
      const id = this.nextId;
      aActivity.id = id;

      // add activity into the activities table
      this._activities.set(id, aActivity);
      // notify all the listeners
      for (const value of this._listeners) {
        try {
          value.onAddedActivity(id, aActivity);
        } catch (e) {
          this.log.error("Exception calling onAddedActivity" + e);
        }
      }
      return id;
    } catch (e) {
      // for some reason exceptions don't end up on the console if we don't
      // explicitly log them.
      this.log.error("Exception: " + e);
      throw e;
    }
  },

  removeActivity(aID) {
    const activity = this.getActivity(aID);
    if (!activity) {
      return; // Nothing to remove.
    }

    // make sure that the activity is not in-progress state
    if (
      activity instanceof Ci.nsIActivityProcess &&
      activity.state == Ci.nsIActivityProcess.STATE_INPROGRESS
    ) {
      throw Components.Exception(`Activity in progress`, Cr.NS_ERROR_FAILURE);
    }

    // remove the activity
    this._activities.delete(aID);

    // notify all the listeners
    for (const value of this._listeners) {
      try {
        value.onRemovedActivity(aID);
      } catch (e) {
        // ignore the exception
      }
    }
  },

  cleanUp() {
    // Get the list of aIDs.
    this.log.info("cleanUp\n");
    for (const [id, activity] of this._activities) {
      if (activity instanceof Ci.nsIActivityProcess) {
        // Note: The .state property will return undefined if you aren't in
        //       this if-instanceof block.
        const state = activity.state;
        if (
          state != Ci.nsIActivityProcess.STATE_INPROGRESS &&
          state != Ci.nsIActivityProcess.STATE_PAUSED &&
          state != Ci.nsIActivityProcess.STATE_WAITINGFORINPUT &&
          state != Ci.nsIActivityProcess.STATE_WAITINGFORRETRY
        ) {
          this.removeActivity(id);
        }
      } else {
        this.removeActivity(id);
      }
    }
  },

  getActivity(aID) {
    return this._activities.get(aID);
  },

  containsActivity(aID) {
    return this._activities.has(aID);
  },

  getActivities() {
    return [...this._activities.values()];
  },

  addListener(aListener) {
    this.log.info("addListener\n");
    this._listeners.push(aListener);
  },

  removeListener(aListener) {
    this.log.info("removeListener\n");
    for (let i = 0; i < this._listeners.length; i++) {
      if (this._listeners[i] == aListener) {
        this._listeners.splice(i, 1);
      }
    }
  },

  QueryInterface: ChromeUtils.generateQI(["nsIActivityManager"]),
};
