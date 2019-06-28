/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Log4Moz } = ChromeUtils.import("resource:///modules/gloda/log4moz.js");
const activityManager = Cc["@mozilla.org/activity-manager;1"].getService(Ci.nsIActivityManager);

var ACTIVITY_LIMIT = 250;

var activityObject = {
  _activityMgrListener: null,
  _activitiesView: null,
  _activityLogger: Log4Moz.getConfiguredLogger("activitymgr"),
  _ignoreNotifications: false,
  _groupCache: new Map(),

  selectAll() {
    this._activitiesView.selectAll();
  },

  // Utility Functions for Activity element management

  /**
   * Creates the proper element for the given activity
   */
  createActivityWidget(type) {
    let builtInName = type.bindingName;
    let element = document.createXULElement("richlistitem", { is: builtInName });

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
      this._activitiesView.insertBefore(element,
                                        this._activitiesView.firstChild);
    } else {
      let next = this._activitiesView.firstChild;
      while (next && (next.isWarning || next.isProcess || next.isGroup)) {
        next = next.nextSibling;
      }
      if (next) {
        this._activitiesView.insertBefore(element, next);
      } else {
        this._activitiesView.appendChild(element);
      }
    }
    if (element.isGroup) {
      this._groupCache.set(element.contextType + ":" + element.contextObj, element);
    }
    while (this._activitiesView.childNodes.length > ACTIVITY_LIMIT) {
      this.removeActivityElement(this._activitiesView.lastChild.getAttribute("actID"));
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
      let isGroupByContext = (aActivity.groupingStyle ==
                              Ci.nsIActivity
                                .GROUPING_STYLE_BYCONTEXT);

      // find out if an activity group has already been created for this context
      let group = null;
      if (isGroupByContext) {
        group = this.getActivityGroupElementByContext(aActivity.contextType,
                                                 aActivity.contextObj);
        // create a group if it's not already created.
        if (!group) {
          group = document.createXULElement("richlistitem", { is: "activity-group" });
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
      let actElement = this.createActivityWidget(aActivity);
      this._activityLogger.info("created activity element");

      if (group) {
        // get the inner list element of the group
        let groupView = group.querySelector(".activitygroupbox");
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
    // Note: document.getAnonymousNodes(_activitiesView); didn't work
    this._activityLogger.info("removing Activity ID: " + aID);
    let activities = this._activitiesView.childNodes;
    for (let i = 0; i < activities.length; i++) {
      let item = activities[i];
      if (!item) {
        this._activityLogger.debug("returning as empty");
        return;
      }

      if (!item.isGroup) {
        this._activityLogger.debug("is not a group, ");
        if (item.getAttribute("actID") == aID) {
          item.detachFromActivity();
          item.remove();
          break;
        }
      } else {
        // string to identify the activity item through actID attribute
        // in querySelector.
        let actIDValueStr = "[actID='" + aID + "']";
        let actElement = item.querySelector(actIDValueStr);
        if (actElement) {
          let groupView = document.querySelector(".activitygroupbox");
          actElement.detachFromActivity();
          actElement.remove();

          // if the group becomes empty after the removal,
          // get rid of the group as well
          if (groupView.getRowCount() == 0) {
            this._groupCache.delete(item.contextType + ":" + item.contextObj);
            item.remove();
          }
          break;
        }
      }
    }
  },

  // -----------------
  // Startup, Shutdown

  startup() {
    try {
      this._activitiesView = document.getElementById("activityView");

      let activities = activityManager.getActivities();
      for (let iActivity = Math.max(0, activities.length - ACTIVITY_LIMIT);
           iActivity < activities.length; iActivity++) {
        let activity = activities[iActivity];
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
    let activities = activityManager.getActivities();
    for (let activity of activities) {
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

    let activities = this._activitiesView.childNodes;
    for (let i = activities.length - 1; i >= 0; i--) {
      let item = activities[i];
      if (!item.isGroup) {
        item.detachFromActivity();
      } else {
        let actElement = document.getAnonymousElementByAttribute(item, "actID", "*");
        while (actElement) {
          actElement.detachFromActivity();
          actElement.remove();
          actElement = document.getAnonymousElementByAttribute(item, "actID", "*");
        }
      }
    }

    let empty = this._activitiesView.cloneNode(false);
    this._activitiesView.parentNode.replaceChild(empty, this._activitiesView);
    this._activitiesView = empty;

    this._groupCache.clear();
    this.rebuild();
    this._ignoreNotifications = false;
    this._activitiesView.focus();
  },

  processKeyEvent(event) {
    switch (event.keyCode) {
      case event.DOM_VK_RIGHT:
        if (event.target.tagName == "richlistbox") {
          let richlistbox = event.target.selectedItem.processes;
          if (richlistbox.tagName == "xul:richlistbox") {
            richlistbox.focus();
            richlistbox.selectItem(richlistbox.getItemAtIndex(0));
          }
        }
        break;
      case event.DOM_VK_LEFT:
        if (event.target.tagName == "activity-group") {
          var parent = event.target.parentNode;
          if (parent.tagName == "richlistbox") {
            event.target.processes.clearSelection();
            parent.selectItem(event.target);
            parent.focus();
          }
        }
        break;
    }
  },
};

// An object to monitor nsActivityManager operations. This class acts as
// binding layer between nsActivityManager and nsActivityManagerUI objects.
activityObject.ActivityMgrListener = function() {};
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
