/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["ImapModuleLoader"];

var { ComponentUtils } = ChromeUtils.import(
  "resource://gre/modules/ComponentUtils.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

/**
 * Determine whether to use nsImapService.cpp or ImapService.jsm. When
 * `mailnews.imap.jsmodule` is `true`, use ImapService.jsm.
 */
function ImapModuleLoader() {
  try {
    this.loadModule();
  } catch (e) {
    Cu.reportError(e);
  }
}

var imapJSModules = [
  // moduleName, interfaceId, contractId
  [
    "ImapIncomingServer",
    "{b02a4e1c-0d9e-498c-8b9d-18917ba9f65b}",
    "@mozilla.org/messenger/server;1?type=imap",
  ],
  [
    "ImapService",
    "{2ea8fbe6-029b-4bff-ae05-b794cf955afb}",
    "@mozilla.org/messenger/imapservice;1",
  ],
  [
    "ImapProtocolHandler",
    "{ebb06c58-6ccd-4bde-9087-40663e0388ae}",
    "@mozilla.org/network/protocol;1?name=imap",
  ],
];

ImapModuleLoader.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),

  observe() {
    // Nothing to do here, just need the entry so this is instantiated.
  },

  loadModule() {
    if (Services.prefs.getBoolPref("mailnews.imap.jsmodule", false)) {
      let registrar = Components.manager.QueryInterface(
        Ci.nsIComponentRegistrar
      );

      for (let [moduleName, interfaceId, contractId] of imapJSModules) {
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

      dump("[ImapModuleLoader] Using ImapService.jsm\n");
    } else {
      dump("[ImapModuleLoader] Using nsImapService.cpp\n");
    }
  },
};

function lazyFactoryFor(backendScope, classID) {
  return {
    createInstance(aIID) {
      let realFactory = backendScope.NSGetFactory(classID);
      return realFactory.createInstance(aIID);
    },
  };
}
