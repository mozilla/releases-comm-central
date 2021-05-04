/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { PromiseUtils } = ChromeUtils.import("resource://gre/modules/PromiseUtils.jsm");

/*
 * Asynchronous tools for handling calendar operations
 */

// NOTE: This module should not be loaded directly, it is available when
// including calUtils.jsm under the cal.async namespace.

const EXPORTED_SYMBOLS = ["calasync"]; /* exported calasync */

var cIOL = Ci.calIOperationListener;
var cIC = Ci.calICalendar;

var promisifyProxyHandler = {
  promiseOperation(target, name, args) {
    let deferred = PromiseUtils.defer();
    let listener = calasync.promiseOperationListener(deferred);
    args.push(listener);
    target[name](...args);
    return deferred.promise;
  },
  get(target, name) {
    switch (name) {
      // calICalendar methods
      case "adoptItem":
      case "addItem":
      case "modifyItem":
      case "deleteItem":
      case "getItem":
      case "getItems":
        return (...args) => this.promiseOperation(target, name, args);
      // calIOfflineStorage methods
      case "addOfflineItem":
      case "modifyOfflineItem":
      case "deleteOfflineItem":
      case "getOfflineItemFlag":
      case "resetItemOfflineFlag": {
        let offline = target.QueryInterface(Ci.calIOfflineStorage);
        return (...args) => this.promiseOperation(offline, name, args);
      }

      // Special getAllItems shortcut
      case "getAllItems":
        return () =>
          this.promiseOperation(target, "getItems", [cIC.ITEM_FILTER_ALL_ITEMS, 0, null, null]);
      case "proxyTarget":
        return target;
      default:
        return target[name];
    }
  },
};

var calasync = {
  /**
   * Creates a proxy to the given calendar where the CRUD operations are replaced
   * with versions that return a promise and don't take a listener.
   *
   * Before:
   *   calendar.addItem(item, {
   *     onGetResult: function() {},
   *     onOperationComplete: function (c,status,t,c,detail) {
   *       if (Components.isSuccessCode(status)) {
   *         handleSuccess(detail);
   *       } else {
   *         handleFailure(status);
   *       }
   *     }
   *   });
   *
   * After:
   *   let pcal = promisifyCalendar(calendar);
   *   pcal.addItem(item).then(handleSuccess, handleFailure);
   *
   * Bonus methods in addition:
   *   pcal.getAllItems()  // alias for getItems without any filters
   *
   * IMPORTANT: Don't pass this around thinking its like an xpcom calICalendar,
   * otherwise code might indefinitely wait for the listener to return or there
   * will be complaints that an argument is missing.
   */
  promisifyCalendar(aCalendar) {
    return new Proxy(aCalendar, promisifyProxyHandler);
  },
  /**
   * Create an operation listener (calIOperationListener) that resolves when
   * the operation succeeds. Note this listener will collect the items, so it
   * might not be a good idea in a situation where a lot of items will be
   * retrieved.
   *
   * Standalone Usage:
   *   function promiseAddItem(aItem) {
   *     let deferred = PromiseUtils.defer();
   *     let listener = cal.async.promiseOperationListener(deferred);
   *     aItem.calendar.addItem(aItem, listener);
   *     return deferred.promise;
   *   }
   *
   * See also promisifyCalendar, where the above can be replaced with:
   *   function promiseAddItem(aItem) {
   *     let calendar = cal.async.promisifyCalendar(aItem.calendar);
   *     return calendar.addItem(aItem);
   *   }
   */
  promiseOperationListener(deferred) {
    return {
      QueryInterface: ChromeUtils.generateQI(["calIOperationListener"]),
      items: [],
      itemStatus: Cr.NS_OK,
      onGetResult(aCalendar, aStatus, aItemType, aDetail, aItems) {
        this.itemStatus = aStatus;
        if (Components.isSuccessCode(aStatus)) {
          this.items = this.items.concat(aItems);
        } else {
          this.itemSuccess = aStatus;
        }
      },

      onOperationComplete(aCalendar, aStatus, aOpType, aId, aDetail) {
        if (!Components.isSuccessCode(aStatus)) {
          // This function has failed, reject with the status
          deferred.reject(aStatus);
        } else if (!Components.isSuccessCode(this.itemStatus)) {
          // onGetResult has failed, reject with its status
          deferred.reject(this.itemStatus);
        } else if (aOpType == cIOL.GET) {
          // Success of a GET operation: resolve with array of
          // resulting items.
          deferred.resolve(this.items);
        } else {
          /* ADD,MODIFY,DELETE: resolve with 1 item */
          // Success of an ADD MODIFY or DELETE operation, resolve
          // with the one item that was processed.
          deferred.resolve(aDetail);
        }
      },
    };
  },
};
