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
  // moduleName, interfaceId, contractId, moduleFileName
  [
    "NntpService",
    "{b13db263-a219-4168-aeaf-8266f001087e}",
    "@mozilla.org/messenger/nntpservice;1",
  ],
  [
    "NntpMessageService",
    "{9cefbe67-5966-4f8a-b7b0-cedd60a02c8e}",
    "@mozilla.org/messenger/messageservice;1?type=news-message",
    "NntpMessageService",
  ],
  [
    "NewsMessageService",
    "{4cae5569-2c72-4910-9f3d-774f9e939df8}",
    "@mozilla.org/messenger/messageservice;1?type=news",
    "NntpMessageService",
  ],
  [
    "NewsProtocolHandler",
    "{24220ecd-cb05-4676-8a47-fa1da7b86e6e}",
    "@mozilla.org/network/protocol;1?name=news",
    "NntpProtocolHandler",
  ],
  [
    "SnewsProtocolHandler",
    "{1895016d-5302-46a9-b3f5-9c47694d9eca}",
    "@mozilla.org/network/protocol;1?name=snews",
    "NntpProtocolHandler",
  ],
  [
    "NntpIncomingServer",
    "{dc4ad42f-bc98-4193-a469-0cfa95ed9bcb}",
    "@mozilla.org/messenger/server;1?type=nntp",
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

      for (let [
        moduleName,
        interfaceId,
        contractId,
        fileName,
      ] of nntpJSModules) {
        fileName = fileName || moduleName;
        // Load a module.
        let scope = ChromeUtils.import(`resource:///modules/${fileName}.jsm`);
        let NSGetFactory = ComponentUtils.generateNSGetFactory([
          scope[moduleName],
        ]);

        // Register a module.
        let classId = Components.ID(interfaceId);
        registrar.registerFactory(
          classId,
          "",
          contractId,
          lazyFactoryFor(NSGetFactory, classId)
        );
      }

      dump("[NntpModuleLoader] Using NntpService.jsm\n");
    } else {
      dump("[NntpModuleLoader] Using nsNntpService.cpp\n");
    }
  },
};

function lazyFactoryFor(NSGetFactory, classID) {
  return {
    createInstance(aOuter, aIID) {
      let realFactory = NSGetFactory(classID);
      return realFactory.createInstance(aOuter, aIID);
    },
    lockFactory(lock) {
      let realFactory = NSGetFactory(classID);
      return realFactory.lockFactory(lock);
    },
  };
}
