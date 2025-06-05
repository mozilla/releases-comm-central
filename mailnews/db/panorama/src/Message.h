/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_DB_PANORAMA_SRC_MESSAGE_H_
#define COMM_MAILNEWS_DB_PANORAMA_SRC_MESSAGE_H_

#include "mozIStorageStatement.h"
#include "nsIMsgHdr.h"
#include "nsTString.h"

namespace mozilla::mailnews {

class MessageDatabase;

#define MESSAGE_SQL_FIELDS \
  "id, folderId, messageId, date, sender, recipients, ccList, bccList, subject, flags, tags"_ns

class Message : public nsIMsgDBHdr {
 public:
  Message() = delete;
  explicit Message(MessageDatabase* aDatabase, mozIStorageStatement* aStmt);

  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGDBHDR

  nsMsgKey mId;
  uint64_t mFolderId;
  nsAutoCString mMessageId;
  PRTime mDate;
  nsAutoCString mSender;
  nsAutoCString mRecipients;
  nsAutoCString mCcList;
  nsAutoCString mBccList;
  nsAutoCString mSubject;
  uint64_t mFlags;
  nsAutoCString mTags;

 protected:
  virtual ~Message() {};

 private:
  MessageDatabase* mDatabase;
};

}  // namespace mozilla::mailnews

#endif  // COMM_MAILNEWS_DB_PANORAMA_SRC_MESSAGE_H_
