/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const EXPORTED_SYMBOLS = [
  "wait_for_provider_list_loaded",
  "wait_for_search_ready",
  "open_provisioner_window",
  "wait_for_the_wizard_to_be_closed",
  "assert_links_shown",
  "assert_links_not_shown",
  "wait_for_search_results",
  "gConsoleListener",
  "wait_to_be_offline",
  "remove_email_account",
  "type_in_search_name",
];

var EventUtils = ChromeUtils.import(
  "resource://testing-common/mozmill/EventUtils.jsm"
);

var dh = ChromeUtils.import("resource://testing-common/mozmill/DOMHelpers.jsm");
var fdh = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { input_value } = ChromeUtils.import(
  "resource://testing-common/mozmill/KeyboardHelpers.jsm"
);

var { Assert } = ChromeUtils.import("resource://testing-common/Assert.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var mc = fdh.mc;

/* Wait until the list of providers is loaded and displayed.
 */
function wait_for_provider_list_loaded(aController) {
  mc.waitFor(function() {
    return aController.window.EmailAccountProvisioner.loadedProviders;
  }, "Timed out waiting for the provider list to be loaded");
}

/* Wait until the search fields are enabled, and we're ready to
 * do a search.
 */
function wait_for_search_ready(aController) {
  mc.waitFor(function() {
    mc.sleep(0);
    return !aController.e("name").disabled;
  }, "Timed out waiting for the search input field to be enabled");
}

/* Opens the account provisioner by selecting it from the File/Edit menu.
 */
function open_provisioner_window() {
  mc.click(mc.menus.menu_File.menu_New.newCreateEmailAccountMenuItem);
}

/* Used by wait_for_the_wizard_to_be_closed to check if the wizard is still
 * open.
 */
function poll_for_wizard_window(aController) {
  return Services.wm.getMostRecentWindow("mail:accountsetup");
}

/* Waits until the existing email account setup wizard is closed.
 */
function wait_for_the_wizard_to_be_closed(aController) {
  aController.waitFor(function() {
    let w = poll_for_wizard_window(aController);
    return w == null;
  });
}

/* Asserts that a series of links are currently visible. aLinks can either
 * be a single link, or an Array of links.
 */
function assert_links_shown(aController, aLinks) {
  if (!Array.isArray(aLinks)) {
    aLinks = [aLinks];
  }

  aLinks.forEach(function(aLink) {
    let anchors = aController.window.document.querySelectorAll(
      'a[href="' + aLink + '"]'
    );
    Assert.ok(anchors.length > 0);
    for (let anchor of anchors) {
      Assert.ok(!anchor.hidden);
    }
  });
}

/* Asserts that a series of links are currently invisible. aLinks can either
 * be a single link, or an Array of links.
 */
function assert_links_not_shown(aController, aLinks) {
  if (!Array.isArray(aLinks)) {
    aLinks = [aLinks];
  }

  aLinks.forEach(function(aLink) {
    let anchors = aController.window.document.querySelectorAll(
      'a[href="' + aLink + '"]'
    );
    Assert.equal(anchors.length, 0);
  });
}

/* Waits for account provisioner search results to come in.
 */
function wait_for_search_results(w) {
  w.waitFor(
    () => w.e("results").children.length > 0,
    "Timed out waiting for search results to arrive."
  );
}

/* Waits for the account provisioner to be displaying the offline
 * message.
 *
 * @param w  the controller parent of the element
 */
function wait_to_be_offline(w) {
  mc.waitFor(function() {
    return dh.check_element_visible(w, "cannotConnectMessage");
  }, "Timed out waiting for the account provisioner to be in " +
    "offline mode.");
}

/**
 * Remove an account with address aAddress from the current profile.
 *
 * @param aAddress the email address to try to remove.
 */
function remove_email_account(aAddress) {
  for (let account of MailServices.accounts.accounts) {
    if (account.defaultIdentity && account.defaultIdentity.email == aAddress) {
      MailServices.accounts.removeAccount(account);
      break;
    }
  }
}

/**
 * Helper function that finds the search input, clears it of any content,
 * and then manually types aName into the field.
 *
 * @param aController the controller for the Account Provisioner dialog.
 * @param aName the name to type in.
 */
function type_in_search_name(aController, aName) {
  aController.e("name").focus();
  EventUtils.synthesizeKey("a", { accelKey: true }, aController.window);
  EventUtils.synthesizeKey("VK_BACK_SPACE", {}, aController.window);

  input_value(aController, aName);
}

/* A listener for the Error Console, which allows us to ensure that certain
 * messages appear in the console.
 */
var gConsoleListener = {
  QueryInterface: ChromeUtils.generateQI(["nsIConsoleListener"]),
  _msg: null,
  _sawMsg: false,

  observe(aMsg) {
    if (!this._msg) {
      return;
    }

    this._sawMsg |= aMsg.message.includes(this._msg);
  },

  listenFor(aMsg) {
    this._msg = aMsg;
  },

  reset() {
    this._msg = null;
    this._sawMsg = false;
  },

  get sawMsg() {
    return this._sawMsg;
  },

  wait() {
    let self = this;
    mc.waitFor(function() {
      return self.sawMsg;
    }, "Timed out waiting for console message: " + this._msg);
  },
};
