/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MockRegistrar } from "resource://testing-common/MockRegistrar.sys.mjs";
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

var kPromptServiceContractID = "@mozilla.org/prompter;1";

export var gMockPromptService = {
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

  /* Registers the Mock Prompt Service, and stores the original Prompt Service.
   */
  register() {
    this._classID = MockRegistrar.register(kPromptServiceContractID, this);
    this._resetServicesPrompt();
  },

  /* Unregisters the Mock Prompt Service, and re-registers the original
   * Prompt Service.
   */
  unregister() {
    MockRegistrar.unregister(this._classID);
    this._resetServicesPrompt();
  },

  _resetServicesPrompt() {
    // eslint-disable-next-line mozilla/use-services
    XPCOMUtils.defineLazyServiceGetter(
      Services,
      "prompt",
      kPromptServiceContractID,
      "nsIPromptService"
    );
  },
};
