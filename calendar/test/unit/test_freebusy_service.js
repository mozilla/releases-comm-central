/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://calendar/modules/calProviderUtils.jsm");

const cIFI = Components.interfaces.calIFreeBusyInterval;
let freebusy = Components.classes["@mozilla.org/calendar/freebusy-service;1"]
                         .getService(Components.interfaces.calIFreeBusyService);

function run_test() {
    test_found();
    test_failure();
    test_cancel();
}

function test_found() {
    _clearProviders();

    do_check_eq(_countProviders(), 0);

    let provider1 = {
        id: 1,
        getFreeBusyIntervals: function() {
          aListener.onResult(null, []);
        }
    };

    let provider2 = {
        id: 2,
        called: false,
        getFreeBusyIntervals: function(aCalId, aStart, aEnd, aTypes, aListener) {
            do_check_false(this.called)
            this.called = true;

            let interval = new cal.FreeBusyInterval(aCalId, cIFI.BUSY, aStart, aEnd);
            aListener.onResult(null, [interval]);
        }
    };
    provider2.wrappedJSObject = provider2;

    freebusy.addProvider(provider1);
    do_check_eq(_countProviders(), 1);
    freebusy.addProvider(provider2);
    do_check_eq(_countProviders(), 2);
    freebusy.removeProvider(provider1);
    do_check_eq(_countProviders(), 1);
    do_check_eq(_getFirstProvider().id, 2);

    let listener = {
        called: false,
        onResult: function(request, result) {
            do_check_eq(result.length, 1);
            do_check_eq(result[0].interval.start.icalString, "20120101T010101");
            do_check_eq(result[0].interval.end.icalString, "20120102T010101");
            do_check_eq(result[0].freeBusyType, cIFI.BUSY);

            do_check_eq(result.length, 1);
            do_check_true(provider2.called);
            do_test_finished();
        }
    };

    do_test_pending();
    freebusy.getFreeBusyIntervals("email",
                                  cal.createDateTime("20120101T010101"),
                                  cal.createDateTime("20120102T010101"),
                                  cIFI.BUSY_ALL, listener);
}

function test_failure() {
    _clearProviders();

    let provider = {
        called: false,
        getFreeBusyIntervals: function(aCalId, aStart, aEnd, aTypes, aListener) {
            do_check_false(this.called);
            this.called = true;
            aListener.onResult({ status: Components.results.NS_ERROR_FAILURE }, "notFound");
        }
    };

    let listener = {
        onResult: function(request, result) {
            do_check_false(this.called);
            do_check_eq(result.length, 0);
            do_check_eq(request.status, 0);
            do_check_true(provider.called);
            do_test_finished();
        }
    };

    freebusy.addProvider(provider);

    do_test_pending();
    let op = freebusy.getFreeBusyIntervals("email",
                                           cal.createDateTime("20120101T010101"),
                                           cal.createDateTime("20120102T010101"),
                                           cIFI.BUSY_ALL,
                                           listener);
}

function test_cancel() {
    _clearProviders();

    let provider = {
        QueryInterface: XPCOMUtils.generateQI([Components.interfaces.calIFreeBusyProvider, Components.interfaces.calIOperation]),
        getFreeBusyIntervals: function(aCalId, aStart, aEnd, aTypes, aListener) {

            Services.tm.currentThread.dispatch({run: function() {
                dump("Cancelling freebusy query...");
                op.cancel();
            }}, Components.interfaces.nsIEventTarget.DISPATCH_NORMAL);

            // No listener call, we emulate a long running search
            // Do return the operation though
            return this;
        },

        isPending: true,
        cancelCalled: false,
        status: Components.results.NS_OK,
        cancel: function() {
            this.cancelCalled = true;
        },
    };

    let listener = {
        called: false,
        onResult: function(request, result) {
            do_check_eq(result, null);

            // If an exception occurs, the operation is not added to the opgroup
            do_check_false(provider.cancelCalled);
            do_test_finished();
        }
    };

    freebusy.addProvider(provider);

    do_test_pending();
    let op = freebusy.getFreeBusyIntervals("email",
                                           cal.createDateTime("20120101T010101"),
                                           cal.createDateTime("20120102T010101"),
                                           cIFI.BUSY_ALL,
                                           listener);
}

// The following functions are not in the interface description and probably
// don't need to be. Make assumptions about the implementation instead.

function _clearProviders() {
    freebusy.wrappedJSObject.mProviders = new calInterfaceBag(Components.interfaces.calIFreeBusyProvider);
}

function _countProviders() {
    return freebusy.wrappedJSObject.mProviders.interfaceArray.length;
}

function _getFirstProvider() {
    return freebusy.wrappedJSObject.mProviders.interfaceArray[0].wrappedJSObject;
}
