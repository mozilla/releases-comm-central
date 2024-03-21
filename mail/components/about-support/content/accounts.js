/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals CLASS_DATA_PRIVATE, CLASS_DATA_PUBLIC */

"use strict";

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

// Platform-specific includes
var AboutSupportPlatform;
if ("@mozilla.org/windows-registry-key;1" in Cc) {
  const temp = ChromeUtils.importESModule(
    "resource:///modules/AboutSupportWin32.sys.mjs"
  );
  AboutSupportPlatform = temp.AboutSupportPlatform;
} else if ("nsILocalFileMac" in Ci) {
  const temp = ChromeUtils.importESModule(
    "resource:///modules/AboutSupportMac.sys.mjs"
  );
  AboutSupportPlatform = temp.AboutSupportPlatform;
} else {
  const temp = ChromeUtils.importESModule(
    "resource:///modules/AboutSupportUnix.sys.mjs"
  );
  AboutSupportPlatform = temp.AboutSupportPlatform;
}

var gMessengerBundle = Services.strings.createBundle(
  "chrome://messenger/locale/messenger.properties"
);

var gSocketTypes = {};
for (const [str, index] of Object.entries(Ci.nsMsgSocketType)) {
  gSocketTypes[index] = str;
}

var gAuthMethods = {};
for (const [str, index] of Object.entries(Ci.nsMsgAuthMethod)) {
  gAuthMethods[index] = str;
}

// l10n properties in messenger.properties corresponding to each auth method
var gAuthMethodProperties = new Map([
  [0, "authNo"], // Special value defined to be invalid.
  // Some accounts without auth report this.
  [Ci.nsMsgAuthMethod.none, "authNo"],
  [Ci.nsMsgAuthMethod.old, "authOld"],
  [Ci.nsMsgAuthMethod.passwordCleartext, "authPasswordCleartextViaSSL"],
  [Ci.nsMsgAuthMethod.passwordEncrypted, "authPasswordEncrypted"],
  [Ci.nsMsgAuthMethod.GSSAPI, "authKerberos"],
  [Ci.nsMsgAuthMethod.NTLM, "authNTLM"],
  [Ci.nsMsgAuthMethod.External, "authExternal"],
  [Ci.nsMsgAuthMethod.secure, "authAnySecure"],
  [Ci.nsMsgAuthMethod.anything, "authAny"],
  [Ci.nsMsgAuthMethod.OAuth2, "authOAuth2"],
]);

var AboutSupport = {
  /**
   * Gets details about SMTP servers for a given nsIMsgAccount.
   *
   * @returns An array of records, each record containing the name and other details
   *          about one SMTP server.
   */
  _getSMTPDetails(aAccount) {
    const defaultIdentity = aAccount.defaultIdentity;
    const smtpDetails = [];

    for (const identity of aAccount.identities) {
      const isDefault = identity == defaultIdentity;
      const smtpServer = MailServices.smtp.getServerByIdentity(identity);
      if (!smtpServer) {
        continue;
      }
      smtpDetails.push({
        identityName: identity.identityName,
        name: smtpServer.displayname,
        authMethod: smtpServer.authMethod,
        socketType: smtpServer.socketType,
        isDefault,
      });
    }

    return smtpDetails;
  },

  /**
   * Returns account details as an array of records.
   */
  getAccountDetails() {
    const accountDetails = [];

    for (const account of MailServices.accounts.accounts) {
      const server = account.incomingServer;
      accountDetails.push({
        key: account.key,
        name: server.prettyName,
        hostDetails:
          "(" +
          server.type +
          ") " +
          server.hostName +
          (server.port != -1 ? ":" + server.port : ""),
        socketType: server.socketType,
        authMethod: server.authMethod,
        smtpServers: this._getSMTPDetails(account),
      });
    }

    function idCompare(accountA, accountB) {
      const regex = /^account([0-9]+)$/;
      const regexA = regex.exec(accountA.key);
      const regexB = regex.exec(accountB.key);
      // There's an off chance that the account ID isn't in the standard
      // accountN form. If so, use the standard string compare against a fixed
      // string ("account") to avoid correctness issues.
      if (!regexA || !regexB) {
        const keyA = regexA ? "account" : accountA.key;
        const keyB = regexB ? "account" : accountB.key;
        return keyA.localeCompare(keyB);
      }
      const idA = parseInt(regexA[1]);
      const idB = parseInt(regexB[1]);
      return idA - idB;
    }

    // Sort accountDetails by account ID.
    accountDetails.sort(idCompare);
    return accountDetails;
  },

  /**
   * Returns the corresponding text for a given socket type index. The text is
   * returned as a record with "localized" and "neutral" entries.
   */
  getSocketTypeText(aIndex) {
    const plainSocketType =
      aIndex in gSocketTypes ? gSocketTypes[aIndex] : aIndex;
    let prettySocketType;
    try {
      prettySocketType = gMessengerBundle.GetStringFromName(
        "smtpServer-ConnectionSecurityType-" + aIndex
      );
    } catch (e) {
      if (e.result == Cr.NS_ERROR_FAILURE) {
        // The string wasn't found in the bundle. Make do without it.
        prettySocketType = plainSocketType;
      } else {
        throw e;
      }
    }
    return { localized: prettySocketType, neutral: plainSocketType };
  },

  /**
   * Returns the corresponding text for a given authentication method index. The
   * text is returned as a record with "localized" and "neutral" entries.
   */
  getAuthMethodText(aIndex) {
    let prettyAuthMethod;
    const plainAuthMethod =
      aIndex in gAuthMethods ? gAuthMethods[aIndex] : aIndex;
    if (gAuthMethodProperties.has(parseInt(aIndex))) {
      prettyAuthMethod = gMessengerBundle.GetStringFromName(
        gAuthMethodProperties.get(parseInt(aIndex))
      );
    } else {
      prettyAuthMethod = plainAuthMethod;
    }
    return { localized: prettyAuthMethod, neutral: plainAuthMethod };
  },
};

function createParentElement(tagName, childElems) {
  const elem = document.createElement(tagName);
  appendChildren(elem, childElems);
  return elem;
}

function createElement(tagName, textContent, opt_attributes, opt_copyData) {
  if (opt_attributes == null) {
    opt_attributes = {};
  }
  const elem = document.createElement(tagName);
  elem.textContent = textContent;
  for (const key in opt_attributes) {
    elem.setAttribute(key, "" + opt_attributes[key]);
  }

  if (opt_copyData != null) {
    elem.dataset.copyData = opt_copyData;
  }

  return elem;
}

function appendChildren(parentElem, children) {
  for (let i = 0; i < children.length; i++) {
    parentElem.appendChild(children[i]);
  }
}

/**
 * Coerces x into a string.
 */
function toStr(x) {
  return "" + x;
}

/**
 * Marks x as private (see below).
 */
function toPrivate(x) {
  return { localized: x, neutral: x, isPrivate: true };
}

/**
 * A list of fields for the incoming server of an account. Each element of the
 * list is a pair of [property name, transforming function]. The transforming
 * function should take the property and return either a string or an object
 * with the following properties:
 * - localized: the data in (possibly) localized form
 * - neutral: the data in language-neutral form
 * - isPrivate (optional): true if the data is private-only, false if public-only,
 *                         not stated otherwise
 */
var gIncomingDetails = [
  ["key", toStr],
  ["name", toPrivate],
  ["hostDetails", toStr],
  ["socketType", AboutSupport.getSocketTypeText.bind(AboutSupport)],
  ["authMethod", AboutSupport.getAuthMethodText.bind(AboutSupport)],
];

/**
 * A list of fields for the outgoing servers associated with an account. This is
 * similar to gIncomingDetails above.
 */
var gOutgoingDetails = [
  ["identityName", toPrivate],
  ["name", toStr],
  ["socketType", AboutSupport.getSocketTypeText.bind(AboutSupport)],
  ["authMethod", AboutSupport.getAuthMethodText.bind(AboutSupport)],
  ["isDefault", toStr],
];

/**
 * A list of account details.
 */
var gAccountDetails = AboutSupport.getAccountDetails();

function populateAccountsSection() {
  const trAccounts = [];

  function createTD(data, rowSpan) {
    const text = typeof data == "string" ? data : data.localized;
    const copyData = typeof data == "string" ? null : data.neutral;
    const attributes = { rowspan: rowSpan };
    if (typeof data == "object" && "isPrivate" in data) {
      attributes.class = data.isPrivate
        ? CLASS_DATA_PRIVATE
        : CLASS_DATA_PUBLIC;
    }

    return createElement("td", text, attributes, copyData);
  }

  for (const account of gAccountDetails) {
    // We want a minimum rowspan of 1
    const rowSpan = account.smtpServers.length || 1;
    // incomingTDs is an array of TDs
    const incomingTDs = gIncomingDetails.map(([prop, fn]) =>
      createTD(fn(account[prop]), rowSpan)
    );
    // outgoingTDs is an array of arrays of TDs
    let outgoingTDs = [];
    for (const smtp of account.smtpServers) {
      outgoingTDs.push(
        gOutgoingDetails.map(([prop, fn]) => createTD(fn(smtp[prop]), 1))
      );
    }

    // If there are no SMTP servers, add a dummy element to make life easier below
    if (outgoingTDs.length == 0) {
      outgoingTDs = [[]];
    }

    // Add the first SMTP server to this tr.
    const tr = createParentElement("tr", incomingTDs.concat(outgoingTDs[0]));
    trAccounts.push(tr);
    // Add the remaining SMTP servers as separate trs
    for (const tds of outgoingTDs.slice(1)) {
      trAccounts.push(createParentElement("tr", tds));
    }
  }

  appendChildren(document.getElementById("accounts-tbody"), trAccounts);
}

/**
 * Returns a plaintext representation of the accounts data.
 */
function getAccountsText(aHidePrivateData, aIndent) {
  const accumulator = [];

  // Given a string or object, converts it into a language-neutral form
  function neutralizer(data) {
    if (typeof data == "string") {
      return data;
    }
    if ("isPrivate" in data && aHidePrivateData == data.isPrivate) {
      return "";
    }
    return data.neutral;
  }

  for (const account of gAccountDetails) {
    accumulator.push(aIndent + account.key + ":");
    // incomingData is an array of strings
    const incomingData = gIncomingDetails.map(([prop, fn]) =>
      neutralizer(fn(account[prop]))
    );
    accumulator.push(aIndent + "  INCOMING: " + incomingData.join(", "));

    // outgoingData is an array of arrays of strings
    const outgoingData = [];
    for (const smtp of account.smtpServers) {
      outgoingData.push(
        gOutgoingDetails.map(([prop, fn]) => neutralizer(fn(smtp[prop])))
      );
    }

    for (const data of outgoingData) {
      accumulator.push(aIndent + "  OUTGOING: " + data.join(", "));
    }

    accumulator.push("");
  }

  return accumulator.join("\n");
}
