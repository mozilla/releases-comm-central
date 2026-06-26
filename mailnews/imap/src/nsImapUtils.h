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
#include "mozilla/Span.h"

class nsImapFlagAndUidState;
class nsImapProtocol;
class nsIMsgDBHdr;
class nsIMsgDatabase;

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

void AllocateImapUidString(const ImapUid* msgUids, uint32_t& msgCount,
                           nsImapFlagAndUidState* flagState,
                           nsCString& returnString);
void ParseUidString(const char* uidString, nsTArray<ImapUid>& uids);
void AppendUid(nsCString& msgIds, ImapUid uid);

/**
 * Build an IMAP UID-set string from a bunch of UIDs, as per
 * https://datatracker.ietf.org/doc/html/rfc9051#name-sequence-set-and-uid-set
 *
 * The input doesn't need to be ordered, may contain duplicates, and may be
 * empty.
 * All input values MUST be non-zero (UIDs are non-zero by definition).
 *
 * examples:
 * UidSetFromUids({1,5,8,9,10})
 *   => "1,5,8:10"
 * UidSetFromUids({10,9,9,9,1,5,8})
 *   => "1,5,8:10"
 * UidSetFromUids({})
 *   => ""
 *
 * NOTE: This implementation makes style choices. In the IMAP spec, no
 * guarantee is made about the ordering of UID-set strings.
 * e.g. Input of {1,2,8,9,10} could produce any of
 * "1,2,8:10", "1,2,2,2,2,2,8:10", "1:2,8:10", "2,10:8,1" etc...
 * The spec allows any of these.
 * In practice the output will likely be sorted and de-duped,
 * but the spec implies you shouldn't rely on that.
 */
nsCString UidSetFromUids(mozilla::Span<const ImapUid> uids);

/**
 * Returns a list of UIDs for the given messages.
 * If a message doesn't have a UID, it will _not_ appear in the returned list.
 * So the size of the returned list may differ to the number of messages passed
 * in.
 */
mozilla::Result<nsTArray<ImapUid>, nsresult> UidsFromHdrs(
    nsTArray<RefPtr<nsIMsgDBHdr>> const& hdrs);

/**
 * Returns a list of UIDs for the given message keys.
 * If any of the keys are nsMsgKey_None, this function will fail.
 * If a message doesn't have a UID, it will _not_ appear in the returned list.
 * So the size of the returned list may differ to the number of messages passed
 * in.
 */
mozilla::Result<nsTArray<ImapUid>, nsresult> UidsFromKeys(
    nsIMsgDatabase* db, nsTArray<nsMsgKey> const& keys);

/**
 * Get UID for a single message.
 * The key MUST be a valid message, and not nsMsgKey_None.
 * Returns 0 if message has no UID.
 */
mozilla::Result<ImapUid, nsresult> UidFromKey(nsIMsgDatabase* db, nsMsgKey key);

/**
 * Get Key of message with the given UID.
 * The UID passed in MUST be non-zero.
 * Fails if message not found in database.
 */
mozilla::Result<nsMsgKey, nsresult> KeyFromUid(nsIMsgDatabase* db, ImapUid uid);

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
  ImapUid mFolder_UIDVALIDITY;
  uint64_t mHighestModSeq;
  int32_t mNumOfMessages;
  int32_t mNumOfUnseenMessages;
  int32_t mNumOfRecentMessages;
  ImapUid mNextUID;
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
