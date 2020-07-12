/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { ComponentUtils } = ChromeUtils.import("resource://gre/modules/ComponentUtils.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

function calBackendLoader() {
  this.wrappedJSObject = this;
  try {
    this.loadBackend();
  } catch (e) {
    dump(`### Error loading backend:${e.filename || e.fileName}:${e.lineNumber}: ${e}\n`);
  }
}

calBackendLoader.prototype = {
  classID: Components.ID("{0314c271-7168-40fa-802e-83c8c46a557e}"),
  QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),

  loaded: false,

  observe() {
    // Nothing to do here, just need the entry so this is instantiated.
  },

  loadBackend() {
    if (this.loaded) {
      return;
    }

    if (Services.prefs.getBoolPref("calendar.icaljs", false)) {
      let contracts = {
        "@mozilla.org/calendar/datetime;1": "{36783242-ec94-4d8a-9248-d2679edd55b9}",
        "@mozilla.org/calendar/ics-service;1": "{c61cb903-4408-41b3-bc22-da0b27efdfe1}",
        "@mozilla.org/calendar/period;1": "{394a281f-7299-45f7-8b1f-cce21258972f}",
        "@mozilla.org/calendar/recurrence-rule;1": "{df19281a-5389-4146-b941-798cb93a7f0d}",
        "@mozilla.org/calendar/duration;1": "{7436f480-c6fc-4085-9655-330b1ee22288}",
      };

      // Load ical.js backend
      let scope = {};
      Services.scriptloader.loadSubScript("resource:///components/calICALJSComponents.js", scope);

      // Register the icaljs components. We used to unregisterFactory, but this caused all
      // sorts of problems. Just registering over it seems to work quite fine.
      let registrar = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
      for (let [contractID, classID] of Object.entries(contracts)) {
        let newClassID = Components.ID(classID);
        let newFactory = lazyFactoryFor(scope, newClassID);
        registrar.registerFactory(newClassID, "", contractID, newFactory);
      }

      // Set up ical.js to use non-strict (lenient) mode.
      let { ICAL } = ChromeUtils.import("resource:///modules/calendar/Ical.jsm");
      ICAL.design.strict = false;

      dump("[calBackendLoader] Using Thunderbird's ical.js backend\n");
    } else {
      dump("[calBackendLoader] Using Thunderbird's libical backend\n");
    }

    this.loaded = true;
  },
};

function lazyFactoryFor(backendScope, classID) {
  return {
    createInstance(aOuter, aIID) {
      let realFactory = backendScope.NSGetFactory(classID);
      return realFactory.createInstance(aOuter, aIID);
    },
    lockFactory(lock) {
      let realFactory = backendScope.NSGetFactory(classID);
      return realFactory.lockFactory(lock);
    },
  };
}

this.NSGetFactory = ComponentUtils.generateNSGetFactory([calBackendLoader]);
