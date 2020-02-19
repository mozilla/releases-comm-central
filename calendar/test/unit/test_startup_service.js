/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function run_test() {
  let ssvc = Cc["@mozilla.org/calendar/startup-service;1"].getService(Ci.nsIObserver);

  let first = {
    startup(aListener) {
      second.canStart = true;
      aListener.onResult(null, Cr.NS_OK);
    },
    shutdown(aListener) {
      ok(this.canStop);
      aListener.onResult(null, Cr.NS_OK);
    },
  };

  let second = {
    startup(aListener) {
      ok(this.canStart);
      aListener.onResult(null, Cr.NS_OK);
    },
    shutdown(aListener) {
      first.canStop = true;
      aListener.onResult(null, Cr.NS_OK);
    },
  };

  // Change the startup order so we can test our services
  let oldStartupOrder = ssvc.wrappedJSObject.getStartupOrder;
  ssvc.wrappedJSObject.getStartupOrder = function() {
    let origOrder = oldStartupOrder.call(this);

    let notify = origOrder[origOrder.length - 1];
    return [first, second, notify];
  };

  // Pretend a startup run
  ssvc.observe(null, "profile-after-change", null);
  ok(second.canStart);

  // Pretend a stop run
  ssvc.observe(null, "profile-before-change", null);
  ok(first.canStop);
}
