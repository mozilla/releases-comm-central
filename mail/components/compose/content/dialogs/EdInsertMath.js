/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Insert MathML dialog */

/* import-globals-from ../editorUtilities.js */
/* import-globals-from EdDialogCommon.js */

window.addEventListener("load", Startup);
document.addEventListener("dialogaccept", onAccept);
document.addEventListener("dialogcancel", onCancel);

function Startup() {
  var editor = GetCurrentEditor();

  // Create dialog object for easy access
  gDialog.accept = document.querySelector("dialog").getButton("accept");
  gDialog.mode = document.getElementById("optionMode");
  gDialog.direction = document.getElementById("optionDirection");
  gDialog.input = document.getElementById("input");
  gDialog.output = document.getElementById("output");
  gDialog.tabbox = document.getElementById("tabboxInsertLaTeXCommand");

  // Set initial focus
  gDialog.input.focus();

  // Load TeXZilla
  // TeXZilla.js contains non-ASCII characters and explicitly sets
  // window.TeXZilla, so we have to specify the charset parameter but don't
  // need to worry about the targetObj parameter.
  /* globals TeXZilla */
  Services.scriptloader.loadSubScript(
    "chrome://messenger/content/messengercompose/TeXZilla.js",
    {},
    "UTF-8"
  );

  // Verify if the selection is on a <math> and initialize the dialog.
  gDialog.oldMath = editor.getElementOrParentByTagName("math", null);
  if (gDialog.oldMath) {
    // When these attributes are absent or invalid, they default to "inline" and "ltr" respectively.
    gDialog.mode.selectedIndex =
      gDialog.oldMath.getAttribute("display") == "block" ? 1 : 0;
    gDialog.direction.selectedIndex =
      gDialog.oldMath.getAttribute("dir") == "rtl" ? 1 : 0;
    gDialog.input.value = TeXZilla.getTeXSource(gDialog.oldMath);
  }

  // Create the tabbox with LaTeX commands.
  createCommandPanel({
    "√⅗²": [
      "{⋯}^{⋯}",
      "{⋯}_{⋯}",
      "{⋯}_{⋯}^{⋯}",
      "\\underset{⋯}{⋯}",
      "\\overset{⋯}{⋯}",
      "\\underoverset{⋯}{⋯}{⋯}",
      "\\left(⋯\\right)",
      "\\left[⋯\\right]",
      "\\frac{⋯}{⋯}",
      "\\binom{⋯}{⋯}",
      "\\sqrt{⋯}",
      "\\sqrt[⋯]{⋯}",
      "\\cos\\left({⋯}\\right)",
      "\\sin\\left({⋯}\\right)",
      "\\tan\\left({⋯}\\right)",
      "\\exp\\left({⋯}\\right)",
      "\\ln\\left({⋯}\\right)",
      "\\underbrace{⋯}",
      "\\underline{⋯}",
      "\\overbrace{⋯}",
      "\\widevec{⋯}",
      "\\widetilde{⋯}",
      "\\widehat{⋯}",
      "\\widecheck{⋯}",
      "\\widebar{⋯}",
      "\\dot{⋯}",
      "\\ddot{⋯}",
      "\\boxed{⋯}",
      "\\slash{⋯}",
    ],
    "(▦)": [
      "\\begin{matrix} ⋯ & ⋯ \\\\ ⋯ & ⋯ \\end{matrix}",
      "\\begin{pmatrix} ⋯ & ⋯ \\\\ ⋯ & ⋯ \\end{pmatrix}",
      "\\begin{bmatrix} ⋯ & ⋯ \\\\ ⋯ & ⋯ \\end{bmatrix}",
      "\\begin{Bmatrix} ⋯ & ⋯ \\\\ ⋯ & ⋯ \\end{Bmatrix}",
      "\\begin{vmatrix} ⋯ & ⋯ \\\\ ⋯ & ⋯ \\end{vmatrix}",
      "\\begin{Vmatrix} ⋯ & ⋯ \\\\ ⋯ & ⋯ \\end{Vmatrix}",
      "\\begin{cases} ⋯ \\\\ ⋯  \\end{cases}",
      "\\begin{aligned} ⋯ &= ⋯ \\\\ ⋯ &= ⋯ \\end{aligned}",
    ],
  });
  createSymbolPanels([
    "∏∐∑∫∬∭⨌∮⊎⊕⊖⊗⊘⊙⋀⋁⋂⋃⌈⌉⌊⌋⎰⎱⟨⟩⟪⟫∥⫼⨀⨁⨂⨄⨅⨆ðıȷℏℑℓ℘ℜℵℶ",
    "∀∃∄∅∉∊∋∌⊂⊃⊄⊅⊆⊇⊈⊈⊉⊊⊊⊋⊋⊏⊐⊑⊒⊓⊔⊥⋐⋑⋔⫅⫆⫋⫋⫌⫌…⋮⋯⋰⋱♭♮♯∂∇",
    "±×÷†‡•∓∔∗∘∝∠∡∢∧∨∴∵∼∽≁≃≅≇≈≈≊≍≎≏≐≑≒≓≖≗≜≡≢≬⊚⊛⊞⊡⊢⊣⊤⊥",
    "⊨⊩⊪⊫⊬⊭⊯⊲⊲⊳⊴⊵⊸⊻⋄⋅⋇⋈⋉⋊⋋⋌⋍⋎⋏⋒⋓⌅⌆⌣△▴▵▸▹▽▾▿◂◃◊○★♠♡♢♣⧫",
    "≦≧≨≩≩≪≫≮≯≰≱≲≳≶≷≺≻≼≽≾≿⊀⊁⋖⋗⋘⋙⋚⋛⋞⋟⋦⋧⋨⋩⩽⩾⪅⪆⪇⪈⪉⪊⪋⪌⪕⪯⪰⪷⪸⪹⪺",
    "←↑→↓↔↕↖↗↘↙↜↝↞↠↢↣↦↩↪↫↬↭↭↰↱↼↽↾↿⇀⇁⇂⇃⇄⇆⇇⇈⇉⇊⇋⇌⇐⇑⇒⇓⇕⇖⇗⇘⇙⟺",
    "αβγδϵ϶εζηθϑικϰλμνξℴπϖρϱσςτυϕφχψωΓΔΘΛΞΠΣϒΦΨΩϝ℧",
    "𝕒𝕓𝕔𝕕𝕖𝕗𝕘𝕙𝕚𝕛𝕜𝕝𝕞𝕟𝕠𝕡𝕢𝕣𝕤𝕥𝕦𝕧𝕨𝕩𝕪𝕫𝔸𝔹ℂ𝔻𝔼𝔽𝔾ℍ𝕀𝕁𝕂𝕃𝕄ℕ𝕆ℙℚℝ𝕊𝕋𝕌𝕍𝕎𝕏𝕐ℤ",
    "𝒶𝒷𝒸𝒹ℯ𝒻ℊ𝒽𝒾𝒿𝓀𝓁𝓂𝓃ℴ𝓅𝓆𝓇𝓈𝓉𝓊𝓋𝓌𝓍𝓎𝓏𝒜ℬ𝒞𝒟ℰℱ𝒢ℋℐ𝒥𝒦ℒℳ𝒩𝒪𝒫𝒬ℛ𝒮𝒯𝒰𝒱𝒲𝒳𝒴𝒵",
    "𝔞𝔟𝔠𝔡𝔢𝔣𝔤𝔥𝔦𝔧𝔨𝔩𝔪𝔫𝔬𝔭𝔮𝔯𝔰𝔱𝔲𝔳𝔴𝔵𝔶𝔷𝔄𝔅ℭ𝔇𝔈𝔉𝔊ℌℑ𝔍𝔎𝔏𝔐𝔑𝔒𝔓𝔔ℜ𝔖𝔗𝔘𝔙𝔚𝔛𝔜ℨ",
  ]);
  gDialog.tabbox.selectedIndex = 0;

  updateMath();

  SetWindowLocation();
}

function insertLaTeXCommand(aButton) {
  gDialog.input.focus();

  // For a single math symbol, just use the insertText command.
  if (aButton.label) {
    gDialog.input.editor.insertText(aButton.label);
    return;
  }

  // Otherwise, it's a LaTeX command with at least one argument...
  var latex = TeXZilla.getTeXSource(aButton.firstElementChild);
  var selectionStart = gDialog.input.selectionStart;
  var selectionEnd = gDialog.input.selectionEnd;

  // If the selection is not empty, we replace the first argument of the LaTeX
  // command with the current selection.
  var selection = gDialog.input.value.substring(selectionStart, selectionEnd);
  if (selection != "") {
    latex = latex.replace("⋯", selection);
  }

  // Try and move to the next position.
  var latexNewStart = latex.indexOf("⋯"),
    latexNewEnd;
  if (latexNewStart == -1) {
    // This is a unary function and the selection was used as an argument above.
    // We select the expression again so that one can choose to apply further
    // command to it or just move the caret after that text.
    latexNewStart = 0;
    latexNewEnd = latex.length;
  } else {
    // Otherwise, select the dots representing the next argument.
    latexNewEnd = latexNewStart + 1;
  }

  // Update the input text and selection.
  gDialog.input.editor.insertText(latex);
  gDialog.input.setSelectionRange(
    selectionStart + latexNewStart,
    selectionStart + latexNewEnd
  );

  updateMath();
}

function createCommandPanel(aCommandPanelList) {
  const columnCount = 10;

  for (var label in aCommandPanelList) {
    var commands = aCommandPanelList[label];

    // Create the <table> element with the <tr>.
    var table = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "table"
    );

    var i = 0,
      row;
    for (var command of commands) {
      if (i % columnCount == 0) {
        // Create a new row.
        row = document.createElementNS("http://www.w3.org/1999/xhtml", "tr");
        table.appendChild(row);
      }

      // Create a new button to insert the symbol.
      var button = document.createXULElement("toolbarbutton");
      var td = document.createElementNS("http://www.w3.org/1999/xhtml", "td");
      button.setAttribute("class", "tabbable");
      button.appendChild(TeXZilla.toMathML(command));
      // FIXME: when opening the EdInsertMath.xhtml, there's a console error
      // SecurityError: Node.appendChild: Adopting nodes across docgroups in
      // chrome documents is unsupported.
      // Apparently there's supposed to be commands in #tabboxInsertLaTeXCommand...

      td.append(button);
      row.appendChild(td);

      i++;
    }

    // Create a new <tab> element.
    var tab = document.createXULElement("tab");
    tab.setAttribute("label", label);
    gDialog.tabbox.tabs.appendChild(tab);

    // Append the new tab panel.
    gDialog.tabbox.tabpanels.appendChild(table);
  }
}

function createSymbolPanels(aSymbolPanelList) {
  const columnCount = 13,
    tabLabelLength = 3;

  for (var symbols of aSymbolPanelList) {
    // Create the <table> element with the <tr>.
    var table = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "table"
    );
    var i = 0,
      tabLabel = "",
      row;
    for (var symbol of symbols) {
      if (i % columnCount == 0) {
        // Create a new row.
        row = document.createElementNS("http://www.w3.org/1999/xhtml", "tr");
        table.appendChild(row);
      }

      // Build the tab label from the first symbols of this tab.
      if (i < tabLabelLength) {
        tabLabel += symbol;
      }

      // Create a new button to insert the symbol.
      var button = document.createXULElement("toolbarbutton");
      var td = document.createElementNS("http://www.w3.org/1999/xhtml", "td");
      button.setAttribute("label", symbol);
      button.setAttribute("class", "tabbable");
      td.append(button);
      row.appendChild(td);

      i++;
    }

    // Create a new <tab> element with the label determined above.
    var tab = document.createXULElement("tab");
    tab.setAttribute("label", tabLabel);
    gDialog.tabbox.tabs.appendChild(tab);

    // Append the new tab panel.
    gDialog.tabbox.tabpanels.appendChild(table);
  }
}

function onAccept(event) {
  if (gDialog.output.firstElementChild) {
    var editor = GetCurrentEditor();
    editor.beginTransaction();

    try {
      var newMath = editor.document.importNode(
        gDialog.output.firstElementChild,
        true
      );
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
  } else {
    dump("Null value -- not inserting in MathML Source dialog\n");
    event.preventDefault();
  }
  SaveWindowLocation();
}

function updateMath() {
  // Remove the preview, if any.
  if (gDialog.output.firstElementChild) {
    gDialog.output.firstElementChild.remove();
  }

  // Try to convert the LaTeX source into MathML using TeXZilla.
  // We use the placeholder text if no input is provided.
  try {
    var input = gDialog.input.value || gDialog.input.placeholder;
    var newMath = TeXZilla.toMathML(
      input,
      gDialog.mode.selectedIndex,
      gDialog.direction.selectedIndex,
      true
    );
    gDialog.output.appendChild(document.importNode(newMath, true));
    gDialog.output.style.opacity = gDialog.input.value ? 1 : 0.5;
  } catch (e) {}
  // Disable the accept button if parsing fails or when the placeholder is used.
  gDialog.accept.disabled =
    !gDialog.input.value || !gDialog.output.firstElementChild;
}

function updateMode() {
  if (gDialog.output.firstElementChild) {
    gDialog.output.firstElementChild.setAttribute(
      "display",
      gDialog.mode.selectedIndex ? "block" : "inline"
    );
  }
}

function updateDirection() {
  if (gDialog.output.firstElementChild) {
    gDialog.output.firstElementChild.setAttribute(
      "dir",
      gDialog.direction.selectedIndex ? "rtl" : "ltr"
    );
  }
}
