/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async () => {
  await testCheckboxes("panePrivacy", undefined, {
    checkboxID: "acceptRemoteContent",
    pref: "mailnews.message_display.disable_remote_image",
    prefValues: [true, false],
  }, {
    checkboxID: "keepHistory",
    pref: "places.history.enabled",
  }, {
    checkboxID: "acceptCookies",
    pref: "network.cookie.cookieBehavior",
    prefValues: [2, 0],
    enabledElements: ["#acceptThirdPartyMenu", "#keepCookiesUntil"],
  }, {
    checkboxID: "privacyDoNotTrackCheckbox",
    pref: "privacy.donottrackheader.enabled",
  });
});
