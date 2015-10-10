/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://calendar/modules/calProviderUtils.jsm");

var cIFI = Components.interfaces.calIFreeBusyInterval;
var freebusy = Components.classes["@mozilla.org/calendar/freebusy-service;1"]
                         .getService(Components.interfaces.calIFreeBusyService);

function run_test() {
    test_found();
    test_failure();
    test_cancel();
}

function test_found() {
    _clearProviders();

    equal(_countProviders(), 0);

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
            ok(!this.called)
            this.called = true;

            let interval = new cal.FreeBusyInterval(aCalId, cIFI.BUSY, aStart, aEnd);
            aListener.onResult(null, [interval]);
        }
    };
    provider2.wrappedJSObject = provider2;

    freebusy.addProvider(provider1);
    equal(_countProviders(), 1);
    freebusy.addProvider(provider2);
    equal(_countProviders(), 2);
    freebusy.removeProvider(provider1);
    equal(_countProviders(), 1);
    equal(_getFirstProvider().id, 2);

    let listener = {
        called: false,
        onResult: function(request, result) {
            equal(result.length, 1);
            equal(result[0].interval.start.icalString, "20120101T010101");
            equal(result[0].interval.end.icalString, "20120102T010101");
            equal(result[0].freeBusyType, cIFI.BUSY);

            equal(result.length, 1);
            ok(provider2.called);
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
            ok(!this.called);
            this.called = true;
            aListener.onResult({ status: Components.results.NS_ERROR_FAILURE }, "notFound");
        }
    };

    let listener = {
        onResult: function(request, result) {
            ok(!this.called);
            equal(result.length, 0);
            equal(request.status, 0);
            ok(provider.called);
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
            equal(result, null);

            // If an exception occurs, the operation is not added to the opgroup
            ok(!provider.cancelCalled);
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
