/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

add_task(async function test_about_addons() {
  await setupPolicyEngineWithJson({
    "policies": {
      "BlockAboutAddons": true,
    },
  });

  is(Services.policies.isAllowed("about:addons"), false,
     "Policy Engine should report about:addons as not allowed");

  await checkBlockedPage("about:addons", true);
});
