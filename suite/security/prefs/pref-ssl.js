/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function Startup()
{
  // map associating preference values with checkbox element IDs
  gSslPrefElements = new Map([[1, "allowTLS10"],
                              [2, "allowTLS11"],
                              [3, "allowTLS12"]]);

  // initial setting of checkboxes based on preference values
  UpdateSslBoxes();
}

function UpdateSslBoxes()
{
  // get minimum and maximum allowed protocol and locked status
  let minVersion = document.getElementById("security.tls.version.min").value;
  let maxVersion = document.getElementById("security.tls.version.max").value;
  let minLocked  = document.getElementById("security.tls.version.min").locked;
  let maxLocked  = document.getElementById("security.tls.version.max").locked;

  // check if allowable limits are violated, use default values if they are
  if (minVersion > maxVersion || !gSslPrefElements.has(minVersion)
                              || !gSslPrefElements.has(maxVersion))
  {
    minVersion = document.getElementById("security.tls.version.min").defaultValue;
    maxVersion = document.getElementById("security.tls.version.max").defaultValue;
  }

  // set checked, disabled, and locked status for each protocol checkbox
  for (let [version, id] of gSslPrefElements)
  {
    let currentBox = document.getElementById(id);
    currentBox.checked = version >= minVersion && version <= maxVersion;

    if ((minLocked && maxLocked) || (minLocked && version <= minVersion) ||
                                    (maxLocked && version >= maxVersion))
    {
      // boxes subject to a preference's locked status are disabled and grayed
      currentBox.removeAttribute("nogray");
      currentBox.disabled = true;
    }
    else
    {
      // boxes which the user can't uncheck are disabled but not grayed
      currentBox.setAttribute("nogray", "true");
      currentBox.disabled = (version > minVersion && version < maxVersion) ||
                            (version == minVersion && version == maxVersion);
    }
  }
}

function UpdateSslPrefs()
{
  // this is called whenever a checkbox changes
  let minVersion = -1;
  let maxVersion = -1;

  // find the first and last checkboxes which are now checked
  for (let [version, id] of gSslPrefElements)
  {
    if (document.getElementById(id).checked)
    {
      if (minVersion < 0)  // first box checked
        minVersion = version;
      maxVersion = version;  // last box checked so far
    }
  }

  // if minVersion is valid, then maxVersion is as well -> update prefs
  if (minVersion >= 0)
  {
    document.getElementById("security.tls.version.min").value = minVersion;
    document.getElementById("security.tls.version.max").value = maxVersion;
  }

  // update checkbox values and visibility based on prefs again
  UpdateSslBoxes();
}
