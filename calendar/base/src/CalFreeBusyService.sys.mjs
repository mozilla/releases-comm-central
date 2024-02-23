/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

function CalFreeBusyListener(numOperations, finalListener) {
  this.mFinalListener = finalListener;
  this.mNumOperations = numOperations;

  this.opGroup = new cal.data.OperationGroup(() => {
    this.notifyResult(null);
  });
}
CalFreeBusyListener.prototype = {
  QueryInterface: ChromeUtils.generateQI(["calIGenericOperationListener"]),

  mFinalListener: null,
  mNumOperations: 0,
  opGroup: null,

  notifyResult(result) {
    const listener = this.mFinalListener;
    if (listener) {
      if (!this.opGroup.isPending) {
        this.mFinalListener = null;
      }
      listener.onResult(this.opGroup, result);
    }
  },

  // calIGenericOperationListener:
  onResult(aOperation, aResult) {
    if (this.mFinalListener) {
      if (!aOperation || !aOperation.isPending) {
        --this.mNumOperations;
        if (this.mNumOperations <= 0) {
          this.opGroup.notifyCompleted();
        }
      }
      const opStatus = aOperation ? aOperation.status : Cr.NS_OK;
      if (Components.isSuccessCode(opStatus) && aResult && Array.isArray(aResult)) {
        this.notifyResult(aResult);
      } else {
        this.notifyResult([]);
      }
    }
  },
};

export function CalFreeBusyService() {
  this.wrappedJSObject = this;
  this.mProviders = new Set();
}

CalFreeBusyService.prototype = {
  QueryInterface: ChromeUtils.generateQI(["calIFreeBusyProvider", "calIFreeBusyService"]),
  classID: Components.ID("{29c56cd5-d36e-453a-acde-0083bd4fe6d3}"),

  mProviders: null,

  // calIFreeBusyProvider:
  getFreeBusyIntervals(aCalId, aRangeStart, aRangeEnd, aBusyTypes, aListener) {
    const groupListener = new CalFreeBusyListener(this.mProviders.size, aListener);
    if (this.mProviders.size == 0) {
      groupListener.onResult(null, []);
    }
    for (const provider of this.mProviders.values()) {
      const operation = provider.getFreeBusyIntervals(
        aCalId,
        aRangeStart,
        aRangeEnd,
        aBusyTypes,
        groupListener
      );
      groupListener.opGroup.add(operation);
    }
    return groupListener.opGroup;
  },

  // calIFreeBusyService:
  addProvider(aProvider) {
    this.mProviders.add(aProvider.QueryInterface(Ci.calIFreeBusyProvider));
  },
  removeProvider(aProvider) {
    this.mProviders.delete(aProvider.QueryInterface(Ci.calIFreeBusyProvider));
  },
};
