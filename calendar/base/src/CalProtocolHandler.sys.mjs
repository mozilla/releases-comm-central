/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * CalProtocolHandler.
 *
 * @param {string} scheme - The scheme to init for (webcal, webcals).
 * @implements {nsIProtocolHandler}
 */
export class CalProtocolHandlerWebcal {
  QueryInterface = ChromeUtils.generateQI(["nsIProtocolHandler"]);

  scheme = "webcal";
  httpScheme = "http";
  httpPort = 80;

  newURI(aSpec, anOriginalCharset, aBaseURI) {
    return Cc["@mozilla.org/network/standard-url-mutator;1"]
      .createInstance(Ci.nsIStandardURLMutator)
      .init(Ci.nsIStandardURL.URLTYPE_STANDARD, this.httpPort, aSpec, anOriginalCharset, aBaseURI)
      .finalize()
      .QueryInterface(Ci.nsIStandardURL);
  }

  newChannel(aUri, aLoadInfo) {
    const uri = aUri.mutate().setScheme(this.httpScheme).finalize();

    let channel;
    if (aLoadInfo) {
      channel = Services.io.newChannelFromURIWithLoadInfo(uri, aLoadInfo);
    } else {
      channel = Services.io.newChannelFromURI(
        uri,
        null,
        Services.scriptSecurityManager.getSystemPrincipal(),
        null,
        Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
        Ci.nsIContentPolicy.TYPE_OTHER
      );
    }
    channel.originalURI = aUri;
    return channel;
  }

  allowPort() {
    return false; // We are not overriding any special ports.
  }
}

CalProtocolHandlerWebcal.prototype.classID = Components.ID(
  "{1153c73a-39be-46aa-9ba9-656d188865ca}"
);

export class CalProtocolHandlerWebcals extends CalProtocolHandlerWebcal {
  scheme = "webcals";
  httpScheme = "http";
  httpPort = 443;
}

CalProtocolHandlerWebcals.prototype.classID = Components.ID(
  "{bdf71224-365d-4493-856a-a7e74026f766}"
);
