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
 * The Original Code is Instantbird.
 *
 * The Initial Developer of the Original Code is
 * Benedikt Pfeifer <benediktp@ymail.com>.
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Patrick Cloke <clokep@gmail.com>
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

const {interfaces: Ci, utils: Cu} = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/imStatusUtils.jsm");

function StatusCLH() { }
StatusCLH.prototype = {
  classDescription: "Instantbird Status Commandline Handler Component",
  classID:          Components.ID("{9da72063-b727-488d-9b3f-cc12e854ab33}"),
  contractID:       "@instantbird.org/status/clh;1",
  QueryInterface:   XPCOMUtils.generateQI([Ci.nsICommandLineHandler]),

  /** nsICommandLineHandler **/
  handle: function(cmdLine) {
    let statusIndex = cmdLine.findFlag("status", false);
    if (statusIndex == -1 || cmdLine.length <= statusIndex + 1)
      return;

    let statusParam = cmdLine.getArgument(statusIndex + 1).toLowerCase();

    // Remove the arguments since they've been handled.
    cmdLine.removeArguments(statusIndex, statusIndex + 1);

    // We're keeping the old status message here.
    let us = Services.core.globalUserStatus;
    us.setStatus(Status.toFlag(statusParam), us.statusText);

    // Only perform the default action (i.e. loading the buddy list) if
    // Instantbird is launched with a status flag.
    if (cmdLine.state != Ci.nsICommandLine.STATE_INITIAL_LAUNCH)
      cmdLine.preventDefault = true;
  },

  // Follow the guidelines in nsICommandLineHandler.idl for the help info
  // specifically, flag descriptions should start at character 24, and lines
  // should be wrapped at 72 characters with embedded newlines, and finally, the
  // string should end with a newline.
  helpInfo: "  -status <status>     Set the online status.\n" +
            "                       <status> can be one of\n" +
            "                       available, away, offline.\n"
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([StatusCLH]);
