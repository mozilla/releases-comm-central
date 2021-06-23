/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { Services } = ChromeUtils.import("resource:///modules/imServices.jsm");
const { XPCOMUtils, l10nHelper } = ChromeUtils.import(
  "resource:///modules/imXPCOMUtils.jsm"
);
const { OTR } = ChromeUtils.import("resource:///modules/OTR.jsm");

var [mode, uiConv, contactInfo] = window.arguments;

function showSection(selected, hideMenu) {
  document.getElementById("how").hidden = !!hideMenu;
  ["questionAndAnswer", "sharedSecret", "manualVerification", "ask"].forEach(
    function(key) {
      document.getElementById(key).hidden = key !== selected;
    }
  );
  window.sizeToContent();
}

function startSMP(context, answer, question) {
  OTR.sendSecret(context, answer, question);
  OTR.authUpdate(context, 10);
}

function manualVerification(fingerprint, context) {
  let opts = document.getElementById("verifiedOption");
  let trust = opts.selectedItem.value === "yes";
  OTR.setTrust(fingerprint, trust, context);
}

async function populateFingers(context, theirs, trust) {
  let yours = OTR.privateKeyFingerprint(context.account, context.protocol);
  if (!yours) {
    throw new Error("Fingerprint should already be generated.");
  }

  let [yourFPLabel, theirFPLabel] = await document.l10n.formatValues([
    { id: "auth-your-fp-value", args: { own_name: context.account } },
    { id: "auth-their-fp-value", args: { their_name: context.username } },
  ]);

  document.getElementById("yourFPLabel").value = yourFPLabel;
  document.getElementById("theirFPLabel").value = theirFPLabel;

  document.getElementById("yourFPValue").value = yours;
  document.getElementById("theirFPValue").value = theirs;

  let opts = document.getElementById("verifiedOption");
  let verified = trust ? "yes" : "no";
  for (let item of opts.menupopup.children) {
    if (verified === item.value) {
      opts.selectedItem = item;
      break;
    }
  }
}

var otrAuth = {
  async onload() {
    // This window implements the interactive authentication of a buddy's
    // key. At open time, we're given several parameters, and the "mode"
    // parameter tells us from where we've been called.
    // mode == "pref" means that we have been opened from the preferences,
    // and it means we cannot rely on the other user being online, and
    // we there might be no uiConv active currently, so we fall back.

    let nameSource =
      mode === "pref" ? contactInfo.screenname : uiConv.normalizedName;
    let title = await document.l10n.formatValue("auth-title", {
      name: nameSource,
    });
    document.title = title;

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
        let receivedQuestionLabel = document.getElementById(
          "receivedQuestionLabel"
        );
        let receivedQuestionDisplay = document.getElementById(
          "receivedQuestion"
        );
        let responseLabel = document.getElementById("responseLabel");
        if (contactInfo.question) {
          receivedQuestionLabel.hidden = false;
          receivedQuestionDisplay.hidden = false;
          receivedQuestionDisplay.value = contactInfo.question;
          responseLabel.value = await document.l10n.formatValue("auth-answer");
        } else {
          receivedQuestionLabel.hidden = true;
          receivedQuestionDisplay.hidden = true;
          responseLabel.value = await document.l10n.formatValue("auth-secret");
        }
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
      // Close the ask-auth notification if it was previously triggered.
      OTR.notifyObservers(
        {
          context,
        },
        "otr:cancel-ask-auth"
      );
    }
  },

  oninput(e) {
    document
      .getElementById("otrAuthDialog")
      .querySelector("dialog")
      .getButton("accept").disabled = !e.value;
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

  async help() {
    let [helpTitle, helpText] = await document.l10n.formatValues([
      { id: "auth-help-title" },
      { id: "auth-help" },
    ]);

    Services.prompt.alert(window, helpTitle, helpText);
  },
};
