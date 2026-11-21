/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { MockRegistrar } from "resource://testing-common/MockRegistrar.sys.mjs";

export class MailShutdown {
  /**
   * Unregisters all mocks, then posts the shutdown notifications in order,
   * to make sure a test shuts mailnews down properly (e.g. so that the
   * account manager closes and cleans up). This is semi-fake, since the profile
   * doesn't go away, but mimics the app closely enough. The xpcom-shutdown
   * notification is left to XPCOM itself.
   *
   * Meant to be called from a cleanup function.
   */
  static simulate() {
    MockRegistrar.unregisterAll();

    // Let anything no longer referenced be cleaned up first.
    Cu.forceGC();

    const cancelQuit = Cc["@mozilla.org/supports-PRBool;1"].createInstance(
      Ci.nsISupportsPRBool
    );
    Services.obs.notifyObservers(cancelQuit, "quit-application-requested");
    if (cancelQuit.data) {
      throw new Error("Cannot shut down: someone cancelled the quit request!");
    }

    // None of these are cancellable.
    for (const phase of [
      Services.startup.SHUTDOWN_PHASE_APPSHUTDOWNCONFIRMED,
      Services.startup.SHUTDOWN_PHASE_APPSHUTDOWNNETTEARDOWN,
      Services.startup.SHUTDOWN_PHASE_APPSHUTDOWNTEARDOWN,
      Services.startup.SHUTDOWN_PHASE_APPSHUTDOWN,
    ]) {
      Services.startup.advanceShutdownPhase(phase);
    }
  }
}
