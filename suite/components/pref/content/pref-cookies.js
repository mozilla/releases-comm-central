/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function Startup()
{
  SetDisables(false);
}

function SetDisables(aSetFocus)
{
  // Policy 1 was "ask before accepting" and is no longer valid.

  // const for Cookie Accept Policy
  const kCookiesDisabled = 2;
  // const for Cookie Lifetime Policy
  const kAcceptForNDays = 3;

  var behavior = document.getElementById("networkCookieBehavior");
  var behaviorPref = document.getElementById(behavior.getAttribute("preference"));

  var lifetime = document.getElementById("networkCookieLifetime");
  var lifetimePref = document.getElementById(lifetime.getAttribute("preference"));
  var days = document.getElementById("lifetimeDays");
  var daysPref = document.getElementById(days.getAttribute("preference"));

  var cookiesDisabled = (behaviorPref.value == kCookiesDisabled);
  lifetime.disabled = cookiesDisabled || lifetimePref.locked;
  days.disabled = cookiesDisabled || daysPref.locked ||
                  (lifetimePref.value != kAcceptForNDays);

  if (!days.disabled && aSetFocus)
    days.focus();
}
