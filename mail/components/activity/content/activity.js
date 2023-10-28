/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const activityManager = Cc["@mozilla.org/activity-manager;1"].getService(
  Ci.nsIActivityManager
);

var ACTIVITY_LIMIT = 250;

var activityObject = {
  _activityMgrListener: null,
  _activitiesView: null,
  _activityLogger: console.createInstance({
    prefix: "mail.activity",
    maxLogLevel: "Warn",
    maxLogLevelPref: "mail.activity.loglevel",
  }),
  _ignoreNotifications: false,
  _groupCache: new Map(),

  // Utility Functions for Activity element management

  /**
   * Creates the proper element for the given activity
   */
  createActivityWidget(type) {
    const element = document.createElement("li", {
      is: type.bindingName,
    });

    if (element) {
      element.setAttribute("actID", type.id);
    }

    return element;
  },

  /**
   * Returns the activity group element that matches the context_type
   * and context of the given activity, if any.
   */
  getActivityGroupElementByContext(aContextType, aContextObj) {
    return this._groupCache.get(aContextType + ":" + aContextObj);
  },

  /**
   * Inserts the given element into the correct position on the
   * activity manager window.
   */
  placeActivityElement(element) {
    if (element.isGroup || element.isProcess) {
      this._activitiesView.insertBefore(
        element,
        this._activitiesView.firstElementChild
      );
    } else {
      let next = this._activitiesView.firstElementChild;
      while (next && (next.isWarning || next.isProcess || next.isGroup)) {
        next = next.nextElementSibling;
      }
      if (next) {
        this._activitiesView.insertBefore(element, next);
      } else {
        this._activitiesView.appendChild(element);
      }
    }
    if (element.isGroup) {
      this._groupCache.set(
        element.contextType + ":" + element.contextObj,
        element
      );
    }
    while (this._activitiesView.children.length > ACTIVITY_LIMIT) {
      this.removeActivityElement(
        this._activitiesView.lastElementChild.getAttribute("actID")
      );
    }
  },

  /**
   * Adds a new element to activity manager window for the
   * given activity. It is called by ActivityMgrListener when
   * a new activity is added into the activity manager's internal
   * list.
   */
  addActivityElement(aID, aActivity) {
    try {
      this._activityLogger.info(`Adding ActivityElement: ${aID}, ${aActivity}`);
      // get |groupingStyle| of the activity. Grouping style determines
      // whether we show the activity standalone or grouped by context in
      // the activity manager window.
      const isGroupByContext =
        aActivity.groupingStyle == Ci.nsIActivity.GROUPING_STYLE_BYCONTEXT;

      // find out if an activity group has already been created for this context
      let group = null;
      if (isGroupByContext) {
        group = this.getActivityGroupElementByContext(
          aActivity.contextType,
          aActivity.contextObj
        );
        // create a group if it's not already created.
        if (!group) {
          group = document.createElement("li", {
            is: "activity-group-item",
          });
          this._activityLogger.info("created group element");
          // Set the context type and object of the newly created group
          group.contextType = aActivity.contextType;
          group.contextObj = aActivity.contextObj;
          group.contextDisplayText = aActivity.contextDisplayText;

          // add group into the list
          this.placeActivityElement(group);
        }
      }

      // create the appropriate element for the activity
      const actElement = this.createActivityWidget(aActivity);
      this._activityLogger.info("created activity element");

      if (group) {
        // get the inner list element of the group
        const groupView = group.querySelector(".activitygroup-list");
        groupView.appendChild(actElement);
      } else {
        this.placeActivityElement(actElement);
      }
    } catch (e) {
      this._activityLogger.error("addActivityElement: " + e);
      throw e;
    }
  },

  /**
   * Removes the activity element from the activity manager window.
   * It is called by ActivityMgrListener when the activity in question
   * is removed from the activity manager's internal list.
   */
  removeActivityElement(aID) {
    this._activityLogger.info("removing Activity ID: " + aID);
    const item = this._activitiesView.querySelector(`[actID="${aID}"]`);

    if (item) {
      const group = item.closest(".activitygroup");
      item.remove();
      if (group && !group.querySelector(".activityitem")) {
        // Empty group is removed.
        this._groupCache.delete(group.contextType + ":" + group.contextObj);
        group.remove();
      }
    }
  },

  // -----------------
  // Startup, Shutdown

  startup() {
    try {
      this._activitiesView = document.getElementById("activityView");

      const activities = activityManager.getActivities();
      for (
        let iActivity = Math.max(0, activities.length - ACTIVITY_LIMIT);
        iActivity < activities.length;
        iActivity++
      ) {
        const activity = activities[iActivity];
        this.addActivityElement(activity.id, activity);
      }

      // start listening changes in the activity manager's
      // internal list
      this._activityMgrListener = new this.ActivityMgrListener();
      activityManager.addListener(this._activityMgrListener);
    } catch (e) {
      this._activityLogger.error("Exception: " + e);
    }
  },

  rebuild() {
    const activities = activityManager.getActivities();
    for (const activity of activities) {
      this.addActivityElement(activity.id, activity);
    }
  },

  shutdown() {
    activityManager.removeListener(this._activityMgrListener);
  },

  // -----------------
  // Utility Functions

  /**
   * Remove all activities not in-progress from the activity list.
   */
  clearActivityList() {
    this._activityLogger.debug("clearActivityList");

    this._ignoreNotifications = true;
    // If/when we implement search, we'll want to remove just the items
    // that are on the search display, however for now, we'll just clear up
    // everything.
    activityManager.cleanUp();

    while (this._activitiesView.lastChild) {
      this._activitiesView.lastChild.remove();
    }

    this._groupCache.clear();
    this.rebuild();
    this._ignoreNotifications = false;
    this._activitiesView.focus();
  },
};

// An object to monitor nsActivityManager operations. This class acts as
// binding layer between nsActivityManager and nsActivityManagerUI objects.
activityObject.ActivityMgrListener = function () {};
activityObject.ActivityMgrListener.prototype = {
  onAddedActivity(aID, aActivity) {
    activityObject._activityLogger.info(`added activity: ${aID} ${aActivity}`);
    if (!activityObject._ignoreNotifications) {
      activityObject.addActivityElement(aID, aActivity);
    }
  },

  onRemovedActivity(aID) {
    if (!activityObject._ignoreNotifications) {
      activityObject.removeActivityElement(aID);
    }
  },
};

window.addEventListener("load", () => activityObject.startup());
window.addEventListener("unload", () => activityObject.shutdown());
