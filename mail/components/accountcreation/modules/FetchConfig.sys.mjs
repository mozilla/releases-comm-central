/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AccountCreationUtils } from "resource:///modules/accountcreation/AccountCreationUtils.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  fetchHTTP: "resource:///modules/accountcreation/FetchHTTP.sys.mjs",
  readFromXML: "resource:///modules/accountcreation/readFromXML.sys.mjs",
  Sanitizer: "resource:///modules/accountcreation/Sanitizer.sys.mjs",
});

import { DNS } from "resource:///modules/DNS.sys.mjs";

import { JXON } from "resource:///modules/JXON.sys.mjs";

const { gAccountSetupLogger, promiseFirstSuccessful } = AccountCreationUtils;

/**
 * Tries to find a configuration for this ISP on the local harddisk, in the
 * application install directory's "isp" subdirectory.
 *
 * @param {string} domain - The domain part of the user's email address.
 * @param {AbortSignal} abortSignal - Abort signal that should cancel the operation.
 * @returns {AccountConfig} The account config.
 * @throws {Error} If no config is found.
 */
async function fetchConfigFromDisk(domain, abortSignal) {
  // <TB installdir>/isp/example.com.xml
  var configLocation = Services.dirsvc.get("CurProcD", Ci.nsIFile);
  configLocation.append("isp");
  configLocation.append(lazy.Sanitizer.hostname(domain) + ".xml");

  if (
    !(await IOUtils.exists(configLocation.path)) ||
    !configLocation.isReadable()
  ) {
    throw new Error("local file not found");
  }
  abortSignal.throwIfAborted();
  var contents = await IOUtils.readUTF8(configLocation.path);
  abortSignal.throwIfAborted();
  const domParser = new DOMParser();
  const xml = JXON.build(domParser.parseFromString(contents, "text/xml"));
  return lazy.readFromXML(xml, "disk");
}

/**
 * Tries to get a configuration from the ISP / mail provider directly.
 *
 * Disclaimers:
 * - To support domain hosters, we cannot use SSL. That means we
 *   rely on insecure DNS and http, which means the results may be
 *   forged when under attack. The same is true for guessConfig(), though.
 *
 * @param {string} domain - The domain part of the user's email address.
 * @param {string} emailAddress - The user's email address.
 * @param {AbortSignal} abortSignal - Abort signal that should cancel the operation.
 * @returns {AccountConfig} The account config.
 * @throws {Error} If no config is found.
 */
async function fetchConfigFromISP(domain, emailAddress, abortSignal) {
  const httpsOnly = Services.prefs.getBoolPref(
    "mailnews.auto_config.fetchFromISP.sslOnly"
  );
  return _fetchConfigFromIsp(
    domain,
    emailAddress,
    httpsOnly,
    true, // useOptionalUrl
    abortSignal
  );
}

/**
 * Tries to get a configuration from the ISP / mail provider directly.
 *
 * @param {string} domain - The domain part of the user's email address.
 * @param {string} emailAddress - The user's email address.
 * @param {boolean} httpsOnly - If true, only uses https-variants of the
 *   autoconfig URLs.
 * @param {boolean} useOptionalUrl - If false, the /.well-known URLs will be
 *   skipped when checking for a configuration.
 * @param {AbortSignal} abortSignal - Abort signal that should cancel the operation.
 * @returns {AccountConfig} The account config.
 * @throws {Error} If no config is found.
 */
async function _fetchConfigFromIsp(
  domain,
  emailAddress,
  httpsOnly,
  useOptionalUrl,
  abortSignal
) {
  if (
    !Services.prefs.getBoolPref("mailnews.auto_config.fetchFromISP.enabled")
  ) {
    throw new Error("ISP fetch disabled per user preference");
  }

  const sanitizedDomain = lazy.Sanitizer.hostname(domain);
  const conf1 = `autoconfig.${sanitizedDomain}/mail/config-v1.1.xml`;

  // .well-known/ <http://tools.ietf.org/html/draft-nottingham-site-meta-04>
  const conf2 = `${sanitizedDomain}/.well-known/autoconfig/mail/config-v1.1.xml`;

  // This list is sorted by decreasing priority
  var urls = ["https://" + conf1];
  if (useOptionalUrl) {
    urls.push("https://" + conf2);
  }

  if (!httpsOnly) {
    urls.push("http://" + conf1);

    if (useOptionalUrl) {
      urls.push("http://" + conf2);
    }
  }
  const priorityAbortController = new AbortController();
  const callArgs = {
    urlArgs: {
      emailaddress: emailAddress,
    },
    signal: AbortSignal.any([abortSignal, priorityAbortController.signal]),
  };
  if (
    !Services.prefs.getBoolPref(
      "mailnews.auto_config.fetchFromISP.sendEmailAddress"
    )
  ) {
    delete callArgs.urlArgs.emailaddress;
  }

  const foundMsgs = [];
  const { value: xml, index } = await promiseFirstSuccessful(
    urls.map((url, i) => {
      foundMsgs[i] = url.startsWith("https") ? "https" : "http";
      return lazy.fetchHTTP(url, callArgs);
    }),
    priorityAbortController
  );
  return lazy.readFromXML(xml, `isp-${foundMsgs[index]}`);
}

/**
 * Tries to get a configuration for this ISP from a central database at
 * Mozilla servers.
 *
 * @param {string} domain - The domain part of the user's email address.
 * @param {AbortSignal} abortSignal - Abort signal that should cancel the operation.
 * @returns {AccountConfig} The account config.
 * @throws {Error} If no config is found.
 */
async function fetchConfigFromDB(domain, abortSignal) {
  let url = Services.prefs.getCharPref("mailnews.auto_config_url");
  if (!url) {
    throw new Error("no URL for ISP DB configured");
  }
  domain = lazy.Sanitizer.hostname(domain);

  // If we don't specify a place to put the domain, put it at the end.
  if (!url.includes("{{domain}}")) {
    url = url + domain;
  } else {
    url = url.replace("{{domain}}", domain);
  }

  const result = await lazy.fetchHTTP(
    url,
    { timeout: 10000, signal: abortSignal } // 10 seconds
  );
  return lazy.readFromXML(result, "db");
}

/**
 * Does a lookup of DNS MX, to get the server that is responsible for
 * receiving mail for this domain. Then it takes the domain of that
 * server, and does another lookup (in ISPDB and at ISP autoconfig
 * server) and if such a config is found, returns that.
 *
 * Disclaimers:
 * - DNS is unprotected, meaning the results could be forged.
 *   The same is true for fetchConfigFromISP() and guessConfig(), though.
 * - DNS MX tells us the incoming server, not the mailbox (IMAP) server.
 *   They are different. This mechanism is only an approximation
 *   for hosted domains (yourname.com is served by mx.hoster.com and
 *   therefore imap.hoster.com - that "therefore" is exactly the
 *   conclusional jump we make here.) and alternative domains
 *   (e.g. yahoo.de -> yahoo.com).
 * - We make a look up for the base domain. E.g. if MX is
 *   mx1.incoming.servers.hoster.com, we look up hoster.com.
 *   Thanks to Services.eTLD, we also get bbc.co.uk right.
 *
 * @param {string} domain - The domain part of the user's email address.
 * @param {string} emailAddress - The user's email address.
 * @param {AbortSignal} abortSignal - Abort signal that should cancel the operation.
 * @returns {AccountConfig} The account config.
 * @throws {Error} If no config is found.
 */
async function fetchConfigForMX(domain, emailAddress, abortSignal) {
  const sanitizedDomain = lazy.Sanitizer.hostname(domain);
  const time = Date.now();

  const mxHostname = await getMX(sanitizedDomain, abortSignal);
  gAccountSetupLogger.debug("getmx took", Date.now() - time, "ms");
  const sld = Services.eTLD.getBaseDomainFromHost(mxHostname);
  gAccountSetupLogger.debug("base domain", sld, "for", mxHostname);
  if (sld == sanitizedDomain) {
    throw new Error("MX lookup would be no different from domain");
  }

  // In addition to just the base domain, also check the full domain of the MX server
  // to differentiate between Outlook.com/Hotmail and Office365 business domains.
  let mxDomain;
  try {
    mxDomain = Services.eTLD.getNextSubDomain(mxHostname);
  } catch (ex) {
    // e.g. hostname doesn't have enough components
    gAccountSetupLogger.error(ex); // not fatal
  }

  const priorityAbortController = new AbortController();
  const priorityAbortSignal = AbortSignal.any([
    abortSignal,
    priorityAbortController.signal,
  ]);
  function fetchConfig(lookupDomain) {
    const ispFetch = _fetchConfigFromIsp(
      lookupDomain,
      emailAddress,
      true, // httpsOnly
      false, // useOptionalUrl
      priorityAbortSignal
    );
    const dbFetch = fetchConfigFromDB(lookupDomain, priorityAbortSignal);
    return [ispFetch, dbFetch];
  }

  const queue = [];
  if (mxDomain && sld != mxDomain) {
    queue.push(...fetchConfig(mxDomain));
  }
  queue.push(...fetchConfig(sld));
  const { value } = await promiseFirstSuccessful(
    queue,
    priorityAbortController
  );
  return value;
}

/**
 * Queries the DNS MX records for a given domain. Calls `successCallback` with
 * the hostname of the MX server. If there are several entries with different
 * preference values, only the most preferred (i.e. has the lowest value) is
 * used. If there are several most preferred servers (i.e. round robin), only
 * one of them is used.
 *
 * @param {string} sanitizedDomain - @see fetchConfigFromISP()
 * @param {AbortSignal} abortSignal - Abort signal that should cancel the
 *   operation.
 * @returns {string} The host found in the MX record.
 * @throws {Error} When there is no suitable DNS response.
 */
async function getMX(sanitizedDomain, abortSignal) {
  const records = await DNS.mx(sanitizedDomain);
  abortSignal.throwIfAborted();
  const filteredRecs = records.filter(record => record.host);

  if (filteredRecs.length > 0) {
    const sortedRecs = filteredRecs.sort((a, b) => a.prio > b.prio);
    const firstHost = sortedRecs[0].host;
    return firstHost;
  }
  throw new Error(
    "No hostname found in MX records for sanitizedDomain=" + sanitizedDomain
  );
}

export const FetchConfig = {
  forMX: fetchConfigForMX,
  fromDB: fetchConfigFromDB,
  fromISP: fetchConfigFromISP,
  fromDisk: fetchConfigFromDisk,
};
