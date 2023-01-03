/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Main Composer window debug menu functions */

// --------------------------- Output ---------------------------


function EditorGetText()
{
  try {
    dump("Getting text\n");
    var  outputText = GetCurrentEditor().outputToString("text/plain", kOutputFormatted);
    dump("<<" + outputText + ">>\n");
  } catch (e) {}
}

function EditorGetHTML()
{
  try {
    dump("Getting HTML\n");
    var  outputHTML = GetCurrentEditor().outputToString("text/html", kOutputEncodeW3CEntities);
    dump(outputHTML + "\n");
  } catch (e) {}
}

function EditorInsertText(textToInsert)
{
  GetCurrentEditor().insertText(textToInsert);
}

function EditorTestSelection()
{
  dump("Testing selection\n");
  var selection = GetCurrentEditor().selection;
  if (!selection)
  {
    dump("No selection!\n");
    return;
  }

  dump("Selection contains:\n");
  // 3rd param = column to wrap
  dump(selection
       .toStringWithFormat("text/plain",
                           kOutputFormatted | kOutputSelectionOnly,
                           0) + "\n");

  var output, i;

  dump("====== Selection as node and offsets==========\n");
  dump("rangeCount = " + selection.rangeCount + "\n");
  for (i = 0; i < selection.rangeCount; i++)
  {
    var range = selection.getRangeAt(i);
    if (range)
    {
      dump("Range "+i+": StartParent="+range.startContainer.nodeName+", offset="+range.startOffset+"\n");
      dump("Range "+i+":   EndParent="+range.endContainer.nodeName+", offset="+range.endOffset+"\n\n");
    }
  }

  var editor = GetCurrentEditor();

  dump("====== Selection as unformatted text ==========\n");
  output = editor.outputToString("text/plain", kOutputSelectionOnly);
  dump(output + "\n\n");

  dump("====== Selection as formatted text ============\n");
  output = editor.outputToString("text/plain", kOutputFormatted | kOutputSelectionOnly);
  dump(output + "\n\n");

  dump("====== Selection as HTML ======================\n");
  output = editor.outputToString("text/html", kOutputSelectionOnly);
  dump(output + "\n\n");

  dump("====== Selection as prettyprinted HTML ========\n");
  output = editor.outputToString("text/html", kOutputFormatted | kOutputSelectionOnly);
  dump(output + "\n\n");

  dump("====== Length and status =====================\n");
  output = "Document is ";
  if (editor.documentIsEmpty)
    output += "empty\n";
  else
    output += "not empty\n";
  output += "Text length is " + editor.textLength + " characters";
  dump(output + "\n\n");
}

function EditorTestDocument()
{
  dump("Getting document\n");
  var theDoc = GetCurrentEditor().document;
  if (theDoc)
  {
    dump("Got the doc\n");
    dump("Document name:" + theDoc.nodeName + "\n");
    dump("Document type:" + theDoc.doctype + "\n");
  }
  else
  {
    dump("Failed to get the doc\n");
  }
}

// ------------------------ 3rd Party Transaction Test ------------------------


function sampleJSTransaction()
{
  this.wrappedJSObject = this;
}

sampleJSTransaction.prototype = {

  isTransient: false,
  mStrData:    "[Sample-JS-Transaction-Content]",
  mObject:     null,
  mContainer:  null,
  mOffset:     null,

  doTransaction: function()
  {
    if (this.mContainer.nodeType != Node.TEXT_NODE)
    {
      // We're not in a text node, so create one and
      // we'll just insert it at (mContainer, mOffset).

      this.mObject = this.mContainer.ownerDocument.createTextNode(this.mStrData);
    }

    this.redoTransaction();
  },

  undoTransaction: function()
  {
    if (!this.mObject)
      this.mContainer.deleteData(this.mOffset, this.mStrData.length);
    else
      this.mObject.remove();
  },

  redoTransaction: function()
  {
    if (!this.mObject)
      this.mContainer.insertData(this.mOffset, this.mStrData);
    else
      this.insert_node_at_point(this.mObject, this.mContainer, this.mOffset);
  },

  merge: function(aTxn)
  {
    // We don't do any merging!

    return false;
  },

  QueryInterface: function(aIID, theResult)
  {
    if (aIID.equals(Ci.nsITransaction) ||
        aIID.equals(Ci.nsISupports))
      return this;

    throw Cr.NS_ERROR_NO_INTERFACE;
  },

  insert_node_at_point: function(node, container, offset)
  {
    var childList = container.childNodes;

    if (childList.length == 0 || offset >= childList.length)
      container.appendChild(node);
    else
      container.insertBefore(node, childList.item(offset));
  }
}

function ExecuteJSTransactionViaEditor()
{
  try {
    var editor = GetCurrentEditor();

    var selection = editor.selection;
    var range =  selection.getRangeAt(0);

    var txn = new sampleJSTransaction();

    txn.mContainer = range.startContainer;
    txn.mOffset = range.startOffset;

    editor.doTransaction(txn);
  } catch (e) {
    dump("ExecuteJSTransactionViaEditor() failed!");
  }
}

function EditorNewPlaintext(aUrl, aCharsetArg)
{
  window.openDialog( "chrome://debugqa/content/debugQATextEditorShell.xul",
                     "_blank",
                     "chrome,dialog=no,all",
                     aUrl || "about:blank",
                     aCharsetArg);
}
