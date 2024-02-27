/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);
const { l10nHelper } = ChromeUtils.importESModule(
  "resource:///modules/imXPCOMUtils.sys.mjs"
);
const { OTR } = ChromeUtils.importESModule("resource:///modules/OTR.sys.mjs");

window.addEventListener("DOMContentLoaded", event => {
  otrAuth.onload();
});

var [mode, uiConv, contactInfo] = window.arguments;

function showSection(selected, hideMenu) {
  document.getElementById("how").hidden = !!hideMenu;
  ["questionAndAnswer", "sharedSecret", "manualVerification", "ask"].forEach(
    function (key) {
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
  const opts = document.getElementById("verifiedOption");
  const trust = opts.selectedItem.value === "yes";
  OTR.setTrust(fingerprint, trust, context);
}

async function populateFingers(context, theirs, trust) {
  const yours = OTR.privateKeyFingerprint(context.account, context.protocol);
  if (!yours) {
    throw new Error("Fingerprint should already be generated.");
  }

  const [yourFPLabel, theirFPLabel] = await document.l10n.formatValues([
    { id: "auth-your-fp-value", args: { own_name: context.account } },
    { id: "auth-their-fp-value", args: { their_name: context.username } },
  ]);

  document.getElementById("yourFPLabel").value = yourFPLabel;
  document.getElementById("theirFPLabel").value = theirFPLabel;

  document.getElementById("yourFPValue").value = yours;
  document.getElementById("theirFPValue").value = theirs;

  const opts = document.getElementById("verifiedOption");
  const verified = trust ? "yes" : "no";
  for (const item of opts.menupopup.children) {
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

    const nameSource =
      mode === "pref" ? contactInfo.screenname : uiConv.normalizedName;
    const title = await document.l10n.formatValue("auth-title", {
      name: nameSource,
    });
    document.title = title;

    document.addEventListener("dialogaccept", () => {
      return this.accept();
    });

    document.addEventListener("dialogcancel", () => {
      return this.cancel();
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
      case "ask": {
        const receivedQuestionLabel = document.getElementById(
          "receivedQuestionLabel"
        );
        const receivedQuestionDisplay =
          document.getElementById("receivedQuestion");
        const responseLabel = document.getElementById("responseLabel");
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
    }
  },

  accept() {
    // uiConv may not be present in pref mode
    const context = uiConv ? OTR.getContext(uiConv.target) : null;
    if (mode === "pref") {
      manualVerification(contactInfo.fpointer, context);
    } else if (mode === "start") {
      const how = document.getElementById("howOption");
      switch (how.selectedItem.value) {
        case "questionAndAnswer": {
          const question = document.getElementById("question").value;
          const answer = document.getElementById("answer").value;
          startSMP(context, answer, question);
          break;
        }
        case "sharedSecret": {
          const secret = document.getElementById("secret").value;
          startSMP(context, secret);
          break;
        }
        case "manualVerification":
          manualVerification(context.fingerprint, context);
          break;
        default:
          throw new Error("Unreachable!");
      }
    } else if (mode === "ask") {
      const response = document.getElementById("response").value;
      OTR.sendResponse(context, response);
      OTR.authUpdate(context, contactInfo.progress);
    } else {
      throw new Error("Unreachable!");
    }
    return true;
  },

  cancel() {
    if (mode === "ask") {
      const context = OTR.getContext(uiConv.target);
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
    document.querySelector("dialog").getButton("accept").disabled = !e.value;
  },

  how() {
    const how = document.getElementById("howOption").selectedItem.value;
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
};
