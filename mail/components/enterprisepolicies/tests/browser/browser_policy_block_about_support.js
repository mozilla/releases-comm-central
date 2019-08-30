/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

add_task(async function test_about_support() {
  await setupPolicyEngineWithJson({
    policies: {
      BlockAboutSupport: true,
    },
  });

  is(
    Services.policies.isAllowed("about:support"),
    false,
    "Policy Engine should report about:support as not allowed"
  );

  await checkBlockedPage("about:support", true);
});
