/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMsgOfflineImapOperation.h"
#include "MailNewsTypes.h"
#include "nsMsgUtils.h"
#include "mozilla/Logging.h"
#include "nsStringFwd.h"

using namespace mozilla;

LazyLogModule IMAPOffline("IMAPOffline");

/* Implementation file */
NS_IMPL_ISUPPORTS(nsMsgOfflineImapOperation, nsIMsgOfflineImapOperation)

// property names for offline imap operation fields.
#define PROP_OPERATION "op"
#define PROP_OPERATION_FLAGS "opFlags"
#define PROP_NEW_FLAGS "newFlags"
#define PROP_MESSAGE_KEY "msgKey"
#define PROP_SRC_MESSAGE_KEY "srcMsgKey"
#define PROP_SRC_UID "srcUid"
#define PROP_SRC_FOLDER_URI "srcFolderURI"
#define PROP_MOVE_DEST_FOLDER_URI "moveDest"
#define PROP_NUM_COPY_DESTS "numCopyDests"
#define PROP_COPY_DESTS \
  "copyDests"  // how to delimit these? Or should we do the "dest1","dest2" etc
               // trick? But then we'd need to shuffle them around since we
               // delete off the front first.
#define PROP_KEYWORD_ADD "addedKeywords"
#define PROP_KEYWORD_REMOVE "removedKeywords"
#define PROP_MSG_SIZE "msgSize"
#define PROP_PLAYINGBACK "inPlayback"

nsMsgOfflineImapOperation::nsMsgOfflineImapOperation(nsMsgDatabase* db,
                                                     nsIMdbRow* row) {
  NS_ASSERTION(db, "can't have null db");
  NS_ASSERTION(row, "can't have null row");
  m_operation = 0;
  m_messageKey = nsMsgKey_None;
  m_mdb = db;
  NS_ADDREF(m_mdb);
  m_mdbRow = row;
  m_newFlags = 0;
  m_mdb->GetUint32Property(m_mdbRow, PROP_OPERATION, (uint32_t*)&m_operation,
                           0);
  m_mdb->GetUint32Property(m_mdbRow, PROP_MESSAGE_KEY, &m_messageKey, 0);
  m_mdb->GetUint32Property(m_mdbRow, PROP_NEW_FLAGS, (uint32_t*)&m_newFlags, 0);
}

nsMsgOfflineImapOperation::~nsMsgOfflineImapOperation() {
  // clear the row first, in case we're holding the last reference
  // to the db.
  m_mdbRow = nullptr;
  NS_IF_RELEASE(m_mdb);
}

/* attribute nsOfflineImapOperationType operation; */
NS_IMETHODIMP nsMsgOfflineImapOperation::GetOperation(
    nsOfflineImapOperationType* aOperation) {
  NS_ENSURE_ARG(aOperation);
  *aOperation = m_operation;
  return NS_OK;
}

// Internal helper for setting an operation bitflag.
nsresult nsMsgOfflineImapOperation::AddOperation(
    nsOfflineImapOperationType operation) {
  MOZ_LOG(IMAPOffline, LogLevel::Info,
          ("msg id %x setOperation was %x add %x", m_messageKey, m_operation,
           operation));
  m_operation |= operation;
  return m_mdb->SetUint32Property(m_mdbRow, PROP_OPERATION, m_operation);
}

NS_IMETHODIMP nsMsgOfflineImapOperation::SetFlagsChangedOp(
    imapMessageFlagsType imapFlags) {
  MOZ_TRY(AddOperation(kFlagsChanged));
  MOZ_TRY(SetNewFlags(imapFlags));
  return NS_OK;
}

NS_IMETHODIMP nsMsgOfflineImapOperation::SetMsgMovedOp() {
  MOZ_TRY(AddOperation(kMsgMoved));
  return NS_OK;
}

NS_IMETHODIMP nsMsgOfflineImapOperation::SetMsgCopyOp(
    const nsACString& destinationBox) {
  MOZ_TRY(AddOperation(kMsgCopy));
  nsresult rv = GetCopiesFromDB();
  NS_ENSURE_SUCCESS(rv, rv);
  m_copyDestinations.AppendElement(destinationBox);
  return SetCopiesToDB();
}

NS_IMETHODIMP nsMsgOfflineImapOperation::SetMoveResultOp(
    const nsACString& aSourceFolderUri) {
  m_moveSourceFolderUri = aSourceFolderUri;
  MOZ_TRY(AddOperation(kMoveResult));
  return m_mdb->SetProperty(m_mdbRow, PROP_SRC_FOLDER_URI,
                            PromiseFlatCString(aSourceFolderUri).get());
}

NS_IMETHODIMP nsMsgOfflineImapOperation::SetAppendDraftOp(
    const nsACString& destFolderUri) {
  MOZ_TRY(AddOperation(kAppendDraft));
  MOZ_TRY(SetDestinationFolderURI(destFolderUri));
  return NS_OK;
}

NS_IMETHODIMP nsMsgOfflineImapOperation::SetDeleteAllMsgsOp() {
  MOZ_TRY(AddOperation(kDeleteAllMsgs));
  return NS_OK;
}

NS_IMETHODIMP nsMsgOfflineImapOperation::SetAddKeywordsOp(
    nsACString const& keyword) {
  MOZ_TRY(AddOperation(kAddKeywords));
  return AddKeyword(keyword, m_keywordsToAdd, PROP_KEYWORD_ADD,
                    m_keywordsToRemove, PROP_KEYWORD_REMOVE);
}

NS_IMETHODIMP nsMsgOfflineImapOperation::SetRemoveKeywordsOp(
    nsACString const& keyword) {
  MOZ_TRY(AddOperation(kRemoveKeywords));
  return AddKeyword(keyword, m_keywordsToRemove, PROP_KEYWORD_REMOVE,
                    m_keywordsToAdd, PROP_KEYWORD_ADD);
}

/* void clearOperation (in nsOfflineImapOperationType operation); */
NS_IMETHODIMP nsMsgOfflineImapOperation::ClearOperation(
    nsOfflineImapOperationType aOperation) {
  if (MOZ_LOG_TEST(IMAPOffline, LogLevel::Info))
    MOZ_LOG(IMAPOffline, LogLevel::Info,
            ("msg id %x clearOperation was %x clear %x", m_messageKey,
             m_operation, aOperation));
  m_operation &= ~aOperation;
  switch (aOperation) {
    case kMsgMoved:
    case kAppendTemplate:
    case kAppendDraft:
      m_moveDestination.Truncate();
      break;
    case kMsgCopy:
      NS_ENSURE_TRUE(m_copyDestinations.Length() > 0, NS_ERROR_UNEXPECTED);
      m_copyDestinations.RemoveElementAt(0);
      // NOTE: Likely bug: shouldn't this also keep kMsgCopy set if there
      // are more destinations?
      break;
  }
  return m_mdb->SetUint32Property(m_mdbRow, PROP_OPERATION, m_operation);
}

/* attribute nsMsgKey messageKey; */
NS_IMETHODIMP nsMsgOfflineImapOperation::GetMessageKey(nsMsgKey* aMessageKey) {
  NS_ENSURE_ARG(aMessageKey);
  *aMessageKey = m_messageKey;
  return NS_OK;
}

NS_IMETHODIMP nsMsgOfflineImapOperation::SetMessageKey(nsMsgKey aMessageKey) {
  m_messageKey = aMessageKey;
  return m_mdb->SetUint32Property(m_mdbRow, PROP_MESSAGE_KEY, m_messageKey);
}

/* attribute nsMsgKey srcMessageKey; */
NS_IMETHODIMP nsMsgOfflineImapOperation::GetSrcMessageKey(
    nsMsgKey* aMessageKey) {
  NS_ENSURE_ARG(aMessageKey);
  return m_mdb->GetUint32Property(m_mdbRow, PROP_SRC_MESSAGE_KEY, aMessageKey,
                                  nsMsgKey_None);
}

NS_IMETHODIMP nsMsgOfflineImapOperation::SetSrcMessageKey(
    nsMsgKey aMessageKey) {
  return m_mdb->SetUint32Property(m_mdbRow, PROP_SRC_MESSAGE_KEY, aMessageKey);
}

/* attribute unsigned long srcUid; */
NS_IMETHODIMP nsMsgOfflineImapOperation::GetSrcUid(ImapUid* uid) {
  NS_ENSURE_ARG(uid);
  return m_mdb->GetUint32Property(m_mdbRow, PROP_SRC_UID, (uint32_t*)uid, 0);
}

NS_IMETHODIMP nsMsgOfflineImapOperation::SetSrcUid(ImapUid uid) {
  return m_mdb->SetUint32Property(m_mdbRow, PROP_SRC_UID, (uint32_t)uid);
}

/* attribute imapMessageFlagsType flagOperation; */
NS_IMETHODIMP nsMsgOfflineImapOperation::GetNewFlags(
    imapMessageFlagsType* aNewFlags) {
  NS_ENSURE_ARG(aNewFlags);
  uint32_t flags;
  nsresult rv = m_mdb->GetUint32Property(m_mdbRow, PROP_NEW_FLAGS, &flags, 0);
  *aNewFlags = m_newFlags = (imapMessageFlagsType)flags;
  return rv;
}

NS_IMETHODIMP nsMsgOfflineImapOperation::SetNewFlags(
    imapMessageFlagsType aNewFlags) {
  if (MOZ_LOG_TEST(IMAPOffline, LogLevel::Info) && m_newFlags != aNewFlags)
    MOZ_LOG(IMAPOffline, LogLevel::Info,
            ("msg id %x SetNewFlags was %x to %x", m_messageKey, m_newFlags,
             aNewFlags));
  m_newFlags = aNewFlags;
  return m_mdb->SetUint32Property(m_mdbRow, PROP_NEW_FLAGS, m_newFlags);
}

/* attribute string destinationFolderURI; */
NS_IMETHODIMP nsMsgOfflineImapOperation::GetDestinationFolderURI(
    nsACString& aDestinationFolderURI) {
  (void)m_mdb->GetProperty(m_mdbRow, PROP_MOVE_DEST_FOLDER_URI,
                           getter_Copies(m_moveDestination));
  aDestinationFolderURI = m_moveDestination;
  return NS_OK;
}

NS_IMETHODIMP nsMsgOfflineImapOperation::SetDestinationFolderURI(
    const nsACString& aDestinationFolderURI) {
  if (MOZ_LOG_TEST(IMAPOffline, LogLevel::Info))
    MOZ_LOG(IMAPOffline, LogLevel::Info,
            ("msg id %x SetDestinationFolderURI to %s", m_messageKey,
             PromiseFlatCString(aDestinationFolderURI).get()));
  m_moveDestination = aDestinationFolderURI;
  return m_mdb->SetProperty(m_mdbRow, PROP_MOVE_DEST_FOLDER_URI,
                            PromiseFlatCString(aDestinationFolderURI).get());
}

/* readonly attribute AUTF8String moveSourceFolderUri; */
NS_IMETHODIMP nsMsgOfflineImapOperation::GetMoveSourceFolderUri(
    nsACString& aSourceFolderUri) {
  nsresult rv = m_mdb->GetProperty(m_mdbRow, PROP_SRC_FOLDER_URI,
                                   getter_Copies(m_moveSourceFolderUri));
  aSourceFolderUri = m_moveSourceFolderUri;
  return rv;
}

/* attribute string keyword; */
NS_IMETHODIMP nsMsgOfflineImapOperation::GetKeywordsToAdd(
    nsACString& keywords) {
  nsresult rv = m_mdb->GetProperty(m_mdbRow, PROP_KEYWORD_ADD,
                                   getter_Copies(m_keywordsToAdd));
  keywords = m_keywordsToAdd;
  return rv;
}

NS_IMETHODIMP nsMsgOfflineImapOperation::GetKeywordsToRemove(
    nsACString& keywords) {
  nsresult rv = m_mdb->GetProperty(m_mdbRow, PROP_KEYWORD_REMOVE,
                                   getter_Copies(m_keywordsToRemove));
  keywords = m_keywordsToRemove;
  return rv;
}

nsresult nsMsgOfflineImapOperation::AddKeyword(nsACString const& keyword,
                                               nsCString& addList,
                                               const char* addProp,
                                               nsCString& removeList,
                                               const char* removeProp) {
  int32_t startOffset, keywordLength;
  if (!MsgFindKeyword(keyword, addList, &startOffset, &keywordLength)) {
    if (!addList.IsEmpty()) addList.Append(' ');
    addList.Append(keyword);
  }
  // if the keyword we're removing was in the list of keywords to add,
  // cut it from that list.
  if (MsgFindKeyword(keyword, removeList, &startOffset, &keywordLength)) {
    removeList.Cut(startOffset, keywordLength);
    m_mdb->SetProperty(m_mdbRow, removeProp, removeList.get());
  }
  return m_mdb->SetProperty(m_mdbRow, addProp, addList.get());
}

// we write out the folders as one string, separated by 0x1.
#define FOLDER_SEP_CHAR '\001'

// Helper to read m_copyDestinations list from db.
nsresult nsMsgOfflineImapOperation::GetCopiesFromDB() {
  nsCString copyDests;
  m_copyDestinations.Clear();
  nsresult rv =
      m_mdb->GetProperty(m_mdbRow, PROP_COPY_DESTS, getter_Copies(copyDests));
  // use 0x1 as the delimiter between folder names since it's not a legal
  // character
  if (NS_SUCCEEDED(rv) && !copyDests.IsEmpty()) {
    int32_t curCopyDestStart = 0;
    int32_t nextCopyDestPos = 0;

    while (nextCopyDestPos != -1) {
      nsCString curDest;
      nextCopyDestPos = copyDests.FindChar(FOLDER_SEP_CHAR, curCopyDestStart);
      if (nextCopyDestPos > 0)
        curDest = Substring(copyDests, curCopyDestStart,
                            nextCopyDestPos - curCopyDestStart);
      else
        curDest = Substring(copyDests, curCopyDestStart,
                            copyDests.Length() - curCopyDestStart);
      curCopyDestStart = nextCopyDestPos + 1;
      m_copyDestinations.AppendElement(curDest);
    }
  }
  return rv;
}

// Helper to write m_copyDestinations list to db.
nsresult nsMsgOfflineImapOperation::SetCopiesToDB() {
  nsAutoCString copyDests;

  // use 0x1 as the delimiter between folders
  for (uint32_t i = 0; i < m_copyDestinations.Length(); i++) {
    if (i > 0) copyDests.Append(FOLDER_SEP_CHAR);
    copyDests.Append(m_copyDestinations.ElementAt(i));
  }
  return m_mdb->SetProperty(m_mdbRow, PROP_COPY_DESTS, copyDests.get());
}

/* string getCopyDestination (in long copyIndex); */
NS_IMETHODIMP nsMsgOfflineImapOperation::GetCopyDestination(
    int32_t copyIndex, nsACString& retval) {
  nsresult rv = GetCopiesFromDB();
  NS_ENSURE_SUCCESS(rv, rv);
  if (copyIndex >= (int32_t)m_copyDestinations.Length())
    return NS_ERROR_ILLEGAL_VALUE;
  retval = m_copyDestinations.ElementAt(copyIndex);
  return NS_OK;
}

/* attribute unsigned log msgSize; */
NS_IMETHODIMP nsMsgOfflineImapOperation::GetMsgSize(uint32_t* aMsgSize) {
  NS_ENSURE_ARG(aMsgSize);
  return m_mdb->GetUint32Property(m_mdbRow, PROP_MSG_SIZE, aMsgSize, 0);
}

NS_IMETHODIMP nsMsgOfflineImapOperation::SetMsgSize(uint32_t aMsgSize) {
  return m_mdb->SetUint32Property(m_mdbRow, PROP_MSG_SIZE, aMsgSize);
}

NS_IMETHODIMP nsMsgOfflineImapOperation::SetPlayingBack(bool aPlayingBack) {
  return m_mdb->SetBooleanProperty(m_mdbRow, PROP_PLAYINGBACK, aPlayingBack);
}

NS_IMETHODIMP nsMsgOfflineImapOperation::GetPlayingBack(bool* aPlayingBack) {
  NS_ENSURE_ARG(aPlayingBack);
  return m_mdb->GetBooleanProperty(m_mdbRow, PROP_PLAYINGBACK, aPlayingBack);
}

// {fmt} support for nsOfflineImapOperationType.
nsCString format_as(nsOfflineImapOperationType operation) {
  struct {
    nsOfflineImapOperationType mask;
    nsLiteralCString name;
  } lookup[] = {
      {nsIMsgOfflineImapOperation::kFlagsChanged, "kFlagsChanged"_ns},
      {nsIMsgOfflineImapOperation::kMsgMoved, "kMsgMoved"_ns},
      {nsIMsgOfflineImapOperation::kMsgCopy, "kMsgCopy"_ns},
      {nsIMsgOfflineImapOperation::kMoveResult, "kMoveResult"_ns},
      {nsIMsgOfflineImapOperation::kAppendDraft, "kAppendDraft"_ns},
      {nsIMsgOfflineImapOperation::kAddedHeader, "kAddedHeader"_ns},
      {nsIMsgOfflineImapOperation::kDeletedMsg, "kDeletedMsg"_ns},
      {nsIMsgOfflineImapOperation::kMsgMarkedDeleted, "kMsgMarkedDeleted"_ns},
      {nsIMsgOfflineImapOperation::kAppendTemplate, "kAppendTemplate"_ns},
      {nsIMsgOfflineImapOperation::kDeleteAllMsgs, "kDeleteAllMsgs"_ns},
      {nsIMsgOfflineImapOperation::kAddKeywords, "kAddKeywords"_ns},
      {nsIMsgOfflineImapOperation::kRemoveKeywords, "kRemoveKeywords"_ns},
  };

  nsTArray<nsCString> fragments;
  for (auto const& entry : lookup) {
    if (operation & entry.mask) {
      fragments.AppendElement(entry.name);
    }
  }

  return StringJoin("|"_ns, fragments);
}

// {fmt} support for XPIDL_nsIMsgOfflineImapOperation.
nsCString format_as(const nsIMsgOfflineImapOperation& offlineOp) {
  // Hoop-jumping because XPCOM makes attribute accessors non-const.
  // And format_as() only matches const references.
  nsIMsgOfflineImapOperation* op =
      const_cast<nsIMsgOfflineImapOperation*>(&offlineOp);

  nsOfflineImapOperationType operation;
  nsMsgKey messageKey;
  nsMsgKey srcMessageKey;
  ImapUid srcUid;
  imapMessageFlagsType newFlags;

  nsAutoCString destinationFolderURI;
  nsAutoCString moveSourceFolderUri;
  nsAutoCString keywordsToAdd;
  nsAutoCString keywordsToRemove;
  uint32_t msgSize;
  bool playingBack;

  op->GetOperation(&operation);
  op->GetMessageKey(&messageKey);
  op->GetSrcMessageKey(&srcMessageKey);
  op->GetSrcUid(&srcUid);
  op->GetNewFlags(&newFlags);
  op->GetDestinationFolderURI(destinationFolderURI);
  op->GetMoveSourceFolderUri(moveSourceFolderUri);
  op->GetKeywordsToAdd(keywordsToAdd);
  op->GetKeywordsToRemove(keywordsToRemove);
  op->GetMsgSize(&msgSize);
  op->GetPlayingBack(&playingBack);

  // Grab the (internal) copyDestinations list.
  // No way to get size, so keep going until error.
  nsTArray<nsCString> copyDests;
  int i = 0;
  while (true) {
    nsAutoCString uri;
    nsresult rv = op->GetCopyDestination(i, uri);
    if (NS_FAILED(rv)) {
      break;
    }
    copyDests.AppendElement(uri);
    ++i;
  }

  nsTArray<nsCString> fragments;

  fragments.AppendElement(
      fmt::format("{} {}:", messageKey, format_as(operation)));

  if (srcMessageKey != nsMsgKey_None) {
    fragments.AppendElement(fmt::format("srcMessageKey={}", srcMessageKey));
  }
  if (srcUid != 0) {
    fragments.AppendElement(fmt::format("srcUid={}", srcUid));
  }
  if (newFlags) {
    fragments.AppendElement(fmt::format("newFlags={}", newFlags));
  }
  if (!destinationFolderURI.IsEmpty()) {
    fragments.AppendElement(fmt::format("destFolder={}", destinationFolderURI));
  }
  if (!moveSourceFolderUri.IsEmpty()) {
    fragments.AppendElement(
        fmt::format("moveSourceFolderUri={}", moveSourceFolderUri));
  }
  if (!copyDests.IsEmpty()) {
    fragments.AppendElement(
        fmt::format("copyDestinations: {}", fmt::join(copyDests, ",")));
  }
  if (!keywordsToAdd.IsEmpty()) {
    fragments.AppendElement(fmt::format("keywordsToAdd={}", keywordsToAdd));
  }
  if (!keywordsToRemove.IsEmpty()) {
    fragments.AppendElement(
        fmt::format("keywordsToRemove={}", keywordsToRemove));
  }
  if (msgSize) {
    fragments.AppendElement(fmt::format("msgSize={}", msgSize));
  }
  if (playingBack) {
    fragments.AppendElement("playingBack"_ns);
  }

  return StringJoin(" "_ns, fragments);
}
