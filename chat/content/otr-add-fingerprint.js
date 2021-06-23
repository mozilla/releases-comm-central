/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { l10nHelper } = ChromeUtils.import("resource:///modules/imXPCOMUtils.jsm");
var { OTR } = ChromeUtils.import("resource:///modules/OTR.jsm");

var otrAddFinger = {
  async onload() {
    let args = window.arguments[0].wrappedJSObject;

    this.fingerWarning = document.getElementById("fingerWarning");
    this.fingerError = document.getElementById("fingerError");
    this.keyCount = document.getElementById("keyCount");

    let [description, warningTooltip] = await document.l10n.formatValues([
      { id: "otr-add-finger-description", args: { name: args.screenname } },
      { id: "otr-add-finger-tooltip-error" },
    ]);

    document.getElementById("otrDescription").textContent = description;
    this.fingerWarning.setAttribute("tooltiptext", warningTooltip);

    document.addEventListener("dialogaccept", event => {
      let hex = document.getElementById("fingerprint").value;
      let context = OTR.getContextFromRecipient(
        args.account,
        args.protocol,
        args.screenname
      );
      let finger = OTR.addFingerprint(context, hex);
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

    window.sizeToContent();
  },

  addBlankSpace(value) {
    return value
      .replace(/\s/g, "")
      .trim()
      .replace(/(.{8})/g, "$1 ")
      .trim();
  },

  oninput(input) {
    let hex = input.value.replace(/\s/g, "");

    if (/[^0-9A-F]/gi.test(hex)) {
      this.keyCount.hidden = true;
      this.fingerWarning.hidden = false;
      this.fingerError.hidden = false;
    } else {
      this.keyCount.hidden = false;
      this.fingerWarning.hidden = true;
      this.fingerError.hidden = true;
    }

    document
      .getElementById("otrAddFingerDialog")
      .querySelector("dialog")
      .getButton("accept").disabled = input.value && !input.validity.valid;

    this.keyCount.value = `${hex.length}/40`;
    input.value = this.addBlankSpace(input.value);

    window.sizeToContent();
  },

  onblur(input) {
    input.value = this.addBlankSpace(input.value);
  },
};
