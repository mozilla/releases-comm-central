/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export const RemoteContentUtils = {
  /**
   * Normalizes a sender's domain to lowercase ASCII/ACE, preserving the local part.
   * Returns the original address if the domain cannot be converted.
   *
   * @param {string} address - A sender address or @domain entry.
   * @returns {string} The address with a normalized domain, when possible.
   */
  normalizeSenderAddress(address) {
    const atIndex = address.lastIndexOf("@");
    if (atIndex < 0) {
      return address;
    }
    try {
      const domain = Cc["@mozilla.org/network/idn-service;1"]
        .getService(Ci.nsIIDNService)
        .domainToASCII(address.slice(atIndex + 1))
        .toLowerCase();
      return address.slice(0, atIndex + 1) + domain;
    } catch {
      return address;
    }
  },

  /**
   * Returns a lowercase ASCII sender domain.
   *
   * @param {string} domain - A bare domain, without the leading @.
   * @returns {string} The domain with internationalized labels in ACE form.
   * @throws {Error} If the input is invalid or is a public suffix.
   */
  normalizeSenderDomain(domain) {
    const asciiDomain = Cc["@mozilla.org/network/idn-service;1"]
      .getService(Ci.nsIIDNService)
      .domainToASCII(domain)
      .toLowerCase();
    if (
      asciiDomain.length > 253 ||
      !asciiDomain
        .split(".")
        .every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
    ) {
      throw new Error("Invalid sender domain");
    }

    let publicSuffix;
    try {
      publicSuffix = Services.eTLD.getKnownPublicSuffixFromHost(asciiDomain);
    } catch (error) {
      if (error.result == Cr.NS_ERROR_HOST_IS_IP_ADDRESS) {
        return asciiDomain;
      }
      throw error;
    }
    if (publicSuffix == asciiDomain) {
      throw new Error("A sender domain cannot be a public suffix");
    }
    return asciiDomain;
  },
};
