/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Various utility functions for the caldav provider
 */

/* exported CalDavXmlns, CalDavTagsToXmlns, CalDavNsUnresolver, CalDavNsResolver */
/**
 * Creates an xmlns string with the requested namespace prefixes
 *
 * @param {...string} aRequested - The requested namespace prefixes
 * @returns {string} An xmlns string that can be inserted into xml documents
 */
export function CalDavXmlns(...aRequested) {
  const namespaces = [];
  for (const namespace of aRequested) {
    const nsUri = CalDavNsResolver(namespace);
    if (namespace) {
      namespaces.push(`xmlns:${namespace}='${nsUri}'`);
    }
  }

  return namespaces.join(" ");
}

/**
 * Helper function to gather namespaces from QNames or namespace prefixes, plus a few extra for the
 * remaining request.
 *
 * @param {...string} aTags - Either QNames, or just namespace prefixes to be resolved.
 * @returns {string} The complete namespace string
 */
export function CalDavTagsToXmlns(...aTags) {
  const namespaces = new Set(aTags.map(tag => tag.split(":")[0]));
  return CalDavXmlns(...namespaces.values());
}

/**
 * Resolve the namespace URI to one of the prefixes used in our codebase
 *
 * @param {string} aNamespace - The namespace URI to resolve
 * @returns {?string} The namespace prefix we use
 */
export function CalDavNsUnresolver(aNamespace) {
  const prefixes = {
    "http://apple.com/ns/ical/": "A",
    "DAV:": "D",
    "urn:ietf:params:xml:ns:caldav": "C",
    "http://calendarserver.org/ns/": "CS",
  };
  return prefixes[aNamespace] || null;
}

/**
 * Resolve the namespace URI from one of the prefixes used in our codebase
 *
 * @param {string} aPrefix - The namespace prefix we use
 * @returns {?string} The namespace URI for the prefix
 */
export function CalDavNsResolver(aPrefix) {
  /* eslint-disable id-length */
  const namespaces = {
    A: "http://apple.com/ns/ical/",
    D: "DAV:",
    C: "urn:ietf:params:xml:ns:caldav",
    CS: "http://calendarserver.org/ns/",
  };
  /* eslint-enable id-length */

  return namespaces[aPrefix] || null;
}
