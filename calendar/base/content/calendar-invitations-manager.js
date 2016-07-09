/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://calendar/modules/calUtils.jsm");
Components.utils.import("resource://calendar/modules/calItipUtils.jsm");
Components.utils.import("resource://gre/modules/Preferences.jsm");
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

/* exported getInvitationsManager */

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
    addRequestStatus: function(calendar, operation) {
        if (operation) {
            this.mRequestStatusList[calendar.id] = operation;
        }
    },

    /**
     * Cancel all pending requests
     */
    cancelPendingRequests: function() {
        for (let id in this.mRequestStatusList) {
            let request = this.mRequestStatusList[id];
            if (request && request.isPending) {
                request.cancel(null);
            }
        }
        this.mRequestStatusList = {};
    }
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
    }, false);
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
    scheduleInvitationsUpdate: function(firstDelay, operationListener) {
        this.cancelInvitationsUpdate();

        this.mTimer = setTimeout(() => {
            if (Preferences.get("calendar.invitations.autorefresh.enabled", true)) {
                this.mTimer = setInterval(() => {
                    this.getInvitations(operationListener);
                }, Preferences.get("calendar.invitations.autorefresh.timeout", 3) * 60000);
            }
            this.getInvitations(operationListener);
        }, firstDelay);
    },

    /**
     * Cancel pending any pending invitations update.
     */
    cancelInvitationsUpdate: function() {
        clearTimeout(this.mTimer);
    },

    /**
     * Retrieve invitations from all calendars. Notify all passed
     * operation listeners.
     *
     * @param operationListener1    The first operation listener to notify.
     * @param operationListener2    (optinal) The second operation listener to
     *                                notify.
     */
    getInvitations: function(operationListener1, operationListener2) {
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

        let cals = getCalendarManager().getCalendars({});

        let opListener = {
            QueryInterface: XPCOMUtils.generateQI([Components.interfaces.calIOperationListener]),
            mCount: cals.length,
            mRequestManager: gInvitationsRequestManager,
            mInvitationsManager: this,
            mHandledItems: {},

            // calIOperationListener
            onOperationComplete: function(aCalendar,
                                          aStatus,
                                          aOperationType,
                                          aId,
                                          aDetail) {
                if (--this.mCount == 0) {
                    this.mInvitationsManager.mItemList.sort((a, b) => {
                        return a.startDate.compare(b.startDate);
                    });
                    for (let listener of listeners) {
                        try {
                            if (this.mInvitationsManager.mItemList.length) {
                                // Only call if there are actually items
                                listener.onGetResult(null,
                                                     Components.results.NS_OK,
                                                     Components.interfaces.calIItemBase,
                                                     null,
                                                     this.mInvitationsManager.mItemList.length,
                                                     this.mInvitationsManager.mItemList);
                            }
                            listener.onOperationComplete(null,
                                                         Components.results.NS_OK,
                                                         Components.interfaces.calIOperationListener.GET,
                                                         null,
                                                         null);
                        } catch (exc) {
                            ERROR(exc);
                        }
                    }
                }
            },

            onGetResult: function(aCalendar,
                                  aStatus,
                                  aItemType,
                                  aDetail,
                                  aCount,
                                  aItems) {
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
            }
        };

        for (let calendar of cals) {
            if (!isCalendarWritable(calendar) || calendar.getProperty("disabled")) {
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
                calendar = calendar.QueryInterface(Components.interfaces.calICalendar);
                let endDate = this.mStartDate.clone();
                endDate.year += 1;
                let operation = calendar.getItems(Components.interfaces.calICalendar.ITEM_FILTER_REQUEST_NEEDS_ACTION |
                                                  Components.interfaces.calICalendar.ITEM_FILTER_TYPE_ALL |
                                                  // we need to retrieve by occurrence to properly filter exceptions,
                                                  // should be fixed with bug 416975
                                                  Components.interfaces.calICalendar.ITEM_FILTER_CLASS_OCCURRENCES,
                                                  0, this.mStartDate,
                                                  endDate /* we currently cannot pass null here, because of bug 416975 */,
                                                  opListener);
                gInvitationsRequestManager.addRequestStatus(calendar, operation);
            } catch (exc) {
                opListener.onOperationComplete();
                ERROR(exc);
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
    openInvitationsDialog: function(onLoadOpListener, finishedCallBack) {
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
            "chrome://calendar/content/calendar-invitations-dialog.xul",
            "_blank",
            "chrome,titlebar,resizable",
            args);
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
    processJobQueue: function(queue, jobQueueFinishedCallBack) {
        // TODO: undo/redo
        function operationListener(mgr, queueCallback, oldItem_) {
            this.mInvitationsManager = mgr;
            this.mJobQueueFinishedCallBack = queueCallback;
            this.mOldItem = oldItem_;
        }
        operationListener.prototype = {
            QueryInterface: XPCOMUtils.generateQI([Components.interfaces.calIOperationListener]),
            onOperationComplete: function(aCalendar,
                                          aStatus,
                                          aOperationType,
                                          aId,
                                          aDetail) {
                if (Components.isSuccessCode(aStatus) &&
                    aOperationType == Components.interfaces.calIOperationListener.MODIFY) {
                    cal.itip.checkAndSend(aOperationType, aDetail, this.mOldItem);
                    this.mInvitationsManager.deleteItem(aDetail);
                    this.mInvitationsManager.addItem(aDetail);
                }
                this.mInvitationsManager.mJobsPending--;
                if (this.mInvitationsManager.mJobsPending == 0 &&
                    this.mJobQueueFinishedCallBack) {
                    this.mJobQueueFinishedCallBack();
                }
            },

            onGetResult: function(aCalendar,
                                  aStatus,
                                  aItemType,
                                  aDetail,
                                  aCount,
                                  aItems) {

            }
        };

        this.mJobsPending = 0;
        for (let i = 0; i < queue.length; i++) {
            let job = queue[i];
            let oldItem = job.oldItem;
            let newItem = job.newItem;
            switch (job.action) {
                case "modify":
                    this.mJobsPending++;
                    newItem.calendar.modifyItem(newItem,
                                                oldItem,
                                                new operationListener(this, jobQueueFinishedCallBack, oldItem));
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
    hasItem: function(item) {
        let hid = item.hashId;
        return this.mItemList.some(item_ => hid == item_.hashId);
    },

    /**
     * Adds an item to the internal item list.
     * XXXdbo       Please document these correctly.
     *
     * @param item      The item to add.
     */
    addItem: function(item) {
        let recInfo = item.recurrenceInfo;
        if (recInfo && !cal.isOpenInvitation(item)) {
            // scan exceptions:
            let ids = recInfo.getExceptionIds({});
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
    deleteItem: function(item) {
        let id = item.id;
        this.mItemList.filter(item_ => id != item_.id);
    },

    /**
     * Remove all items from the internal item list
     * XXXdbo       Please document these correctly.
     */
    deleteAllItems: function() {
        this.mItemList = [];
    },

    /**
     * Helper function to create a start date to search from. This date is the
     * current time with hour/minute/second set to zero.
     *
     * @return      Potential start date.
     */
    getStartDate: function() {
        let date = now();
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
    updateStartDate: function() {
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
    validateItem: function(item) {
        if (item.calendar instanceof Components.interfaces.calISchedulingSupport &&
            !item.calendar.isInvitation(item)) {
            return false; // exclude if organizer has invited himself
        }
        let start = item[calGetStartDateProp(item)] || item[calGetEndDateProp(item)];
        return (cal.isOpenInvitation(item) &&
                start.compare(this.mStartDate) >= 0);
    }
};
