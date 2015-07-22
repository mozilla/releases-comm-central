/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* This content script should work in any browser or iframe and should not
 * depend on the frame being contained in tabbrowser. */

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "LoginManagerContent",
  "resource://gre/modules/LoginManagerContent.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "InsecurePasswordUtils",
  "resource://gre/modules/InsecurePasswordUtils.jsm");

addMessageListener("RemoteLogins:fillForm", message => {
  LoginManagerContent.receiveMessage(message, content);
});

addEventListener("DOMFormHasPassword", event => {
  LoginManagerContent.onDOMFormHasPassword(event, content);
  InsecurePasswordUtils.checkForInsecurePasswords(event.target);
});

addEventListener("DOMInputPasswordAdded", event => {
  LoginManagerContent.onDOMInputPasswordAdded(event, content);
});

addEventListener("pageshow", event => {
  LoginManagerContent.onPageShow(event, content);
}, true);

addEventListener("DOMAutoComplete", event => {
  LoginManagerContent.onUsernameInput(event);
});

addEventListener("blur", event => {
  LoginManagerContent.onUsernameInput(event);
});
