/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_app_update_URL() {
  await setupPolicyEngineWithJson({
    policies: {
      AppUpdateURL: "https://www.example.com/",
    },
  });

  equal(
    Services.policies.status,
    Ci.nsIEnterprisePolicies.ACTIVE,
    "Engine is active"
  );

  const checker = Cc["@mozilla.org/updates/update-checker;1"].getService(
    Ci.nsIUpdateChecker
  );
  const expected = await checker.getUpdateURL(checker.BACKGROUND_CHECK);

  equal("https://www.example.com/", expected, "Correct app update URL");
});
