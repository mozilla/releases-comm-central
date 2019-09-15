/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this file,
* You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var EXPORTED_SYMBOLS = ["ShellService"];

const {AppConstants} = ChromeUtils.import("resource://gre/modules/AppConstants.jsm");
const {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
const {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

/**
 * Internal functionality to save and restore the docShell.allow* properties.
 */
var ShellServiceInternal = {
  /**
   * Used to determine whether or not to offer "Set as desktop background"
   * functionality. Even if shell service is available it is not
   * guaranteed that it is able to set the background for every desktop
   * which is especially true for Linux with its many different desktop
   * environments.
   */
  get canSetDesktopBackground() {
    if (AppConstants.platform == "win" ||
        AppConstants.platform == "macosx") {
      return true;
    }

    if (AppConstants.platform == "linux") {
      if (this.shellService) {
        let linuxShellService = this.shellService
                                    .QueryInterface(Ci.nsIGNOMEShellService);
        return linuxShellService.canSetDesktopBackground;
      }
    }

    return false;
  },

  /**
   * Used to determine whether or not to show a "Set Default Client"
   * query dialog. This attribute is true if the application is starting
   * up and "shell.checkDefaultClient" is true, otherwise it is false.
   */
  _checkedThisSession: false,
  get shouldCheckDefaultClient() {
    // If we've already checked, the suite has been started and this is a
    // new window open, and we don't want to check again.
    if (this._checkedThisSession) {
      return false;
    }

    return Services.prefs.getBoolPref("shell.checkDefaultClient");
  },

  set shouldCheckDefaultClient(shouldCheck) {
    Services.prefs.setBoolPref("shell.checkDefaultClient", !!shouldCheck);
  },

  get shouldBeDefaultClientFor() {
    return Services.prefs.getIntPref("shell.checkDefaultApps");
  },

  set shouldBeDefaultClientFor(appTypes) {
    Services.prefs.setIntPref("shell.checkDefaultApps", appTypes);
  },

  setDefaultClient(forAllUsers, claimAllTypes, appTypes) {
    try {
      this.shellService.setDefaultClient(forAllUsers, claimAllTypes, appTypes);
    } catch (ex) {
      Cu.reportError(ex);
    }
  },

  isDefaultClient(startupCheck, appTypes) {
    // If this is the first window, maintain internal state that we've
    // checked this session (so that subsequent window opens don't show the
    // default client dialog).
    if (startupCheck) {
      this._checkedThisSession = true;
    }
    if (this.shellService) {
      return this.shellService.isDefaultClient(startupCheck, appTypes);
    }
    return false;
  }
};

XPCOMUtils.defineLazyServiceGetter(ShellServiceInternal, "shellService",
  "@mozilla.org/suite/shell-service;1", Ci.nsIShellService);

/**
 * The external API exported by this module.
 */
var ShellService = new Proxy(ShellServiceInternal, {
  get(target, name) {
    if (name in target) {
      return target[name];
    }
    if (target.shellService) {
      return target.shellService[name];
    }
    Services.console.logStringMessage(`${name} not found in ShellService: ${target.shellService}`);
    return undefined;
  }
});
