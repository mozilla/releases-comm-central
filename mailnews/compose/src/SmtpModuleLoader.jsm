/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let { ComponentUtils } = ChromeUtils.import(
  "resource://gre/modules/ComponentUtils.jsm"
);
let { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

const EXPORTED_SYMBOLS = ["SmtpModuleLoader"];

/**
 * Determine whether to use nsSmtpService.cpp or SmtpService.jsm. When
 * `mailnews.smtp.jsmodule` is `true`, use SmtpService.jsm.
 */
function SmtpModuleLoader() {
  try {
    this.loadModule();
  } catch (e) {
    Cu.reportError(e);
  }
}

SmtpModuleLoader.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),

  observe() {
    // Nothing to do here, just need the entry so this is instantiated.
  },

  loadModule() {
    if (Services.prefs.getBoolPref("mailnews.smtp.jsmodule", false)) {
      let registrar = Components.manager.QueryInterface(
        Ci.nsIComponentRegistrar
      );

      // Load SmtpServer.jsm.
      let serverScope = ChromeUtils.import(
        "resource:///modules/SmtpServer.jsm"
      );
      serverScope.NSGetFactory = ComponentUtils.generateNSGetFactory([
        serverScope.SmtpServer,
      ]);

      // Register SmtpServer.jsm.
      let serverClassId = Components.ID(
        "{3a75f5ea-651e-4696-9813-848c03da8bbd}"
      );
      registrar.registerFactory(
        serverClassId,
        "",
        "@mozilla.org/messenger/smtp/server;1",
        lazyFactoryFor(serverScope, serverClassId)
      );

      // Load SmtpService.jsm.
      let serviceScope = ChromeUtils.import(
        "resource:///modules/SmtpService.jsm"
      );
      serviceScope.NSGetFactory = ComponentUtils.generateNSGetFactory([
        serviceScope.SmtpService,
      ]);
      // Register SmtpService.jsm.
      let serviceClassId = Components.ID(
        "{acda6039-8b17-46c1-a8ed-ad50aa80f412}"
      );
      registrar.registerFactory(
        serviceClassId,
        "",
        "@mozilla.org/messengercompose/smtp;1",
        lazyFactoryFor(serviceScope, serviceClassId)
      );

      dump("[SmtpModuleLoader] Using SmtpService.jsm\n");
    } else {
      dump("[SmtpModuleLoader] Using nsSmtpService.cpp\n");
    }
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
