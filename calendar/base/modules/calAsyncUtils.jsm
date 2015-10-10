/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://calendar/modules/calUtils.jsm");
Components.utils.import("resource://gre/modules/Promise.jsm");
Components.utils.import("resource://gre/modules/PromiseUtils.jsm");
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

/*
 * Asynchronous tools for handling calendar operations.
 */

this.EXPORTED_SYMBOLS = ["cal"]; // even though it's defined in calUtils.jsm, import needs this
var cIOL = Components.interfaces.calIOperationListener;
var cIC = Components.interfaces.calICalendar;

var promisifyProxyHandler = {
    promiseOperation: function(target, name, args) {
        let deferred = PromiseUtils.defer();
        let listener = cal.async.promiseOperationListener(deferred);
        args.push(listener);
        target[name].apply(target, args);
        return deferred.promise;
    },
    get: function(target, name) {
        switch (name) {
            case "adoptItem":
            case "addItem":
            case "modifyItem":
            case "deleteItem":
            case "getItem":
            case "getItems":
                return (...args) => this.promiseOperation(target, name, args);
            case "getAllItems":
                return () => this.promiseOperation(target, "getItems", [cIC.ITEM_FILTER_ALL_ITEMS, 0, null, null]);
            default:
                return target[name];
        }
    }
};

cal.async = {
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
    promisifyCalendar: function(aCalendar) {
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
    promiseOperationListener: function(deferred) {
        return {
            QueryInterface: XPCOMUtils.generateQI([Components.interfaces.calIOperationListener]),
            items: [],
            itemStatus: Components.results.NS_OK,
            onGetResult: function(aCalendar, aStatus, aItemType, aDetail,
                                  aCount, aItems) {
                this.itemStatus = aStatus;
                if (Components.isSuccessCode(aStatus)) {
                    this.items = this.items.concat(aItems);
                } else {
                    this.itemSuccess = aStatus;
                }
            },

            onOperationComplete: function(aCalendar, aStatus, aOpType, aId, aDetail) {
                if (!Components.isSuccessCode(aStatus)) {
                    // This function has failed, reject with the status
                    deferred.reject(aStatus)
                } else if (!Components.isSuccessCode(this.itemStatus)) {
                    // onGetResult has failed, reject with its status
                    deferred.reject(this.itemStatus);
                } else if (aOpType == cIOL.GET) {
                     // Success of a GET operation: resolve with array of
                     // resulting items.
                    deferred.resolve(this.items);
                } else { /* ADD,MODIFY,DELETE: resolve with 1 item */
                    // Success of an ADD MODIFY or DELETE operation, resolve
                    // with the one item that was processed.
                    deferred.resolve(aDetail)
                }
            }
        }
    }
};
