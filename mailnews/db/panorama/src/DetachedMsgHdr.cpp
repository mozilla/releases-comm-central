/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "DetachedMsgHdr.h"

#include "mozilla/Components.h"
#include "nsIDatabaseCore.h"
#include "nsIFolderDatabase.h"
#include "nsMsgMessageFlags.h"
#include "nsPrintfCString.h"

namespace mozilla::mailnews {

NS_IMPL_ISUPPORTS(DetachedMsgHdr, nsIMsgDBHdr)

NS_IMETHODIMP DetachedMsgHdr::SetStringProperty(
    const char* propertyName, const nsACString& propertyValue) {
  if (nsDependentCString(propertyName).EqualsLiteral("keywords")) {
    mRaw.keywords = propertyValue;
    return NS_OK;
  }

  NS_WARNING(
      nsPrintfCString(
          "NS_ERROR_NOT_IMPLEMENTED DetachedMsgHdr::SetStringProperty(%s=%s)\n",
          propertyName, PromiseFlatCString(propertyValue).get())
          .get());
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP DetachedMsgHdr::GetStringProperty(const char* propertyName,
                                                nsACString& propertyValue) {
  if (nsDependentCString(propertyName).EqualsLiteral("keywords")) {
    propertyValue.Assign(mRaw.keywords);
    return NS_OK;
  }

  NS_WARNING(
      nsPrintfCString(
          "NS_ERROR_NOT_IMPLEMENTED DetachedMsgHdr::GetStringProperty(%s)\n",
          propertyName)
          .get());
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP DetachedMsgHdr::GetUint32Property(const char* propertyName,
                                                uint32_t* propertyValue) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP DetachedMsgHdr::SetUint32Property(const char* propertyName,
                                                uint32_t propertyValue) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP DetachedMsgHdr::GetProperties(nsTArray<nsCString>& properties) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP DetachedMsgHdr::GetIsRead(bool* isRead) {
  *isRead = mRaw.flags & nsMsgMessageFlags::Read;
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::GetIsFlagged(bool* isFlagged) {
  *isFlagged = mRaw.flags & nsMsgMessageFlags::Marked;
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::GetIsKilled(bool* isKilled) {
  *isKilled = mRaw.flags & nsMsgMessageFlags::Ignored;
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::MarkRead(bool read) {
  if (read) {
    mRaw.flags |= nsMsgMessageFlags::Read;
  } else {
    mRaw.flags &= ~nsMsgMessageFlags::Read;
  }
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::MarkFlagged(bool flagged) {
  if (flagged) {
    mRaw.flags |= nsMsgMessageFlags::Marked;
  } else {
    mRaw.flags &= ~nsMsgMessageFlags::Marked;
  }
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::MarkHasAttachments(bool hasAttachments) {
  if (hasAttachments) {
    mRaw.flags |= nsMsgMessageFlags::Attachment;
  } else {
    mRaw.flags &= ~nsMsgMessageFlags::Attachment;
  }
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::GetPriority(nsMsgPriorityValue* priority) {
  *priority = mRaw.priority;
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::SetPriority(nsMsgPriorityValue priority) {
  mRaw.priority = priority;
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::GetFlags(uint32_t* flags) {
  *flags = mRaw.flags;
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::SetFlags(uint32_t flags) {
  mRaw.flags = flags;
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::OrFlags(uint32_t flags, uint32_t* outFlags) {
  mRaw.flags |= flags;
  *outFlags = mRaw.flags;
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::AndFlags(uint32_t flags, uint32_t* outFlags) {
  mRaw.flags &= flags;
  *outFlags = mRaw.flags;
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::GetThreadId(nsMsgKey* threadId) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP DetachedMsgHdr::SetThreadId(nsMsgKey threadId) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP DetachedMsgHdr::GetMessageKey(nsMsgKey* messageKey) {
  // Detached header should never have a key.
  MOZ_ASSERT(mRaw.key == nsMsgKey_None);
  *messageKey = mRaw.key;
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::SetMessageKey(nsMsgKey messageKey) {
  NS_ERROR(__PRETTY_FUNCTION__);
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP DetachedMsgHdr::GetThreadParent(nsMsgKey* threadParent) {
  NS_ERROR(__PRETTY_FUNCTION__);
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP DetachedMsgHdr::SetThreadParent(nsMsgKey threadParent) {
  NS_ERROR(__PRETTY_FUNCTION__);
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP DetachedMsgHdr::GetMessageSize(uint32_t* messageSize) {
  *messageSize = mMessageSize;
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::SetMessageSize(uint32_t messageSize) {
  mMessageSize = messageSize;
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::GetLineCount(uint32_t* lineCount) {
  *lineCount = mLineCount;
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::SetLineCount(uint32_t lineCount) {
  // Shouldn't be used until _after_ the message has been added to the DB.
  NS_WARNING("DetachedMsgHdr::SetLineCount() called");
  mLineCount = lineCount;
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::GetStoreToken(nsACString& storeToken) {
  storeToken.Assign(mStoreToken);
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::SetStoreToken(const nsACString& storeToken) {
  // Shouldn't be used until _after_ the message has been added to the DB.
  NS_WARNING("DetachedMsgHdr::SetStoreToken() called");
  mStoreToken = storeToken;
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::GetOfflineMessageSize(
    uint32_t* offlineMessageSize) {
  *offlineMessageSize = mOfflineMessageSize;
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::SetOfflineMessageSize(
    uint32_t offlineMessageSize) {
  // Shouldn't be used until _after_ the message has been added to the DB.
  NS_WARNING("DetachedMsgHdr::SetOfflineMessageSize() called");
  mOfflineMessageSize = offlineMessageSize;
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::GetDate(PRTime* date) {
  *date = mRaw.date;
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::SetDate(PRTime date) {
  mRaw.date = date;
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::GetDateInSeconds(uint32_t* dateInSeconds) {
  *dateInSeconds = mRaw.date / PR_USEC_PER_SEC;
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::GetMessageId(nsACString& messageId) {
  messageId.Assign(mRaw.messageId);
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::SetMessageId(const nsACString& messageId) {
  mRaw.messageId = messageId;
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::GetCcList(nsACString& ccList) {
  ccList.Assign(mRaw.ccList);
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::SetCcList(const nsACString& ccList) {
  mRaw.ccList = ccList;
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::GetBccList(nsACString& bccList) {
  bccList.Assign(mRaw.bccList);
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::SetBccList(const nsACString& bccList) {
  mRaw.bccList = bccList;
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::GetAuthor(nsACString& author) {
  author.Assign(mRaw.sender);
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::SetAuthor(const nsACString& author) {
  mRaw.sender = author;
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::GetSubject(nsACString& subject) {
  subject.Assign(mRaw.subject);
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::SetSubject(const nsACString& subject) {
  mRaw.subject = subject;
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::GetRecipients(nsACString& recipients) {
  recipients.Assign(mRaw.recipients);
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::SetRecipients(const nsACString& recipients) {
  mRaw.recipients = recipients;
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::SetReferences(const nsACString& references) {
  mRaw.references = references;
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::GetNumReferences(uint16_t* numReferences) {
  NS_WARNING(__PRETTY_FUNCTION__);
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP DetachedMsgHdr::GetStringReference(int32_t refNum,
                                                 nsACString& _retval) {
  NS_WARNING(__PRETTY_FUNCTION__);
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP DetachedMsgHdr::GetMime2DecodedAuthor(
    nsAString& mime2DecodedAuthor) {
  NS_WARNING(__PRETTY_FUNCTION__);
  mime2DecodedAuthor.Assign(NS_ConvertUTF8toUTF16(mRaw.sender));
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::GetMime2DecodedSubject(
    nsAString& mime2DecodedSubject) {
  NS_WARNING(__PRETTY_FUNCTION__);
  mime2DecodedSubject.Assign(NS_ConvertUTF8toUTF16(mRaw.subject));
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::GetMime2DecodedRecipients(
    nsAString& mime2DecodedRecipients) {
  NS_WARNING(__PRETTY_FUNCTION__);
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP DetachedMsgHdr::GetAuthorCollationKey(
    nsTArray<uint8_t>& _retval) {
  NS_WARNING(__PRETTY_FUNCTION__);
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP DetachedMsgHdr::GetSubjectCollationKey(
    nsTArray<uint8_t>& _retval) {
  NS_WARNING(__PRETTY_FUNCTION__);
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP DetachedMsgHdr::GetRecipientsCollationKey(
    nsTArray<uint8_t>& _retval) {
  NS_WARNING(__PRETTY_FUNCTION__);
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP DetachedMsgHdr::GetCharset(nsACString& charset) {
  charset.Assign(mRaw.charset);
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::SetCharset(const nsACString& charset) {
  mRaw.charset = charset;
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::GetEffectiveCharset(
    nsACString& effectiveCharset) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP DetachedMsgHdr::GetAccountKey(nsACString& accountKey) {
  accountKey.Assign(mRaw.accountKey);
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::SetAccountKey(const nsACString& accountKey) {
  mRaw.accountKey = accountKey;
  return NS_OK;
}

NS_IMETHODIMP DetachedMsgHdr::GetFolder(nsIMsgFolder** folder) {
  nsCOMPtr<nsIDatabaseCore> core = components::DatabaseCore::Service();
  nsCOMPtr<nsIFolderDatabase> folderDatabase;
  nsresult rv = core->GetFolderDB(getter_AddRefs(folderDatabase));
  NS_ENSURE_SUCCESS(rv, rv);

  return folderDatabase->GetMsgFolderForFolder(mFolderId, folder);
}

NS_IMETHODIMP DetachedMsgHdr::GetUidOnServer(uint32_t* uidOnServer) {
  NS_ERROR(__PRETTY_FUNCTION__);
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP DetachedMsgHdr::SetUidOnServer(uint32_t uidOnServer) {
  NS_ERROR(__PRETTY_FUNCTION__);
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP DetachedMsgHdr::GetIsLive(bool* isLive) {
  // By definition, DetachedMsgHdr is never live.
  *isLive = false;
  return NS_OK;
}

}  // namespace mozilla::mailnews
