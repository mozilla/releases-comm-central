/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

/** @implements {calIGenericOperationListener} */
class CalFreeBusyListener {
  QueryInterface = ChromeUtils.generateQI(["calIGenericOperationListener"]);

  mFinalListener = null;
  mNumOperations = 0;
  opGroup = null;

  constructor(numOperations, finalListener) {
    this.mFinalListener = finalListener;
    this.mNumOperations = numOperations;

    this.opGroup = new cal.data.OperationGroup(() => {
      this.notifyResult(null);
    });
  }

  notifyResult(result) {
    const listener = this.mFinalListener;
    if (listener) {
      if (!this.opGroup.isPending) {
        this.mFinalListener = null;
      }
      listener.onResult(this.opGroup, result);
    }
  }

  /** @see calIGenericOperationListener */
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
  }
}

/**
 * @implements {calIFreeBusyProvider}
 * @implements {calIFreeBusyService}
 */
export const CalFreeBusyService = new (class {
  QueryInterface = ChromeUtils.generateQI(["calIFreeBusyProvider", "calIFreeBusyService"]);
  classID = Components.ID("{29c56cd5-d36e-453a-acde-0083bd4fe6d3}");

  mProviders = null;

  constructor() {
    this.wrappedJSObject = this;
    this.mProviders = new Set();
  }

  /** @see {calIFreeBusyProvider} */
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
  }

  /** @see {calIFreeBusyService} */
  addProvider(aProvider) {
    this.mProviders.add(aProvider.QueryInterface(Ci.calIFreeBusyProvider));
  }

  /** @see {calIFreeBusyService} */
  removeProvider(aProvider) {
    this.mProviders.delete(aProvider.QueryInterface(Ci.calIFreeBusyProvider));
  }
})();
export { CalFreeBusyService as freeBusyService };
