/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["NntpModuleLoader"];

var { ComponentUtils } = ChromeUtils.import(
  "resource://gre/modules/ComponentUtils.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

/**
 * Determine whether to use nsNntpService.cpp or NntpService.jsm. When
 * `mailnews.nntp.jsmodule` is `true`, use NntpService.jsm.
 */
function NntpModuleLoader() {
  try {
    this.loadModule();
  } catch (e) {
    Cu.reportError(e);
  }
}

var nntpJSModules = [
  // moduleName, interfaceId, contractId
  [
    "NntpService",
    "{b13db263-a219-4168-aeaf-8266f001087e}",
    "@mozilla.org/messenger/nntpservice;1",
  ],
];

NntpModuleLoader.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),

  observe() {
    // Nothing to do here, just need the entry so this is instantiated.
  },

  loadModule() {
    if (Services.prefs.getBoolPref("mailnews.nntp.jsmodule", false)) {
      let registrar = Components.manager.QueryInterface(
        Ci.nsIComponentRegistrar
      );

      for (let [moduleName, interfaceId, contractId] of nntpJSModules) {
        // Load a module.
        let scope = ChromeUtils.import(`resource:///modules/${moduleName}.jsm`);
        scope.NSGetFactory = ComponentUtils.generateNSGetFactory([
          scope[moduleName],
        ]);

        // Register a module.
        let classId = Components.ID(interfaceId);
        registrar.registerFactory(
          classId,
          "",
          contractId,
          lazyFactoryFor(scope, classId)
        );
      }

      dump("[NntpModuleLoader] Using NntpService.jsm\n");
    } else {
      dump("[NntpModuleLoader] Using nsNntpService.cpp\n");
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
