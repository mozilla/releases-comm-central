/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var HINT_EXACT_MATCH = Ci.calICalendarSearchProvider.HINT_EXACT_MATCH;
var search = Cc["@mozilla.org/calendar/calendarsearch-service;1"].getService(
  Ci.calICalendarSearchService
);

function run_test() {
  test_found();
  test_failure();
  test_cancel();
}

function test_found() {
  search.getProviders().forEach(search.removeProvider, search);

  equal(search.getProviders().length, 0);

  let provider1 = {
    id: 1,
    searchForCalendars() {},
  };

  let provider2 = {
    id: 2,
    called: false,
    searchForCalendars(aStr, aHint, aMax, aListener) {
      ok(!this.called);
      this.called = true;

      equal(aStr, "str");
      equal(aHint, HINT_EXACT_MATCH);
      equal(aMax, 0);

      let mockCalendar = { id: "test" };

      aListener.onResult(null, [mockCalendar]);
    },
  };
  provider2.wrappedJSObject = provider2;

  search.addProvider(provider1);
  equal(search.getProviders().length, 1);
  search.addProvider(provider2);
  equal(search.getProviders().length, 2);
  search.removeProvider(provider1);
  equal(search.getProviders().length, 1);
  equal(search.getProviders()[0].wrappedJSObject.id, 2);

  let listener = {
    called: false,
    onResult(request, result) {
      ok(!this.called);
      this.called = true;

      equal(result.length, 1);
      equal(result[0].id, "test");
    },
  };

  search.searchForCalendars("str", HINT_EXACT_MATCH, 0, listener);
  ok(listener.called);
  ok(provider2.called);
}

function test_failure() {
  search.getProviders().forEach(search.removeProvider, search);

  let provider = {
    searchForCalendars(aStr, aHint, aMax, aListener) {
      throw new Error("error");
    },
  };

  let listener = {
    called: false,
    onResult(request, result) {
      ok(!this.called);
      this.called = true;
      equal(result.length, 0);
    },
  };

  search.addProvider(provider);

  search.searchForCalendars("str", HINT_EXACT_MATCH, 0, listener);
  ok(listener.called);
}

function test_cancel() {
  search.getProviders().forEach(search.removeProvider, search);

  let provider = {
    QueryInterface: cal.generateQI([Ci.calICalendarSearchProvider, Ci.calIOperation]),
    searchForCalendars(aStr, aHint, aMax, aListener) {
      Services.tm.currentThread.dispatch(
        {
          run() {
            dump("Cancelling search...");
            operation.cancel();
          },
        },
        Ci.nsIEventTarget.DISPATCH_NORMAL
      );

      // No listener call, we emulate a long running search
      // Do return the operation though
      return this;
    },

    isPending: true,
    cancelCalled: false,
    status: Cr.NS_OK,
    cancel() {
      this.cancelCalled = true;
    },
  };

  let listener = {
    called: false,
    onResult(request, result) {
      equal(result, null);

      // If an exception occurs, the operation is not added to the opgroup
      ok(!provider.cancelCalled);
      do_test_finished();
    },
  };

  search.addProvider(provider);

  do_test_pending();
  let operation = search.searchForCalendars("str", HINT_EXACT_MATCH, 0, listener);
}
