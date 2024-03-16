/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

var { CalReadableStreamFactory } = ChromeUtils.importESModule(
  "resource:///modules/CalReadableStreamFactory.sys.mjs"
);

/* exported openInvitationsDialog, setUpInvitationsManager,
 *          tearDownInvitationsManager
 */

/* eslint-enable valid-jsdoc */

var gInvitationsManager = null;

/**
 * Return a cached instance of the invitations manager
 *
 * @returns {InvitationsManager} The invitations manager instance.
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
  getInvitationsManager().scheduleInvitationsUpdate(firstDelay);
}

function rescheduleInvitationsUpdate(firstDelay) {
  getInvitationsManager().cancelInvitationsUpdate();
  scheduleInvitationsUpdate(firstDelay);
}

function openInvitationsDialog() {
  getInvitationsManager().cancelInvitationsUpdate();
  getInvitationsManager().openInvitationsDialog();
}

function setUpInvitationsManager() {
  scheduleInvitationsUpdate(FIRST_DELAY_STARTUP);
  cal.manager.addObserver(gInvitationsCalendarManagerObserver);
}

function tearDownInvitationsManager() {
  cal.manager.removeObserver(gInvitationsCalendarManagerObserver);
}

/**
 * The invitations manager class constructor
 *
 * XXX do we really need this to be an instance?
 *
 * @class
 */
function InvitationsManager() {
  this.mItemList = [];
  this.mStartDate = null;
  this.mTimer = null;

  window.addEventListener("unload", () => {
    // Unload handlers get removed automatically
    this.cancelInvitationsUpdate();
  });
}

InvitationsManager.prototype = {
  mItemList: null,
  mStartDate: null,
  mTimer: null,
  mPendingRequests: null,

  /**
   * Schedule an update for the invitations manager asynchronously.
   *
   * @param {integer} firstDelay - The timeout before the operation should start.
   */
  scheduleInvitationsUpdate(firstDelay) {
    this.cancelInvitationsUpdate();

    this.mTimer = setTimeout(async () => {
      if (Services.prefs.getBoolPref("calendar.invitations.autorefresh.enabled", true)) {
        this.mTimer = setInterval(
          async () => this._doInvitationsUpdate(),
          Services.prefs.getIntPref("calendar.invitations.autorefresh.timeout", 3) * 60000
        );
      }
      await this._doInvitationsUpdate();
    }, firstDelay);
  },

  async _doInvitationsUpdate() {
    let items;
    try {
      items = await cal.iterate.streamToArray(this.getInvitations());
    } catch (e) {
      cal.ERROR(e);
    }
    this.toggleInvitationsPanel(items);
  },

  /**
   * Toggles the display of the invitations panel in the status bar depending
   * on the number of invitation items found.
   *
   * @param {?calIItemBase[]} items - The invitations found, if empty or not
   *   provided, the panel will not be displayed.
   */
  toggleInvitationsPanel(items) {
    const invitationsBox = document.getElementById("calendar-invitations-panel");
    if (items) {
      const count = items.length;
      const value = cal.l10n.getLtnString("invitationsLink.label", [count]);
      document.getElementById("calendar-invitations-label").value = value;
      if (count) {
        invitationsBox.removeAttribute("hidden");
        return;
      }
    }

    invitationsBox.setAttribute("hidden", "true");
  },

  /**
   * Cancel pending any pending invitations update.
   */
  cancelInvitationsUpdate() {
    clearTimeout(this.mTimer);
  },

  /**
   * Cancel any pending queries for invitations.
   */
  async cancelPendingRequests() {
    return this.mPendingRequests && this.mPendingRequests.cancel();
  },

  /**
   * Retrieve invitations from all calendars. Notify all passed
   * operation listeners.
   *
   * @returns {ReadableStream<calIItemBase>}
   */
  getInvitations() {
    this.updateStartDate();
    this.deleteAllItems();

    const streams = [];
    for (let calendar of cal.manager.getCalendars()) {
      if (!cal.acl.isCalendarWritable(calendar) || calendar.getProperty("disabled")) {
        continue;
      }

      // temporary hack unless calCachedCalendar supports REQUEST_NEEDS_ACTION filter:
      calendar = calendar.getProperty("cache.uncachedCalendar");
      if (!calendar) {
        continue;
      }

      const endDate = this.mStartDate.clone();
      endDate.year += 1;
      streams.push(
        calendar.getItems(
          Ci.calICalendar.ITEM_FILTER_REQUEST_NEEDS_ACTION |
            Ci.calICalendar.ITEM_FILTER_TYPE_ALL |
            // we need to retrieve by occurrence to properly filter exceptions,
            // should be fixed with bug 416975
            Ci.calICalendar.ITEM_FILTER_CLASS_OCCURRENCES,
          0,
          this.mStartDate,
          endDate /* we currently cannot pass null here, because of bug 416975 */
        )
      );
    }

    const self = this;
    const mHandledItems = {};
    return CalReadableStreamFactory.createReadableStream({
      async start(controller) {
        await self.cancelPendingRequests();

        self.mPendingRequests = cal.iterate.streamValues(
          CalReadableStreamFactory.createCombinedReadableStream(streams)
        );

        for await (const items of self.mPendingRequests) {
          for (let item of items) {
            // we need to retrieve by occurrence to properly filter exceptions,
            // should be fixed with bug 416975
            item = item.parentItem;
            const hid = item.hashId;
            if (!mHandledItems[hid]) {
              mHandledItems[hid] = true;
              self.addItem(item);
            }
          }
        }

        self.mItemList.sort((a, b) => {
          return a.startDate.compare(b.startDate);
        });

        controller.enqueue(self.mItemList.slice());
        controller.close();
      },
      close() {
        self.mPendingRequests = null;
      },
    });
  },

  /**
   * Open the invitations dialog, non-modal.
   *
   * XXX Passing these listeners in instead of keeping them in the window
   * sounds fishy to me. Maybe there is a more encapsulated solution.
   */
  openInvitationsDialog() {
    const args = {};
    args.queue = [];
    args.finishedCallBack = () => this.scheduleInvitationsUpdate(FIRST_DELAY_RESCHEDULE);
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
   * @param {calIItemBase[]} queue - The array of objects to process.
   */
  async processJobQueue(queue) {
    // TODO: undo/redo
    for (let i = 0; i < queue.length; i++) {
      const job = queue[i];
      const oldItem = job.oldItem;
      const newItem = job.newItem;
      switch (job.action) {
        case "modify": {
          const item = await newItem.calendar.modifyItem(newItem, oldItem);
          cal.itip.checkAndSend(Ci.calIOperationListener.MODIFY, item, oldItem);
          this.deleteItem(item);
          this.addItem(item);
          break;
        }
        default:
          break;
      }
    }
  },

  /**
   * Checks if the internal item list contains the given item
   *
   * @param {calIItemBase} item - The item to look for.
   * @returns {boolean} A boolean value indicating if the item was found.
   */
  hasItem(item) {
    const hid = item.hashId;
    return this.mItemList.some(item_ => hid == item_.hashId);
  },

  /**
   * Adds an item to the internal item list.
   *
   * @param {calIItemBase} item - The item to add.
   */
  addItem(item) {
    const recInfo = item.recurrenceInfo;
    if (recInfo && !cal.itip.isOpenInvitation(item)) {
      // scan exceptions:
      const ids = recInfo.getExceptionIds();
      for (const id of ids) {
        const ex = recInfo.getExceptionFor(id);
        if (ex && this.validateItem(ex) && !this.hasItem(ex)) {
          this.mItemList.push(ex);
        }
      }
    } else if (this.validateItem(item) && !this.hasItem(item)) {
      this.mItemList.push(item);
    }
  },

  /**
   * Removes an item from the internal item list.
   *
   * @param {calIItemBase} item - The item to remove.
   */
  deleteItem(item) {
    const id = item.id;
    this.mItemList.filter(item_ => id != item_.id);
  },

  /**
   * Remove all items from the internal item list.
   */
  deleteAllItems() {
    this.mItemList = [];
  },

  /**
   * Helper function to create a start date to search from. This date is the
   * current time with hour/minute/second set to zero.
   *
   * @returns {calIDateTime} The potential start date.
   */
  getStartDate() {
    const date = cal.dtz.now();
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
      const startDate = this.getStartDate();
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
   * @param {calIItemBase} item - The item to check
   * @returns {boolean} A boolean indicating if the item is a valid invitation.
   */
  validateItem(item) {
    if (item.calendar instanceof Ci.calISchedulingSupport && !item.calendar.isInvitation(item)) {
      return false; // exclude if organizer has invited himself
    }
    const start = item[cal.dtz.startDateProp(item)] || item[cal.dtz.endDateProp(item)];
    return cal.itip.isOpenInvitation(item) && start.compare(this.mStartDate) >= 0;
  },
};
