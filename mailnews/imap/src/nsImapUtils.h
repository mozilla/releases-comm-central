/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_IMAP_SRC_NSIMAPUTILS_H_
#define COMM_MAILNEWS_IMAP_SRC_NSIMAPUTILS_H_

#include "nsString.h"
#include "MailNewsTypes2.h"
#include "nsTArray.h"
#include "nsIMailboxSpec.h"
#include "nsCOMPtr.h"

class nsImapFlagAndUidState;
class nsImapProtocol;

static const char kImapRootURI[] = "imap:/";
static const char kImapMessageRootURI[] = "imap-message:/";
static const char kModSeqPropertyName[] = "highestModSeq";
static const char kHighestRecordedUIDPropertyName[] = "highestRecordedUID";
static const char kDeletedHdrCountPropertyName[] = "numDeletedHeaders";

extern nsresult nsImapURI2FullName(const char* rootURI, const char* hostname,
                                   const char* uriStr, char** name);

extern nsresult nsParseImapMessageURI(const nsACString& uri,
                                      nsACString& folderURI, nsMsgKey* key,
                                      nsACString& mimePart);

extern nsresult nsBuildImapMessageURI(const char* baseURI, nsMsgKey key,
                                      nsACString& uri);

extern nsresult nsCreateImapBaseMessageURI(const nsACString& baseURI,
                                           nsCString& baseMessageURI);

void AllocateImapUidString(const uint32_t* msgUids, uint32_t& msgCount,
                           nsImapFlagAndUidState* flagState,
                           nsCString& returnString);
void ParseUidString(const char* uidString, nsTArray<nsMsgKey>& keys);
void AppendUid(nsCString& msgIds, uint32_t uid);

class nsImapMailboxSpec : public nsIMailboxSpec {
 public:
  nsImapMailboxSpec();

  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIMAILBOXSPEC

  nsImapMailboxSpec& operator=(const nsImapMailboxSpec& aCopy);

  nsCOMPtr<nsIImapFlagAndUidState> mFlagState;
  nsImapNamespace* mNamespaceForFolder;

  uint32_t mBoxFlags;
  uint32_t mSupportedUserFlags;
  int32_t mFolder_UIDVALIDITY;
  uint64_t mHighestModSeq;
  int32_t mNumOfMessages;
  int32_t mNumOfUnseenMessages;
  int32_t mNumOfRecentMessages;
  int32_t mNextUID;
  nsCString mAllocatedPathName;
  nsCString mHostName;
  nsString mUnicharPathName;
  char mHierarchySeparator;
  bool mFolderSelected;
  bool mDiscoveredFromLsub;
  bool mOnlineVerified;

  nsImapProtocol* mConnection;  // do we need this? It seems evil

 private:
  virtual ~nsImapMailboxSpec();
};

#endif  // COMM_MAILNEWS_IMAP_SRC_NSIMAPUTILS_H_
