/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

const HOSTNAME_DOMAIN = "browser_policy_clear_blocked_cookies.com";
const ORIGIN_DOMAIN = "browser_policy_clear_blocked_cookies.org";

add_setup(async function () {
  const expiry = Date.now() + 24 * 60 * 60;
  Services.cookies.add(
    HOSTNAME_DOMAIN,
    "/",
    "secure",
    "true",
    true,
    false,
    false,
    expiry,
    {},
    Ci.nsICookie.SAMESITE_NONE,
    Ci.nsICookie.SCHEME_HTTPS
  );
  Services.cookies.add(
    HOSTNAME_DOMAIN,
    "/",
    "insecure",
    "true",
    false,
    false,
    false,
    expiry,
    {},
    Ci.nsICookie.SAMESITE_NONE,
    Ci.nsICookie.SCHEME_HTTP
  );
  Services.cookies.add(
    ORIGIN_DOMAIN,
    "/",
    "secure",
    "true",
    true,
    false,
    false,
    expiry,
    {},
    Ci.nsICookie.SAMESITE_NONE,
    Ci.nsICookie.SCHEME_HTTPS
  );
  Services.cookies.add(
    ORIGIN_DOMAIN,
    "/",
    "insecure",
    "true",
    false,
    false,
    false,
    expiry,
    {},
    Ci.nsICookie.SAMESITE_NONE,
    Ci.nsICookie.SCHEME_HTTP
  );
  Services.cookies.add(
    "example.net",
    "/",
    "secure",
    "true",
    true,
    false,
    false,
    expiry,
    {},
    Ci.nsICookie.SAMESITE_NONE,
    Ci.nsICookie.SCHEME_HTTPS
  );
  await setupPolicyEngineWithJson({
    policies: {
      Cookies: {
        Block: [`http://${HOSTNAME_DOMAIN}`, `https://${ORIGIN_DOMAIN}:8080`],
      },
    },
  });
});

function retrieve_all_cookies(host) {
  const values = [];
  for (const cookie of Services.cookies.getCookiesFromHost(host, {})) {
    values.push({
      host: cookie.host,
      name: cookie.name,
      path: cookie.path,
    });
  }
  return values;
}

add_task(async function test_cookies_for_blocked_sites_cleared() {
  const cookies = {
    hostname: retrieve_all_cookies(HOSTNAME_DOMAIN),
    origin: retrieve_all_cookies(ORIGIN_DOMAIN),
    keep: retrieve_all_cookies("example.net"),
  };
  const expected = {
    hostname: [],
    origin: [],
    keep: [{ host: "example.net", name: "secure", path: "/" }],
  };
  equal(
    JSON.stringify(cookies),
    JSON.stringify(expected),
    "All stored cookies for blocked origins should be cleared"
  );
});

add_task(async function test_cookies_cleared_with_preset_marker() {
  const cv = Services.cookies.add(
    HOSTNAME_DOMAIN,
    "/",
    "insecure",
    "true",
    false,
    false,
    false,
    Date.now() + 24 * 60 * 60,
    {},
    Ci.nsICookie.SAMESITE_UNSET,
    Ci.nsICookie.SCHEME_HTTP
  );
  Assert.equal(cv.result, Ci.nsICookieValidation.eOK);

  const markerPref =
    "browser.policies.runOncePerModification.clearCookiesForBlockedHosts";
  Services.prefs.setStringPref(
    markerPref,
    [HOSTNAME_DOMAIN, ORIGIN_DOMAIN].sort().join("\n")
  );

  await setupPolicyEngineWithJson({
    policies: {
      Cookies: {
        Block: [`http://${HOSTNAME_DOMAIN}`, `https://${ORIGIN_DOMAIN}:8080`],
      },
    },
  });

  deepEqual(
    retrieve_all_cookies(HOSTNAME_DOMAIN),
    [],
    "Stored cookies for blocked origins are cleared even if the marker pref is set"
  );
  ok(
    !Services.prefs.prefHasUserValue(markerPref),
    "The obsolete marker pref is cleared"
  );
});

add_task(async function test_only_blocked_host_and_subdomains_cleared() {
  const hosts = [
    "example.org",
    "www.example.org",
    "ads.example.org",
    "tracker.ads.example.org",
  ];
  for (const host of hosts) {
    const cv = Services.cookies.add(
      host,
      "/",
      "insecure",
      "true",
      false,
      false,
      false,
      Date.now() + 24 * 60 * 60,
      {},
      Ci.nsICookie.SAMESITE_UNSET,
      Ci.nsICookie.SCHEME_HTTP
    );
    Assert.equal(cv.result, Ci.nsICookieValidation.eOK);
  }

  await setupPolicyEngineWithJson({
    policies: {
      Cookies: {
        Block: ["http://ads.example.org"],
      },
    },
  });

  deepEqual(
    Services.cookies
      .getCookiesWithOriginAttributes("{}", "example.org")
      .map(cookie => cookie.rawHost)
      .sort(),
    ["example.org", "www.example.org"],
    "Only cookies of the blocked host and its subdomains are cleared"
  );
});

add_task(function teardown() {
  for (const host of [
    HOSTNAME_DOMAIN,
    ORIGIN_DOMAIN,
    "example.net",
    "example.org",
  ]) {
    Services.cookies.removeCookiesWithOriginAttributes("{}", host);
  }
});
