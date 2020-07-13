/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * This file provides support for writing mailnews tests that require hooking
 * into the alerts system. Normally these tests would require a UI and fail in
 * debug mode, but with this method you can hook into the alerts system and
 * avoid the UI.
 *
 * This file registers prompts for nsIWindowWatcher::getNewPrompter and also
 * registers a nsIPromptService service. nsIWindowWatcher::getNewAuthPrompter
 * is also implemented but returns the nsILoginManagerPrompter as this would
 * be expected when running mailnews.
 *
 * To register the system:
 *
 * function run_test() {
 *   registerAlertTestUtils();
 *   // ...
 * }
 *
 * You can then hook into the alerts just by defining a function of the same
 * name as the interface function:
 *
 * function alert(aDialogTitle, aText) {
 *   // do my check
 * }
 *
 * Interface functions that do not have equivalent functions defined and get
 * called will be treated as unexpected, and therefore they will call
 * do_throw().
 */

var { MockRegistrar } = ChromeUtils.import(
  "resource://testing-common/MockRegistrar.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

// Wrapper to the nsIPrompt interface.
// This allows the send code to attempt to display errors to the user without
// failing.
var alertUtilsPrompts = {
  alert(aDialogTitle, aText) {
    if (typeof alert == "function") {
      alert(aDialogTitle, aText);
      return;
    }

    do_throw("alert unexpectedly called: " + aText + "\n");
  },

  alertCheck(aDialogTitle, aText, aCheckMsg, aCheckState) {
    if (typeof alertCheck == "function") {
      // eslint-disable-next-line no-undef
      alertCheck(aDialogTitle, aText, aCheckMsg, aCheckState);
      return;
    }

    do_throw("alertCheck unexpectedly called: " + aText + "\n");
  },

  confirm(aDialogTitle, aText) {
    if (typeof confirm == "function") {
      return confirm(aDialogTitle, aText);
    }

    do_throw("confirm unexpectedly called: " + aText + "\n");
    return false;
  },

  confirmCheck(aDialogTitle, aText, aCheckMsg, aCheckState) {
    if (typeof confirmCheck == "function") {
      // eslint-disable-next-line no-undef
      return confirmCheck(aDialogTitle, aText, aCheckMsg, aCheckState);
    }

    do_throw("confirmCheck unexpectedly called: " + aText + "\n");
    return false;
  },

  confirmEx(
    aDialogTitle,
    aText,
    aButtonFlags,
    aButton0Title,
    aButton1Title,
    aButton2Title,
    aCheckMsg,
    aCheckState
  ) {
    if (typeof confirmEx == "function") {
      // eslint-disable-next-line no-undef
      return confirmEx(
        aDialogTitle,
        aText,
        aButtonFlags,
        aButton0Title,
        aButton1Title,
        aButton2Title,
        aCheckMsg,
        aCheckState
      );
    }

    do_throw("confirmEx unexpectedly called: " + aText + "\n");
    return 0;
  },

  prompt(aDialogTitle, aText, aValue, aCheckMsg, aCheckState) {
    if (typeof prompt == "function") {
      return prompt(aDialogTitle, aText, aValue, aCheckMsg, aCheckState);
    }

    do_throw("prompt unexpectedly called: " + aText + "\n");
    return false;
  },

  promptUsernameAndPassword(
    aDialogTitle,
    aText,
    aUsername,
    aPassword,
    aCheckMsg,
    aCheckState
  ) {
    if (typeof promptUsernameAndPassword == "function") {
      // eslint-disable-next-line no-undef
      return promptUsernameAndPassword(
        aDialogTitle,
        aText,
        aUsername,
        aPassword,
        aCheckMsg,
        aCheckState
      );
    }

    do_throw("promptUsernameAndPassword unexpectedly called: " + aText + "\n");
    return false;
  },

  promptPassword(aDialogTitle, aText, aPassword, aCheckMsg, aCheckState) {
    if (typeof promptPassword == "function") {
      // eslint-disable-next-line no-undef
      return promptPassword(
        aDialogTitle,
        aText,
        aPassword,
        aCheckMsg,
        aCheckState
      );
    }

    do_throw("promptPassword unexpectedly called: " + aText + "\n");
    return false;
  },

  select(aDialogTitle, aText, aCount, aSelectList, aOutSelection) {
    if (typeof select == "function") {
      // eslint-disable-next-line no-undef
      return select(aDialogTitle, aText, aCount, aSelectList, aOutSelection);
    }

    do_throw("select unexpectedly called: " + aText + "\n");
    return false;
  },

  QueryInterface: ChromeUtils.generateQI(["nsIPrompt"]),
};

var alertUtilsPromptService = {
  alert(aParent, aDialogTitle, aText) {
    if (typeof alertPS == "function") {
      // eslint-disable-next-line no-undef
      alertPS(aParent, aDialogTitle, aText);
      return;
    }

    do_throw("alertPS unexpectedly called: " + aText + "\n");
  },

  alertCheck(aParent, aDialogTitle, aText, aCheckMsg, aCheckState) {
    if (typeof alertCheckPS == "function") {
      // eslint-disable-next-line no-undef
      alertCheckPS(aParent, aDialogTitle, aText, aCheckMsg, aCheckState);
      return;
    }

    do_throw("alertCheckPS unexpectedly called: " + aText + "\n");
  },

  confirm(aParent, aDialogTitle, aText) {
    if (typeof confirmPS == "function") {
      // eslint-disable-next-line no-undef
      return confirmPS(aParent, aDialogTitle, aText);
    }

    do_throw("confirmPS unexpectedly called: " + aText + "\n");
    return false;
  },

  confirmCheck(aParent, aDialogTitle, aText, aCheckMsg, aCheckState) {
    if (typeof confirmCheckPS == "function") {
      // eslint-disable-next-line no-undef
      return confirmCheckPS(
        aParent,
        aDialogTitle,
        aText,
        aCheckMsg,
        aCheckState
      );
    }

    do_throw("confirmCheckPS unexpectedly called: " + aText + "\n");
    return false;
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
    if (typeof confirmExPS == "function") {
      // eslint-disable-next-line no-undef
      return confirmExPS(
        aParent,
        aDialogTitle,
        aText,
        aButtonFlags,
        aButton0Title,
        aButton1Title,
        aButton2Title,
        aCheckMsg,
        aCheckState
      );
    }

    do_throw("confirmExPS unexpectedly called: " + aText + "\n");
    return 0;
  },

  prompt(aParent, aDialogTitle, aText, aValue, aCheckMsg, aCheckState) {
    if (typeof promptPS == "function") {
      // eslint-disable-next-line no-undef
      return promptPS(
        aParent,
        aDialogTitle,
        aText,
        aValue,
        aCheckMsg,
        aCheckState
      );
    }

    do_throw("promptPS unexpectedly called: " + aText + "\n");
    return false;
  },

  promptUsernameAndPassword(
    aParent,
    aDialogTitle,
    aText,
    aUsername,
    aPassword,
    aCheckMsg,
    aCheckState
  ) {
    if (typeof promptUsernameAndPasswordPS == "function") {
      // eslint-disable-next-line no-undef
      return promptUsernameAndPasswordPS(
        aParent,
        aDialogTitle,
        aText,
        aUsername,
        aPassword,
        aCheckMsg,
        aCheckState
      );
    }

    do_throw(
      "promptUsernameAndPasswordPS unexpectedly called: " + aText + "\n"
    );
    return false;
  },

  promptPassword(
    aParent,
    aDialogTitle,
    aText,
    aPassword,
    aCheckMsg,
    aCheckState
  ) {
    if (typeof promptPasswordPS == "function") {
      // eslint-disable-next-line no-undef
      return promptPasswordPS(
        aParent,
        aDialogTitle,
        aText,
        aPassword,
        aCheckMsg,
        aCheckState
      );
    }

    do_throw("promptPasswordPS unexpectedly called: " + aText + "\n");
    return false;
  },

  select(aParent, aDialogTitle, aText, aCount, aSelectList, aOutSelection) {
    if (typeof selectPS == "function") {
      // eslint-disable-next-line no-undef
      return selectPS(
        aParent,
        aDialogTitle,
        aText,
        aCount,
        aSelectList,
        aOutSelection
      );
    }

    do_throw("selectPS unexpectedly called: " + aText + "\n");
    return false;
  },

  createInstance(outer, iid) {
    if (outer != null) {
      throw Components.Exception("", Cr.NS_ERROR_NO_AGGREGATION);
    }
    return this.QueryInterface(iid);
  },

  QueryInterface: ChromeUtils.generateQI([
    "nsIPromptService",
    "nsIPromptService2",
  ]),
};

var alertUtilsWindowWatcher = {
  getNewPrompter(aParent) {
    return alertUtilsPrompts;
  },

  getNewAuthPrompter(aParent) {
    return Cc["@mozilla.org/login-manager/authprompter;1"].getService(
      Ci.nsIAuthPrompt
    );
  },

  QueryInterface: ChromeUtils.generateQI(["nsIWindowWatcher"]),
};

function registerAlertTestUtils() {
  MockRegistrar.register(
    "@mozilla.org/embedcomp/window-watcher;1",
    alertUtilsWindowWatcher
  );
  Services.prompt = alertUtilsPromptService;
}

// Dummy message window that ensures we get prompted for logins.

var gDummyMsgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
  Ci.nsIMsgWindow
);
gDummyMsgWindow instanceof Ci.nsIMsgWindowTest;
gDummyMsgWindow.setAuthPrompt(
  Cc["@mozilla.org/login-manager/authprompter;1"].getService(Ci.nsIAuthPrompt)
);
gDummyMsgWindow.setPromptDialog(alertUtilsPrompts);
