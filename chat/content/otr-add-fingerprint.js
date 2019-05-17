/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {
  XPCOMUtils,
  l10nHelper,
} = ChromeUtils.import("resource:///modules/imXPCOMUtils.jsm");
const {OTR} = ChromeUtils.import("resource:///modules/OTR.jsm");

XPCOMUtils.defineLazyGetter(this, "_", () =>
  l10nHelper("chrome://chat/content/otr-add-finger.properties")
);

var args = window.arguments[0].wrappedJSObject;

var otrAddFinger = {
  onload() {
    document.title = _("addfinger.title", args.screenname);

    document.addEventListener("dialogaccept", () => {
      return this.add();
    });
  },

  oninput(e) {
    e.value = e.value.replace(/[^0-9a-fA-F]/gi, "");
    document.documentElement.getButton("accept").disabled = (e.value.length != 40);
  },

  add(e) {
    let hex = document.getElementById("finger").value;
    let context = OTR.getContextFromRecipient(
      args.account,
      args.protocol,
      args.screenname
    );
    let finger = OTR.addFingerprint(context, hex);
    if (finger.isNull())
      return;
    try {
      // Ignore the return, this is just a test.
      OTR.getUIConvFromContext(context);
    } catch (error) {
      // We expect that a conversation may not have been started.
      context = null;
    }
    OTR.setTrust(finger, true, context);
  },
};
