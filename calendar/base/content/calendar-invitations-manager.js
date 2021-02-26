/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

/* exported getInvitationsManager, openInvitationsDialog, setUpInvitationsManager,
 *          tearDownInvitationsManager
 */

/**
 * This object contains functions to take care of manipulating requests.
 */
var gInvitationsRequestManager = {
  mRequestStatusList: {},

  /**
   * Add a request to the request manager.
   *
   * @param calendar    The calendar to add for.
   * @param op          The operation to add
   */
  addRequestStatus(calendar, operation) {
    if (operation) {
      this.mRequestStatusList[calendar.id] = operation;
    }
  },

  /**
   * Cancel all pending requests
   */
  cancelPendingRequests() {
    for (let id in this.mRequestStatusList) {
      let request = this.mRequestStatusList[id];
      if (request && request.isPending) {
        request.cancel(null);
      }
    }
    this.mRequestStatusList = {};
  },
};

var gInvitationsManager = null;

/**
 * Return a cached instance of the invitations manager
 *
 * @return      The invitations manager instance.
 */
function getInvitationsManager() {
  if (!gInvitationsManager) {
    gInvitationsManager = new InvitationsManager();
  }
  return gInvitationsManager;
}

// Listeners, observers, set up, tear down, opening dialog, etc. This code kept
// separate from the InvitationsManager class itself for separation of concerns.

// == invitations link
const FIRST_DELAY_STARTUP = 100;
const FIRST_DELAY_RESCHEDULE = 100;
const FIRST_DELAY_REGISTER = 10000;
const FIRST_DELAY_UNREGISTER = 0;

var gInvitationsOperationListener = {
  mCount: 0,
  QueryInterface: ChromeUtils.generateQI(["calIOperationListener"]),

  onOperationComplete(aCalendar, aStatus, aOperationType, aId, aDetail) {
    let invitationsBox = document.getElementById("calendar-invitations-panel");
    if (Components.isSuccessCode(aStatus)) {
      let value = cal.l10n.getLtnString("invitationsLink.label", [this.mCount]);
      document.getElementById("calendar-invitations-label").value = value;
      invitationsBox.hidden = this.mCount < 1;
    } else {
      invitationsBox.setAttribute("hidden", "true");
    }
    this.mCount = 0;
  },

  onGetResult(aCalendar, aStatus, aItemType, aDetail, aItems) {
    if (Components.isSuccessCode(aStatus)) {
      this.mCount += aItems.length;
    }
  },
};

var gInvitationsCalendarManagerObserver = {
  mStoredThis: this,
  QueryInterface: ChromeUtils.generateQI(["calICalendarManagerObserver"]),

  onCalendarRegistered(aCalendar) {
    this.mStoredThis.rescheduleInvitationsUpdate(FIRST_DELAY_REGISTER);
  },

  onCalendarUnregistering(aCalendar) {
    this.mStoredThis.rescheduleInvitationsUpdate(FIRST_DELAY_UNREGISTER);
  },

  onCalendarDeleting(aCalendar) {},
};

function scheduleInvitationsUpdate(firstDelay) {
  gInvitationsOperationListener.mCount = 0;
  getInvitationsManager().scheduleInvitationsUpdate(firstDelay, gInvitationsOperationListener);
}

function rescheduleInvitationsUpdate(firstDelay) {
  getInvitationsManager().cancelInvitationsUpdate();
  scheduleInvitationsUpdate(firstDelay);
}

function openInvitationsDialog() {
  getInvitationsManager().cancelInvitationsUpdate();
  gInvitationsOperationListener.mCount = 0;
  getInvitationsManager().openInvitationsDialog(gInvitationsOperationListener, () =>
    scheduleInvitationsUpdate(FIRST_DELAY_RESCHEDULE)
  );
}

function setUpInvitationsManager() {
  scheduleInvitationsUpdate(FIRST_DELAY_STARTUP);
  cal.getCalendarManager().addObserver(gInvitationsCalendarManagerObserver);
}

function tearDownInvitationsManager() {
  cal.getCalendarManager().removeObserver(gInvitationsCalendarManagerObserver);
}

/**
 * The invitations manager class constructor
 *
 * XXX do we really need this to be an instance?
 *
 * @constructor
 */
function InvitationsManager() {
  this.mItemList = [];
  this.mStartDate = null;
  this.mJobsPending = 0;
  this.mTimer = null;

  window.addEventListener("unload", () => {
    // Unload handlers get removed automatically
    this.cancelInvitationsUpdate();
  });
}

InvitationsManager.prototype = {
  mItemList: null,
  mStartDate: null,
  mJobsPending: 0,
  mTimer: null,

  /**
   * Schedule an update for the invitations manager asynchronously.
   *
   * @param firstDelay          The timeout before the operation should start.
   * @param operationListener   The calIGenericOperationListener to notify.
   */
  scheduleInvitationsUpdate(firstDelay, operationListener) {
    this.cancelInvitationsUpdate();

    this.mTimer = setTimeout(() => {
      if (Services.prefs.getBoolPref("calendar.invitations.autorefresh.enabled", true)) {
        this.mTimer = setInterval(() => {
          this.getInvitations(operationListener);
        }, Services.prefs.getIntPref("calendar.invitations.autorefresh.timeout", 3) * 60000);
      }
      this.getInvitations(operationListener);
    }, firstDelay);
  },

  /**
   * Cancel pending any pending invitations update.
   */
  cancelInvitationsUpdate() {
    clearTimeout(this.mTimer);
  },

  /**
   * Retrieve invitations from all calendars. Notify all passed
   * operation listeners.
   *
   * @param operationListener1    The first operation listener to notify.
   * @param operationListener2    (optional) The second operation listener to
   *                                notify.
   */
  getInvitations(operationListener1, operationListener2) {
    let listeners = [];
    if (operationListener1) {
      listeners.push(operationListener1);
    }
    if (operationListener2) {
      listeners.push(operationListener2);
    }

    gInvitationsRequestManager.cancelPendingRequests();
    this.updateStartDate();
    this.deleteAllItems();

    let cals = cal.getCalendarManager().getCalendars();

    let opListener = {
      QueryInterface: ChromeUtils.generateQI(["calIOperationListener"]),
      mCount: cals.length,
      mRequestManager: gInvitationsRequestManager,
      mInvitationsManager: this,
      mHandledItems: {},

      // calIOperationListener
      onOperationComplete(aCalendar, aStatus, aOperationType, aId, aDetail) {
        if (--this.mCount == 0) {
          this.mInvitationsManager.mItemList.sort((a, b) => {
            return a.startDate.compare(b.startDate);
          });
          for (let listener of listeners) {
            try {
              if (this.mInvitationsManager.mItemList.length) {
                // Only call if there are actually items
                listener.onGetResult(
                  null,
                  Cr.NS_OK,
                  Ci.calIItemBase,
                  null,
                  this.mInvitationsManager.mItemList
                );
              }
              listener.onOperationComplete(
                null,
                Cr.NS_OK,
                Ci.calIOperationListener.GET,
                null,
                null
              );
            } catch (exc) {
              cal.ERROR(exc);
            }
          }
        }
      },

      onGetResult(aCalendar, aStatus, aItemType, aDetail, aItems) {
        if (Components.isSuccessCode(aStatus)) {
          for (let item of aItems) {
            // we need to retrieve by occurrence to properly filter exceptions,
            // should be fixed with bug 416975
            item = item.parentItem;
            let hid = item.hashId;
            if (!this.mHandledItems[hid]) {
              this.mHandledItems[hid] = true;
              this.mInvitationsManager.addItem(item);
            }
          }
        }
      },
    };

    for (let calendar of cals) {
      if (!cal.acl.isCalendarWritable(calendar) || calendar.getProperty("disabled")) {
        opListener.onOperationComplete();
        continue;
      }

      // temporary hack unless calCachedCalendar supports REQUEST_NEEDS_ACTION filter:
      calendar = calendar.getProperty("cache.uncachedCalendar");
      if (!calendar) {
        opListener.onOperationComplete();
        continue;
      }

      try {
        calendar = calendar.QueryInterface(Ci.calICalendar);
        let endDate = this.mStartDate.clone();
        endDate.year += 1;
        let operation = calendar.getItems(
          Ci.calICalendar.ITEM_FILTER_REQUEST_NEEDS_ACTION |
            Ci.calICalendar.ITEM_FILTER_TYPE_ALL |
            // we need to retrieve by occurrence to properly filter exceptions,
            // should be fixed with bug 416975
            Ci.calICalendar.ITEM_FILTER_CLASS_OCCURRENCES,
          0,
          this.mStartDate,
          endDate /* we currently cannot pass null here, because of bug 416975 */,
          opListener
        );
        gInvitationsRequestManager.addRequestStatus(calendar, operation);
      } catch (exc) {
        opListener.onOperationComplete();
        cal.ERROR(exc);
      }
    }
  },

  /**
   * Open the invitations dialog, non-modal.
   *
   * XXX Passing these listeners in instead of keeping them in the window
   * sounds fishy to me. Maybe there is a more encapsulated solution.
   *
   * @param onLoadOpListener          The operation listener to notify when
   *                                    getting invitations. Should be passed
   *                                    to this.getInvitations().
   * @param finishedCallBack          A callback function to call when the
   *                                    dialog has completed.
   */
  openInvitationsDialog(onLoadOpListener, finishedCallBack) {
    let args = {};
    args.onLoadOperationListener = onLoadOpListener;
    args.queue = [];
    args.finishedCallBack = finishedCallBack;
    args.requestManager = gInvitationsRequestManager;
    args.invitationsManager = this;
    // the dialog will reset this to auto when it is done loading
    window.setCursor("wait");
    // open the dialog
    window.openDialog(
      "chrome://calendar/content/calendar-invitations-dialog.xhtml",
      "_blank",
      "chrome,titlebar,resizable",
      args
    );
  },

  /**
   * Process the passed job queue. A job is an object that consists of an
   * action, a newItem and and oldItem. This processor only takes "modify"
   * operations into account.
   *
   * @param queue                         The array of objects to process.
   * @param jobQueueFinishedCallBack      A callback function called when
   *                                        job has finished.
   */
  processJobQueue(queue, jobQueueFinishedCallBack) {
    // TODO: undo/redo
    function operationListener(mgr, queueCallback, oldItem_) {
      this.mInvitationsManager = mgr;
      this.mJobQueueFinishedCallBack = queueCallback;
      this.mOldItem = oldItem_;
    }
    operationListener.prototype = {
      QueryInterface: ChromeUtils.generateQI(["calIOperationListener"]),
      onOperationComplete(aCalendar, aStatus, aOperationType, aId, aDetail) {
        if (
          Components.isSuccessCode(aStatus) &&
          aOperationType == Ci.calIOperationListener.MODIFY
        ) {
          cal.itip.checkAndSend(aOperationType, aDetail, this.mOldItem);
          this.mInvitationsManager.deleteItem(aDetail);
          this.mInvitationsManager.addItem(aDetail);
        }
        this.mInvitationsManager.mJobsPending--;
        if (this.mInvitationsManager.mJobsPending == 0 && this.mJobQueueFinishedCallBack) {
          this.mJobQueueFinishedCallBack();
        }
      },

      onGetResult(calendar, status, itemType, detail, items) {},
    };

    this.mJobsPending = 0;
    for (let i = 0; i < queue.length; i++) {
      let job = queue[i];
      let oldItem = job.oldItem;
      let newItem = job.newItem;
      switch (job.action) {
        case "modify":
          this.mJobsPending++;
          newItem.calendar.modifyItem(
            newItem,
            oldItem,
            new operationListener(this, jobQueueFinishedCallBack, oldItem)
          );
          break;
        default:
          break;
      }
    }
    if (this.mJobsPending == 0 && jobQueueFinishedCallBack) {
      jobQueueFinishedCallBack();
    }
  },

  /**
   * Checks if the internal item list contains the given item
   * XXXdbo       Please document these correctly.
   *
   * @param item      The item to look for.
   * @return          A boolean value indicating if the item was found.
   */
  hasItem(item) {
    let hid = item.hashId;
    return this.mItemList.some(item_ => hid == item_.hashId);
  },

  /**
   * Adds an item to the internal item list.
   * XXXdbo       Please document these correctly.
   *
   * @param item      The item to add.
   */
  addItem(item) {
    let recInfo = item.recurrenceInfo;
    if (recInfo && !cal.itip.isOpenInvitation(item)) {
      // scan exceptions:
      let ids = recInfo.getExceptionIds();
      for (let id of ids) {
        let ex = recInfo.getExceptionFor(id);
        if (ex && this.validateItem(ex) && !this.hasItem(ex)) {
          this.mItemList.push(ex);
        }
      }
    } else if (this.validateItem(item) && !this.hasItem(item)) {
      this.mItemList.push(item);
    }
  },

  /**
   * Removes an item from the internal item list
   * XXXdbo       Please document these correctly.
   *
   * @param item      The item to remove.
   */
  deleteItem(item) {
    let id = item.id;
    this.mItemList.filter(item_ => id != item_.id);
  },

  /**
   * Remove all items from the internal item list
   * XXXdbo       Please document these correctly.
   */
  deleteAllItems() {
    this.mItemList = [];
  },

  /**
   * Helper function to create a start date to search from. This date is the
   * current time with hour/minute/second set to zero.
   *
   * @return      Potential start date.
   */
  getStartDate() {
    let date = cal.dtz.now();
    date.second = 0;
    date.minute = 0;
    date.hour = 0;
    return date;
  },

  /**
   * Updates the start date for the invitations manager to the date returned
   * from this.getStartDate(), unless the previously existing start date is
   * the same or after what getStartDate() returned.
   */
  updateStartDate() {
    if (this.mStartDate) {
      let startDate = this.getStartDate();
      if (startDate.compare(this.mStartDate) > 0) {
        this.mStartDate = startDate;
      }
    } else {
      this.mStartDate = this.getStartDate();
    }
  },

  /**
   * Checks if the item is valid for the invitation manager. Checks if the
   * item is in the range of the invitation manager and if the item is a valid
   * invitation.
   *
   * @param item      The item to check
   * @return          A boolean indicating if the item is a valid invitation.
   */
  validateItem(item) {
    if (item.calendar instanceof Ci.calISchedulingSupport && !item.calendar.isInvitation(item)) {
      return false; // exclude if organizer has invited himself
    }
    let start = item[cal.dtz.startDateProp(item)] || item[cal.dtz.endDateProp(item)];
    return cal.itip.isOpenInvitation(item) && start.compare(this.mStartDate) >= 0;
  },
};
