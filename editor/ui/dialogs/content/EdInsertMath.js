/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Insert MathML dialog */

function Startup()
{
  var editor = GetCurrentEditor();
  if (!editor) {
    window.close();
    return;
  }

  // Create dialog object for easy access
  gDialog.accept = document.documentElement.getButton("accept");
  gDialog.mode = document.getElementById("optionMode");
  gDialog.direction = document.getElementById("optionDirection");
  gDialog.input = document.getElementById("input");
  gDialog.output = document.getElementById("output");

  // Set initial focus
  gDialog.input.focus();

  // Verify if the selection is on a <math> and initialize the dialog.
  gDialog.oldMath = editor.getElementOrParentByTagName("math", null);
  if (gDialog.oldMath) {
    // When these attributes are absent or invalid, they default to "inline" and "ltr" respectively.
    gDialog.mode.selectedIndex = gDialog.oldMath.getAttribute("display") == "block" ? 1 : 0;
    gDialog.direction.selectedIndex = gDialog.oldMath.getAttribute("dir") == "rtl" ? 1 : 0;
    gDialog.input.value = TeXZilla.getTeXSource(gDialog.oldMath);
  }

  updateMath();

  SetWindowLocation();
}

function onAccept()
{
  if (gDialog.output.firstChild)
  {
    var editor = GetCurrentEditor();
    editor.beginTransaction();

    try {
      var newMath = editor.document.importNode(gDialog.output.firstChild, true);
      if (gDialog.oldMath) {
        // Replace the old <math> element with the new one.
        editor.selectElement(gDialog.oldMath);
        editor.insertElementAtSelection(newMath, true);
      } else {
        // Insert the new <math> element.
        editor.insertElementAtSelection(newMath, false);
      }
    } catch (e) {}

    editor.endTransaction();
  }
  else
  {
    dump("Null value -- not inserting in MathML Source dialog\n");
    return false;
  }
  SaveWindowLocation();

  return true;
}

function updateMath()
{
  // Remove the preview, if any.
  if (gDialog.output.firstChild)
    gDialog.output.firstChild.remove();

  // Try to convert the LaTeX source into MathML using TeXZilla.
  // If parsing fails, we disable the accept button.
  try {
    if (gDialog.input.value) {
      var newMath = TeXZilla.toMathML(gDialog.input.value, gDialog.mode.selectedIndex, gDialog.direction.selectedIndex, true);
      gDialog.output.appendChild(document.importNode(newMath, true));
    }
  } catch (e) {
  }
  gDialog.accept.disabled = !gDialog.output.firstChild;
}

function updateMode()
{
  if (gDialog.output.firstChild)
    gDialog.output.firstChild.setAttribute("display", gDialog.mode.selectedIndex ? "block" : "inline");
}

function updateDirection()
{
  if (gDialog.output.firstChild)
    gDialog.output.firstChild.setAttribute("dir", gDialog.direction.selectedIndex ? "rtl" : "ltr");
}
