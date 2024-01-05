/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var EXPORTED_SYMBOLS = ["PromptCollection"];

/**
 * Implements nsIPromptCollection
 *
 * @class PromptCollection
 */
class PromptCollection {
  asyncBeforeUnloadCheck(browsingContext) {
    let title;
    let message;
    let leaveLabel;
    let stayLabel;

    try {
      title = this.domBundle.GetStringFromName("OnBeforeUnloadTitle");
      message = this.domBundle.GetStringFromName("OnBeforeUnloadMessage2");
      leaveLabel = this.domBundle.GetStringFromName(
        "OnBeforeUnloadLeaveButton"
      );
      stayLabel = this.domBundle.GetStringFromName("OnBeforeUnloadStayButton");
    } catch (exception) {
      console.error("Failed to get strings from dom.properties");
      return false;
    }

    const contentViewer = browsingContext?.docShell?.contentViewer;

    // TODO: Do we really want to allow modal dialogs from inactive
    // content viewers at all, particularly for permit unload prompts?
    const modalAllowed = contentViewer
      ? contentViewer.isTabModalPromptAllowed
      : browsingContext.ancestorsAreCurrent;

    const modalType =
      Ci.nsIPromptService[
        modalAllowed ? "MODAL_TYPE_CONTENT" : "MODAL_TYPE_WINDOW"
      ];

    const buttonFlags =
      Ci.nsIPromptService.BUTTON_POS_0_DEFAULT |
      (Ci.nsIPromptService.BUTTON_TITLE_IS_STRING *
        Ci.nsIPromptService.BUTTON_POS_0) |
      (Ci.nsIPromptService.BUTTON_TITLE_IS_STRING *
        Ci.nsIPromptService.BUTTON_POS_1);

    return Services.prompt
      .asyncConfirmEx(
        browsingContext,
        modalType,
        title,
        message,
        buttonFlags,
        leaveLabel,
        stayLabel,
        null,
        null,
        false,
        // Tell the prompt service that this is a permit unload prompt
        // so that it can set the appropriate flag on the detail object
        // of the events it dispatches.
        { inPermitUnload: true }
      )
      .then(
        result =>
          result.QueryInterface(Ci.nsIPropertyBag2).get("buttonNumClicked") == 0
      );
  }
}

ChromeUtils.defineLazyGetter(
  PromptCollection.prototype,
  "domBundle",
  function () {
    const bundle = Services.strings.createBundle(
      "chrome://global/locale/dom/dom.properties"
    );
    if (!bundle) {
      throw new Error("String bundle for dom not present!");
    }
    return bundle;
  }
);

PromptCollection.prototype.classID = Components.ID(
  "{7913837c-9623-11ea-bb37-0242ac130002}"
);
PromptCollection.prototype.QueryInterface = ChromeUtils.generateQI([
  "nsIPromptCollection",
]);
