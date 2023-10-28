/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals CLASS_DATA_PRIVATE, CLASS_DATA_PUBLIC, CLASS_DATA_UIONLY, createElement,
createParentElement, getAccountsText, getLoadContext, MailServices, Services */

"use strict";

var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

/**
 * Create warning text to add to any private data.
 *
 * @returns A HTML paragraph node containing the warning.
 */
function createWarning() {
  const bundle = Services.strings.createBundle(
    "chrome://messenger/locale/aboutSupportMail.properties"
  );
  return createParentElement("p", [
    createElement("strong", bundle.GetStringFromName("warningLabel")),
    // Add some whitespace between the label and the text
    document.createTextNode(" "),
    document.createTextNode(bundle.GetStringFromName("warningText")),
  ]);
}

function getClipboardTransferable() {
  // Get the HTML and text representations for the important part of the page.
  const hidePrivateData = !document.getElementById("check-show-private-data")
    .checked;
  const contentsDiv = createCleanedUpContents(hidePrivateData);
  const dataHtml = contentsDiv.innerHTML;
  const dataText = createTextForElement(contentsDiv, hidePrivateData);

  // We can't use plain strings, we have to use nsSupportsString.
  const supportsStringClass = Cc["@mozilla.org/supports-string;1"];
  const ssHtml = supportsStringClass.createInstance(Ci.nsISupportsString);
  const ssText = supportsStringClass.createInstance(Ci.nsISupportsString);

  const transferable = Cc["@mozilla.org/widget/transferable;1"].createInstance(
    Ci.nsITransferable
  );
  transferable.init(getLoadContext());

  // Add the HTML flavor.
  transferable.addDataFlavor("text/html");
  ssHtml.data = dataHtml;
  transferable.setTransferData("text/html", ssHtml);

  // Add the plain text flavor.
  transferable.addDataFlavor("text/plain");
  ssText.data = dataText;
  transferable.setTransferData("text/plain", ssText);

  return transferable;
}

// This function intentionally has the same name as the one in aboutSupport.js
// so that the one here is called.
function copyContentsToClipboard() {
  const transferable = getClipboardTransferable();
  // Store the data into the clipboard.
  Services.clipboard.setData(
    transferable,
    null,
    Services.clipboard.kGlobalClipboard
  );
}

function sendViaEmail() {
  // Get the HTML representation for the important part of the page.
  const hidePrivateData = !document.getElementById("check-show-private-data")
    .checked;
  const contentsDiv = createCleanedUpContents(hidePrivateData);
  let dataHtml = contentsDiv.innerHTML;
  // The editor considers whitespace to be significant, so replace all
  // whitespace with a single space.
  dataHtml = dataHtml.replace(/\s+/g, " ");

  // Set up parameters and fields to use for the compose window.
  const params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  params.type = Ci.nsIMsgCompType.New;
  params.format = Ci.nsIMsgCompFormat.HTML;

  const fields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  fields.forcePlainText = false;
  fields.body = dataHtml;
  // In general we can have non-ASCII characters, and compose's charset
  // detection doesn't seem to work when the HTML part is pure ASCII but the
  // text isn't. So take the easy way out and force UTF-8.
  fields.bodyIsAsciiOnly = false;
  params.composeFields = fields;

  // Our params are set up. Now open a compose window.
  MailServices.compose.OpenComposeWindowWithParams(null, params);
}

function createCleanedUpContents(aHidePrivateData) {
  // Get the important part of the page.
  const contentsDiv = document.getElementById("contents");
  // Deep-clone the entire div.
  const clonedDiv = contentsDiv.cloneNode(true);
  // Go in and replace text with the text we actually want to copy.
  // (this mutates the cloned node)
  cleanUpText(clonedDiv, aHidePrivateData);
  // Insert a warning if we need to
  if (!aHidePrivateData) {
    clonedDiv.insertBefore(createWarning(), clonedDiv.firstChild);
  }
  return clonedDiv;
}

function cleanUpText(aElem, aHidePrivateData) {
  let node = aElem.firstChild;
  let copyData = aElem.dataset.copyData;
  delete aElem.dataset.copyData;
  while (node) {
    const classList = "classList" in node && node.classList;
    // Delete uionly and no-copy nodes.
    if (
      classList &&
      (classList.contains(CLASS_DATA_UIONLY) || classList.contains("no-copy"))
    ) {
      // Advance to the next node before removing the current node, since
      // node.nextElementSibling is null after remove()
      const nextNode = node.nextElementSibling;
      node.remove();
      node = nextNode;
      continue;
    } else if (
      aHidePrivateData &&
      classList &&
      classList.contains(CLASS_DATA_PRIVATE)
    ) {
      // Replace private data with a blank string.
      node.textContent = "";
    } else if (
      !aHidePrivateData &&
      classList &&
      classList.contains(CLASS_DATA_PUBLIC)
    ) {
      // Replace public data with a blank string.
      node.textContent = "";
    } else if (copyData != null) {
      // Replace localized text with non-localized text.
      node.textContent = copyData;
      copyData = null;
    }

    if (node.nodeType == Node.ELEMENT_NODE) {
      cleanUpText(node, aHidePrivateData);
    }

    // Advance!
    node = node.nextSibling;
  }
}

// Return the plain text representation of an element.  Do a little bit
// of pretty-printing to make it human-readable.
function createTextForElement(elem, aHidePrivateData) {
  // Generate the initial text.
  const textFragmentAccumulator = [];
  generateTextForElement(elem, aHidePrivateData, "", textFragmentAccumulator);
  let text = textFragmentAccumulator.join("");

  // Trim extraneous whitespace before newlines, then squash extraneous
  // blank lines.
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");

  // Actual CR/LF pairs are needed for some Windows text editors.
  if ("@mozilla.org/windows-registry-key;1" in Cc) {
    text = text.replace(/\n/g, "\r\n");
  }

  return text;
}

/**
 * Elements to replace entirely with custom text. Keys are element ids, values
 * are functions that return the text. The functions themselves are defined in
 * the files for their respective sections.
 */
var gElementsToReplace = {
  "accounts-table": getAccountsText,
};

function generateTextForElement(
  elem,
  aHidePrivateData,
  indent,
  textFragmentAccumulator
) {
  // Add a little extra spacing around most elements.
  if (!["td", "th", "span", "a"].includes(elem.tagName)) {
    textFragmentAccumulator.push("\n");
  }

  // If this element is one of our elements to replace with text, do it.
  if (elem.id in gElementsToReplace) {
    const replaceFn = gElementsToReplace[elem.id];
    textFragmentAccumulator.push(replaceFn(aHidePrivateData, indent + "  "));
    return;
  }

  if (AppConstants.MOZ_CRASHREPORTER) {
    if (elem.id == "crashes-table") {
      textFragmentAccumulator.push(getCrashesText(indent));
      return;
    }
  }

  const childCount = elem.childElementCount;

  // We're not going to spread a two-column <tr> across multiple lines, so
  // handle that separately.
  if (elem.tagName == "tr" && childCount == 2) {
    textFragmentAccumulator.push(indent);
    textFragmentAccumulator.push(
      elem.children[0].textContent.trim() +
        ": " +
        elem.children[1].textContent.trim()
    );
    return;
  }

  // Generate the text representation for each child node.
  let node = elem.firstChild;
  while (node) {
    if (node.nodeType == Node.TEXT_NODE) {
      // Text belonging to this element uses its indentation level.
      generateTextForTextNode(node, indent, textFragmentAccumulator);
    } else if (node.nodeType == Node.ELEMENT_NODE) {
      // Recurse on the child element with an extra level of indentation (but
      // only if there's more than one child).
      generateTextForElement(
        node,
        aHidePrivateData,
        indent + (childCount > 1 ? "  " : ""),
        textFragmentAccumulator
      );
    }
    // Advance!
    node = node.nextSibling;
  }
}

function generateTextForTextNode(node, indent, textFragmentAccumulator) {
  // If the text node is the first of a run of text nodes, then start
  // a new line and add the initial indentation.
  const prevNode = node.previousSibling;
  if (!prevNode || prevNode.nodeType == Node.TEXT_NODE) {
    textFragmentAccumulator.push("\n" + indent);
  }

  // Trim the text node's text content and add proper indentation after
  // any internal line breaks.
  const text = node.textContent.trim().replace(/\n/g, "\n" + indent);
  textFragmentAccumulator.push(text);
}

/**
 * Returns a plaintext representation of crashes data.
 */

function getCrashesText(aIndent) {
  let crashesData = "";
  const recentCrashesSubmitted = document.querySelectorAll(
    "#crashes-tbody > tr"
  );
  for (let i = 0; i < recentCrashesSubmitted.length; i++) {
    const tds = recentCrashesSubmitted.item(i).querySelectorAll("td");
    crashesData +=
      aIndent.repeat(2) +
      tds.item(0).firstElementChild.href +
      " (" +
      tds.item(1).textContent +
      ")\n";
  }
  return crashesData;
}
