/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is the Instantbird messenging client, released
 * 2007.
 *
 * The Initial Developer of the Original Code is
 * Florian QUEZE <florian@instantbird.org>.
 * Portions created by the Initial Developer are Copyright (C) 2007
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Romain Bezut <romain@bezut.info>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

function initPurpleCore()
{
  if (!Ci.purpleICoreService) {
    promptError("startupFailure.purplexpcomFileError");
    return false;
  }

  if (!Components.classes["@instantbird.org/purple/core;1"]) {
    promptError("startupFailure.xpcomRegistrationError");
    return false;
  }

  try {
    var pcs = Services.core;
    pcs.init();
  }
  catch (e) {
    promptError("startupFailure.purplexpcomInitError", e);
    return false;
  }

  if (!pcs.version) {
    promptError("startupFailure.libpurpleError");
    return false;
  }

  if (!pcs.getProtocols().hasMoreElements()) {
    promptError("startupFailure.noProtocolLoaded");
    uninitPurpleCore();
    return false;
  }

  return true;
}

function uninitPurpleCore()
{
  try {
    Services.core.quit();
  }
  catch (e) {
    Services.prompt.alert(null, "Shutdown Error",
                          "An error occurred while shutting down purplexpcom: " + e);
  }
}

function promptError(aKeyString, aMessage) {
  var bundle =
    Services.strings.createBundle("chrome://instantbird/locale/core.properties");

  var title = bundle.GetStringFromName("startupFailure.title");
  var message =
    bundle.GetStringFromName("startupFailure.apologize") + "\n\n" +
    (aMessage ? bundle.formatStringFromName(aKeyString, [aMessage], 1)
              : bundle.GetStringFromName(aKeyString)) + "\n\n" +
    bundle.GetStringFromName("startupFailure.update");
  const nsIPromptService = Components.interfaces.nsIPromptService;
  const flags =
    nsIPromptService.BUTTON_POS_1 * nsIPromptService.BUTTON_TITLE_IS_STRING +
    nsIPromptService.BUTTON_POS_0 * nsIPromptService.BUTTON_TITLE_IS_STRING;

  var prompts = Services.prompt;
  if (!prompts.confirmEx(null, title, message, flags,
                         bundle.GetStringFromName("startupFailure.buttonUpdate"),
                         bundle.GetStringFromName("startupFailure.buttonClose"),
                         null, null, {})) {
    // copied from checkForUpdates in mozilla/browser/base/content/utilityOverlay.js
    var um =
      Components.classes["@mozilla.org/updates/update-manager;1"]
                .getService(Components.interfaces.nsIUpdateManager);
    var prompter =
      Components.classes["@mozilla.org/updates/update-prompt;1"]
                .createInstance(Components.interfaces.nsIUpdatePrompt);

    // If there's an update ready to be applied, show the "Update Downloaded"
    // UI instead and let the user know they have to restart the browser for
    // the changes to be applied.
    if (um.activeUpdate && um.activeUpdate.state == "pending")
      prompter.showUpdateDownloaded(um.activeUpdate);
    else
      prompter.checkForUpdates();
  }
}
