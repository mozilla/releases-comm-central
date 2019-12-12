/* -*- Mode: javascript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * widget-specific wrapper glue. There should be one function for every
 * widget/menu item, which gets some context (like the current selection)
 * and then calls a function/command in commandglue
 */

//The eventual goal is for this file to go away and its contents to be brought into
//mailWindowOverlay.js.  This is currently being done.

var { MailUtils } =
  ChromeUtils.import("resource:///modules/MailUtils.js");

// Given a URI we would like to return corresponding message folder here.
// An additonal input param which specifies whether or not to check folder
// attributes (like if there exists a parent or is it a server) is also passed
// to this routine. Qualifying against those checks would return an existing
// folder. Callers who don't want to check those attributes will specify the
// same and then this routine will simply return a msgfolder. This scenario
// applies to a new imap account creation where special folders are created
// on demand and hence needs to prior check of existence.
function GetMsgFolderFromUri(uri, checkFolderAttributes)
{
  return MailUtils.getFolderForURI(uri, checkFolderAttributes);
}
