/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  MessageGenerator,
  MessageScenarioFactory,
  SyntheticMessageSet,
} from "resource://testing-common/mailnews/MessageGenerator.sys.mjs";
import { MessageInjection } from "resource://testing-common/mailnews/MessageInjection.sys.mjs";

export var msgGen = new MessageGenerator();
var msgGenFactory = new MessageScenarioFactory(msgGen);
var messageInjection = new MessageInjection({ mode: "local" }, msgGen);
export var inboxFolder = messageInjection.getInboxFolder();

/**
 * Create a thread with the specified number of messages in it.
 *
 * @param {number} aCount
 * @returns {SyntheticMessageSet}
 */
export function create_thread(aCount) {
  return new SyntheticMessageSet(msgGenFactory.directReply(aCount));
}

/**
 * Create and return a SyntheticMessage object.
 *
 * @param {MakeMessageOptions} aArgs An arguments object to be passed to
 *                                   MessageGenerator.makeMessage()
 * @returns {SyntheticMessage}
 */
export function create_message(aArgs) {
  return msgGen.makeMessage(aArgs);
}

/**
 * Adds a SyntheticMessage as a SyntheticMessageSet to a folder or folders.
 *
 * @see MessageInjection.addSetsToFolders
 * @param {nsIMsgFolder[]} aFolder
 * @param {SyntheticMessage} aMsg
 */
export async function add_message_to_folder(aFolder, aMsg) {
  await messageInjection.addSetsToFolders(aFolder, [
    new SyntheticMessageSet([aMsg]),
  ]);
}

/**
 * Adds SyntheticMessageSets to a folder or folders.
 *
 * @see MessageInjection.addSetsToFolders
 * @param {nsIMsgLocalMailFolder[]} aFolders
 * @param {SyntheticMessageSet[]} aMsg
 */
export async function add_message_sets_to_folders(aFolders, aMsg) {
  await messageInjection.addSetsToFolders(aFolders, aMsg);
}

/**
 * Makes SyntheticMessageSets in aFolders
 *
 * @param {nsIMsgFolder[]} aFolders
 * @param {MakeMessageOptions[]} aOptions
 * @returns {SyntheticMessageSet[]}
 */
export async function make_message_sets_in_folders(aFolders, aOptions) {
  return messageInjection.makeNewSetsInFolders(aFolders, aOptions);
}

/**
 * @param {SyntheticMessageSet} aSynMessageSet The set of messages
 *     to delete.  The messages do not all
 *     have to be in the same folder, but we have to delete them folder by
 *     folder if they are not.
 */
export async function delete_messages(aSynMessageSet) {
  await MessageInjection.deleteMessages(aSynMessageSet);
}
