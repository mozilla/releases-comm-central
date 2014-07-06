/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/CharsetMenu.jsm");

var gCharset="";
var gTitleWasEdited = false;
var gCharsetWasChanged = false;
var gInsertNewContentType = false;
var gContenttypeElement;
var gInitDone = false;
var gCharsetInfo;

//Cancel() is in EdDialogCommon.js

var gCharsetView = {
  get rowCount() { return gCharsetInfo.length; },
  selection: null,
  getRowProperties: function(index) { return ""; },
  getCellProperties: function(index, column) { return ""; },
  getColumnProperties: function(columm) { return ""; },
  isContainer: function() { return false; },
  isContainerOpen: function() { return false; },
  isContainerEmpty: function() { return true; },
  isSeparator: function() { return false; },
  isSorted: function() { return false; },
  canDrop: function(index, orientation) { return false; },
  drop: function(index, orientation) {},
  getParentIndex: function(index) { return -1; },
  hasNextSibling: function(index, after) { return false; },
  getLevel: function(index) { return 1; },
  getImageSrc: function(index) { return null; },
  getProgressMode: function(index) { return 0; },
  getCellValue: function(index) { return ""; },
  getCellText: function(index) { return gCharsetInfo[index].label; },
  toggleOpenState: function(index) {},
  cycleHeader: function(column) {},
  selectionChanged: function() {},
  cycleCell: function(index, column) {},
  isEditable: function isEditable(index, column) { return false; },
  isSelectable: function isSelectable(index, column) { return true; },
  performAction: function performAction(action) {},
  performActionOnCell: function performActionOnCell(action, index, column) {}
};

function Startup()
{
  var editor = GetCurrentEditor();
  if (!editor)
  {
    window.close();
    return;
  }

  gDialog.TitleInput    = document.getElementById("TitleInput");
  gDialog.charsetTree   = document.getElementById('CharsetTree'); 
  gDialog.exportToText  = document.getElementById('ExportToText');

  gContenttypeElement = GetMetaElementByAttribute("http-equiv", "content-type");
  if (!gContenttypeElement && (editor.contentsMIMEType != 'text/plain')) 
  {
    gContenttypeElement = CreateMetaElementWithAttribute("http-equiv", "content-type");
    if (!gContenttypeElement ) 
	{
      window.close();
      return;
    }
    gInsertNewContentType = true;
  }

  try {
    gCharset = editor.documentCharacterSet;
  } catch (e) {}

  var data = CharsetMenu.getData();
  var charsets = data.pinnedCharsets.concat(data.otherCharsets);
  gCharsetInfo = CharsetMenu.getCharsetInfo(charsets.map(info => info.value));
  gDialog.charsetTree.view = gCharsetView;

  InitDialog();

  // Use the same text as the messagebox for getting title by regular "Save"
  document.getElementById("EnterTitleLabel").setAttribute("value",GetString("NeedDocTitle"));
  // This is an <HTML> element so it wraps -- append a child textnode
  var helpTextParent = document.getElementById("TitleHelp");
  var helpText = document.createTextNode(GetString("DocTitleHelp"));
  if (helpTextParent)
    helpTextParent.appendChild(helpText);
  
  // SET FOCUS TO FIRST CONTROL
  SetTextboxFocus(gDialog.TitleInput);
  
  gInitDone = true;
  
  SetWindowLocation();
}

  
function InitDialog() 
{
  gDialog.TitleInput.value = GetDocumentTitle();

  var tree = gDialog.charsetTree;
  var index = gCharsetInfo.map(info => info.value).indexOf(gCharset);
  if (index >= 0) {
    tree.view.selection.select(index);
    tree.treeBoxObject.ensureRowIsVisible(index);
  }
}


function onAccept()
{
  var editor = GetCurrentEditor();
  editor.beginTransaction();

  if(gCharsetWasChanged) 
  {
     try {
       SetMetaElementContent(gContenttypeElement, "text/html; charset=" + gCharset, gInsertNewContentType, true);     
      editor.documentCharacterSet = gCharset;
    } catch (e) {}
  }

  editor.endTransaction();

  if(gTitleWasEdited) 
    SetDocumentTitle(TrimString(gDialog.TitleInput.value));

  window.opener.ok = true;
  window.opener.exportToText = gDialog.exportToText.checked;
  SaveWindowLocation();
  return true;
}


function SelectCharset()
{
  if(gInitDone) 
  {
    try 
    {
      gCharset = gCharsetInfo[gDialog.charsetTree.currentIndex].value;
      if (gCharset)
        gCharsetWasChanged = true;
    }
    catch(e) {}
  }
}


function TitleChanged()
{
  gTitleWasEdited = true; 
}
