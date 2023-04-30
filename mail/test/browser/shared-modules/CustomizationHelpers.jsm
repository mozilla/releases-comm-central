/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const EXPORTED_SYMBOLS = ["CustomizeDialogHelper"];

var wh = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var { Assert } = ChromeUtils.importESModule(
  "resource://testing-common/Assert.sys.mjs"
);
var EventUtils = ChromeUtils.import(
  "resource://testing-common/mozmill/EventUtils.jsm"
);

var utils = ChromeUtils.import("resource://testing-common/mozmill/utils.jsm");

var USE_SHEET_PREF = "toolbar.customization.usesheet";

/**
 * Initialize the help for a customization dialog
 *
 * @param {} aToolbarId
 *   the ID of the toolbar to be customized
 * @param {} aOpenElementId
 *   the ID of the element to be clicked on to open the dialog
 * @param {} aWindowType
 *   the windowType of the window containing the dialog to be opened
 */
function CustomizeDialogHelper(aToolbarId, aOpenElementId, aWindowType) {
  this._toolbarId = aToolbarId;
  this._openElementId = aOpenElementId;
  this._windowType = aWindowType;
  this._openInWindow = !Services.prefs.getBoolPref(USE_SHEET_PREF);
}

CustomizeDialogHelper.prototype = {
  /**
   * Open a customization dialog by clicking on a given element.
   *
   * @param {} aController
   *   the controller object of the window for which the customization
   *   dialog should be opened
   * @returns a controller for the customization dialog
   */
  async open(aController) {
    aController.window.document.getElementById(this._openElementId).click();

    let ctc;
    // Depending on preferences the customization dialog is
    // either a normal window or embedded into a sheet.
    if (!this._openInWindow) {
      ctc = wh.wait_for_frame_load(
        aController.window.document.getElementById(
          "customizeToolbarSheetIFrame"
        ),
        "chrome://messenger/content/customizeToolbar.xhtml"
      );
    } else {
      ctc = wh.wait_for_existing_window(this._windowType);
    }
    utils.sleep(500);
    return ctc;
  },

  /**
   * Close the customization dialog.
   *
   * @param {} aCtc
   *   the controller object of the customization dialog which should be closed
   */
  close(aCtc) {
    if (this._openInWindow) {
      wh.plan_for_window_close(aCtc);
    }

    let doneButton = aCtc.window.document.getElementById("donebutton");
    EventUtils.synthesizeMouseAtCenter(doneButton, {}, doneButton.ownerGlobal);
    utils.sleep(0);
    // XXX There should be an equivalent for testing the closure of
    // XXX the dialog embedded in a sheet, but I do not know how.
    if (this._openInWindow) {
      wh.wait_for_window_close();
      Assert.ok(aCtc.window.closed, "The customization dialog is not closed.");
    }
  },

  /**
   *  Restore the default buttons in the header pane toolbar
   *  by clicking the corresponding button in the palette dialog
   *  and check if it worked.
   *
   * @param {} aController
   *   the controller object of the window for which the customization
   *   dialog should be opened
   */
  async restoreDefaultButtons(aController) {
    let ctc = await this.open(aController);
    let restoreButton = ctc.window.document
      .getElementById("main-box")
      .querySelector("[oncommand*='overlayRestoreDefaultSet();']");

    EventUtils.synthesizeMouseAtCenter(
      restoreButton,
      {},
      restoreButton.ownerGlobal
    );
    utils.sleep(0);

    this.close(ctc);

    let toolbar = aController.window.document.getElementById(this._toolbarId);
    let defaultSet = toolbar.getAttribute("defaultset");

    Assert.equal(toolbar.currentSet, defaultSet);
  },
};
