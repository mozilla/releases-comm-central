/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["Pop3ModuleLoader"];

var { ComponentUtils } = ChromeUtils.import(
  "resource://gre/modules/ComponentUtils.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

/**
 * Determine whether to use nsPop3Service.cpp or Pop3Service.jsm. When
 * `mailnews.pop3.jsmodule` is `true`, use Pop3Service.jsm.
 */
function Pop3ModuleLoader() {
  try {
    this.loadModule();
  } catch (e) {
    Cu.reportError(e);
  }
}

var pop3JSModules = [
  // moduleName, interfaceId, contractId
  [
    "Pop3IncomingServer",
    "{f99fdbf7-2e79-4ce3-9d94-7af3763b82fc}",
    "@mozilla.org/messenger/server;1?type=pop3",
  ],
  [
    "Pop3Service",
    "{1e8f21c3-32c3-4114-9ea4-3d74006fb351}",
    "@mozilla.org/messenger/popservice;1",
  ],
  [
    "Pop3ProtocolHandler",
    "{eed38573-d01b-4c13-9f9d-f69963095a4d}",
    "@mozilla.org/network/protocol;1?name=pop",
  ],
];

Pop3ModuleLoader.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),

  observe() {
    // Nothing to do here, just need the entry so this is instantiated.
  },

  loadModule() {
    if (Services.prefs.getBoolPref("mailnews.pop3.jsmodule", false)) {
      let registrar = Components.manager.QueryInterface(
        Ci.nsIComponentRegistrar
      );

      for (let [moduleName, interfaceId, contractId] of pop3JSModules) {
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

      dump("[Pop3ModuleLoader] Using Pop3Service.jsm\n");
    } else {
      dump("[Pop3ModuleLoader] Using nsPop3Service.cpp\n");
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
