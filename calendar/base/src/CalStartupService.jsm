/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["CalStartupService"];

/**
 * Helper function to asynchronously call a certain method on the objects passed
 * in 'services' in order (i.e wait until the first completes before calling the
 * second
 *
 * @param method        The method name to call. Usually startup/shutdown.
 * @param services      The array of service objects to call on.
 */
function callOrderedServices(method, services) {
  let service = services.shift();
  if (service) {
    service[method]({
      onResult() {
        callOrderedServices(method, services);
      },
    });
  }
}

function CalStartupService() {
  this.wrappedJSObject = this;
  this.setupObservers();
}

CalStartupService.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),
  classID: Components.ID("{2547331f-34c0-4a4b-b93c-b503538ba6d6}"),

  // Startup Service Methods

  /**
   * Sets up the needed observers for noticing startup/shutdown
   */
  setupObservers() {
    Services.obs.addObserver(this, "profile-after-change");
    Services.obs.addObserver(this, "profile-before-change");
    Services.obs.addObserver(this, "xpcom-shutdown");
  },

  started: false,

  /**
   * Gets the startup order of services. This is an array of service objects
   * that should be called in order at startup.
   *
   * @returns The startup order as an array.
   */
  getStartupOrder() {
    let self = this;

    let tzService = Cc["@mozilla.org/calendar/timezone-service;1"]
      .getService(Ci.calITimezoneService)
      .QueryInterface(Ci.calIStartupService);

    let calMgr = Cc["@mozilla.org/calendar/manager;1"]
      .getService(Ci.calICalendarManager)
      .QueryInterface(Ci.calIStartupService);

    // Localization service
    let locales = {
      startup(aCompleteListener) {
        let packaged = Services.locale.packagedLocales;
        let fileSrc = new L10nFileSource(
          "calendar",
          "app",
          packaged,
          "resource:///chrome/{locale}/locale/{locale}/calendar/"
        );
        L10nRegistry.getInstance().registerSources([fileSrc]);
        aCompleteListener.onResult(null, Cr.NS_OK);
      },
      shutdown(aCompleteListener) {
        aCompleteListener.onResult(null, Cr.NS_OK);
      },
    };

    // Notification object
    let notify = {
      startup(aCompleteListener) {
        self.started = true;
        Services.obs.notifyObservers(null, "calendar-startup-done");
        aCompleteListener.onResult(null, Cr.NS_OK);
      },
      shutdown(aCompleteListener) {
        // Argh, it would have all been so pretty! Since we just reverse
        // the array, the shutdown notification would happen before the
        // other shutdown calls. For lack of pretty code, I'm
        // leaving this out! Users can still listen to xpcom-shutdown.
        self.started = false;
        aCompleteListener.onResult(null, Cr.NS_OK);
      },
    };

    // We need to spin up the timezone service before the calendar manager
    // to ensure we have the timezones initialized. Make sure "notify" is
    // last in this array!
    return [locales, tzService, calMgr, notify];
  },

  /**
   * Observer notification callback
   */
  observe(aSubject, aTopic, aData) {
    switch (aTopic) {
      case "profile-after-change":
        callOrderedServices("startup", this.getStartupOrder());
        break;
      case "profile-before-change":
        callOrderedServices("shutdown", this.getStartupOrder().reverse());
        break;
      case "xpcom-shutdown":
        Services.obs.removeObserver(this, "profile-after-change");
        Services.obs.removeObserver(this, "profile-before-change");
        Services.obs.removeObserver(this, "xpcom-shutdown");
        break;
    }
  },
};
