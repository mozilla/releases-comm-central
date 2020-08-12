/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let { ComponentUtils } = ChromeUtils.import(
  "resource://gre/modules/ComponentUtils.jsm"
);
let { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

const EXPORTED_SYMBOLS = ["MsgSendModuleLoader"];

/**
 * Determine whether to use nsMsgSend.cpp or MessageSend.jsm. When
 * `mailnews.send.jsmodule` is `true`, use MessageSend.jsm.
 */
function MsgSendModuleLoader() {
  try {
    this.loadModule();
  } catch (e) {
    dump(
      `### Error loading MsgSendModule:${e.filename || e.fileName}:${
        e.lineNumber
      }: ${e}\n`
    );
  }
}

MsgSendModuleLoader.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),

  observe() {
    // Nothing to do here, just need the entry so this is instantiated.
  },

  loadModule() {
    if (Services.prefs.getBoolPref("mailnews.send.jsmodule", false)) {
      let scope = {};
      Services.scriptloader.loadSubScript(
        "resource:///modules/MessageSend.jsm",
        scope
      );
      scope.NSGetFactory = ComponentUtils.generateNSGetFactory([
        scope.MessageSend,
      ]);
      let registrar = Components.manager.QueryInterface(
        Ci.nsIComponentRegistrar
      );
      let classId = Components.ID("{028b9c1e-8d0a-4518-80c2-842e07846eaa}");
      let factory = lazyFactoryFor(scope, classId);
      registrar.registerFactory(
        classId,
        "",
        "@mozilla.org/messengercompose/send;1",
        factory
      );
      dump("[MsgSendModuleLoader] Using MessageSend.jsm\n");
    } else {
      dump("[MsgSendModuleLoader] Using nsMsgSend.cpp\n");
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
