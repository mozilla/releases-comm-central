/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_policy_hardware_acceleration() {
  const winUtils = Services.wm.getMostRecentWindow("").windowUtils;
  is(winUtils.layerManagerType, "Basic", "Hardware acceleration disabled");
});
