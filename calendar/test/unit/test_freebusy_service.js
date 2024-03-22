/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var freebusy = Cc["@mozilla.org/calendar/freebusy-service;1"].getService(Ci.calIFreeBusyService);

function run_test() {
  do_calendar_startup(really_run_test);
}

function really_run_test() {
  test_found();
  test_noproviders();
  test_failure();
  test_cancel();
}

function test_found() {
  _clearProviders();

  equal(_countProviders(), 0);

  const provider1 = {
    id: 1,
    getFreeBusyIntervals(aCalId, aStart, aEnd, aTypes, aListener) {
      aListener.onResult(null, []);
    },
  };

  const provider2 = {
    id: 2,
    called: false,
    getFreeBusyIntervals(aCalId, aStart, aEnd, aTypes, aListener) {
      ok(!this.called);
      this.called = true;

      const interval = new cal.provider.FreeBusyInterval(
        aCalId,
        Ci.calIFreeBusyInterval.BUSY,
        aStart,
        aEnd
      );
      aListener.onResult(null, [interval]);
    },
  };
  provider2.wrappedJSObject = provider2;

  freebusy.addProvider(provider1);
  equal(_countProviders(), 1);
  freebusy.addProvider(provider2);
  equal(_countProviders(), 2);
  freebusy.removeProvider(provider1);
  equal(_countProviders(), 1);
  equal(_getFirstProvider().id, 2);

  const listener = {
    called: false,
    onResult(request, result) {
      equal(result.length, 1);
      equal(result[0].interval.start.icalString, "20120101T010101");
      equal(result[0].interval.end.icalString, "20120102T010101");
      equal(result[0].freeBusyType, Ci.calIFreeBusyInterval.BUSY);

      equal(result.length, 1);
      ok(provider2.called);
      do_test_finished();
    },
  };

  do_test_pending();
  freebusy.getFreeBusyIntervals(
    "email",
    cal.createDateTime("20120101T010101"),
    cal.createDateTime("20120102T010101"),
    Ci.calIFreeBusyInterval.BUSY_ALL,
    listener
  );
}

function test_noproviders() {
  _clearProviders();

  const listener = {
    onResult(request, result) {
      ok(!this.called);
      equal(result.length, 0);
      equal(request.status, 0);
      do_test_finished();
    },
  };

  do_test_pending();
  freebusy.getFreeBusyIntervals(
    "email",
    cal.createDateTime("20120101T010101"),
    cal.createDateTime("20120102T010101"),
    Ci.calIFreeBusyInterval.BUSY_ALL,
    listener
  );
}

function test_failure() {
  _clearProviders();

  const provider = {
    called: false,
    getFreeBusyIntervals(aCalId, aStart, aEnd, aTypes, aListener) {
      ok(!this.called);
      this.called = true;
      aListener.onResult({ status: Cr.NS_ERROR_FAILURE }, "notFound");
    },
  };

  const listener = {
    onResult(request, result) {
      ok(!this.called);
      equal(result.length, 0);
      equal(request.status, 0);
      ok(provider.called);
      do_test_finished();
    },
  };

  freebusy.addProvider(provider);

  do_test_pending();
  freebusy.getFreeBusyIntervals(
    "email",
    cal.createDateTime("20120101T010101"),
    cal.createDateTime("20120102T010101"),
    Ci.calIFreeBusyInterval.BUSY_ALL,
    listener
  );
}

function test_cancel() {
  _clearProviders();

  const provider = {
    QueryInterface: ChromeUtils.generateQI(["calIFreeBusyProvider", "calIOperation"]),
    getFreeBusyIntervals() {
      Services.tm.currentThread.dispatch(
        {
          run() {
            dump("Cancelling freebusy query...");
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

  const listener = {
    called: false,
    onResult(request, result) {
      equal(result, null);

      // If an exception occurs, the operation is not added to the opgroup
      ok(!provider.cancelCalled);
      do_test_finished();
    },
  };

  freebusy.addProvider(provider);

  do_test_pending();
  const operation = freebusy.getFreeBusyIntervals(
    "email",
    cal.createDateTime("20120101T010101"),
    cal.createDateTime("20120102T010101"),
    Ci.calIFreeBusyInterval.BUSY_ALL,
    listener
  );
}

// The following functions are not in the interface description and probably
// don't need to be. Make assumptions about the implementation instead.

function _clearProviders() {
  freebusy.wrappedJSObject.mProviders = new Set();
}

function _countProviders() {
  return freebusy.wrappedJSObject.mProviders.size;
}

function _getFirstProvider() {
  return [...freebusy.wrappedJSObject.mProviders][0].wrappedJSObject;
}
