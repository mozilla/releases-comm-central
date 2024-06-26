/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MailNewsTypes.h"
#include "msgCore.h"
#include "nsUnicharUtils.h"
#include "nsMsgDBFolder.h"
#include "nsMsgFolderFlags.h"
#include "nsIPrefBranch.h"
#include "nsIPrefService.h"
#include "nsNetUtil.h"
#include "nsIMsgFolderCache.h"
#include "nsIMsgFolderCacheElement.h"
#include "nsIMsgMailNewsUrl.h"
#include "nsMsgDatabase.h"
#include "nsIMsgAccountManager.h"
#include "nsISeekableStream.h"
#include "nsIChannel.h"
#include "nsITransport.h"
#include "nsIWindowWatcher.h"
#include "FolderCompactor.h"
#include "nsIDocShell.h"
#include "nsIMsgWindow.h"
#include "nsIPrompt.h"
#include "nsIInterfaceRequestorUtils.h"
#include "nsIAbCard.h"
#include "nsISpamSettings.h"
#include "nsIMsgFilterPlugin.h"
#include "nsIMsgMailSession.h"
#include "nsReadLine.h"
#include "nsIParserUtils.h"
#include "nsIDocumentEncoder.h"
#include "nsMsgI18N.h"
#include "nsIMIMEHeaderParam.h"
#include "plbase64.h"
#include <time.h>
#include "nsIMsgFolderNotificationService.h"
#include "nsIMimeHeaders.h"
#include "nsDirectoryServiceDefs.h"
#include "nsIMsgTraitService.h"
#include "nsIMessenger.h"
#include "nsThreadUtils.h"
#include "nsITransactionManager.h"
#include "nsMsgReadStateTxn.h"
#include "prmem.h"
#include "nsIPK11TokenDB.h"
#include "nsIPK11Token.h"
#include "nsMsgUtils.h"
#include "nsIMsgFilterService.h"
#include "nsDirectoryServiceUtils.h"
#include "nsMimeTypes.h"
#include "nsIMsgFilter.h"
#include "nsIScriptError.h"
#include "nsIURIMutator.h"
#include "nsIXULAppInfo.h"
#include "nsPrintfCString.h"
#include "mozilla/Components.h"
#include "mozilla/intl/LocaleService.h"
#include "mozilla/Logging.h"
#include "mozilla/ScopeExit.h"
#include "mozilla/UniquePtr.h"
#include "mozilla/Utf8.h"
#include "nsIPromptService.h"
#include "nsEmbedCID.h"
#include "nsIPropertyBag2.h"

#define oneHour 3600000000U

using namespace mozilla;

extern LazyLogModule FILTERLOGMODULE;
extern LazyLogModule DBLog;

static PRTime gtimeOfLastPurgeCheck;  // variable to know when to check for
                                      // purge threshold

#define PREF_MAIL_PROMPT_PURGE_THRESHOLD "mail.prompt_purge_threshhold"
#define PREF_MAIL_PURGE_THRESHOLD "mail.purge_threshhold"
#define PREF_MAIL_PURGE_THRESHOLD_MB "mail.purge_threshhold_mb"
#define PREF_MAIL_PURGE_MIGRATED "mail.purge_threshold_migrated"
#define PREF_MAIL_PURGE_ASK "mail.purge.ask"
#define PREF_MAIL_WARN_FILTER_CHANGED "mail.warn_filter_changed"

const char* kUseServerRetentionProp = "useServerRetention";

/**
 * mozilla::intl APIs require sizeable buffers. This class abstracts over
 * the nsTArray.
 */
class nsTArrayU8Buffer {
 public:
  using CharType = uint8_t;

  // Do not allow copy or move. Move could be added in the future if needed.
  nsTArrayU8Buffer(const nsTArrayU8Buffer&) = delete;
  nsTArrayU8Buffer& operator=(const nsTArrayU8Buffer&) = delete;

  explicit nsTArrayU8Buffer(nsTArray<CharType>& aArray) : mArray(aArray) {}

  /**
   * Ensures the buffer has enough space to accommodate |size| elements.
   */
  [[nodiscard]] bool reserve(size_t size) {
    mArray.SetCapacity(size);
    // nsTArray::SetCapacity returns void, return true to keep the API the same
    // as the other Buffer implementations.
    return true;
  }

  /**
   * Returns the raw data inside the buffer.
   */
  CharType* data() { return mArray.Elements(); }

  /**
   * Returns the count of elements written into the buffer.
   */
  size_t length() const { return mArray.Length(); }

  /**
   * Returns the buffer's overall capacity.
   */
  size_t capacity() const { return mArray.Capacity(); }

  /**
   * Resizes the buffer to the given amount of written elements.
   */
  void written(size_t amount) {
    MOZ_ASSERT(amount <= mArray.Capacity());
    // This sets |mArray|'s internal size so that it matches how much was
    // written. This is necessary because the write happens across FFI
    // boundaries.
    mArray.SetLengthAndRetainStorage(amount);
  }

 private:
  nsTArray<CharType>& mArray;
};

NS_IMPL_ISUPPORTS(nsMsgFolderService, nsIMsgFolderService)

// This method serves the only purpose to re-initialize the
// folder name strings when UI initialization is done.
// XXX TODO: This can be removed when the localization system gets
// initialized in M-C code before, for example, the permission manager
// triggers folder creation during imap: URI creation.
// In fact, the entire class together with nsMsgDBFolder::FolderNamesReady()
// can be removed.
NS_IMETHODIMP nsMsgFolderService::InitializeFolderStrings() {
  nsMsgDBFolder::initializeStrings();
  nsMsgDBFolder::gInitializeStringsDone = true;
  nsMsgDBFolder::gIsEnglishApp = -1;
  return NS_OK;
}

mozilla::UniquePtr<mozilla::intl::Collator>
    nsMsgDBFolder::gCollationKeyGenerator = nullptr;

nsString nsMsgDBFolder::kLocalizedInboxName;
nsString nsMsgDBFolder::kLocalizedTrashName;
nsString nsMsgDBFolder::kLocalizedSentName;
nsString nsMsgDBFolder::kLocalizedDraftsName;
nsString nsMsgDBFolder::kLocalizedTemplatesName;
nsString nsMsgDBFolder::kLocalizedUnsentName;
nsString nsMsgDBFolder::kLocalizedJunkName;
nsString nsMsgDBFolder::kLocalizedArchivesName;

nsString nsMsgDBFolder::kLocalizedBrandShortName;

nsrefcnt nsMsgDBFolder::mInstanceCount = 0;
bool nsMsgDBFolder::gInitializeStringsDone = false;
// This is used in `nonEnglishApp()` to determine localised
// folders strings.
// -1: not retrieved yet, 1: English, 0: non-English.
int nsMsgDBFolder::gIsEnglishApp;

// We define strings for folder properties and events.
// Properties:
constexpr nsLiteralCString kBiffState = "BiffState"_ns;
constexpr nsLiteralCString kCanFileMessages = "CanFileMessages"_ns;
constexpr nsLiteralCString kDefaultServer = "DefaultServer"_ns;
constexpr nsLiteralCString kFlagged = "Flagged"_ns;
constexpr nsLiteralCString kFolderFlag = "FolderFlag"_ns;
constexpr nsLiteralCString kFolderSize = "FolderSize"_ns;
constexpr nsLiteralCString kIsDeferred = "isDeferred"_ns;
constexpr nsLiteralCString kIsSecure = "isSecure"_ns;
constexpr nsLiteralCString kJunkStatusChanged = "JunkStatusChanged"_ns;
constexpr nsLiteralCString kKeywords = "Keywords"_ns;
constexpr nsLiteralCString kMRMTimeChanged = "MRMTimeChanged"_ns;
constexpr nsLiteralCString kMRUTimeChanged = "MRUTimeChanged"_ns;
constexpr nsLiteralCString kMsgLoaded = "msgLoaded"_ns;
constexpr nsLiteralCString kName = "Name"_ns;
constexpr nsLiteralCString kNewMailReceived = "NewMailReceived"_ns;
constexpr nsLiteralCString kNewMessages = "NewMessages"_ns;
constexpr nsLiteralCString kOpen = "open"_ns;
constexpr nsLiteralCString kSortOrder = "SortOrder"_ns;
constexpr nsLiteralCString kStatus = "Status"_ns;
constexpr nsLiteralCString kSynchronize = "Synchronize"_ns;
constexpr nsLiteralCString kTotalMessages = "TotalMessages"_ns;
constexpr nsLiteralCString kTotalUnreadMessages = "TotalUnreadMessages"_ns;

// Events:
constexpr nsLiteralCString kAboutToCompact = "AboutToCompact"_ns;
constexpr nsLiteralCString kCompactCompleted = "CompactCompleted"_ns;
constexpr nsLiteralCString kDeleteOrMoveMsgCompleted =
    "DeleteOrMoveMsgCompleted"_ns;
constexpr nsLiteralCString kDeleteOrMoveMsgFailed = "DeleteOrMoveMsgFailed"_ns;
constexpr nsLiteralCString kFiltersApplied = "FiltersApplied"_ns;
constexpr nsLiteralCString kFolderCreateCompleted = "FolderCreateCompleted"_ns;
constexpr nsLiteralCString kFolderCreateFailed = "FolderCreateFailed"_ns;
constexpr nsLiteralCString kFolderLoaded = "FolderLoaded"_ns;
constexpr nsLiteralCString kNumNewBiffMessages = "NumNewBiffMessages"_ns;
constexpr nsLiteralCString kRenameCompleted = "RenameCompleted"_ns;

NS_IMPL_ISUPPORTS(nsMsgDBFolder, nsISupportsWeakReference, nsIMsgFolder,
                  nsIDBChangeListener, nsIUrlListener,
                  nsIJunkMailClassificationListener,
                  nsIMsgTraitClassificationListener)

nsMsgDBFolder::nsMsgDBFolder(void)
    : mAddListener(true),
      mNewMessages(false),
      mGettingNewMessages(false),
      mLastMessageLoaded(nsMsgKey_None),
      m_numOfflineMsgLines(0),
      m_bytesAddedToLocalMsg(0),
      m_tempMessageStreamBytesWritten(0),
      mFlags(0),
      mNumUnreadMessages(-1),
      mNumTotalMessages(-1),
      mNotifyCountChanges(true),
      mExpungedBytes(0),
      mInitializedFromCache(false),
      mSemaphoreHolder(nullptr),
      mNumPendingUnreadMessages(0),
      mNumPendingTotalMessages(0),
      mFolderSize(kSizeUnknown),
      mNumNewBiffMessages(0),
      mHaveParsedURI(false),
      mIsServerIsValid(false),
      mIsServer(false),
      mBayesJunkClassifying(false),
      mBayesTraitClassifying(false) {
  if (mInstanceCount++ <= 0) {
    initializeStrings();

    do {
      nsresult rv;
      // We need to check whether we're running under xpcshell,
      // in that case, we always assume that the strings are good.
      // XXX TODO: This hack can be removed when the localization system gets
      // initialized in M-C code before, for example, the permission manager
      // triggers folder creation during imap: URI creation.
      nsCOMPtr<nsIXULAppInfo> appinfo =
          do_GetService("@mozilla.org/xre/app-info;1", &rv);
      if (NS_FAILED(rv)) break;
      nsAutoCString appName;
      rv = appinfo->GetName(appName);
      if (NS_FAILED(rv)) break;
      if (appName.Equals("xpcshell")) gInitializeStringsDone = true;
    } while (false);

    createCollationKeyGenerator();
    gtimeOfLastPurgeCheck = 0;
  }

  mProcessingFlag[0].bit = nsMsgProcessingFlags::ClassifyJunk;
  mProcessingFlag[1].bit = nsMsgProcessingFlags::ClassifyTraits;
  mProcessingFlag[2].bit = nsMsgProcessingFlags::TraitsDone;
  mProcessingFlag[3].bit = nsMsgProcessingFlags::FiltersDone;
  mProcessingFlag[4].bit = nsMsgProcessingFlags::FilterToMove;
  mProcessingFlag[5].bit = nsMsgProcessingFlags::NotReportedClassified;
  for (uint32_t i = 0; i < nsMsgProcessingFlags::NumberOfFlags; i++)
    mProcessingFlag[i].keys = nsMsgKeySetU::Create();
}

nsMsgDBFolder::~nsMsgDBFolder(void) {
  for (uint32_t i = 0; i < nsMsgProcessingFlags::NumberOfFlags; i++)
    delete mProcessingFlag[i].keys;

  if (--mInstanceCount == 0) {
    nsMsgDBFolder::gCollationKeyGenerator = nullptr;
  }
  // shutdown but don't shutdown children.
  Shutdown(false);
}

NS_IMETHODIMP nsMsgDBFolder::FolderNamesReady(bool* aReady) {
  *aReady = gInitializeStringsDone;
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::Shutdown(bool shutdownChildren) {
  if (mDatabase) {
    mDatabase->RemoveListener(this);
    mDatabase->ForceClosed();
    mDatabase = nullptr;
    if (mBackupDatabase) {
      mBackupDatabase->ForceClosed();
      mBackupDatabase = nullptr;
    }
  }

  if (shutdownChildren) {
    int32_t count = mSubFolders.Count();

    for (int32_t i = 0; i < count; i++) mSubFolders[i]->Shutdown(true);

    // Reset incoming server pointer and pathname.
    mServer = nullptr;
    mPath = nullptr;
    mHaveParsedURI = false;
    mName.Truncate();
    mSubFolders.Clear();
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::ForceDBClosed() {
  int32_t count = mSubFolders.Count();
  for (int32_t i = 0; i < count; i++) mSubFolders[i]->ForceDBClosed();

  if (mDatabase) {
    mDatabase->ForceClosed();
    mDatabase = nullptr;
  } else {
    nsCOMPtr<nsIMsgDBService> mailDBFactory(
        do_GetService("@mozilla.org/msgDatabase/msgDBService;1"));
    if (mailDBFactory) mailDBFactory->ForceFolderDBClosed(this);
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::CloseAndBackupFolderDB(const nsACString& newName) {
  ForceDBClosed();

  // We only support backup for mail at the moment
  if (!(mFlags & nsMsgFolderFlags::Mail)) return NS_OK;

  nsCOMPtr<nsIFile> folderPath;
  nsresult rv = GetFilePath(getter_AddRefs(folderPath));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIFile> dbFile;
  rv = GetSummaryFileLocation(folderPath, getter_AddRefs(dbFile));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIFile> backupDir;
  rv = CreateBackupDirectory(getter_AddRefs(backupDir));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIFile> backupDBFile;
  rv = GetBackupSummaryFile(getter_AddRefs(backupDBFile), newName);
  NS_ENSURE_SUCCESS(rv, rv);

  if (mBackupDatabase) {
    mBackupDatabase->ForceClosed();
    mBackupDatabase = nullptr;
  }

  backupDBFile->Remove(false);
  bool backupExists;
  backupDBFile->Exists(&backupExists);
  NS_ASSERTION(!backupExists, "Couldn't delete database backup");
  if (backupExists) return NS_ERROR_FAILURE;

  if (!newName.IsEmpty()) {
    nsAutoCString backupName;
    rv = backupDBFile->GetNativeLeafName(backupName);
    NS_ENSURE_SUCCESS(rv, rv);
    return dbFile->CopyToNative(backupDir, backupName);
  } else
    return dbFile->CopyToNative(backupDir, EmptyCString());
}

NS_IMETHODIMP nsMsgDBFolder::OpenBackupMsgDatabase() {
  if (mBackupDatabase) return NS_OK;
  nsCOMPtr<nsIFile> folderPath;
  nsresult rv = GetFilePath(getter_AddRefs(folderPath));
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoString folderName;
  rv = folderPath->GetLeafName(folderName);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIFile> backupDir;
  rv = CreateBackupDirectory(getter_AddRefs(backupDir));
  NS_ENSURE_SUCCESS(rv, rv);

  // We use a dummy message folder file so we can use
  // GetSummaryFileLocation to get the db file name
  nsCOMPtr<nsIFile> backupDBDummyFolder;
  rv = CreateBackupDirectory(getter_AddRefs(backupDBDummyFolder));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = backupDBDummyFolder->Append(folderName);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgDBService> msgDBService =
      do_GetService("@mozilla.org/msgDatabase/msgDBService;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = msgDBService->OpenMailDBFromFile(backupDBDummyFolder, this, false, true,
                                        getter_AddRefs(mBackupDatabase));
  // we add a listener so that we can close the db during OnAnnouncerGoingAway.
  // There should not be any other calls to the listener with the backup
  // database
  if (NS_SUCCEEDED(rv) && mBackupDatabase) mBackupDatabase->AddListener(this);

  if (rv == NS_MSG_ERROR_FOLDER_SUMMARY_OUT_OF_DATE)
    // this is normal in reparsing
    rv = NS_OK;
  return rv;
}

NS_IMETHODIMP nsMsgDBFolder::RemoveBackupMsgDatabase() {
  nsCOMPtr<nsIFile> folderPath;
  nsresult rv = GetFilePath(getter_AddRefs(folderPath));
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoString folderName;
  rv = folderPath->GetLeafName(folderName);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIFile> backupDir;
  rv = CreateBackupDirectory(getter_AddRefs(backupDir));
  NS_ENSURE_SUCCESS(rv, rv);

  // We use a dummy message folder file so we can use
  // GetSummaryFileLocation to get the db file name
  nsCOMPtr<nsIFile> backupDBDummyFolder;
  rv = CreateBackupDirectory(getter_AddRefs(backupDBDummyFolder));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = backupDBDummyFolder->Append(folderName);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIFile> backupDBFile;
  rv =
      GetSummaryFileLocation(backupDBDummyFolder, getter_AddRefs(backupDBFile));
  NS_ENSURE_SUCCESS(rv, rv);

  if (mBackupDatabase) {
    mBackupDatabase->ForceClosed();
    mBackupDatabase = nullptr;
  }

  return backupDBFile->Remove(false);
}

NS_IMETHODIMP nsMsgDBFolder::StartFolderLoading(void) {
  if (mDatabase) mDatabase->RemoveListener(this);
  mAddListener = false;
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::EndFolderLoading(void) {
  if (mDatabase) mDatabase->AddListener(this);
  mAddListener = true;
  UpdateSummaryTotals(true);

  // GGGG       check for new mail here and call SetNewMessages...?? -- ONE OF
  // THE 2 PLACES
  if (mDatabase) m_newMsgs.Clear();

  return NS_OK;
}

NS_IMETHODIMP
nsMsgDBFolder::GetExpungedBytes(int64_t* count) {
  NS_ENSURE_ARG_POINTER(count);

  if (mDatabase) {
    nsresult rv;
    nsCOMPtr<nsIDBFolderInfo> folderInfo;
    rv = mDatabase->GetDBFolderInfo(getter_AddRefs(folderInfo));
    if (NS_FAILED(rv)) return rv;
    rv = folderInfo->GetExpungedBytes(count);
    if (NS_SUCCEEDED(rv)) mExpungedBytes = *count;  // sync up with the database
    return rv;
  } else {
    ReadDBFolderInfo(false);
    *count = mExpungedBytes;
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::GetHasNewMessages(bool* hasNewMessages) {
  NS_ENSURE_ARG_POINTER(hasNewMessages);
  *hasNewMessages = mNewMessages;
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::SetHasNewMessages(bool curNewMessages) {
  if (curNewMessages != mNewMessages) {
    // Only change mru time if we're going from doesn't have new to has new.
    // technically, we should probably update mru time for every new message
    // but we would pay a performance penalty for that. If the user
    // opens the folder, the mrutime will get updated anyway.
    if (curNewMessages) SetMRUTime();
    bool oldNewMessages = mNewMessages;
    mNewMessages = curNewMessages;
    NotifyBoolPropertyChanged(kNewMessages, oldNewMessages, curNewMessages);
  }

  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::GetHasFolderOrSubfolderNewMessages(bool* aResult) {
  NS_ENSURE_ARG_POINTER(aResult);
  bool hasNewMessages = mNewMessages;

  if (!hasNewMessages) {
    int32_t count = mSubFolders.Count();
    for (int32_t i = 0; i < count; i++) {
      bool hasNew = false;
      mSubFolders[i]->GetHasFolderOrSubfolderNewMessages(&hasNew);
      if (hasNew) {
        hasNewMessages = true;
        break;
      }
    }
  }

  *aResult = hasNewMessages;
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::GetGettingNewMessages(bool* gettingNewMessages) {
  NS_ENSURE_ARG_POINTER(gettingNewMessages);
  *gettingNewMessages = mGettingNewMessages;
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::SetGettingNewMessages(bool gettingNewMessages) {
  mGettingNewMessages = gettingNewMessages;
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::GetFirstNewMessage(nsIMsgDBHdr** firstNewMessage) {
  // If there's not a db then there can't be new messages.  Return failure since
  // you should use HasNewMessages first.
  if (!mDatabase) return NS_ERROR_FAILURE;

  nsresult rv;
  nsMsgKey key;
  rv = mDatabase->GetFirstNew(&key);
  if (NS_FAILED(rv)) return rv;

  return mDatabase->GetMsgHdrForKey(key, firstNewMessage);
}

NS_IMETHODIMP nsMsgDBFolder::ClearNewMessages() {
  nsresult rv = NS_OK;
  bool dbWasCached = mDatabase != nullptr;
  if (!dbWasCached) GetDatabase();

  if (mDatabase) {
    mDatabase->GetNewList(m_saveNewMsgs);
    mDatabase->ClearNewList(true);
  }
  if (!dbWasCached) SetMsgDatabase(nullptr);

  m_newMsgs.Clear();
  mNumNewBiffMessages = 0;
  return rv;
}

void nsMsgDBFolder::UpdateNewMessages() {
  if (!(mFlags & nsMsgFolderFlags::Virtual)) {
    bool hasNewMessages = false;
    for (uint32_t keyIndex = 0; keyIndex < m_newMsgs.Length(); keyIndex++) {
      bool containsKey = false;
      mDatabase->ContainsKey(m_newMsgs[keyIndex], &containsKey);
      if (!containsKey) continue;
      bool isRead = false;
      nsresult rv2 = mDatabase->IsRead(m_newMsgs[keyIndex], &isRead);
      if (NS_SUCCEEDED(rv2) && !isRead) {
        hasNewMessages = true;
        mDatabase->AddToNewList(m_newMsgs[keyIndex]);
      }
    }
    SetHasNewMessages(hasNewMessages);
  }
}

// helper function that gets the cache element that corresponds to the passed in
// file spec. This could be static, or could live in another class - it's not
// specific to the current nsMsgDBFolder. If it lived at a higher level, we
// could cache the account manager and folder cache.
nsresult nsMsgDBFolder::GetFolderCacheElemFromFile(
    nsIFile* file, nsIMsgFolderCacheElement** cacheElement) {
  nsresult result;
  NS_ENSURE_ARG_POINTER(file);
  NS_ENSURE_ARG_POINTER(cacheElement);
  nsCOMPtr<nsIMsgFolderCache> folderCache;
  nsCOMPtr<nsIMsgAccountManager> accountMgr =
      do_GetService("@mozilla.org/messenger/account-manager;1", &result);
  if (NS_SUCCEEDED(result)) {
    result = accountMgr->GetFolderCache(getter_AddRefs(folderCache));
    if (NS_SUCCEEDED(result) && folderCache) {
      nsCString persistentPath;
      result = file->GetPersistentDescriptor(persistentPath);
      NS_ENSURE_SUCCESS(result, result);
      result =
          folderCache->GetCacheElement(persistentPath, false, cacheElement);
    }
  }
  return result;
}

nsresult nsMsgDBFolder::ReadDBFolderInfo(bool force) {
  // Since it turns out to be pretty expensive to open and close
  // the DBs all the time, if we have to open it once, get everything
  // we might need while we're here
  nsresult result = NS_OK;

  // If we reload the cache we might get stale info, so don't do it.
  if (!mInitializedFromCache) {
    // Path is used as a key into the foldercache.
    nsCOMPtr<nsIFile> dbPath;
    result = GetFolderCacheKey(getter_AddRefs(dbPath));
    if (dbPath) {
      nsCOMPtr<nsIMsgFolderCacheElement> cacheElement;
      result = GetFolderCacheElemFromFile(dbPath, getter_AddRefs(cacheElement));
      if (NS_SUCCEEDED(result) && cacheElement) {
        if (NS_SUCCEEDED(ReadFromFolderCacheElem(cacheElement))) {
          mInitializedFromCache = true;
        }
      }
    }
  }

  if (force || !mInitializedFromCache) {
    nsCOMPtr<nsIDBFolderInfo> folderInfo;
    nsCOMPtr<nsIMsgDatabase> db;
    bool weOpenedDB = !mDatabase;
    result =
        GetDBFolderInfoAndDB(getter_AddRefs(folderInfo), getter_AddRefs(db));
    if (NS_SUCCEEDED(result)) {
      if (folderInfo) {
        if (!mInitializedFromCache) {
          folderInfo->GetFlags((int32_t*)&mFlags);
          mInitializedFromCache = true;
        }

        folderInfo->GetNumMessages(&mNumTotalMessages);
        folderInfo->GetNumUnreadMessages(&mNumUnreadMessages);
        folderInfo->GetExpungedBytes(&mExpungedBytes);

        nsCString utf8Name;
        folderInfo->GetFolderName(utf8Name);
        if (!utf8Name.IsEmpty()) CopyUTF8toUTF16(utf8Name, mName);

        // These should be put in IMAP folder only.
        // folderInfo->GetImapTotalPendingMessages(&mNumPendingTotalMessages);
        // folderInfo->GetImapUnreadPendingMessages(&mNumPendingUnreadMessages);

        if (db) {
          // Except for the sort, this is a noop. But this seems to be the only
          // place that new keys are detected and, without the sort, new
          // messages are not detected for yahoo (returns imap UIDs highest
          // first unlike other imap server types).
          bool hasnew;
          nsresult rv;
          rv = db->HasNew(&hasnew);
          NS_ENSURE_SUCCESS(rv, rv);
          if (hasnew) db->SortNewKeysIfNeeded();
        }
        if (weOpenedDB) CloseDBIfFolderNotOpen(false);
      }
    } else {
      // we tried to open DB but failed - don't keep trying.
      // If a DB is created, we will call this method with force == TRUE,
      // and read from the db that way.
      mInitializedFromCache = true;
    }
  }
  return result;
}

nsresult nsMsgDBFolder::SendFlagNotifications(nsIMsgDBHdr* item,
                                              uint32_t oldFlags,
                                              uint32_t newFlags) {
  nsresult rv = NS_OK;
  uint32_t changedFlags = oldFlags ^ newFlags;
  if ((changedFlags & nsMsgMessageFlags::Read) &&
      (changedFlags & nsMsgMessageFlags::New)) {
    //..so..if the msg is read in the folder and the folder has new msgs clear
    // the account level and status bar biffs.
    rv = NotifyPropertyFlagChanged(item, kStatus, oldFlags, newFlags);
    rv = SetBiffState(nsMsgBiffState_NoMail);
  } else if (changedFlags &
             (nsMsgMessageFlags::Read | nsMsgMessageFlags::Replied |
              nsMsgMessageFlags::Forwarded | nsMsgMessageFlags::IMAPDeleted |
              nsMsgMessageFlags::New | nsMsgMessageFlags::Offline))
    rv = NotifyPropertyFlagChanged(item, kStatus, oldFlags, newFlags);
  else if ((changedFlags & nsMsgMessageFlags::Marked))
    rv = NotifyPropertyFlagChanged(item, kFlagged, oldFlags, newFlags);
  return rv;
}

NS_IMETHODIMP nsMsgDBFolder::DownloadMessagesForOffline(
    nsTArray<RefPtr<nsIMsgDBHdr>> const& messages, nsIMsgWindow*) {
  NS_ASSERTION(false, "imap and news need to override this");
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::DownloadAllForOffline(nsIUrlListener* listener,
                                                   nsIMsgWindow* msgWindow) {
  NS_ASSERTION(false, "imap and news need to override this");
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::GetMsgStore(nsIMsgPluggableStore** aStore) {
  NS_ENSURE_ARG_POINTER(aStore);
  nsCOMPtr<nsIMsgIncomingServer> server;
  nsresult rv = GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, NS_MSG_INVALID_OR_MISSING_SERVER);
  return server->GetMsgStore(aStore);
}

NS_IMETHODIMP nsMsgDBFolder::GetLocalMsgStream(nsIMsgDBHdr* hdr,
                                               nsIInputStream** stream) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
nsMsgDBFolder::GetOfflineStoreOutputStream(nsIMsgDBHdr* aHdr,
                                           nsIOutputStream** aOutputStream) {
  NS_ENSURE_ARG_POINTER(aOutputStream);
  NS_ENSURE_ARG_POINTER(aHdr);

  nsCOMPtr<nsIMsgPluggableStore> offlineStore;
  nsresult rv = GetMsgStore(getter_AddRefs(offlineStore));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = offlineStore->GetNewMsgOutputStream(this, &aHdr, aOutputStream);
  NS_ENSURE_SUCCESS(rv, rv);
  return rv;
}

NS_IMETHODIMP
nsMsgDBFolder::GetMsgInputStream(nsIMsgDBHdr* aMsgHdr,
                                 nsIInputStream** aInputStream) {
  NS_ENSURE_ARG_POINTER(aMsgHdr);
  NS_ENSURE_ARG_POINTER(aInputStream);
  nsCOMPtr<nsIMsgPluggableStore> msgStore;
  nsresult rv = GetMsgStore(getter_AddRefs(msgStore));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCString storeToken;
  rv = aMsgHdr->GetStringProperty("storeToken", storeToken);
  NS_ENSURE_SUCCESS(rv, rv);

  // Handle legacy DB which has mbox offset but no storeToken.
  // If this is still needed (open question), it should be done as separate
  // migration pass, probably at folder creation when store and DB are set
  // up (but that's tricky at the moment, because the DB is created
  // on-demand).
  if (storeToken.IsEmpty()) {
    nsAutoCString storeType;
    msgStore->GetStoreType(storeType);
    if (!storeType.EqualsLiteral("mbox")) {
      return NS_ERROR_FAILURE;  // DB is missing storeToken.
    }
    uint64_t offset;
    aMsgHdr->GetMessageOffset(&offset);
    storeToken = nsPrintfCString("%" PRIu64, offset);
    rv = aMsgHdr->SetStringProperty("storeToken", storeToken);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  rv = msgStore->GetMsgInputStream(this, storeToken, aInputStream);
  if (NS_FAILED(rv)) {
    NS_WARNING(nsPrintfCString(
                   "(debug) nsMsgDBFolder::GetMsgInputStream: msgStore->"
                   "GetMsgInputStream(this, ...) returned error rv=0x%" PRIx32
                   "\n",
                   static_cast<uint32_t>(rv))
                   .get());
  }

  NS_ENSURE_SUCCESS(rv, rv);
  return NS_OK;
}

// path coming in is the root path without the leaf name,
// on the way out, it's the whole path.
nsresult nsMsgDBFolder::CreateFileForDB(const nsAString& userLeafName,
                                        nsIFile* path, nsIFile** dbFile) {
  NS_ENSURE_ARG_POINTER(dbFile);

  nsAutoString proposedDBName(userLeafName);
  NS_MsgHashIfNecessary(proposedDBName);

  // (note, the caller of this will be using the dbFile to call db->Open()
  // will turn the path into summary file path, and append the ".msf" extension)
  //
  // we want db->Open() to create a new summary file
  // so we have to jump through some hoops to make sure the .msf it will
  // create is unique.  now that we've got the "safe" proposedDBName,
  // we append ".msf" to see if the file exists.  if so, we make the name
  // unique and then string off the ".msf" so that we pass the right thing
  // into Open().  this isn't ideal, since this is not atomic
  // but it will make do.
  nsresult rv;
  nsCOMPtr<nsIFile> dbPath = do_CreateInstance(NS_LOCAL_FILE_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  dbPath->InitWithFile(path);
  proposedDBName.AppendLiteral(SUMMARY_SUFFIX);
  dbPath->Append(proposedDBName);
  bool exists;
  dbPath->Exists(&exists);
  if (exists) {
    rv = dbPath->CreateUnique(nsIFile::NORMAL_FILE_TYPE, 00600);
    NS_ENSURE_SUCCESS(rv, rv);
    dbPath->GetLeafName(proposedDBName);
  }
  // now, take the ".msf" off
  proposedDBName.SetLength(proposedDBName.Length() - SUMMARY_SUFFIX_LENGTH);
  dbPath->SetLeafName(proposedDBName);

  dbPath.forget(dbFile);
  return NS_OK;
}

NS_IMETHODIMP
nsMsgDBFolder::GetMsgDatabase(nsIMsgDatabase** aMsgDatabase) {
  NS_ENSURE_ARG_POINTER(aMsgDatabase);
  GetDatabase();
  if (!mDatabase) return NS_ERROR_FAILURE;
  NS_ADDREF(*aMsgDatabase = mDatabase);
  mDatabase->SetLastUseTime(PR_Now());
  return NS_OK;
}

NS_IMETHODIMP
nsMsgDBFolder::SetMsgDatabase(nsIMsgDatabase* aMsgDatabase) {
  if (mDatabase) {
    // commit here - db might go away when all these refs are released.
    mDatabase->Commit(nsMsgDBCommitType::kLargeCommit);
    mDatabase->RemoveListener(this);
    mDatabase->ClearCachedHdrs();
    if (!aMsgDatabase) {
      mDatabase->GetNewList(m_newMsgs);
    }
  }
  mDatabase = aMsgDatabase;

  if (aMsgDatabase) aMsgDatabase->AddListener(this);
  return NS_OK;
}

NS_IMETHODIMP
nsMsgDBFolder::GetDatabaseOpen(bool* aOpen) {
  NS_ENSURE_ARG_POINTER(aOpen);

  *aOpen = (mDatabase != nullptr);
  return NS_OK;
}

NS_IMETHODIMP
nsMsgDBFolder::GetBackupMsgDatabase(nsIMsgDatabase** aMsgDatabase) {
  NS_ENSURE_ARG_POINTER(aMsgDatabase);
  nsresult rv = OpenBackupMsgDatabase();
  if (NS_FAILED(rv)) {
    NS_WARNING(nsPrintfCString(
                   "(debug) OpenBackupMsgDatabase(); returns error=0x%" PRIx32
                   "\n",
                   static_cast<uint32_t>(rv))
                   .get());
  }
  NS_ENSURE_SUCCESS(rv, rv);
  if (!mBackupDatabase) return NS_ERROR_FAILURE;

  NS_ADDREF(*aMsgDatabase = mBackupDatabase);
  return NS_OK;
}

NS_IMETHODIMP
nsMsgDBFolder::GetDBFolderInfoAndDB(nsIDBFolderInfo** folderInfo,
                                    nsIMsgDatabase** database) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
nsMsgDBFolder::OnReadChanged(nsIDBChangeListener* aInstigator) {
  /* do nothing.  if you care about this, override it.  see nsNewsFolder.cpp */
  return NS_OK;
}

NS_IMETHODIMP
nsMsgDBFolder::OnJunkScoreChanged(nsIDBChangeListener* aInstigator) {
  NotifyFolderEvent(kJunkStatusChanged);
  return NS_OK;
}

NS_IMETHODIMP
nsMsgDBFolder::OnHdrPropertyChanged(nsIMsgDBHdr* aHdrToChange,
                                    const nsACString& property, bool aPreChange,
                                    uint32_t* aStatus,
                                    nsIDBChangeListener* aInstigator) {
  /* do nothing.  if you care about this, override it.*/
  return NS_OK;
}

// 1.  When the status of a message changes.
NS_IMETHODIMP nsMsgDBFolder::OnHdrFlagsChanged(
    nsIMsgDBHdr* aHdrChanged, uint32_t aOldFlags, uint32_t aNewFlags,
    nsIDBChangeListener* aInstigator) {
  if (aHdrChanged) {
    SendFlagNotifications(aHdrChanged, aOldFlags, aNewFlags);
    UpdateSummaryTotals(true);
  }

  // The old state was new message state
  // We check and see if this state has changed
  if (aOldFlags & nsMsgMessageFlags::New) {
    // state changing from new to something else
    if (!(aNewFlags & nsMsgMessageFlags::New))
      CheckWithNewMessagesStatus(false);
  }

  return NS_OK;
}

nsresult nsMsgDBFolder::CheckWithNewMessagesStatus(bool messageAdded) {
  if (messageAdded)
    SetHasNewMessages(true);
  else  // message modified or deleted
  {
    if (mDatabase) {
      bool hasNewMessages;
      nsresult rv = mDatabase->HasNew(&hasNewMessages);
      NS_ENSURE_SUCCESS(rv, rv);
      SetHasNewMessages(hasNewMessages);
      if (hasNewMessages) mDatabase->SortNewKeysIfNeeded();
    }
  }

  return NS_OK;
}

// 3.  When a message gets deleted, we need to see if it was new
//     When we lose a new message we need to check if there are still new
//     messages
NS_IMETHODIMP nsMsgDBFolder::OnHdrDeleted(nsIMsgDBHdr* aHdrChanged,
                                          nsMsgKey aParentKey, int32_t aFlags,
                                          nsIDBChangeListener* aInstigator) {
  // check to see if a new message is being deleted
  // as in this case, if there is only one new message and it's being deleted
  // the folder newness has to be cleared.
  CheckWithNewMessagesStatus(false);
  // Remove all processing flags.  This is generally a good thing although
  // undo-ing a message back into position will not re-gain the flags.
  nsMsgKey msgKey;
  aHdrChanged->GetMessageKey(&msgKey);
  AndProcessingFlags(msgKey, 0);
  return OnHdrAddedOrDeleted(aHdrChanged, false);
}

// 2.  When a new messages gets added, we need to see if it's new.
NS_IMETHODIMP nsMsgDBFolder::OnHdrAdded(nsIMsgDBHdr* aHdrChanged,
                                        nsMsgKey aParentKey, int32_t aFlags,
                                        nsIDBChangeListener* aInstigator) {
  if (aFlags & nsMsgMessageFlags::New) CheckWithNewMessagesStatus(true);
  return OnHdrAddedOrDeleted(aHdrChanged, true);
}

nsresult nsMsgDBFolder::OnHdrAddedOrDeleted(nsIMsgDBHdr* aHdrChanged,
                                            bool added) {
  if (added)
    NotifyMessageAdded(aHdrChanged);
  else
    NotifyMessageRemoved(aHdrChanged);
  UpdateSummaryTotals(true);
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::OnParentChanged(nsMsgKey aKeyChanged,
                                             nsMsgKey oldParent,
                                             nsMsgKey newParent,
                                             nsIDBChangeListener* aInstigator) {
  nsresult rv = GetDatabase();
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIMsgDBHdr> hdrChanged;
  mDatabase->GetMsgHdrForKey(aKeyChanged, getter_AddRefs(hdrChanged));
  // In reality we probably want to just change the parent because otherwise we
  // will lose things like selection.
  if (hdrChanged) {
    // First delete the child from the old threadParent
    OnHdrAddedOrDeleted(hdrChanged, false);
    // Then add it to the new threadParent
    OnHdrAddedOrDeleted(hdrChanged, true);
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::OnAnnouncerGoingAway(
    nsIDBChangeAnnouncer* instigator) {
  if (mBackupDatabase && instigator == mBackupDatabase) {
    mBackupDatabase->RemoveListener(this);
    mBackupDatabase = nullptr;
  } else if (mDatabase) {
    mDatabase->RemoveListener(this);
    mDatabase = nullptr;
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::OnEvent(nsIMsgDatabase* aDB, const char* aEvent) {
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::GetManyHeadersToDownload(bool* retval) {
  NS_ENSURE_ARG_POINTER(retval);
  int32_t numTotalMessages;

  // is there any reason to return false?
  if (!mDatabase)
    *retval = true;
  else if (NS_SUCCEEDED(GetTotalMessages(false, &numTotalMessages)) &&
           numTotalMessages <= 0)
    *retval = true;
  else
    *retval = false;
  return NS_OK;
}

nsresult nsMsgDBFolder::MsgFitsDownloadCriteria(nsMsgKey msgKey, bool* result) {
  if (!mDatabase) return NS_ERROR_FAILURE;

  nsresult rv;
  nsCOMPtr<nsIMsgDBHdr> hdr;
  rv = mDatabase->GetMsgHdrForKey(msgKey, getter_AddRefs(hdr));
  if (NS_FAILED(rv)) return rv;

  if (hdr) {
    uint32_t msgFlags = 0;
    hdr->GetFlags(&msgFlags);
    // check if we already have this message body offline
    if (!(msgFlags & nsMsgMessageFlags::Offline)) {
      *result = true;
      // check against the server download size limit .
      nsCOMPtr<nsIMsgIncomingServer> incomingServer;
      rv = GetServer(getter_AddRefs(incomingServer));
      if (NS_SUCCEEDED(rv) && incomingServer) {
        bool limitDownloadSize = false;
        rv = incomingServer->GetLimitOfflineMessageSize(&limitDownloadSize);
        NS_ENSURE_SUCCESS(rv, rv);
        if (limitDownloadSize) {
          int32_t maxDownloadMsgSize = 0;
          uint32_t msgSize;
          hdr->GetMessageSize(&msgSize);
          rv = incomingServer->GetMaxMessageSize(&maxDownloadMsgSize);
          NS_ENSURE_SUCCESS(rv, rv);
          maxDownloadMsgSize *= 1024;
          if (msgSize > (uint32_t)maxDownloadMsgSize) *result = false;
        }
      }
    }
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::GetSupportsOffline(bool* aSupportsOffline) {
  NS_ENSURE_ARG_POINTER(aSupportsOffline);
  if (mFlags & nsMsgFolderFlags::Virtual) {
    *aSupportsOffline = false;
    return NS_OK;
  }

  nsCOMPtr<nsIMsgIncomingServer> server;
  nsresult rv = GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);
  if (!server) return NS_ERROR_FAILURE;

  int32_t offlineSupportLevel;
  rv = server->GetOfflineSupportLevel(&offlineSupportLevel);
  NS_ENSURE_SUCCESS(rv, rv);

  *aSupportsOffline = (offlineSupportLevel >= OFFLINE_SUPPORT_LEVEL_REGULAR);
  return NS_OK;
}

// Note: this probably always returns false for local folders!
// Looks like it's only ever used for IMAP folders.
NS_IMETHODIMP nsMsgDBFolder::ShouldStoreMsgOffline(nsMsgKey msgKey,
                                                   bool* result) {
  NS_ENSURE_ARG(result);
  uint32_t flags = 0;
  *result = false;
  GetFlags(&flags);
  return flags & nsMsgFolderFlags::Offline
             ? MsgFitsDownloadCriteria(msgKey, result)
             : NS_OK;
}

// Looks like this implementation is only ever used for IMAP folders.
NS_IMETHODIMP nsMsgDBFolder::HasMsgOffline(nsMsgKey msgKey, bool* result) {
  NS_ENSURE_ARG(result);
  *result = false;
  GetDatabase();
  if (!mDatabase) return NS_ERROR_FAILURE;

  nsresult rv;
  nsCOMPtr<nsIMsgDBHdr> hdr;
  rv = mDatabase->GetMsgHdrForKey(msgKey, getter_AddRefs(hdr));
  if (NS_FAILED(rv)) return rv;

  if (hdr) {
    uint32_t msgFlags = 0;
    hdr->GetFlags(&msgFlags);
    // check if we already have this message body offline
    if ((msgFlags & nsMsgMessageFlags::Offline)) *result = true;
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::GetFlags(uint32_t* _retval) {
  ReadDBFolderInfo(false);
  *_retval = mFlags;
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::ReadFromFolderCacheElem(
    nsIMsgFolderCacheElement* element) {
  nsresult rv = NS_OK;

  element->GetCachedUInt32("flags", &mFlags);
  element->GetCachedInt32("totalMsgs", &mNumTotalMessages);
  element->GetCachedInt32("totalUnreadMsgs", &mNumUnreadMessages);
  element->GetCachedInt32("pendingUnreadMsgs", &mNumPendingUnreadMessages);
  element->GetCachedInt32("pendingMsgs", &mNumPendingTotalMessages);
  element->GetCachedInt64("expungedBytes", &mExpungedBytes);
  element->GetCachedInt64("folderSize", &mFolderSize);

  return rv;
}

nsresult nsMsgDBFolder::GetFolderCacheKey(nsIFile** aFile) {
  nsresult rv;
  bool isServer = false;
  GetIsServer(&isServer);

  // if it's a server, we don't need the .msf appended to the name
  nsCOMPtr<nsIFile> dbPath;
  if (isServer) {
    rv = GetFilePath(getter_AddRefs(dbPath));
  } else {
    rv = GetSummaryFile(getter_AddRefs(dbPath));
  }
  NS_ENSURE_SUCCESS(rv, rv);
  dbPath.forget(aFile);
  return NS_OK;
}

nsresult nsMsgDBFolder::FlushToFolderCache() {
  nsresult rv;
  nsCOMPtr<nsIMsgAccountManager> accountManager =
      do_GetService("@mozilla.org/messenger/account-manager;1", &rv);
  if (NS_SUCCEEDED(rv) && accountManager) {
    nsCOMPtr<nsIMsgFolderCache> folderCache;
    rv = accountManager->GetFolderCache(getter_AddRefs(folderCache));
    if (NS_SUCCEEDED(rv) && folderCache)
      rv = WriteToFolderCache(folderCache, false);
  }
  return rv;
}

NS_IMETHODIMP nsMsgDBFolder::WriteToFolderCache(nsIMsgFolderCache* folderCache,
                                                bool deep) {
  nsresult rv = NS_OK;

  if (folderCache) {
    nsCOMPtr<nsIMsgFolderCacheElement> cacheElement;
    nsCOMPtr<nsIFile> dbPath;
    rv = GetFolderCacheKey(getter_AddRefs(dbPath));
    if (NS_SUCCEEDED(rv) && dbPath) {
      nsCString persistentPath;
      rv = dbPath->GetPersistentDescriptor(persistentPath);
      NS_ENSURE_SUCCESS(rv, rv);
      rv = folderCache->GetCacheElement(persistentPath, true,
                                        getter_AddRefs(cacheElement));
      if (NS_SUCCEEDED(rv) && cacheElement)
        rv = WriteToFolderCacheElem(cacheElement);
    }

    if (deep) {
      for (nsIMsgFolder* msgFolder : mSubFolders) {
        rv = msgFolder->WriteToFolderCache(folderCache, true);
        if (NS_FAILED(rv)) break;
      }
    }
  }
  return rv;
}

NS_IMETHODIMP nsMsgDBFolder::WriteToFolderCacheElem(
    nsIMsgFolderCacheElement* element) {
  nsresult rv = NS_OK;

  element->SetCachedUInt32("flags", mFlags);
  element->SetCachedInt32("totalMsgs", mNumTotalMessages);
  element->SetCachedInt32("totalUnreadMsgs", mNumUnreadMessages);
  element->SetCachedInt32("pendingUnreadMsgs", mNumPendingUnreadMessages);
  element->SetCachedInt32("pendingMsgs", mNumPendingTotalMessages);
  element->SetCachedInt64("expungedBytes", mExpungedBytes);
  element->SetCachedInt64("folderSize", mFolderSize);

  return rv;
}

NS_IMETHODIMP
nsMsgDBFolder::AddMessageDispositionState(
    nsIMsgDBHdr* aMessage, nsMsgDispositionState aDispositionFlag) {
  NS_ENSURE_ARG_POINTER(aMessage);

  nsresult rv = GetDatabase();
  NS_ENSURE_SUCCESS(rv, NS_OK);

  nsMsgKey msgKey;
  aMessage->GetMessageKey(&msgKey);

  if (aDispositionFlag == nsIMsgFolder::nsMsgDispositionState_Replied)
    mDatabase->MarkReplied(msgKey, true, nullptr);
  else if (aDispositionFlag == nsIMsgFolder::nsMsgDispositionState_Forwarded)
    mDatabase->MarkForwarded(msgKey, true, nullptr);
  else if (aDispositionFlag == nsIMsgFolder::nsMsgDispositionState_Redirected)
    mDatabase->MarkRedirected(msgKey, true, nullptr);
  return NS_OK;
}

nsresult nsMsgDBFolder::AddMarkAllReadUndoAction(nsIMsgWindow* msgWindow,
                                                 nsMsgKey* thoseMarked,
                                                 uint32_t numMarked) {
  NS_ENSURE_ARG_POINTER(msgWindow);

  nsCOMPtr<nsITransactionManager> txnMgr;
  msgWindow->GetTransactionManager(getter_AddRefs(txnMgr));
  if (!txnMgr) {
    return NS_ERROR_NOT_INITIALIZED;
  }

  RefPtr<nsMsgReadStateTxn> readStateTxn = new nsMsgReadStateTxn();
  nsresult rv = readStateTxn->Init(this, numMarked, thoseMarked);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = readStateTxn->SetTransactionType(nsIMessenger::eMarkAllMsg);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = txnMgr->DoTransaction(readStateTxn);
  NS_ENSURE_SUCCESS(rv, rv);
  return rv;
}

NS_IMETHODIMP
nsMsgDBFolder::MarkAllMessagesRead(nsIMsgWindow* aMsgWindow) {
  nsresult rv = GetDatabase();
  m_newMsgs.Clear();

  if (NS_SUCCEEDED(rv)) {
    EnableNotifications(allMessageCountNotifications, false);
    nsTArray<nsMsgKey> thoseMarked;
    rv = mDatabase->MarkAllRead(thoseMarked);
    EnableNotifications(allMessageCountNotifications, true);
    NS_ENSURE_SUCCESS(rv, rv);

    // Setup a undo-state
    if (aMsgWindow && thoseMarked.Length() > 0)
      rv = AddMarkAllReadUndoAction(aMsgWindow, thoseMarked.Elements(),
                                    thoseMarked.Length());
  }

  SetHasNewMessages(false);
  return rv;
}

NS_IMETHODIMP nsMsgDBFolder::MarkThreadRead(nsIMsgThread* thread) {
  nsresult rv = GetDatabase();
  NS_ENSURE_SUCCESS(rv, rv);
  nsTArray<nsMsgKey> keys;
  return mDatabase->MarkThreadRead(thread, nullptr, keys);
}

NS_IMETHODIMP
nsMsgDBFolder::OnStartRunningUrl(nsIURI* aUrl) { return NS_OK; }

NS_IMETHODIMP
nsMsgDBFolder::OnStopRunningUrl(nsIURI* aUrl, nsresult aExitCode) {
  NS_ENSURE_ARG_POINTER(aUrl);
  nsCOMPtr<nsIMsgMailNewsUrl> mailUrl = do_QueryInterface(aUrl);
  if (mailUrl) {
    bool updatingFolder = false;
    if (NS_SUCCEEDED(mailUrl->GetUpdatingFolder(&updatingFolder)) &&
        updatingFolder)
      NotifyFolderEvent(kFolderLoaded);

    // be sure to remove ourselves as a url listener
    mailUrl->UnRegisterListener(this);
  }
  return NS_OK;
}

NS_IMETHODIMP
nsMsgDBFolder::GetRetentionSettings(nsIMsgRetentionSettings** settings) {
  NS_ENSURE_ARG_POINTER(settings);
  *settings = nullptr;
  nsresult rv = NS_OK;
  bool useServerDefaults = false;
  if (!m_retentionSettings) {
    nsCString useServerRetention;
    GetStringProperty(kUseServerRetentionProp, useServerRetention);
    if (useServerRetention.EqualsLiteral("1")) {
      nsCOMPtr<nsIMsgIncomingServer> incomingServer;
      rv = GetServer(getter_AddRefs(incomingServer));
      if (NS_SUCCEEDED(rv) && incomingServer) {
        rv = incomingServer->GetRetentionSettings(settings);
        useServerDefaults = true;
      }
    } else {
      GetDatabase();
      if (mDatabase) {
        // get the settings from the db - if the settings from the db say the
        // folder is not overriding the incoming server settings, get the
        // settings from the server.
        rv = mDatabase->GetMsgRetentionSettings(settings);
        if (NS_SUCCEEDED(rv) && *settings) {
          (*settings)->GetUseServerDefaults(&useServerDefaults);
          if (useServerDefaults) {
            nsCOMPtr<nsIMsgIncomingServer> incomingServer;
            rv = GetServer(getter_AddRefs(incomingServer));
            NS_IF_RELEASE(*settings);
            if (NS_SUCCEEDED(rv) && incomingServer)
              incomingServer->GetRetentionSettings(settings);
          }
          if (useServerRetention.EqualsLiteral("1") != useServerDefaults) {
            if (useServerDefaults)
              useServerRetention.Assign('1');
            else
              useServerRetention.Assign('0');
            SetStringProperty(kUseServerRetentionProp, useServerRetention);
          }
        }
      } else
        return NS_ERROR_FAILURE;
    }
    // Only cache the retention settings if we've overridden the server
    // settings (otherwise, we won't notice changes to the server settings).
    if (!useServerDefaults) m_retentionSettings = *settings;
  } else
    NS_IF_ADDREF(*settings = m_retentionSettings);

  return rv;
}

NS_IMETHODIMP nsMsgDBFolder::SetRetentionSettings(
    nsIMsgRetentionSettings* settings) {
  bool useServerDefaults;
  nsCString useServerRetention;

  settings->GetUseServerDefaults(&useServerDefaults);
  if (useServerDefaults) {
    useServerRetention.Assign('1');
    m_retentionSettings = nullptr;
  } else {
    useServerRetention.Assign('0');
    m_retentionSettings = settings;
  }
  SetStringProperty(kUseServerRetentionProp, useServerRetention);
  GetDatabase();
  if (mDatabase) mDatabase->SetMsgRetentionSettings(settings);
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::GetDownloadSettings(
    nsIMsgDownloadSettings** settings) {
  NS_ENSURE_ARG_POINTER(settings);
  nsresult rv = NS_OK;
  if (!m_downloadSettings) {
    GetDatabase();
    if (mDatabase) {
      // get the settings from the db - if the settings from the db say the
      // folder is not overriding the incoming server settings, get the settings
      // from the server.
      rv =
          mDatabase->GetMsgDownloadSettings(getter_AddRefs(m_downloadSettings));
      if (NS_SUCCEEDED(rv) && m_downloadSettings) {
        bool useServerDefaults;
        m_downloadSettings->GetUseServerDefaults(&useServerDefaults);
        if (useServerDefaults) {
          nsCOMPtr<nsIMsgIncomingServer> incomingServer;
          rv = GetServer(getter_AddRefs(incomingServer));
          if (NS_SUCCEEDED(rv) && incomingServer)
            incomingServer->GetDownloadSettings(
                getter_AddRefs(m_downloadSettings));
        }
      }
    }
  }
  NS_IF_ADDREF(*settings = m_downloadSettings);
  return rv;
}

NS_IMETHODIMP nsMsgDBFolder::SetDownloadSettings(
    nsIMsgDownloadSettings* settings) {
  m_downloadSettings = settings;
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::IsCommandEnabled(const nsACString& command,
                                              bool* result) {
  NS_ENSURE_ARG_POINTER(result);
  *result = true;
  return NS_OK;
}

nsresult nsMsgDBFolder::StartNewOfflineMessage() {
  MOZ_ASSERT(m_offlineHeader);  // Caller must have set m_offlineHeader.
  bool isLocked;
  GetLocked(&isLocked);
  bool hasSemaphore = false;
  if (isLocked) {
    // It's OK if we, the folder, have the semaphore.
    TestSemaphore(static_cast<nsIMsgFolder*>(this), &hasSemaphore);
    if (!hasSemaphore) {
      NS_WARNING("folder locked trying to download offline");
      return NS_MSG_FOLDER_BUSY;
    }
  }

  m_tempMessageStreamBytesWritten = 0;
  m_bytesAddedToLocalMsg = 0;
  m_numOfflineMsgLines = 0;
  nsresult rv = GetOfflineStoreOutputStream(
      m_offlineHeader, getter_AddRefs(m_tempMessageStream));
  if (NS_SUCCEEDED(rv) && !hasSemaphore)
    AcquireSemaphore(static_cast<nsIMsgFolder*>(this));
  NS_ENSURE_SUCCESS(rv, rv);

  // Write out the X-Mozilla-Status headers...
  constexpr auto MozillaStatus = "X-Mozilla-Status: 0001"_ns MSG_LINEBREAK;
  uint32_t writeCount;
  rv = m_tempMessageStream->Write(MozillaStatus.get(), MozillaStatus.Length(),
                                  &writeCount);
  NS_ENSURE_SUCCESS(rv, rv);
  m_tempMessageStreamBytesWritten += writeCount;
  m_bytesAddedToLocalMsg += writeCount;
  constexpr auto MozillaStatus2 =
      "X-Mozilla-Status2: 00000000"_ns MSG_LINEBREAK;
  m_bytesAddedToLocalMsg += MozillaStatus2.Length();
  rv = m_tempMessageStream->Write(MozillaStatus2.get(), MozillaStatus2.Length(),
                                  &writeCount);
  NS_ENSURE_SUCCESS(rv, rv);
  m_tempMessageStreamBytesWritten += writeCount;
  return NS_OK;
}

nsresult nsMsgDBFolder::EndNewOfflineMessage(nsresult status) {
  // Whatever happens, we want to unlock the folder.
  auto guard = mozilla::MakeScopeExit(
      [&] { ReleaseSemaphore(static_cast<nsIMsgFolder*>(this)); });

  nsMsgKey messageKey;

  nsresult rv1, rv2;
  nsresult rv = GetDatabase();
  NS_ENSURE_SUCCESS(rv, rv);

  m_offlineHeader->GetMessageKey(&messageKey);

  nsCOMPtr<nsIMsgPluggableStore> msgStore;
  rv = GetMsgStore(getter_AddRefs(msgStore));
  NS_ENSURE_SUCCESS(rv, rv);

  // Are we being asked to abort and clean up?
  if (NS_FAILED(status)) {
    mDatabase->MarkOffline(messageKey, false, nullptr);
    if (m_tempMessageStream) {
      msgStore->DiscardNewMessage(m_tempMessageStream, m_offlineHeader);
    }
    m_tempMessageStream = nullptr;
    m_offlineHeader = nullptr;
    return NS_OK;
  }

  if (m_tempMessageStream) {
    m_tempMessageStream->Flush();
  }

  // Some sanity checking.
  // This will go away once nsIMsgPluggableStore stops serving up seekable
  // output streams.
  // If quarantining (mailnews.downloadToTempFile == true) is on we'll already
  // have a non-seekable stream.
  nsCOMPtr<nsISeekableStream> seekable;
  if (m_tempMessageStream) seekable = do_QueryInterface(m_tempMessageStream);
  if (seekable) {
    uint64_t messageOffset;
    uint32_t messageSize;
    int64_t curStorePos;
    seekable->Tell(&curStorePos);

    // N.B. This only works if we've set the offline flag for the message,
    // so be careful about moving the call to MarkOffline above.
    m_offlineHeader->GetMessageOffset(&messageOffset);
    curStorePos -= messageOffset;
    m_offlineHeader->GetMessageSize(&messageSize);
    messageSize += m_bytesAddedToLocalMsg;
    // unix/mac has a one byte line ending, but the imap server returns
    // crlf terminated lines.
    if (MSG_LINEBREAK_LEN == 1) messageSize -= m_numOfflineMsgLines;

    // We clear the offline flag on the message if the size
    // looks wrong. Check if we're off by more than one byte per line.
    if (messageSize > (uint32_t)curStorePos &&
        (messageSize - (uint32_t)curStorePos) >
            (uint32_t)m_numOfflineMsgLines) {
      mDatabase->MarkOffline(messageKey, false, nullptr);
      rv1 = rv2 = NS_OK;
      if (msgStore) {
        // DiscardNewMessage closes the stream.
        rv1 = msgStore->DiscardNewMessage(m_tempMessageStream, m_offlineHeader);
        m_tempMessageStream = nullptr;  // avoid accessing closed stream
      } else {
        rv2 = m_tempMessageStream->Close();
        m_tempMessageStream = nullptr;  // ditto
      }
      // XXX We should check for errors of rv1 and rv2.
      if (NS_FAILED(rv1)) NS_WARNING("DiscardNewMessage returned error");
      if (NS_FAILED(rv2))
        NS_WARNING("m_tempMessageStream->Close() returned error");
#ifdef _DEBUG
      nsAutoCString message("Offline message too small: messageSize=");
      message.AppendInt(messageSize);
      message.AppendLiteral(" curStorePos=");
      message.AppendInt(curStorePos);
      message.AppendLiteral(" numOfflineMsgLines=");
      message.AppendInt(m_numOfflineMsgLines);
      message.AppendLiteral(" bytesAdded=");
      message.AppendInt(m_bytesAddedToLocalMsg);
      NS_ERROR(message.get());
#endif
      m_offlineHeader = nullptr;
      return NS_ERROR_FAILURE;
    }
  }  // seekable

  // Success! Finalise the message.
  mDatabase->MarkOffline(messageKey, true, nullptr);
  m_offlineHeader->SetOfflineMessageSize(m_tempMessageStreamBytesWritten);
  m_offlineHeader->SetLineCount(m_numOfflineMsgLines);

  // (But remember, stream might be buffered and closing/flushing could still
  // fail!)

  rv1 = rv2 = NS_OK;
  if (msgStore) {
    rv1 = msgStore->FinishNewMessage(m_tempMessageStream, m_offlineHeader);
    m_tempMessageStream = nullptr;
  }

  // We can not let this happen: I think the code assumes this.
  // That is the if-expression above is always true.
  NS_ASSERTION(msgStore, "msgStore is nullptr");

  // Notify users of the errors for now, just use NS_WARNING.
  if (NS_FAILED(rv1)) NS_WARNING("FinishNewMessage returned error");
  if (NS_FAILED(rv2)) NS_WARNING("m_tempMessageStream->Close() returned error");

  m_tempMessageStream = nullptr;
  m_offlineHeader = nullptr;

  if (NS_FAILED(rv1)) return rv1;
  if (NS_FAILED(rv2)) return rv2;

  return rv;
}

class AutoCompactEvent : public mozilla::Runnable {
 public:
  AutoCompactEvent(nsIMsgWindow* aMsgWindow, nsMsgDBFolder* aFolder)
      : mozilla::Runnable("AutoCompactEvent"),
        mMsgWindow(aMsgWindow),
        mFolder(aFolder) {}

  NS_IMETHOD Run() {
    if (mFolder) mFolder->HandleAutoCompactEvent(mMsgWindow);
    return NS_OK;
  }

 private:
  nsCOMPtr<nsIMsgWindow> mMsgWindow;
  RefPtr<nsMsgDBFolder> mFolder;
};

nsresult nsMsgDBFolder::HandleAutoCompactEvent(nsIMsgWindow* aWindow) {
  nsresult rv;
  nsCOMPtr<nsIMsgAccountManager> accountMgr =
      do_GetService("@mozilla.org/messenger/account-manager;1", &rv);
  if (NS_SUCCEEDED(rv)) {
    nsTArray<RefPtr<nsIMsgIncomingServer>> allServers;
    rv = accountMgr->GetAllServers(allServers);
    NS_ENSURE_SUCCESS(rv, rv);
    uint32_t numServers = allServers.Length();
    if (numServers > 0) {
      nsTArray<RefPtr<nsIMsgFolder>> folderArray;
      nsTArray<RefPtr<nsIMsgFolder>> offlineFolderArray;
      int64_t totalExpungedBytes = 0;
      int64_t offlineExpungedBytes = 0;
      int64_t localExpungedBytes = 0;
      uint32_t serverIndex = 0;
      do {
        nsCOMPtr<nsIMsgIncomingServer> server(allServers[serverIndex]);
        nsCOMPtr<nsIMsgPluggableStore> msgStore;
        rv = server->GetMsgStore(getter_AddRefs(msgStore));
        NS_ENSURE_SUCCESS(rv, rv);
        if (!msgStore) continue;
        bool supportsCompaction;
        msgStore->GetSupportsCompaction(&supportsCompaction);
        if (!supportsCompaction) continue;
        nsCOMPtr<nsIMsgFolder> rootFolder;
        rv = server->GetRootFolder(getter_AddRefs(rootFolder));
        if (NS_SUCCEEDED(rv) && rootFolder) {
          int32_t offlineSupportLevel;
          rv = server->GetOfflineSupportLevel(&offlineSupportLevel);
          NS_ENSURE_SUCCESS(rv, rv);
          nsTArray<RefPtr<nsIMsgFolder>> allDescendants;
          rootFolder->GetDescendants(allDescendants);
          int64_t expungedBytes = 0;
          if (offlineSupportLevel > 0) {
            uint32_t flags;
            for (auto folder : allDescendants) {
              expungedBytes = 0;
              folder->GetFlags(&flags);
              if (flags & nsMsgFolderFlags::Offline)
                folder->GetExpungedBytes(&expungedBytes);
              if (expungedBytes > 0) {
                offlineFolderArray.AppendElement(folder);
                offlineExpungedBytes += expungedBytes;
              }
            }
          } else  // pop or local
          {
            for (auto folder : allDescendants) {
              expungedBytes = 0;
              folder->GetExpungedBytes(&expungedBytes);
              if (expungedBytes > 0) {
                folderArray.AppendElement(folder);
                localExpungedBytes += expungedBytes;
              }
            }
          }
        }
      } while (++serverIndex < numServers);
      totalExpungedBytes = localExpungedBytes + offlineExpungedBytes;
      int32_t purgeThreshold;
      rv = GetPurgeThreshold(&purgeThreshold);
      NS_ENSURE_SUCCESS(rv, rv);
      if (totalExpungedBytes > ((int64_t)purgeThreshold * 1024)) {
        bool okToCompact = false;
        nsCOMPtr<nsIPrefService> pref =
            do_GetService(NS_PREFSERVICE_CONTRACTID);
        nsCOMPtr<nsIPrefBranch> branch;
        pref->GetBranch("", getter_AddRefs(branch));

        bool askBeforePurge;
        branch->GetBoolPref(PREF_MAIL_PURGE_ASK, &askBeforePurge);
        if (askBeforePurge && aWindow) {
          nsCOMPtr<nsIStringBundle> bundle;
          rv = GetBaseStringBundle(getter_AddRefs(bundle));
          NS_ENSURE_SUCCESS(rv, rv);

          nsAutoString compactSize;
          FormatFileSize(totalExpungedBytes, true, compactSize);

          bool neverAsk = false;  // "Do not ask..." - unchecked by default.
          int32_t buttonPressed = 0;

          nsCOMPtr<nsIWindowWatcher> ww(
              do_GetService(NS_WINDOWWATCHER_CONTRACTID));
          nsCOMPtr<nsIWritablePropertyBag2> props(
              do_CreateInstance("@mozilla.org/hash-property-bag;1"));
          props->SetPropertyAsAString(u"compactSize"_ns, compactSize);
          nsCOMPtr<mozIDOMWindowProxy> migrateWizard;
          rv = ww->OpenWindow(
              nullptr,
              "chrome://messenger/content/compactFoldersDialog.xhtml"_ns,
              "_blank"_ns, "chrome,dialog,modal,centerscreen"_ns, props,
              getter_AddRefs(migrateWizard));
          NS_ENSURE_SUCCESS(rv, rv);

          rv = props->GetPropertyAsBool(u"checked"_ns, &neverAsk);
          NS_ENSURE_SUCCESS(rv, rv);

          rv =
              props->GetPropertyAsInt32(u"buttonNumClicked"_ns, &buttonPressed);
          NS_ENSURE_SUCCESS(rv, rv);

          if (buttonPressed == 0) {
            okToCompact = true;
            if (neverAsk)  // [X] Remove deletions automatically and do not ask
              branch->SetBoolPref(PREF_MAIL_PURGE_ASK, false);
          }
        } else
          okToCompact = aWindow || !askBeforePurge;

        if (okToCompact) {
          NotifyFolderEvent(kAboutToCompact);

          if (localExpungedBytes > 0 || offlineExpungedBytes > 0) {
            for (nsIMsgFolder* f : offlineFolderArray) {
              folderArray.AppendElement(f);
            }
            rv = AsyncCompactFolders(folderArray, nullptr, aWindow);
          }
        }
      }
    }
  }
  return rv;
}

nsresult nsMsgDBFolder::AutoCompact(nsIMsgWindow* aWindow) {
  // we don't check for null aWindow, because this routine can get called
  // in unit tests where we have no window. Just assume not OK if no window.
  bool prompt;
  nsresult rv = GetPromptPurgeThreshold(&prompt);
  NS_ENSURE_SUCCESS(rv, rv);
  PRTime timeNow = PR_Now();  // time in microseconds
  PRTime timeAfterOneHourOfLastPurgeCheck = gtimeOfLastPurgeCheck + oneHour;
  if (timeAfterOneHourOfLastPurgeCheck < timeNow && prompt) {
    gtimeOfLastPurgeCheck = timeNow;
    nsCOMPtr<nsIRunnable> event = new AutoCompactEvent(aWindow, this);
    // Post this as an event because it can put up an alert, which
    // might cause issues depending on the stack when we are called.
    if (event) NS_DispatchToCurrentThread(event);
  }
  return rv;
}

nsresult nsMsgDBFolder::GetPromptPurgeThreshold(bool* aPrompt) {
  NS_ENSURE_ARG(aPrompt);
  nsresult rv;
  nsCOMPtr<nsIPrefBranch> prefBranch =
      do_GetService(NS_PREFSERVICE_CONTRACTID, &rv);
  if (NS_SUCCEEDED(rv) && prefBranch) {
    rv = prefBranch->GetBoolPref(PREF_MAIL_PROMPT_PURGE_THRESHOLD, aPrompt);
    if (NS_FAILED(rv)) {
      *aPrompt = false;
      rv = NS_OK;
    }
  }
  return rv;
}

nsresult nsMsgDBFolder::GetPurgeThreshold(int32_t* aThreshold) {
  NS_ENSURE_ARG(aThreshold);
  nsresult rv;
  nsCOMPtr<nsIPrefBranch> prefBranch =
      do_GetService(NS_PREFSERVICE_CONTRACTID, &rv);
  if (NS_SUCCEEDED(rv) && prefBranch) {
    int32_t thresholdMB = 200;
    bool thresholdMigrated = false;
    prefBranch->GetIntPref(PREF_MAIL_PURGE_THRESHOLD_MB, &thresholdMB);
    prefBranch->GetBoolPref(PREF_MAIL_PURGE_MIGRATED, &thresholdMigrated);
    if (!thresholdMigrated) {
      *aThreshold = 20480;
      (void)prefBranch->GetIntPref(PREF_MAIL_PURGE_THRESHOLD, aThreshold);
      if (*aThreshold / 1024 != thresholdMB) {
        thresholdMB = std::max(1, *aThreshold / 1024);
        prefBranch->SetIntPref(PREF_MAIL_PURGE_THRESHOLD_MB, thresholdMB);
      }
      prefBranch->SetBoolPref(PREF_MAIL_PURGE_MIGRATED, true);
    }
    *aThreshold = thresholdMB * 1024;
  }
  return rv;
}

NS_IMETHODIMP  // called on the folder that is renamed or about to be deleted
nsMsgDBFolder::MatchOrChangeFilterDestination(nsIMsgFolder* newFolder,
                                              bool caseInsensitive,
                                              bool* found) {
  NS_ENSURE_ARG_POINTER(found);
  *found = false;
  nsCString oldUri;
  nsresult rv = GetURI(oldUri);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString newUri;
  if (newFolder)  // for matching uri's this will be null
  {
    rv = newFolder->GetURI(newUri);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  nsCOMPtr<nsIMsgFilterList> filterList;
  nsCOMPtr<nsIMsgAccountManager> accountMgr =
      do_GetService("@mozilla.org/messenger/account-manager;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsTArray<RefPtr<nsIMsgIncomingServer>> allServers;
  rv = accountMgr->GetAllServers(allServers);
  NS_ENSURE_SUCCESS(rv, rv);

  for (auto server : allServers) {
    if (server) {
      bool canHaveFilters;
      rv = server->GetCanHaveFilters(&canHaveFilters);
      if (NS_SUCCEEDED(rv) && canHaveFilters) {
        // update the filterlist to match the new folder name
        rv = server->GetFilterList(nullptr, getter_AddRefs(filterList));
        if (NS_SUCCEEDED(rv) && filterList) {
          bool match;
          rv = filterList->MatchOrChangeFilterTarget(oldUri, newUri,
                                                     caseInsensitive, &match);
          if (NS_SUCCEEDED(rv) && match) {
            *found = true;
            if (newFolder && !newUri.IsEmpty())
              rv = filterList->SaveToDefaultFile();
          }
        }
        // update the editable filterlist to match the new folder name
        rv = server->GetEditableFilterList(nullptr, getter_AddRefs(filterList));
        if (NS_SUCCEEDED(rv) && filterList) {
          bool match;
          rv = filterList->MatchOrChangeFilterTarget(oldUri, newUri,
                                                     caseInsensitive, &match);
          if (NS_SUCCEEDED(rv) && match) {
            *found = true;
            if (newFolder && !newUri.IsEmpty())
              rv = filterList->SaveToDefaultFile();
          }
        }
      }
    }
  }
  return rv;
}

NS_IMETHODIMP
nsMsgDBFolder::GetDBTransferInfo(nsIPropertyBag2** aTransferInfo) {
  nsCOMPtr<nsIDBFolderInfo> dbFolderInfo;
  nsCOMPtr<nsIMsgDatabase> db;
  GetDBFolderInfoAndDB(getter_AddRefs(dbFolderInfo), getter_AddRefs(db));
  NS_ENSURE_STATE(dbFolderInfo);
  return dbFolderInfo->GetTransferInfo(aTransferInfo);
}

NS_IMETHODIMP
nsMsgDBFolder::SetDBTransferInfo(nsIPropertyBag2* aTransferInfo) {
  NS_ENSURE_ARG(aTransferInfo);
  nsCOMPtr<nsIDBFolderInfo> dbFolderInfo;
  nsCOMPtr<nsIMsgDatabase> db;
  GetMsgDatabase(getter_AddRefs(db));
  if (db) {
    db->GetDBFolderInfo(getter_AddRefs(dbFolderInfo));
    if (dbFolderInfo) {
      dbFolderInfo->InitFromTransferInfo(aTransferInfo);
      dbFolderInfo->SetBooleanProperty("forceReparse", false);
    }
    db->SetSummaryValid(true);
  }
  return NS_OK;
}

NS_IMETHODIMP
nsMsgDBFolder::GetStringProperty(const char* propertyName,
                                 nsACString& propertyValue) {
  NS_ENSURE_ARG_POINTER(propertyName);
  nsCOMPtr<nsIFile> dbPath;
  nsresult rv = GetFolderCacheKey(getter_AddRefs(dbPath));
  if (dbPath) {
    nsCOMPtr<nsIMsgFolderCacheElement> cacheElement;
    rv = GetFolderCacheElemFromFile(dbPath, getter_AddRefs(cacheElement));
    if (cacheElement)  // try to get from cache
      rv = cacheElement->GetCachedString(propertyName, propertyValue);
    if (NS_FAILED(rv))  // if failed, then try to get from db, usually.
    {
      if (strcmp(propertyName, MRU_TIME_PROPERTY) == 0 ||
          strcmp(propertyName, MRM_TIME_PROPERTY) == 0 ||
          strcmp(propertyName, "LastPurgeTime") == 0) {
        // Don't open DB for missing time properties.
        // Missing time properties can happen if the folder was never
        // accessed, for exaple after an import. They happen if
        // folderCache.json is removed or becomes invalid after moving
        // a profile (see bug 1726660).
        propertyValue.Truncate();
        return NS_OK;
      }
      nsCOMPtr<nsIDBFolderInfo> folderInfo;
      nsCOMPtr<nsIMsgDatabase> db;
      bool exists;
      rv = dbPath->Exists(&exists);
      if (NS_FAILED(rv) || !exists) return NS_MSG_ERROR_FOLDER_MISSING;
      bool weOpenedDB = !mDatabase;
      rv = GetDBFolderInfoAndDB(getter_AddRefs(folderInfo), getter_AddRefs(db));
      if (NS_SUCCEEDED(rv))
        rv = folderInfo->GetCharProperty(propertyName, propertyValue);
      if (weOpenedDB) CloseDBIfFolderNotOpen(false);
      if (NS_SUCCEEDED(rv)) {
        // Now that we have the value, store it in our cache.
        if (cacheElement) {
          cacheElement->SetCachedString(propertyName, propertyValue);
        }
      }
    }
  }
  return rv;
}

NS_IMETHODIMP
nsMsgDBFolder::SetStringProperty(const char* propertyName,
                                 const nsACString& propertyValue) {
  NS_ENSURE_ARG_POINTER(propertyName);
  nsCOMPtr<nsIFile> dbPath;
  GetFolderCacheKey(getter_AddRefs(dbPath));
  if (dbPath) {
    nsCOMPtr<nsIMsgFolderCacheElement> cacheElement;
    GetFolderCacheElemFromFile(dbPath, getter_AddRefs(cacheElement));
    if (cacheElement)  // try to set in the cache
      cacheElement->SetCachedString(propertyName, propertyValue);
  }
  nsCOMPtr<nsIDBFolderInfo> folderInfo;
  nsCOMPtr<nsIMsgDatabase> db;
  nsresult rv =
      GetDBFolderInfoAndDB(getter_AddRefs(folderInfo), getter_AddRefs(db));
  if (NS_SUCCEEDED(rv)) {
    folderInfo->SetCharProperty(propertyName, propertyValue);
    db->Commit(nsMsgDBCommitType::kLargeCommit);  // committing the db also
                                                  // commits the cache
  }
  return NS_OK;
}

NS_IMETHODIMP
nsMsgDBFolder::GetInheritedStringProperty(const char* aPropertyName,
                                          nsACString& aPropertyValue) {
  NS_ENSURE_ARG_POINTER(aPropertyName);
  nsCString value;

  nsCOMPtr<nsIMsgIncomingServer> server;
  if (mIsServer) {
    GetServer(getter_AddRefs(server));
  }

  // servers will automatically inherit from the preference
  // mail.server.default.(propertyName)
  if (server) {
    return server->GetCharValue(aPropertyName, aPropertyValue);
  }

  GetStringProperty(aPropertyName, value);
  if (value.IsEmpty()) {
    // inherit from the parent
    nsCOMPtr<nsIMsgFolder> parent;
    GetParent(getter_AddRefs(parent));
    if (parent) {
      return parent->GetInheritedStringProperty(aPropertyName, aPropertyValue);
    }
  }

  aPropertyValue.Assign(value);
  return NS_OK;
}

NS_IMETHODIMP
nsMsgDBFolder::OnMessageClassified(const nsACString& aMsgURI,
                                   nsMsgJunkStatus aClassification,
                                   uint32_t aJunkPercent) {
  nsresult rv = GetDatabase();
  NS_ENSURE_SUCCESS(rv, NS_OK);

  if (aMsgURI.IsEmpty())  // This signifies end of batch.
  {
    // Apply filters if needed.
    if (!mPostBayesMessagesToFilter.IsEmpty()) {
      // Apply post-bayes filtering.
      nsCOMPtr<nsIMsgFilterService> filterService(
          do_GetService("@mozilla.org/messenger/services/filters;1", &rv));
      if (NS_SUCCEEDED(rv))
        // We use a null nsIMsgWindow because we don't want some sort of ui
        // appearing in the middle of automatic filtering (plus I really don't
        // want to propagate that value.)
        rv = filterService->ApplyFilters(nsMsgFilterType::PostPlugin,
                                         mPostBayesMessagesToFilter, this,
                                         nullptr, nullptr);
      mPostBayesMessagesToFilter.Clear();
    }

    // If we classified any messages, send out a notification.
    nsTArray<RefPtr<nsIMsgDBHdr>> hdrs;
    rv = MsgGetHeadersFromKeys(mDatabase, mClassifiedMsgKeys, hdrs);
    NS_ENSURE_SUCCESS(rv, rv);
    if (!hdrs.IsEmpty()) {
      nsCOMPtr<nsIMsgFolderNotificationService> notifier(do_GetService(
          "@mozilla.org/messenger/msgnotificationservice;1", &rv));
      NS_ENSURE_SUCCESS(rv, rv);
      notifier->NotifyMsgsClassified(hdrs, mBayesJunkClassifying,
                                     mBayesTraitClassifying);
    }
    return rv;
  }

  nsCOMPtr<nsIMsgIncomingServer> server;
  rv = GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsISpamSettings> spamSettings;
  rv = server->GetSpamSettings(getter_AddRefs(spamSettings));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgDBHdr> msgHdr;
  rv = GetMsgDBHdrFromURI(aMsgURI, getter_AddRefs(msgHdr));
  NS_ENSURE_SUCCESS(rv, rv);

  nsMsgKey msgKey;
  rv = msgHdr->GetMessageKey(&msgKey);
  NS_ENSURE_SUCCESS(rv, rv);

  // check if this message needs junk classification
  uint32_t processingFlags;
  GetProcessingFlags(msgKey, &processingFlags);

  if (processingFlags & nsMsgProcessingFlags::ClassifyJunk) {
    mClassifiedMsgKeys.AppendElement(msgKey);
    AndProcessingFlags(msgKey, ~nsMsgProcessingFlags::ClassifyJunk);

    nsAutoCString msgJunkScore;
    msgJunkScore.AppendInt(aClassification == nsIJunkMailPlugin::JUNK
                               ? nsIJunkMailPlugin::IS_SPAM_SCORE
                               : nsIJunkMailPlugin::IS_HAM_SCORE);
    mDatabase->SetStringProperty(msgKey, "junkscore", msgJunkScore);
    mDatabase->SetStringProperty(msgKey, "junkscoreorigin", "plugin"_ns);

    nsAutoCString strPercent;
    strPercent.AppendInt(aJunkPercent);
    mDatabase->SetStringProperty(msgKey, "junkpercent", strPercent);

    if (aClassification == nsIJunkMailPlugin::JUNK) {
      // IMAP has its own way of marking read.
      if (!(mFlags & nsMsgFolderFlags::ImapBox)) {
        bool markAsReadOnSpam;
        (void)spamSettings->GetMarkAsReadOnSpam(&markAsReadOnSpam);
        if (markAsReadOnSpam) {
          rv = mDatabase->MarkRead(msgKey, true, this);
          if (!NS_SUCCEEDED(rv))
            NS_WARNING("failed marking spam message as read");
        }
      }
      // mail folders will log junk hits with move info. Perhaps we should
      // add a log here for non-mail folders as well, that don't override
      // onMessageClassified
      // rv = spamSettings->LogJunkHit(msgHdr, false);
      // NS_ENSURE_SUCCESS(rv,rv);
    }
  }
  return NS_OK;
}

NS_IMETHODIMP
nsMsgDBFolder::OnMessageTraitsClassified(const nsACString& aMsgURI,
                                         const nsTArray<uint32_t>& aTraits,
                                         const nsTArray<uint32_t>& aPercents) {
  if (aMsgURI.IsEmpty())  // This signifies end of batch
    return NS_OK;         // We are not handling batching

  MOZ_ASSERT(aTraits.Length() == aPercents.Length());

  nsresult rv;
  nsCOMPtr<nsIMsgDBHdr> msgHdr;
  rv = GetMsgDBHdrFromURI(aMsgURI, getter_AddRefs(msgHdr));
  NS_ENSURE_SUCCESS(rv, rv);

  nsMsgKey msgKey;
  rv = msgHdr->GetMessageKey(&msgKey);
  NS_ENSURE_SUCCESS(rv, rv);

  uint32_t processingFlags;
  GetProcessingFlags(msgKey, &processingFlags);
  if (!(processingFlags & nsMsgProcessingFlags::ClassifyTraits)) return NS_OK;

  AndProcessingFlags(msgKey, ~nsMsgProcessingFlags::ClassifyTraits);

  nsCOMPtr<nsIMsgTraitService> traitService;
  traitService = do_GetService("@mozilla.org/msg-trait-service;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  for (uint32_t i = 0; i < aTraits.Length(); i++) {
    if (aTraits[i] == nsIJunkMailPlugin::JUNK_TRAIT)
      continue;  // junk is processed by the junk listener
    nsAutoCString traitId;
    rv = traitService->GetId(aTraits[i], traitId);
    traitId.InsertLiteral("bayespercent/", 0);
    nsAutoCString strPercent;
    strPercent.AppendInt(aPercents[i]);
    mDatabase->SetStringPropertyByHdr(msgHdr, traitId.get(), strPercent);
  }
  return NS_OK;
}

/**
 * Call the filter plugins (XXX currently just one)
 */
NS_IMETHODIMP
nsMsgDBFolder::CallFilterPlugins(nsIMsgWindow* aMsgWindow, bool* aFiltersRun) {
  NS_ENSURE_ARG_POINTER(aFiltersRun);

  nsString folderName;
  GetPrettyName(folderName);
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
          ("Running filter plugins on folder '%s'",
           NS_ConvertUTF16toUTF8(folderName).get()));

  *aFiltersRun = false;
  nsCOMPtr<nsIMsgIncomingServer> server;
  nsCOMPtr<nsISpamSettings> spamSettings;
  int32_t spamLevel = 0;

  nsresult rv = GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString serverType;
  server->GetType(serverType);

  rv = server->GetSpamSettings(getter_AddRefs(spamSettings));
  nsCOMPtr<nsIMsgFilterPlugin> filterPlugin;
  server->GetSpamFilterPlugin(getter_AddRefs(filterPlugin));
  if (!filterPlugin)  // it's not an error not to have the filter plugin.
    return NS_OK;
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIJunkMailPlugin> junkMailPlugin = do_QueryInterface(filterPlugin);
  if (!junkMailPlugin)  // we currently only support the junk mail plugin
    return NS_OK;

  // if it's a news folder, then we really don't support junk in the ui
  // yet the legacy spamLevel seems to think we should analyze it.
  // Maybe we should upgrade that, but for now let's not analyze. We'll
  // let an extension set an inherited property if they really want us to
  // analyze this. We need that anyway to allow extension-based overrides.
  // When we finalize adding junk in news to core, we'll deal with the
  // spamLevel issue

  // if this is the junk folder, or the trash folder
  // don't analyze for spam, because we don't care
  //
  // if it's the sent, unsent, templates, or drafts,
  // don't analyze for spam, because the user
  // created that message
  //
  // if it's a public imap folder, or another users
  // imap folder, don't analyze for spam, because
  // it's not ours to analyze
  //

  bool filterForJunk = true;
  if (serverType.EqualsLiteral("rss") ||
      (mFlags &
           (nsMsgFolderFlags::SpecialUse | nsMsgFolderFlags::ImapPublic |
            nsMsgFolderFlags::Newsgroup | nsMsgFolderFlags::ImapOtherUser) &&
       !(mFlags & nsMsgFolderFlags::Inbox)))
    filterForJunk = false;

  spamSettings->GetLevel(&spamLevel);
  if (!spamLevel) filterForJunk = false;

  /*
   * We'll use inherited folder properties for the junk trait to override the
   * standard server-based activation of junk processing. This provides a
   * hook for extensions to customize the application of junk filtering.
   * Set inherited property "dobayes.mailnews@mozilla.org#junk" to "true"
   * to force junk processing, and "false" to skip junk processing.
   */

  nsAutoCString junkEnableOverride;
  GetInheritedStringProperty("dobayes.mailnews@mozilla.org#junk",
                             junkEnableOverride);
  if (junkEnableOverride.EqualsLiteral("true"))
    filterForJunk = true;
  else if (junkEnableOverride.EqualsLiteral("false"))
    filterForJunk = false;

  bool userHasClassified = false;
  // if the user has not classified any messages yet, then we shouldn't bother
  // running the junk mail controls. This creates a better first use experience.
  // See Bug #250084.
  junkMailPlugin->GetUserHasClassified(&userHasClassified);
  if (!userHasClassified) filterForJunk = false;

  MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
          ("Will run Spam filter: %s", filterForJunk ? "true" : "false"));

  nsCOMPtr<nsIMsgDatabase> database(mDatabase);
  rv = GetMsgDatabase(getter_AddRefs(database));
  NS_ENSURE_SUCCESS(rv, rv);

  // check if trait processing needed

  nsCOMPtr<nsIMsgTraitService> traitService(
      do_GetService("@mozilla.org/msg-trait-service;1", &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  nsTArray<uint32_t> proIndices;
  rv = traitService->GetEnabledProIndices(proIndices);
  bool filterForOther = false;
  // We just skip this on failure, since it is rarely used.
  if (NS_SUCCEEDED(rv)) {
    for (uint32_t i = 0; i < proIndices.Length(); ++i) {
      // The trait service determines which traits are globally enabled or
      // disabled. If a trait is enabled, it can still be made inactive
      // on a particular folder using an inherited property. To do that,
      // set "dobayes." + trait proID as an inherited folder property with
      // the string value "false"
      //
      // If any non-junk traits are active on the folder, then the bayes
      // processing will calculate probabilities for all enabled traits.

      if (proIndices[i] != nsIJunkMailPlugin::JUNK_TRAIT) {
        filterForOther = true;
        nsAutoCString traitId;
        nsAutoCString property("dobayes.");
        traitService->GetId(proIndices[i], traitId);
        property.Append(traitId);
        nsAutoCString isEnabledOnFolder;
        GetInheritedStringProperty(property.get(), isEnabledOnFolder);
        if (isEnabledOnFolder.EqualsLiteral("false")) filterForOther = false;
        // We might have to allow a "true" override in the future, but
        // for now there is no way for that to affect the processing
        break;
      }
    }
  }

  // clang-format off
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
          ("Will run Trait classification: %s", filterForOther ? "true" : "false"));
  // clang-format on

  // Do we need to apply message filters?
  bool filterPostPlugin = false;  // Do we have a post-analysis filter?
  nsCOMPtr<nsIMsgFilterList> filterList;
  GetFilterList(aMsgWindow, getter_AddRefs(filterList));
  if (filterList) {
    uint32_t filterCount = 0;
    filterList->GetFilterCount(&filterCount);
    for (uint32_t index = 0; index < filterCount && !filterPostPlugin;
         ++index) {
      nsCOMPtr<nsIMsgFilter> filter;
      filterList->GetFilterAt(index, getter_AddRefs(filter));
      if (!filter) continue;
      nsMsgFilterTypeType filterType;
      filter->GetFilterType(&filterType);
      if (!(filterType & nsMsgFilterType::PostPlugin)) continue;
      bool enabled = false;
      filter->GetEnabled(&enabled);
      if (!enabled) continue;
      filterPostPlugin = true;
    }
  }

  MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
          ("Will run Post-classification filters: %s",
           filterPostPlugin ? "true" : "false"));

  // If there is nothing to do, leave now but let NotifyHdrsNotBeingClassified
  // generate the msgsClassified notification for all newly added messages as
  // tracked by the NotReportedClassified processing flag.
  if (!filterForOther && !filterForJunk && !filterPostPlugin) {
    MOZ_LOG(FILTERLOGMODULE, LogLevel::Info, ("No filters need to be run"));
    NotifyHdrsNotBeingClassified();
    return NS_OK;
  }

  // get the list of new messages
  //
  nsTArray<nsMsgKey> newKeys;
  rv = database->GetNewList(newKeys);
  NS_ENSURE_SUCCESS(rv, rv);

  MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
          ("Running filters on %" PRIu32 " new messages",
           (uint32_t)newKeys.Length()));

  nsTArray<nsMsgKey> newMessageKeys;
  // Start from m_saveNewMsgs (and clear its current state).  m_saveNewMsgs is
  // where we stash the list of new messages when we are told to clear the list
  // of new messages by the UI (which purges the list from the nsMsgDatabase).
  newMessageKeys.SwapElements(m_saveNewMsgs);
  newMessageKeys.AppendElements(newKeys);

  // build up list of keys to classify
  nsTArray<nsMsgKey> classifyMsgKeys;
  nsCString uri;

  uint32_t numNewMessages = newMessageKeys.Length();
  for (uint32_t i = 0; i < numNewMessages; ++i) {
    nsMsgKey msgKey = newMessageKeys[i];
    // clang-format off
    MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
            ("Running filters on message with key %" PRIu32, msgKeyToInt(msgKey)));
    // clang-format on
    nsCOMPtr<nsIMsgDBHdr> msgHdr;
    rv = database->GetMsgHdrForKey(msgKey, getter_AddRefs(msgHdr));
    if (!NS_SUCCEEDED(rv)) continue;
    // per-message junk tests.
    bool filterMessageForJunk = false;
    while (filterForJunk)  // we'll break from this at the end
    {
      MOZ_LOG(FILTERLOGMODULE, LogLevel::Info, ("Spam filter"));
      nsCString junkScore;
      msgHdr->GetStringProperty("junkscore", junkScore);
      if (!junkScore.IsEmpty()) {
        // ignore already scored messages.
        MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
                ("Message already scored previously, skipping"));
        break;
      }

      bool whiteListMessage = false;
      spamSettings->CheckWhiteList(msgHdr, &whiteListMessage);
      if (whiteListMessage) {
        // mark this msg as non-junk, because we whitelisted it.
        nsAutoCString msgJunkScore;
        msgJunkScore.AppendInt(nsIJunkMailPlugin::IS_HAM_SCORE);
        database->SetStringProperty(msgKey, "junkscore", msgJunkScore);
        database->SetStringProperty(msgKey, "junkscoreorigin", "whitelist"_ns);
        MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
                ("Message whitelisted, skipping"));
        break;  // skip this msg since it's in the white list
      }
      filterMessageForJunk = true;

      MOZ_LOG(FILTERLOGMODULE, LogLevel::Info, ("Message is to be classified"));
      OrProcessingFlags(msgKey, nsMsgProcessingFlags::ClassifyJunk);
      // Since we are junk processing, we want to defer the msgsClassified
      // notification until the junk classification has occurred.  The event
      // is sufficiently reliable that we know this will be handled in
      // OnMessageClassified at the end of the batch.  We clear the
      // NotReportedClassified flag since we know the message is in good hands.
      AndProcessingFlags(msgKey, ~nsMsgProcessingFlags::NotReportedClassified);
      break;
    }

    uint32_t processingFlags;
    GetProcessingFlags(msgKey, &processingFlags);

    bool filterMessageForOther = false;
    // trait processing
    if (!(processingFlags & nsMsgProcessingFlags::TraitsDone)) {
      // don't do trait processing on this message again
      OrProcessingFlags(msgKey, nsMsgProcessingFlags::TraitsDone);
      if (filterForOther) {
        filterMessageForOther = true;
        OrProcessingFlags(msgKey, nsMsgProcessingFlags::ClassifyTraits);
      }
    }

    if (filterMessageForJunk || filterMessageForOther)
      classifyMsgKeys.AppendElement(newMessageKeys[i]);

    // Set messages to filter post-bayes.
    // Have we already filtered this message?
    if (!(processingFlags & nsMsgProcessingFlags::FiltersDone)) {
      if (filterPostPlugin) {
        // Don't do filters on this message again.
        // (Only set this if we are actually filtering since this is
        // tantamount to a memory leak.)
        MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
                ("Filters done on this message"));
        OrProcessingFlags(msgKey, nsMsgProcessingFlags::FiltersDone);
        mPostBayesMessagesToFilter.AppendElement(msgHdr);
      }
    }
  }

  NotifyHdrsNotBeingClassified();
  // If there weren't any new messages, just return.
  if (newMessageKeys.IsEmpty()) return NS_OK;

  // If we do not need to do any work, leave.
  // (We needed to get the list of new messages so we could get their headers so
  // we can send notifications about them here.)

  if (!classifyMsgKeys.IsEmpty()) {
    // Remember what classifications are the source of this decision for when
    // we perform the notification in OnMessageClassified at the conclusion of
    // classification.
    mBayesJunkClassifying = filterForJunk;
    mBayesTraitClassifying = filterForOther;

    uint32_t numMessagesToClassify = classifyMsgKeys.Length();
    MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
            ("Running Spam classification on %" PRIu32 " messages",
             numMessagesToClassify));

    nsTArray<nsCString> messageURIs(numMessagesToClassify);
    for (uint32_t msgIndex = 0; msgIndex < numMessagesToClassify; ++msgIndex) {
      nsCString tmpStr;
      rv = GenerateMessageURI(classifyMsgKeys[msgIndex], tmpStr);
      if (NS_SUCCEEDED(rv)) {
        messageURIs.AppendElement(tmpStr);
      } else {
        NS_WARNING(
            "nsMsgDBFolder::CallFilterPlugins(): could not"
            " generate URI for message");
      }
    }
    // filterMsgs
    *aFiltersRun = true;

    // Already got proIndices, but need antiIndices too.
    nsTArray<uint32_t> antiIndices;
    rv = traitService->GetEnabledAntiIndices(antiIndices);
    NS_ENSURE_SUCCESS(rv, rv);

    rv = junkMailPlugin->ClassifyTraitsInMessages(
        messageURIs, proIndices, antiIndices, this, aMsgWindow, this);
  } else if (filterPostPlugin) {
    // Nothing to classify, so need to end batch ourselves. We do this so that
    // post analysis filters will run consistently on a folder, even if
    // disabled junk processing, which could be dynamic through whitelisting,
    // makes the bayes analysis unnecessary.
    OnMessageClassified(EmptyCString(), nsIJunkMailPlugin::UNCLASSIFIED, 0);
  }

  return rv;
}

/**
 * Adds the messages in the NotReportedClassified mProcessing set to the
 * (possibly empty) array of msgHdrsNotBeingClassified, and send the
 * nsIMsgFolderNotificationService notification.
 */
nsresult nsMsgDBFolder::NotifyHdrsNotBeingClassified() {
  if (mProcessingFlag[5].keys) {
    nsTArray<nsMsgKey> keys;
    mProcessingFlag[5].keys->ToMsgKeyArray(keys);
    if (keys.Length()) {
      nsresult rv = GetDatabase();
      NS_ENSURE_SUCCESS(rv, rv);
      nsTArray<RefPtr<nsIMsgDBHdr>> msgHdrsNotBeingClassified;
      rv = MsgGetHeadersFromKeys(mDatabase, keys, msgHdrsNotBeingClassified);
      NS_ENSURE_SUCCESS(rv, rv);

      // Since we know we've handled all the NotReportedClassified messages,
      // we clear the set by deleting and recreating it.
      delete mProcessingFlag[5].keys;
      mProcessingFlag[5].keys = nsMsgKeySetU::Create();
      nsCOMPtr<nsIMsgFolderNotificationService> notifier(
          do_GetService("@mozilla.org/messenger/msgnotificationservice;1"));
      if (notifier)
        notifier->NotifyMsgsClassified(msgHdrsNotBeingClassified,
                                       // no classification is being performed
                                       false, false);
    }
  }
  return NS_OK;
}

NS_IMETHODIMP
nsMsgDBFolder::GetLastMessageLoaded(nsMsgKey* aMsgKey) {
  NS_ENSURE_ARG_POINTER(aMsgKey);
  *aMsgKey = mLastMessageLoaded;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgDBFolder::SetLastMessageLoaded(nsMsgKey aMsgKey) {
  mLastMessageLoaded = aMsgKey;
  return NS_OK;
}

// Returns true if: a) there is no need to prompt or b) the user is already
// logged in or c) the user logged in successfully.
bool nsMsgDBFolder::PromptForMasterPasswordIfNecessary() {
  nsresult rv;
  nsCOMPtr<nsIMsgAccountManager> accountManager =
      do_GetService("@mozilla.org/messenger/account-manager;1", &rv);
  NS_ENSURE_SUCCESS(rv, false);

  bool userNeedsToAuthenticate = false;
  // if we're PasswordProtectLocalCache, then we need to find out if the server
  // is authenticated.
  (void)accountManager->GetUserNeedsToAuthenticate(&userNeedsToAuthenticate);
  if (!userNeedsToAuthenticate) return true;

  // Do we have a master password?
  nsCOMPtr<nsIPK11TokenDB> tokenDB =
      do_GetService("@mozilla.org/security/pk11tokendb;1", &rv);
  NS_ENSURE_SUCCESS(rv, false);

  nsCOMPtr<nsIPK11Token> token;
  rv = tokenDB->GetInternalKeyToken(getter_AddRefs(token));
  NS_ENSURE_SUCCESS(rv, false);

  bool result;
  rv = token->CheckPassword(EmptyCString(), &result);
  NS_ENSURE_SUCCESS(rv, false);

  if (result) {
    // We don't have a master password, so this function isn't supported,
    // therefore just tell account manager we've authenticated and return true.
    accountManager->SetUserNeedsToAuthenticate(false);
    return true;
  }

  // We have a master password, so try and login to the slot.
  rv = token->Login(false);
  if (NS_FAILED(rv))
    // Login failed, so we didn't get a password (e.g. prompt cancelled).
    return false;

  // Double-check that we are now logged in
  rv = token->IsLoggedIn(&result);
  NS_ENSURE_SUCCESS(rv, false);

  accountManager->SetUserNeedsToAuthenticate(!result);
  return result;
}

// this gets called after the last junk mail classification has run.
nsresult nsMsgDBFolder::PerformBiffNotifications(void) {
  nsCOMPtr<nsIMsgIncomingServer> server;
  nsresult rv = GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);
  int32_t numBiffMsgs = 0;
  nsCOMPtr<nsIMsgFolder> root;
  rv = GetRootFolder(getter_AddRefs(root));
  root->GetNumNewMessages(true, &numBiffMsgs);
  if (numBiffMsgs > 0) {
    server->SetPerformingBiff(true);
    SetBiffState(nsIMsgFolder::nsMsgBiffState_NewMail);
    server->SetPerformingBiff(false);
  }
  return NS_OK;
}

nsresult nsMsgDBFolder::initializeStrings() {
  nsresult rv;
  nsCOMPtr<nsIStringBundleService> bundleService =
      mozilla::components::StringBundle::Service();
  NS_ENSURE_TRUE(bundleService, NS_ERROR_UNEXPECTED);
  nsCOMPtr<nsIStringBundle> bundle;
  rv = bundleService->CreateBundle(
      "chrome://messenger/locale/messenger.properties", getter_AddRefs(bundle));
  NS_ENSURE_SUCCESS(rv, rv);

  bundle->GetStringFromName("inboxFolderName", kLocalizedInboxName);
  bundle->GetStringFromName("trashFolderName", kLocalizedTrashName);
  bundle->GetStringFromName("sentFolderName", kLocalizedSentName);
  bundle->GetStringFromName("draftsFolderName", kLocalizedDraftsName);
  bundle->GetStringFromName("templatesFolderName", kLocalizedTemplatesName);
  bundle->GetStringFromName("junkFolderName", kLocalizedJunkName);
  bundle->GetStringFromName("outboxFolderName", kLocalizedUnsentName);
  bundle->GetStringFromName("archivesFolderName", kLocalizedArchivesName);

  nsCOMPtr<nsIStringBundle> brandBundle;
  rv = bundleService->CreateBundle("chrome://branding/locale/brand.properties",
                                   getter_AddRefs(bundle));
  NS_ENSURE_SUCCESS(rv, rv);
  bundle->GetStringFromName("brandShortName", kLocalizedBrandShortName);
  return NS_OK;
}

nsresult nsMsgDBFolder::createCollationKeyGenerator() {
  if (!gCollationKeyGenerator) {
    auto result = mozilla::intl::LocaleService::TryCreateComponent<Collator>();
    if (result.isErr()) {
      NS_WARNING("Could not create mozilla::intl::Collation.");
      return NS_ERROR_FAILURE;
    }

    gCollationKeyGenerator = result.unwrap();

    // Sort in a case-insensitive way, where "base" letters are considered
    // equal, e.g: a = á, a = A, a ≠ b.
    Collator::Options options{};
    options.sensitivity = Collator::Sensitivity::Base;
    auto optResult = gCollationKeyGenerator->SetOptions(options);

    if (optResult.isErr()) {
      NS_WARNING("Could not configure the mozilla::intl::Collation.");
      gCollationKeyGenerator = nullptr;
      return NS_ERROR_FAILURE;
    }
  }
  return NS_OK;
}

NS_IMETHODIMP
nsMsgDBFolder::Init(const nsACString& uri) {
  mURI = uri;
  return CreateBaseMessageURI(uri);
}

nsresult nsMsgDBFolder::CreateBaseMessageURI(const nsACString& aURI) {
  // Each folder needs to implement this.
  return NS_OK;
}

NS_IMETHODIMP
nsMsgDBFolder::GetURI(nsACString& name) {
  name = mURI;
  return NS_OK;
}

// Generic nsIMsgFolder implementation.
nsCString nsIMsgFolder::URI() {
  nsCString uri;
  DebugOnly<nsresult> rv = GetURI(uri);
  MOZ_ASSERT(NS_SUCCEEDED(rv));
  return uri;
}

////////////////////////////////////////////////////////////////////////////////
#if 0
typedef bool
(*nsArrayFilter)(nsISupports* element, void* data);
#endif
////////////////////////////////////////////////////////////////////////////////

NS_IMETHODIMP
nsMsgDBFolder::GetSubFolders(nsTArray<RefPtr<nsIMsgFolder>>& folders) {
  folders.ClearAndRetainStorage();
  folders.SetCapacity(mSubFolders.Length());
  for (nsIMsgFolder* f : mSubFolders) {
    folders.AppendElement(f);
  }
  return NS_OK;
}

NS_IMETHODIMP
nsMsgDBFolder::FindSubFolder(const nsACString& aEscapedSubFolderName,
                             nsIMsgFolder** aFolder) {
  // XXX use necko here
  nsAutoCString uri;
  uri.Append(mURI);
  uri.Append('/');
  uri.Append(aEscapedSubFolderName);

  return GetOrCreateFolder(uri, aFolder);
}

NS_IMETHODIMP
nsMsgDBFolder::GetHasSubFolders(bool* _retval) {
  NS_ENSURE_ARG_POINTER(_retval);
  *_retval = mSubFolders.Count() > 0;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgDBFolder::GetNumSubFolders(uint32_t* aResult) {
  NS_ENSURE_ARG_POINTER(aResult);
  *aResult = mSubFolders.Count();
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::AddFolderListener(nsIFolderListener* listener) {
  NS_ENSURE_ARG_POINTER(listener);
  mListeners.AppendElement(listener);
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::RemoveFolderListener(nsIFolderListener* listener) {
  NS_ENSURE_ARG_POINTER(listener);
  mListeners.RemoveElement(listener);
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::SetParent(nsIMsgFolder* aParent) {
  mParent = do_GetWeakReference(aParent);
  if (aParent) {
    nsresult rv;
    // servers do not have parents, so we must not be a server
    mIsServer = false;
    mIsServerIsValid = true;

    // also set the server itself while we're here.
    nsCOMPtr<nsIMsgIncomingServer> server;
    rv = aParent->GetServer(getter_AddRefs(server));
    if (NS_SUCCEEDED(rv) && server) mServer = do_GetWeakReference(server);
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::GetParent(nsIMsgFolder** aParent) {
  NS_ENSURE_ARG_POINTER(aParent);
  nsCOMPtr<nsIMsgFolder> parent = do_QueryReferent(mParent);
  parent.forget(aParent);
  return NS_OK;
}

NS_IMETHODIMP
nsMsgDBFolder::GetMessages(nsIMsgEnumerator** result) {
  NS_ENSURE_ARG_POINTER(result);
  // Make sure mDatabase is set.
  nsresult rv = GetDatabase();
  NS_ENSURE_SUCCESS(rv, rv);
  return mDatabase->EnumerateMessages(result);
}

NS_IMETHODIMP
nsMsgDBFolder::UpdateFolder(nsIMsgWindow*) { return NS_OK; }

////////////////////////////////////////////////////////////////////////////////

NS_IMETHODIMP nsMsgDBFolder::GetFolderURL(nsACString& url) {
  url.Assign(EmptyCString());
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::GetServer(nsIMsgIncomingServer** aServer) {
  NS_ENSURE_ARG_POINTER(aServer);
  nsresult rv;
  // short circuit the server if we have it.
  nsCOMPtr<nsIMsgIncomingServer> server = do_QueryReferent(mServer, &rv);
  if (NS_FAILED(rv)) {
    // try again after parsing the URI
    rv = parseURI(true);
    server = do_QueryReferent(mServer);
  }
  server.forget(aServer);
  return *aServer ? NS_OK : NS_ERROR_FAILURE;
}

nsresult nsMsgDBFolder::parseURI(bool needServer) {
  nsresult rv;
  nsCOMPtr<nsIURL> url;
  rv = NS_MutateURI(NS_STANDARDURLMUTATOR_CONTRACTID)
           .SetSpec(mURI)
           .Finalize(url);
  NS_ENSURE_SUCCESS(rv, rv);

  // empty path tells us it's a server.
  if (!mIsServerIsValid) {
    nsAutoCString path;
    rv = url->GetPathQueryRef(path);
    if (NS_SUCCEEDED(rv)) mIsServer = path.EqualsLiteral("/");
    mIsServerIsValid = true;
  }

  // grab the name off the leaf of the server
  if (mName.IsEmpty()) {
    // mName:
    // the name is the trailing directory in the path
    nsAutoCString fileName;
    nsAutoCString escapedFileName;
    url->GetFileName(escapedFileName);
    if (!escapedFileName.IsEmpty()) {
      // XXX conversion to unicode here? is fileName in UTF8?
      // yes, let's say it is in utf8
      MsgUnescapeString(escapedFileName, 0, fileName);
      NS_ASSERTION(mozilla::IsUtf8(fileName), "fileName is not in UTF-8");
      CopyUTF8toUTF16(fileName, mName);
    }
  }

  // grab the server by parsing the URI and looking it up
  // in the account manager...
  // But avoid this extra work by first asking the parent, if any
  nsCOMPtr<nsIMsgIncomingServer> server = do_QueryReferent(mServer, &rv);
  if (NS_FAILED(rv)) {
    // first try asking the parent instead of the URI
    nsCOMPtr<nsIMsgFolder> parentMsgFolder;
    GetParent(getter_AddRefs(parentMsgFolder));

    if (parentMsgFolder)
      rv = parentMsgFolder->GetServer(getter_AddRefs(server));

    // no parent. do the extra work of asking
    if (!server && needServer) {
      nsCOMPtr<nsIMsgAccountManager> accountManager =
          do_GetService("@mozilla.org/messenger/account-manager;1", &rv);
      NS_ENSURE_SUCCESS(rv, rv);

      nsCString serverType;
      GetIncomingServerType(serverType);
      if (serverType.IsEmpty()) {
        NS_WARNING("can't determine folder's server type");
        return NS_ERROR_FAILURE;
      }

      rv = NS_MutateURI(url).SetScheme(serverType).Finalize(url);
      NS_ENSURE_SUCCESS(rv, rv);
      rv = accountManager->FindServerByURI(url, getter_AddRefs(server));
      NS_ENSURE_SUCCESS(rv, rv);
    }
    mServer = do_GetWeakReference(server);
  } /* !mServer */

  // now try to find the local path for this folder
  if (server) {
    nsAutoCString newPath;
    nsAutoCString escapedUrlPath;
    nsAutoCString urlPath;
    url->GetFilePath(escapedUrlPath);
    if (!escapedUrlPath.IsEmpty()) {
      MsgUnescapeString(escapedUrlPath, 0, urlPath);

      // transform the filepath from the URI, such as
      // "/folder1/folder2/foldern"
      // to
      // "folder1.sbd/folder2.sbd/foldern"
      // (remove leading / and add .sbd to first n-1 folders)
      // to be appended onto the server's path
      bool isNewsFolder = false;
      nsAutoCString scheme;
      if (NS_SUCCEEDED(url->GetScheme(scheme))) {
        isNewsFolder = scheme.EqualsLiteral("news") ||
                       scheme.EqualsLiteral("snews") ||
                       scheme.EqualsLiteral("nntp");
      }
      NS_MsgCreatePathStringFromFolderURI(urlPath.get(), newPath, scheme,
                                          isNewsFolder);
    }

    // now append munged path onto server path
    nsCOMPtr<nsIFile> serverPath;
    rv = server->GetLocalPath(getter_AddRefs(serverPath));
    if (NS_FAILED(rv)) return rv;

    if (!mPath && serverPath) {
      if (!newPath.IsEmpty()) {
        // I hope this is temporary - Ultimately,
        // NS_MsgCreatePathStringFromFolderURI will need to be fixed.
#if defined(XP_WIN)
        newPath.ReplaceChar('/', '\\');
#endif
        rv = serverPath->AppendRelativeNativePath(newPath);
        NS_ASSERTION(NS_SUCCEEDED(rv), "failed to append to the serverPath");
        if (NS_FAILED(rv)) {
          mPath = nullptr;
          return rv;
        }
      }
      mPath = do_CreateInstance(NS_LOCAL_FILE_CONTRACTID, &rv);
      NS_ENSURE_SUCCESS(rv, rv);
      mPath->InitWithFile(serverPath);
    }
    // URI is completely parsed when we've attempted to get the server
    mHaveParsedURI = true;
  }
  return NS_OK;
}

NS_IMETHODIMP
nsMsgDBFolder::GetIsServer(bool* aResult) {
  NS_ENSURE_ARG_POINTER(aResult);
  // make sure we've parsed the URI
  if (!mIsServerIsValid) {
    nsresult rv = parseURI();
    if (NS_FAILED(rv) || !mIsServerIsValid) return NS_ERROR_FAILURE;
  }

  *aResult = mIsServer;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgDBFolder::GetNoSelect(bool* aResult) {
  NS_ENSURE_ARG_POINTER(aResult);
  *aResult = false;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgDBFolder::GetImapShared(bool* aResult) {
  NS_ENSURE_ARG_POINTER(aResult);
  return GetFlag(nsMsgFolderFlags::PersonalShared, aResult);
}

NS_IMETHODIMP
nsMsgDBFolder::GetCanSubscribe(bool* aResult) {
  NS_ENSURE_ARG_POINTER(aResult);
  // by default, you can't subscribe.
  // if otherwise, override it.
  *aResult = false;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgDBFolder::GetCanFileMessages(bool* aResult) {
  NS_ENSURE_ARG_POINTER(aResult);

  // varada - checking folder flag to see if it is the "Unsent Messages"
  // and if so return FALSE
  if (mFlags & (nsMsgFolderFlags::Queue | nsMsgFolderFlags::Virtual)) {
    *aResult = false;
    return NS_OK;
  }

  bool isServer = false;
  nsresult rv = GetIsServer(&isServer);
  if (NS_FAILED(rv)) return rv;

  // by default, you can't file messages into servers, only to folders
  // if otherwise, override it.
  *aResult = !isServer;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgDBFolder::GetCanDeleteMessages(bool* aResult) {
  NS_ENSURE_ARG_POINTER(aResult);
  *aResult = true;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgDBFolder::GetCanCreateSubfolders(bool* aResult) {
  NS_ENSURE_ARG_POINTER(aResult);

  // Checking folder flag to see if it is the "Unsent Messages"
  // or a virtual folder, and if so return FALSE
  if (mFlags & (nsMsgFolderFlags::Queue | nsMsgFolderFlags::Virtual)) {
    *aResult = false;
    return NS_OK;
  }

  // by default, you can create subfolders on server and folders
  // if otherwise, override it.
  *aResult = true;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgDBFolder::GetCanRename(bool* aResult) {
  NS_ENSURE_ARG_POINTER(aResult);

  bool isServer = false;
  nsresult rv = GetIsServer(&isServer);
  if (NS_FAILED(rv)) return rv;
  // by default, you can't rename servers, only folders
  // if otherwise, override it.
  //
  // check if the folder is a special folder
  // (Trash, Drafts, Unsent Messages, Inbox, Sent, Templates, Junk, Archives)
  // if it is, don't allow the user to rename it
  // (which includes dnd moving it with in the same server)
  //
  // this errors on the side of caution.  we'll return false a lot
  // more often if we use flags,
  // instead of checking if the folder really is being used as a
  // special folder by looking at the "copies and folders" prefs on the
  // identities.
  *aResult = !(isServer || (mFlags & nsMsgFolderFlags::SpecialUse));
  return NS_OK;
}

NS_IMETHODIMP
nsMsgDBFolder::GetCanCompact(bool* canCompact) {
  NS_ENSURE_ARG_POINTER(canCompact);
  bool isServer = false;
  nsresult rv = GetIsServer(&isServer);
  NS_ENSURE_SUCCESS(rv, rv);
  // servers (root folder) cannot be compacted
  // virtual search folders cannot be compacted
  *canCompact = !isServer && !(mFlags & nsMsgFolderFlags::Virtual);
  // If *canCompact now true and folder is imap, keep *canCompact true and
  // return; otherwise, when not imap, type of store controls it. E.g., mbox
  // sets *canCompact true, maildir sets it false.
  if (*canCompact && !(mFlags & nsMsgFolderFlags::ImapBox)) {
    // Check if the storage type supports compaction
    nsCOMPtr<nsIMsgPluggableStore> msgStore;
    GetMsgStore(getter_AddRefs(msgStore));
    if (msgStore) msgStore->GetSupportsCompaction(canCompact);
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::GetPrettyName(nsAString& name) {
  return GetName(name);
}

NS_IMETHODIMP nsMsgDBFolder::GetPrettyPath(nsAString& aPath) {
  nsresult rv;
  if (mIsServer) {
    aPath.Truncate();
    return NS_OK;
  }

  nsCOMPtr<nsIMsgFolder> parent = do_QueryReferent(mParent);
  if (parent) {
    parent->GetPrettyPath(aPath);
    if (!aPath.IsEmpty()) {
      aPath.AppendLiteral("/");
    }
  }
  nsString name;
  rv = GetPrettyName(name);
  NS_ENSURE_SUCCESS(rv, rv);
  aPath.Append(name);
  return NS_OK;
}

static bool nonEnglishApp() {
  if (nsMsgDBFolder::gIsEnglishApp == -1) {
    nsAutoCString locale;
    mozilla::intl::LocaleService::GetInstance()->GetAppLocaleAsBCP47(locale);
    nsMsgDBFolder::gIsEnglishApp =
        (locale.EqualsLiteral("en") || StringBeginsWith(locale, "en-"_ns)) ? 1
                                                                           : 0;
  }
  return nsMsgDBFolder::gIsEnglishApp ? false : true;
}

static bool hasTrashName(const nsAString& name) {
  // Microsoft calls the folder "Deleted". If the application is non-English,
  // we want to use the localised name instead.
  return name.LowerCaseEqualsLiteral("trash") ||
         (name.LowerCaseEqualsLiteral("deleted") && nonEnglishApp());
}

static bool hasDraftsName(const nsAString& name) {
  // Some IMAP providers call the folder "Draft". If the application is
  // non-English, we want to use the localised name instead.
  return name.LowerCaseEqualsLiteral("drafts") ||
         (name.LowerCaseEqualsLiteral("draft") && nonEnglishApp());
}

static bool hasSentName(const nsAString& name) {
  // Some IMAP providers call the folder for sent messages "Outbox". That IMAP
  // folder is not related to Thunderbird's local folder for queued messages.
  // If we find such a folder with the 'SentMail' flag, we can safely localize
  // its name if the application is non-English.
  return name.LowerCaseEqualsLiteral("sent") ||
         (name.LowerCaseEqualsLiteral("outbox") && nonEnglishApp());
}

NS_IMETHODIMP nsMsgDBFolder::SetPrettyName(const nsAString& name) {
  nsresult rv;
  // Keep original name.
  mOriginalName = name;

  // Set pretty name only if special flag is set and if it the default folder
  // name
  if (mFlags & nsMsgFolderFlags::Inbox && name.LowerCaseEqualsLiteral("inbox"))
    rv = SetName(kLocalizedInboxName);
  else if (mFlags & nsMsgFolderFlags::SentMail && hasSentName(name))
    rv = SetName(kLocalizedSentName);
  else if (mFlags & nsMsgFolderFlags::Drafts && hasDraftsName(name))
    rv = SetName(kLocalizedDraftsName);
  else if (mFlags & nsMsgFolderFlags::Templates &&
           name.LowerCaseEqualsLiteral("templates"))
    rv = SetName(kLocalizedTemplatesName);
  else if (mFlags & nsMsgFolderFlags::Trash && hasTrashName(name))
    rv = SetName(kLocalizedTrashName);
  else if (mFlags & nsMsgFolderFlags::Queue &&
           name.LowerCaseEqualsLiteral("unsent messages"))
    rv = SetName(kLocalizedUnsentName);
  else if (mFlags & nsMsgFolderFlags::Junk &&
           name.LowerCaseEqualsLiteral("junk"))
    rv = SetName(kLocalizedJunkName);
  else if (mFlags & nsMsgFolderFlags::Archive &&
           name.LowerCaseEqualsLiteral("archives"))
    rv = SetName(kLocalizedArchivesName);
  else
    rv = SetName(name);
  return rv;
}

NS_IMETHODIMP nsMsgDBFolder::SetPrettyNameFromOriginal(void) {
  if (mOriginalName.IsEmpty()) return NS_OK;
  return SetPrettyName(mOriginalName);
}

NS_IMETHODIMP nsMsgDBFolder::GetName(nsAString& name) {
  nsresult rv;
  if (!mHaveParsedURI && mName.IsEmpty()) {
    rv = parseURI();
    if (NS_FAILED(rv)) return rv;
  }

  // if it's a server, just forward the call
  if (mIsServer) {
    nsCOMPtr<nsIMsgIncomingServer> server;
    rv = GetServer(getter_AddRefs(server));
    if (NS_SUCCEEDED(rv) && server) return server->GetPrettyName(name);
  }

  name = mName;
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::SetName(const nsAString& name) {
  // override the URI-generated name
  if (!mName.Equals(name)) {
    mName = name;
    // old/new value doesn't matter here
    NotifyUnicharPropertyChanged(kName, name, name);
  }
  return NS_OK;
}

// For default, just return name
NS_IMETHODIMP nsMsgDBFolder::GetAbbreviatedName(nsAString& aAbbreviatedName) {
  return GetName(aAbbreviatedName);
}

NS_IMETHODIMP
nsMsgDBFolder::GetChildNamed(const nsAString& aName, nsIMsgFolder** aChild) {
  NS_ENSURE_ARG_POINTER(aChild);
  nsTArray<RefPtr<nsIMsgFolder>> dummy;
  GetSubFolders(dummy);  // initialize mSubFolders
  *aChild = nullptr;

  for (nsIMsgFolder* child : mSubFolders) {
    nsString folderName;
    nsresult rv = child->GetName(folderName);
    // case-insensitive compare is probably LCD across OS filesystems
    if (NS_SUCCEEDED(rv) &&
        folderName.Equals(aName, nsCaseInsensitiveStringComparator)) {
      NS_ADDREF(*aChild = child);
      return NS_OK;
    }
  }
  // don't return NS_OK if we didn't find the folder
  // see http://bugzilla.mozilla.org/show_bug.cgi?id=210089#c15
  // and http://bugzilla.mozilla.org/show_bug.cgi?id=210089#c17
  return NS_ERROR_FAILURE;
}

NS_IMETHODIMP nsMsgDBFolder::GetChildWithURI(const nsACString& uri, bool deep,
                                             bool caseInsensitive,
                                             nsIMsgFolder** child) {
  NS_ENSURE_ARG_POINTER(child);
  // will return nullptr if we can't find it
  *child = nullptr;
  nsTArray<RefPtr<nsIMsgFolder>> subFolders;
  nsresult rv = GetSubFolders(subFolders);
  NS_ENSURE_SUCCESS(rv, rv);

  for (nsIMsgFolder* folder : subFolders) {
    nsCString folderURI;
    rv = folder->GetURI(folderURI);
    NS_ENSURE_SUCCESS(rv, rv);
    bool equal =
        (caseInsensitive
             ? uri.Equals(folderURI, nsCaseInsensitiveCStringComparator)
             : uri.Equals(folderURI));
    if (equal) {
      NS_ADDREF(*child = folder);
      return NS_OK;
    }
    if (deep) {
      rv = folder->GetChildWithURI(uri, deep, caseInsensitive, child);
      if (NS_FAILED(rv)) return rv;

      if (*child) return NS_OK;
    }
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::GetShowDeletedMessages(bool* showDeletedMessages) {
  NS_ENSURE_ARG_POINTER(showDeletedMessages);
  *showDeletedMessages = false;
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::DeleteStorage() {
  ForceDBClosed();

  // Delete the .msf file.
  // NOTE: this doesn't remove .msf files in subfolders, but
  // both nsMsgBrkMBoxStore::DeleteFolder() and
  // nsMsgMaildirStore::DeleteFolder() will remove those .msf files
  // as a side-effect of deleting the .sbd directory.
  nsCOMPtr<nsIFile> summaryFile;
  nsresult rv = GetSummaryFile(getter_AddRefs(summaryFile));
  NS_ENSURE_SUCCESS(rv, rv);
  bool exists = false;
  summaryFile->Exists(&exists);
  if (exists) {
    rv = summaryFile->Remove(false);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // Ask the msgStore to delete the actual storage (mbox, maildir or whatever
  // else may be supported in future).
  nsCOMPtr<nsIMsgPluggableStore> msgStore;
  rv = GetMsgStore(getter_AddRefs(msgStore));
  NS_ENSURE_SUCCESS(rv, rv);
  return msgStore->DeleteFolder(this);
}

NS_IMETHODIMP nsMsgDBFolder::DeleteSelf(nsIMsgWindow* msgWindow) {
  nsCOMPtr<nsIMsgFolder> parent;
  GetParent(getter_AddRefs(parent));
  if (!parent) {
    return NS_ERROR_FAILURE;
  }
  return parent->PropagateDelete(this, true);
}

NS_IMETHODIMP nsMsgDBFolder::CreateStorageIfMissing(
    nsIUrlListener* /* urlListener */) {
  NS_ASSERTION(false, "needs to be overridden");
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::PropagateDelete(nsIMsgFolder* folder,
                                             bool deleteStorage) {
  // first, find the folder we're looking to delete
  nsresult rv = NS_OK;

  int32_t count = mSubFolders.Count();
  for (int32_t i = 0; i < count; i++) {
    nsCOMPtr<nsIMsgFolder> child(mSubFolders[i]);
    if (folder == child.get()) {
      // Remove self as parent
      child->SetParent(nullptr);
      // maybe delete disk storage for it, and its subfolders
      rv = child->RecursiveDelete(deleteStorage);
      if (NS_SUCCEEDED(rv)) {
        // Remove from list of subfolders.
        mSubFolders.RemoveObjectAt(i);
        NotifyFolderRemoved(child);
        break;
      } else  // setting parent back if we failed
        child->SetParent(this);
    } else
      rv = child->PropagateDelete(folder, deleteStorage);
  }

  return rv;
}

NS_IMETHODIMP nsMsgDBFolder::RecursiveDelete(bool deleteStorage) {
  // If deleteStorage is true, recursively deletes disk storage for this folder
  // and all its subfolders.
  // Regardless of deleteStorage, always unlinks them from the children lists
  // and frees memory for the subfolders but NOT for _this_
  // and does not remove _this_ from the parent's list of children.

  nsCOMPtr<nsIFile> dbPath;
  // first remove the deleted folder from the folder cache;
  nsresult rv = GetFolderCacheKey(getter_AddRefs(dbPath));
  if (NS_SUCCEEDED(rv)) {
    nsCOMPtr<nsIMsgAccountManager> accountMgr =
        do_GetService("@mozilla.org/messenger/account-manager;1", &rv);
    nsCOMPtr<nsIMsgFolderCache> folderCache;
    rv = accountMgr->GetFolderCache(getter_AddRefs(folderCache));
    if (NS_SUCCEEDED(rv) && folderCache) {
      nsCString persistentPath;
      rv = dbPath->GetPersistentDescriptor(persistentPath);
      if (NS_SUCCEEDED(rv)) folderCache->RemoveElement(persistentPath);
    }
  }

  int32_t count = mSubFolders.Count();
  while (count > 0) {
    nsCOMPtr<nsIMsgFolder> child(mSubFolders[0]);
    child->SetParent(nullptr);
    rv = child->RecursiveDelete(deleteStorage);
    if (NS_SUCCEEDED(rv)) {
      // unlink it from this child's list
      mSubFolders.RemoveObjectAt(0);
      NotifyFolderRemoved(child);
    } else {
      // setting parent back if we failed for some reason
      child->SetParent(this);
      break;
    }

    count--;
  }

  // now delete the disk storage for _this_
  if (deleteStorage && NS_SUCCEEDED(rv)) {
    // All delete commands use deleteStorage = true, and local moves use false.
    // IMAP moves use true, leaving this here in the hope that bug 439108
    // works out.
    nsCOMPtr<nsIMsgFolderNotificationService> notifier(
        do_GetService("@mozilla.org/messenger/msgnotificationservice;1"));
    if (notifier) notifier->NotifyFolderDeleted(this);
    rv = DeleteStorage();
  }
  return rv;
}

NS_IMETHODIMP nsMsgDBFolder::CreateSubfolder(const nsAString& folderName,
                                             nsIMsgWindow* msgWindow) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsMsgDBFolder::AddSubfolder(const nsAString& name,
                                          nsIMsgFolder** child) {
  NS_ENSURE_ARG_POINTER(child);

  int32_t flags = 0;
  nsresult rv;

  nsAutoCString uri(mURI);
  uri.Append('/');

  // URI should use UTF-8
  // (see RFC2396 Uniform Resource Identifiers (URI): Generic Syntax)
  nsAutoCString escapedName;
  rv = NS_MsgEscapeEncodeURLPath(name, escapedName);
  NS_ENSURE_SUCCESS(rv, rv);

  // Ensure the containing (.sbd) dir exists.
  nsCOMPtr<nsIFile> path;
  rv = CreateDirectoryForFolder(getter_AddRefs(path));
  NS_ENSURE_SUCCESS(rv, rv);

  // fix for #192780
  // if this is the root folder
  // make sure the the special folders
  // have the right uri.
  // on disk, host\INBOX should be a folder with the uri
  // mailbox://user@host/Inbox" as mailbox://user@host/Inbox !=
  // mailbox://user@host/INBOX
  nsCOMPtr<nsIMsgFolder> rootFolder;
  rv = GetRootFolder(getter_AddRefs(rootFolder));
  if (NS_SUCCEEDED(rv) && rootFolder &&
      (rootFolder.get() == (nsIMsgFolder*)this)) {
    if (escapedName.LowerCaseEqualsLiteral("inbox"))
      uri += "Inbox";
    else if (escapedName.LowerCaseEqualsLiteral("unsent%20messages"))
      uri += "Unsent%20Messages";
    else if (escapedName.LowerCaseEqualsLiteral("drafts"))
      uri += "Drafts";
    else if (escapedName.LowerCaseEqualsLiteral("trash"))
      uri += "Trash";
    else if (escapedName.LowerCaseEqualsLiteral("sent"))
      uri += "Sent";
    else if (escapedName.LowerCaseEqualsLiteral("templates"))
      uri += "Templates";
    else if (escapedName.LowerCaseEqualsLiteral("archives"))
      uri += "Archives";
    else
      uri += escapedName.get();
  } else
    uri += escapedName.get();

  nsCOMPtr<nsIMsgFolder> msgFolder;
  rv = GetChildWithURI(uri, false /*deep*/, true /*case Insensitive*/,
                       getter_AddRefs(msgFolder));
  if (NS_SUCCEEDED(rv) && msgFolder) return NS_MSG_FOLDER_EXISTS;

  nsCOMPtr<nsIMsgFolder> folder;
  rv = GetOrCreateFolder(uri, getter_AddRefs(folder));
  NS_ENSURE_SUCCESS(rv, rv);

  folder->GetFlags((uint32_t*)&flags);
  flags |= nsMsgFolderFlags::Mail;
  folder->SetParent(this);

  bool isServer;
  rv = GetIsServer(&isServer);

  // Only set these if these are top level children.
  if (NS_SUCCEEDED(rv) && isServer) {
    if (name.LowerCaseEqualsLiteral("inbox")) {
      flags |= nsMsgFolderFlags::Inbox;
      SetBiffState(nsIMsgFolder::nsMsgBiffState_Unknown);
    } else if (name.LowerCaseEqualsLiteral("trash"))
      flags |= nsMsgFolderFlags::Trash;
    else if (name.LowerCaseEqualsLiteral("unsent messages") ||
             name.LowerCaseEqualsLiteral("outbox"))
      flags |= nsMsgFolderFlags::Queue;
  }

  folder->SetFlags(flags);

  if (folder) mSubFolders.AppendObject(folder);

  folder.forget(child);
  // at this point we must be ok and we don't want to return failure in case
  // GetIsServer failed.
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::Compact(nsIUrlListener* aListener,
                                     nsIMsgWindow* aMsgWindow) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsMsgDBFolder::CompactAll(nsIUrlListener* aListener,
                                        nsIMsgWindow* aMsgWindow) {
  NS_ASSERTION(false, "should be overridden by child class");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsMsgDBFolder::EmptyTrash(nsIUrlListener* aListener) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

nsresult nsMsgDBFolder::CheckIfFolderExists(const nsAString& newFolderName,
                                            nsIMsgFolder* parentFolder,
                                            nsIMsgWindow* msgWindow) {
  NS_ENSURE_ARG_POINTER(parentFolder);
  nsTArray<RefPtr<nsIMsgFolder>> subFolders;
  nsresult rv = parentFolder->GetSubFolders(subFolders);
  NS_ENSURE_SUCCESS(rv, rv);

  for (nsIMsgFolder* msgFolder : subFolders) {
    nsString folderName;

    msgFolder->GetName(folderName);
    if (folderName.Equals(newFolderName, nsCaseInsensitiveStringComparator)) {
      ThrowAlertMsg("folderExists", msgWindow);
      return NS_MSG_FOLDER_EXISTS;
    }
  }
  return NS_OK;
}

bool nsMsgDBFolder::ConfirmAutoFolderRename(nsIMsgWindow* msgWindow,
                                            const nsString& aOldName,
                                            const nsString& aNewName) {
  nsCOMPtr<nsIStringBundle> bundle;
  nsresult rv = GetBaseStringBundle(getter_AddRefs(bundle));
  if (NS_WARN_IF(NS_FAILED(rv))) {
    return false;
  }

  nsString folderName;
  GetName(folderName);
  AutoTArray<nsString, 3> formatStrings = {aOldName, folderName, aNewName};

  nsString confirmString;
  rv = bundle->FormatStringFromName("confirmDuplicateFolderRename",
                                    formatStrings, confirmString);
  if (NS_WARN_IF(NS_FAILED(rv))) {
    return false;
  }

  bool confirmed = false;
  rv = ThrowConfirmationPrompt(msgWindow, confirmString, &confirmed);
  if (NS_WARN_IF(NS_FAILED(rv))) {
    return false;
  }
  return confirmed;
}

nsresult nsMsgDBFolder::AddDirectorySeparator(nsIFile* path) {
  nsAutoString leafName;
  path->GetLeafName(leafName);
  leafName.AppendLiteral(FOLDER_SUFFIX);
  return path->SetLeafName(leafName);
}

/* Finds the subdirectory associated with this folder.  That is if the path is
   c:\Inbox, it will return c:\Inbox.sbd if it succeeds.  If that path doesn't
   currently exist then it will create it. Path is strictly an out parameter.
  */
nsresult nsMsgDBFolder::CreateDirectoryForFolder(nsIFile** resultFile) {
  nsCOMPtr<nsIFile> path;
  nsresult rv = GetFilePath(getter_AddRefs(path));
  NS_ENSURE_SUCCESS(rv, rv);

  bool isServer;
  rv = GetIsServer(&isServer);
  NS_ENSURE_SUCCESS(rv, rv);
  if (isServer) {
    // Server dir doesn't have .sbd suffix.
    // Ensure it exists and is a directory.
    bool pathExists;
    path->Exists(&pathExists);
    NS_ENSURE_SUCCESS(rv, rv);
    if (!pathExists) {
      rv = path->Create(nsIFile::DIRECTORY_TYPE, 0700);
      NS_ENSURE_SUCCESS(rv, rv);
    } else {
      bool isDir;
      rv = path->IsDirectory(&isDir);
      NS_ENSURE_SUCCESS(rv, rv);
      if (!isDir) {
        return NS_ERROR_UNEXPECTED;
      }
    }
    path.forget(resultFile);
    return NS_OK;
  }

  // Append .sbd suffix.
  rv = AddDirectorySeparator(path);
  NS_ENSURE_SUCCESS(rv, rv);

  // Already exists?
  bool exists;
  rv = path->Exists(&exists);
  NS_ENSURE_SUCCESS(rv, rv);
  if (exists) {
    bool isDir;
    rv = path->IsDirectory(&isDir);
    NS_ENSURE_SUCCESS(rv, rv);
    if (!isDir) {
      // Uhoh. Not the dir we were expecting!
      return NS_MSG_COULD_NOT_CREATE_DIRECTORY;
    }
    // Already been created.
    path.forget(resultFile);
    return NS_OK;
  }

  // Need to create it.
  rv = path->Create(nsIFile::DIRECTORY_TYPE, 0700);
  NS_ENSURE_SUCCESS(rv, rv);
  path.forget(resultFile);
  return NS_OK;
}

/* Finds the backup directory associated with this folder, stored on the temp
   drive. If that path doesn't currently exist then it will create it. Path is
   strictly an out parameter.
  */
nsresult nsMsgDBFolder::CreateBackupDirectory(nsIFile** resultFile) {
  nsCOMPtr<nsIFile> path;
  nsresult rv = NS_GetSpecialDirectory(NS_OS_TEMP_DIR, getter_AddRefs(path));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = path->Append(u"MozillaMailnews"_ns);
  bool pathIsDirectory;
  path->IsDirectory(&pathIsDirectory);

  // If that doesn't exist, then we have to create this directory
  if (!pathIsDirectory) {
    bool pathExists;
    path->Exists(&pathExists);
    // If for some reason there's a file with the directory separator
    // then we are going to fail.
    rv = pathExists ? NS_MSG_COULD_NOT_CREATE_DIRECTORY
                    : path->Create(nsIFile::DIRECTORY_TYPE, 0700);
  }
  if (NS_SUCCEEDED(rv)) path.forget(resultFile);
  return rv;
}

nsresult nsMsgDBFolder::GetBackupSummaryFile(nsIFile** aBackupFile,
                                             const nsACString& newName) {
  nsCOMPtr<nsIFile> backupDir;
  nsresult rv = CreateBackupDirectory(getter_AddRefs(backupDir));
  NS_ENSURE_SUCCESS(rv, rv);

  // We use a dummy message folder file so we can use
  // GetSummaryFileLocation to get the db file name
  nsCOMPtr<nsIFile> backupDBDummyFolder;
  rv = CreateBackupDirectory(getter_AddRefs(backupDBDummyFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  if (!newName.IsEmpty()) {
    rv = backupDBDummyFolder->AppendNative(newName);
  } else  // if newName is null, use the folder name
  {
    nsCOMPtr<nsIFile> folderPath;
    rv = GetFilePath(getter_AddRefs(folderPath));
    NS_ENSURE_SUCCESS(rv, rv);

    nsAutoCString folderName;
    rv = folderPath->GetNativeLeafName(folderName);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = backupDBDummyFolder->AppendNative(folderName);
  }
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIFile> backupDBFile;
  rv =
      GetSummaryFileLocation(backupDBDummyFolder, getter_AddRefs(backupDBFile));
  NS_ENSURE_SUCCESS(rv, rv);

  backupDBFile.forget(aBackupFile);
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::Rename(const nsAString& aNewName,
                                    nsIMsgWindow* msgWindow) {
  nsCOMPtr<nsIFile> oldPathFile;
  nsresult rv = GetFilePath(getter_AddRefs(oldPathFile));
  if (NS_FAILED(rv)) return rv;
  nsCOMPtr<nsIMsgFolder> parentFolder;
  rv = GetParent(getter_AddRefs(parentFolder));
  if (!parentFolder) return NS_ERROR_FAILURE;
  nsCOMPtr<nsISupports> parentSupport = do_QueryInterface(parentFolder);
  nsCOMPtr<nsIFile> oldSummaryFile;
  rv = GetSummaryFileLocation(oldPathFile, getter_AddRefs(oldSummaryFile));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIFile> dirFile;
  int32_t count = mSubFolders.Count();

  if (count > 0) rv = CreateDirectoryForFolder(getter_AddRefs(dirFile));

  nsAutoString newDiskName(aNewName);
  NS_MsgHashIfNecessary(newDiskName);

  if (mName.Equals(aNewName, nsCaseInsensitiveStringComparator)) {
    rv = ThrowAlertMsg("folderExists", msgWindow);
    return NS_MSG_FOLDER_EXISTS;
  } else {
    nsCOMPtr<nsIFile> parentPathFile;
    parentFolder->GetFilePath(getter_AddRefs(parentPathFile));
    NS_ENSURE_SUCCESS(rv, rv);
    bool isDirectory = false;
    parentPathFile->IsDirectory(&isDirectory);
    if (!isDirectory) AddDirectorySeparator(parentPathFile);

    rv = CheckIfFolderExists(aNewName, parentFolder, msgWindow);
    if (NS_FAILED(rv)) return rv;
  }

  ForceDBClosed();

  // Save of dir name before appending .msf
  nsAutoString newNameDirStr(newDiskName);

  if (!(mFlags & nsMsgFolderFlags::Virtual))
    rv = oldPathFile->MoveTo(nullptr, newDiskName);
  if (NS_SUCCEEDED(rv)) {
    newDiskName.AppendLiteral(SUMMARY_SUFFIX);
    oldSummaryFile->MoveTo(nullptr, newDiskName);
  } else {
    ThrowAlertMsg("folderRenameFailed", msgWindow);
    return rv;
  }

  if (NS_SUCCEEDED(rv) && count > 0) {
    // rename "*.sbd" directory
    newNameDirStr.AppendLiteral(FOLDER_SUFFIX);
    dirFile->MoveTo(nullptr, newNameDirStr);
  }

  nsCOMPtr<nsIMsgFolder> newFolder;
  if (parentSupport) {
    rv = parentFolder->AddSubfolder(aNewName, getter_AddRefs(newFolder));
    if (newFolder) {
      newFolder->SetPrettyName(EmptyString());
      newFolder->SetPrettyName(aNewName);
      newFolder->SetFlags(mFlags);
      bool changed = false;
      MatchOrChangeFilterDestination(newFolder, true /*case-insensitive*/,
                                     &changed);
      if (changed) AlertFilterChanged(msgWindow);

      if (count > 0) newFolder->RenameSubFolders(msgWindow, this);

      if (parentFolder) {
        SetParent(nullptr);
        parentFolder->PropagateDelete(this, false);
        parentFolder->NotifyFolderAdded(newFolder);
      }
      newFolder->NotifyFolderEvent(kRenameCompleted);
    }
  }
  return rv;
}

NS_IMETHODIMP nsMsgDBFolder::RenameSubFolders(nsIMsgWindow* msgWindow,
                                              nsIMsgFolder* oldFolder) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsMsgDBFolder::ContainsChildNamed(const nsAString& name,
                                                bool* containsChild) {
  NS_ENSURE_ARG_POINTER(containsChild);
  nsCOMPtr<nsIMsgFolder> child;
  GetChildNamed(name, getter_AddRefs(child));
  *containsChild = child != nullptr;
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::IsAncestorOf(nsIMsgFolder* child,
                                          bool* isAncestor) {
  NS_ENSURE_ARG_POINTER(isAncestor);
  nsresult rv = NS_OK;

  int32_t count = mSubFolders.Count();

  for (int32_t i = 0; i < count; i++) {
    nsCOMPtr<nsIMsgFolder> folder(mSubFolders[i]);
    if (folder.get() == child)
      *isAncestor = true;
    else
      folder->IsAncestorOf(child, isAncestor);

    if (*isAncestor) return NS_OK;
  }
  *isAncestor = false;
  return rv;
}

NS_IMETHODIMP nsMsgDBFolder::GenerateUniqueSubfolderName(
    const nsAString& prefix, nsIMsgFolder* otherFolder, nsAString& name) {
  /* only try 256 times */
  for (int count = 0; count < 256; count++) {
    nsAutoString uniqueName;
    uniqueName.Assign(prefix);
    if (count > 0) {
      uniqueName.AppendInt(count);
    }
    bool containsChild;
    bool otherContainsChild = false;
    ContainsChildNamed(uniqueName, &containsChild);
    if (otherFolder)
      otherFolder->ContainsChildNamed(uniqueName, &otherContainsChild);

    if (!containsChild && !otherContainsChild) {
      name = uniqueName;
      break;
    }
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::UpdateSummaryTotals(bool force) {
  if (!mNotifyCountChanges) return NS_OK;

  int32_t oldUnreadMessages = mNumUnreadMessages + mNumPendingUnreadMessages;
  int32_t oldTotalMessages = mNumTotalMessages + mNumPendingTotalMessages;
  // We need to read this info from the database
  nsresult rv = ReadDBFolderInfo(force);

  if (NS_SUCCEEDED(rv)) {
    int32_t newUnreadMessages = mNumUnreadMessages + mNumPendingUnreadMessages;
    int32_t newTotalMessages = mNumTotalMessages + mNumPendingTotalMessages;

    // Need to notify listeners that total count changed.
    if (oldTotalMessages != newTotalMessages)
      NotifyIntPropertyChanged(kTotalMessages, oldTotalMessages,
                               newTotalMessages);

    if (oldUnreadMessages != newUnreadMessages)
      NotifyIntPropertyChanged(kTotalUnreadMessages, oldUnreadMessages,
                               newUnreadMessages);

    FlushToFolderCache();
  }
  return rv;
}

NS_IMETHODIMP nsMsgDBFolder::SummaryChanged() {
  UpdateSummaryTotals(false);
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::GetNumUnread(bool deep, int32_t* numUnread) {
  NS_ENSURE_ARG_POINTER(numUnread);

  bool isServer = false;
  nsresult rv = GetIsServer(&isServer);
  NS_ENSURE_SUCCESS(rv, rv);
  int32_t total = isServer ? 0 : mNumUnreadMessages + mNumPendingUnreadMessages;

  if (deep) {
    if (total < 0)  // deep search never returns negative counts
      total = 0;
    int32_t count = mSubFolders.Count();
    for (int32_t i = 0; i < count; i++) {
      nsCOMPtr<nsIMsgFolder> folder(mSubFolders[i]);
      int32_t num;
      uint32_t folderFlags;
      folder->GetFlags(&folderFlags);
      if (!(folderFlags & nsMsgFolderFlags::Virtual)) {
        folder->GetNumUnread(deep, &num);
        total += num;
      }
    }
  }
  *numUnread = total;
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::GetTotalMessages(bool deep,
                                              int32_t* totalMessages) {
  NS_ENSURE_ARG_POINTER(totalMessages);

  bool isServer = false;
  nsresult rv = GetIsServer(&isServer);
  NS_ENSURE_SUCCESS(rv, rv);
  int32_t total = isServer ? 0 : mNumTotalMessages + mNumPendingTotalMessages;

  if (deep) {
    if (total < 0)  // deep search never returns negative counts
      total = 0;
    int32_t count = mSubFolders.Count();
    for (int32_t i = 0; i < count; i++) {
      nsCOMPtr<nsIMsgFolder> folder(mSubFolders[i]);
      int32_t num;
      uint32_t folderFlags;
      folder->GetFlags(&folderFlags);
      if (!(folderFlags & nsMsgFolderFlags::Virtual)) {
        folder->GetTotalMessages(deep, &num);
        total += num;
      }
    }
  }
  *totalMessages = total;
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::GetNumPendingUnread(int32_t* aPendingUnread) {
  *aPendingUnread = mNumPendingUnreadMessages;
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::GetNumPendingTotalMessages(
    int32_t* aPendingTotal) {
  *aPendingTotal = mNumPendingTotalMessages;
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::ChangeNumPendingUnread(int32_t delta) {
  if (delta) {
    int32_t oldUnreadMessages = mNumUnreadMessages + mNumPendingUnreadMessages;
    mNumPendingUnreadMessages += delta;
    int32_t newUnreadMessages = mNumUnreadMessages + mNumPendingUnreadMessages;
    NS_ASSERTION(newUnreadMessages >= 0,
                 "shouldn't have negative unread message count");
    if (newUnreadMessages >= 0) {
      nsCOMPtr<nsIMsgDatabase> db;
      nsCOMPtr<nsIDBFolderInfo> folderInfo;
      nsresult rv =
          GetDBFolderInfoAndDB(getter_AddRefs(folderInfo), getter_AddRefs(db));
      if (NS_SUCCEEDED(rv) && folderInfo)
        folderInfo->SetImapUnreadPendingMessages(mNumPendingUnreadMessages);
      NotifyIntPropertyChanged(kTotalUnreadMessages, oldUnreadMessages,
                               newUnreadMessages);
    }
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::ChangeNumPendingTotalMessages(int32_t delta) {
  if (delta) {
    int32_t oldTotalMessages = mNumTotalMessages + mNumPendingTotalMessages;
    mNumPendingTotalMessages += delta;
    int32_t newTotalMessages = mNumTotalMessages + mNumPendingTotalMessages;

    nsCOMPtr<nsIMsgDatabase> db;
    nsCOMPtr<nsIDBFolderInfo> folderInfo;
    nsresult rv =
        GetDBFolderInfoAndDB(getter_AddRefs(folderInfo), getter_AddRefs(db));
    if (NS_SUCCEEDED(rv) && folderInfo)
      folderInfo->SetImapTotalPendingMessages(mNumPendingTotalMessages);
    NotifyIntPropertyChanged(kTotalMessages, oldTotalMessages,
                             newTotalMessages);
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::SetFlag(uint32_t flag) {
  // If calling this function causes us to open the db (i.e., it was not
  // open before), we're going to close the db before returning.
  bool dbWasOpen = mDatabase != nullptr;

  ReadDBFolderInfo(false);
  // OnFlagChange can be expensive, so don't call it if we don't need to
  bool flagSet;
  nsresult rv;

  if (NS_FAILED(rv = GetFlag(flag, &flagSet))) return rv;

  if (!flagSet) {
    mFlags |= flag;
    OnFlagChange(flag);
  }
  if (!dbWasOpen && mDatabase) SetMsgDatabase(nullptr);

  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::ClearFlag(uint32_t flag) {
  // OnFlagChange can be expensive, so don't call it if we don't need to
  bool flagSet;
  nsresult rv;

  if (NS_FAILED(rv = GetFlag(flag, &flagSet))) return rv;

  if (flagSet) {
    mFlags &= ~flag;
    OnFlagChange(flag);
  }

  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::GetFlag(uint32_t flag, bool* _retval) {
  *_retval = ((mFlags & flag) != 0);
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::ToggleFlag(uint32_t flag) {
  mFlags ^= flag;
  OnFlagChange(flag);

  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::OnFlagChange(uint32_t flag) {
  nsresult rv = NS_OK;
  nsCOMPtr<nsIMsgDatabase> db;
  nsCOMPtr<nsIDBFolderInfo> folderInfo;
  rv = GetDBFolderInfoAndDB(getter_AddRefs(folderInfo), getter_AddRefs(db));
  if (NS_SUCCEEDED(rv) && folderInfo) {
    folderInfo->SetFlags((int32_t)mFlags);
    if (db) db->Commit(nsMsgDBCommitType::kLargeCommit);

    if (mFlags & flag)
      NotifyIntPropertyChanged(kFolderFlag, mFlags & ~flag, mFlags);
    else
      NotifyIntPropertyChanged(kFolderFlag, mFlags | flag, mFlags);

    if (flag & nsMsgFolderFlags::Offline) {
      bool newValue = mFlags & nsMsgFolderFlags::Offline;
      rv = NotifyBoolPropertyChanged(kSynchronize, !newValue, !!newValue);
    } else if (flag & nsMsgFolderFlags::Elided) {
      bool newValue = mFlags & nsMsgFolderFlags::Elided;
      rv = NotifyBoolPropertyChanged(kOpen, !!newValue, !newValue);
    }
  }
  return rv;
}

NS_IMETHODIMP nsMsgDBFolder::SetFlags(uint32_t aFlags) {
  if (mFlags != aFlags) {
    uint32_t changedFlags = aFlags ^ mFlags;
    mFlags = aFlags;
    OnFlagChange(changedFlags);
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::GetFolderWithFlags(uint32_t aFlags,
                                                nsIMsgFolder** aResult) {
  if ((mFlags & aFlags) == aFlags) {
    NS_ADDREF(*aResult = this);
    return NS_OK;
  }

  nsTArray<RefPtr<nsIMsgFolder>> dummy;
  GetSubFolders(dummy);  // initialize mSubFolders

  int32_t count = mSubFolders.Count();
  *aResult = nullptr;
  for (int32_t i = 0; !*aResult && i < count; ++i)
    mSubFolders[i]->GetFolderWithFlags(aFlags, aResult);

  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::GetFoldersWithFlags(
    uint32_t aFlags, nsTArray<RefPtr<nsIMsgFolder>>& aResult) {
  aResult.Clear();

  // Ensure initialisation of mSubFolders.
  nsTArray<RefPtr<nsIMsgFolder>> dummy;
  GetSubFolders(dummy);

  if ((mFlags & aFlags) == aFlags) {
    aResult.AppendElement(this);
  }

  // Recurse down through children.
  for (nsIMsgFolder* child : mSubFolders) {
    nsTArray<RefPtr<nsIMsgFolder>> subMatches;
    child->GetFoldersWithFlags(aFlags, subMatches);
    aResult.AppendElements(subMatches);
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::IsSpecialFolder(uint32_t aFlags,
                                             bool aCheckAncestors,
                                             bool* aIsSpecial) {
  NS_ENSURE_ARG_POINTER(aIsSpecial);

  if ((mFlags & aFlags) == 0) {
    nsCOMPtr<nsIMsgFolder> parentMsgFolder;
    GetParent(getter_AddRefs(parentMsgFolder));

    if (parentMsgFolder && aCheckAncestors)
      parentMsgFolder->IsSpecialFolder(aFlags, aCheckAncestors, aIsSpecial);
    else
      *aIsSpecial = false;
  } else {
    // The user can set their INBOX to be their SENT folder.
    // in that case, we want this folder to act like an INBOX,
    // and not a SENT folder
    *aIsSpecial = !((aFlags & nsMsgFolderFlags::SentMail) &&
                    (mFlags & nsMsgFolderFlags::Inbox));
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::GetDeletable(bool* deletable) {
  NS_ENSURE_ARG_POINTER(deletable);
  *deletable = false;
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::GetDisplayRecipients(bool* displayRecipients) {
  *displayRecipients = false;
  if (mFlags & nsMsgFolderFlags::SentMail &&
      !(mFlags & nsMsgFolderFlags::Inbox))
    *displayRecipients = true;
  else if (mFlags & nsMsgFolderFlags::Queue)
    *displayRecipients = true;
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::AcquireSemaphore(nsISupports* semHolder) {
  nsresult rv = NS_OK;
  if (mSemaphoreHolder == NULL)
    mSemaphoreHolder = semHolder;  // Don't AddRef due to ownership issues.
  else
    rv = NS_MSG_FOLDER_BUSY;
  return rv;
}

NS_IMETHODIMP nsMsgDBFolder::ReleaseSemaphore(nsISupports* semHolder) {
  if (!mSemaphoreHolder || mSemaphoreHolder == semHolder)
    mSemaphoreHolder = NULL;
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::TestSemaphore(nsISupports* semHolder,
                                           bool* result) {
  NS_ENSURE_ARG_POINTER(result);
  *result = (mSemaphoreHolder == semHolder);
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::GetLocked(bool* isLocked) {
  *isLocked = mSemaphoreHolder != NULL;
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::GetRelativePathName(nsACString& pathName) {
  pathName.Truncate();
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::GetSizeOnDisk(int64_t* size) {
  NS_ENSURE_ARG_POINTER(size);
  *size = kSizeUnknown;
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::SetSizeOnDisk(int64_t aSizeOnDisk) {
  NotifyIntPropertyChanged(kFolderSize, mFolderSize, aSizeOnDisk);
  mFolderSize = aSizeOnDisk;
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::GetSizeOnDiskWithSubFolders(int64_t* sizeOnDisk) {
  NS_ENSURE_ARG_POINTER(sizeOnDisk);

  int64_t totalSize;

  // Get the size of the current folder.
  nsresult rv = GetSizeOnDisk(&totalSize);
  NS_ENSURE_SUCCESS(rv, rv);

  // Iterate over all sub-folders, and add their size to the total.
  for (auto folder : mSubFolders) {
    // Ignore virtual folders.
    uint32_t folderFlags;
    folder->GetFlags(&folderFlags);
    if (!(folderFlags & nsMsgFolderFlags::Virtual)) {
      // Get the nested size on disk for the sub-folder, so it includes any
      // sub-folder it might have.
      int64_t size;
      rv = folder->GetSizeOnDiskWithSubFolders(&size);
      NS_ENSURE_SUCCESS(rv, rv);
      totalSize += size;
    }
  }

  *sizeOnDisk = totalSize;

  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::GetUsername(nsACString& userName) {
  nsresult rv;
  nsCOMPtr<nsIMsgIncomingServer> server;
  rv = GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);
  return server->GetUsername(userName);
}

NS_IMETHODIMP nsMsgDBFolder::GetHostname(nsACString& hostName) {
  nsresult rv;
  nsCOMPtr<nsIMsgIncomingServer> server;
  rv = GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);
  return server->GetHostName(hostName);
}

NS_IMETHODIMP nsMsgDBFolder::GetNewMessages(nsIMsgWindow*,
                                            nsIUrlListener* /* aListener */) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsMsgDBFolder::GetBiffState(uint32_t* aBiffState) {
  nsCOMPtr<nsIMsgIncomingServer> server;
  nsresult rv = GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);
  return server->GetBiffState(aBiffState);
}

NS_IMETHODIMP nsMsgDBFolder::SetBiffState(uint32_t aBiffState) {
  uint32_t oldBiffState = nsMsgBiffState_Unknown;
  nsCOMPtr<nsIMsgIncomingServer> server;
  nsresult rv = GetServer(getter_AddRefs(server));
  if (NS_SUCCEEDED(rv) && server) server->GetBiffState(&oldBiffState);

  if (oldBiffState != aBiffState) {
    // Get the server and notify it and not inbox.
    if (!mIsServer) {
      nsCOMPtr<nsIMsgFolder> folder;
      rv = GetRootFolder(getter_AddRefs(folder));
      if (NS_SUCCEEDED(rv) && folder) return folder->SetBiffState(aBiffState);
    }
    if (server) server->SetBiffState(aBiffState);

    NotifyIntPropertyChanged(kBiffState, oldBiffState, aBiffState);
  } else if (aBiffState == oldBiffState &&
             aBiffState == nsMsgBiffState_NewMail) {
    // The folder has been updated, so update the MRUTime
    SetMRUTime();
    // biff is already set, but notify that there is additional new mail for the
    // folder
    NotifyIntPropertyChanged(kNewMailReceived, 0, mNumNewBiffMessages);
  } else if (aBiffState == nsMsgBiffState_NoMail) {
    // even if the old biff state equals the new biff state, it is still
    // possible that we've never cleared the number of new messages for this
    // particular folder. This happens when the new mail state got cleared by
    // viewing a new message in folder that is different from this one. Biff
    // state is stored per server
    //  the num. of new messages is per folder.
    SetNumNewMessages(0);
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::GetNumNewMessages(bool deep,
                                               int32_t* aNumNewMessages) {
  NS_ENSURE_ARG_POINTER(aNumNewMessages);

  int32_t numNewMessages = (!deep || !(mFlags & nsMsgFolderFlags::Virtual))
                               ? mNumNewBiffMessages
                               : 0;
  if (deep) {
    int32_t count = mSubFolders.Count();
    for (int32_t i = 0; i < count; i++) {
      int32_t num;
      mSubFolders[i]->GetNumNewMessages(deep, &num);
      if (num > 0)  // it's legal for counts to be negative if we don't know
        numNewMessages += num;
    }
  }
  *aNumNewMessages = numNewMessages;
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::SetNumNewMessages(int32_t aNumNewMessages) {
  if (aNumNewMessages != mNumNewBiffMessages) {
    int32_t oldNumMessages = mNumNewBiffMessages;
    mNumNewBiffMessages = aNumNewMessages;

    nsAutoCString oldNumMessagesStr;
    oldNumMessagesStr.AppendInt(oldNumMessages);
    nsAutoCString newNumMessagesStr;
    newNumMessagesStr.AppendInt(aNumNewMessages);
    NotifyPropertyChanged(kNumNewBiffMessages, oldNumMessagesStr,
                          newNumMessagesStr);
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::GetRootFolder(nsIMsgFolder** aRootFolder) {
  NS_ENSURE_ARG_POINTER(aRootFolder);
  nsresult rv;
  nsCOMPtr<nsIMsgIncomingServer> server;
  rv = GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);
  return server->GetRootMsgFolder(aRootFolder);
}

NS_IMETHODIMP
nsMsgDBFolder::SetFilePath(nsIFile* aFile) {
  mPath = aFile;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgDBFolder::GetFilePath(nsIFile** aFile) {
  NS_ENSURE_ARG_POINTER(aFile);
  nsresult rv;
  // make a new nsIFile object in case the caller
  // alters the underlying file object.
  nsCOMPtr<nsIFile> file = do_CreateInstance(NS_LOCAL_FILE_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!mPath) {
    rv = parseURI(true);
    NS_ENSURE_SUCCESS(rv, rv);
  }
  rv = file->InitWithFile(mPath);
  file.forget(aFile);
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::GetSummaryFile(nsIFile** aSummaryFile) {
  NS_ENSURE_ARG_POINTER(aSummaryFile);

  nsresult rv;
  nsCOMPtr<nsIFile> newSummaryLocation =
      do_CreateInstance(NS_LOCAL_FILE_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIFile> pathFile;
  rv = GetFilePath(getter_AddRefs(pathFile));
  NS_ENSURE_SUCCESS(rv, rv);

  newSummaryLocation->InitWithFile(pathFile);

  nsString fileName;
  rv = newSummaryLocation->GetLeafName(fileName);
  NS_ENSURE_SUCCESS(rv, rv);

  fileName.AppendLiteral(SUMMARY_SUFFIX);
  rv = newSummaryLocation->SetLeafName(fileName);
  NS_ENSURE_SUCCESS(rv, rv);

  newSummaryLocation.forget(aSummaryFile);
  return NS_OK;
}

NS_IMETHODIMP
nsMsgDBFolder::MarkMessagesRead(const nsTArray<RefPtr<nsIMsgDBHdr>>& messages,
                                bool markRead) {
  nsresult rv = GetDatabase();
  NS_ENSURE_SUCCESS(rv, rv);

  for (auto message : messages) {
    rv = message->MarkRead(markRead);
    NS_ENSURE_SUCCESS(rv, rv);
  }
  return NS_OK;
}

NS_IMETHODIMP
nsMsgDBFolder::MarkMessagesFlagged(
    const nsTArray<RefPtr<nsIMsgDBHdr>>& messages, bool markFlagged) {
  nsresult rv = GetDatabase();
  NS_ENSURE_SUCCESS(rv, rv);

  for (auto message : messages) {
    rv = message->MarkFlagged(markFlagged);
    NS_ENSURE_SUCCESS(rv, rv);
  }
  return NS_OK;
}

NS_IMETHODIMP
nsMsgDBFolder::SetJunkScoreForMessages(
    const nsTArray<RefPtr<nsIMsgDBHdr>>& aMessages,
    const nsACString& junkScore) {
  GetDatabase();
  if (mDatabase) {
    for (auto message : aMessages) {
      nsMsgKey msgKey;
      (void)message->GetMessageKey(&msgKey);
      mDatabase->SetStringProperty(msgKey, "junkscore", junkScore);
      mDatabase->SetStringProperty(msgKey, "junkscoreorigin", "filter"_ns);
    }
  }
  return NS_OK;
}

NS_IMETHODIMP
nsMsgDBFolder::ApplyRetentionSettings() { return ApplyRetentionSettings(true); }

nsresult nsMsgDBFolder::ApplyRetentionSettings(bool deleteViaFolder) {
  if (mFlags & nsMsgFolderFlags::Virtual)  // ignore virtual folders.
    return NS_OK;
  bool weOpenedDB = !mDatabase;
  nsCOMPtr<nsIMsgRetentionSettings> retentionSettings;
  nsresult rv = GetRetentionSettings(getter_AddRefs(retentionSettings));
  if (NS_SUCCEEDED(rv)) {
    nsMsgRetainByPreference retainByPreference =
        nsIMsgRetentionSettings::nsMsgRetainAll;

    retentionSettings->GetRetainByPreference(&retainByPreference);
    if (retainByPreference != nsIMsgRetentionSettings::nsMsgRetainAll) {
      rv = GetDatabase();
      NS_ENSURE_SUCCESS(rv, rv);
      if (mDatabase)
        rv = mDatabase->ApplyRetentionSettings(retentionSettings,
                                               deleteViaFolder);
    }
  }
  // we don't want applying retention settings to keep the db open, because
  // if we try to purge a bunch of folders, that will leave the dbs all open.
  // So if we opened the db, close it.
  if (weOpenedDB) CloseDBIfFolderNotOpen(false);
  return rv;
}

NS_IMETHODIMP
nsMsgDBFolder::DeleteMessages(nsTArray<RefPtr<nsIMsgDBHdr>> const& messages,
                              nsIMsgWindow* msgWindow, bool deleteStorage,
                              bool isMove, nsIMsgCopyServiceListener* listener,
                              bool allowUndo) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
nsMsgDBFolder::CopyMessages(nsIMsgFolder* srcFolder,
                            nsTArray<RefPtr<nsIMsgDBHdr>> const& messages,
                            bool isMove, nsIMsgWindow* window,
                            nsIMsgCopyServiceListener* listener, bool isFolder,
                            bool allowUndo) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
nsMsgDBFolder::CopyFolder(nsIMsgFolder* srcFolder, bool isMoveFolder,
                          nsIMsgWindow* window,
                          nsIMsgCopyServiceListener* listener) {
  NS_ASSERTION(false, "should be overridden by child class");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
nsMsgDBFolder::CopyFileMessage(nsIFile* aFile, nsIMsgDBHdr* messageToReplace,
                               bool isDraftOrTemplate, uint32_t aNewMsgFlags,
                               const nsACString& aNewMsgKeywords,
                               nsIMsgWindow* window,
                               nsIMsgCopyServiceListener* listener) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsMsgDBFolder::CopyDataToOutputStreamForAppend(
    nsIInputStream* aInStream, int32_t aLength,
    nsIOutputStream* aOutputStream) {
  if (!aInStream) return NS_OK;

  uint32_t uiWritten;
  return aOutputStream->WriteFrom(aInStream, aLength, &uiWritten);
}

NS_IMETHODIMP nsMsgDBFolder::CopyDataDone() { return NS_OK; }

#define NOTIFY_LISTENERS(propertyfunc_, params_)                       \
  PR_BEGIN_MACRO                                                       \
  nsTObserverArray<nsCOMPtr<nsIFolderListener>>::ForwardIterator iter( \
      mListeners);                                                     \
  nsCOMPtr<nsIFolderListener> listener;                                \
  while (iter.HasMore()) {                                             \
    listener = iter.GetNext();                                         \
    listener->propertyfunc_ params_;                                   \
  }                                                                    \
  PR_END_MACRO

NS_IMETHODIMP
nsMsgDBFolder::NotifyPropertyChanged(const nsACString& aProperty,
                                     const nsACString& aOldValue,
                                     const nsACString& aNewValue) {
  NOTIFY_LISTENERS(OnFolderPropertyChanged,
                   (this, aProperty, aOldValue, aNewValue));

  // Notify listeners who listen to every folder
  nsresult rv;
  nsCOMPtr<nsIFolderListener> folderListenerManager =
      do_GetService("@mozilla.org/messenger/services/session;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  return folderListenerManager->OnFolderPropertyChanged(this, aProperty,
                                                        aOldValue, aNewValue);
}

NS_IMETHODIMP
nsMsgDBFolder::NotifyUnicharPropertyChanged(const nsACString& aProperty,
                                            const nsAString& aOldValue,
                                            const nsAString& aNewValue) {
  NOTIFY_LISTENERS(OnFolderUnicharPropertyChanged,
                   (this, aProperty, aOldValue, aNewValue));

  // Notify listeners who listen to every folder
  nsresult rv;
  nsCOMPtr<nsIFolderListener> folderListenerManager =
      do_GetService("@mozilla.org/messenger/services/session;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  return folderListenerManager->OnFolderUnicharPropertyChanged(
      this, aProperty, aOldValue, aNewValue);
}

NS_IMETHODIMP
nsMsgDBFolder::NotifyIntPropertyChanged(const nsACString& aProperty,
                                        int64_t aOldValue, int64_t aNewValue) {
  // Don't send off count notifications if they are turned off.
  if (!mNotifyCountChanges && (aProperty.Equals(kTotalMessages) ||
                               aProperty.Equals(kTotalUnreadMessages)))
    return NS_OK;

  NOTIFY_LISTENERS(OnFolderIntPropertyChanged,
                   (this, aProperty, aOldValue, aNewValue));

  // Notify listeners who listen to every folder
  nsresult rv;
  nsCOMPtr<nsIFolderListener> folderListenerManager =
      do_GetService("@mozilla.org/messenger/services/session;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  return folderListenerManager->OnFolderIntPropertyChanged(
      this, aProperty, aOldValue, aNewValue);
}

NS_IMETHODIMP
nsMsgDBFolder::NotifyBoolPropertyChanged(const nsACString& aProperty,
                                         bool aOldValue, bool aNewValue) {
  NOTIFY_LISTENERS(OnFolderBoolPropertyChanged,
                   (this, aProperty, aOldValue, aNewValue));

  // Notify listeners who listen to every folder
  nsresult rv;
  nsCOMPtr<nsIFolderListener> folderListenerManager =
      do_GetService("@mozilla.org/messenger/services/session;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  return folderListenerManager->OnFolderBoolPropertyChanged(
      this, aProperty, aOldValue, aNewValue);
}

NS_IMETHODIMP
nsMsgDBFolder::NotifyPropertyFlagChanged(nsIMsgDBHdr* aItem,
                                         const nsACString& aProperty,
                                         uint32_t aOldValue,
                                         uint32_t aNewValue) {
  NOTIFY_LISTENERS(OnFolderPropertyFlagChanged,
                   (aItem, aProperty, aOldValue, aNewValue));

  // Notify listeners who listen to every folder
  nsresult rv;
  nsCOMPtr<nsIFolderListener> folderListenerManager =
      do_GetService("@mozilla.org/messenger/services/session;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  return folderListenerManager->OnFolderPropertyFlagChanged(
      aItem, aProperty, aOldValue, aNewValue);
}

NS_IMETHODIMP nsMsgDBFolder::NotifyMessageAdded(nsIMsgDBHdr* msg) {
  // Notify our directly-registered listeners.
  NOTIFY_LISTENERS(OnMessageAdded, (this, msg));
  // Notify listeners who listen to every folder
  nsresult rv;
  nsCOMPtr<nsIFolderListener> folderListenerManager =
      do_GetService("@mozilla.org/messenger/services/session;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = folderListenerManager->OnMessageAdded(this, msg);
  NS_ENSURE_SUCCESS(rv, rv);
  return NS_OK;
}

nsresult nsMsgDBFolder::NotifyMessageRemoved(nsIMsgDBHdr* msg) {
  // Notify our directly-registered listeners.
  NOTIFY_LISTENERS(OnMessageRemoved, (this, msg));
  // Notify listeners who listen to every folder
  nsresult rv;
  nsCOMPtr<nsIFolderListener> folderListenerManager =
      do_GetService("@mozilla.org/messenger/services/session;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = folderListenerManager->OnMessageRemoved(this, msg);
  NS_ENSURE_SUCCESS(rv, rv);
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::NotifyFolderAdded(nsIMsgFolder* child) {
  NOTIFY_LISTENERS(OnFolderAdded, (this, child));

  // Notify listeners who listen to every folder
  nsresult rv;
  nsCOMPtr<nsIFolderListener> folderListenerManager =
      do_GetService("@mozilla.org/messenger/services/session;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  return folderListenerManager->OnFolderAdded(this, child);
}

nsresult nsMsgDBFolder::NotifyFolderRemoved(nsIMsgFolder* child) {
  NOTIFY_LISTENERS(OnFolderRemoved, (this, child));

  // Notify listeners who listen to every folder
  nsresult rv;
  nsCOMPtr<nsIFolderListener> folderListenerManager =
      do_GetService("@mozilla.org/messenger/services/session;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  return folderListenerManager->OnFolderRemoved(this, child);
}

nsresult nsMsgDBFolder::NotifyFolderEvent(const nsACString& aEvent) {
  NOTIFY_LISTENERS(OnFolderEvent, (this, aEvent));

  // Notify listeners who listen to every folder
  nsresult rv;
  nsCOMPtr<nsIFolderListener> folderListenerManager =
      do_GetService("@mozilla.org/messenger/services/session;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  return folderListenerManager->OnFolderEvent(this, aEvent);
}

NS_IMETHODIMP
nsMsgDBFolder::GetFilterList(nsIMsgWindow* aMsgWindow,
                             nsIMsgFilterList** aResult) {
  nsCOMPtr<nsIMsgIncomingServer> server;
  nsresult rv = GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);
  return server->GetFilterList(aMsgWindow, aResult);
}

NS_IMETHODIMP
nsMsgDBFolder::SetFilterList(nsIMsgFilterList* aFilterList) {
  nsCOMPtr<nsIMsgIncomingServer> server;
  nsresult rv = GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);
  return server->SetFilterList(aFilterList);
}

NS_IMETHODIMP
nsMsgDBFolder::GetEditableFilterList(nsIMsgWindow* aMsgWindow,
                                     nsIMsgFilterList** aResult) {
  NS_ENSURE_ARG_POINTER(aResult);
  nsCOMPtr<nsIMsgIncomingServer> server;
  nsresult rv = GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);
  return server->GetEditableFilterList(aMsgWindow, aResult);
}

NS_IMETHODIMP
nsMsgDBFolder::SetEditableFilterList(nsIMsgFilterList* aFilterList) {
  nsCOMPtr<nsIMsgIncomingServer> server;
  nsresult rv = GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);
  return server->SetEditableFilterList(aFilterList);
}

/* void enableNotifications (in long notificationType, in boolean enable); */
NS_IMETHODIMP nsMsgDBFolder::EnableNotifications(int32_t notificationType,
                                                 bool enable) {
  if (notificationType == nsIMsgFolder::allMessageCountNotifications) {
    mNotifyCountChanges = enable;
    if (enable) {
      UpdateSummaryTotals(true);
    }
    return NS_OK;
  }
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsMsgDBFolder::GetMessageHeader(nsMsgKey msgKey,
                                              nsIMsgDBHdr** aMsgHdr) {
  NS_ENSURE_ARG_POINTER(aMsgHdr);
  nsCOMPtr<nsIMsgDatabase> database;
  nsresult rv = GetMsgDatabase(getter_AddRefs(database));
  NS_ENSURE_SUCCESS(rv, rv);
  return (database) ? database->GetMsgHdrForKey(msgKey, aMsgHdr)
                    : NS_ERROR_FAILURE;
}

NS_IMETHODIMP nsMsgDBFolder::GetDescendants(
    nsTArray<RefPtr<nsIMsgFolder>>& aDescendants) {
  aDescendants.Clear();
  for (nsIMsgFolder* child : mSubFolders) {
    aDescendants.AppendElement(child);
    nsTArray<RefPtr<nsIMsgFolder>> grandchildren;
    child->GetDescendants(grandchildren);
    aDescendants.AppendElements(grandchildren);
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::GetBaseMessageURI(nsACString& baseMessageURI) {
  if (mBaseMessageURI.IsEmpty()) return NS_ERROR_FAILURE;
  baseMessageURI = mBaseMessageURI;
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::GetUriForMsg(nsIMsgDBHdr* msgHdr,
                                          nsACString& aURI) {
  NS_ENSURE_ARG(msgHdr);
  nsMsgKey msgKey;
  msgHdr->GetMessageKey(&msgKey);
  nsAutoCString uri;
  uri.Assign(mBaseMessageURI);

  // append a "#" followed by the message key.
  uri.Append('#');
  uri.AppendInt(msgKey);
  aURI = uri;
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::GenerateMessageURI(nsMsgKey msgKey,
                                                nsACString& aURI) {
  nsCString uri;
  nsresult rv = GetBaseMessageURI(uri);
  NS_ENSURE_SUCCESS(rv, rv);

  // append a "#" followed by the message key.
  uri.Append('#');
  uri.AppendInt(msgKey);
  aURI = uri;
  return NS_OK;
}

nsresult nsMsgDBFolder::GetBaseStringBundle(nsIStringBundle** aBundle) {
  NS_ENSURE_ARG_POINTER(aBundle);
  nsCOMPtr<nsIStringBundleService> bundleService =
      mozilla::components::StringBundle::Service();
  NS_ENSURE_TRUE(bundleService, NS_ERROR_UNEXPECTED);
  nsCOMPtr<nsIStringBundle> bundle;
  bundleService->CreateBundle("chrome://messenger/locale/messenger.properties",
                              getter_AddRefs(bundle));
  bundle.forget(aBundle);
  return NS_OK;
}

// Do not use this routine if you have to call it very often because
// it creates a new bundle each time
nsresult nsMsgDBFolder::GetStringFromBundle(const char* msgName,
                                            nsString& aResult) {
  nsresult rv;
  nsCOMPtr<nsIStringBundle> bundle;
  rv = GetBaseStringBundle(getter_AddRefs(bundle));
  if (NS_SUCCEEDED(rv) && bundle)
    rv = bundle->GetStringFromName(msgName, aResult);
  return rv;
}

nsresult nsMsgDBFolder::ThrowConfirmationPrompt(nsIMsgWindow* msgWindow,
                                                const nsAString& confirmString,
                                                bool* confirmed) {
  if (msgWindow) {
    nsCOMPtr<nsIDocShell> docShell;
    msgWindow->GetRootDocShell(getter_AddRefs(docShell));
    if (docShell) {
      nsCOMPtr<nsIPrompt> dialog(do_GetInterface(docShell));
      if (dialog && !confirmString.IsEmpty())
        dialog->Confirm(nullptr, nsString(confirmString).get(), confirmed);
    }
  }
  return NS_OK;
}

NS_IMETHODIMP
nsMsgDBFolder::GetStringWithFolderNameFromBundle(const char* msgName,
                                                 nsAString& aResult) {
  nsCOMPtr<nsIStringBundle> bundle;
  nsresult rv = GetBaseStringBundle(getter_AddRefs(bundle));
  if (NS_SUCCEEDED(rv) && bundle) {
    nsString folderName;
    GetName(folderName);
    AutoTArray<nsString, 2> formatStrings = {folderName,
                                             kLocalizedBrandShortName};
    nsString resultStr;
    rv = bundle->FormatStringFromName(msgName, formatStrings, resultStr);
    if (NS_SUCCEEDED(rv)) aResult.Assign(resultStr);
  }
  return rv;
}

NS_IMETHODIMP nsMsgDBFolder::ConfirmFolderDeletionForFilter(
    nsIMsgWindow* msgWindow, bool* confirmed) {
  nsString confirmString;
  nsresult rv = GetStringWithFolderNameFromBundle(
      "confirmFolderDeletionForFilter", confirmString);
  NS_ENSURE_SUCCESS(rv, rv);
  return ThrowConfirmationPrompt(msgWindow, confirmString, confirmed);
}

NS_IMETHODIMP nsMsgDBFolder::ThrowAlertMsg(const char* msgName,
                                           nsIMsgWindow* msgWindow) {
  if (!msgWindow) {
    return NS_OK;
  }

  nsCOMPtr<nsIStringBundle> bundle;
  nsresult rv = GetBaseStringBundle(getter_AddRefs(bundle));
  NS_ENSURE_SUCCESS(rv, rv);

  // Assemble a pretty folder identifier including its path, e.g.
  // "Inbox/Subfolder on bob@example.com".
  nsAutoString ident;
  nsAutoString folderPath;
  GetPrettyPath(folderPath);
  nsAutoString serverName;
  nsCOMPtr<nsIMsgIncomingServer> server;
  if (NS_SUCCEEDED(GetServer(getter_AddRefs(server)))) {
    server->GetPrettyName(serverName);
    bundle->FormatStringFromName("verboseFolderFormat",
                                 {folderPath, serverName}, ident);
  }
  if (ident.IsEmpty()) {
    ident = folderPath;  // Fallback, just in case.
  }

  // Format the actual error message (NOTE: not all error messages use the
  // params - extra values are just ignored).
  nsAutoString alertString;
  rv = bundle->FormatStringFromName(msgName, {ident, kLocalizedBrandShortName},
                                    alertString);
  NS_ENSURE_SUCCESS(rv, rv);

  // Include the folder identifier in the alert title for good measure,
  // because not all the error messages include the folder.
  nsAutoString title;
  bundle->FormatStringFromName("folderErrorAlertTitle", {ident}, title);

  nsCOMPtr<mozIDOMWindowProxy> domWindow;
  rv = msgWindow->GetDomWindow(getter_AddRefs(domWindow));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIPromptService> dlgService(
      do_GetService(NS_PROMPTSERVICE_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  return dlgService->Alert(domWindow, title.IsEmpty() ? nullptr : title.get(),
                           alertString.get());
}

NS_IMETHODIMP nsMsgDBFolder::AlertFilterChanged(nsIMsgWindow* msgWindow) {
  NS_ENSURE_ARG(msgWindow);
  nsresult rv = NS_OK;
  bool checkBox = false;
  GetWarnFilterChanged(&checkBox);
  if (!checkBox) {
    nsCOMPtr<nsIDocShell> docShell;
    msgWindow->GetRootDocShell(getter_AddRefs(docShell));
    nsString alertString;
    rv = GetStringFromBundle("alertFilterChanged", alertString);
    nsString alertCheckbox;
    rv = GetStringFromBundle("alertFilterCheckbox", alertCheckbox);
    if (!alertString.IsEmpty() && !alertCheckbox.IsEmpty() && docShell) {
      nsCOMPtr<nsIPrompt> dialog(do_GetInterface(docShell));
      if (dialog) {
        dialog->AlertCheck(nullptr, alertString.get(), alertCheckbox.get(),
                           &checkBox);
        SetWarnFilterChanged(checkBox);
      }
    }
  }
  return rv;
}

nsresult nsMsgDBFolder::GetWarnFilterChanged(bool* aVal) {
  NS_ENSURE_ARG(aVal);
  nsresult rv;
  nsCOMPtr<nsIPrefBranch> prefBranch =
      do_GetService(NS_PREFSERVICE_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = prefBranch->GetBoolPref(PREF_MAIL_WARN_FILTER_CHANGED, aVal);
  if (NS_FAILED(rv)) *aVal = false;
  return NS_OK;
}

nsresult nsMsgDBFolder::SetWarnFilterChanged(bool aVal) {
  nsresult rv = NS_OK;
  nsCOMPtr<nsIPrefBranch> prefBranch =
      do_GetService(NS_PREFSERVICE_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  return prefBranch->SetBoolPref(PREF_MAIL_WARN_FILTER_CHANGED, aVal);
}

NS_IMETHODIMP nsMsgDBFolder::NotifyCompactCompleted() {
  NS_ASSERTION(false, "should be overridden by child class");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsMsgDBFolder::CloseDBIfFolderNotOpen(bool aForceClosed) {
  nsresult rv;
  nsCOMPtr<nsIMsgMailSession> session =
      do_GetService("@mozilla.org/messenger/services/session;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  bool folderOpen;
  session->IsFolderOpenInWindow(this, &folderOpen);
  if (!folderOpen &&
      !(mFlags & (nsMsgFolderFlags::Trash | nsMsgFolderFlags::Inbox))) {
    if (aForceClosed && mDatabase) mDatabase->ForceClosed();
    SetMsgDatabase(nullptr);
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::SetSortOrder(int32_t order) {
  NS_ASSERTION(false, "not implemented");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsMsgDBFolder::GetSortOrder(int32_t* order) {
  NS_ENSURE_ARG_POINTER(order);

  uint32_t flags;
  nsresult rv = GetFlags(&flags);
  NS_ENSURE_SUCCESS(rv, rv);

  if (flags & nsMsgFolderFlags::Inbox)
    *order = 0;
  else if (flags & nsMsgFolderFlags::Drafts)
    *order = 1;
  else if (flags & nsMsgFolderFlags::Templates)
    *order = 2;
  else if (flags & nsMsgFolderFlags::SentMail)
    *order = 3;
  else if (flags & nsMsgFolderFlags::Archive)
    *order = 4;
  else if (flags & nsMsgFolderFlags::Junk)
    *order = 5;
  else if (flags & nsMsgFolderFlags::Trash)
    *order = 6;
  else if (flags & nsMsgFolderFlags::Virtual)
    *order = 7;
  else if (flags & nsMsgFolderFlags::Queue)
    *order = 8;
  else
    *order = 9;

  return NS_OK;
}

// static Helper function for CompareSortKeys().
// Builds a collation key for a given folder based on "{sortOrder}{name}"
nsresult nsMsgDBFolder::BuildFolderSortKey(nsIMsgFolder* aFolder,
                                           nsTArray<uint8_t>& aKey) {
  aKey.Clear();
  int32_t order;
  nsresult rv = aFolder->GetSortOrder(&order);
  NS_ENSURE_SUCCESS(rv, rv);
  nsAutoString orderString;
  orderString.AppendInt(order);
  nsString folderName;
  rv = aFolder->GetName(folderName);
  NS_ENSURE_SUCCESS(rv, rv);
  orderString.Append(folderName);
  NS_ENSURE_TRUE(gCollationKeyGenerator, NS_ERROR_NULL_POINTER);

  nsTArrayU8Buffer buffer(aKey);

  auto result = gCollationKeyGenerator->GetSortKey(orderString, buffer);
  NS_ENSURE_TRUE(result.isOk(), NS_ERROR_FAILURE);

  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::CompareSortKeys(nsIMsgFolder* aFolder,
                                             int32_t* sortOrder) {
  nsTArray<uint8_t> sortKey1;
  nsTArray<uint8_t> sortKey2;
  nsresult rv = BuildFolderSortKey(this, sortKey1);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = BuildFolderSortKey(aFolder, sortKey2);
  NS_ENSURE_SUCCESS(rv, rv);
  *sortOrder = gCollationKeyGenerator->CompareSortKeys(sortKey1, sortKey2);
  return rv;
}

NS_IMETHODIMP nsMsgDBFolder::FetchMsgPreviewText(
    nsTArray<nsMsgKey> const& aKeysToFetch, nsIUrlListener* aUrlListener,
    bool* aAsyncResults) {
  NS_ENSURE_ARG_POINTER(aAsyncResults);
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsMsgDBFolder::GetMsgTextFromStream(
    nsIInputStream* stream, const nsACString& aCharset, uint32_t bytesToRead,
    uint32_t aMaxOutputLen, bool aCompressQuotes, bool aStripHTMLTags,
    nsACString& aContentType, nsACString& aMsgText) {
  /*
     1. non mime message - the message body starts after the blank line
        following the headers.
     2. mime message, multipart/alternative - we could simply scan for the
        boundary line, advance past its headers, and treat the next few lines
        as the text.
     3. mime message, text/plain - body follows headers
     4. multipart/mixed - scan past boundary, treat next part as body.
   */

  UniquePtr<nsLineBuffer<char>> lineBuffer(new nsLineBuffer<char>);

  nsAutoCString msgText;
  nsAutoString contentType;
  nsAutoString encoding;
  nsAutoCString curLine;
  nsAutoCString charset(aCharset);

  // might want to use a state var instead of bools.
  bool msgBodyIsHtml = false;
  bool more = true;
  bool reachedEndBody = false;
  bool isBase64 = false;
  bool inMsgBody = false;
  bool justPassedEndBoundary = false;

  uint32_t bytesRead = 0;

  nsresult rv;

  // Both are used to extract data from the headers
  nsCOMPtr<nsIMimeHeaders> mimeHeaders(
      do_CreateInstance(NS_IMIMEHEADERS_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIMIMEHeaderParam> mimeHdrParam(
      do_GetService(NS_MIMEHEADERPARAM_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  // Stack of boundaries, used to figure out where we are
  nsTArray<nsCString> boundaryStack;

  while (!inMsgBody && bytesRead <= bytesToRead) {
    nsAutoCString msgHeaders;
    // We want to NS_ReadLine until we get to a blank line (the end of the
    // headers)
    while (more) {
      rv = NS_ReadLine(stream, lineBuffer.get(), curLine, &more);
      NS_ENSURE_SUCCESS(rv, rv);
      if (curLine.IsEmpty()) break;
      msgHeaders.Append(curLine);
      msgHeaders.AppendLiteral("\r\n");
      bytesRead += curLine.Length();
      if (bytesRead > bytesToRead) break;
    }

    // There's no point in processing if we can't get the body
    if (bytesRead > bytesToRead) break;

    // Process the headers, looking for things we need
    rv = mimeHeaders->Initialize(msgHeaders);
    NS_ENSURE_SUCCESS(rv, rv);

    nsAutoCString contentTypeHdr;
    mimeHeaders->ExtractHeader("Content-Type", false, contentTypeHdr);

    // Get the content type
    // If we don't have a content type, then we assign text/plain
    // this is in violation of the RFC for multipart/digest, though
    // Also, if we've just passed an end boundary, we're going to ignore this.
    if (!justPassedEndBoundary && contentTypeHdr.IsEmpty())
      contentType.AssignLiteral(u"text/plain");
    else
      mimeHdrParam->GetParameter(contentTypeHdr, nullptr, EmptyCString(), false,
                                 nullptr, contentType);

    justPassedEndBoundary = false;

    // If we are multipart, then we need to get the boundary
    if (StringBeginsWith(contentType, u"multipart/"_ns,
                         nsCaseInsensitiveStringComparator)) {
      nsAutoString boundaryParam;
      mimeHdrParam->GetParameter(contentTypeHdr, "boundary", EmptyCString(),
                                 false, nullptr, boundaryParam);
      if (!boundaryParam.IsEmpty()) {
        nsAutoCString boundary("--"_ns);
        boundary.Append(NS_ConvertUTF16toUTF8(boundaryParam));
        boundaryStack.AppendElement(boundary);
      }
    }

    // If we are message/rfc822, then there's another header block coming up
    else if (contentType.LowerCaseEqualsLiteral("message/rfc822"))
      continue;

    // If we are a text part, then we want it
    else if (StringBeginsWith(contentType, u"text/"_ns,
                              nsCaseInsensitiveStringComparator)) {
      inMsgBody = true;

      if (contentType.LowerCaseEqualsLiteral("text/html")) msgBodyIsHtml = true;

      // Also get the charset if required
      if (charset.IsEmpty()) {
        nsAutoString charsetW;
        mimeHdrParam->GetParameter(contentTypeHdr, "charset", EmptyCString(),
                                   false, nullptr, charsetW);
        charset.Assign(NS_ConvertUTF16toUTF8(charsetW));
      }

      // Finally, get the encoding
      nsAutoCString encodingHdr;
      mimeHeaders->ExtractHeader("Content-Transfer-Encoding", false,
                                 encodingHdr);
      if (!encodingHdr.IsEmpty())
        mimeHdrParam->GetParameter(encodingHdr, nullptr, EmptyCString(), false,
                                   nullptr, encoding);

      if (encoding.LowerCaseEqualsLiteral(ENCODING_BASE64)) isBase64 = true;
    }

    // We need to consume the rest, until the next headers
    uint32_t count = boundaryStack.Length();
    nsAutoCString boundary;
    nsAutoCString endBoundary;
    if (count) {
      boundary.Assign(boundaryStack.ElementAt(count - 1));
      endBoundary.Assign(boundary);
      endBoundary.AppendLiteral("--");
    }
    while (more) {
      rv = NS_ReadLine(stream, lineBuffer.get(), curLine, &more);
      NS_ENSURE_SUCCESS(rv, rv);

      if (count) {
        // If we've reached a MIME final delimiter, pop and break
        if (StringBeginsWith(curLine, endBoundary)) {
          if (inMsgBody) reachedEndBody = true;
          boundaryStack.RemoveElementAt(count - 1);
          justPassedEndBoundary = true;
          break;
        }
        // If we've reached the end of this MIME part, we can break
        if (StringBeginsWith(curLine, boundary)) {
          if (inMsgBody) reachedEndBody = true;
          break;
        }
      }

      // Only append the text if we're actually in the message body
      if (inMsgBody) {
        msgText.Append(curLine);
        if (!isBase64) msgText.AppendLiteral("\r\n");
      }

      bytesRead += curLine.Length();
      if (bytesRead > bytesToRead) break;
    }
  }
  lineBuffer.reset();

  // if the snippet is encoded, decode it
  if (!encoding.IsEmpty())
    decodeMsgSnippet(NS_ConvertUTF16toUTF8(encoding), !reachedEndBody, msgText);

  // In order to turn our snippet into unicode, we need to convert it from the
  // charset we detected earlier.
  nsString unicodeMsgBodyStr;
  nsMsgI18NConvertToUnicode(charset, msgText, unicodeMsgBodyStr);

  // now we've got a msg body. If it's html, convert it to plain text.
  if (msgBodyIsHtml && aStripHTMLTags)
    ConvertMsgSnippetToPlainText(unicodeMsgBodyStr, unicodeMsgBodyStr);

  // We want to remove any whitespace from the beginning and end of the string
  unicodeMsgBodyStr.Trim(" \t\r\n", true, true);

  // step 3, optionally remove quoted text from the snippet
  nsString compressedQuotesMsgStr;
  if (aCompressQuotes)
    compressQuotesInMsgSnippet(unicodeMsgBodyStr, compressedQuotesMsgStr);

  // now convert back to utf-8 which is more convenient for storage
  CopyUTF16toUTF8(aCompressQuotes ? compressedQuotesMsgStr : unicodeMsgBodyStr,
                  aMsgText);

  // finally, truncate the string based on aMaxOutputLen
  if (aMsgText.Length() > aMaxOutputLen) {
    if (NS_IsAscii(aMsgText.BeginReading()))
      aMsgText.SetLength(aMaxOutputLen);
    else
      nsMsgI18NShrinkUTF8Str(aMsgText, aMaxOutputLen, aMsgText);
  }

  // Also assign the content type being returned
  aContentType.Assign(NS_ConvertUTF16toUTF8(contentType));
  return rv;
}

/**
 * decodeMsgSnippet - helper function which applies the appropriate transfer
 * decoding to the message snippet based on aEncodingType. Currently handles
 * base64 and quoted-printable. If aEncodingType refers to an encoding we
 * don't handle, the message data is passed back unmodified.
 * @param aEncodingType  the encoding type (base64, quoted-printable)
 * @param aIsComplete    the snippet is actually the entire message so the
 *                       decoder doesn't have to worry about partial data
 * @param aMsgSnippet in/out argument. The encoded msg snippet and then the
 *                                     decoded snippet
 */
void nsMsgDBFolder::decodeMsgSnippet(const nsACString& aEncodingType,
                                     bool aIsComplete, nsCString& aMsgSnippet) {
  if (aEncodingType.LowerCaseEqualsLiteral(ENCODING_BASE64)) {
    int32_t base64Len = aMsgSnippet.Length();
    if (aIsComplete) base64Len -= base64Len % 4;
    char* decodedBody = PL_Base64Decode(aMsgSnippet.get(), base64Len, nullptr);
    if (decodedBody) aMsgSnippet.Adopt(decodedBody);
  } else if (aEncodingType.LowerCaseEqualsLiteral(ENCODING_QUOTED_PRINTABLE)) {
    MsgStripQuotedPrintable(aMsgSnippet);
  }
}

/**
 * stripQuotesFromMsgSnippet - Reduces quoted reply text including the citation
 * (Scott wrote:) from the message snippet to " ... ". Assumes the snippet has
 * been decoded and converted to plain text.
 * @param aMsgSnippet in/out argument. The string to strip quotes from.
 */
void nsMsgDBFolder::compressQuotesInMsgSnippet(const nsString& aMsgSnippet,
                                               nsAString& aCompressedQuotes) {
  int32_t msgBodyStrLen = aMsgSnippet.Length();
  bool lastLineWasAQuote = false;
  int32_t offset = 0;
  int32_t lineFeedPos = 0;
  while (offset < msgBodyStrLen) {
    lineFeedPos = aMsgSnippet.FindChar('\n', offset);
    if (lineFeedPos != -1) {
      const nsAString& currentLine =
          Substring(aMsgSnippet, offset, lineFeedPos - offset);
      // this catches quoted text ("> "), nested quotes of any level (">> ",
      // ">>> ", ...) it also catches empty line quoted text (">"). It might be
      // over aggressive and require tweaking later. Try to strip the citation.
      // If the current line ends with a ':' and the next line looks like a
      // quoted reply (starts with a ">") skip the current line
      if (StringBeginsWith(currentLine, u">"_ns) ||
          (lineFeedPos + 1 < msgBodyStrLen && lineFeedPos &&
           aMsgSnippet[lineFeedPos - 1] == char16_t(':') &&
           aMsgSnippet[lineFeedPos + 1] == char16_t('>'))) {
        lastLineWasAQuote = true;
      } else if (!currentLine.IsEmpty()) {
        if (lastLineWasAQuote) {
          aCompressedQuotes += u" ... "_ns;
          lastLineWasAQuote = false;
        }

        aCompressedQuotes += currentLine;
        // Don't forget to substitute a space for the line feed.
        aCompressedQuotes += char16_t(' ');
      }

      offset = lineFeedPos + 1;
    } else {
      aCompressedQuotes.Append(
          Substring(aMsgSnippet, offset, msgBodyStrLen - offset));
      break;
    }
  }
}

NS_IMETHODIMP nsMsgDBFolder::ConvertMsgSnippetToPlainText(
    const nsAString& aMessageText, nsAString& aOutText) {
  uint32_t flags = nsIDocumentEncoder::OutputLFLineBreak |
                   nsIDocumentEncoder::OutputNoScriptContent |
                   nsIDocumentEncoder::OutputNoFramesContent |
                   nsIDocumentEncoder::OutputBodyOnly;
  nsCOMPtr<nsIParserUtils> utils = do_GetService(NS_PARSERUTILS_CONTRACTID);
  return utils->ConvertToPlainText(aMessageText, flags, 80, aOutText);
}

nsresult nsMsgDBFolder::GetMsgPreviewTextFromStream(nsIMsgDBHdr* msgHdr,
                                                    nsIInputStream* stream) {
  nsCString msgBody;
  nsAutoCString charset;
  msgHdr->GetCharset(getter_Copies(charset));
  nsAutoCString contentType;
  nsresult rv = GetMsgTextFromStream(stream, charset, 4096, 255, true, true,
                                     contentType, msgBody);
  // replaces all tabs and line returns with a space,
  // then trims off leading and trailing white space
  msgBody.CompressWhitespace();
  msgHdr->SetStringProperty("preview", msgBody);
  return rv;
}

void nsMsgDBFolder::UpdateTimestamps(bool allowUndo) {
  if (!(mFlags & (nsMsgFolderFlags::Trash | nsMsgFolderFlags::Junk))) {
    SetMRUTime();
    NotifyFolderEvent(kMRUTimeChanged);
    if (allowUndo)  // This is a proxy for a user-initiated act.
    {
      bool isArchive;
      IsSpecialFolder(nsMsgFolderFlags::Archive, true, &isArchive);
      if (!isArchive) {
        SetMRMTime();
        NotifyFolderEvent(kMRMTimeChanged);
      }
    }
  }
}

void nsMsgDBFolder::SetMRUTime() {
  uint32_t seconds;
  PRTime2Seconds(PR_Now(), &seconds);
  nsAutoCString nowStr;
  nowStr.AppendInt(seconds);
  SetStringProperty(MRU_TIME_PROPERTY, nowStr);
}

void nsMsgDBFolder::SetMRMTime() {
  uint32_t seconds;
  PRTime2Seconds(PR_Now(), &seconds);
  nsAutoCString nowStr;
  nowStr.AppendInt(seconds);
  SetStringProperty(MRM_TIME_PROPERTY, nowStr);
}

NS_IMETHODIMP nsMsgDBFolder::AddKeywordsToMessages(
    const nsTArray<RefPtr<nsIMsgDBHdr>>& aMessages,
    const nsACString& aKeywords) {
  nsresult rv = NS_OK;
  GetDatabase();
  if (mDatabase) {
    nsCString keywords;

    for (auto message : aMessages) {
      message->GetStringProperty("keywords", keywords);
      nsTArray<nsCString> keywordArray;
      ParseString(aKeywords, ' ', keywordArray);
      uint32_t addCount = 0;
      for (uint32_t j = 0; j < keywordArray.Length(); j++) {
        int32_t start, length;
        if (!MsgFindKeyword(keywordArray[j], keywords, &start, &length)) {
          if (!keywords.IsEmpty()) keywords.Append(' ');
          keywords.Append(keywordArray[j]);
          addCount++;
        }
      }
      // avoid using the message key to set the string property, because
      // in the case of filters running on incoming pop3 mail with quarantining
      // turned on, the message key is wrong.
      mDatabase->SetStringPropertyByHdr(message, "keywords", keywords);

      if (addCount) NotifyPropertyFlagChanged(message, kKeywords, 0, addCount);
    }
  }
  return rv;
}

NS_IMETHODIMP nsMsgDBFolder::RemoveKeywordsFromMessages(
    const nsTArray<RefPtr<nsIMsgDBHdr>>& aMessages,
    const nsACString& aKeywords) {
  nsresult rv = NS_OK;
  GetDatabase();
  if (mDatabase) {
    NS_ENSURE_SUCCESS(rv, rv);
    nsTArray<nsCString> keywordArray;
    ParseString(aKeywords, ' ', keywordArray);
    nsCString keywords;
    // If the tag is also a label, we should remove the label too...

    for (auto message : aMessages) {
      rv = message->GetStringProperty("keywords", keywords);
      uint32_t removeCount = 0;
      for (uint32_t j = 0; j < keywordArray.Length(); j++) {
        int32_t startOffset, length;
        if (MsgFindKeyword(keywordArray[j], keywords, &startOffset, &length)) {
          // delete any leading space delimiters
          while (startOffset && keywords.CharAt(startOffset - 1) == ' ') {
            startOffset--;
            length++;
          }
          // but if the keyword is at the start then delete the following space
          if (!startOffset &&
              length < static_cast<int32_t>(keywords.Length()) &&
              keywords.CharAt(length) == ' ')
            length++;
          keywords.Cut(startOffset, length);
          removeCount++;
        }
      }

      if (removeCount) {
        mDatabase->SetStringPropertyByHdr(message, "keywords", keywords);
        NotifyPropertyFlagChanged(message, kKeywords, removeCount, 0);
      }
    }
  }
  return rv;
}

NS_IMETHODIMP nsMsgDBFolder::GetCustomIdentity(nsIMsgIdentity** aIdentity) {
  NS_ENSURE_ARG_POINTER(aIdentity);
  *aIdentity = nullptr;
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::GetProcessingFlags(nsMsgKey aKey,
                                                uint32_t* aFlags) {
  NS_ENSURE_ARG_POINTER(aFlags);
  *aFlags = 0;
  for (uint32_t i = 0; i < nsMsgProcessingFlags::NumberOfFlags; i++)
    if (mProcessingFlag[i].keys && mProcessingFlag[i].keys->IsMember(aKey))
      *aFlags |= mProcessingFlag[i].bit;
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::OrProcessingFlags(nsMsgKey aKey, uint32_t mask) {
  for (uint32_t i = 0; i < nsMsgProcessingFlags::NumberOfFlags; i++)
    if (mProcessingFlag[i].bit & mask && mProcessingFlag[i].keys)
      mProcessingFlag[i].keys->Add(aKey);
  return NS_OK;
}

NS_IMETHODIMP nsMsgDBFolder::AndProcessingFlags(nsMsgKey aKey, uint32_t mask) {
  for (uint32_t i = 0; i < nsMsgProcessingFlags::NumberOfFlags; i++)
    if (!(mProcessingFlag[i].bit & mask) && mProcessingFlag[i].keys)
      mProcessingFlag[i].keys->Remove(aKey);
  return NS_OK;
}

// Each implementation must provide an override of this, connecting the folder
// type to the corresponding incoming server type.
NS_IMETHODIMP nsMsgDBFolder::GetIncomingServerType(
    nsACString& aIncomingServerType) {
  NS_ASSERTION(false, "subclasses need to override this");
  return NS_ERROR_NOT_IMPLEMENTED;
}

void nsMsgDBFolder::ClearProcessingFlags() {
  for (uint32_t i = 0; i < nsMsgProcessingFlags::NumberOfFlags; i++) {
    // There is no clear method so we need to delete and re-create.
    delete mProcessingFlag[i].keys;
    mProcessingFlag[i].keys = nsMsgKeySetU::Create();
  }
}

nsresult nsMsgDBFolder::MessagesInKeyOrder(
    nsTArray<nsMsgKey> const& aKeyArray, nsIMsgFolder* srcFolder,
    nsTArray<RefPtr<nsIMsgDBHdr>>& messages) {
  messages.Clear();
  messages.SetCapacity(aKeyArray.Length());

  nsCOMPtr<nsIDBFolderInfo> folderInfo;
  nsCOMPtr<nsIMsgDatabase> db;
  nsresult rv = srcFolder->GetDBFolderInfoAndDB(getter_AddRefs(folderInfo),
                                                getter_AddRefs(db));
  if (NS_SUCCEEDED(rv) && db) {
    for (auto key : aKeyArray) {
      nsCOMPtr<nsIMsgDBHdr> msgHdr;
      rv = db->GetMsgHdrForKey(key, getter_AddRefs(msgHdr));
      NS_ENSURE_SUCCESS(rv, rv);
      if (msgHdr) messages.AppendElement(msgHdr);
    }
  }
  return rv;
}

/* static */ nsMsgKeySetU* nsMsgKeySetU::Create() {
  nsMsgKeySetU* set = new nsMsgKeySetU;
  if (set) {
    set->loKeySet = nsMsgKeySet::Create();
    set->hiKeySet = nsMsgKeySet::Create();
    if (!(set->loKeySet && set->hiKeySet)) {
      delete set;
      set = nullptr;
    }
  }
  return set;
}

nsMsgKeySetU::nsMsgKeySetU() : hiKeySet(nullptr) {}

nsMsgKeySetU::~nsMsgKeySetU() {}

const uint32_t kLowerBits = 0x7fffffff;

int nsMsgKeySetU::Add(nsMsgKey aKey) {
  int32_t intKey = static_cast<int32_t>(aKey);
  if (intKey >= 0) return loKeySet->Add(intKey);
  return hiKeySet->Add(intKey & kLowerBits);
}

int nsMsgKeySetU::Remove(nsMsgKey aKey) {
  int32_t intKey = static_cast<int32_t>(aKey);
  if (intKey >= 0) return loKeySet->Remove(intKey);
  return hiKeySet->Remove(intKey & kLowerBits);
}

bool nsMsgKeySetU::IsMember(nsMsgKey aKey) {
  int32_t intKey = static_cast<int32_t>(aKey);
  if (intKey >= 0) return loKeySet->IsMember(intKey);
  return hiKeySet->IsMember(intKey & kLowerBits);
}

nsresult nsMsgKeySetU::ToMsgKeyArray(nsTArray<nsMsgKey>& aArray) {
  nsresult rv = loKeySet->ToMsgKeyArray(aArray);
  NS_ENSURE_SUCCESS(rv, rv);
  return hiKeySet->ToMsgKeyArray(aArray);
}
