/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { OTR } = ChromeUtils.importESModule("resource:///modules/OTR.sys.mjs");

window.addEventListener("DOMContentLoaded", () => {
  otrAddFinger.onload();
});

var otrAddFinger = {
  onload() {
    const args = window.arguments[0].wrappedJSObject;

    this.fingerWarning = document.getElementById("fingerWarning");
    this.fingerError = document.getElementById("fingerError");
    this.keyCount = document.getElementById("keyCount");

    document.l10n.setAttributes(
      document.getElementById("otrDescription"),
      "otr-add-finger-description",
      {
        name: args.screenname,
      }
    );

    document.addEventListener("dialogaccept", event => {
      const hex = document.getElementById("fingerprint").value;
      let context = OTR.getContextFromRecipient(
        args.account,
        args.protocol,
        args.screenname
      );
      const finger = OTR.addFingerprint(context, hex);
      if (finger.isNull()) {
        event.preventDefault();
        return;
      }
      try {
        // Ignore the return, this is just a test.
        OTR.getUIConvFromContext(context);
      } catch (error) {
        // We expect that a conversation may not have been started.
        context = null;
      }
      OTR.setTrust(finger, true, context);
    });
  },

  addBlankSpace(value) {
    return value
      .replace(/\s/g, "")
      .trim()
      .replace(/(.{8})/g, "$1 ")
      .trim();
  },

  oninput(input) {
    const hex = input.value.replace(/\s/g, "");

    if (/[^0-9A-F]/gi.test(hex)) {
      this.keyCount.hidden = true;
      this.fingerWarning.hidden = false;
      this.fingerError.hidden = false;
    } else {
      this.keyCount.hidden = false;
      this.fingerWarning.hidden = true;
      this.fingerError.hidden = true;
    }

    document.querySelector("dialog").getButton("accept").disabled =
      input.value && !input.validity.valid;

    this.keyCount.value = `${hex.length}/40`;
    input.value = this.addBlankSpace(input.value);
  },

  onblur(input) {
    input.value = this.addBlankSpace(input.value);
  },
};
