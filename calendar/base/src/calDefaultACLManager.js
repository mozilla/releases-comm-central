/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

/* calDefaultACLManager */
function calDefaultACLManager() {
  this.mCalendarEntries = {};
}

calDefaultACLManager.prototype = {
  QueryInterface: ChromeUtils.generateQI([Ci.calICalendarACLManager]),
  classID: Components.ID("{7463258c-6ef3-40a2-89a9-bb349596e927}"),

  mCalendarEntries: null,

  /* calICalendarACLManager */
  _getCalendarEntryCached: function(aCalendar) {
    let calUri = aCalendar.uri.spec;
    if (!(calUri in this.mCalendarEntries)) {
      this.mCalendarEntries[calUri] = new calDefaultCalendarACLEntry(this, aCalendar);
    }

    return this.mCalendarEntries[calUri];
  },
  getCalendarEntry: function(aCalendar, aListener) {
    let entry = this._getCalendarEntryCached(aCalendar);
    aListener.onOperationComplete(aCalendar, Cr.NS_OK, Ci.calIOperationListener.GET, null, entry);
  },
  getItemEntry: function(aItem) {
    let calEntry = this._getCalendarEntryCached(aItem.calendar);
    return new calDefaultItemACLEntry(calEntry);
  },
};

function calDefaultCalendarACLEntry(aMgr, aCalendar) {
  this.mACLManager = aMgr;
  this.mCalendar = aCalendar;
}

calDefaultCalendarACLEntry.prototype = {
  QueryInterface: ChromeUtils.generateQI([Ci.calICalendarACLEntry]),

  mACLManager: null,

  /* calICalendarACLCalendarEntry */
  get aclManager() {
    return this.mACLManager;
  },

  hasAccessControl: false,
  userIsOwner: true,
  userCanAddItems: true,
  userCanDeleteItems: true,

  _getIdentities: function() {
    let identities = [];
    cal.email.iterateIdentities(id => identities.push(id));
    return identities;
  },

  getUserAddresses: function() {
    let identities = this.getUserIdentities();
    let addresses = identities.map(id => id.email);
    return addresses;
  },

  getUserIdentities: function() {
    let identity = cal.provider.getEmailIdentityOfCalendar(this.mCalendar);
    if (identity) {
      return [identity];
    } else {
      return this._getIdentities();
    }
  },
  getOwnerIdentities: function() {
    return this._getIdentities();
  },

  refresh: function() {},
};

function calDefaultItemACLEntry(aCalendarEntry) {
  this.calendarEntry = aCalendarEntry;
}

calDefaultItemACLEntry.prototype = {
  QueryInterface: ChromeUtils.generateQI([Ci.calIItemACLEntry]),

  /* calIItemACLEntry */
  calendarEntry: null,
  userCanModify: true,
  userCanRespond: true,
  userCanViewAll: true,
  userCanViewDateAndTime: true,
};

/** Module Registration */
this.NSGetFactory = XPCOMUtils.generateNSGetFactory([calDefaultACLManager]);
