/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Assert } from "resource://testing-common/Assert.sys.mjs";

const registrar = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
const contractID = "@mozilla.org/system-alerts-service;1";
let oldClassID;
const newClassID = Services.uuid.generateUUID();
const factory = {
  QueryInterface: ChromeUtils.generateQI(["nsIFactory"]),
  createInstance(iid) {
    return new MockAlertsServiceInstance().QueryInterface(iid);
  },
};

export const MockAlertsService = {
  /**
   * The alert most recently passed to `showAlert`.
   *
   * @type {nsIAlertNotification}
   */
  alert: null,

  /**
   * The alert listener most recently passed to `showAlert`.
   *
   * @type {nsIObserver}
   */
  listener: null,

  /**
   * A deferred Promise that resolves when `showAlert` is called.
   *
   * @type {PromiseWithResolvers}
   */
  _shownDeferred: null,

  /**
   * A deferred Promise that resolves when `closeAlert` is called.
   *
   * @type {PromiseWithResolvers}
   */
  _closedDeferred: null,

  /**
   * Register the mock alerts service with XPCOM.
   */
  init() {
    oldClassID = registrar.contractIDToCID(contractID);
    registrar.registerFactory(newClassID, "", contractID, factory);
  },

  /**
   * Unregister the mock alerts service with XPCOM.
   */
  cleanup() {
    registrar.unregisterFactory(newClassID, factory);
    registrar.registerFactory(oldClassID, "", contractID, null);
    this.reset();
  },

  /**
   * Forget previous alerts and reject any open Promises.
   */
  reset() {
    this.alert = null;
    this.listener = null;
    this._shownDeferred?.reject(new Error("Cleaning up for new scenario"));
    this._shownDeferred = null;
    this._closedDeferred?.reject(new Error("Cleaning up for new scenario"));
    this._closedDeferred = null;
  },

  /**
   * Get a Promise that resolves when `showAlert` is called.
   *
   * @returns {Promise}
   */
  promiseShown() {
    if (this.alert) {
      return Promise.resolve();
    }
    if (!this._shownDeferred) {
      this._shownDeferred = Promise.withResolvers();
    }
    return this._shownDeferred.promise;
  },

  /**
   * Get a Promise that resolves when `closeAlert` is called.
   *
   * @returns {Promise}
   */
  promiseClosed() {
    if (!this._closedDeferred) {
      this._closedDeferred = Promise.withResolvers();
    }
    return this._closedDeferred.promise;
  },

  /**
   * Simulate a click on a shown alert.
   *
   * @param {string} [actionToClick] - The name of the action button to "click"
   *   if given, otherwise the alert itself is "clicked".
   */
  clickAlert(actionToClick) {
    let action = null;
    if (typeof actionToClick == "string") {
      action = this.alert.actions.find(a => a.action == actionToClick);
      Assert.ok(action, "expected action should be defined");
    }

    this.listener.observe(action, "alertclickcallback", this.alert.cookie);
  },
};

/** @implements {nsIAlertsService} */
class MockAlertsServiceInstance {
  QueryInterface = ChromeUtils.generateQI(["nsIAlertsService"]);

  showAlert(alert, listener) {
    dump(`showAlert: ${alert.text}\n`);
    Assert.ok(
      !MockAlertsService.alert,
      "showAlert should not be called while an alert is showing"
    );
    MockAlertsService.alert = alert;
    MockAlertsService.listener = listener;
    MockAlertsService._shownDeferred?.resolve();
  }

  showAlertNotification(imageUrl, title, text) {
    dump(`showAlertNotification: ${text}\n`);
    Assert.ok(false, "unexpected call to showAlertNotification");
  }

  closeAlert(name) {
    dump(`closeAlert: ${name}\n`);
    if (MockAlertsService._closedDeferred) {
      if (name == MockAlertsService.alert.name) {
        MockAlertsService.listener.observe(
          null,
          "alertfinished",
          MockAlertsService.alert.cookie
        );
        MockAlertsService._closedDeferred?.resolve();
      }
    }
  }

  getHistory() {
    Assert.ok(false, "unexpected call to getHistory");
  }

  teardown() {
    if (!Services.startup.shuttingDown) {
      Assert.ok(false, "unexpected call to teardown");
    }
  }

  pbmTeardown() {
    Assert.ok(false, "unexpected call to pbmTeardown");
  }
}
