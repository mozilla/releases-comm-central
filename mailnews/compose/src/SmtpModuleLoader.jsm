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
      let scope = {};
      Services.scriptloader.loadSubScript(
        "resource:///modules/SmtpService.jsm",
        scope
      );
      scope.NSGetFactory = ComponentUtils.generateNSGetFactory([
        scope.SmtpService,
      ]);
      let registrar = Components.manager.QueryInterface(
        Ci.nsIComponentRegistrar
      );
      let classId = Components.ID("{acda6039-8b17-46c1-a8ed-ad50aa80f412}");
      let factory = lazyFactoryFor(scope, classId);
      registrar.registerFactory(
        classId,
        "",
        "@mozilla.org/messengercompose/smtp;1",
        factory
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
