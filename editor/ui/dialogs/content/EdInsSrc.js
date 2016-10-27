/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Insert Source HTML dialog */

var gDataURIs = new Map();

function Startup()
{
  var editor = GetCurrentEditor();
  if (!editor)
  {
    window.close();
    return;
  }

  document.documentElement.getButton("accept").removeAttribute("default");

  // Create dialog object to store controls for easy access
  gDialog.srcInput = document.getElementById("srcInput");

  var selection;
  try {
    selection = editor.outputToString("text/html", kOutputFormatted | kOutputSelectionOnly | kOutputWrap);
  } catch (e) {}
  if (selection)
  {
    var count = 0;
    selection = (selection.replace(/<body[^>]*>/,"")).replace(/<\/body>/,"");
    // Hide the raw binary data part of data URIs.
    selection = selection.replace(/(src|href)(="data:[^;]*;base64,)[^"]+/gi,
      function(match, attr, nonDataPart) {
        count++;
        gDataURIs.set(count, match);
        return attr + nonDataPart + " … [" + count + "]";
      });
    if (selection)
      gDialog.srcInput.value = selection;
  }
  // Set initial focus
  gDialog.srcInput.focus();
  // Note: We can't set the caret location in a multiline textbox
  SetWindowLocation();
}

function onAccept()
{
  var html = gDialog.srcInput.value;
  if (!html)
    return false;

  // Add back the original data URIs we stashed away earlier.
  html = html.replace(/(src|href)="data:[^;]*;base64, … \[([0-9]+)\]/gi,
    function(match, attr, num) {
      var index = parseInt(num);
      if (!gDataURIs.has(index))
        return match; // user edited number
      return gDataURIs.get(index);
    });

  try {
    GetCurrentEditor().insertHTML(html);
  } catch (e) {}
  SaveWindowLocation();

  return true;
}

