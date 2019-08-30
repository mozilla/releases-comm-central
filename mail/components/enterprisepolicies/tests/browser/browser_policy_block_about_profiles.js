/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

add_task(async function test_about_profiles() {
  await setupPolicyEngineWithJson({
    policies: {
      BlockAboutProfiles: true,
    },
  });

  is(
    Services.policies.isAllowed("about:profiles"),
    false,
    "Policy Engine should report about:profiles as not allowed"
  );

  await checkBlockedPage("about:profiles", true);
});
