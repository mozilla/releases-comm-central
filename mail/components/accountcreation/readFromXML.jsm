/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["readFromXML"];

const lazy = {};

ChromeUtils.defineModuleGetter(
  lazy,
  "AccountConfig",
  "resource:///modules/accountcreation/AccountConfig.jsm"
);
ChromeUtils.defineModuleGetter(
  lazy,
  "AccountCreationUtils",
  "resource:///modules/accountcreation/AccountCreationUtils.jsm"
);
ChromeUtils.defineModuleGetter(
  lazy,
  "Sanitizer",
  "resource:///modules/accountcreation/Sanitizer.jsm"
);

/* eslint-disable complexity */
/**
 * Takes an XML snipplet (as JXON) and reads the values into
 * a new AccountConfig object.
 * It does so securely (or tries to), by trying to avoid remote execution
 * and similar holes which can appear when reading too naively.
 * Of course it cannot tell whether the actual values are correct,
 * e.g. it can't tell whether the host name is a good server.
 *
 * The XML format is documented at
 * <https://wiki.mozilla.org/Thunderbird:Autoconfiguration:ConfigFileFormat>
 *
 * @param clientConfigXML {JXON}  The <clientConfig> node.
 * @param source {String}  Used for the subSource field of AccountConfig.
 * @return AccountConfig   object filled with the data from XML
 */
function readFromXML(clientConfigXML, subSource) {
  function array_or_undef(value) {
    return value === undefined ? [] : value;
  }
  var exception;
  if (
    typeof clientConfigXML != "object" ||
    !("clientConfig" in clientConfigXML) ||
    !("emailProvider" in clientConfigXML.clientConfig)
  ) {
    dump(
      `client config xml = ${JSON.stringify(clientConfigXML).substr(0, 50)} \n`
    );
    let stringBundle = lazy.AccountCreationUtils.getStringBundle(
      "chrome://messenger/locale/accountCreationModel.properties"
    );
    throw stringBundle.GetStringFromName("no_emailProvider.error");
  }
  var xml = clientConfigXML.clientConfig.emailProvider;

  var d = new lazy.AccountConfig();
  d.source = lazy.AccountConfig.kSourceXML;
  d.subSource = `xml-from-${subSource}`;

  d.id = lazy.Sanitizer.hostname(xml["@id"]);
  d.displayName = d.id;
  try {
    d.displayName = lazy.Sanitizer.label(xml.displayName);
  } catch (e) {
    Cu.reportError(e);
  }
  for (var domain of xml.$domain) {
    try {
      d.domains.push(lazy.Sanitizer.hostname(domain));
    } catch (e) {
      Cu.reportError(e);
      exception = e;
    }
  }
  if (d.domains.length == 0) {
    throw exception ? exception : "need proper <domain> in XML";
  }
  exception = null;

  // incoming server
  for (let iX of array_or_undef(xml.$incomingServer)) {
    // input (XML)
    let iO = d.createNewIncoming(); // output (object)
    try {
      // throws if not supported
      iO.type = lazy.Sanitizer.enum(iX["@type"], [
        "pop3",
        "imap",
        "nntp",
        "exchange",
      ]);
      iO.hostname = lazy.Sanitizer.hostname(iX.hostname);
      iO.port = lazy.Sanitizer.integerRange(iX.port, 1, 65535);
      // We need a username even for Kerberos, need it even internally.
      iO.username = lazy.Sanitizer.string(iX.username); // may be a %VARIABLE%

      if ("password" in iX) {
        d.rememberPassword = true;
        iO.password = lazy.Sanitizer.string(iX.password);
      }

      for (let iXsocketType of array_or_undef(iX.$socketType)) {
        try {
          iO.socketType = lazy.Sanitizer.translate(iXsocketType, {
            plain: 1,
            SSL: 2,
            STARTTLS: 3,
          });
          break; // take first that we support
        } catch (e) {
          exception = e;
        }
      }
      if (!iO.socketType) {
        throw exception ? exception : "need proper <socketType> in XML";
      }
      exception = null;

      for (let iXauth of array_or_undef(iX.$authentication)) {
        try {
          iO.auth = lazy.Sanitizer.translate(iXauth, {
            "password-cleartext": Ci.nsMsgAuthMethod.passwordCleartext,
            // @deprecated TODO remove
            plain: Ci.nsMsgAuthMethod.passwordCleartext,
            "password-encrypted": Ci.nsMsgAuthMethod.passwordEncrypted,
            // @deprecated TODO remove
            secure: Ci.nsMsgAuthMethod.passwordEncrypted,
            GSSAPI: Ci.nsMsgAuthMethod.GSSAPI,
            NTLM: Ci.nsMsgAuthMethod.NTLM,
            OAuth2: Ci.nsMsgAuthMethod.OAuth2,
          });
          break; // take first that we support
        } catch (e) {
          exception = e;
        }
      }
      if (!iO.auth) {
        throw exception ? exception : "need proper <authentication> in XML";
      }
      exception = null;

      if (iO.type == "exchange") {
        try {
          if ("owaURL" in iX) {
            iO.owaURL = lazy.Sanitizer.url(iX.owaURL);
          }
        } catch (e) {
          Cu.reportError(e);
        }
        try {
          if ("ewsURL" in iX) {
            iO.ewsURL = lazy.Sanitizer.url(iX.ewsURL);
          }
        } catch (e) {
          Cu.reportError(e);
        }
        try {
          if ("easURL" in iX) {
            iO.easURL = lazy.Sanitizer.url(iX.easURL);
          }
        } catch (e) {
          Cu.reportError(e);
        }
        iO.oauthSettings = {
          issuer: iO.hostname,
          scope: iO.owaURL || iO.ewsURL || iO.easURL,
        };
      }
      // defaults are in accountConfig.js
      if (iO.type == "pop3" && "pop3" in iX) {
        try {
          if ("leaveMessagesOnServer" in iX.pop3) {
            iO.leaveMessagesOnServer = lazy.Sanitizer.boolean(
              iX.pop3.leaveMessagesOnServer
            );
          }
          if ("daysToLeaveMessagesOnServer" in iX.pop3) {
            iO.daysToLeaveMessagesOnServer = lazy.Sanitizer.integer(
              iX.pop3.daysToLeaveMessagesOnServer
            );
          }
        } catch (e) {
          Cu.reportError(e);
        }
        try {
          if ("downloadOnBiff" in iX.pop3) {
            iO.downloadOnBiff = lazy.Sanitizer.boolean(iX.pop3.downloadOnBiff);
          }
        } catch (e) {
          Cu.reportError(e);
        }
      }

      try {
        if ("useGlobalPreferredServer" in iX) {
          iO.useGlobalPreferredServer = lazy.Sanitizer.boolean(
            iX.useGlobalPreferredServer
          );
        }
      } catch (e) {
        Cu.reportError(e);
      }

      // processed successfully, now add to result object
      if (!d.incoming.hostname) {
        // first valid
        d.incoming = iO;
      } else {
        d.incomingAlternatives.push(iO);
      }
    } catch (e) {
      exception = e;
    }
  }
  if (!d.incoming.hostname) {
    // throw exception for last server
    throw exception ? exception : "Need proper <incomingServer> in XML file";
  }
  exception = null;

  // outgoing server
  for (let oX of array_or_undef(xml.$outgoingServer)) {
    // input (XML)
    let oO = d.createNewOutgoing(); // output (object)
    try {
      if (oX["@type"] != "smtp") {
        let stringBundle = lazy.AccountCreationUtils.getStringBundle(
          "chrome://messenger/locale/accountCreationModel.properties"
        );
        throw stringBundle.GetStringFromName("outgoing_not_smtp.error");
      }
      oO.hostname = lazy.Sanitizer.hostname(oX.hostname);
      oO.port = lazy.Sanitizer.integerRange(oX.port, 1, 65535);

      for (let oXsocketType of array_or_undef(oX.$socketType)) {
        try {
          oO.socketType = lazy.Sanitizer.translate(oXsocketType, {
            plain: 1,
            SSL: 2,
            STARTTLS: 3,
          });
          break; // take first that we support
        } catch (e) {
          exception = e;
        }
      }
      if (!oO.socketType) {
        throw exception ? exception : "need proper <socketType> in XML";
      }
      exception = null;

      for (let oXauth of array_or_undef(oX.$authentication)) {
        try {
          oO.auth = lazy.Sanitizer.translate(oXauth, {
            // open relay
            none: Ci.nsMsgAuthMethod.none,
            // inside ISP or corp network
            "client-IP-address": Ci.nsMsgAuthMethod.none,
            // hope for the best
            "smtp-after-pop": Ci.nsMsgAuthMethod.none,
            "password-cleartext": Ci.nsMsgAuthMethod.passwordCleartext,
            // @deprecated TODO remove
            plain: Ci.nsMsgAuthMethod.passwordCleartext,
            "password-encrypted": Ci.nsMsgAuthMethod.passwordEncrypted,
            // @deprecated TODO remove
            secure: Ci.nsMsgAuthMethod.passwordEncrypted,
            GSSAPI: Ci.nsMsgAuthMethod.GSSAPI,
            NTLM: Ci.nsMsgAuthMethod.NTLM,
            OAuth2: Ci.nsMsgAuthMethod.OAuth2,
          });

          break; // take first that we support
        } catch (e) {
          exception = e;
        }
      }
      if (!oO.auth) {
        throw exception ? exception : "need proper <authentication> in XML";
      }
      exception = null;

      if (
        "username" in oX ||
        // if password-based auth, we need a username,
        // so go there anyways and throw.
        oO.auth == Ci.nsMsgAuthMethod.passwordCleartext ||
        oO.auth == Ci.nsMsgAuthMethod.passwordEncrypted
      ) {
        oO.username = lazy.Sanitizer.string(oX.username);
      }

      if ("password" in oX) {
        d.rememberPassword = true;
        oO.password = lazy.Sanitizer.string(oX.password);
      }

      try {
        // defaults are in accountConfig.js
        if ("addThisServer" in oX) {
          oO.addThisServer = lazy.Sanitizer.boolean(oX.addThisServer);
        }
        if ("useGlobalPreferredServer" in oX) {
          oO.useGlobalPreferredServer = lazy.Sanitizer.boolean(
            oX.useGlobalPreferredServer
          );
        }
      } catch (e) {
        Cu.reportError(e);
      }

      // processed successfully, now add to result object
      if (!d.outgoing.hostname) {
        // first valid
        d.outgoing = oO;
      } else {
        d.outgoingAlternatives.push(oO);
      }
    } catch (e) {
      Cu.reportError(e);
      exception = e;
    }
  }
  if (!d.outgoing.hostname) {
    // throw exception for last server
    throw exception ? exception : "Need proper <outgoingServer> in XML file";
  }
  exception = null;

  d.inputFields = [];
  for (let inputField of array_or_undef(xml.$inputField)) {
    try {
      let fieldset = {
        varname: lazy.Sanitizer.alphanumdash(inputField["@key"]).toUpperCase(),
        displayName: lazy.Sanitizer.label(inputField["@label"]),
        exampleValue: lazy.Sanitizer.label(inputField.value),
      };
      d.inputFields.push(fieldset);
    } catch (e) {
      Cu.reportError(e);
      // For now, don't throw,
      // because we don't support custom fields yet anyways.
    }
  }

  return d;
}
/* eslint-enable complexity */
