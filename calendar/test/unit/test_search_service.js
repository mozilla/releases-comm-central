/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

var HINT_EXACT_MATCH = Components.interfaces.calICalendarSearchProvider.HINT_EXACT_MATCH;
var search = Components.classes["@mozilla.org/calendar/calendarsearch-service;1"]
                       .getService(Components.interfaces.calICalendarSearchService);

function run_test() {
    test_found();
    test_failure();
    test_cancel();
}

function test_found() {
    search.getProviders({}).forEach(search.removeProvider, search);

    equal(search.getProviders({}).length, 0);

    let provider1 = {
        id: 1,
        searchForCalendars: function() {}
    };

    let provider2 = {
        id: 2,
        called: false,
        searchForCalendars: function(aStr, aHint, aMax, aListener) {
            ok(!this.called)
            this.called = true;

            equal(aStr, "str");
            equal(aHint, HINT_EXACT_MATCH);
            equal(aMax, 0);

            let mockCalendar = {
                id: "test"
            };

            aListener.onResult(null, [mockCalendar]);
        }
    };
    provider2.wrappedJSObject = provider2;

    search.addProvider(provider1);
    equal(search.getProviders({}).length, 1);
    search.addProvider(provider2);
    equal(search.getProviders({}).length, 2);
    search.removeProvider(provider1);
    equal(search.getProviders({}).length, 1);
    equal(search.getProviders({})[0].wrappedJSObject.id, 2);

    let listener = {
        called: false,
        onResult: function(request, result) {
            ok(!this.called);
            this.called = true;

            equal(result.length, 1);
            equal(result[0].id, "test");

        }
    };

    let op = search.searchForCalendars("str", HINT_EXACT_MATCH, 0, listener);
    ok(listener.called);
    ok(provider2.called);
}

function test_failure() {
    search.getProviders({}).forEach(search.removeProvider, search);

    let provider = {
        searchForCalendars: function(aStr, aHint, aMax, aListener) {
            throw "error";
        }
    };

    let listener = {
        called: false,
        onResult: function(request, result) {
            ok(!this.called);
            this.called = true;
            equal(result.length, 0);
        }
    };

    search.addProvider(provider);

    let op = search.searchForCalendars("str", HINT_EXACT_MATCH, 0, listener);
    ok(listener.called);
}

function test_cancel() {
    search.getProviders({}).forEach(search.removeProvider, search);

    let provider = {
        QueryInterface: XPCOMUtils.generateQI([Components.interfaces.calICalendarSearchProvider, Components.interfaces.calIOperation]),
        searchForCalendars: function(aStr, aHint, aMax, aListener) {

            Services.tm.currentThread.dispatch({run: function() {
                dump("Cancelling search...");
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

    search.addProvider(provider);

    do_test_pending();
    let op = search.searchForCalendars("str", HINT_EXACT_MATCH, 0, listener);
}
