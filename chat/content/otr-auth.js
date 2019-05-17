/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {Services} = ChromeUtils.import("resource:///modules/imServices.jsm");
const {
  XPCOMUtils,
  l10nHelper,
} = ChromeUtils.import("resource:///modules/imXPCOMUtils.jsm");
const {OTR} = ChromeUtils.import("resource:///modules/OTR.jsm");

XPCOMUtils.defineLazyGetter(this, "_", () =>
  l10nHelper("chrome://chat/content/otr-auth.properties")
);

var [mode, uiConv, contactInfo] = window.arguments;

// This window implements the interactive authentication of a buddy's
// key. At open time, we're given several parameters, and the "mode"
// parameter tells us, from where we've been called.
// mode == "pref" means that we have been opened from the preferences,
// and it means we cannot rely on the other user being online, and
// we there might be no uiConv active currently, so we fall back.

document.title = _("auth.title",
  (mode === "pref") ? contactInfo.screenname : uiConv.normalizedName);

function showSection(selected, hideMenu) {
  document.getElementById("how").hidden = !!hideMenu;
  [ "questionAndAnswer",
    "sharedSecret",
    "manualVerification",
    "ask",
  ].forEach(function(key) {
    document.getElementById(key).hidden = (key !== selected);
  });
  window.sizeToContent();
}

function startSMP(context, answer, question) {
  OTR.sendSecret(context, answer, question);
  OTR.authUpdate(context, 10);
}

function manualVerification(fingerprint, context) {
  let opts = document.getElementById("verifiedOption");
  let trust = (opts.selectedItem.value === "yes");
  OTR.setTrust(fingerprint, trust, context);
}

function populateFingers(context, theirs, trust) {
  let fingers = document.getElementById("fingerprints");
  let yours = OTR.privateKeyFingerprint(context.account, context.protocol);
  if (!yours)
    throw new Error("Fingerprint should already be generated.");
  fingers.value =
    _("auth.yourFingerprint", context.account, yours) + "\n\n" +
    _("auth.theirFingerprint", context.username, theirs);
  let opts = document.getElementById("verifiedOption");
  let verified = trust ? "yes" : "no";
  for (let item of opts.menupopup.childNodes) {
    if (verified === item.value) {
      opts.selectedItem = item;
      break;
    }
  }
}

var otrAuth = {
  onload() {
    document.addEventListener("dialogaccept", () => {
      return this.accept();
    });

    document.addEventListener("dialogcancel", () => {
      return this.cancel();
    });

    document.addEventListener("dialoghelp", () => {
      return this.help();
    });

    let context, theirs;
    switch (mode) {
      case "start":
        context = OTR.getContext(uiConv.target);
        theirs = OTR.hashToHuman(context.fingerprint);
        populateFingers(context, theirs, context.trust);
        showSection("questionAndAnswer");
        break;
      case "pref":
        context = OTR.getContextFromRecipient(
          contactInfo.account,
          contactInfo.protocol,
          contactInfo.screenname
        );
        theirs = contactInfo.fingerprint;
        populateFingers(context, theirs, contactInfo.trust);
        showSection("manualVerification", true);
        this.oninput({ value: true });
        break;
      case "ask":
        document.getElementById("askLabel").textContent = contactInfo.question ?
          _("auth.question", contactInfo.question)
          : _("auth.secret");
        showSection("ask", true);
        break;
    }
  },

  accept() {
    // uiConv may not be present in pref mode
    let context = uiConv ? OTR.getContext(uiConv.target) : null;
    if (mode === "pref") {
      manualVerification(contactInfo.fpointer, context);
    } else if (mode === "start") {
      let how = document.getElementById("howOption");
      switch (how.selectedItem.value) {
      case "questionAndAnswer":
        let question = document.getElementById("question").value;
        let answer = document.getElementById("answer").value;
        startSMP(context, answer, question);
        break;
      case "sharedSecret":
        let secret = document.getElementById("secret").value;
        startSMP(context, secret);
        break;
      case "manualVerification":
        manualVerification(context.fingerprint, context);
        break;
      default:
        throw new Error("Unreachable!");
      }
    } else if (mode === "ask") {
      let response = document.getElementById("response").value;
      OTR.sendResponse(context, response);
      OTR.authUpdate(context, contactInfo.progress);
    } else {
      throw new Error("Unreachable!");
    }
    return true;
  },

  cancel() {
    if (mode === "ask") {
      let context = OTR.getContext(uiConv.target);
      OTR.abortSMP(context);
    }
  },

  oninput(e) {
    document.documentElement.getButton("accept").disabled = !e.value;
  },

  how() {
    let how = document.getElementById("howOption").selectedItem.value;
    switch (how) {
    case "questionAndAnswer":
      this.oninput(document.getElementById("answer"));
      break;
    case "sharedSecret":
      this.oninput(document.getElementById("secret"));
      break;
    case "manualVerification":
      this.oninput({ value: true });
      break;
    }
    showSection(how);
  },

  help() {
    Services.prompt.alert(window, _("auth.helpTitle"), _("auth.help"));
  },

};
