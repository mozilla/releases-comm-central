/**
 * Returns the trash folder of the account a given message belongs to. The
 * accountsRead permission is required.
 */
async function getTrashFolderForMessage(msgId) {
  const msg = await messenger.messages.get(msgId);
  const account = await messenger.accounts.get(msg.folder.accountId);
  return account.folders.find(folder => folder.type == "trash");
}
