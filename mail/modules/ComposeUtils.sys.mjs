/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export var ComposeUtils = {
  isURLOfMessage,
  loadBlockedImage,
};

/**
 * Convert the blocked content to a data URL.
 *
 * @param {string} url - (necko) URL to unblock.
 * @returns {string} the image as data: URL.
 * @throws {Error} if reading the data failed.
 */
function loadBlockedImage(url) {
  let filename;
  if (/^(file|chrome|moz-extension):/i.test(url)) {
    filename = url.split("/").at(-1);
  } else {
    const fnMatch = /[?&;]filename=([^?&]+)/.exec(url);
    filename = fnMatch?.[1] || "";
  }
  filename = decodeURIComponent(filename);
  const uri = Services.io.newURI(url);
  let contentType;
  if (filename) {
    try {
      contentType = Cc["@mozilla.org/mime;1"]
        .getService(Ci.nsIMIMEService)
        .getTypeFromURI(uri);
    } catch (ex) {
      contentType = "image/png";
    }

    if (!contentType.startsWith("image/")) {
      // Unsafe to unblock this. It would just be garbage either way.
      throw new Error(`Won't unblock; URL=${url}, contentType=${contentType}`);
    }
  } else {
    // Assuming image/png is the best we can do.
    contentType = "image/png";
  }
  const channel = Services.io.newChannelFromURI(
    uri,
    null,
    Services.scriptSecurityManager.getSystemPrincipal(),
    null,
    Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
    Ci.nsIContentPolicy.TYPE_OTHER
  );
  const inputStream = channel.open();
  const stream = Cc["@mozilla.org/binaryinputstream;1"].createInstance(
    Ci.nsIBinaryInputStream
  );
  stream.setInputStream(inputStream);
  let streamData = "";
  try {
    while (stream.available() > 0) {
      streamData += stream.readBytes(stream.available());
    }
  } catch (e) {
    stream.close();
    throw new Error(`Couldn't read all data from URL=${url}`, { cause: e });
  }
  stream.close();
  const encoded = btoa(streamData);
  const dataURL =
    "data:" +
    contentType +
    (filename ? ";filename=" + encodeURIComponent(filename) : "") +
    ";base64," +
    encoded;

  return dataURL;
}

/**
 * Check whether a URL refers to the message with the given URL, or a part of
 * it. The URL must not merely start with the message URL: the message URL must
 * be followed by the start of a query, another query part or an IMAP section
 * ("/;section="), so that e.g. message number 2 does not match message
 * number 20.
 *
 * @param {string} aURL - The URL to check.
 * @param {string} aMsgURL - The URL of the message.
 * @returns {boolean} true if aURL refers to the message or a part of it.
 */
function isURLOfMessage(aURL, aMsgURL) {
  if (!aURL.startsWith(aMsgURL)) {
    return false;
  }
  if (
    aURL.length == aMsgURL.length ||
    aMsgURL.endsWith("?") ||
    aMsgURL.endsWith("&")
  ) {
    return true;
  }
  const rest = aURL.substring(aMsgURL.length);
  return ["?", "&", "#", "/;"].some(sep => rest.startsWith(sep));
}
