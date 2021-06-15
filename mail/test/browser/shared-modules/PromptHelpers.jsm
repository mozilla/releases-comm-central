/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const EXPORTED_SYMBOLS = [
  "gMockPromptService",
  "gMockAuthPromptReg",
  "gMockAuthPrompt",
];

var { MockObjectReplacer } = ChromeUtils.import(
  "resource://testing-common/mozmill/MockObjectHelpers.jsm"
);

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

var kMockPromptServiceName = "Mock Prompt Service";
var kPromptServiceContractID = "@mozilla.org/embedcomp/prompt-service;1";
var kPromptServiceName = "Prompt Service";

var gMockAuthPromptReg = new MockObjectReplacer(
  "@mozilla.org/prompter;1",
  MockAuthPromptFactoryConstructor
);

function MockAuthPromptFactoryConstructor() {
  return gMockAuthPromptFactory;
}

var gMockAuthPromptFactory = {
  QueryInterface: ChromeUtils.generateQI(["nsIPromptFactory"]),
  getPrompt(aParent, aIID, aResult) {
    return gMockAuthPrompt.QueryInterface(aIID);
  },
};

var gMockAuthPrompt = {
  password: "",

  QueryInterface: ChromeUtils.generateQI(["nsIAuthPrompt"]),

  prompt(aTitle, aText, aRealm, aSave, aDefaultText) {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },

  promptUsernameAndPassword(aTitle, aText, aRealm, aSave, aUser, aPwd) {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },

  promptPassword(aTitle, aText, aRealm, aSave, aPwd) {
    aPwd.value = this.password;
    return true;
  },
};

var gMockPromptService = {
  _registered: false,
  QueryInterface: ChromeUtils.generateQI(["nsIPromptService"]),
  _will_return: null,
  _inout_value: null,
  _promptState: null,
  _origFactory: null,
  _promptCb: null,

  alert(aParent, aDialogTitle, aText) {
    this._promptState = {
      method: "alert",
      parent: aParent,
      dialogTitle: aDialogTitle,
      text: aText,
    };
  },

  confirm(aParent, aDialogTitle, aText) {
    this._promptState = {
      method: "confirm",
      parent: aParent,
      dialogTitle: aDialogTitle,
      text: aText,
    };

    this.fireCb();

    return this._will_return;
  },

  confirmCheck(aParent, aDialogTitle, aText) {
    this._promptState = {
      method: "confirmCheck",
      parent: aParent,
      dialogTitle: aDialogTitle,
      text: aText,
    };

    this.fireCb();

    return this._will_return;
  },

  confirmEx(
    aParent,
    aDialogTitle,
    aText,
    aButtonFlags,
    aButton0Title,
    aButton1Title,
    aButton2Title,
    aCheckMsg,
    aCheckState
  ) {
    this._promptState = {
      method: "confirmEx",
      parent: aParent,
      dialogTitle: aDialogTitle,
      text: aText,
      buttonFlags: aButtonFlags,
      button0Title: aButton0Title,
      button1Title: aButton1Title,
      button2Title: aButton2Title,
      checkMsg: aCheckMsg,
      checkState: aCheckState,
    };

    this.fireCb();

    return this._will_return;
  },

  prompt(aParent, aDialogTitle, aText, aValue, aCheckMsg, aCheckState) {
    this._promptState = {
      method: "prompt",
      parent: aParent,
      dialogTitle: aDialogTitle,
      text: aText,
      value: aValue,
      checkMsg: aCheckMsg,
      checkState: aCheckState,
    };

    this.fireCb();

    if (this._inout_value != null) {
      aValue.value = this._inout_value;
    }

    return this._will_return;
  },

  // Other dialogs should probably be mocked here, including alert,
  // alertCheck, etc.
  // See:  http://mxr.mozilla.org/mozilla-central/source/embedding/components/
  //       windowwatcher/public/nsIPromptService.idl

  /* Sets the value that the alert, confirm, etc dialog will return to
   * the caller.
   */
  set returnValue(aReturn) {
    this._will_return = aReturn;
  },

  set inoutValue(aValue) {
    this._inout_value = aValue;
  },

  set onPromptCallback(aCb) {
    this._promptCb = aCb;
  },

  promisePrompt() {
    return new Promise(resolve => {
      this.onPromptCallback = resolve;
    });
  },

  fireCb() {
    if (typeof this._promptCb == "function") {
      this._promptCb.call();
    }
  },

  /* Wipes out the prompt state and any return values.
   */
  reset() {
    this._will_return = null;
    this._promptState = null;
    this._promptCb = null;
    this._inout_value = null;
  },

  /* Returns the prompt state if one was observed since registering
   * the Mock Prompt Service.
   */
  get promptState() {
    return this._promptState;
  },

  CID: Components.ID("{404ebfa2-d8f4-4c94-8416-e65a55f9df5b}"),

  get registrar() {
    delete this.registrar;
    return (this.registrar = Components.manager.QueryInterface(
      Ci.nsIComponentRegistrar
    ));
  },

  /* Registers the Mock Prompt Service, and stores the original Prompt Service.
   */
  register() {
    if (!this.originalCID) {
      void Components.manager.getClassObject(
        Cc[kPromptServiceContractID],
        Ci.nsIFactory
      );

      this.originalCID = this.registrar.contractIDToCID(
        kPromptServiceContractID
      );
      this.registrar.registerFactory(
        this.CID,
        kMockPromptServiceName,
        kPromptServiceContractID,
        gMockPromptServiceFactory
      );
      this._resetServicesPrompt();
    }
  },

  /* Unregisters the Mock Prompt Service, and re-registers the original
   * Prompt Service.
   */
  unregister() {
    if (this.originalCID) {
      // Unregister the mock.
      this.registrar.unregisterFactory(this.CID, gMockPromptServiceFactory);

      this.registrar.registerFactory(
        this.originalCID,
        kPromptServiceName,
        kPromptServiceContractID,
        null
      );

      delete this.originalCID;
      this._resetServicesPrompt();
    }
  },

  _resetServicesPrompt() {
    XPCOMUtils.defineLazyServiceGetter(
      Services,
      "prompt",
      kPromptServiceContractID,
      "nsIPromptService"
    );
  },
};

var gMockPromptServiceFactory = {
  createInstance(aOuter, aIID) {
    if (aOuter != null) {
      throw Components.Exception("", Cr.NS_ERROR_NO_AGGREGATION);
    }

    if (!aIID.equals(Ci.nsIPromptService)) {
      throw Components.Exception("", Cr.NS_ERROR_NO_INTERFACE);
    }

    return gMockPromptService;
  },
};
