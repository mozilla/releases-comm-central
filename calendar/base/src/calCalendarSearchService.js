/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

function calCalendarSearchListener(numOperations, finalListener) {
  this.mFinalListener = finalListener;
  this.mNumOperations = numOperations;
  this.mResults = [];

  this.opGroup = new cal.data.OperationGroup(() => {
    this.notifyResult(null);
  });
}
calCalendarSearchListener.prototype = {
  mFinalListener: null,
  mNumOperations: 0,
  opGroup: null,

  notifyResult: function(result) {
    let listener = this.mFinalListener;
    if (listener) {
      if (!this.opGroup.isPending) {
        this.mFinalListener = null;
      }
      listener.onResult(this.opGroup, result);
    }
  },

  // calIGenericOperationListener:
  onResult: function(aOperation, aResult) {
    if (this.mFinalListener) {
      if (!aOperation || !aOperation.isPending) {
        --this.mNumOperations;
        if (this.mNumOperations == 0) {
          this.opGroup.notifyCompleted();
        }
      }
      if (aResult) {
        this.notifyResult(aResult);
      }
    }
  },
};

function calCalendarSearchService() {
  this.wrappedJSObject = this;
  this.mProviders = new Set();
}
var calCalendarSearchServiceClassID = Components.ID("{f5f743cd-8997-428e-bc1b-644e73f61203}");
var calCalendarSearchServiceInterfaces = [
  Ci.calICalendarSearchProvider,
  Ci.calICalendarSearchService,
];
calCalendarSearchService.prototype = {
  mProviders: null,

  classID: calCalendarSearchServiceClassID,
  QueryInterface: cal.generateQI(calCalendarSearchServiceInterfaces),
  classInfo: cal.generateCI({
    classID: calCalendarSearchServiceClassID,
    contractID: "@mozilla.org/calendar/calendarsearch-service;1",
    classDescription: "Calendar Search Service",
    interfaces: calCalendarSearchServiceInterfaces,
    flags: Ci.nsIClassInfo.SINGLETON,
  }),

  // calICalendarSearchProvider:
  searchForCalendars: function(aString, aHints, aMaxResults, aListener) {
    let groupListener = new calCalendarSearchListener(this.mProviders.size, aListener);
    for (let provider of this.mProviders.values()) {
      try {
        groupListener.opGroup.add(
          provider.searchForCalendars(aString, aHints, aMaxResults, groupListener)
        );
      } catch (exc) {
        Cu.reportError(exc);
        groupListener.onResult(null, []); // dummy to adopt mNumOperations
      }
    }
    return groupListener.opGroup;
  },

  // calICalendarSearchService:
  getProviders: function() {
    return [...this.mProviders];
  },
  addProvider: function(aProvider) {
    this.mProviders.add(aProvider.QueryInterface(Ci.calICalendarSearchProvider));
  },
  removeProvider: function(aProvider) {
    this.mProviders.delete(aProvider.QueryInterface(Ci.calICalendarSearchProvider));
  },
};
