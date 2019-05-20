/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

add_task(async function test_about_config() {
  await setupPolicyEngineWithJson({
    "policies": {
      "BlockAboutConfig": true,
    },
  });

  is(Services.policies.isAllowed("about:config"), false,
     "Policy Engine should report about:config as not allowed");

  await checkBlockedPage("about:config", true);
});
