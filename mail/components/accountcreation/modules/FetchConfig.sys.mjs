/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AccountCreationUtils } from "resource:///modules/accountcreation/AccountCreationUtils.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  FetchHTTP: "resource:///modules/accountcreation/FetchHTTP.sys.mjs",
  readFromXML: "resource:///modules/accountcreation/readFromXML.sys.mjs",
  Sanitizer: "resource:///modules/accountcreation/Sanitizer.sys.mjs",
});

import { DNS } from "resource:///modules/DNS.sys.mjs";

const { JXON } = ChromeUtils.import("resource:///modules/JXON.jsm");

const {
  Abortable,
  ddump,
  Exception,
  PriorityOrderAbortable,
  PromiseAbortable,
  readURLasUTF8,
  runAsync,
  SuccessiveAbortable,
  TimeoutAbortable,
} = AccountCreationUtils;

/**
 * Tries to find a configuration for this ISP on the local harddisk, in the
 * application install directory's "isp" subdirectory.
 * Params @see fetchConfigFromISP()
 */
function fetchConfigFromDisk(domain, successCallback, errorCallback) {
  return new TimeoutAbortable(
    runAsync(function () {
      try {
        // <TB installdir>/isp/example.com.xml
        var configLocation = Services.dirsvc.get("CurProcD", Ci.nsIFile);
        configLocation.append("isp");
        configLocation.append(lazy.Sanitizer.hostname(domain) + ".xml");

        if (!configLocation.exists() || !configLocation.isReadable()) {
          errorCallback(new Exception("local file not found"));
          return;
        }
        var contents = readURLasUTF8(Services.io.newFileURI(configLocation));
        const domParser = new DOMParser();
        const xml = JXON.build(domParser.parseFromString(contents, "text/xml"));
        successCallback(lazy.readFromXML(xml, "disk"));
      } catch (e) {
        errorCallback(e);
      }
    })
  );
}

/**
 * Tries to get a configuration from the ISP / mail provider directly.
 *
 * Disclaimers:
 * - To support domain hosters, we cannot use SSL. That means we
 *   rely on insecure DNS and http, which means the results may be
 *   forged when under attack. The same is true for guessConfig(), though.
 *
 * @param domain {String} - The domain part of the user's email address
 * @param emailAddress {String} - The user's email address
 * @param successCallback {Function(config {AccountConfig}})}   A callback that
 *         will be called when we could retrieve a configuration.
 *         The AccountConfig object will be passed in as first parameter.
 * @param errorCallback {Function(ex)} - A callback that
 *         will be called when we could not retrieve a configuration,
 *         for whatever reason. This is expected (e.g. when there's no config
 *         for this domain at this location),
 *         so do not unconditionally show this to the user.
 *         The first parameter will be an exception object or error string.
 */
function fetchConfigFromISP(
  domain,
  emailAddress,
  successCallback,
  errorCallback
) {
  if (
    !Services.prefs.getBoolPref("mailnews.auto_config.fetchFromISP.enabled")
  ) {
    errorCallback(new Exception("ISP fetch disabled per user preference"));
    return new Abortable();
  }

  const conf1 =
    "autoconfig." + lazy.Sanitizer.hostname(domain) + "/mail/config-v1.1.xml";
  // .well-known/ <http://tools.ietf.org/html/draft-nottingham-site-meta-04>
  const conf2 =
    lazy.Sanitizer.hostname(domain) +
    "/.well-known/autoconfig/mail/config-v1.1.xml";
  // This list is sorted by decreasing priority
  var urls = ["https://" + conf1, "https://" + conf2];
  if (
    !Services.prefs.getBoolPref("mailnews.auto_config.fetchFromISP.sslOnly")
  ) {
    urls.push("http://" + conf1, "http://" + conf2);
  }
  const callArgs = {
    urlArgs: {
      emailaddress: emailAddress,
    },
  };
  if (
    !Services.prefs.getBoolPref(
      "mailnews.auto_config.fetchFromISP.sendEmailAddress"
    )
  ) {
    delete callArgs.urlArgs.emailaddress;
  }
  let call;
  let fetch;

  const priority = new PriorityOrderAbortable(
    (xml, call) =>
      successCallback(lazy.readFromXML(xml, `isp-${call.foundMsg}`)),
    errorCallback
  );
  for (const url of urls) {
    call = priority.addCall();
    call.foundMsg = url.startsWith("https") ? "https" : "http";
    fetch = new lazy.FetchHTTP(
      url,
      callArgs,
      call.successCallback(),
      call.errorCallback()
    );
    call.setAbortable(fetch);
    fetch.start();
  }

  return priority;
}

/**
 * Tries to get a configuration for this ISP from a central database at
 * Mozilla servers.
 * Params @see fetchConfigFromISP()
 */
function fetchConfigFromDB(domain, successCallback, errorCallback) {
  let url = Services.prefs.getCharPref("mailnews.auto_config_url");
  if (!url) {
    errorCallback(new Exception("no URL for ISP DB configured"));
    return new Abortable();
  }
  domain = lazy.Sanitizer.hostname(domain);

  // If we don't specify a place to put the domain, put it at the end.
  if (!url.includes("{{domain}}")) {
    url = url + domain;
  } else {
    url = url.replace("{{domain}}", domain);
  }

  const fetch = new lazy.FetchHTTP(
    url,
    { timeout: 10000 }, // 10 seconds
    function (result) {
      successCallback(lazy.readFromXML(result, "db"));
    },
    errorCallback
  );
  fetch.start();
  return fetch;
}

/**
 * Does a lookup of DNS MX, to get the server that is responsible for
 * receiving mail for this domain. Then it takes the domain of that
 * server, and does another lookup (in ISPDB and possibly at ISP autoconfig
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
 * Params @see fetchConfigFromISP()
 */
function fetchConfigForMX(domain, successCallback, errorCallback) {
  const sanitizedDomain = lazy.Sanitizer.hostname(domain);
  const sucAbortable = new SuccessiveAbortable();
  const time = Date.now();

  sucAbortable.current = getMX(
    sanitizedDomain,
    function (mxHostname) {
      // success
      ddump("getmx took " + (Date.now() - time) + "ms");
      const sld = Services.eTLD.getBaseDomainFromHost(mxHostname);
      ddump("base domain " + sld + " for " + mxHostname);
      if (sld == sanitizedDomain) {
        errorCallback(
          new Exception("MX lookup would be no different from domain")
        );
        return;
      }

      // In addition to just the base domain, also check the full domain of the MX server
      // to differentiate between Outlook.com/Hotmail and Office365 business domains.
      let mxDomain;
      try {
        mxDomain = Services.eTLD.getNextSubDomain(mxHostname);
      } catch (ex) {
        // e.g. hostname doesn't have enough components
        console.error(ex); // not fatal
      }
      const priority = new PriorityOrderAbortable(
        successCallback,
        errorCallback
      );
      if (mxDomain && sld != mxDomain) {
        const call = priority.addCall();
        const fetch = fetchConfigFromDB(
          mxDomain,
          call.successCallback(),
          call.errorCallback()
        );
        call.setAbortable(fetch);
      }
      const call = priority.addCall();
      const fetch = fetchConfigFromDB(
        sld,
        call.successCallback(),
        call.errorCallback()
      );
      call.setAbortable(fetch);
      sucAbortable.current = priority;
    },
    errorCallback
  );
  return sucAbortable;
}

/**
 * Queries the DNS MX records for a given domain. Calls `successCallback` with
 * the hostname of the MX server. If there are several entries with different
 * preference values, only the most preferred (i.e. has the lowest value)
 * is used. If there are several most preferred servers (i.e. round robin),
 * only one of them is used.
 *
 * @param {string}  sanitizedDomain @see fetchConfigFromISP()
 * @param {function(hostname {string})} - successCallback
 *   Called when we found an MX for the domain.
 *   For |hostname|, see description above.
 * @param {function({Exception|string})}  errorCallback @see fetchConfigFromISP()
 */
function getMX(sanitizedDomain, successCallback, errorCallback) {
  return new PromiseAbortable(
    DNS.mx(sanitizedDomain),
    function (records) {
      const filteredRecs = records.filter(record => record.host);

      if (filteredRecs.length > 0) {
        const sortedRecs = filteredRecs.sort((a, b) => a.prio > b.prio);
        const firstHost = sortedRecs[0].host;
        successCallback(firstHost);
      } else {
        errorCallback(
          new Exception(
            "No hostname found in MX records for sanitizedDomain=" +
              sanitizedDomain
          )
        );
      }
    },
    errorCallback
  );
}

export const FetchConfig = {
  forMX: fetchConfigForMX,
  fromDB: fetchConfigFromDB,
  fromISP: fetchConfigFromISP,
  fromDisk: fetchConfigFromDisk,
};
