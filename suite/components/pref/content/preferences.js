/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The content of this file is loaded into the scope of the
// prefwindow and will be available to all prefpanes!

const {AppConstants} = ChromeUtils.import("resource://gre/modules/AppConstants.jsm");

function OnLoad()
{
  // Make sure that the preferences window fits the screen.
  let dialog    = document.documentElement;
  let curHeight = dialog.scrollHeight;
  let curWidth  = dialog.scrollWidth;

  // Leave some space for desktop toolbar and window decoration.
  let maxHeight = window.screen.availHeight - 48;
  let maxWidth  = window.screen.availWidth  - 24;

  // Trigger overflow situation within 40px for bug 868495 expansions.
  let setHeight = curHeight > maxHeight - 40 ? maxHeight : curHeight;
  let setWidth  = curWidth  > maxWidth ? maxWidth : curWidth;

  if (setHeight == curHeight && setWidth == curWidth)
    dialog.setAttribute("overflow", "visible");

  window.innerHeight = setHeight;
  window.innerWidth  = setWidth;
}

function EnableElementById(aElementId, aEnable, aFocus)
{
  EnableElement(document.getElementById(aElementId), aEnable, aFocus);
}

function EnableElement(aElement, aEnable, aFocus)
{
  let pref = document.getElementById(aElement.getAttribute("preference"));
  let enabled = aEnable && !pref.locked;

  aElement.disabled = !enabled;

  if (enabled && aFocus)
    aElement.focus();
}

function WriteSoundField(aField, aValue)
{
  var file = GetFileFromString(aValue);
  if (file)
  {
    aField.file = file;
    aField.label = (AppConstants.platform == "macosx") ? file.leafName : file.path;
  }
}

function SelectSound(aSoundUrlPref)
{
  var soundUrlPref = aSoundUrlPref;
  let fp = Cc["@mozilla.org/filepicker;1"]
             .createInstance(Ci.nsIFilePicker);
  var prefutilitiesBundle = document.getElementById("bundle_prefutilities");
  fp.init(window, prefutilitiesBundle.getString("choosesound"),
          Ci.nsIFilePicker.modeOpen);

  let file = GetFileFromString(soundUrlPref.value);
  if (file && file.parent && file.parent.exists())
    fp.displayDirectory = file.parent;

  let filterExts = "*.wav; *.wave";
  // On Mac, allow AIFF and CAF files too.
  if (AppConstants.platform == "macosx") {
    filterExts += "; *.aif; *.aiff; *.caf";
  }
  fp.appendFilter(prefutilitiesBundle.getString("SoundFiles"), filterExts);
  fp.appendFilters(Ci.nsIFilePicker.filterAll);
  fp.open(rv => {
    if (rv == Ci.nsIFilePicker.returnOK && fp.fileURL.spec &&
        fp.fileURL.spec.length > 0) {
      soundUrlPref.value = fp.fileURL.spec;
    }
  });
}

function PlaySound(aValue, aMail)
{
  const nsISound = Ci.nsISound;
  var sound = Cc["@mozilla.org/sound;1"]
                .createInstance(nsISound);

  if (aValue)
    sound.play(Services.io.newURI(aValue));
  else if (aMail && (AppConstants.platform != "macosx"))
    sound.playEventSound(nsISound.EVENT_NEW_MAIL_RECEIVED);
  else
    sound.beep();
}
