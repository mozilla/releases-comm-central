/* -*- Mode:
 C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "msgCore.h"
#include "CopyMessageStreamListener.h"
#include "nsIAutoSyncManager.h"
#include "nsIStringStream.h"
#include "prmem.h"
#include "nsImapMailFolder.h"
#include "nsIDBFolderInfo.h"
#include "nsIImapService.h"
#include "nsIFile.h"
#include "nsAnonymousTemporaryFile.h"
#include "nsIUrlListener.h"
#include "nsCOMPtr.h"
#include "nsMsgFolderFlags.h"
#include "nsIImapUrl.h"
#include "nsImapUtils.h"
#include "nsMsgUtils.h"
#include "nsIMsgMailSession.h"
#include "nsITransactionManager.h"
#include "nsImapUndoTxn.h"
#include "../public/nsIImapHostSessionList.h"
#include "nsIMsgCopyService.h"
#include "nsImapStringBundle.h"
#include "nsIMsgFolderCacheElement.h"
#include "nsTextFormatter.h"
#include "nsIPrefBranch.h"
#include "nsIPrefService.h"
#include "nsMsgI18N.h"
#include "nsIMsgFilter.h"
#include "nsIMsgFilterService.h"
#include "nsIMsgSearchCustomTerm.h"
#include "nsIMsgSearchTerm.h"
#include "nsImapMoveCoalescer.h"
#include "nsIPrompt.h"
#include "nsIDocShell.h"
#include "nsUnicharUtils.h"
#include "nsIImapFlagAndUidState.h"
#include "nsIImapHeaderXferInfo.h"
#include "nsIMessenger.h"
#include "nsIMsgSearchAdapter.h"
#include "nsIImapMockChannel.h"
#include "nsIProgressEventSink.h"
#include "nsIMsgWindow.h"
#include "nsIMsgFolder.h"  // TO include biffState enum. Change to bool later...
#include "nsIMsgLocalMailFolder.h"
#include "nsIMsgOfflineImapOperation.h"
#include "nsImapOfflineSync.h"
#include "nsIImapMailFolderSink.h"
#include "nsIImapServerSink.h"
#include "nsIMsgAccountManager.h"
#include "nsIImapMockChannel.h"
#include "nsNetUtil.h"
#include "nsImapNamespace.h"
#include "FolderCompactor.h"
#include "nsMsgMessageFlags.h"
#include "nsISpamSettings.h"
#include <time.h>
#include "nsIMsgMailNewsUrl.h"
#include "nsIMsgComposeService.h"
#include "nsIMsgIdentity.h"
#include "nsIMsgFolderNotificationService.h"
#include "nsIExternalProtocolService.h"
#include "nsCExternalHandlerService.h"
#include "prprf.h"
#include "nsIMsgFilterCustomAction.h"
#include "nsStringEnumerator.h"
#include "nsIMsgStatusFeedback.h"
#include "nsMsgLineBuffer.h"
#include "mozilla/Logging.h"
#include "mozilla/ScopeExit.h"
#include "nsIStreamListener.h"
#include "nsITimer.h"
#include "nsReadableUtils.h"
#include "UrlListener.h"
#include "nsIObserverService.h"
#include "nsIPropertyBag2.h"

#define NS_PARSEMAILMSGSTATE_CID                   \
  { /* 2B79AC51-1459-11d3-8097-006008128C4E */     \
    0x2b79ac51, 0x1459, 0x11d3, {                  \
      0x80, 0x97, 0x0, 0x60, 0x8, 0x12, 0x8c, 0x4e \
    }                                              \
  }
static NS_DEFINE_CID(kParseMailMsgStateCID, NS_PARSEMAILMSGSTATE_CID);

#define NS_IIMAPHOSTSESSIONLIST_CID                  \
  {                                                  \
    0x479ce8fc, 0xe725, 0x11d2, {                    \
      0xa5, 0x05, 0x00, 0x60, 0xb0, 0xfc, 0x04, 0xb7 \
    }                                                \
  }
static NS_DEFINE_CID(kCImapHostSessionList, NS_IIMAPHOSTSESSIONLIST_CID);

#define MAILNEWS_CUSTOM_HEADERS "mailnews.customHeaders"

using namespace mozilla;

extern LazyLogModule gAutoSyncLog;  // defined in nsAutoSyncManager.cpp
extern LazyLogModule IMAP;          // defined in nsImapProtocol.cpp
extern LazyLogModule IMAP_CS;  // For CONDSTORE, defined in nsImapProtocol.cpp
extern LazyLogModule FILTERLOGMODULE;  // defined in nsMsgFilterService.cpp
LazyLogModule IMAP_KW("IMAP_KW");      // for logging keyword (tag) processing

/*
    Copies the contents of srcDir into destDir.
    destDir will be created if it doesn't exist.
*/

static nsresult RecursiveCopy(nsIFile* srcDir, nsIFile* destDir) {
  bool isDir;
  nsresult rv = srcDir->IsDirectory(&isDir);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!isDir) return NS_ERROR_INVALID_ARG;

  bool exists;
  rv = destDir->Exists(&exists);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!exists) {
    rv = destDir->Create(nsIFile::DIRECTORY_TYPE, 0775);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  nsCOMPtr<nsIDirectoryEnumerator> dirIterator;
  rv = srcDir->GetDirectoryEntries(getter_AddRefs(dirIterator));
  NS_ENSURE_SUCCESS(rv, rv);

  bool hasMore = false;
  while (NS_SUCCEEDED(dirIterator->HasMoreElements(&hasMore)) && hasMore) {
    nsCOMPtr<nsIFile> dirEntry;
    rv = dirIterator->GetNextFile(getter_AddRefs(dirEntry));
    NS_ENSURE_SUCCESS(rv, rv);
    if (!dirEntry) continue;
    rv = dirEntry->IsDirectory(&isDir);
    NS_ENSURE_SUCCESS(rv, rv);
    if (isDir) {
      nsCOMPtr<nsIFile> newChild;
      rv = destDir->Clone(getter_AddRefs(newChild));
      NS_ENSURE_SUCCESS(rv, rv);
      nsAutoString leafName;
      dirEntry->GetLeafName(leafName);
      newChild->AppendRelativePath(leafName);
      rv = newChild->Exists(&exists);
      NS_ENSURE_SUCCESS(rv, rv);
      if (!exists) {
        rv = newChild->Create(nsIFile::DIRECTORY_TYPE, 0775);
        NS_ENSURE_SUCCESS(rv, rv);
      }
      rv = RecursiveCopy(dirEntry, newChild);
    } else {
      rv = dirEntry->CopyTo(destDir, EmptyString());
    }
    NS_ENSURE_SUCCESS(rv, rv);
  }
  return rv;
}

//
//  nsMsgQuota
//
NS_IMPL_ISUPPORTS(nsMsgQuota, nsIMsgQuota)

nsMsgQuota::nsMsgQuota(const nsACString& aName, const uint64_t& aUsage,
                       const uint64_t& aLimit)
    : mName(aName), mUsage(aUsage), mLimit(aLimit) {}

nsMsgQuota::~nsMsgQuota() {}

/**
 * Note: These quota access function are not called but still must be defined
 * for the linker.
 */
NS_IMETHODIMP nsMsgQuota::GetName(nsACString& aName) {
  aName = mName;
  return NS_OK;
}

NS_IMETHODIMP nsMsgQuota::SetName(const nsACString& aName) {
  mName = aName;
  return NS_OK;
}

NS_IMETHODIMP nsMsgQuota::GetUsage(uint64_t* aUsage) {
  *aUsage = mUsage;
  return NS_OK;
}

NS_IMETHODIMP nsMsgQuota::SetUsage(uint64_t aUsage) {
  mUsage = aUsage;
  return NS_OK;
}

NS_IMETHODIMP nsMsgQuota::GetLimit(uint64_t* aLimit) {
  *aLimit = mLimit;
  return NS_OK;
}

NS_IMETHODIMP nsMsgQuota::SetLimit(uint64_t aLimit) {
  mLimit = aLimit;
  return NS_OK;
}

//
//  nsImapMailFolder
//
nsImapMailFolder::nsImapMailFolder()
    : m_initialized(false),
      m_haveDiscoveredAllFolders(false),
      m_curMsgUid(0),
      m_previousHighestUid(0),
      m_nextMessageByteLength(0),
      m_urlRunning(false),
      m_verifiedAsOnlineFolder(false),
      m_explicitlyVerify(false),
      m_folderIsNamespace(false),
      m_folderNeedsSubscribing(false),
      m_folderNeedsAdded(false),
      m_folderNeedsACLListed(true),
      m_performingBiff(false),
      m_updatingFolder(false),
      m_applyIncomingFilters(false),
      m_downloadingFolderForOfflineUse(false),
      m_filterListRequiresBody(false),
      m_folderQuotaCommandIssued(false),
      m_folderQuotaDataIsValid(false) {
  m_boxFlags = 0;
  m_uidValidity = kUidUnknown;
  m_numServerRecentMessages = 0;
  m_numServerUnseenMessages = 0;
  m_numServerTotalMessages = 0;
  m_nextUID = nsMsgKey_None;
  m_hierarchyDelimiter = kOnlineHierarchySeparatorUnknown;
  m_folderACL = nullptr;
  m_aclFlags = 0;
  m_supportedUserFlags = 0;
  m_namespace = nullptr;
  m_pendingPlaybackReq = nullptr;
}

nsImapMailFolder::~nsImapMailFolder() {
  delete m_folderACL;

  // cleanup any pending request
  delete m_pendingPlaybackReq;
}

NS_IMPL_ADDREF_INHERITED(nsImapMailFolder, nsMsgDBFolder)
NS_IMPL_RELEASE_INHERITED(nsImapMailFolder, nsMsgDBFolder)
NS_IMPL_QUERY_HEAD(nsImapMailFolder)
NS_IMPL_QUERY_BODY(nsIMsgImapMailFolder)
NS_IMPL_QUERY_BODY(nsICopyMessageListener)
NS_IMPL_QUERY_BODY(nsIImapMailFolderSink)
NS_IMPL_QUERY_BODY(nsIImapMessageSink)
NS_IMPL_QUERY_BODY(nsIUrlListener)
NS_IMPL_QUERY_BODY(nsIMsgFilterHitNotify)
NS_IMPL_QUERY_TAIL_INHERITING(nsMsgDBFolder)

nsresult nsImapMailFolder::AddDirectorySeparator(nsIFile* path) {
  if (mURI.Equals(kImapRootURI)) {
    // don't concat the full separator with .sbd
  } else {
    // see if there's a dir with the same name ending with .sbd
    nsAutoString leafName;
    path->GetLeafName(leafName);
    leafName.AppendLiteral(FOLDER_SUFFIX);
    path->SetLeafName(leafName);
  }

  return NS_OK;
}

static bool nsShouldIgnoreFile(nsString& name) {
  if (StringEndsWith(name, NS_LITERAL_STRING_FROM_CSTRING(SUMMARY_SUFFIX),
                     nsCaseInsensitiveStringComparator)) {
    name.SetLength(name.Length() -
                   SUMMARY_SUFFIX_LENGTH);  // truncate the string
    return false;
  }
  return true;
}

NS_IMETHODIMP nsImapMailFolder::AddSubfolder(const nsAString& aName,
                                             nsIMsgFolder** aChild) {
  NS_ENSURE_ARG_POINTER(aChild);

  int32_t flags = 0;
  nsresult rv;

  nsAutoCString uri(mURI);
  uri.Append('/');

  nsAutoCString escapedName;
  rv = NS_MsgEscapeEncodeURLPath(aName, escapedName);
  NS_ENSURE_SUCCESS(rv, rv);

  uri += escapedName.get();

  nsCOMPtr<nsIMsgFolder> msgFolder;
  rv = GetChildWithURI(uri, false /*deep*/, true /*case Insensitive*/,
                       getter_AddRefs(msgFolder));
  if (NS_SUCCEEDED(rv) && msgFolder) return NS_MSG_FOLDER_EXISTS;

  nsCOMPtr<nsIMsgFolder> folder;
  rv = GetOrCreateFolder(uri, getter_AddRefs(folder));
  NS_ENSURE_SUCCESS(rv, NS_ERROR_FAILURE);

  // Ensure the containing dir exists.
  nsCOMPtr<nsIFile> path;
  rv = CreateDirectoryForFolder(getter_AddRefs(path));
  NS_ENSURE_SUCCESS(rv, rv);

  folder->GetFlags((uint32_t*)&flags);

  flags |= nsMsgFolderFlags::Mail;

  nsCOMPtr<nsIImapIncomingServer> imapServer;
  GetImapIncomingServer(getter_AddRefs(imapServer));
  if (imapServer) {
    bool setNewFoldersForOffline = false;
    rv = imapServer->GetOfflineDownload(&setNewFoldersForOffline);
    if (NS_SUCCEEDED(rv) && setNewFoldersForOffline)
      flags |= nsMsgFolderFlags::Offline;
  }

  folder->SetParent(this);

  folder->SetFlags(flags);

  mSubFolders.AppendObject(folder);
  folder.forget(aChild);

  // New child needs to inherit hierarchyDelimiter.
  nsCOMPtr<nsIMsgImapMailFolder> imapChild = do_QueryInterface(*aChild);
  if (imapChild) {
    imapChild->SetHierarchyDelimiter(m_hierarchyDelimiter);
  }
  NotifyFolderAdded(*aChild);
  return rv;
}

// Creates a new child nsIMsgFolder locally, with no IMAP traffic.
nsresult nsImapMailFolder::AddSubfolderWithPath(nsAString& name,
                                                nsIFile* dbPath,
                                                nsIMsgFolder** child,
                                                bool brandNew) {
  NS_ENSURE_ARG_POINTER(child);
  nsresult rv;

  nsAutoCString uri(mURI);
  uri.Append('/');
  AppendUTF16toUTF8(name, uri);

  bool isServer;
  rv = GetIsServer(&isServer);
  NS_ENSURE_SUCCESS(rv, rv);

  bool isInbox = isServer && name.LowerCaseEqualsLiteral("inbox");

  // will make sure mSubFolders does not have duplicates because of bogus msf
  // files.
  nsCOMPtr<nsIMsgFolder> msgFolder;
  rv = GetChildWithURI(uri, false /*deep*/, isInbox /*case Insensitive*/,
                       getter_AddRefs(msgFolder));
  if (NS_SUCCEEDED(rv) && msgFolder) return NS_MSG_FOLDER_EXISTS;

  nsCOMPtr<nsIMsgFolder> folder;
  rv = GetOrCreateFolder(uri, getter_AddRefs(folder));
  NS_ENSURE_SUCCESS(rv, rv);

  folder->SetFilePath(dbPath);
  nsCOMPtr<nsIMsgImapMailFolder> imapFolder = do_QueryInterface(folder, &rv);
  mozilla::Unused << imapFolder;
  NS_ENSURE_SUCCESS(rv, rv);

  uint32_t flags = 0;
  folder->GetFlags(&flags);

  folder->SetParent(this);
  flags |= nsMsgFolderFlags::Mail;

  uint32_t pFlags;
  GetFlags(&pFlags);
  bool isParentInbox = pFlags & nsMsgFolderFlags::Inbox;

  nsCOMPtr<nsIImapIncomingServer> imapServer;
  rv = GetImapIncomingServer(getter_AddRefs(imapServer));
  NS_ENSURE_SUCCESS(rv, rv);

  // Only set these if these are top level children or parent is inbox
  if (isInbox)
    flags |= nsMsgFolderFlags::Inbox;
  else if (isServer || isParentInbox) {
    nsMsgImapDeleteModel deleteModel;
    imapServer->GetDeleteModel(&deleteModel);
    if (deleteModel == nsMsgImapDeleteModels::MoveToTrash) {
      nsAutoString trashName;
      GetTrashFolderName(trashName);
      if (name.Equals(trashName)) flags |= nsMsgFolderFlags::Trash;
    }
  }

  // Make the folder offline if it is newly created and the offline_download
  // pref is true, unless it's the Trash or Junk folder.
  if (brandNew &&
      !(flags & (nsMsgFolderFlags::Trash | nsMsgFolderFlags::Junk))) {
    bool setNewFoldersForOffline = false;
    rv = imapServer->GetOfflineDownload(&setNewFoldersForOffline);
    if (NS_SUCCEEDED(rv) && setNewFoldersForOffline)
      flags |= nsMsgFolderFlags::Offline;
  }

  folder->SetFlags(flags);

  if (folder) mSubFolders.AppendObject(folder);
  folder.forget(child);
  return NS_OK;
}

// Create child nsIMsgFolders by scanning the filesystem to find .msf files.
// No IMAP traffic.
nsresult nsImapMailFolder::CreateSubFolders(nsIFile* path) {
  nsresult rv = NS_OK;
  nsCOMPtr<nsIMsgIncomingServer> server;
  rv = GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIDirectoryEnumerator> directoryEnumerator;
  rv = path->GetDirectoryEntries(getter_AddRefs(directoryEnumerator));
  NS_ENSURE_SUCCESS(rv, rv);

  // For each .msf file in the directory...
  bool hasMore = false;
  while (NS_SUCCEEDED(directoryEnumerator->HasMoreElements(&hasMore)) &&
         hasMore) {
    nsCOMPtr<nsIFile> currentFolderPath;
    rv = directoryEnumerator->GetNextFile(getter_AddRefs(currentFolderPath));
    if (NS_FAILED(rv) || !currentFolderPath) continue;

    nsAutoString currentFolderNameStr;    // online name
    nsAutoString currentFolderDBNameStr;  // possibly munged name
    currentFolderPath->GetLeafName(currentFolderNameStr);
    // Skip if not an .msf file.
    // (NOTE: nsShouldIgnoreFile() strips the trailing ".msf" here)
    if (nsShouldIgnoreFile(currentFolderNameStr)) continue;

    // OK, here we need to get the online name from the folder cache if we can.
    // If we can, use that to create the sub-folder
    nsCOMPtr<nsIFile> curFolder =
        do_CreateInstance(NS_LOCAL_FILE_CONTRACTID, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    nsCOMPtr<nsIFile> dbFile = do_CreateInstance(NS_LOCAL_FILE_CONTRACTID, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    dbFile->InitWithFile(currentFolderPath);
    curFolder->InitWithFile(currentFolderPath);
    // don't strip off the .msf in currentFolderPath.
    currentFolderPath->SetLeafName(currentFolderNameStr);
    currentFolderDBNameStr = currentFolderNameStr;
    nsAutoString utfLeafName = currentFolderNameStr;

    if (curFolder) {
      nsCOMPtr<nsIMsgFolderCacheElement> cacheElement;
      rv = GetFolderCacheElemFromFile(dbFile, getter_AddRefs(cacheElement));
      if (NS_SUCCEEDED(rv) && cacheElement) {
        nsCString onlineFullUtfName;

        uint32_t folderFlags;
        rv = cacheElement->GetCachedUInt32("flags", &folderFlags);
        if (NS_SUCCEEDED(rv) &&
            folderFlags & nsMsgFolderFlags::Virtual)  // ignore virtual folders
          continue;
        int32_t hierarchyDelimiter;
        rv = cacheElement->GetCachedInt32("hierDelim", &hierarchyDelimiter);
        if (NS_SUCCEEDED(rv) &&
            hierarchyDelimiter == kOnlineHierarchySeparatorUnknown) {
          currentFolderPath->Remove(false);
          continue;  // blow away .msf files for folders with unknown delimiter.
        }
        rv = cacheElement->GetCachedString("onlineName", onlineFullUtfName);
        if (NS_SUCCEEDED(rv) && !onlineFullUtfName.IsEmpty()) {
          CopyFolderNameToUTF16(onlineFullUtfName, currentFolderNameStr);
          char delimiter = 0;
          GetHierarchyDelimiter(&delimiter);
          int32_t leafPos = currentFolderNameStr.RFindChar(delimiter);
          if (leafPos > 0) currentFolderNameStr.Cut(0, leafPos + 1);

          // Take the full online name, and determine the leaf name.
          CopyUTF8toUTF16(onlineFullUtfName, utfLeafName);
          leafPos = utfLeafName.RFindChar(delimiter);
          if (leafPos > 0) utfLeafName.Cut(0, leafPos + 1);
        }
      }
    }
    // make the imap folder remember the file spec it was created with.
    nsCOMPtr<nsIFile> msfFilePath =
        do_CreateInstance(NS_LOCAL_FILE_CONTRACTID, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    msfFilePath->InitWithFile(currentFolderPath);
    if (NS_SUCCEEDED(rv) && msfFilePath) {
      // leaf name is the db name w/o .msf (nsShouldIgnoreFile strips it off)
      // so this trims the .msf off the file spec.
      msfFilePath->SetLeafName(currentFolderDBNameStr);
    }
    // Use the name as the uri for the folder.
    nsCOMPtr<nsIMsgFolder> child;
    AddSubfolderWithPath(utfLeafName, msfFilePath, getter_AddRefs(child));
    if (child) {
      // use the unicode name as the "pretty" name. Set it so it won't be
      // automatically computed from the URI.
      if (!currentFolderNameStr.IsEmpty())
        child->SetPrettyName(currentFolderNameStr);
      child->SetMsgDatabase(nullptr);
    }
  }
  return rv;
}

NS_IMETHODIMP nsImapMailFolder::GetSubFolders(
    nsTArray<RefPtr<nsIMsgFolder>>& folders) {
  bool isServer;
  nsresult rv = GetIsServer(&isServer);
  NS_ENSURE_SUCCESS(rv, rv);

  if (!m_initialized) {
    nsCOMPtr<nsIFile> pathFile;
    rv = GetFilePath(getter_AddRefs(pathFile));
    if (NS_FAILED(rv)) return rv;

    // host directory does not need .sbd tacked on
    if (!isServer) {
      rv = AddDirectorySeparator(pathFile);
      if (NS_FAILED(rv)) return rv;
    }

    m_initialized = true;  // need to set this here to avoid infinite recursion
                           // from CreateSubfolders.
    // we have to treat the root folder specially, because it's name
    // doesn't end with .sbd

    int32_t newFlags = nsMsgFolderFlags::Mail;
    bool isDirectory = false;
    pathFile->IsDirectory(&isDirectory);
    if (isDirectory) {
      newFlags |= (nsMsgFolderFlags::Directory | nsMsgFolderFlags::Elided);
      if (!mIsServer) SetFlag(newFlags);
      rv = CreateSubFolders(pathFile);
    }
    if (isServer) {
      nsCOMPtr<nsIMsgFolder> inboxFolder;

      GetFolderWithFlags(nsMsgFolderFlags::Inbox, getter_AddRefs(inboxFolder));
      if (!inboxFolder) {
        // create an inbox if we don't have one.
        CreateClientSubfolderInfo("INBOX"_ns, kOnlineHierarchySeparatorUnknown,
                                  0, true);
      }
    }

    // Force initialisation recursively.
    for (nsIMsgFolder* f : mSubFolders) {
      nsTArray<RefPtr<nsIMsgFolder>> dummy;
      rv = f->GetSubFolders(dummy);
      if (NS_FAILED(rv)) {
        break;
      }
    }

    UpdateSummaryTotals(false);
    if (NS_FAILED(rv)) return rv;
  }

  return nsMsgDBFolder::GetSubFolders(folders);
}

// Makes sure the database is open and exists.  If the database is valid then
// returns NS_OK.  Otherwise returns a failure error value.
nsresult nsImapMailFolder::GetDatabase() {
  nsresult rv = NS_OK;
  if (!mDatabase) {
    nsCOMPtr<nsIMsgDBService> msgDBService =
        do_GetService("@mozilla.org/msgDatabase/msgDBService;1", &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    // Create the database, blowing it away if it needs to be rebuilt
    rv = msgDBService->OpenFolderDB(this, false, getter_AddRefs(mDatabase));
    if (NS_FAILED(rv))
      rv = msgDBService->CreateNewDB(this, getter_AddRefs(mDatabase));

    NS_ENSURE_SUCCESS(rv, rv);

    // UpdateNewMessages/UpdateSummaryTotals can null mDatabase, so we save a
    // local copy
    nsCOMPtr<nsIMsgDatabase> database(mDatabase);
    UpdateNewMessages();
    if (mAddListener) database->AddListener(this);
    UpdateSummaryTotals(true);
    mDatabase = database;
  }
  return rv;
}

NS_IMETHODIMP nsImapMailFolder::UpdateFolder(nsIMsgWindow* inMsgWindow) {
  return UpdateFolderWithListener(inMsgWindow, nullptr);
}

NS_IMETHODIMP nsImapMailFolder::UpdateFolderWithListener(
    nsIMsgWindow* aMsgWindow, nsIUrlListener* aUrlListener) {
  nsresult rv;
  // If this is the inbox, filters will be applied. Otherwise, we test the
  // inherited folder property "applyIncomingFilters" (which defaults to empty).
  // If this inherited property has the string value "true", we will apply
  // filters even if this is not the inbox folder.
  nsCString applyIncomingFilters;
  GetInheritedStringProperty("applyIncomingFilters", applyIncomingFilters);
  m_applyIncomingFilters = applyIncomingFilters.EqualsLiteral("true");

  nsString folderName;
  GetPrettyName(folderName);
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Debug,
          ("(Imap) nsImapMailFolder::UpdateFolderWithListener() on folder '%s'",
           NS_ConvertUTF16toUTF8(folderName).get()));
  if (mFlags & nsMsgFolderFlags::Inbox || m_applyIncomingFilters) {
    MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
            ("(Imap) Preparing filter run on folder '%s'",
             NS_ConvertUTF16toUTF8(folderName).get()));

    if (!m_filterList) {
      rv = GetFilterList(aMsgWindow, getter_AddRefs(m_filterList));
      if (NS_FAILED(rv)) {
        MOZ_LOG(FILTERLOGMODULE, LogLevel::Error,
                ("(Imap) Loading of filter list failed"));
      }
    }

    // if there's no msg window, but someone is updating the inbox, we're
    // doing something biff-like, and may download headers, so make biff notify.
    if (!aMsgWindow && mFlags & nsMsgFolderFlags::Inbox)
      SetPerformingBiff(true);
  }

  if (m_filterList) {
    nsCString listId;
    m_filterList->GetListId(listId);
    MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
            ("(Imap) Preparing filter list %s", listId.get()));
    nsCOMPtr<nsIMsgIncomingServer> server;
    rv = GetServer(getter_AddRefs(server));
    NS_ENSURE_SUCCESS(rv, rv);

    bool canFileMessagesOnServer = true;
    rv = server->GetCanFileMessagesOnServer(&canFileMessagesOnServer);
    // the mdn filter is for filing return receipts into the sent folder
    // some servers (like AOL mail servers)
    // can't file to the sent folder, so we don't add the filter for those
    // servers
    if (canFileMessagesOnServer) {
      rv = server->ConfigureTemporaryFilters(m_filterList);
      NS_ENSURE_SUCCESS(rv, rv);
    }

    // If a body filter is enabled for an offline folder, delay the filter
    // application until after message has been downloaded.
    m_filterListRequiresBody = false;

    if (mFlags & nsMsgFolderFlags::Offline) {
      nsCOMPtr<nsIMsgFilterService> filterService =
          do_GetService("@mozilla.org/messenger/services/filters;1", &rv);
      uint32_t filterCount = 0;
      m_filterList->GetFilterCount(&filterCount);
      for (uint32_t index = 0; index < filterCount && !m_filterListRequiresBody;
           ++index) {
        nsCOMPtr<nsIMsgFilter> filter;
        m_filterList->GetFilterAt(index, getter_AddRefs(filter));
        if (!filter) continue;
        nsMsgFilterTypeType filterType;
        filter->GetFilterType(&filterType);
        if (!(filterType & nsMsgFilterType::Incoming)) continue;
        bool enabled = false;
        filter->GetEnabled(&enabled);
        if (!enabled) continue;
        nsTArray<RefPtr<nsIMsgSearchTerm>> searchTerms;
        filter->GetSearchTerms(searchTerms);
        for (nsIMsgSearchTerm* term : searchTerms) {
          nsMsgSearchAttribValue attrib;
          rv = term->GetAttrib(&attrib);
          NS_ENSURE_SUCCESS(rv, rv);
          if (attrib == nsMsgSearchAttrib::Body)
            m_filterListRequiresBody = true;
          else if (attrib == nsMsgSearchAttrib::Custom) {
            nsAutoCString customId;
            rv = term->GetCustomId(customId);
            nsCOMPtr<nsIMsgSearchCustomTerm> customTerm;
            if (NS_SUCCEEDED(rv) && filterService)
              rv = filterService->GetCustomTerm(customId,
                                                getter_AddRefs(customTerm));
            bool needsBody = false;
            if (NS_SUCCEEDED(rv) && customTerm)
              rv = customTerm->GetNeedsBody(&needsBody);
            if (NS_SUCCEEDED(rv) && needsBody) m_filterListRequiresBody = true;
          }
          if (m_filterListRequiresBody) {
            break;
          }
        }

        // Also check if filter actions need the body, as this
        // is supported in custom actions.
        uint32_t numActions = 0;
        filter->GetActionCount(&numActions);
        for (uint32_t actionIndex = 0;
             actionIndex < numActions && !m_filterListRequiresBody;
             actionIndex++) {
          nsCOMPtr<nsIMsgRuleAction> action;
          rv = filter->GetActionAt(actionIndex, getter_AddRefs(action));
          if (NS_FAILED(rv) || !action) continue;

          nsCOMPtr<nsIMsgFilterCustomAction> customAction;
          rv = action->GetCustomAction(getter_AddRefs(customAction));
          if (NS_FAILED(rv) || !customAction) continue;

          bool needsBody = false;
          customAction->GetNeedsBody(&needsBody);
          if (needsBody) m_filterListRequiresBody = true;
        }
      }
    }
    MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
            ("(Imap) Filters require the message body: %s",
             (m_filterListRequiresBody ? "true" : "false")));
  }

  bool isServer;
  rv = GetIsServer(&isServer);
  if (NS_SUCCEEDED(rv) && isServer) {
    if (!m_haveDiscoveredAllFolders) {
      bool hasSubFolders = false;
      GetHasSubFolders(&hasSubFolders);
      if (!hasSubFolders) {
        rv = CreateClientSubfolderInfo(
            "Inbox"_ns, kOnlineHierarchySeparatorUnknown, 0, false);
        NS_ENSURE_SUCCESS(rv, rv);
      }
      m_haveDiscoveredAllFolders = true;
    }
  }

  rv = GetDatabase();
  if (NS_FAILED(rv)) {
    ThrowAlertMsg("errorGettingDB", aMsgWindow);
    return rv;
  }

  bool hasOfflineEvents = false;
  GetFlag(nsMsgFolderFlags::OfflineEvents, &hasOfflineEvents);

  if (!WeAreOffline()) {
    if (hasOfflineEvents) {
      // hold a reference to the offline sync object. If ProcessNextOperation
      // runs a url, a reference will be added to it. Otherwise, it will get
      // destroyed when the refptr goes out of scope.
      RefPtr<nsImapOfflineSync> goOnline = new nsImapOfflineSync();
      goOnline->Init(aMsgWindow, this, this, false);
      if (goOnline) {
        m_urlListener = aUrlListener;
        return goOnline->ProcessNextOperation();
      }
    }
  }

  // Check it we're password protecting the local store.
  if (!PromptForMasterPasswordIfNecessary()) return NS_ERROR_FAILURE;

  bool canOpenThisFolder = true;
  GetCanOpenFolder(&canOpenThisFolder);
  // Don't run select if we can't select the folder...
  if (!m_urlRunning && canOpenThisFolder && !isServer) {
    nsCOMPtr<nsIImapService> imapService =
        do_GetService("@mozilla.org/messenger/imapservice;1", &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    /* Do a discovery in its own url if needed. Do before SELECT url. */
    nsCOMPtr<nsIImapHostSessionList> hostSession =
        do_GetService(kCImapHostSessionList, &rv);
    if (NS_SUCCEEDED(rv) && hostSession) {
      bool foundMailboxesAlready = false;
      nsCString serverKey;
      GetServerKey(serverKey);
      hostSession->GetHaveWeEverDiscoveredFoldersForHost(serverKey.get(),
                                                         foundMailboxesAlready);
      if (!foundMailboxesAlready) {
        bool discoveryInProgress = false;
        // See if discovery in progress and not yet finished.
        hostSession->GetDiscoveryForHostInProgress(serverKey.get(),
                                                   discoveryInProgress);
        if (!discoveryInProgress) {
          nsCOMPtr<nsIMsgFolder> rootFolder;
          rv = GetRootFolder(getter_AddRefs(rootFolder));
          if (NS_SUCCEEDED(rv) && rootFolder) {
            rv = imapService->DiscoverAllFolders(rootFolder, this, aMsgWindow);
            if (NS_SUCCEEDED(rv))
              hostSession->SetDiscoveryForHostInProgress(serverKey.get(), true);
          }
        }
      }
    }

    nsCOMPtr<nsIURI> url;
    rv = imapService->SelectFolder(this, m_urlListener, aMsgWindow,
                                   getter_AddRefs(url));
    if (NS_SUCCEEDED(rv)) {
      m_urlRunning = true;
      m_updatingFolder = true;
    }
    if (url) {
      nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl = do_QueryInterface(url, &rv);
      NS_ENSURE_SUCCESS(rv, rv);
      mailnewsUrl->RegisterListener(this);
      m_urlListener = aUrlListener;
    }

    // Allow IMAP folder auto-compact to occur when online or offline.
    if (aMsgWindow) AutoCompact(aMsgWindow);

    if (rv == NS_MSG_ERROR_OFFLINE || rv == NS_BINDING_ABORTED) {
      rv = NS_OK;
      NotifyFolderEvent(kFolderLoaded);
    }
  } else {
    // Tell the front end that the folder is loaded if we're not going to
    // actually run a url.
    if (!m_updatingFolder)  // if we're already running an update url, we'll let
                            // that one send the folder loaded
      NotifyFolderEvent(kFolderLoaded);
  }
  return rv;
}

NS_IMETHODIMP nsImapMailFolder::CreateSubfolder(const nsAString& folderName,
                                                nsIMsgWindow* msgWindow) {
  if (folderName.IsEmpty()) return NS_MSG_ERROR_INVALID_FOLDER_NAME;

  nsresult rv;
  nsAutoString trashName;
  GetTrashFolderName(trashName);
  if (folderName.Equals(trashName))  // Trash , a special folder
  {
    ThrowAlertMsg("folderExists", msgWindow);
    return NS_MSG_FOLDER_EXISTS;
  }
  if (mIsServer &&
      folderName.LowerCaseEqualsLiteral("inbox"))  // Inbox, a special folder
  {
    ThrowAlertMsg("folderExists", msgWindow);
    return NS_MSG_FOLDER_EXISTS;
  }

  nsCOMPtr<nsIImapService> imapService =
      do_GetService("@mozilla.org/messenger/imapservice;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIURI> url;
  return imapService->CreateFolder(this, folderName, this, getter_AddRefs(url));
}

// Path coming in is the root path without the leaf name,
// on the way out, it's the whole path.
nsresult nsImapMailFolder::CreateFileForDB(const nsAString& userLeafName,
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

NS_IMETHODIMP nsImapMailFolder::CreateClientSubfolderInfo(
    const nsACString& folderName, char hierarchyDelimiter, int32_t flags,
    bool suppressNotification) {
  nsresult rv = NS_OK;

  // Get a directory based on our current path.
  nsCOMPtr<nsIFile> path;
  rv = CreateDirectoryForFolder(getter_AddRefs(path));
  if (NS_FAILED(rv)) return rv;

  NS_ConvertUTF8toUTF16 leafName(folderName);
  nsAutoString folderNameStr;
  nsAutoString parentName = leafName;
  // use RFind, because folder can start with a delimiter and
  // not be a leaf folder.
  int32_t folderStart = leafName.RFindChar('/');
  if (folderStart > 0) {
    nsCOMPtr<nsIMsgImapMailFolder> imapFolder;
    nsAutoCString uri(mURI);
    leafName.Assign(Substring(parentName, folderStart + 1));
    parentName.SetLength(folderStart);

    rv = CreateDirectoryForFolder(getter_AddRefs(path));
    NS_ENSURE_SUCCESS(rv, rv);
    uri.Append('/');
    uri.Append(NS_ConvertUTF16toUTF8(parentName));
    nsCOMPtr<nsIMsgFolder> folder;
    rv = GetOrCreateFolder(uri, getter_AddRefs(folder));
    NS_ENSURE_SUCCESS(rv, rv);
    imapFolder = do_QueryInterface(folder, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    nsAutoCString leafnameC;
    CopyUTF16toUTF8(leafName, leafnameC);
    return imapFolder->CreateClientSubfolderInfo(leafnameC, hierarchyDelimiter,
                                                 flags, suppressNotification);
  }

  // if we get here, it's really a leaf, and "this" is the parent.
  folderNameStr = leafName;

  // Create an empty database for this mail folder, set its name from the user
  nsCOMPtr<nsIMsgDatabase> mailDBFactory;
  nsCOMPtr<nsIMsgFolder> child;

  nsCOMPtr<nsIMsgDBService> msgDBService =
      do_GetService("@mozilla.org/msgDatabase/msgDBService;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIMsgDatabase> unusedDB;
  nsCOMPtr<nsIFile> dbFile;

  // warning, path will be changed
  rv = CreateFileForDB(folderNameStr, path, getter_AddRefs(dbFile));
  NS_ENSURE_SUCCESS(rv, rv);

  // Now let's create the actual new folder
  rv = AddSubfolderWithPath(folderNameStr, dbFile, getter_AddRefs(child), true);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = msgDBService->OpenMailDBFromFile(dbFile, child, true, true,
                                        getter_AddRefs(unusedDB));
  if (rv == NS_MSG_ERROR_FOLDER_SUMMARY_MISSING) rv = NS_OK;

  if (NS_SUCCEEDED(rv) && unusedDB) {
    // need to set the folder name
    nsCOMPtr<nsIDBFolderInfo> folderInfo;
    rv = unusedDB->GetDBFolderInfo(getter_AddRefs(folderInfo));
    nsCOMPtr<nsIMsgImapMailFolder> imapFolder = do_QueryInterface(child, &rv);
    if (NS_SUCCEEDED(rv)) {
      nsAutoCString onlineName(m_onlineFolderName);
      if (!onlineName.IsEmpty()) onlineName.Append(hierarchyDelimiter);
      onlineName.Append(NS_ConvertUTF16toUTF8(folderNameStr));
      imapFolder->SetVerifiedAsOnlineFolder(true);
      imapFolder->SetOnlineName(onlineName);
      imapFolder->SetHierarchyDelimiter(hierarchyDelimiter);
      imapFolder->SetBoxFlags(flags);

      // Now that the child is created and the boxflags are set we can be sure
      // all special folder flags are known. The child may get its flags already
      // in AddSubfolderWithPath if they were in FolderCache, but that's
      // not always the case.
      uint32_t flags = 0;
      child->GetFlags(&flags);

      // Set the offline use flag for the newly created folder if the
      // offline_download preference is true, unless it's the Trash or Junk
      // folder.
      if (!(flags & (nsMsgFolderFlags::Trash | nsMsgFolderFlags::Junk))) {
        nsCOMPtr<nsIImapIncomingServer> imapServer;
        rv = GetImapIncomingServer(getter_AddRefs(imapServer));
        NS_ENSURE_SUCCESS(rv, rv);
        bool setNewFoldersForOffline = false;
        rv = imapServer->GetOfflineDownload(&setNewFoldersForOffline);
        if (NS_SUCCEEDED(rv) && setNewFoldersForOffline)
          flags |= nsMsgFolderFlags::Offline;
      } else {
        flags &= ~nsMsgFolderFlags::Offline;  // clear offline flag if set
      }

      flags |= nsMsgFolderFlags::Elided;
      child->SetFlags(flags);

      nsString unicodeName;
      rv = CopyFolderNameToUTF16(folderName, unicodeName);
      if (NS_SUCCEEDED(rv)) child->SetPrettyName(unicodeName);

      // store the online name as the mailbox name in the db folder info
      // I don't think anyone uses the mailbox name, so we'll use it
      // to restore the online name when blowing away an imap db.
      if (folderInfo)
        folderInfo->SetMailboxName(NS_ConvertUTF8toUTF16(onlineName));
    }

    unusedDB->SetSummaryValid(true);
    unusedDB->Commit(nsMsgDBCommitType::kLargeCommit);
    unusedDB->Close(true);
    // don't want to hold onto this newly created db.
    child->SetMsgDatabase(nullptr);
  }

  if (!suppressNotification) {
    if (NS_SUCCEEDED(rv) && child) {
      NotifyFolderAdded(child);
      child->NotifyFolderEvent(kFolderCreateCompleted);
      nsCOMPtr<nsIMsgFolderNotificationService> notifier(
          do_GetService("@mozilla.org/messenger/msgnotificationservice;1"));
      if (notifier) notifier->NotifyFolderAdded(child);
    } else {
      NotifyFolderEvent(kFolderCreateFailed);
    }
  }
  return rv;
}

NS_IMETHODIMP nsImapMailFolder::List() {
  nsresult rv;
  nsCOMPtr<nsIImapService> imapService =
      do_GetService("@mozilla.org/messenger/imapservice;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  return imapService->ListFolder(this, this);
}

NS_IMETHODIMP nsImapMailFolder::RemoveLocalSelf() {
  // Kill the local folder and its storage.
  return nsMsgDBFolder::DeleteSelf(nullptr);
}

NS_IMETHODIMP nsImapMailFolder::CreateStorageIfMissing(
    nsIUrlListener* urlListener) {
  nsresult rv = NS_OK;
  nsCOMPtr<nsIMsgFolder> msgParent;
  GetParent(getter_AddRefs(msgParent));

  // parent is probably not set because *this* was probably created by rdf
  // and not by folder discovery. So, we have to compute the parent.
  if (!msgParent) {
    nsAutoCString folderName(mURI);

    int32_t leafPos = folderName.RFindChar('/');
    nsAutoCString parentName(folderName);

    if (leafPos > 0) {
      // If there is a hierarchy, there is a parent.
      // Don't strip off slash if it's the first character
      parentName.SetLength(leafPos);
      rv = GetOrCreateFolder(parentName, getter_AddRefs(msgParent));
      NS_ENSURE_SUCCESS(rv, rv);
    }
  }
  if (msgParent) {
    nsString folderName;
    GetName(folderName);
    nsresult rv;
    nsCOMPtr<nsIImapService> imapService =
        do_GetService("@mozilla.org/messenger/imapservice;1", &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    imapService->EnsureFolderExists(msgParent, folderName, nullptr,
                                    urlListener);
  }
  return rv;
}

NS_IMETHODIMP nsImapMailFolder::GetVerifiedAsOnlineFolder(
    bool* aVerifiedAsOnlineFolder) {
  NS_ENSURE_ARG_POINTER(aVerifiedAsOnlineFolder);
  *aVerifiedAsOnlineFolder = m_verifiedAsOnlineFolder;
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::SetVerifiedAsOnlineFolder(
    bool aVerifiedAsOnlineFolder) {
  m_verifiedAsOnlineFolder = aVerifiedAsOnlineFolder;
  // mark ancestors as verified as well
  if (aVerifiedAsOnlineFolder) {
    nsCOMPtr<nsIMsgFolder> parent;
    do {
      GetParent(getter_AddRefs(parent));
      if (parent) {
        nsCOMPtr<nsIMsgImapMailFolder> imapParent = do_QueryInterface(parent);
        if (imapParent) {
          bool verifiedOnline;
          imapParent->GetVerifiedAsOnlineFolder(&verifiedOnline);
          if (verifiedOnline) break;
          imapParent->SetVerifiedAsOnlineFolder(true);
        }
      }
    } while (parent);
  }
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::GetOnlineDelimiter(char* onlineDelimiter) {
  return GetHierarchyDelimiter(onlineDelimiter);
}

NS_IMETHODIMP nsImapMailFolder::SetHierarchyDelimiter(
    char aHierarchyDelimiter) {
  m_hierarchyDelimiter = aHierarchyDelimiter;
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::GetHierarchyDelimiter(
    char* aHierarchyDelimiter) {
  NS_ENSURE_ARG_POINTER(aHierarchyDelimiter);
  if (mIsServer) {
    // if it's the root folder, we don't know the delimiter. So look at the
    // first child.
    int32_t count = mSubFolders.Count();
    if (count > 0) {
      nsCOMPtr<nsIMsgImapMailFolder> childFolder(
          do_QueryInterface(mSubFolders[0]));
      if (childFolder) {
        nsresult rv = childFolder->GetHierarchyDelimiter(aHierarchyDelimiter);
        // some code uses m_hierarchyDelimiter directly, so we should set it.
        m_hierarchyDelimiter = *aHierarchyDelimiter;
        return rv;
      }
    }
  }
  ReadDBFolderInfo(false);  // update cache first.
  *aHierarchyDelimiter = m_hierarchyDelimiter;
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::SetBoxFlags(int32_t aBoxFlags) {
  ReadDBFolderInfo(false);

  m_boxFlags = aBoxFlags;
  uint32_t newFlags = mFlags;

  newFlags |= nsMsgFolderFlags::ImapBox;

  if (m_boxFlags & kNoinferiors)
    newFlags |= nsMsgFolderFlags::ImapNoinferiors;
  else
    newFlags &= ~nsMsgFolderFlags::ImapNoinferiors;
  if (m_boxFlags & kNoselect)
    newFlags |= nsMsgFolderFlags::ImapNoselect;
  else
    newFlags &= ~nsMsgFolderFlags::ImapNoselect;
  if (m_boxFlags & kPublicMailbox)
    newFlags |= nsMsgFolderFlags::ImapPublic;
  else
    newFlags &= ~nsMsgFolderFlags::ImapPublic;
  if (m_boxFlags & kOtherUsersMailbox)
    newFlags |= nsMsgFolderFlags::ImapOtherUser;
  else
    newFlags &= ~nsMsgFolderFlags::ImapOtherUser;
  if (m_boxFlags & kPersonalMailbox)
    newFlags |= nsMsgFolderFlags::ImapPersonal;
  else
    newFlags &= ~nsMsgFolderFlags::ImapPersonal;

  // The following are all flags returned by XLIST.
  // nsImapIncomingServer::DiscoveryDone checks for these folders.
  if (m_boxFlags & kImapDrafts) newFlags |= nsMsgFolderFlags::Drafts;

  if (m_boxFlags & kImapSpam) newFlags |= nsMsgFolderFlags::Junk;

  if (m_boxFlags & kImapSent) newFlags |= nsMsgFolderFlags::SentMail;

  if (m_boxFlags & kImapInbox) newFlags |= nsMsgFolderFlags::Inbox;

  if (m_boxFlags & kImapXListTrash) {
    nsCOMPtr<nsIImapIncomingServer> imapServer;
    nsMsgImapDeleteModel deleteModel = nsMsgImapDeleteModels::MoveToTrash;
    (void)GetImapIncomingServer(getter_AddRefs(imapServer));
    if (imapServer) imapServer->GetDeleteModel(&deleteModel);
    if (deleteModel == nsMsgImapDeleteModels::MoveToTrash)
      newFlags |= nsMsgFolderFlags::Trash;
  }
  // Treat the GMail all mail folder as the archive folder.
  if (m_boxFlags & (kImapAllMail | kImapArchive))
    newFlags |= nsMsgFolderFlags::Archive;

  SetFlags(newFlags);
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::GetBoxFlags(int32_t* aBoxFlags) {
  NS_ENSURE_ARG_POINTER(aBoxFlags);
  *aBoxFlags = m_boxFlags;
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::GetExplicitlyVerify(bool* aExplicitlyVerify) {
  NS_ENSURE_ARG_POINTER(aExplicitlyVerify);
  *aExplicitlyVerify = m_explicitlyVerify;
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::SetExplicitlyVerify(bool aExplicitlyVerify) {
  m_explicitlyVerify = aExplicitlyVerify;
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::GetNoSelect(bool* aResult) {
  NS_ENSURE_ARG_POINTER(aResult);
  return GetFlag(nsMsgFolderFlags::ImapNoselect, aResult);
}

NS_IMETHODIMP nsImapMailFolder::ApplyRetentionSettings() {
  int32_t numDaysToKeepOfflineMsgs = -1;

  // Check if we've limited the offline storage by age.
  nsCOMPtr<nsIImapIncomingServer> imapServer;
  nsresult rv = GetImapIncomingServer(getter_AddRefs(imapServer));
  NS_ENSURE_SUCCESS(rv, rv);
  imapServer->GetAutoSyncMaxAgeDays(&numDaysToKeepOfflineMsgs);

  nsCOMPtr<nsIMsgDatabase> holdDBOpen;
  if (numDaysToKeepOfflineMsgs > 0) {
    bool dbWasCached = mDatabase != nullptr;
    rv = GetDatabase();
    NS_ENSURE_SUCCESS(rv, rv);
    nsCOMPtr<nsIMsgEnumerator> hdrs;
    rv = mDatabase->EnumerateMessages(getter_AddRefs(hdrs));
    NS_ENSURE_SUCCESS(rv, rv);
    bool hasMore = false;

    PRTime cutOffDay =
        MsgConvertAgeInDaysToCutoffDate(numDaysToKeepOfflineMsgs);

    // so now cutOffDay is the PRTime cut-off point. Any offline msg with
    // a date less than that will get marked for pending removal.
    while (NS_SUCCEEDED(rv = hdrs->HasMoreElements(&hasMore)) && hasMore) {
      nsCOMPtr<nsIMsgDBHdr> header;
      rv = hdrs->GetNext(getter_AddRefs(header));
      NS_ENSURE_SUCCESS(rv, rv);

      uint32_t msgFlags;
      PRTime msgDate;
      header->GetFlags(&msgFlags);
      if (msgFlags & nsMsgMessageFlags::Offline) {
        header->GetDate(&msgDate);
        MarkPendingRemoval(header, msgDate < cutOffDay);
        // I'm horribly tempted to break out of the loop if we've found
        // a message after the cut-off date, because messages will most likely
        // be in date order in the db, but there are always edge cases.
      }
    }
    if (!dbWasCached) {
      holdDBOpen = mDatabase;
      mDatabase = nullptr;
    }
  }
  return nsMsgDBFolder::ApplyRetentionSettings();
}

/**
 * The listener will get called when both the online expunge and the offline
 * store compaction are finished (if the latter is needed).
 */
nsresult nsImapMailFolder::ExpungeAndCompact(nsIUrlListener* aListener,
                                             nsIMsgWindow* aMsgWindow) {
  GetDatabase();
  // now's a good time to apply the retention settings. If we do delete any
  // messages, the expunge is going to have to wait until the delete to
  // finish before it can run, but the multiple-connection protection code
  // should handle that.
  if (mDatabase) ApplyRetentionSettings();

  // Things to hold in existence until both expunge and compact are complete.
  RefPtr<nsImapMailFolder> folder = this;
  nsCOMPtr<nsIUrlListener> finalListener = aListener;
  nsCOMPtr<nsIMsgWindow> msgWindow = aMsgWindow;

  // doCompact implements OnStopRunningUrl()
  // NOTE: The caller will be expecting that their listener will be invoked, so
  // we need to be careful that all execution paths in here do that. We either
  // call it directly, or pass it along to the foldercompactor to call.
  auto doCompact = [folder, finalListener, msgWindow](
                       nsIURI* url, nsresult status) -> nsresult {
    nsCOMPtr<nsIMsgPluggableStore> msgStore;
    nsresult rv = folder->GetMsgStore(getter_AddRefs(msgStore));
    if (NS_FAILED(rv)) {
      if (finalListener) {
        return finalListener->OnStopRunningUrl(nullptr, rv);
      }
      return rv;
    }
    bool storeSupportsCompaction;
    msgStore->GetSupportsCompaction(&storeSupportsCompaction);
    if (storeSupportsCompaction && folder->mFlags & nsMsgFolderFlags::Offline) {
      return AsyncCompactFolders({folder}, finalListener, msgWindow);
    }
    // Not going to run a compaction, so signal that we're all done.
    if (finalListener) {
      return finalListener->OnStopRunningUrl(nullptr, NS_OK);
    }
    return NS_OK;
  };

  if (WeAreOffline()) {
    // Can't run an expunge. Dispatch the next stage (compact) immediately.
    NS_DispatchToMainThread(NS_NewRunnableFunction(
        "doCompact", [doCompact] { doCompact(nullptr, NS_OK); }));
    return NS_OK;
  }

  // Run the expunge, followed by the compaction.
  RefPtr<UrlListener> expungeListener = new UrlListener();
  expungeListener->mStopFn = doCompact;
  return Expunge(expungeListener, aMsgWindow);
}

// IMAP compact implies an Expunge.
NS_IMETHODIMP nsImapMailFolder::Compact(nsIUrlListener* aListener,
                                        nsIMsgWindow* aMsgWindow) {
  return ExpungeAndCompact(aListener, aMsgWindow);
}

NS_IMETHODIMP
nsImapMailFolder::NotifyCompactCompleted() { return NS_OK; }

NS_IMETHODIMP nsImapMailFolder::MarkPendingRemoval(nsIMsgDBHdr* aHdr,
                                                   bool aMark) {
  NS_ENSURE_ARG_POINTER(aHdr);
  uint32_t offlineMessageSize;
  aHdr->GetOfflineMessageSize(&offlineMessageSize);
  aHdr->SetStringProperty("pendingRemoval", aMark ? "1"_ns : ""_ns);
  if (!aMark) return NS_OK;
  nsresult rv = GetDatabase();
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIDBFolderInfo> dbFolderInfo;
  rv = mDatabase->GetDBFolderInfo(getter_AddRefs(dbFolderInfo));
  NS_ENSURE_SUCCESS(rv, rv);
  return dbFolderInfo->ChangeExpungedBytes(offlineMessageSize);
}

NS_IMETHODIMP nsImapMailFolder::Expunge(nsIUrlListener* aListener,
                                        nsIMsgWindow* aMsgWindow) {
  nsresult rv;
  nsCOMPtr<nsIImapService> imapService =
      do_GetService("@mozilla.org/messenger/imapservice;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  return imapService->Expunge(this, aListener, aMsgWindow);
}

NS_IMETHODIMP nsImapMailFolder::CompactAll(nsIUrlListener* aListener,
                                           nsIMsgWindow* aMsgWindow) {
  nsresult rv;
  nsCOMPtr<nsIMsgFolder> rootFolder;
  rv = GetRootFolder(getter_AddRefs(rootFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgWindow> msgWindow = aMsgWindow;

  // Set up a callable which will start the compaction phase.
  auto doCompact = [rootFolder, listener = nsCOMPtr<nsIUrlListener>(aListener),
                    msgWindow]() {
    // Collect all the compactable folders.
    nsTArray<RefPtr<nsIMsgFolder>> foldersToCompact;
    nsTArray<RefPtr<nsIMsgFolder>> allDescendants;
    rootFolder->GetDescendants(allDescendants);
    for (auto folder : allDescendants) {
      uint32_t flags;
      folder->GetFlags(&flags);
      if (flags &
          (nsMsgFolderFlags::Virtual | nsMsgFolderFlags::ImapNoselect)) {
        continue;
      }
      // Folder can be compacted?
      nsCOMPtr<nsIMsgPluggableStore> msgStore;
      folder->GetMsgStore(getter_AddRefs(msgStore));
      if (!msgStore) {
        continue;
      }
      bool storeSupportsCompaction;
      msgStore->GetSupportsCompaction(&storeSupportsCompaction);
      if (storeSupportsCompaction) {
        foldersToCompact.AppendElement(folder);
      }
    }
    nsresult rv = AsyncCompactFolders(foldersToCompact, listener, msgWindow);
    if (NS_FAILED(rv) && listener) {
      // Make sure the listener hears about the failure.
      // A bit icky... but we're combined with IMAP expunge.
      // From the callers point of view the operation has already
      // been kicked off, and they'll be expecting this callback.
      listener->OnStopRunningUrl(nullptr, rv);
    }
  };

  // Collect all the expungeable folders.
  nsTArray<RefPtr<nsIMsgImapMailFolder>> foldersToExpunge;
  nsTArray<RefPtr<nsIMsgFolder>> allDescendants;
  rootFolder->GetDescendants(allDescendants);
  for (auto folder : allDescendants) {
    nsCOMPtr<nsIMsgImapMailFolder> imapFolder(do_QueryInterface(folder));
    if (!imapFolder) {
      continue;
    }
    uint32_t folderFlags;
    folder->GetFlags(&folderFlags);
    if (!(folderFlags &
          (nsMsgFolderFlags::Virtual | nsMsgFolderFlags::ImapNoselect))) {
      foldersToExpunge.AppendElement(imapFolder);
    }
  }

  if (WeAreOffline() || foldersToExpunge.IsEmpty()) {
    // No expunge step. Dispatch the next stage (compact) immediately.
    NS_DispatchToMainThread(NS_NewRunnableFunction("doCompact", doCompact));
    return NS_OK;
  }

  // Kick off expunge on all the folders (the IMAP protocol will handle
  // queuing them up as needed).

  // A listener to track the completed expunges.
  RefPtr<UrlListener> l = new UrlListener();
  l->mStopFn = [expungeCount = foldersToExpunge.Length(), doCompact](
                   nsIURI* url, nsresult status) mutable -> nsresult {
    // NOTE: we're ignoring expunge result code - nothing much we can do
    // here to recover, so just plough on.
    --expungeCount;
    if (expungeCount == 0) {
      // All the expunges are done so start compacting.
      doCompact();
    }
    return NS_OK;
  };
  // Commence expunging.
  for (auto& imapFolder : foldersToExpunge) {
    rv = imapFolder->Expunge(l, aMsgWindow);
    if (NS_FAILED(rv)) {
      // Make sure expungeCount is kept in sync!
      l->OnStopRunningUrl(nullptr, rv);
    }
  }

  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::UpdateStatus(nsIUrlListener* aListener,
                                             nsIMsgWindow* aMsgWindow) {
  nsresult rv;
  nsCOMPtr<nsIImapService> imapService =
      do_GetService("@mozilla.org/messenger/imapservice;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIURI> uri;
  rv = imapService->UpdateFolderStatus(this, aListener, getter_AddRefs(uri));
  if (uri && !aMsgWindow) {
    nsCOMPtr<nsIMsgMailNewsUrl> mailNewsUrl = do_QueryInterface(uri, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    // if no msg window, we won't put up error messages (this is almost
    // certainly a biff-inspired status)
    mailNewsUrl->SetSuppressErrorMsgs(true);
  }
  return rv;
}

NS_IMETHODIMP nsImapMailFolder::EmptyTrash(nsIUrlListener* aListener) {
  nsCOMPtr<nsIMsgFolder> trashFolder;
  nsresult rv = GetTrashFolder(getter_AddRefs(trashFolder));
  if (NS_SUCCEEDED(rv)) {
    if (WeAreOffline()) {
      nsCOMPtr<nsIMsgDatabase> trashDB;
      rv = trashFolder->GetMsgDatabase(getter_AddRefs(trashDB));
      if (trashDB) {
        nsCOMPtr<nsIMsgOfflineOpsDatabase> opsDb =
            do_QueryInterface(trashDB, &rv);
        NS_ENSURE_SUCCESS(rv, rv);

        // Offline operations are usually indexed by a msgKey. There's no
        // message here, so we pretend and generate a fake msgKey to hang the
        // offline op from. Ugh.
        nsMsgKey fakeKey;
        opsDb->GetNextFakeOfflineMsgKey(&fakeKey);

        nsCOMPtr<nsIMsgOfflineImapOperation> op;
        rv = opsDb->GetOfflineOpForKey(fakeKey, true, getter_AddRefs(op));
        trashFolder->SetFlag(nsMsgFolderFlags::OfflineEvents);
        op->SetOperation(nsIMsgOfflineImapOperation::kDeleteAllMsgs);
      }
      return rv;
    }

    nsCOMPtr<nsIImapService> imapService =
        do_GetService("@mozilla.org/messenger/imapservice;1", &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    if (aListener)
      rv = imapService->DeleteAllMessages(trashFolder, aListener);
    else {
      nsCOMPtr<nsIUrlListener> urlListener = do_QueryInterface(trashFolder);
      rv = imapService->DeleteAllMessages(trashFolder, urlListener);
    }
    // Return an error if this failed. We want the empty trash on exit code
    // to know if this fails so that it doesn't block waiting for empty trash to
    // finish.
    NS_ENSURE_SUCCESS(rv, rv);

    // Delete any subfolders under Trash.
    nsTArray<RefPtr<nsIMsgFolder>> subFolders;
    rv = trashFolder->GetSubFolders(subFolders);
    NS_ENSURE_SUCCESS(rv, rv);
    while (!subFolders.IsEmpty()) {
      RefPtr<nsIMsgFolder> f = subFolders.PopLastElement();
      rv = trashFolder->PropagateDelete(f, true);
      NS_ENSURE_SUCCESS(rv, rv);
    }

    nsCOMPtr<nsIPropertyBag2> transferInfo;
    rv = trashFolder->GetDBTransferInfo(getter_AddRefs(transferInfo));
    NS_ENSURE_SUCCESS(rv, rv);
    // Bulk-delete all the messages by deleting the msf file and storage.
    // This is a little kludgy.
    rv = trashFolder->DeleteStorage();
    NS_ENSURE_SUCCESS(rv, rv);
    if (transferInfo) trashFolder->SetDBTransferInfo(transferInfo);
    trashFolder->SetSizeOnDisk(0);

    // The trash folder has effectively been deleted.
    nsCOMPtr<nsIMsgFolderNotificationService> notifier(
        do_GetService("@mozilla.org/messenger/msgnotificationservice;1"));
    if (notifier) notifier->NotifyFolderDeleted(trashFolder);

    return NS_OK;
  }
  return rv;
}

NS_IMETHODIMP nsImapMailFolder::DeleteStorage() {
  nsresult rv = nsMsgDBFolder::DeleteStorage();

  // Should notify nsIMsgFolderListeners about the folder getting deleted?
  return rv;
}

NS_IMETHODIMP nsImapMailFolder::Rename(const nsAString& newName,
                                       nsIMsgWindow* msgWindow) {
  if (mFlags & nsMsgFolderFlags::Virtual)
    return nsMsgDBFolder::Rename(newName, msgWindow);
  nsresult rv;
  nsAutoString newNameStr(newName);
  if (newNameStr.FindChar(m_hierarchyDelimiter, 0) != kNotFound) {
    nsCOMPtr<nsIDocShell> docShell;
    if (msgWindow) msgWindow->GetRootDocShell(getter_AddRefs(docShell));
    if (docShell) {
      nsCOMPtr<nsIStringBundle> bundle;
      rv = IMAPGetStringBundle(getter_AddRefs(bundle));
      if (NS_SUCCEEDED(rv) && bundle) {
        AutoTArray<nsString, 1> formatStrings;
        formatStrings.AppendElement()->Append(m_hierarchyDelimiter);
        nsString alertString;
        rv = bundle->FormatStringFromName("imapSpecialChar2", formatStrings,
                                          alertString);
        nsCOMPtr<nsIPrompt> dialog(do_GetInterface(docShell));
        // setting up the dialog title
        nsCOMPtr<nsIMsgIncomingServer> server;
        rv = GetServer(getter_AddRefs(server));
        NS_ENSURE_SUCCESS(rv, rv);
        nsString dialogTitle;
        nsString accountName;
        rv = server->GetPrettyName(accountName);
        NS_ENSURE_SUCCESS(rv, rv);
        AutoTArray<nsString, 1> titleParams = {accountName};
        rv = bundle->FormatStringFromName("imapAlertDialogTitle", titleParams,
                                          dialogTitle);

        if (dialog && !alertString.IsEmpty())
          dialog->Alert(dialogTitle.get(), alertString.get());
      }
    }
    return NS_ERROR_FAILURE;
  }
  nsCOMPtr<nsIImapIncomingServer> incomingImapServer;
  GetImapIncomingServer(getter_AddRefs(incomingImapServer));
  if (incomingImapServer) RecursiveCloseActiveConnections(incomingImapServer);

  nsCOMPtr<nsIImapService> imapService =
      do_GetService("@mozilla.org/messenger/imapservice;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  return imapService->RenameLeaf(this, newName, this, msgWindow);
}

NS_IMETHODIMP nsImapMailFolder::RecursiveCloseActiveConnections(
    nsIImapIncomingServer* incomingImapServer) {
  NS_ENSURE_ARG(incomingImapServer);

  nsCOMPtr<nsIMsgImapMailFolder> folder;
  int32_t count = mSubFolders.Count();
  for (int32_t i = 0; i < count; i++) {
    folder = do_QueryInterface(mSubFolders[i]);
    if (folder) folder->RecursiveCloseActiveConnections(incomingImapServer);

    incomingImapServer->CloseConnectionForFolder(mSubFolders[i]);
  }
  return NS_OK;
}

// this is called *after* we've done the rename on the server.
NS_IMETHODIMP nsImapMailFolder::PrepareToRename() {
  nsCOMPtr<nsIMsgImapMailFolder> folder;
  int32_t count = mSubFolders.Count();
  for (int32_t i = 0; i < count; i++) {
    folder = do_QueryInterface(mSubFolders[i]);
    if (folder) folder->PrepareToRename();
  }

  SetOnlineName(EmptyCString());
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::RenameLocal(const nsACString& newName,
                                            nsIMsgFolder* parent) {
  nsAutoCString leafname(newName);
  nsAutoCString parentName;
  // newName always in the canonical form "greatparent/parentname/leafname"
  int32_t leafpos = leafname.RFindChar('/');
  if (leafpos > 0) leafname.Cut(0, leafpos + 1);
  m_msgParser = nullptr;
  PrepareToRename();
  CloseAndBackupFolderDB(leafname);

  nsresult rv = NS_OK;
  nsCOMPtr<nsIFile> oldPathFile;
  rv = GetFilePath(getter_AddRefs(oldPathFile));
  if (NS_FAILED(rv)) return rv;

  nsCOMPtr<nsIFile> parentPathFile;
  rv = parent->GetFilePath(getter_AddRefs(parentPathFile));
  NS_ENSURE_SUCCESS(rv, rv);

  bool isDirectory = false;
  parentPathFile->IsDirectory(&isDirectory);
  if (!isDirectory) AddDirectorySeparator(parentPathFile);

  nsCOMPtr<nsIFile> dirFile;

  int32_t count = mSubFolders.Count();
  if (count > 0) {
    rv = CreateDirectoryForFolder(getter_AddRefs(dirFile));
    NS_ENSURE_SUCCESS(rv, rv);
  }

  nsCOMPtr<nsIFile> oldSummaryFile;
  rv = GetSummaryFileLocation(oldPathFile, getter_AddRefs(oldSummaryFile));
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString newNameStr;
  oldSummaryFile->Remove(false);
  if (count > 0) {
    newNameStr = leafname;
    NS_MsgHashIfNecessary(newNameStr);
    newNameStr.AppendLiteral(FOLDER_SUFFIX8);
    nsAutoCString leafName;
    dirFile->GetNativeLeafName(leafName);
    if (!leafName.Equals(newNameStr))
      return dirFile->MoveToNative(
          nullptr,
          newNameStr);  // in case of rename operation leaf names will differ

    parentPathFile->AppendNative(
        newNameStr);  // only for move we need to progress further in case the
                      // parent differs
    bool isDirectory = false;
    parentPathFile->IsDirectory(&isDirectory);
    if (!isDirectory) {
      rv = parentPathFile->Create(nsIFile::DIRECTORY_TYPE, 0700);
      NS_ENSURE_SUCCESS(rv, rv);
    } else {
      NS_ERROR("Directory already exists.");
    }
    rv = RecursiveCopy(dirFile, parentPathFile);
    NS_ENSURE_SUCCESS(rv, rv);
    dirFile->Remove(true);  // moving folders
  }
  return rv;
}

NS_IMETHODIMP nsImapMailFolder::GetPrettyName(nsAString& prettyName) {
  return GetName(prettyName);
}

NS_IMETHODIMP nsImapMailFolder::UpdateSummaryTotals(bool force) {
  // bug 72871 inserted the mIsServer check for IMAP
  return mIsServer ? NS_OK : nsMsgDBFolder::UpdateSummaryTotals(force);
}

NS_IMETHODIMP nsImapMailFolder::GetDeletable(bool* deletable) {
  NS_ENSURE_ARG_POINTER(deletable);

  bool isServer;
  GetIsServer(&isServer);

  *deletable = !(isServer || (mFlags & nsMsgFolderFlags::SpecialUse));
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::GetSizeOnDisk(int64_t* size) {
  NS_ENSURE_ARG_POINTER(size);

  bool isServer = false;
  nsresult rv = GetIsServer(&isServer);
  // If this is the rootFolder, return 0 as a safe value.
  if (NS_FAILED(rv) || isServer) mFolderSize = 0;

  *size = mFolderSize;
  return NS_OK;
}

NS_IMETHODIMP
nsImapMailFolder::GetCanCreateSubfolders(bool* aResult) {
  NS_ENSURE_ARG_POINTER(aResult);
  *aResult = !(mFlags &
               (nsMsgFolderFlags::ImapNoinferiors | nsMsgFolderFlags::Virtual));

  bool isServer = false;
  GetIsServer(&isServer);
  if (!isServer) {
    nsCOMPtr<nsIImapIncomingServer> imapServer;
    nsresult rv = GetImapIncomingServer(getter_AddRefs(imapServer));
    bool dualUseFolders = true;
    if (NS_SUCCEEDED(rv) && imapServer)
      imapServer->GetDualUseFolders(&dualUseFolders);
    if (!dualUseFolders && *aResult)
      *aResult = (mFlags & nsMsgFolderFlags::ImapNoselect);
  }
  return NS_OK;
}

NS_IMETHODIMP
nsImapMailFolder::GetCanSubscribe(bool* aResult) {
  NS_ENSURE_ARG_POINTER(aResult);
  *aResult = false;

  bool isImapServer = false;
  nsresult rv = GetIsServer(&isImapServer);
  if (NS_FAILED(rv)) return rv;
  // you can only subscribe to imap servers, not imap folders
  *aResult = isImapServer;
  return NS_OK;
}

nsresult nsImapMailFolder::GetServerKey(nsACString& serverKey) {
  // look for matching imap folders, then pop folders
  nsCOMPtr<nsIMsgIncomingServer> server;
  nsresult rv = GetServer(getter_AddRefs(server));
  if (NS_SUCCEEDED(rv)) rv = server->GetKey(serverKey);
  return rv;
}

NS_IMETHODIMP
nsImapMailFolder::GetImapIncomingServer(
    nsIImapIncomingServer** aImapIncomingServer) {
  NS_ENSURE_ARG(aImapIncomingServer);
  nsCOMPtr<nsIMsgIncomingServer> server;
  if (NS_SUCCEEDED(GetServer(getter_AddRefs(server))) && server) {
    nsCOMPtr<nsIImapIncomingServer> incomingServer = do_QueryInterface(server);
    NS_ENSURE_TRUE(incomingServer, NS_ERROR_NO_INTERFACE);
    incomingServer.forget(aImapIncomingServer);
    return NS_OK;
  }
  return NS_ERROR_NULL_POINTER;
}

NS_IMETHODIMP
nsImapMailFolder::AddMessageDispositionState(
    nsIMsgDBHdr* aMessage, nsMsgDispositionState aDispositionFlag) {
  nsMsgDBFolder::AddMessageDispositionState(aMessage, aDispositionFlag);

  // set the mark message answered flag on the server for this message...
  if (aMessage) {
    nsMsgKey msgKey;
    aMessage->GetMessageKey(&msgKey);

    if (aDispositionFlag == nsIMsgFolder::nsMsgDispositionState_Replied)
      StoreImapFlags(kImapMsgAnsweredFlag, true, {msgKey}, nullptr);
    else if (aDispositionFlag == nsIMsgFolder::nsMsgDispositionState_Forwarded)
      StoreImapFlags(kImapMsgForwardedFlag, true, {msgKey}, nullptr);
  }
  return NS_OK;
}

NS_IMETHODIMP
nsImapMailFolder::MarkMessagesRead(
    const nsTArray<RefPtr<nsIMsgDBHdr>>& messages, bool markRead) {
  // tell the folder to do it, which will mark them read in the db.
  nsresult rv = nsMsgDBFolder::MarkMessagesRead(messages, markRead);
  if (NS_SUCCEEDED(rv)) {
    nsAutoCString messageIds;
    nsTArray<nsMsgKey> keysToMarkRead;
    rv = BuildIdsAndKeyArray(messages, messageIds, keysToMarkRead);
    NS_ENSURE_SUCCESS(rv, rv);

    StoreImapFlags(kImapMsgSeenFlag, markRead, keysToMarkRead, nullptr);
    rv = GetDatabase();
    if (NS_SUCCEEDED(rv)) mDatabase->Commit(nsMsgDBCommitType::kLargeCommit);
  }
  return rv;
}

NS_IMETHODIMP
nsImapMailFolder::MarkAllMessagesRead(nsIMsgWindow* aMsgWindow) {
  nsresult rv = GetDatabase();
  if (NS_SUCCEEDED(rv)) {
    nsTArray<nsMsgKey> thoseMarked;
    EnableNotifications(allMessageCountNotifications, false);
    rv = mDatabase->MarkAllRead(thoseMarked);
    EnableNotifications(allMessageCountNotifications, true);
    if (NS_SUCCEEDED(rv) && thoseMarked.Length() > 0) {
      rv = StoreImapFlags(kImapMsgSeenFlag, true, thoseMarked, nullptr);
      mDatabase->Commit(nsMsgDBCommitType::kLargeCommit);

      // Setup a undo-state
      if (aMsgWindow)
        rv = AddMarkAllReadUndoAction(aMsgWindow, thoseMarked.Elements(),
                                      thoseMarked.Length());
    }
  }
  return rv;
}

NS_IMETHODIMP nsImapMailFolder::MarkThreadRead(nsIMsgThread* thread) {
  nsresult rv = GetDatabase();
  if (NS_SUCCEEDED(rv)) {
    nsTArray<nsMsgKey> keys;
    rv = mDatabase->MarkThreadRead(thread, nullptr, keys);
    if (NS_SUCCEEDED(rv) && keys.Length() > 0) {
      rv = StoreImapFlags(kImapMsgSeenFlag, true, keys, nullptr);
      mDatabase->Commit(nsMsgDBCommitType::kLargeCommit);
    }
  }
  return rv;
}

NS_IMETHODIMP nsImapMailFolder::ReadFromFolderCacheElem(
    nsIMsgFolderCacheElement* element) {
  nsresult rv = nsMsgDBFolder::ReadFromFolderCacheElem(element);
  int32_t hierarchyDelimiter = kOnlineHierarchySeparatorUnknown;
  nsCString onlineName;

  element->GetCachedUInt32("boxFlags", (uint32_t*)&m_boxFlags);
  if (NS_SUCCEEDED(element->GetCachedInt32("hierDelim", &hierarchyDelimiter)) &&
      hierarchyDelimiter != kOnlineHierarchySeparatorUnknown)
    m_hierarchyDelimiter = (char)hierarchyDelimiter;
  rv = element->GetCachedString("onlineName", onlineName);
  if (NS_SUCCEEDED(rv) && !onlineName.IsEmpty())
    m_onlineFolderName.Assign(onlineName);

  m_aclFlags = kAclInvalid;  // init to invalid value.
  element->GetCachedUInt32("aclFlags", &m_aclFlags);
  element->GetCachedInt32("serverTotal", &m_numServerTotalMessages);
  element->GetCachedInt32("serverUnseen", &m_numServerUnseenMessages);
  element->GetCachedInt32("serverRecent", &m_numServerRecentMessages);
  element->GetCachedInt32("nextUID", &m_nextUID);
  int32_t lastSyncTimeInSec;
  if (NS_FAILED(element->GetCachedInt32("lastSyncTimeInSec",
                                        (int32_t*)&lastSyncTimeInSec)))
    lastSyncTimeInSec = 0U;

  // make sure that auto-sync state object is created
  InitAutoSyncState();
  m_autoSyncStateObj->SetLastSyncTimeInSec(lastSyncTimeInSec);

  return rv;
}

NS_IMETHODIMP nsImapMailFolder::WriteToFolderCacheElem(
    nsIMsgFolderCacheElement* element) {
  nsresult rv = nsMsgDBFolder::WriteToFolderCacheElem(element);
  element->SetCachedUInt32("boxFlags", (uint32_t)m_boxFlags);
  element->SetCachedInt32("hierDelim", (int32_t)m_hierarchyDelimiter);
  element->SetCachedString("onlineName", m_onlineFolderName);
  element->SetCachedUInt32("aclFlags", m_aclFlags);
  element->SetCachedInt32("serverTotal", m_numServerTotalMessages);
  element->SetCachedInt32("serverUnseen", m_numServerUnseenMessages);
  element->SetCachedInt32("serverRecent", m_numServerRecentMessages);
  if (m_nextUID != (int32_t)nsMsgKey_None)
    element->SetCachedInt32("nextUID", m_nextUID);

  // store folder's last sync time
  if (m_autoSyncStateObj) {
    PRTime lastSyncTime;
    m_autoSyncStateObj->GetLastSyncTime(&lastSyncTime);
    // store in sec
    element->SetCachedInt32("lastSyncTimeInSec",
                            (int32_t)(lastSyncTime / PR_USEC_PER_SEC));
  }

  return rv;
}

NS_IMETHODIMP
nsImapMailFolder::MarkMessagesFlagged(
    const nsTArray<RefPtr<nsIMsgDBHdr>>& messages, bool markFlagged) {
  nsresult rv;
  // tell the folder to do it, which will mark them read in the db.
  rv = nsMsgDBFolder::MarkMessagesFlagged(messages, markFlagged);
  if (NS_SUCCEEDED(rv)) {
    nsAutoCString messageIds;
    nsTArray<nsMsgKey> keysToMarkFlagged;
    rv = BuildIdsAndKeyArray(messages, messageIds, keysToMarkFlagged);
    if (NS_FAILED(rv)) return rv;
    rv = StoreImapFlags(kImapMsgFlaggedFlag, markFlagged, keysToMarkFlagged,
                        nullptr);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = GetDatabase();
    NS_ENSURE_SUCCESS(rv, rv);
    mDatabase->Commit(nsMsgDBCommitType::kLargeCommit);
  }
  return rv;
}

NS_IMETHODIMP nsImapMailFolder::SetOnlineName(
    const nsACString& aOnlineFolderName) {
  nsresult rv;
  nsCOMPtr<nsIMsgDatabase> db;
  nsCOMPtr<nsIDBFolderInfo> folderInfo;
  rv = GetDBFolderInfoAndDB(getter_AddRefs(folderInfo), getter_AddRefs(db));
  // do this after GetDBFolderInfoAndDB, because it crunches m_onlineFolderName
  // (not sure why)
  m_onlineFolderName = aOnlineFolderName;
  if (NS_SUCCEEDED(rv) && folderInfo) {
    nsAutoString onlineName;
    CopyUTF8toUTF16(aOnlineFolderName, onlineName);
    rv = folderInfo->SetProperty("onlineName", onlineName);
    rv = folderInfo->SetMailboxName(onlineName);
    // so, when are we going to commit this? Definitely not every time!
    // We could check if the online name has changed.
    db->Commit(nsMsgDBCommitType::kLargeCommit);
  }
  folderInfo = nullptr;
  return rv;
}

NS_IMETHODIMP nsImapMailFolder::GetOnlineName(nsACString& aOnlineFolderName) {
  ReadDBFolderInfo(false);  // update cache first.
  aOnlineFolderName = m_onlineFolderName;
  return NS_OK;
}

NS_IMETHODIMP
nsImapMailFolder::GetDBFolderInfoAndDB(nsIDBFolderInfo** folderInfo,
                                       nsIMsgDatabase** db) {
  NS_ENSURE_ARG_POINTER(folderInfo);
  NS_ENSURE_ARG_POINTER(db);

  nsresult rv = GetDatabase();
  if (NS_FAILED(rv)) return rv;

  NS_ADDREF(*db = mDatabase);

  rv = (*db)->GetDBFolderInfo(folderInfo);
  if (NS_FAILED(rv))
    return rv;  // GetDBFolderInfo can't return NS_OK if !folderInfo

  nsCString onlineName;
  rv = (*folderInfo)->GetCharProperty("onlineName", onlineName);
  if (NS_FAILED(rv)) return rv;

  if (!onlineName.IsEmpty())
    m_onlineFolderName.Assign(onlineName);
  else {
    nsAutoString autoOnlineName;
    (*folderInfo)->GetMailboxName(autoOnlineName);
    if (autoOnlineName.IsEmpty()) {
      nsCString uri;
      rv = GetURI(uri);
      NS_ENSURE_SUCCESS(rv, rv);

      nsCString hostname;
      rv = GetHostname(hostname);
      NS_ENSURE_SUCCESS(rv, rv);

      nsCString onlineCName;
      rv = nsImapURI2FullName(kImapRootURI, hostname.get(), uri.get(),
                              getter_Copies(onlineCName));
      // Note: check for unknown separator '^' only became needed
      // with UTF8=ACCEPT modification and haven't found why. Online name
      // contained the '^' delimiter and gmail said "NO" when folder under
      // [Gmail] is created and selected.
      if ((m_hierarchyDelimiter != '/') &&
          (m_hierarchyDelimiter != kOnlineHierarchySeparatorUnknown))
        onlineCName.ReplaceChar('/', m_hierarchyDelimiter);
      // XXX: What if online name contains slashes? Breaks?
      m_onlineFolderName.Assign(onlineCName);
      CopyUTF8toUTF16(onlineCName, autoOnlineName);
    }
    (*folderInfo)->SetProperty("onlineName", autoOnlineName);
  }
  return rv;
}

/* static */
nsresult nsImapMailFolder::BuildIdsAndKeyArray(
    const nsTArray<RefPtr<nsIMsgDBHdr>>& messages, nsCString& msgIds,
    nsTArray<nsMsgKey>& keyArray) {
  keyArray.Clear();
  keyArray.SetCapacity(messages.Length());
  // build up message keys.
  for (auto msgDBHdr : messages) {
    nsMsgKey key;
    nsresult rv = msgDBHdr->GetMessageKey(&key);
    if (NS_SUCCEEDED(rv)) keyArray.AppendElement(key);
  }
  return AllocateUidStringFromKeys(keyArray, msgIds);
}

/* static */
nsresult nsImapMailFolder::AllocateUidStringFromKeys(
    const nsTArray<nsMsgKey>& keys, nsCString& msgIds) {
  if (keys.IsEmpty()) return NS_ERROR_INVALID_ARG;
  nsresult rv = NS_OK;
  uint32_t startSequence;
  startSequence = keys[0];
  uint32_t curSequenceEnd = startSequence;
  uint32_t total = keys.Length();
  // sort keys and then generate ranges instead of singletons!
  nsTArray<nsMsgKey> sorted(keys.Clone());
  sorted.Sort();
  for (uint32_t keyIndex = 0; keyIndex < total; keyIndex++) {
    uint32_t curKey = sorted[keyIndex];
    uint32_t nextKey =
        (keyIndex + 1 < total) ? sorted[keyIndex + 1] : 0xFFFFFFFF;
    bool lastKey = (nextKey == 0xFFFFFFFF);

    if (lastKey) curSequenceEnd = curKey;
    if (nextKey == (uint32_t)curSequenceEnd + 1 && !lastKey) {
      curSequenceEnd = nextKey;
      continue;
    }
    if (curSequenceEnd > startSequence) {
      AppendUid(msgIds, startSequence);
      msgIds += ':';
      AppendUid(msgIds, curSequenceEnd);
      if (!lastKey) msgIds += ',';
      startSequence = nextKey;
      curSequenceEnd = startSequence;
    } else {
      startSequence = nextKey;
      curSequenceEnd = startSequence;
      AppendUid(msgIds, sorted[keyIndex]);
      if (!lastKey) msgIds += ',';
    }
  }
  return rv;
}

nsresult nsImapMailFolder::MarkMessagesImapDeleted(nsTArray<nsMsgKey>* keyArray,
                                                   bool deleted,
                                                   nsIMsgDatabase* db) {
  for (uint32_t kindex = 0; kindex < keyArray->Length(); kindex++) {
    nsMsgKey key = keyArray->ElementAt(kindex);
    db->MarkImapDeleted(key, deleted, nullptr);
  }
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::DeleteMessages(
    nsTArray<RefPtr<nsIMsgDBHdr>> const& msgHeaders, nsIMsgWindow* msgWindow,
    bool deleteStorage, bool isMove, nsIMsgCopyServiceListener* listener,
    bool allowUndo) {
  // *** jt - assuming delete is move to the trash folder for now
  nsAutoCString uri;
  bool deleteImmediatelyNoTrash = false;
  nsAutoCString messageIds;
  nsTArray<nsMsgKey> srcKeyArray;
  bool deleteMsgs = true;  // used for toggling delete status - default is true
  nsMsgImapDeleteModel deleteModel = nsMsgImapDeleteModels::MoveToTrash;
  imapMessageFlagsType messageFlags = kImapMsgDeletedFlag;

  nsCOMPtr<nsIImapIncomingServer> imapServer;
  nsresult rv = GetFlag(nsMsgFolderFlags::Trash, &deleteImmediatelyNoTrash);
  rv = GetImapIncomingServer(getter_AddRefs(imapServer));

  if (NS_SUCCEEDED(rv) && imapServer) {
    imapServer->GetDeleteModel(&deleteModel);
    if (deleteModel != nsMsgImapDeleteModels::MoveToTrash || deleteStorage)
      deleteImmediatelyNoTrash = true;
    // if we're deleting a message, we should pseudo-interrupt the msg
    // load of the current message.
    bool interrupted = false;
    imapServer->PseudoInterruptMsgLoad(this, msgWindow, &interrupted);
  }

  rv = BuildIdsAndKeyArray(msgHeaders, messageIds, srcKeyArray);
  if (NS_FAILED(rv)) return rv;

  nsCOMPtr<nsIMsgFolder> rootFolder;
  nsCOMPtr<nsIMsgFolder> trashFolder;

  if (!deleteImmediatelyNoTrash) {
    rv = GetRootFolder(getter_AddRefs(rootFolder));
    if (NS_SUCCEEDED(rv) && rootFolder) {
      rootFolder->GetFolderWithFlags(nsMsgFolderFlags::Trash,
                                     getter_AddRefs(trashFolder));
      NS_ASSERTION(trashFolder, "couldn't find trash");
      // if we can't find the trash, we'll just have to do an imap delete and
      // pretend this is the trash
      if (!trashFolder) deleteImmediatelyNoTrash = true;
    }
  }

  if ((NS_SUCCEEDED(rv) && deleteImmediatelyNoTrash) ||
      deleteModel == nsMsgImapDeleteModels::IMAPDelete) {
    if (allowUndo) {
      // need to take care of these two delete models
      RefPtr<nsImapMoveCopyMsgTxn> undoMsgTxn = new nsImapMoveCopyMsgTxn;
      if (!undoMsgTxn ||
          NS_FAILED(undoMsgTxn->Init(this, &srcKeyArray, messageIds.get(),
                                     nullptr, true, isMove)))
        return NS_ERROR_OUT_OF_MEMORY;

      undoMsgTxn->SetTransactionType(nsIMessenger::eDeleteMsg);
      // we're adding this undo action before the delete is successful. This is
      // evil, but 4.5 did it as well.
      nsCOMPtr<nsITransactionManager> txnMgr;
      if (msgWindow) msgWindow->GetTransactionManager(getter_AddRefs(txnMgr));
      if (txnMgr) txnMgr->DoTransaction(undoMsgTxn);
    }

    if (deleteModel == nsMsgImapDeleteModels::IMAPDelete && !deleteStorage) {
      deleteMsgs = false;
      for (nsIMsgDBHdr* msgHdr : msgHeaders) {
        if (!msgHdr) {
          continue;
        }
        uint32_t flags;
        msgHdr->GetFlags(&flags);
        if (!(flags & nsMsgMessageFlags::IMAPDeleted)) {
          deleteMsgs = true;
          break;
        }
      }
    }
    // if copy service listener is also a url listener, pass that
    // url listener into StoreImapFlags.
    nsCOMPtr<nsIUrlListener> urlListener = do_QueryInterface(listener);
    if (deleteMsgs) messageFlags |= kImapMsgSeenFlag;
    rv = StoreImapFlags(messageFlags, deleteMsgs, srcKeyArray, urlListener);

    if (NS_SUCCEEDED(rv)) {
      if (mDatabase) {
        nsCOMPtr<nsIMsgDatabase> database(mDatabase);
        if (deleteModel == nsMsgImapDeleteModels::IMAPDelete)
          MarkMessagesImapDeleted(&srcKeyArray, deleteMsgs, database);
        else {
          EnableNotifications(allMessageCountNotifications,
                              false);  //"remove it immediately" model
          // Notify if this is an actual delete.
          if (!isMove) {
            nsCOMPtr<nsIMsgFolderNotificationService> notifier(do_GetService(
                "@mozilla.org/messenger/msgnotificationservice;1"));
            if (notifier) notifier->NotifyMsgsDeleted(msgHeaders);
          }
          DeleteStoreMessages(msgHeaders);
          database->DeleteMessages(srcKeyArray, nullptr);
          EnableNotifications(allMessageCountNotifications, true);
        }
        if (listener) {
          listener->OnStartCopy();
          listener->OnStopCopy(NS_OK);
        }
        NotifyFolderEvent(kDeleteOrMoveMsgCompleted);
      }
    }
    return rv;
  }

  // have to move the messages to the trash
  if (trashFolder) {
    nsCOMPtr<nsIMsgFolder> srcFolder;
    nsCOMPtr<nsISupports> srcSupport;

    rv = QueryInterface(NS_GET_IID(nsIMsgFolder), getter_AddRefs(srcFolder));
    nsCOMPtr<nsIMsgCopyService> copyService =
        do_GetService("@mozilla.org/messenger/messagecopyservice;1", &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = copyService->CopyMessages(srcFolder, msgHeaders, trashFolder, true,
                                   listener, msgWindow, allowUndo);
  }

  return rv;
}

// check if folder is the trash, or a descendant of the trash
// so we can tell if the folders we're deleting from it should
// be *really* deleted.
bool nsImapMailFolder::TrashOrDescendantOfTrash(nsIMsgFolder* folder) {
  NS_ENSURE_TRUE(folder, false);
  nsCOMPtr<nsIMsgFolder> parent;
  nsCOMPtr<nsIMsgFolder> curFolder = folder;
  nsresult rv;
  uint32_t flags = 0;
  do {
    rv = curFolder->GetFlags(&flags);
    if (NS_FAILED(rv)) return false;
    if (flags & nsMsgFolderFlags::Trash) return true;
    curFolder->GetParent(getter_AddRefs(parent));
    if (!parent) return false;
    curFolder = parent;
  } while (NS_SUCCEEDED(rv) && curFolder);
  return false;
}
NS_IMETHODIMP
nsImapMailFolder::DeleteSelf(nsIMsgWindow* msgWindow) {
  nsCOMPtr<nsIMsgFolder> trashFolder;
  nsresult rv;
  uint32_t folderFlags;

  // No IMAP shenanigans required for virtual folders.
  GetFlags(&folderFlags);
  if (folderFlags & nsMsgFolderFlags::Virtual) {
    return nsMsgDBFolder::DeleteSelf(nullptr);
  }

  // "this" is the folder we're deleting from
  bool deleteNoTrash = TrashOrDescendantOfTrash(this) || !DeleteIsMoveToTrash();
  bool confirmDeletion = true;

  nsCOMPtr<nsIImapService> imapService =
      do_GetService("@mozilla.org/messenger/imapservice;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!deleteNoTrash) {
    rv = GetTrashFolder(getter_AddRefs(trashFolder));
    // If we can't find the trash folder and we are supposed to move it to the
    // trash return failure.
    if (NS_FAILED(rv) || !trashFolder) return NS_ERROR_FAILURE;
    bool canHaveSubFoldersOfTrash = true;
    trashFolder->GetCanCreateSubfolders(&canHaveSubFoldersOfTrash);
    if (canHaveSubFoldersOfTrash)  // UW server doesn't set NOINFERIORS - check
                                   // dual use pref
    {
      nsCOMPtr<nsIImapIncomingServer> imapServer;
      rv = GetImapIncomingServer(getter_AddRefs(imapServer));
      NS_ENSURE_SUCCESS(rv, rv);
      bool serverSupportsDualUseFolders;
      imapServer->GetDualUseFolders(&serverSupportsDualUseFolders);
      if (!serverSupportsDualUseFolders) canHaveSubFoldersOfTrash = false;
    }
    if (!canHaveSubFoldersOfTrash) deleteNoTrash = true;
    nsCOMPtr<nsIPrefBranch> prefBranch(
        do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
    NS_ENSURE_SUCCESS(rv, rv);
    prefBranch->GetBoolPref("mailnews.confirm.moveFoldersToTrash",
                            &confirmDeletion);
  }

  // If we are deleting folder immediately, ask user for confirmation.
  bool confirmed = false;
  if (confirmDeletion || deleteNoTrash) {
    nsCOMPtr<nsIStringBundle> bundle;
    rv = IMAPGetStringBundle(getter_AddRefs(bundle));
    NS_ENSURE_SUCCESS(rv, rv);

    nsAutoString folderName;
    rv = GetName(folderName);
    NS_ENSURE_SUCCESS(rv, rv);
    AutoTArray<nsString, 1> formatStrings = {folderName};

    nsAutoString deleteFolderDialogTitle;
    rv = bundle->GetStringFromName("imapDeleteFolderDialogTitle",
                                   deleteFolderDialogTitle);
    NS_ENSURE_SUCCESS(rv, rv);

    nsAutoString deleteFolderButtonLabel;
    rv = bundle->GetStringFromName("imapDeleteFolderButtonLabel",
                                   deleteFolderButtonLabel);
    NS_ENSURE_SUCCESS(rv, rv);

    nsAutoString confirmationStr;
    rv = bundle->FormatStringFromName(
        (deleteNoTrash) ? "imapDeleteNoTrash" : "imapMoveFolderToTrash",
        formatStrings, confirmationStr);
    NS_ENSURE_SUCCESS(rv, rv);
    if (!msgWindow) return NS_ERROR_NULL_POINTER;
    nsCOMPtr<nsIDocShell> docShell;
    msgWindow->GetRootDocShell(getter_AddRefs(docShell));
    nsCOMPtr<nsIPrompt> dialog;
    if (docShell) dialog = do_GetInterface(docShell);
    if (dialog) {
      int32_t buttonPressed = 0;
      // Default the dialog to "cancel".
      const uint32_t buttonFlags =
          (nsIPrompt::BUTTON_TITLE_IS_STRING * nsIPrompt::BUTTON_POS_0) +
          (nsIPrompt::BUTTON_TITLE_CANCEL * nsIPrompt::BUTTON_POS_1);

      bool dummyValue = false;
      rv = dialog->ConfirmEx(deleteFolderDialogTitle.get(),
                             confirmationStr.get(), buttonFlags,
                             deleteFolderButtonLabel.get(), nullptr, nullptr,
                             nullptr, &dummyValue, &buttonPressed);
      NS_ENSURE_SUCCESS(rv, rv);
      confirmed = !buttonPressed;  // "ok" is in position 0
    }
  } else {
    confirmed = true;
  }

  if (confirmed) {
    if (deleteNoTrash) {
      rv = imapService->DeleteFolder(this, this, msgWindow);
      nsMsgDBFolder::DeleteSelf(msgWindow);
    } else {
      bool match = false;
      rv = MatchOrChangeFilterDestination(nullptr, false, &match);
      if (match) {
        bool confirm = false;
        ConfirmFolderDeletionForFilter(msgWindow, &confirm);
        if (!confirm) return NS_OK;
      }
      rv = imapService->MoveFolder(this, trashFolder, this, msgWindow);
    }
  }
  return rv;
}

// FIXME: helper function to know whether we should check all IMAP folders
// for new mail; this is necessary because of a legacy hidden preference
// mail.check_all_imap_folders_for_new (now replaced by per-server preference
// mail.server.%serverkey%.check_all_folders_for_new), still present in some
// profiles.
/*static*/
bool nsImapMailFolder::ShouldCheckAllFolders(
    nsIImapIncomingServer* imapServer) {
  // Check legacy global preference to see if we should check all folders for
  // new messages, or just the inbox and marked ones.
  bool checkAllFolders = false;
  nsresult rv;
  nsCOMPtr<nsIPrefBranch> prefBranch =
      do_GetService(NS_PREFSERVICE_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, false);
  // This pref might not exist, which is OK.
  (void)prefBranch->GetBoolPref("mail.check_all_imap_folders_for_new",
                                &checkAllFolders);

  if (checkAllFolders) return true;

  // If the legacy preference doesn't exist or has its default value (False),
  // the true preference is read.
  imapServer->GetCheckAllFoldersForNew(&checkAllFolders);
  return checkAllFolders;
}

// Called by Biff, or when user presses GetMsg button.
NS_IMETHODIMP nsImapMailFolder::GetNewMessages(nsIMsgWindow* aWindow,
                                               nsIUrlListener* aListener) {
  nsCOMPtr<nsIMsgFolder> rootFolder;
  nsresult rv = GetRootFolder(getter_AddRefs(rootFolder));
  if (NS_SUCCEEDED(rv) && rootFolder) {
    nsCOMPtr<nsIImapIncomingServer> imapServer;
    rv = GetImapIncomingServer(getter_AddRefs(imapServer));
    NS_ENSURE_SUCCESS(rv, rv);
    bool performingBiff = false;
    nsCOMPtr<nsIMsgIncomingServer> incomingServer =
        do_QueryInterface(imapServer, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    incomingServer->GetPerformingBiff(&performingBiff);
    m_urlListener = aListener;

    // See if we should check all folders for new messages, or just the inbox
    // and marked ones
    bool checkAllFolders = ShouldCheckAllFolders(imapServer);

    // Get new messages for inbox
    nsCOMPtr<nsIMsgFolder> inbox;
    rv = rootFolder->GetFolderWithFlags(nsMsgFolderFlags::Inbox,
                                        getter_AddRefs(inbox));
    if (inbox) {
      nsCOMPtr<nsIMsgImapMailFolder> imapFolder = do_QueryInterface(inbox, &rv);
      NS_ENSURE_SUCCESS(rv, rv);
      imapFolder->SetPerformingBiff(performingBiff);
      inbox->SetGettingNewMessages(true);
      rv = inbox->UpdateFolder(aWindow);
    }
    // Get new messages for other folders if marked, or all of them if the pref
    // is set
    rv = imapServer->GetNewMessagesForNonInboxFolders(
        rootFolder, aWindow, checkAllFolders, performingBiff);
  }
  return rv;
}

NS_IMETHODIMP nsImapMailFolder::Shutdown(bool shutdownChildren) {
  m_filterList = nullptr;
  m_initialized = false;
  // mPath is used to decide if folder pathname needs to be reconstructed in
  // GetPath().
  mPath = nullptr;
  m_moveCoalescer = nullptr;
  m_msgParser = nullptr;
  if (m_playbackTimer) {
    m_playbackTimer->Cancel();
    m_playbackTimer = nullptr;
  }
  m_pendingOfflineMoves.Clear();
  return nsMsgDBFolder::Shutdown(shutdownChildren);
}

nsresult nsImapMailFolder::GetBodysToDownload(
    nsTArray<nsMsgKey>* keysOfMessagesToDownload) {
  NS_ENSURE_ARG(keysOfMessagesToDownload);
  NS_ENSURE_TRUE(mDatabase, NS_ERROR_FAILURE);

  nsCOMPtr<nsIMsgEnumerator> enumerator;
  nsresult rv = mDatabase->EnumerateMessages(getter_AddRefs(enumerator));
  if (NS_SUCCEEDED(rv) && enumerator) {
    bool hasMore;
    nsCOMPtr<nsIMsgDBHdr> header;
    nsMsgKey msgKey;
    while (NS_SUCCEEDED(rv = enumerator->HasMoreElements(&hasMore)) &&
           hasMore) {
      rv = enumerator->GetNext(getter_AddRefs(header));
      NS_ENSURE_SUCCESS(rv, rv);
      bool shouldStoreMsgOffline = false;
      header->GetMessageKey(&msgKey);
      // MsgFitsDownloadCriteria ignores nsMsgFolderFlags::Offline, which we
      // want
      if (m_downloadingFolderForOfflineUse)
        MsgFitsDownloadCriteria(msgKey, &shouldStoreMsgOffline);
      else
        ShouldStoreMsgOffline(msgKey, &shouldStoreMsgOffline);
      if (shouldStoreMsgOffline)
        keysOfMessagesToDownload->AppendElement(msgKey);
    }
    if (MOZ_LOG_TEST(gAutoSyncLog, mozilla::LogLevel::Debug) && header) {
      // Log this only if folder is not empty.
      uint32_t msgFlags = 0;
      header->GetFlags(&msgFlags);
      MOZ_LOG(gAutoSyncLog, mozilla::LogLevel::Debug,
              ("%s: num keys to download=%zu, last key=%d, last msg flag=0x%x "
               "nsMsgMessageFlags::Offline=0x%x",
               __func__, keysOfMessagesToDownload->Length(), msgKey, msgFlags,
               nsMsgMessageFlags::Offline));
    }
  }
  return rv;
}

NS_IMETHODIMP nsImapMailFolder::OnNewIdleMessages() {
  nsresult rv;
  nsCOMPtr<nsIImapIncomingServer> imapServer;
  rv = GetImapIncomingServer(getter_AddRefs(imapServer));
  NS_ENSURE_SUCCESS(rv, rv);

  bool checkAllFolders = ShouldCheckAllFolders(imapServer);

  // only trigger biff if we're checking all new folders for new messages, or
  // this particular folder, but excluding trash,junk, sent, and no select
  // folders, by default.
  if ((checkAllFolders &&
       !(mFlags &
         (nsMsgFolderFlags::Trash | nsMsgFolderFlags::Junk |
          nsMsgFolderFlags::SentMail | nsMsgFolderFlags::ImapNoselect))) ||
      (mFlags & (nsMsgFolderFlags::CheckNew | nsMsgFolderFlags::Inbox)))
    SetPerformingBiff(true);
  return UpdateFolder(nullptr);
}

NS_IMETHODIMP nsImapMailFolder::UpdateImapMailboxInfo(
    nsIImapProtocol* aProtocol, nsIMailboxSpec* aSpec) {
  nsresult rv;
  ChangeNumPendingTotalMessages(-mNumPendingTotalMessages);
  ChangeNumPendingUnread(-mNumPendingUnreadMessages);
  m_numServerRecentMessages = 0;  // clear this since we selected the folder.

  if (!mDatabase) GetDatabase();

  bool folderSelected;
  rv = aSpec->GetFolderSelected(&folderSelected);
  NS_ENSURE_SUCCESS(rv, rv);
  nsTArray<nsMsgKey> existingKeys;
  nsTArray<nsMsgKey> keysToDelete;
  uint32_t numNewUnread;
  nsCOMPtr<nsIDBFolderInfo> dbFolderInfo;
  int32_t imapUIDValidity = 0;
  if (mDatabase) {
    rv = mDatabase->GetDBFolderInfo(getter_AddRefs(dbFolderInfo));
    if (NS_SUCCEEDED(rv) && dbFolderInfo) {
      dbFolderInfo->GetImapUidValidity(&imapUIDValidity);
      uint64_t mailboxHighestModSeq;
      aSpec->GetHighestModSeq(&mailboxHighestModSeq);
      MOZ_LOG(IMAP_CS, mozilla::LogLevel::Debug,
              ("UpdateImapMailboxInfo(): Store highest MODSEQ=%" PRIu64
               " for folder=%s",
               mailboxHighestModSeq, m_onlineFolderName.get()));
      char intStrBuf[40];
      PR_snprintf(intStrBuf, sizeof(intStrBuf), "%llu", mailboxHighestModSeq);
      dbFolderInfo->SetCharProperty(kModSeqPropertyName,
                                    nsDependentCString(intStrBuf));
    }
    nsTArray<nsMsgKey> keys;
    rv = mDatabase->ListAllKeys(keys);
    NS_ENSURE_SUCCESS(rv, rv);
    existingKeys.AppendElements(keys);
    nsCOMPtr<nsIMsgOfflineOpsDatabase> opsDb =
        do_QueryInterface(mDatabase, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    opsDb->ListAllOfflineDeletes(existingKeys);
  }
  int32_t folderValidity;
  aSpec->GetFolder_UIDVALIDITY(&folderValidity);
  nsCOMPtr<nsIImapFlagAndUidState> flagState;
  aSpec->GetFlagState(getter_AddRefs(flagState));

  // remember what the supported user flags are.
  uint32_t supportedUserFlags;
  aSpec->GetSupportedUserFlags(&supportedUserFlags);
  SetSupportedUserFlags(supportedUserFlags);

  m_uidValidity = folderValidity;

  if (imapUIDValidity != folderValidity) {
    NS_ASSERTION(imapUIDValidity == kUidUnknown,
                 "uid validity seems to have changed, blowing away db");
    nsCOMPtr<nsIFile> pathFile;
    rv = GetFilePath(getter_AddRefs(pathFile));
    if (NS_FAILED(rv)) return rv;

    nsCOMPtr<nsIMsgDBService> msgDBService =
        do_GetService("@mozilla.org/msgDatabase/msgDBService;1", &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIPropertyBag2> transferInfo;
    if (dbFolderInfo)
      dbFolderInfo->GetTransferInfo(getter_AddRefs(transferInfo));

    // A backup message database might have been created earlier, for example
    // if the user requested a reindex. We'll use the earlier one if we can,
    // otherwise we'll try to backup at this point.
    nsresult rvbackup = OpenBackupMsgDatabase();
    if (mDatabase) {
      dbFolderInfo = nullptr;
      if (NS_FAILED(rvbackup)) {
        CloseAndBackupFolderDB(EmptyCString());
        if (NS_FAILED(OpenBackupMsgDatabase()) && mBackupDatabase) {
          mBackupDatabase->RemoveListener(this);
          mBackupDatabase = nullptr;
        }
      } else
        mDatabase->ForceClosed();
    }
    mDatabase = nullptr;

    nsCOMPtr<nsIFile> summaryFile;
    rv = GetSummaryFileLocation(pathFile, getter_AddRefs(summaryFile));
    // Remove summary file.
    if (NS_SUCCEEDED(rv) && summaryFile) summaryFile->Remove(false);

    // Create a new summary file, update the folder message counts, and
    // Close the summary file db.
    rv = msgDBService->CreateNewDB(this, getter_AddRefs(mDatabase));

    if (NS_FAILED(rv) && mDatabase) {
      mDatabase->ForceClosed();
      mDatabase = nullptr;
    } else if (NS_SUCCEEDED(rv) && mDatabase) {
      if (transferInfo) SetDBTransferInfo(transferInfo);

      SummaryChanged();
      if (mDatabase) {
        if (mAddListener) mDatabase->AddListener(this);
        rv = mDatabase->GetDBFolderInfo(getter_AddRefs(dbFolderInfo));
      }
    }
    // store the new UIDVALIDITY value

    if (NS_SUCCEEDED(rv) && dbFolderInfo) {
      dbFolderInfo->SetImapUidValidity(folderValidity);
      // need to forget highest mod seq when uid validity rolls.
      MOZ_LOG(IMAP_CS, mozilla::LogLevel::Debug,
              ("UpdateImapMailboxInfo(): UIDVALIDITY changed, reset highest "
               "MODSEQ and UID for folder=%s",
               m_onlineFolderName.get()));
      dbFolderInfo->SetCharProperty(kModSeqPropertyName, EmptyCString());
      dbFolderInfo->SetUint32Property(kHighestRecordedUIDPropertyName, 0);
    }
    // delete all my msgs, the keys are bogus now
    // add every message in this folder
    existingKeys.Clear();
    //      keysToDelete.CopyArray(&existingKeys);

    if (flagState) {
      nsTArray<nsMsgKey> no_existingKeys;
      FindKeysToAdd(no_existingKeys, m_keysToFetch, numNewUnread, flagState);
    }
    if (NS_FAILED(rv)) pathFile->Remove(false);

  } else if (!flagState /*&& !NET_IsOffline() */)  // if there are no messages
                                                   // on the server
    keysToDelete = existingKeys.Clone();
  else /* if ( !NET_IsOffline()) */
  {
    uint32_t boxFlags;
    aSpec->GetBox_flags(&boxFlags);
    // FindKeysToDelete and FindKeysToAdd require sorted lists
    existingKeys.Sort();
    FindKeysToDelete(existingKeys, keysToDelete, flagState, boxFlags);
    // if this is the result of an expunge then don't grab headers
    if (!(boxFlags & kJustExpunged))
      FindKeysToAdd(existingKeys, m_keysToFetch, numNewUnread, flagState);
  }
  m_totalKeysToFetch = m_keysToFetch.Length();
  if (!keysToDelete.IsEmpty() && mDatabase) {
    nsTArray<RefPtr<nsIMsgDBHdr>> hdrsToDelete;
    MsgGetHeadersFromKeys(mDatabase, keysToDelete, hdrsToDelete);
    // Notify nsIMsgFolderListeners of a mass delete, but only if we actually
    // have headers
    if (!hdrsToDelete.IsEmpty()) {
      nsCOMPtr<nsIMsgFolderNotificationService> notifier(
          do_GetService("@mozilla.org/messenger/msgnotificationservice;1"));
      if (notifier) notifier->NotifyMsgsDeleted(hdrsToDelete);
    }
    DeleteStoreMessages(hdrsToDelete);
    EnableNotifications(nsIMsgFolder::allMessageCountNotifications, false);
    mDatabase->DeleteMessages(keysToDelete, nullptr);
    EnableNotifications(nsIMsgFolder::allMessageCountNotifications, true);
  }
  int32_t numUnreadFromServer;
  aSpec->GetNumUnseenMessages(&numUnreadFromServer);

  bool partialUIDFetch;
  flagState->GetPartialUIDFetch(&partialUIDFetch);

  // For partial UID fetches (i.e., occurs when CONDSTORE in effect), we can
  // only trust the numUnread from the server. However, even that will only be
  // correct if a recent imap STATUS occurred as indicated by
  // numUnreadFromServer greater than -1.
  if (partialUIDFetch) numNewUnread = numUnreadFromServer;

  // If we are performing biff for this folder, tell the
  // stand-alone biff about the new high water mark
  if (m_performingBiff && numNewUnread &&
      static_cast<int32_t>(numNewUnread) != -1) {
    // We must ensure that the server knows that we are performing biff.
    // Otherwise the stand-alone biff won't fire.
    nsCOMPtr<nsIMsgIncomingServer> server;
    if (NS_SUCCEEDED(GetServer(getter_AddRefs(server))) && server)
      server->SetPerformingBiff(true);
    SetNumNewMessages(numNewUnread);
  }
  SyncFlags(flagState);
  if (mDatabase && numUnreadFromServer > -1 &&
      (int32_t)(mNumUnreadMessages + m_keysToFetch.Length()) >
          numUnreadFromServer)
    mDatabase->SyncCounts();

  if (!m_keysToFetch.IsEmpty() && aProtocol)
    PrepareToAddHeadersToMailDB(aProtocol);
  else {
    bool gettingNewMessages;
    GetGettingNewMessages(&gettingNewMessages);
    if (gettingNewMessages)
      ProgressStatusString(aProtocol, "imapNoNewMessages", nullptr);
    SetPerformingBiff(false);
  }
  aSpec->GetNumMessages(&m_numServerTotalMessages);
  if (numUnreadFromServer > -1) m_numServerUnseenMessages = numUnreadFromServer;
  aSpec->GetNumRecentMessages(&m_numServerRecentMessages);

  // some servers don't return UIDNEXT on SELECT - don't crunch
  // existing values in that case.
  int32_t nextUID;
  aSpec->GetNextUID(&nextUID);
  if (nextUID != (int32_t)nsMsgKey_None) m_nextUID = nextUID;

  return rv;
}

/**
 * Called after successful imap STATUS response occurs. Have valid unseen value
 * if folderstatus URL produced an imap STATUS. If a NOOP occurs instead (doing
 * folderstatus from a connection SELECTed on the same folder) there is no
 * UNSEEN returned by NOOP.
 */
NS_IMETHODIMP nsImapMailFolder::UpdateImapMailboxStatus(
    nsIImapProtocol* aProtocol, nsIMailboxSpec* aSpec) {
  NS_ENSURE_ARG_POINTER(aSpec);
  int32_t numUnread, numTotal;
  aSpec->GetNumUnseenMessages(&numUnread);
  aSpec->GetNumMessages(&numTotal);
  aSpec->GetNumRecentMessages(&m_numServerRecentMessages);
  int32_t prevNextUID = m_nextUID;
  aSpec->GetNextUID(&m_nextUID);
  bool summaryChanged = false;

  // If m_numServerUnseenMessages is 0, it means
  // this is the first time we've done a Status.
  // In that case, we count all the previous pending unread messages we know
  // about as unread messages. We may want to do similar things with total
  // messages, but the total messages include deleted messages if the folder
  // hasn't been expunged.
  int32_t previousUnreadMessages =
      (m_numServerUnseenMessages)
          ? m_numServerUnseenMessages
          : mNumPendingUnreadMessages + mNumUnreadMessages;
  if (numUnread == -1) {
    // A noop occurred so don't know server's UNSEEN number, keep using the
    // previously known unread count.
    MOZ_LOG(IMAP, mozilla::LogLevel::Debug,
            ("%s: folder=%s, unread was -1, set numUnread to previousUnread=%d",
             __func__, m_onlineFolderName.get(), previousUnreadMessages));
    numUnread = previousUnreadMessages;
  }
  if (numUnread != previousUnreadMessages || m_nextUID != prevNextUID) {
    int32_t unreadDelta =
        numUnread - (mNumPendingUnreadMessages + mNumUnreadMessages);
    if (numUnread - previousUnreadMessages != unreadDelta)
      NS_WARNING("unread count should match server count");
    ChangeNumPendingUnread(unreadDelta);
    if (unreadDelta > 0 &&
        !(mFlags & (nsMsgFolderFlags::Trash | nsMsgFolderFlags::Junk))) {
      SetHasNewMessages(true);
      SetNumNewMessages(unreadDelta);
      SetBiffState(nsMsgBiffState_NewMail);
    }
    summaryChanged = true;
  }
  SetPerformingBiff(false);
  if (m_numServerUnseenMessages != numUnread ||
      m_numServerTotalMessages != numTotal) {
    if (numUnread > m_numServerUnseenMessages ||
        m_numServerTotalMessages > numTotal)
      NotifyHasPendingMsgs();
    summaryChanged = true;
    m_numServerUnseenMessages = numUnread;
    m_numServerTotalMessages = numTotal;
  }
  if (summaryChanged) SummaryChanged();

  return NS_OK;
}

// nsIImapMailFolderSink.parseMsgHdrs()
NS_IMETHODIMP nsImapMailFolder::ParseMsgHdrs(
    nsIImapProtocol* aProtocol, nsIImapHeaderXferInfo* aHdrXferInfo) {
  NS_ENSURE_ARG_POINTER(aHdrXferInfo);
  int32_t numHdrs;
  nsCOMPtr<nsIImapHeaderInfo> headerInfo;
  nsCOMPtr<nsIImapUrl> aImapUrl;
  nsImapAction imapAction = nsIImapUrl::nsImapTest;  // unused value.
  if (!mDatabase) GetDatabase();

  nsresult rv = aHdrXferInfo->GetNumHeaders(&numHdrs);
  if (aProtocol) {
    (void)aProtocol->GetRunningImapURL(getter_AddRefs(aImapUrl));
    if (aImapUrl) aImapUrl->GetImapAction(&imapAction);
  }
  for (uint32_t i = 0; NS_SUCCEEDED(rv) && (int32_t)i < numHdrs; i++) {
    rv = aHdrXferInfo->GetHeader(i, getter_AddRefs(headerInfo));
    NS_ENSURE_SUCCESS(rv, rv);
    if (!headerInfo) break;
    int32_t msgSize;
    nsMsgKey msgKey;
    bool containsKey;
    nsCString msgHdrs;
    headerInfo->GetMsgSize(&msgSize);
    headerInfo->GetMsgUid(&msgKey);
    if (msgKey == nsMsgKey_None)  // not a valid uid.
      continue;
    if (imapAction == nsIImapUrl::nsImapMsgPreview) {
      nsCOMPtr<nsIMsgDBHdr> msgHdr;
      headerInfo->GetMsgHdrs(msgHdrs);
      // create an input stream based on the hdr string.
      nsCOMPtr<nsIStringInputStream> inputStream =
          do_CreateInstance("@mozilla.org/io/string-input-stream;1", &rv);
      NS_ENSURE_SUCCESS(rv, rv);
      inputStream->ShareData(msgHdrs.get(), msgHdrs.Length());
      GetMessageHeader(msgKey, getter_AddRefs(msgHdr));
      if (msgHdr) {
        GetMsgPreviewTextFromStream(msgHdr, inputStream);
      }
      continue;
    }
    if (mDatabase &&
        NS_SUCCEEDED(mDatabase->ContainsKey(msgKey, &containsKey)) &&
        containsKey) {
      NS_ERROR("downloading hdrs for hdr we already have");
      continue;
    }
    nsresult rv = SetupHeaderParseStream(msgSize, EmptyCString(), nullptr);
    NS_ENSURE_SUCCESS(rv, rv);
    headerInfo->GetMsgHdrs(msgHdrs);  // The raw header block.
    rv = ParseAdoptedHeaderLine(msgHdrs.get(), msgKey);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = NormalEndHeaderParseStream(aProtocol, aImapUrl);
  }
  return rv;
}

// Helper for ParseMsgHdrs().
nsresult nsImapMailFolder::SetupHeaderParseStream(
    uint32_t aSize, const nsACString& content_type, nsIMailboxSpec* boxSpec) {
  if (!mDatabase) GetDatabase();
  m_nextMessageByteLength = aSize;
  if (!m_msgParser) {
    nsresult rv;
    m_msgParser = do_CreateInstance(kParseMailMsgStateCID, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
  } else
    m_msgParser->Clear();

  m_msgParser->SetMailDB(mDatabase);
  if (mBackupDatabase) m_msgParser->SetBackupMailDB(mBackupDatabase);
  return m_msgParser->SetState(nsIMsgParseMailMsgState::ParseHeadersState);
}

// Helper for ParseMsgHdrs().
nsresult nsImapMailFolder::ParseAdoptedHeaderLine(const char* aMessageLine,
                                                  nsMsgKey aMsgKey) {
  // we can get blocks that contain more than one line,
  // but they never contain partial lines
  const char* str = aMessageLine;
  m_curMsgUid = aMsgKey;
  m_msgParser->SetNewKey(m_curMsgUid);
  // m_envelope_pos, for local folders,
  // is the msg key. Setting this will set the msg key for the new header.

  int32_t len = strlen(str);
  char* currentEOL = PL_strstr(str, MSG_LINEBREAK);
  const char* currentLine = str;
  while (currentLine < (str + len)) {
    if (currentEOL) {
      m_msgParser->ParseAFolderLine(
          currentLine, (currentEOL + MSG_LINEBREAK_LEN) - currentLine);
      currentLine = currentEOL + MSG_LINEBREAK_LEN;
      currentEOL = PL_strstr(currentLine, MSG_LINEBREAK);
    } else {
      m_msgParser->ParseAFolderLine(currentLine, PL_strlen(currentLine));
      currentLine = str + len + 1;
    }
  }
  return NS_OK;
}

// Helper for ParseMsgHdrs().
nsresult nsImapMailFolder::NormalEndHeaderParseStream(
    nsIImapProtocol* aProtocol, nsIImapUrl* imapUrl) {
  nsCOMPtr<nsIMsgDBHdr> newMsgHdr;
  nsresult rv;
  NS_ENSURE_TRUE(m_msgParser, NS_ERROR_NULL_POINTER);

  auto uidClear = mozilla::MakeScopeExit([&] { m_curMsgUid = 0; });

  nsMailboxParseState parseState;
  m_msgParser->GetState(&parseState);
  if (parseState == nsIMsgParseMailMsgState::ParseHeadersState)
    m_msgParser->ParseAFolderLine(CRLF, 2);
  rv = m_msgParser->GetNewMsgHdr(getter_AddRefs(newMsgHdr));
  NS_ENSURE_SUCCESS(rv, rv);

  char* headers;
  int32_t headersSize;

  nsCOMPtr<nsIMsgWindow> msgWindow;
  nsCOMPtr<nsIMsgMailNewsUrl> msgUrl;
  if (imapUrl) {
    msgUrl = do_QueryInterface(imapUrl, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    msgUrl->GetMsgWindow(getter_AddRefs(msgWindow));
  }

  nsCOMPtr<nsIMsgIncomingServer> server;
  rv = GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIImapIncomingServer> imapServer = do_QueryInterface(server);
  rv = imapServer->GetIsGMailServer(&m_isGmailServer);
  NS_ENSURE_SUCCESS(rv, rv);

  newMsgHdr->SetMessageKey(m_curMsgUid);
  TweakHeaderFlags(aProtocol, newMsgHdr);
  uint32_t messageSize;
  if (NS_SUCCEEDED(newMsgHdr->GetMessageSize(&messageSize)))
    mFolderSize += messageSize;
  m_msgMovedByFilter = false;

  nsMsgKey highestUid = 0;
  nsCOMPtr<nsIDBFolderInfo> dbFolderInfo;
  if (mDatabase) mDatabase->GetDBFolderInfo(getter_AddRefs(dbFolderInfo));
  if (dbFolderInfo) {
    dbFolderInfo->GetUint32Property(kHighestRecordedUIDPropertyName, 0,
                                    &highestUid);
    MOZ_LOG(IMAP_CS, mozilla::LogLevel::Debug,
            ("NormalEndHeaderParseStream(): got stored highest UID=%" PRIu32
             " for folder=%s",
             highestUid, m_onlineFolderName.get()));
    if (m_curMsgUid > highestUid) {
      // Most imap servers fetch UIDs in increasing/ascending order so only
      // this "if" branch will occur. Servers that fetch in descending order
      // (e.g., Yahoo) will take this branch the on the first header fetch and
      // then take the "else" branch for any remaining headers using the saved
      // previous highest UID.
      m_previousHighestUid = highestUid;
      MOZ_LOG(IMAP_CS, mozilla::LogLevel::Debug,
              ("NormalEndHeaderParseStream(): store new highest UID=%" PRIu32
               " for folder=%s",
               m_curMsgUid, m_onlineFolderName.get()));
      dbFolderInfo->SetUint32Property(kHighestRecordedUIDPropertyName,
                                      m_curMsgUid);
    } else {
      // Some imap servers fetch UIDs in descending order, e.g., Yahoo.
      // This only occurs if more than one header for new messages are fetched
      // and the UID for this header is smaller than the saved previous UID.
      highestUid = m_previousHighestUid;
      MOZ_LOG(
          IMAP_CS, mozilla::LogLevel::Debug,
          ("NormalEndHeaderParseStream(): (descending) got highest UID=%" PRIu32
           " for folder=%s",
           highestUid, m_onlineFolderName.get()));
    }
  }

  // If this is the inbox, try to apply filters. Otherwise, test the inherited
  // folder property "applyIncomingFilters" (which defaults to empty). If this
  // inherited property has the string value "true", then apply filters even
  // if this is not the Inbox folder.
  if (mFlags & nsMsgFolderFlags::Inbox || m_applyIncomingFilters) {
    // Use highwater to determine whether to filter?
    bool filterOnHighwater = false;
    nsCOMPtr<nsIPrefBranch> prefBranch(
        do_GetService(NS_PREFSERVICE_CONTRACTID));
    if (prefBranch)
      prefBranch->GetBoolPref("mail.imap.filter_on_new", &filterOnHighwater);

    uint32_t msgFlags;
    newMsgHdr->GetFlags(&msgFlags);

    // clang-format off
    bool doFilter = filterOnHighwater
      // Filter on largest UUID and not deleted.
      ? m_curMsgUid > highestUid && !(msgFlags & nsMsgMessageFlags::IMAPDeleted)
      // Filter on unread and not deleted.
      : !(msgFlags & (nsMsgMessageFlags::Read | nsMsgMessageFlags::IMAPDeleted));
    // clang-format on

    if (doFilter)
      MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
              ("(Imap) New message parsed, and filters will be run on it"));
    else
      MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
              ("(Imap) New message parsed, but filters will not be run on it"));

    if (doFilter) {
      int32_t duplicateAction = nsIMsgIncomingServer::keepDups;
      if (server) server->GetIncomingDuplicateAction(&duplicateAction);
      if ((duplicateAction != nsIMsgIncomingServer::keepDups) &&
          mFlags & nsMsgFolderFlags::Inbox) {
        bool isDup;
        server->IsNewHdrDuplicate(newMsgHdr, &isDup);
        if (isDup) {
          // we want to do something similar to applying filter hits.
          // if a dup is marked read, it shouldn't trigger biff.
          // Same for deleting it or moving it to trash.
          switch (duplicateAction) {
            case nsIMsgIncomingServer::deleteDups: {
              uint32_t newFlags;
              newMsgHdr->OrFlags(
                  nsMsgMessageFlags::Read | nsMsgMessageFlags::IMAPDeleted,
                  &newFlags);
              StoreImapFlags(kImapMsgSeenFlag | kImapMsgDeletedFlag, true,
                             {m_curMsgUid}, nullptr);
              m_msgMovedByFilter = true;
            } break;
            case nsIMsgIncomingServer::moveDupsToTrash: {
              nsCOMPtr<nsIMsgFolder> trash;
              GetTrashFolder(getter_AddRefs(trash));
              if (trash) {
                nsCString trashUri;
                trash->GetURI(trashUri);
                nsresult err = MoveIncorporatedMessage(
                    newMsgHdr, mDatabase, trashUri, nullptr, msgWindow);
                if (NS_SUCCEEDED(err)) m_msgMovedByFilter = true;
              }
            } break;
            case nsIMsgIncomingServer::markDupsRead: {
              uint32_t newFlags;
              newMsgHdr->OrFlags(nsMsgMessageFlags::Read, &newFlags);
              StoreImapFlags(kImapMsgSeenFlag, true, {m_curMsgUid}, nullptr);
            } break;
          }
          int32_t numNewMessages;
          GetNumNewMessages(false, &numNewMessages);
          SetNumNewMessages(numNewMessages - 1);
        }
      }
      rv = m_msgParser->GetAllHeaders(&headers, &headersSize);

      if (NS_SUCCEEDED(rv) && headers && !m_msgMovedByFilter &&
          !m_filterListRequiresBody) {
        if (m_filterList) {
          GetMoveCoalescer();  // not sure why we're doing this here.
          MOZ_LOG(FILTERLOGMODULE, LogLevel::Debug,
                  ("(Imap) ApplyFilterToHdr from "
                   "nsImapMailFolder::NormalEndHeaderParseStream()"));
          m_filterList->ApplyFiltersToHdr(
              nsMsgFilterType::InboxRule, newMsgHdr, this, mDatabase,
              nsDependentCSubstring(headers, headersSize), this, msgWindow);
          NotifyFolderEvent(kFiltersApplied);
        }
      }
    }
  }
  // here we need to tweak flags from uid state..
  if (mDatabase && (!m_msgMovedByFilter || ShowDeletedMessages())) {
    nsCOMPtr<nsIMsgFolderNotificationService> notifier(
        do_GetService("@mozilla.org/messenger/msgnotificationservice;1"));
    // Check if this header corresponds to a pseudo header
    // we have from doing a pseudo-offline move and then downloading
    // the real header from the server. In that case, we notify
    // db/folder listeners that the pseudo-header has become the new
    // header, i.e., the key has changed.
    nsCString newMessageId;
    newMsgHdr->GetMessageId(newMessageId);
    nsMsgKey pseudoKey =
        m_pseudoHdrs.MaybeGet(newMessageId).valueOr(nsMsgKey_None);
    if (notifier && pseudoKey != nsMsgKey_None) {
      notifier->NotifyMsgKeyChanged(pseudoKey, newMsgHdr);
      m_pseudoHdrs.Remove(newMessageId);
    }
    mDatabase->AddNewHdrToDB(newMsgHdr, true);
    if (notifier) notifier->NotifyMsgAdded(newMsgHdr);
    // mark the header as not yet reported classified
    OrProcessingFlags(m_curMsgUid, nsMsgProcessingFlags::NotReportedClassified);
  }

  if (m_isGmailServer) {
    nsCOMPtr<nsIImapFlagAndUidState> flagState;
    aProtocol->GetFlagAndUidState(getter_AddRefs(flagState));
    nsCString msgIDValue;
    nsCString threadIDValue;
    nsCString labelsValue;
    flagState->GetCustomAttribute(m_curMsgUid, "X-GM-MSGID"_ns, msgIDValue);
    flagState->GetCustomAttribute(m_curMsgUid, "X-GM-THRID"_ns, threadIDValue);
    flagState->GetCustomAttribute(m_curMsgUid, "X-GM-LABELS"_ns, labelsValue);
    newMsgHdr->SetStringProperty("X-GM-MSGID", msgIDValue);
    newMsgHdr->SetStringProperty("X-GM-THRID", threadIDValue);
    newMsgHdr->SetStringProperty("X-GM-LABELS", labelsValue);
  }

  m_msgParser->Clear();  // clear out parser, because it holds onto a msg hdr.
  m_msgParser->SetMailDB(nullptr);  // tell it to let go of the db too.
  // I don't think we want to do this - it does bad things like set the size
  // incorrectly.
  //    m_msgParser->FinishHeader();
  return NS_OK;
}

// From nsIImapMailFolderSink.
NS_IMETHODIMP nsImapMailFolder::AbortHeaderParseStream(
    nsIImapProtocol* aProtocol) {
  m_curMsgUid = 0;
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::BeginCopy() {
  NS_ENSURE_TRUE(m_copyState, NS_ERROR_NULL_POINTER);
  nsresult rv;
  if (m_copyState->m_tmpFile)  // leftover file spec nuke it
  {
    rv = m_copyState->m_tmpFile->Remove(false);
    if (NS_FAILED(rv)) {
      nsCString nativePath = m_copyState->m_tmpFile->HumanReadablePath();
      MOZ_LOG(IMAP, mozilla::LogLevel::Info,
              ("couldn't remove prev temp file %s: %" PRIx32, nativePath.get(),
               static_cast<uint32_t>(rv)));
    }
    m_copyState->m_tmpFile = nullptr;
  }

  rv = NS_OpenAnonymousTemporaryNsIFile(getter_AddRefs(m_copyState->m_tmpFile));
  if (NS_FAILED(rv)) {
    MOZ_LOG(IMAP, mozilla::LogLevel::Info,
            ("Couldn't create temp file: %" PRIx32, static_cast<uint32_t>(rv)));
    OnCopyCompleted(m_copyState->m_srcSupport, rv);
  }
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIOutputStream> fileOutputStream;
  rv = MsgNewBufferedFileOutputStream(
      getter_AddRefs(m_copyState->m_msgFileStream), m_copyState->m_tmpFile, -1,
      00600);
  if (NS_FAILED(rv))
    MOZ_LOG(IMAP, mozilla::LogLevel::Info,
            ("couldn't create output file stream: %" PRIx32,
             static_cast<uint32_t>(rv)));

  if (!m_copyState->m_dataBuffer)
    m_copyState->m_dataBuffer = (char*)PR_CALLOC(COPY_BUFFER_SIZE + 1);
  NS_ENSURE_TRUE(m_copyState->m_dataBuffer, NS_ERROR_OUT_OF_MEMORY);
  m_copyState->m_dataBufferSize = COPY_BUFFER_SIZE;
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::CopyDataToOutputStreamForAppend(
    nsIInputStream* aIStream, int32_t aLength, nsIOutputStream* outputStream) {
  uint32_t readCount;
  uint32_t writeCount;
  if (!m_copyState) m_copyState = new nsImapMailCopyState();

  if (aLength + m_copyState->m_leftOver > m_copyState->m_dataBufferSize) {
    char* newBuffer = (char*)PR_REALLOC(m_copyState->m_dataBuffer,
                                        aLength + m_copyState->m_leftOver + 1);
    NS_ENSURE_TRUE(newBuffer, NS_ERROR_OUT_OF_MEMORY);
    m_copyState->m_dataBuffer = newBuffer;
    m_copyState->m_dataBufferSize = aLength + m_copyState->m_leftOver;
  }

  char *start, *end;
  uint32_t linebreak_len = 1;

  nsresult rv = aIStream->Read(
      m_copyState->m_dataBuffer + m_copyState->m_leftOver, aLength, &readCount);
  if (NS_FAILED(rv)) return rv;

  m_copyState->m_leftOver += readCount;
  m_copyState->m_dataBuffer[m_copyState->m_leftOver] = '\0';

  start = m_copyState->m_dataBuffer;
  if (m_copyState->m_eatLF) {
    if (*start == '\n') start++;
    m_copyState->m_eatLF = false;
  }
  end = PL_strpbrk(start, "\r\n");
  if (end && *end == '\r' && *(end + 1) == '\n') linebreak_len = 2;

  while (start && end) {
    if (PL_strncasecmp(start, "X-Mozilla-Status:", 17) &&
        PL_strncasecmp(start, "X-Mozilla-Status2:", 18) &&
        PL_strncmp(start, "From - ", 7)) {
      rv = outputStream->Write(start, end - start, &writeCount);
      rv = outputStream->Write(CRLF, 2, &writeCount);
    }
    start = end + linebreak_len;
    if (start >= m_copyState->m_dataBuffer + m_copyState->m_leftOver) {
      m_copyState->m_leftOver = 0;
      break;
    }
    linebreak_len = 1;

    end = PL_strpbrk(start, "\r\n");
    if (end && *end == '\r') {
      if (*(end + 1) == '\n')
        linebreak_len = 2;
      else if (!*(end + 1))  // block might have split CRLF so remember if
        m_copyState->m_eatLF = true;  // we should eat LF
    }

    if (start && !end) {
      m_copyState->m_leftOver -= (start - m_copyState->m_dataBuffer);
      memcpy(m_copyState->m_dataBuffer, start,
             m_copyState->m_leftOver + 1);  // including null
    }
  }
  return rv;
}

NS_IMETHODIMP nsImapMailFolder::CopyDataDone() {
  m_copyState = nullptr;
  return NS_OK;
}

// sICopyMessageListener methods, BeginCopy, CopyData, EndCopy, EndMove,
// StartMessage, EndMessage
NS_IMETHODIMP nsImapMailFolder::CopyData(nsIInputStream* aIStream,
                                         int32_t aLength) {
  NS_ENSURE_TRUE(
      m_copyState && m_copyState->m_msgFileStream && m_copyState->m_dataBuffer,
      NS_ERROR_NULL_POINTER);
  nsresult rv = CopyDataToOutputStreamForAppend(aIStream, aLength,
                                                m_copyState->m_msgFileStream);
  if (NS_FAILED(rv)) {
    MOZ_LOG(IMAP, mozilla::LogLevel::Info,
            ("CopyData failed: %" PRIx32, static_cast<uint32_t>(rv)));
    OnCopyCompleted(m_copyState->m_srcSupport, rv);
  }
  return rv;
}

NS_IMETHODIMP nsImapMailFolder::EndCopy(bool copySucceeded) {
  nsresult rv = copySucceeded ? NS_OK : NS_ERROR_FAILURE;
  if (copySucceeded && m_copyState && m_copyState->m_msgFileStream) {
    nsCOMPtr<nsIUrlListener> urlListener;
    m_copyState->m_msgFileStream->Close();
    // m_tmpFile can be stale because we wrote to it
    nsCOMPtr<nsIFile> tmpFile;
    m_copyState->m_tmpFile->Clone(getter_AddRefs(tmpFile));
    m_copyState->m_tmpFile = tmpFile;
    nsCOMPtr<nsIImapService> imapService =
        do_GetService("@mozilla.org/messenger/imapservice;1", &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    rv =
        QueryInterface(NS_GET_IID(nsIUrlListener), getter_AddRefs(urlListener));
    rv = imapService->AppendMessageFromFile(
        m_copyState->m_tmpFile, this, EmptyCString(), true,
        m_copyState->m_selectedState, urlListener, m_copyState,
        m_copyState->m_msgWindow);
  }
  if (NS_FAILED(rv) || !copySucceeded)
    MOZ_LOG(IMAP, mozilla::LogLevel::Info,
            ("EndCopy failed: %" PRIx32, static_cast<uint32_t>(rv)));
  return rv;
}

NS_IMETHODIMP nsImapMailFolder::EndMove(bool moveSucceeded) { return NS_OK; }
// this is the beginning of the next message copied
NS_IMETHODIMP nsImapMailFolder::StartMessage() { return NS_OK; }

// just finished the current message.
NS_IMETHODIMP nsImapMailFolder::EndMessage(nsMsgKey key) { return NS_OK; }

NS_IMETHODIMP nsImapMailFolder::ApplyFilterHit(nsIMsgFilter* filter,
                                               nsIMsgWindow* msgWindow,
                                               bool* applyMore) {
  //
  //  This routine is called indirectly from ApplyFiltersToHdr in two
  //  circumstances, controlled by m_filterListRequiresBody:
  //
  //  If false, after headers are parsed in NormalEndHeaderParseStream.
  //  If true, after the message body is downloaded in NormalEndMsgWriteStream.
  //
  //  In NormalEndHeaderParseStream, the message has not been added to the
  //  database, and it is important that database notifications and count
  //  updates do not occur. In NormalEndMsgWriteStream, the message has been
  //  added to the database, and database notifications and count updates
  //  should be performed.
  //

  NS_ENSURE_ARG_POINTER(filter);
  NS_ENSURE_ARG_POINTER(applyMore);

  nsresult rv = NS_OK;

  nsCOMPtr<nsIMsgDBHdr> msgHdr;
  if (m_filterListRequiresBody)
    GetMessageHeader(m_curMsgUid, getter_AddRefs(msgHdr));
  else if (m_msgParser)
    m_msgParser->GetNewMsgHdr(getter_AddRefs(msgHdr));
  NS_ENSURE_TRUE(msgHdr,
                 NS_ERROR_NULL_POINTER);  // fatal error, cannot apply filters

  bool deleteToTrash = DeleteIsMoveToTrash();

  nsTArray<RefPtr<nsIMsgRuleAction>> filterActionList;
  rv = filter->GetSortedActionList(filterActionList);
  NS_ENSURE_SUCCESS(rv, rv);

  uint32_t numActions = filterActionList.Length();

  nsCString msgId;
  msgHdr->GetMessageId(msgId);
  nsMsgKey msgKey;
  msgHdr->GetMessageKey(&msgKey);
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
          ("(Imap) Applying %" PRIu32
           " filter actions on message with key %" PRIu32,
           numActions, msgKeyToInt(msgKey)));
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Debug,
          ("(Imap) Message ID: %s", msgId.get()));

  bool loggingEnabled = false;
  if (m_filterList && numActions)
    (void)m_filterList->GetLoggingEnabled(&loggingEnabled);

  bool msgIsNew = true;

  rv = GetDatabase();
  NS_ENSURE_SUCCESS(rv, rv);

  nsresult finalResult = NS_OK;  // result of all actions
  for (uint32_t actionIndex = 0; actionIndex < numActions; actionIndex++) {
    nsCOMPtr<nsIMsgRuleAction> filterAction(filterActionList[actionIndex]);
    if (!filterAction) {
      MOZ_LOG(FILTERLOGMODULE, LogLevel::Warning,
              ("(Imap) Filter action at index %" PRIu32 " invalid, skipping",
               actionIndex));
      continue;
    }

    rv = NS_OK;  // result of the current action
    nsMsgRuleActionType actionType;
    if (NS_SUCCEEDED(filterAction->GetType(&actionType))) {
      MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
              ("(Imap) Running filter action at index %" PRIu32
               ", action type = %i",
               actionIndex, actionType));
      if (loggingEnabled) (void)filter->LogRuleHit(filterAction, msgHdr);

      nsCString actionTargetFolderUri;
      if (actionType == nsMsgFilterAction::MoveToFolder ||
          actionType == nsMsgFilterAction::CopyToFolder) {
        rv = filterAction->GetTargetFolderUri(actionTargetFolderUri);
        if (NS_FAILED(rv) || actionTargetFolderUri.IsEmpty()) {
          // clang-format off
          MOZ_LOG(FILTERLOGMODULE, LogLevel::Warning,
                  ("(Imap) Target URI for Copy/Move action is empty, skipping"));
          // clang-format on
          NS_ASSERTION(false, "actionTargetFolderUri is empty");
          continue;
        }
      }

      uint32_t msgFlags;
      msgHdr->GetFlags(&msgFlags);
      bool isRead = (msgFlags & nsMsgMessageFlags::Read);

      switch (actionType) {
        case nsMsgFilterAction::Delete: {
          if (deleteToTrash) {
            // set value to trash folder
            nsCOMPtr<nsIMsgFolder> mailTrash;
            rv = GetTrashFolder(getter_AddRefs(mailTrash));
            if (NS_SUCCEEDED(rv) && mailTrash) {
              rv = mailTrash->GetURI(actionTargetFolderUri);
              if (NS_FAILED(rv)) break;
            }
            // msgHdr->OrFlags(nsMsgMessageFlags::Read, &newFlags);  // mark
            // read in trash.
          } else {
            mDatabase->MarkHdrRead(msgHdr, true, nullptr);
            mDatabase->MarkImapDeleted(msgKey, true, nullptr);
            rv = StoreImapFlags(kImapMsgSeenFlag | kImapMsgDeletedFlag, true,
                                {msgKey}, nullptr);
            if (NS_FAILED(rv)) break;
            // this will prevent us from adding the header to the db.
            m_msgMovedByFilter = true;
          }
          msgIsNew = false;
        }
          // note that delete falls through to move.
          [[fallthrough]];
        case nsMsgFilterAction::MoveToFolder: {
          // if moving to a different file, do it.
          nsCString uri;
          rv = GetURI(uri);
          if (NS_FAILED(rv)) break;

          if (!actionTargetFolderUri.Equals(uri)) {
            msgHdr->GetFlags(&msgFlags);
            if (msgFlags & nsMsgMessageFlags::MDNReportNeeded && !isRead) {
              mDatabase->MarkMDNNeeded(msgKey, false, nullptr);
              mDatabase->MarkMDNSent(msgKey, true, nullptr);
            }
            nsresult rv = MoveIncorporatedMessage(
                msgHdr, mDatabase, actionTargetFolderUri, filter, msgWindow);
            if (NS_SUCCEEDED(rv)) {
              m_msgMovedByFilter = true;
            } else {
              if (loggingEnabled) {
                (void)filter->LogRuleHitFail(filterAction, msgHdr, rv,
                                             "filterFailureMoveFailed"_ns);
              }
            }
          }
          // don't apply any more filters, even if it was a move to the same
          // folder
          *applyMore = false;
        } break;
        case nsMsgFilterAction::CopyToFolder: {
          nsCString uri;
          rv = GetURI(uri);
          if (NS_FAILED(rv)) break;

          if (!actionTargetFolderUri.Equals(uri)) {
            // XXXshaver I'm not actually 100% what the right semantics are for
            // MDNs and copied messages, but I suspect deep down inside that
            // we probably want to suppress them only on the copies.
            msgHdr->GetFlags(&msgFlags);
            if (msgFlags & nsMsgMessageFlags::MDNReportNeeded && !isRead) {
              mDatabase->MarkMDNNeeded(msgKey, false, nullptr);
              mDatabase->MarkMDNSent(msgKey, true, nullptr);
            }

            nsCOMPtr<nsIMsgFolder> dstFolder;
            rv = GetExistingFolder(actionTargetFolderUri,
                                   getter_AddRefs(dstFolder));
            if (NS_FAILED(rv)) break;

            nsCOMPtr<nsIMsgCopyService> copyService = do_GetService(
                "@mozilla.org/messenger/messagecopyservice;1", &rv);
            if (NS_FAILED(rv)) break;
            rv = copyService->CopyMessages(this, {&*msgHdr}, dstFolder, false,
                                           nullptr, msgWindow, false);
            if (NS_FAILED(rv)) {
              if (loggingEnabled) {
                (void)filter->LogRuleHitFail(filterAction, msgHdr, rv,
                                             "filterFailureCopyFailed"_ns);
              }
            }
          }
        } break;
        case nsMsgFilterAction::MarkRead: {
          mDatabase->MarkHdrRead(msgHdr, true, nullptr);
          rv = StoreImapFlags(kImapMsgSeenFlag, true, {msgKey}, nullptr);
          msgIsNew = false;
        } break;
        case nsMsgFilterAction::MarkUnread: {
          mDatabase->MarkHdrRead(msgHdr, false, nullptr);
          rv = StoreImapFlags(kImapMsgSeenFlag, false, {msgKey}, nullptr);
          msgIsNew = true;
        } break;
        case nsMsgFilterAction::MarkFlagged: {
          mDatabase->MarkHdrMarked(msgHdr, true, nullptr);
          rv = StoreImapFlags(kImapMsgFlaggedFlag, true, {msgKey}, nullptr);
        } break;
        case nsMsgFilterAction::KillThread:
        case nsMsgFilterAction::WatchThread: {
          nsCOMPtr<nsIMsgThread> msgThread;
          nsMsgKey threadKey;
          mDatabase->GetThreadContainingMsgHdr(msgHdr,
                                               getter_AddRefs(msgThread));
          if (msgThread) {
            msgThread->GetThreadKey(&threadKey);
            if (actionType == nsMsgFilterAction::KillThread)
              rv = mDatabase->MarkThreadIgnored(msgThread, threadKey, true,
                                                nullptr);
            else
              rv = mDatabase->MarkThreadWatched(msgThread, threadKey, true,
                                                nullptr);
          } else {
            if (actionType == nsMsgFilterAction::KillThread)
              rv = msgHdr->SetUint32Property("ProtoThreadFlags",
                                             nsMsgMessageFlags::Ignored);
            else
              rv = msgHdr->SetUint32Property("ProtoThreadFlags",
                                             nsMsgMessageFlags::Watched);
          }
          if (actionType == nsMsgFilterAction::KillThread) {
            mDatabase->MarkHdrRead(msgHdr, true, nullptr);
            rv = StoreImapFlags(kImapMsgSeenFlag, true, {msgKey}, nullptr);
            msgIsNew = false;
          }
        } break;
        case nsMsgFilterAction::KillSubthread: {
          mDatabase->MarkHeaderKilled(msgHdr, true, nullptr);
          mDatabase->MarkHdrRead(msgHdr, true, nullptr);
          rv = StoreImapFlags(kImapMsgSeenFlag, true, {msgKey}, nullptr);
          msgIsNew = false;
        } break;
        case nsMsgFilterAction::ChangePriority: {
          nsMsgPriorityValue filterPriority;  // a int32_t
          filterAction->GetPriority(&filterPriority);
          rv = mDatabase->SetUint32PropertyByHdr(
              msgHdr, "priority", static_cast<uint32_t>(filterPriority));
        } break;
        case nsMsgFilterAction::AddTag: {
          nsCString keyword;
          filterAction->GetStrValue(keyword);
          rv = AddKeywordsToMessages({&*msgHdr}, keyword);
        } break;
        case nsMsgFilterAction::JunkScore: {
          nsAutoCString junkScoreStr;
          int32_t junkScore;
          filterAction->GetJunkScore(&junkScore);
          junkScoreStr.AppendInt(junkScore);
          rv = mDatabase->SetStringProperty(msgKey, "junkscore", junkScoreStr);
          mDatabase->SetStringProperty(msgKey, "junkscoreorigin", "filter"_ns);

          // If score is available, set up to store junk status on server.
          if (junkScore == nsIJunkMailPlugin::IS_SPAM_SCORE ||
              junkScore == nsIJunkMailPlugin::IS_HAM_SCORE) {
            nsTArray<nsMsgKey>* keysToClassify = m_moveCoalescer->GetKeyBucket(
                (junkScore == nsIJunkMailPlugin::IS_SPAM_SCORE) ? 0 : 1);
            NS_ASSERTION(keysToClassify, "error getting key bucket");
            if (keysToClassify) keysToClassify->AppendElement(msgKey);
            if (msgIsNew && junkScore == nsIJunkMailPlugin::IS_SPAM_SCORE) {
              msgIsNew = false;
              mDatabase->MarkHdrNotNew(msgHdr, nullptr);
              // nsMsgDBFolder::SendFlagNotifications by the call to
              // SetBiffState(nsMsgBiffState_NoMail) will reset numNewMessages
              // only if the message is also read and database notifications
              // are active, but we are not going to mark it read in this
              // action, preferring to leave the choice to the user.
              // So correct numNewMessages.
              if (m_filterListRequiresBody) {
                msgHdr->GetFlags(&msgFlags);
                if (!(msgFlags & nsMsgMessageFlags::Read)) {
                  int32_t numNewMessages;
                  GetNumNewMessages(false, &numNewMessages);
                  SetNumNewMessages(--numNewMessages);
                  SetHasNewMessages(numNewMessages != 0);
                }
              }
            }
          }
        } break;
        case nsMsgFilterAction::Forward: {
          nsCString forwardTo;
          filterAction->GetStrValue(forwardTo);
          nsCOMPtr<nsIMsgIncomingServer> server;
          rv = GetServer(getter_AddRefs(server));
          if (NS_FAILED(rv)) break;
          if (!forwardTo.IsEmpty()) {
            nsCOMPtr<nsIMsgComposeService> compService =
                do_GetService("@mozilla.org/messengercompose;1", &rv);
            if (NS_FAILED(rv)) break;
            rv = compService->ForwardMessage(
                NS_ConvertUTF8toUTF16(forwardTo), msgHdr, msgWindow, server,
                nsIMsgComposeService::kForwardAsDefault);
          }
        } break;

        case nsMsgFilterAction::Reply: {
          nsCString replyTemplateUri;
          filterAction->GetStrValue(replyTemplateUri);
          nsCOMPtr<nsIMsgIncomingServer> server;
          rv = GetServer(getter_AddRefs(server));
          if (NS_FAILED(rv)) break;
          if (!replyTemplateUri.IsEmpty()) {
            nsCOMPtr<nsIMsgComposeService> compService =
                do_GetService("@mozilla.org/messengercompose;1", &rv);
            if (NS_SUCCEEDED(rv) && compService) {
              rv = compService->ReplyWithTemplate(msgHdr, replyTemplateUri,
                                                  msgWindow, server);
              if (NS_FAILED(rv)) {
                NS_WARNING("ReplyWithTemplate failed");
                if (rv == NS_ERROR_ABORT) {
                  (void)filter->LogRuleHitFail(
                      filterAction, msgHdr, rv,
                      "filterFailureSendingReplyAborted"_ns);
                } else {
                  (void)filter->LogRuleHitFail(
                      filterAction, msgHdr, rv,
                      "filterFailureSendingReplyError"_ns);
                }
              }
            }
          }
        } break;

        case nsMsgFilterAction::StopExecution: {
          // don't apply any more filters
          *applyMore = false;
          rv = NS_OK;
        } break;

        case nsMsgFilterAction::Custom: {
          nsCOMPtr<nsIMsgFilterCustomAction> customAction;
          rv = filterAction->GetCustomAction(getter_AddRefs(customAction));
          if (NS_FAILED(rv)) break;

          nsAutoCString value;
          rv = filterAction->GetStrValue(value);
          if (NS_FAILED(rv)) break;

          rv = customAction->ApplyAction({&*msgHdr}, value, nullptr,
                                         nsMsgFilterType::InboxRule, msgWindow);
          // allow custom action to affect new
          msgHdr->GetFlags(&msgFlags);
          if (!(msgFlags & nsMsgMessageFlags::New)) msgIsNew = false;
        } break;

        default:
          NS_ERROR("unexpected filter action");
          rv = NS_ERROR_UNEXPECTED;
          break;
      }
    }
    if (NS_FAILED(rv)) {
      finalResult = rv;
      MOZ_LOG(FILTERLOGMODULE, LogLevel::Error,
              ("(Imap) Action execution failed with error: %" PRIx32,
               static_cast<uint32_t>(rv)));
      if (loggingEnabled) {
        (void)filter->LogRuleHitFail(filterAction, msgHdr, rv,
                                     "filterFailureAction"_ns);
      }
    } else {
      MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
              ("(Imap) Action execution succeeded"));
    }
  }
  if (!msgIsNew) {
    int32_t numNewMessages;
    GetNumNewMessages(false, &numNewMessages);
    // When database notifications are active, new counts will be reset
    // to zero in nsMsgDBFolder::SendFlagNotifications by the call to
    // SetBiffState(nsMsgBiffState_NoMail), so don't repeat them here.
    if (!m_filterListRequiresBody) SetNumNewMessages(--numNewMessages);
    if (mDatabase) mDatabase->MarkHdrNotNew(msgHdr, nullptr);
    MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
            ("(Imap) Message will not be marked new"));
  }
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
          ("(Imap) Finished executing actions"));
  return finalResult;
}

NS_IMETHODIMP nsImapMailFolder::SetImapFlags(const char* uids, int32_t flags,
                                             nsIURI** url) {
  nsresult rv;
  nsCOMPtr<nsIImapService> imapService =
      do_GetService("@mozilla.org/messenger/imapservice;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  return imapService->SetMessageFlags(this, this, url, nsAutoCString(uids),
                                      flags, true);
}

// "this" is the parent folder
NS_IMETHODIMP nsImapMailFolder::PlaybackOfflineFolderCreate(
    const nsAString& aFolderName, nsIMsgWindow* aWindow, nsIURI** url) {
  nsresult rv;
  nsCOMPtr<nsIImapService> imapService =
      do_GetService("@mozilla.org/messenger/imapservice;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  return imapService->CreateFolder(this, aFolderName, this, url);
}

// "this" is the source folder.
NS_IMETHODIMP
nsImapMailFolder::ReplayOfflineMoveCopy(const nsTArray<nsMsgKey>& aMsgKeys,
                                        bool isMove, nsIMsgFolder* aDstFolder,
                                        nsIUrlListener* aUrlListener,
                                        nsIMsgWindow* aWindow,
                                        bool srcFolderOffline) {
  nsresult rv;

  nsCOMPtr<nsIMsgImapMailFolder> imapFolder = do_QueryInterface(aDstFolder);
  if (imapFolder) {
    nsImapMailFolder* destImapFolder =
        static_cast<nsImapMailFolder*>(aDstFolder);
    nsCOMPtr<nsIMsgDatabase> dstFolderDB;
    aDstFolder->GetMsgDatabase(getter_AddRefs(dstFolderDB));
    nsCOMPtr<nsIMsgOfflineOpsDatabase> opsDb =
        do_QueryInterface(dstFolderDB, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    if (opsDb) {
      // find the fake header in the destination db, and use that to
      // set the pending attributes on the real headers. To do this,
      // we need to iterate over the offline ops in the destination db,
      // looking for ones with matching keys and source folder uri.
      // If we find that offline op, its "key" will be the key of the fake
      // header, so we just need to get the header for that key
      // from the dest db.
      nsTArray<nsMsgKey> offlineOps;
      if (NS_SUCCEEDED(opsDb->ListAllOfflineOpIds(offlineOps))) {
        nsTArray<RefPtr<nsIMsgDBHdr>> messages;
        nsCString srcFolderUri;
        GetURI(srcFolderUri);
        nsCOMPtr<nsIMsgOfflineImapOperation> currentOp;
        for (uint32_t opIndex = 0; opIndex < offlineOps.Length(); opIndex++) {
          opsDb->GetOfflineOpForKey(offlineOps[opIndex], false,
                                    getter_AddRefs(currentOp));
          if (currentOp) {
            nsCString opSrcUri;
            currentOp->GetSourceFolderURI(opSrcUri);
            if (opSrcUri.Equals(srcFolderUri)) {
              nsMsgKey srcMessageKey;
              currentOp->GetSrcMessageKey(&srcMessageKey);
              for (auto key : aMsgKeys) {
                if (srcMessageKey == key) {
                  nsCOMPtr<nsIMsgDBHdr> fakeDestHdr;
                  dstFolderDB->GetMsgHdrForKey(offlineOps[opIndex],
                                               getter_AddRefs(fakeDestHdr));
                  if (fakeDestHdr) messages.AppendElement(fakeDestHdr);
                  break;
                }
              }
            }
          }
        }
        // 3rd parameter: Sets offline flag.
        destImapFolder->SetPendingAttributes(messages, isMove,
                                             srcFolderOffline);
      }
    }
    // if we can't get the dst folder db, we should still try to playback
    // the offline move/copy.
  }

  nsCOMPtr<nsIImapService> imapService =
      do_GetService("@mozilla.org/messenger/imapservice;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIURI> resultUrl;
  nsAutoCString uids;
  AllocateUidStringFromKeys(aMsgKeys, uids);
  // Tell IMAP to copy (or move) messages with given uids in this folder to
  // aDstFolder.
  rv = imapService->OnlineMessageCopy(this, uids, aDstFolder, true, isMove,
                                      aUrlListener, getter_AddRefs(resultUrl),
                                      nullptr, aWindow);
  if (resultUrl) {
    nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl = do_QueryInterface(resultUrl, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    nsCOMPtr<nsIUrlListener> folderListener = do_QueryInterface(aDstFolder);
    if (folderListener) mailnewsUrl->RegisterListener(folderListener);
  }
  return rv;
}

NS_IMETHODIMP nsImapMailFolder::AddMoveResultPseudoKey(nsMsgKey aMsgKey) {
  nsresult rv = GetDatabase();
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgDBHdr> pseudoHdr;
  rv = mDatabase->GetMsgHdrForKey(aMsgKey, getter_AddRefs(pseudoHdr));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCString messageId;
  pseudoHdr->GetMessageId(messageId);
  // err on the side of caution and ignore messages w/o messageid.
  if (messageId.IsEmpty()) return NS_OK;
  m_pseudoHdrs.InsertOrUpdate(messageId, aMsgKey);
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::StoreImapFlags(int32_t flags, bool addFlags,
                                               const nsTArray<nsMsgKey>& keys,
                                               nsIUrlListener* aUrlListener) {
  nsresult rv;
  if (!WeAreOffline()) {
    nsCOMPtr<nsIImapService> imapService =
        do_GetService("@mozilla.org/messenger/imapservice;1", &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    nsAutoCString msgIds;
    AllocateUidStringFromKeys(keys, msgIds);
    if (addFlags)
      imapService->AddMessageFlags(this, aUrlListener ? aUrlListener : this,
                                   msgIds, flags, true);
    else
      imapService->SubtractMessageFlags(
          this, aUrlListener ? aUrlListener : this, msgIds, flags, true);
  } else {
    rv = GetDatabase();
    if (NS_SUCCEEDED(rv) && mDatabase) {
      nsCOMPtr<nsIMsgOfflineOpsDatabase> opsDb =
          do_QueryInterface(mDatabase, &rv);
      NS_ENSURE_SUCCESS(rv, rv);
      for (auto key : keys) {
        nsCOMPtr<nsIMsgOfflineImapOperation> op;
        rv = opsDb->GetOfflineOpForKey(key, true, getter_AddRefs(op));
        SetFlag(nsMsgFolderFlags::OfflineEvents);
        if (NS_SUCCEEDED(rv) && op) {
          imapMessageFlagsType newFlags;
          op->GetNewFlags(&newFlags);
          op->SetFlagOperation(addFlags ? newFlags | flags : newFlags & ~flags);
        }
      }
      opsDb->Commit(nsMsgDBCommitType::kLargeCommit);  // flush offline flags
    }
  }
  return rv;
}

NS_IMETHODIMP nsImapMailFolder::LiteSelect(nsIUrlListener* aUrlListener,
                                           nsIMsgWindow* aMsgWindow) {
  nsresult rv;
  nsCOMPtr<nsIImapService> imapService =
      do_GetService("@mozilla.org/messenger/imapservice;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIURI> outUri;
  return imapService->LiteSelectFolder(this, aUrlListener, aMsgWindow,
                                       getter_AddRefs(outUri));
}

nsresult nsImapMailFolder::GetFolderOwnerUserName(nsACString& userName) {
  if ((mFlags & nsMsgFolderFlags::ImapPersonal) ||
      !(mFlags &
        (nsMsgFolderFlags::ImapPublic | nsMsgFolderFlags::ImapOtherUser))) {
    // this is one of our personal mail folders
    // return our username on this host
    nsCOMPtr<nsIMsgIncomingServer> server;
    nsresult rv = GetServer(getter_AddRefs(server));
    return NS_FAILED(rv) ? rv : server->GetUsername(userName);
  }

  // the only other type of owner is if it's in the other users' namespace
  if (!(mFlags & nsMsgFolderFlags::ImapOtherUser)) return NS_OK;

  if (m_ownerUserName.IsEmpty()) {
    nsCString onlineName;
    GetOnlineName(onlineName);
    m_ownerUserName = nsImapNamespaceList::GetFolderOwnerNameFromPath(
        GetNamespaceForFolder(), onlineName.get());
  }
  userName = m_ownerUserName;
  return NS_OK;
}

nsImapNamespace* nsImapMailFolder::GetNamespaceForFolder() {
  if (!m_namespace) {
    nsCString serverKey;
    nsCString onlineName;
    GetServerKey(serverKey);
    GetOnlineName(onlineName);
    char hierarchyDelimiter;
    GetHierarchyDelimiter(&hierarchyDelimiter);

    m_namespace = nsImapNamespaceList::GetNamespaceForFolder(
        serverKey.get(), onlineName.get(), hierarchyDelimiter);
    NS_ASSERTION(m_namespace, "didn't get namespace for folder");
    if (m_namespace) {
      nsImapNamespaceList::SuggestHierarchySeparatorForNamespace(
          m_namespace, hierarchyDelimiter);
      m_folderIsNamespace = nsImapNamespaceList::GetFolderIsNamespace(
          serverKey.get(), onlineName.get(), hierarchyDelimiter, m_namespace);
    }
  }
  return m_namespace;
}

void nsImapMailFolder::SetNamespaceForFolder(nsImapNamespace* ns) {
  m_namespace = ns;
}

NS_IMETHODIMP nsImapMailFolder::FolderPrivileges(nsIMsgWindow* window) {
  NS_ENSURE_ARG_POINTER(window);
  nsresult rv = NS_OK;  // if no window...
  if (!m_adminUrl.IsEmpty()) {
    nsCOMPtr<nsIExternalProtocolService> extProtService =
        do_GetService(NS_EXTERNALPROTOCOLSERVICE_CONTRACTID);
    if (extProtService) {
      nsAutoCString scheme;
      nsCOMPtr<nsIURI> uri;
      if (NS_FAILED(rv = NS_NewURI(getter_AddRefs(uri), m_adminUrl.get())))
        return rv;
      uri->GetScheme(scheme);
      if (!scheme.IsEmpty()) {
        // if the URL scheme does not correspond to an exposed protocol, then we
        // need to hand this link click over to the external protocol handler.
        bool isExposed;
        rv = extProtService->IsExposedProtocol(scheme.get(), &isExposed);
        if (NS_SUCCEEDED(rv) && !isExposed)
          return extProtService->LoadURI(uri, nullptr, nullptr, nullptr, false,
                                         false, false);
      }
    }
  } else {
    nsCOMPtr<nsIImapService> imapService =
        do_GetService("@mozilla.org/messenger/imapservice;1", &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = imapService->GetFolderAdminUrl(this, window, this, nullptr);
    if (NS_SUCCEEDED(rv)) m_urlRunning = true;
  }
  return rv;
}

NS_IMETHODIMP nsImapMailFolder::GetHasAdminUrl(bool* aBool) {
  NS_ENSURE_ARG_POINTER(aBool);
  nsCOMPtr<nsIImapIncomingServer> imapServer;
  nsresult rv = GetImapIncomingServer(getter_AddRefs(imapServer));
  nsCString manageMailAccountUrl;
  if (NS_SUCCEEDED(rv) && imapServer)
    rv = imapServer->GetManageMailAccountUrl(manageMailAccountUrl);
  *aBool = (NS_SUCCEEDED(rv) && !manageMailAccountUrl.IsEmpty());
  return rv;
}

NS_IMETHODIMP nsImapMailFolder::GetAdminUrl(nsACString& aResult) {
  aResult = m_adminUrl;
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::SetAdminUrl(const nsACString& adminUrl) {
  m_adminUrl = adminUrl;
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::GetHdrParser(
    nsIMsgParseMailMsgState** aHdrParser) {
  NS_ENSURE_ARG_POINTER(aHdrParser);
  NS_IF_ADDREF(*aHdrParser = m_msgParser);
  return NS_OK;
}

// this is used to issue an arbitrary imap command on the passed in msgs.
// It assumes the command needs to be run in the selected state.
NS_IMETHODIMP nsImapMailFolder::IssueCommandOnMsgs(const nsACString& command,
                                                   const char* uids,
                                                   nsIMsgWindow* aWindow,
                                                   nsIURI** url) {
  nsresult rv;
  nsCOMPtr<nsIImapService> imapService =
      do_GetService("@mozilla.org/messenger/imapservice;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  return imapService->IssueCommandOnMsgs(this, aWindow, command,
                                         nsDependentCString(uids), url);
}

NS_IMETHODIMP nsImapMailFolder::FetchCustomMsgAttribute(
    const nsACString& attribute, const char* uids, nsIMsgWindow* aWindow,
    nsIURI** url) {
  nsresult rv;
  nsCOMPtr<nsIImapService> imapService =
      do_GetService("@mozilla.org/messenger/imapservice;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  return imapService->FetchCustomMsgAttribute(this, aWindow, attribute,
                                              nsDependentCString(uids), url);
}

nsresult nsImapMailFolder::MoveIncorporatedMessage(
    nsIMsgDBHdr* mailHdr, nsIMsgDatabase* sourceDB,
    const nsACString& destFolderUri, nsIMsgFilter* filter,
    nsIMsgWindow* msgWindow) {
  nsresult rv;
  if (m_moveCoalescer) {
    nsCOMPtr<nsIMsgFolder> destIFolder;
    rv = GetOrCreateFolder(destFolderUri, getter_AddRefs(destIFolder));
    NS_ENSURE_SUCCESS(rv, rv);

    if (destIFolder) {
      // check if the destination is a real folder (by checking for null parent)
      // and if it can file messages (e.g., servers or news folders can't file
      // messages). Or read only imap folders...
      bool canFileMessages = true;
      nsCOMPtr<nsIMsgFolder> parentFolder;
      destIFolder->GetParent(getter_AddRefs(parentFolder));
      if (parentFolder) destIFolder->GetCanFileMessages(&canFileMessages);
      if (filter && (!parentFolder || !canFileMessages)) {
        filter->SetEnabled(false);
        m_filterList->SaveToDefaultFile();
        destIFolder->ThrowAlertMsg("filterDisabled", msgWindow);
        return NS_MSG_NOT_A_MAIL_FOLDER;
      }
      // put the header into the source db, since it needs to be there when we
      // copy it and we need a valid header to pass to
      // StartAsyncCopyMessagesInto
      nsMsgKey keyToFilter;
      mailHdr->GetMessageKey(&keyToFilter);

      if (sourceDB && destIFolder) {
        bool imapDeleteIsMoveToTrash = DeleteIsMoveToTrash();
        m_moveCoalescer->AddMove(destIFolder, keyToFilter);
        // For each folder, we need to keep track of the ids we want to move to
        // that folder - we used to store them in the MSG_FolderInfo and then
        // when we'd finished downloading headers, we'd iterate through all the
        // folders looking for the ones that needed messages moved into them -
        // perhaps instead we could keep track of nsIMsgFolder,
        // nsTArray<nsMsgKey> pairs here in the imap code. nsTArray<nsMsgKey>
        // *idsToMoveFromInbox = msgFolder->GetImapIdsToMoveFromInbox();
        // idsToMoveFromInbox->AppendElement(keyToFilter);
        if (imapDeleteIsMoveToTrash) {
        }
        bool isRead = false;
        mailHdr->GetIsRead(&isRead);
        if (imapDeleteIsMoveToTrash) rv = NS_OK;
      }
    }
  } else
    rv = NS_ERROR_UNEXPECTED;

  // we have to return an error because we do not actually move the message
  // it is done async and that can fail
  return rv;
}

/**
 * This method assumes that key arrays and flag states are sorted by increasing
 * key.
 */
void nsImapMailFolder::FindKeysToDelete(const nsTArray<nsMsgKey>& existingKeys,
                                        nsTArray<nsMsgKey>& keysToDelete,
                                        nsIImapFlagAndUidState* flagState,
                                        uint32_t boxFlags) {
  bool showDeletedMessages = ShowDeletedMessages();
  int32_t numMessageInFlagState;
  bool partialUIDFetch;
  uint32_t uidOfMessage;
  imapMessageFlagsType flags;

  flagState->GetNumberOfMessages(&numMessageInFlagState);
  flagState->GetPartialUIDFetch(&partialUIDFetch);

  // if we're doing a partialUIDFetch, just delete the keys from the db
  // that have the deleted flag set (if not using imap delete model)
  // and return.
  if (partialUIDFetch) {
    if (!showDeletedMessages) {
      for (uint32_t i = 0; (int32_t)i < numMessageInFlagState; i++) {
        flagState->GetUidOfMessage(i, &uidOfMessage);
        // flag state will be zero filled up to first real uid, so ignore those.
        if (uidOfMessage) {
          flagState->GetMessageFlags(i, &flags);
          if (flags & kImapMsgDeletedFlag)
            keysToDelete.AppendElement(uidOfMessage);
        }
      }
    } else if (boxFlags & kJustExpunged) {
      // we've just issued an expunge with a partial flag state. We should
      // delete headers with the imap deleted flag set, because we can't
      // tell from the expunge response which messages were deleted.
      nsCOMPtr<nsIMsgEnumerator> hdrs;
      nsresult rv = GetMessages(getter_AddRefs(hdrs));
      NS_ENSURE_SUCCESS_VOID(rv);
      bool hasMore = false;
      while (NS_SUCCEEDED(rv = hdrs->HasMoreElements(&hasMore)) && hasMore) {
        nsCOMPtr<nsIMsgDBHdr> header;
        rv = hdrs->GetNext(getter_AddRefs(header));
        NS_ENSURE_SUCCESS_VOID(rv);
        uint32_t msgFlags;
        header->GetFlags(&msgFlags);
        if (msgFlags & nsMsgMessageFlags::IMAPDeleted) {
          nsMsgKey msgKey;
          header->GetMessageKey(&msgKey);
          keysToDelete.AppendElement(msgKey);
        }
      }
    }
    return;
  }
  // otherwise, we have a complete set of uid's and flags, so we delete
  // anything that's in existingKeys but not in the flag state, as well
  // as messages with the deleted flag set.
  uint32_t total = existingKeys.Length();
  int onlineIndex = 0;  // current index into flagState
  for (uint32_t keyIndex = 0; keyIndex < total; keyIndex++) {
    while (
        (onlineIndex < numMessageInFlagState) &&
        NS_SUCCEEDED(flagState->GetUidOfMessage(onlineIndex, &uidOfMessage)) &&
        (existingKeys[keyIndex] > uidOfMessage))
      onlineIndex++;

    flagState->GetUidOfMessage(onlineIndex, &uidOfMessage);
    flagState->GetMessageFlags(onlineIndex, &flags);
    // delete this key if it is not there or marked deleted
    if ((onlineIndex >= numMessageInFlagState) ||
        (existingKeys[keyIndex] != uidOfMessage) ||
        ((flags & kImapMsgDeletedFlag) && !showDeletedMessages)) {
      nsMsgKey doomedKey = existingKeys[keyIndex];
      if ((int32_t)doomedKey <= 0 && doomedKey != nsMsgKey_None) continue;

      keysToDelete.AppendElement(existingKeys[keyIndex]);
    }

    flagState->GetUidOfMessage(onlineIndex, &uidOfMessage);
    if (existingKeys[keyIndex] == uidOfMessage) onlineIndex++;
  }
}

void nsImapMailFolder::FindKeysToAdd(const nsTArray<nsMsgKey>& existingKeys,
                                     nsTArray<nsMsgKey>& keysToFetch,
                                     uint32_t& numNewUnread,
                                     nsIImapFlagAndUidState* flagState) {
  bool showDeletedMessages = ShowDeletedMessages();
  int dbIndex = 0;  // current index into existingKeys
  int32_t existTotal, numberOfKnownKeys;
  int32_t messageIndex;

  numNewUnread = 0;
  existTotal = numberOfKnownKeys = existingKeys.Length();
  flagState->GetNumberOfMessages(&messageIndex);
  bool partialUIDFetch;
  flagState->GetPartialUIDFetch(&partialUIDFetch);

  for (int32_t flagIndex = 0; flagIndex < messageIndex; flagIndex++) {
    uint32_t uidOfMessage;
    flagState->GetUidOfMessage(flagIndex, &uidOfMessage);
    while ((flagIndex < numberOfKnownKeys) && (dbIndex < existTotal) &&
           existingKeys[dbIndex] < uidOfMessage)
      dbIndex++;

    if ((flagIndex >= numberOfKnownKeys) || (dbIndex >= existTotal) ||
        (existingKeys[dbIndex] != uidOfMessage)) {
      numberOfKnownKeys++;

      imapMessageFlagsType flags;
      flagState->GetMessageFlags(flagIndex, &flags);
      NS_ASSERTION(uidOfMessage != nsMsgKey_None, "got invalid msg key");
      if (uidOfMessage && uidOfMessage != nsMsgKey_None &&
          (showDeletedMessages || !(flags & kImapMsgDeletedFlag))) {
        if (mDatabase) {
          bool dbContainsKey;
          if (NS_SUCCEEDED(
                  mDatabase->ContainsKey(uidOfMessage, &dbContainsKey)) &&
              dbContainsKey) {
            // this is expected in the partial uid fetch case because the
            // flag state does not contain all messages, so the db has
            // messages the flag state doesn't know about.
            if (!partialUIDFetch) NS_ERROR("db has key - flagState messed up?");
            continue;
          }
        }
        keysToFetch.AppendElement(uidOfMessage);
        if (!(flags & kImapMsgSeenFlag)) numNewUnread++;
      }
    }
  }
}

NS_IMETHODIMP nsImapMailFolder::GetMsgHdrsToDownload(
    bool* aMoreToDownload, int32_t* aTotalCount, nsTArray<nsMsgKey>& aKeys) {
  NS_ENSURE_ARG_POINTER(aMoreToDownload);
  NS_ENSURE_ARG_POINTER(aTotalCount);
  aKeys.Clear();

  *aMoreToDownload = false;
  *aTotalCount = m_totalKeysToFetch;
  if (m_keysToFetch.IsEmpty()) {
    return NS_OK;
  }

  // if folder isn't open in a window, no reason to limit the number of headers
  // we download.
  nsCOMPtr<nsIMsgMailSession> session =
      do_GetService("@mozilla.org/messenger/services/session;1");
  bool folderOpen = false;
  if (session) session->IsFolderOpenInWindow(this, &folderOpen);

  int32_t hdrChunkSize = 200;
  if (folderOpen) {
    nsresult rv;
    nsCOMPtr<nsIPrefBranch> prefBranch(
        do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
    NS_ENSURE_SUCCESS(rv, rv);
    if (prefBranch)
      prefBranch->GetIntPref("mail.imap.hdr_chunk_size", &hdrChunkSize);
  }
  int32_t numKeysToFetch = m_keysToFetch.Length();
  int32_t startIndex = 0;
  if (folderOpen && hdrChunkSize > 0 &&
      (int32_t)m_keysToFetch.Length() > hdrChunkSize) {
    numKeysToFetch = hdrChunkSize;
    *aMoreToDownload = true;
    startIndex = m_keysToFetch.Length() - hdrChunkSize;
  }
  aKeys.AppendElements(&m_keysToFetch[startIndex], numKeysToFetch);
  // Remove these for the incremental header download case, so that
  // we know we don't have to download them again.
  m_keysToFetch.RemoveElementsAt(startIndex, numKeysToFetch);

  return NS_OK;
}

void nsImapMailFolder::PrepareToAddHeadersToMailDB(nsIImapProtocol* aProtocol) {
  // now, tell it we don't need any bodies.
  nsTArray<nsMsgKey> noBodies;
  aProtocol->NotifyBodysToDownload(noBodies);
}

void nsImapMailFolder::TweakHeaderFlags(nsIImapProtocol* aProtocol,
                                        nsIMsgDBHdr* tweakMe) {
  if (mDatabase && aProtocol && tweakMe) {
    tweakMe->SetMessageKey(m_curMsgUid);
    tweakMe->SetMessageSize(m_nextMessageByteLength);

    bool foundIt = false;

    nsCOMPtr<nsIImapFlagAndUidState> flagState;
    nsresult rv = aProtocol->GetFlagAndUidState(getter_AddRefs(flagState));
    NS_ENSURE_SUCCESS_VOID(rv);
    rv = flagState->HasMessage(m_curMsgUid, &foundIt);

    if (NS_SUCCEEDED(rv) && foundIt) {
      imapMessageFlagsType imap_flags;
      nsCString customFlags;
      flagState->GetMessageFlagsByUid(m_curMsgUid, &imap_flags);
      if (imap_flags & kImapMsgCustomKeywordFlag) {
        flagState->GetCustomFlags(m_curMsgUid, getter_Copies(customFlags));
      }

      // make a mask and clear these message flags
      uint32_t mask = nsMsgMessageFlags::Read | nsMsgMessageFlags::Replied |
                      nsMsgMessageFlags::Marked |
                      nsMsgMessageFlags::IMAPDeleted |
                      nsMsgMessageFlags::Labels;
      uint32_t dbHdrFlags;

      tweakMe->GetFlags(&dbHdrFlags);
      tweakMe->AndFlags(~mask, &dbHdrFlags);

      // set the new value for these flags
      uint32_t newFlags = 0;
      if (imap_flags & kImapMsgSeenFlag)
        newFlags |= nsMsgMessageFlags::Read;
      else  // if (imap_flags & kImapMsgRecentFlag)
        newFlags |= nsMsgMessageFlags::New;

      // Okay here is the MDN needed logic (if DNT header seen):
      /* if server support user defined flag:
         XXX TODO: Fix badly formatted comment which doesn't reflect the code.
                    MDNSent flag set => clear kMDNNeeded flag
                    MDNSent flag not set => do nothing, leave kMDNNeeded on
                    else if
                    not nsMsgMessageFlags::New => clear kMDNNeeded flag
                   nsMsgMessageFlags::New => do nothing, leave kMDNNeeded on
               */
      uint16_t userFlags;
      rv = aProtocol->GetSupportedUserFlags(&userFlags);
      if (NS_SUCCEEDED(rv) && (userFlags & (kImapMsgSupportUserFlag |
                                            kImapMsgSupportMDNSentFlag))) {
        if (imap_flags & kImapMsgMDNSentFlag) {
          newFlags |= nsMsgMessageFlags::MDNReportSent;
          if (dbHdrFlags & nsMsgMessageFlags::MDNReportNeeded)
            tweakMe->AndFlags(~nsMsgMessageFlags::MDNReportNeeded, &dbHdrFlags);
        }
      }

      if (imap_flags & kImapMsgAnsweredFlag)
        newFlags |= nsMsgMessageFlags::Replied;
      if (imap_flags & kImapMsgFlaggedFlag)
        newFlags |= nsMsgMessageFlags::Marked;
      if (imap_flags & kImapMsgDeletedFlag)
        newFlags |= nsMsgMessageFlags::IMAPDeleted;
      if (imap_flags & kImapMsgForwardedFlag)
        newFlags |= nsMsgMessageFlags::Forwarded;
      if (newFlags) tweakMe->OrFlags(newFlags, &dbHdrFlags);
      if (!customFlags.IsEmpty())
        (void)HandleCustomFlags(m_curMsgUid, tweakMe, userFlags, customFlags);
    }
  }
}

NS_IMETHODIMP
nsImapMailFolder::SetupMsgWriteStream(nsIFile* aFile, bool addDummyEnvelope) {
  nsresult rv;
  aFile->Remove(false);
  m_tempMessageStreamBytesWritten = 0;
  rv = MsgNewBufferedFileOutputStream(
      getter_AddRefs(m_tempMessageStream), aFile,
      PR_WRONLY | PR_CREATE_FILE | PR_TRUNCATE, 00700);
  if (m_tempMessageStream && addDummyEnvelope) {
    nsAutoCString result;
    char* ct;
    uint32_t writeCount;
    time_t now = time((time_t*)0);
    ct = ctime(&now);
    ct[24] = 0;
    result = "From - ";
    result += ct;
    result += MSG_LINEBREAK;

    rv = m_tempMessageStream->Write(result.get(), result.Length(), &writeCount);
    NS_ENSURE_SUCCESS(rv, rv);
    m_tempMessageStreamBytesWritten += writeCount;

    result = "X-Mozilla-Status: 0001";
    result += MSG_LINEBREAK;
    rv = m_tempMessageStream->Write(result.get(), result.Length(), &writeCount);
    NS_ENSURE_SUCCESS(rv, rv);
    m_tempMessageStreamBytesWritten += writeCount;

    result = "X-Mozilla-Status2: 00000000";
    result += MSG_LINEBREAK;
    rv = m_tempMessageStream->Write(result.get(), result.Length(), &writeCount);
    NS_ENSURE_SUCCESS(rv, rv);
    m_tempMessageStreamBytesWritten += writeCount;
  }
  return rv;
}

NS_IMETHODIMP nsImapMailFolder::DownloadMessagesForOffline(
    nsTArray<RefPtr<nsIMsgDBHdr>> const& messages, nsIMsgWindow* window) {
  nsAutoCString messageIds;
  nsTArray<nsMsgKey> srcKeyArray;
  nsresult rv = BuildIdsAndKeyArray(messages, messageIds, srcKeyArray);
  if (NS_FAILED(rv) || messageIds.IsEmpty()) return rv;

  nsCOMPtr<nsIImapService> imapService =
      do_GetService("@mozilla.org/messenger/imapservice;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = AcquireSemaphore(static_cast<nsIMsgFolder*>(this));
  if (NS_FAILED(rv)) {
    ThrowAlertMsg("operationFailedFolderBusy", window);
    return rv;
  }
  return imapService->DownloadMessagesForOffline(messageIds, this, this,
                                                 window);
}

NS_IMETHODIMP nsImapMailFolder::DownloadAllForOffline(nsIUrlListener* listener,
                                                      nsIMsgWindow* msgWindow) {
  nsresult rv;
  nsCOMPtr<nsIURI> runningURI;
  bool noSelect;
  GetFlag(nsMsgFolderFlags::ImapNoselect, &noSelect);

  if (!noSelect) {
    nsAutoCString messageIdsToDownload;
    nsTArray<nsMsgKey> msgsToDownload;

    GetDatabase();
    m_downloadingFolderForOfflineUse = true;

    rv = AcquireSemaphore(static_cast<nsIMsgFolder*>(this));
    if (NS_FAILED(rv)) {
      m_downloadingFolderForOfflineUse = false;
      ThrowAlertMsg("operationFailedFolderBusy", msgWindow);
      return rv;
    }
    nsCOMPtr<nsIImapService> imapService =
        do_GetService("@mozilla.org/messenger/imapservice;1", &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    // Selecting the folder with nsIImapUrl::shouldStoreMsgOffline true will
    // cause us to fetch any message bodies we don't have.
    m_urlListener = listener;
    rv = imapService->SelectFolder(this, this, msgWindow,
                                   getter_AddRefs(runningURI));
    if (NS_SUCCEEDED(rv)) {
      nsCOMPtr<nsIImapUrl> imapUrl(do_QueryInterface(runningURI));
      if (imapUrl) imapUrl->SetStoreResultsOffline(true);
      m_urlRunning = true;
    }
  } else
    rv = NS_MSG_FOLDER_UNREADABLE;
  return rv;
}

NS_IMETHODIMP
nsImapMailFolder::ParseAdoptedMsgLine(const char* adoptedMessageLine,
                                      nsMsgKey uidOfMessage,
                                      nsIImapUrl* aImapUrl) {
  NS_ENSURE_ARG_POINTER(aImapUrl);
  uint32_t count = 0;
  nsresult rv;
  if (!m_offlineHeader) {
    // If the folder is locked by anything other than itself,
    // we want to fail immediately.
    // Examples:
    // During compaction, FolderCompactor holds the lock.
    // During DownloadAllForOffline(), the folder locks itself.
    bool isLocked;
    GetLocked(&isLocked);
    if (isLocked) {
      // It's OK if we, the folder, have the semaphore.
      bool hasSemaphore = false;
      TestSemaphore(static_cast<nsIMsgFolder*>(this), &hasSemaphore);
      if (!hasSemaphore) {
        NS_WARNING("ParseAdoptedMsgLine: folder is locked.");
        return NS_MSG_FOLDER_BUSY;
      }
    }

    // Starting a new message.
    if (m_curMsgUid) {
      NS_WARNING("ParseAdoptedMsgLine: already processing a message");
      return NS_ERROR_ABORT;
    }
    rv = GetMessageHeader(uidOfMessage, getter_AddRefs(m_offlineHeader));
    if (NS_SUCCEEDED(rv) && !m_offlineHeader) rv = NS_ERROR_UNEXPECTED;
    NS_ENSURE_SUCCESS(rv, rv);
    rv = StartNewOfflineMessage();
    NS_ENSURE_SUCCESS(rv, rv);
    m_curMsgUid = uidOfMessage;
  } else {
    // Continuing an existing message.
    if (uidOfMessage != m_curMsgUid) {
      NS_WARNING("ParseAdoptedMsgLine: preventing interleaved messages");
      return NS_ERROR_ABORT;
    }
  }

  // adoptedMessageLine is actually a string with a lot of message lines,
  nsDependentCString data(adoptedMessageLine);
  m_numOfflineMsgLines += data.CountChar('\n');

  if (m_tempMessageStream) {
    rv = m_tempMessageStream->Write(adoptedMessageLine,
                                    PL_strlen(adoptedMessageLine), &count);
    NS_ENSURE_SUCCESS(rv, rv);
    m_tempMessageStreamBytesWritten += count;
  }
  return NS_OK;
}

void nsImapMailFolder::EndOfflineDownload() {
  if (m_tempMessageStream) {
    m_tempMessageStream->Close();
    m_tempMessageStream = nullptr;
    ReleaseSemaphore(static_cast<nsIMsgFolder*>(this));
    if (mDatabase) mDatabase->Commit(nsMsgDBCommitType::kLargeCommit);
  }
  m_offlineHeader = nullptr;
}

NS_IMETHODIMP
nsImapMailFolder::NormalEndMsgWriteStream(nsMsgKey uidOfMessage, bool markRead,
                                          nsIImapUrl* imapUrl,
                                          int32_t updatedMessageSize) {
  NS_WARNING_ASSERTION((uidOfMessage == m_curMsgUid), "Interleaved messages?");
  auto uidClear = mozilla::MakeScopeExit([&] { m_curMsgUid = 0; });

  if (updatedMessageSize != -1) {
    // retrieve the message header to update size, if we don't already have it
    nsCOMPtr<nsIMsgDBHdr> msgHeader = m_offlineHeader;
    if (!msgHeader) GetMessageHeader(uidOfMessage, getter_AddRefs(msgHeader));
    if (msgHeader) {
      uint32_t msgSize;
      msgHeader->GetMessageSize(&msgSize);
      MOZ_LOG(IMAP, mozilla::LogLevel::Debug,
              ("Updating stored message size from %u, new size %d", msgSize,
               updatedMessageSize));
      msgHeader->SetMessageSize(updatedMessageSize);
      // only commit here if this isn't an offline message
      // offline header gets committed in EndNewOfflineMessage() called below
      if (mDatabase && !m_offlineHeader)
        mDatabase->Commit(nsMsgDBCommitType::kLargeCommit);
    } else
      NS_WARNING(
          "Failed to get message header when trying to update message size");
  }

  if (m_offlineHeader) EndNewOfflineMessage(NS_OK);

  m_curMsgUid = uidOfMessage;

  // Apply filter now if it needed a body
  if (m_filterListRequiresBody) {
    if (m_filterList) {
      nsCOMPtr<nsIMsgDBHdr> newMsgHdr;
      GetMessageHeader(uidOfMessage, getter_AddRefs(newMsgHdr));
      GetMoveCoalescer();
      nsCOMPtr<nsIMsgWindow> msgWindow;
      if (imapUrl) {
        nsresult rv;
        nsCOMPtr<nsIMsgMailNewsUrl> msgUrl;
        msgUrl = do_QueryInterface(imapUrl, &rv);
        if (msgUrl && NS_SUCCEEDED(rv))
          msgUrl->GetMsgWindow(getter_AddRefs(msgWindow));
      }
      m_filterList->ApplyFiltersToHdr(nsMsgFilterType::InboxRule, newMsgHdr,
                                      this, mDatabase, EmptyCString(), this,
                                      msgWindow);
      NotifyFolderEvent(kFiltersApplied);
    }
    // Process filter plugins and other items normally done at the end of
    // HeaderFetchCompleted.
    bool pendingMoves = m_moveCoalescer && m_moveCoalescer->HasPendingMoves();
    PlaybackCoalescedOperations();

    bool filtersRun;
    CallFilterPlugins(nullptr, &filtersRun);
    int32_t numNewBiffMsgs = 0;
    if (m_performingBiff) GetNumNewMessages(false, &numNewBiffMsgs);

    if (!filtersRun && m_performingBiff && mDatabase && numNewBiffMsgs > 0 &&
        (!pendingMoves || !ShowPreviewText())) {
      // If we are performing biff for this folder, tell the
      // stand-alone biff about the new high water mark
      // We must ensure that the server knows that we are performing biff.
      // Otherwise the stand-alone biff won't fire.
      nsCOMPtr<nsIMsgIncomingServer> server;
      if (NS_SUCCEEDED(GetServer(getter_AddRefs(server))) && server)
        server->SetPerformingBiff(true);

      SetBiffState(nsIMsgFolder::nsMsgBiffState_NewMail);
      if (server) server->SetPerformingBiff(false);
      m_performingBiff = false;
    }

    if (m_filterList) (void)m_filterList->FlushLogIfNecessary();
  }

  return NS_OK;
}

NS_IMETHODIMP
nsImapMailFolder::AbortMsgWriteStream() {
  if (m_offlineHeader) {
    EndNewOfflineMessage(NS_ERROR_ABORT);
  }
  m_offlineHeader = nullptr;
  m_curMsgUid = 0;
  return NS_OK;
}

// message move/copy related methods
NS_IMETHODIMP
nsImapMailFolder::OnlineCopyCompleted(nsIImapProtocol* aProtocol,
                                      ImapOnlineCopyState aCopyState) {
  NS_ENSURE_ARG_POINTER(aProtocol);

  nsresult rv;
  if (aCopyState == ImapOnlineCopyStateType::kSuccessfulCopy) {
    nsCOMPtr<nsIImapUrl> imapUrl;
    rv = aProtocol->GetRunningImapURL(getter_AddRefs(imapUrl));
    if (NS_FAILED(rv) || !imapUrl) return NS_ERROR_FAILURE;
    nsImapAction action;
    rv = imapUrl->GetImapAction(&action);
    if (NS_FAILED(rv)) return rv;
    if (action != nsIImapUrl::nsImapOnlineToOfflineMove)
      return NS_ERROR_FAILURE;  // don't assert here...
    nsCString messageIds;
    rv = imapUrl->GetListOfMessageIds(messageIds);
    if (NS_FAILED(rv)) return rv;
    nsCOMPtr<nsIImapService> imapService =
        do_GetService("@mozilla.org/messenger/imapservice;1", &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    return imapService->AddMessageFlags(this, nullptr, messageIds,
                                        kImapMsgDeletedFlag, true);
  }
  /* unhandled copystate */
  if (m_copyState)  // whoops, this is the wrong folder - should use the source
                    // folder
  {
    nsCOMPtr<nsIMsgFolder> srcFolder;
    srcFolder = do_QueryInterface(m_copyState->m_srcSupport, &rv);
    if (srcFolder) srcFolder->NotifyFolderEvent(kDeleteOrMoveMsgCompleted);
  } else
    rv = NS_ERROR_FAILURE;

  return rv;
}

NS_IMETHODIMP
nsImapMailFolder::CloseMockChannel(nsIImapMockChannel* aChannel) {
  aChannel->Close();
  return NS_OK;
}

NS_IMETHODIMP
nsImapMailFolder::ReleaseUrlCacheEntry(nsIMsgMailNewsUrl* aUrl) {
  NS_ENSURE_ARG_POINTER(aUrl);
  return aUrl->SetMemCacheEntry(nullptr);
}

nsresult nsImapMailFolder::HandleCustomFlags(nsMsgKey uidOfMessage,
                                             nsIMsgDBHdr* dbHdr,
                                             uint16_t userFlags,
                                             nsCString& keywords) {
  nsresult rv = GetDatabase();
  NS_ENSURE_SUCCESS(rv, rv);

  ToLowerCase(keywords);
  bool messageClassified = true;
  // ### TODO: we really should parse the keywords into space delimited keywords
  // before checking
  // Mac Mail, Yahoo uses "NotJunk"
  if (FindInReadable("NonJunk"_ns, keywords,
                     nsCaseInsensitiveCStringComparator) ||
      FindInReadable("NotJunk"_ns, keywords,
                     nsCaseInsensitiveCStringComparator)) {
    nsAutoCString msgJunkScore;
    msgJunkScore.AppendInt(nsIJunkMailPlugin::IS_HAM_SCORE);
    mDatabase->SetStringProperty(uidOfMessage, "junkscore", msgJunkScore);
  } else if (FindInReadable("Junk"_ns, keywords,
                            nsCaseInsensitiveCStringComparator)) {
    uint32_t newFlags;
    dbHdr->AndFlags(~nsMsgMessageFlags::New, &newFlags);
    nsAutoCString msgJunkScore;
    msgJunkScore.AppendInt(nsIJunkMailPlugin::IS_SPAM_SCORE);
    mDatabase->SetStringProperty(uidOfMessage, "junkscore", msgJunkScore);
  } else
    messageClassified = false;
  if (messageClassified) {
    // only set the junkscore origin if it wasn't set before.
    nsCString existingProperty;
    dbHdr->GetStringProperty("junkscoreorigin", existingProperty);
    if (existingProperty.IsEmpty())
      dbHdr->SetStringProperty("junkscoreorigin", "imapflag"_ns);
  }

  if (!(userFlags & kImapMsgSupportUserFlag)) {
    nsCString localKeywords;
    nsCString prevKeywords;
    dbHdr->GetStringProperty("keywords", localKeywords);
    dbHdr->GetStringProperty("prevkeywords", prevKeywords);
    // localKeywords: tags currently stored in database for the message.
    // keywords: tags stored in server and obtained when flags for the message
    //           were last fetched. (Parameter of this function.)
    // prevKeywords: saved keywords from previous call of this function.
    // clang-format off
    MOZ_LOG(IMAP_KW, mozilla::LogLevel::Debug,
            ("UID=%" PRIu32 ", localKeywords=|%s| keywords=|%s|, prevKeywords=|%s|",
             uidOfMessage, localKeywords.get(), keywords.get(), prevKeywords.get()));
    // clang-format on

    // Store keywords to detect changes on next call of this function.
    dbHdr->SetStringProperty("prevkeywords", keywords);

    // Parse the space separated strings into arrays.
    nsTArray<nsCString> localKeywordArray;
    nsTArray<nsCString> keywordArray;
    nsTArray<nsCString> prevKeywordArray;
    ParseString(localKeywords, ' ', localKeywordArray);
    ParseString(keywords, ' ', keywordArray);
    ParseString(prevKeywords, ' ', prevKeywordArray);

    // If keyword not received now but was the last time, remove it from
    // the localKeywords. This means the keyword was removed by another user
    // sharing the folder.
    for (uint32_t i = 0; i < prevKeywordArray.Length(); i++) {
      bool inRcvd = keywordArray.Contains(prevKeywordArray[i]);
      bool inLocal = localKeywordArray.Contains(prevKeywordArray[i]);
      if (!inRcvd && inLocal)
        localKeywordArray.RemoveElement(prevKeywordArray[i]);
    }

    // Combine local and rcvd keyword arrays into a single string
    // so it can be passed to SetStringProperty(). If element of
    // local already in rcvd, avoid duplicates in combined string.
    nsAutoCString combinedKeywords;
    for (uint32_t i = 0; i < localKeywordArray.Length(); i++) {
      if (!keywordArray.Contains(localKeywordArray[i])) {
        combinedKeywords.Append(localKeywordArray[i]);
        combinedKeywords.Append(' ');
      }
    }
    for (uint32_t i = 0; i < keywordArray.Length(); i++) {
      combinedKeywords.Append(keywordArray[i]);
      combinedKeywords.Append(' ');
    }
    MOZ_LOG(IMAP_KW, mozilla::LogLevel::Debug,
            ("combinedKeywords stored = |%s|", combinedKeywords.get()));
    // combinedKeywords are tags being stored in database for the message.
    return dbHdr->SetStringProperty("keywords", combinedKeywords);
  }
  return (userFlags & kImapMsgSupportUserFlag)
             ? dbHdr->SetStringProperty("keywords", keywords)
             : NS_OK;
}

// synchronize the message flags in the database with the server flags
nsresult nsImapMailFolder::SyncFlags(nsIImapFlagAndUidState* flagState) {
  nsresult rv = GetDatabase();  // we need a database for this
  NS_ENSURE_SUCCESS(rv, rv);
  bool partialUIDFetch;
  flagState->GetPartialUIDFetch(&partialUIDFetch);

  // update all of the database flags
  int32_t messageIndex;
  uint32_t messageSize;

  // Take this opportunity to recalculate the folder size, if we're not a
  // partial (condstore) fetch.
  int64_t newFolderSize = 0;

  flagState->GetNumberOfMessages(&messageIndex);

  uint16_t supportedUserFlags;
  flagState->GetSupportedUserFlags(&supportedUserFlags);

  for (int32_t flagIndex = 0; flagIndex < messageIndex; flagIndex++) {
    uint32_t uidOfMessage;
    flagState->GetUidOfMessage(flagIndex, &uidOfMessage);
    imapMessageFlagsType flags;
    flagState->GetMessageFlags(flagIndex, &flags);
    bool containsKey;
    rv = mDatabase->ContainsKey(uidOfMessage, &containsKey);
    // if we don't have the header, don't diddle the flags.
    // GetMsgHdrForKey will create the header if it doesn't exist.
    if (NS_FAILED(rv) || !containsKey) continue;

    nsCOMPtr<nsIMsgDBHdr> dbHdr;
    rv = mDatabase->GetMsgHdrForKey(uidOfMessage, getter_AddRefs(dbHdr));
    if (NS_FAILED(rv)) continue;
    if (NS_SUCCEEDED(dbHdr->GetMessageSize(&messageSize)))
      newFolderSize += messageSize;

    nsCString keywords;
    if (NS_SUCCEEDED(
            flagState->GetCustomFlags(uidOfMessage, getter_Copies(keywords))))
      HandleCustomFlags(uidOfMessage, dbHdr, supportedUserFlags, keywords);

    NotifyMessageFlagsFromHdr(dbHdr, uidOfMessage, flags);
  }
  if (!partialUIDFetch && newFolderSize != mFolderSize) {
    int64_t oldFolderSize = mFolderSize;
    mFolderSize = newFolderSize;
    NotifyIntPropertyChanged(kFolderSize, oldFolderSize, mFolderSize);
  }

  return NS_OK;
}

// helper routine to sync the flags on a given header
nsresult nsImapMailFolder::NotifyMessageFlagsFromHdr(nsIMsgDBHdr* dbHdr,
                                                     nsMsgKey msgKey,
                                                     uint32_t flags) {
  nsresult rv = GetDatabase();
  NS_ENSURE_SUCCESS(rv, rv);

  // Although it may seem strange to keep a local reference of mDatabase here,
  // the current lifetime management of databases requires that methods
  // sometimes null the database when they think they opened it. Unfortunately
  // experience shows this happens when we don't expect, so for crash protection
  // best practice with the current flawed database management is to keep a
  // local reference when there will be complex calls in a method. See bug
  // 1312254.
  nsCOMPtr<nsIMsgDatabase> database(mDatabase);
  NS_ENSURE_STATE(database);

  database->MarkHdrRead(dbHdr, (flags & kImapMsgSeenFlag) != 0, nullptr);
  database->MarkHdrReplied(dbHdr, (flags & kImapMsgAnsweredFlag) != 0, nullptr);
  database->MarkHdrMarked(dbHdr, (flags & kImapMsgFlaggedFlag) != 0, nullptr);
  database->MarkImapDeleted(msgKey, (flags & kImapMsgDeletedFlag) != 0,
                            nullptr);

  uint32_t supportedFlags;
  GetSupportedUserFlags(&supportedFlags);
  if (supportedFlags & kImapMsgSupportForwardedFlag)
    database->MarkForwarded(msgKey, (flags & kImapMsgForwardedFlag) != 0,
                            nullptr);
  if (supportedFlags & kImapMsgSupportMDNSentFlag)
    database->MarkMDNSent(msgKey, (flags & kImapMsgMDNSentFlag) != 0, nullptr);

  return NS_OK;
}

// message flags operation - this is called from the imap protocol,
// proxied over from the imap thread to the ui thread, when a flag changes
NS_IMETHODIMP
nsImapMailFolder::NotifyMessageFlags(uint32_t aFlags,
                                     const nsACString& aKeywords,
                                     nsMsgKey aMsgKey,
                                     uint64_t aHighestModSeq) {
  if (NS_SUCCEEDED(GetDatabase()) && mDatabase) {
    bool msgDeleted = aFlags & kImapMsgDeletedFlag;
    if (aHighestModSeq || msgDeleted) {
      nsCOMPtr<nsIDBFolderInfo> dbFolderInfo;
      mDatabase->GetDBFolderInfo(getter_AddRefs(dbFolderInfo));
      if (dbFolderInfo) {
        if (aHighestModSeq) {
          char intStrBuf[40];
          PR_snprintf(intStrBuf, sizeof(intStrBuf), "%llu", aHighestModSeq);
          MOZ_LOG(IMAP_CS, mozilla::LogLevel::Debug,
                  ("NotifyMessageFlags(): Store highest MODSEQ=%" PRIu64
                   " for folder=%s",
                   aHighestModSeq, m_onlineFolderName.get()));
          dbFolderInfo->SetCharProperty(kModSeqPropertyName,
                                        nsDependentCString(intStrBuf));
        }
        if (msgDeleted) {
          uint32_t oldDeletedCount;
          dbFolderInfo->GetUint32Property(kDeletedHdrCountPropertyName, 0,
                                          &oldDeletedCount);
          dbFolderInfo->SetUint32Property(kDeletedHdrCountPropertyName,
                                          oldDeletedCount + 1);
        }
      }
    }
    nsCOMPtr<nsIMsgDBHdr> dbHdr;
    bool containsKey;
    nsresult rv = mDatabase->ContainsKey(aMsgKey, &containsKey);
    // if we don't have the header, don't diddle the flags.
    // GetMsgHdrForKey will create the header if it doesn't exist.
    if (NS_FAILED(rv) || !containsKey) return rv;
    rv = mDatabase->GetMsgHdrForKey(aMsgKey, getter_AddRefs(dbHdr));
    if (NS_SUCCEEDED(rv) && dbHdr) {
      uint32_t supportedUserFlags;
      GetSupportedUserFlags(&supportedUserFlags);
      NotifyMessageFlagsFromHdr(dbHdr, aMsgKey, aFlags);
      nsCString keywords(aKeywords);
      HandleCustomFlags(aMsgKey, dbHdr, supportedUserFlags, keywords);
    }
  }
  return NS_OK;
}

NS_IMETHODIMP
nsImapMailFolder::NotifyMessageDeleted(const char* onlineFolderName,
                                       bool deleteAllMsgs,
                                       const char* msgIdString) {
  if (deleteAllMsgs) return NS_OK;

  if (!msgIdString) return NS_OK;

  nsTArray<nsMsgKey> affectedMessages;
  ParseUidString(msgIdString, affectedMessages);

  if (!ShowDeletedMessages()) {
    GetDatabase();
    NS_ENSURE_TRUE(mDatabase, NS_OK);
    if (!ShowDeletedMessages()) {
      if (!affectedMessages.IsEmpty())  // perhaps Search deleted these messages
      {
        DeleteStoreMessages(affectedMessages);
        mDatabase->DeleteMessages(affectedMessages, nullptr);
      }
    } else  // && !imapDeleteIsMoveToTrash // TODO: can this ever be executed?
      SetIMAPDeletedFlag(mDatabase, affectedMessages, false);
  }
  return NS_OK;
}

bool nsImapMailFolder::ShowDeletedMessages() {
  nsresult rv;
  nsCOMPtr<nsIImapHostSessionList> hostSession =
      do_GetService(kCImapHostSessionList, &rv);
  NS_ENSURE_SUCCESS(rv, false);

  bool showDeleted = false;
  nsCString serverKey;
  GetServerKey(serverKey);
  hostSession->GetShowDeletedMessagesForHost(serverKey.get(), showDeleted);

  return showDeleted;
}

bool nsImapMailFolder::DeleteIsMoveToTrash() {
  nsresult err;
  nsCOMPtr<nsIImapHostSessionList> hostSession =
      do_GetService(kCImapHostSessionList, &err);
  NS_ENSURE_SUCCESS(err, true);
  bool rv = true;

  nsCString serverKey;
  GetServerKey(serverKey);
  hostSession->GetDeleteIsMoveToTrashForHost(serverKey.get(), rv);
  return rv;
}

nsresult nsImapMailFolder::GetTrashFolder(nsIMsgFolder** pTrashFolder) {
  NS_ENSURE_ARG_POINTER(pTrashFolder);
  nsCOMPtr<nsIMsgFolder> rootFolder;
  nsresult rv = GetRootFolder(getter_AddRefs(rootFolder));
  if (NS_SUCCEEDED(rv) && rootFolder) {
    rv = rootFolder->GetFolderWithFlags(nsMsgFolderFlags::Trash, pTrashFolder);
    if (!*pTrashFolder) rv = NS_ERROR_FAILURE;
  }
  return rv;
}

// store nsMsgMessageFlags::IMAPDeleted in the specified mailhdr records
void nsImapMailFolder::SetIMAPDeletedFlag(nsIMsgDatabase* mailDB,
                                          const nsTArray<nsMsgKey>& msgids,
                                          bool markDeleted) {
  nsresult markStatus = NS_OK;
  uint32_t total = msgids.Length();

  for (uint32_t msgIndex = 0; NS_SUCCEEDED(markStatus) && (msgIndex < total);
       msgIndex++)
    markStatus =
        mailDB->MarkImapDeleted(msgids[msgIndex], markDeleted, nullptr);
}

NS_IMETHODIMP
nsImapMailFolder::GetMessageSizeFromDB(const char* id, uint32_t* size) {
  NS_ENSURE_ARG_POINTER(size);

  *size = 0;
  nsresult rv = GetDatabase();
  NS_ENSURE_SUCCESS(rv, rv);
  if (id) {
    nsMsgKey key = msgKeyFromInt(ParseUint64Str(id));
    nsCOMPtr<nsIMsgDBHdr> mailHdr;
    rv = mDatabase->GetMsgHdrForKey(key, getter_AddRefs(mailHdr));
    if (NS_SUCCEEDED(rv) && mailHdr) rv = mailHdr->GetMessageSize(size);
  }
  return rv;
}

NS_IMETHODIMP
nsImapMailFolder::GetCurMoveCopyMessageInfo(nsIImapUrl* runningUrl,
                                            PRTime* aDate,
                                            nsACString& aKeywords,
                                            uint32_t* aResult) {
  nsCOMPtr<nsISupports> copyState;
  runningUrl->GetCopyState(getter_AddRefs(copyState));
  if (copyState) {
    nsCOMPtr<nsImapMailCopyState> mailCopyState = do_QueryInterface(copyState);
    uint32_t supportedFlags = 0;
    GetSupportedUserFlags(&supportedFlags);
    if (mailCopyState &&
        mailCopyState->m_curIndex < mailCopyState->m_messages.Length()) {
      nsIMsgDBHdr* message =
          mailCopyState->m_messages[mailCopyState->m_curIndex];
      message->GetFlags(aResult);
      if (aDate) message->GetDate(aDate);
      if (supportedFlags & kImapMsgSupportUserFlag) {
        // setup the custom imap keywords, which includes the message keywords
        // plus any junk status
        nsCString junkscore;
        message->GetStringProperty("junkscore", junkscore);
        bool isJunk = false, isNotJunk = false;
        if (!junkscore.IsEmpty()) {
          if (junkscore.EqualsLiteral("0"))
            isNotJunk = true;
          else
            isJunk = true;
        }

        nsCString keywords;  // MsgFindKeyword can't use nsACString
        message->GetStringProperty("keywords", keywords);
        int32_t start;
        int32_t length;
        bool hasJunk = MsgFindKeyword("junk"_ns, keywords, &start, &length);
        if (hasJunk && !isJunk)
          keywords.Cut(start, length);
        else if (!hasJunk && isJunk)
          keywords.AppendLiteral(" Junk");
        bool hasNonJunk =
            MsgFindKeyword("nonjunk"_ns, keywords, &start, &length);
        if (!hasNonJunk)
          hasNonJunk = MsgFindKeyword("notjunk"_ns, keywords, &start, &length);
        if (hasNonJunk && !isNotJunk)
          keywords.Cut(start, length);
        else if (!hasNonJunk && isNotJunk)
          keywords.AppendLiteral(" NonJunk");

        // Cleanup extra spaces
        while (!keywords.IsEmpty() && keywords.First() == ' ')
          keywords.Cut(0, 1);
        while (!keywords.IsEmpty() && keywords.Last() == ' ')
          keywords.Cut(keywords.Length() - 1, 1);
        while (!keywords.IsEmpty() && (start = keywords.Find("  "_ns)) >= 0)
          keywords.Cut(start, 1);
        aKeywords.Assign(keywords);
      }
    }
    // if we don't have a source header, and it's not the drafts folder,
    // then mark the message read, since it must be an append to the
    // fcc or templates folder.
    else if (mailCopyState) {
      *aResult = mailCopyState->m_newMsgFlags;
      if (supportedFlags & kImapMsgSupportUserFlag)
        aKeywords.Assign(mailCopyState->m_newMsgKeywords);
    }
  }
  return NS_OK;
}

// nsIUrlListener implementation.
NS_IMETHODIMP
nsImapMailFolder::OnStartRunningUrl(nsIURI* aUrl) {
  NS_ASSERTION(aUrl, "sanity check - need to be be running non-null url");
  nsCOMPtr<nsIMsgMailNewsUrl> mailUrl = do_QueryInterface(aUrl);
  if (mailUrl) {
    bool updatingFolder;
    mailUrl->GetUpdatingFolder(&updatingFolder);
    m_updatingFolder = updatingFolder;
  }
  m_urlRunning = true;
  return NS_OK;
}

// nsIUrlListener implementation.
// nsImapMailFolder passes itself as a listener when it kicks off operations
// on the nsIImapService. So, when the operation completes, this gets called
// to handle all the different operations, using a big switch statement.
NS_IMETHODIMP
nsImapMailFolder::OnStopRunningUrl(nsIURI* aUrl, nsresult aExitCode) {
  nsresult rv;
  bool endedOfflineDownload = false;
  nsImapAction imapAction = nsIImapUrl::nsImapTest;
  m_urlRunning = false;
  m_updatingFolder = false;
  nsCOMPtr<nsIMsgMailSession> session =
      do_GetService("@mozilla.org/messenger/services/session;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  if (aUrl) {
    nsCOMPtr<nsIImapUrl> imapUrl = do_QueryInterface(aUrl, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    bool downloadingForOfflineUse;
    imapUrl->GetStoreResultsOffline(&downloadingForOfflineUse);
    bool hasSemaphore = false;
    // if we have the folder locked, clear it.
    TestSemaphore(static_cast<nsIMsgFolder*>(this), &hasSemaphore);
    if (hasSemaphore) ReleaseSemaphore(static_cast<nsIMsgFolder*>(this));
    if (downloadingForOfflineUse) {
      endedOfflineDownload = true;
      EndOfflineDownload();
    }
    nsCOMPtr<nsIMsgWindow> msgWindow;
    nsCOMPtr<nsIMsgMailNewsUrl> mailUrl = do_QueryInterface(aUrl);
    bool folderOpen = false;
    if (mailUrl) mailUrl->GetMsgWindow(getter_AddRefs(msgWindow));
    if (session) session->IsFolderOpenInWindow(this, &folderOpen);

    if (imapUrl) {
      DisplayStatusMsg(imapUrl, EmptyString());
      imapUrl->GetImapAction(&imapAction);
      if (imapAction == nsIImapUrl::nsImapMsgFetch ||
          imapAction == nsIImapUrl::nsImapMsgDownloadForOffline) {
        ReleaseSemaphore(static_cast<nsIMsgFolder*>(this));
        if (!endedOfflineDownload) EndOfflineDownload();
      }

      // Notify move, copy or delete (online operations)
      // Not sure whether nsImapDeleteMsg is even used, deletes in all three
      // models use nsImapAddMsgFlags.
      nsCOMPtr<nsIMsgFolderNotificationService> notifier(
          do_GetService("@mozilla.org/messenger/msgnotificationservice;1"));
      if (notifier && m_copyState) {
        if (imapAction == nsIImapUrl::nsImapOnlineMove) {
          notifier->NotifyMsgsMoveCopyCompleted(true, m_copyState->m_messages,
                                                this, {});
        } else if (imapAction == nsIImapUrl::nsImapOnlineCopy) {
          notifier->NotifyMsgsMoveCopyCompleted(false, m_copyState->m_messages,
                                                this, {});
        } else if (imapAction == nsIImapUrl::nsImapDeleteMsg) {
          notifier->NotifyMsgsDeleted(m_copyState->m_messages);
        }
      }

      switch (imapAction) {
        case nsIImapUrl::nsImapDeleteMsg:
        case nsIImapUrl::nsImapOnlineMove:
        case nsIImapUrl::nsImapOnlineCopy:
          if (NS_SUCCEEDED(aExitCode)) {
            if (folderOpen)
              UpdateFolder(msgWindow);
            else
              UpdatePendingCounts();
          }

          if (m_copyState) {
            nsCOMPtr<nsIMsgFolder> srcFolder =
                do_QueryInterface(m_copyState->m_srcSupport, &rv);
            if (m_copyState->m_isMove && !m_copyState->m_isCrossServerOp) {
              if (NS_SUCCEEDED(aExitCode)) {
                nsCOMPtr<nsIMsgDatabase> srcDB;
                if (srcFolder)
                  rv = srcFolder->GetMsgDatabase(getter_AddRefs(srcDB));
                if (NS_SUCCEEDED(rv) && srcDB) {
                  RefPtr<nsImapMoveCopyMsgTxn> msgTxn;
                  nsTArray<nsMsgKey> srcKeyArray;
                  if (m_copyState->m_allowUndo) {
                    msgTxn = m_copyState->m_undoMsgTxn;
                    if (msgTxn) msgTxn->GetSrcKeyArray(srcKeyArray);
                  } else {
                    nsAutoCString messageIds;
                    rv = BuildIdsAndKeyArray(m_copyState->m_messages,
                                             messageIds, srcKeyArray);
                    NS_ENSURE_SUCCESS(rv, rv);
                  }

                  if (!ShowDeletedMessages()) {
                    // We only reach here for same-server operations
                    // (!m_copyState->m_isCrossServerOp in if above), so we can
                    // assume that the src is also imap that uses offline
                    // storage.
                    DeleteStoreMessages(srcKeyArray, srcFolder);
                    srcDB->DeleteMessages(srcKeyArray, nullptr);
                  } else
                    MarkMessagesImapDeleted(&srcKeyArray, true, srcDB);
                }
                srcFolder->EnableNotifications(allMessageCountNotifications,
                                               true);
                // even if we're showing deleted messages,
                // we still need to notify FE so it will show the imap deleted
                // flag
                srcFolder->NotifyFolderEvent(kDeleteOrMoveMsgCompleted);
                // is there a way to see that we think we have new msgs?
                nsCOMPtr<nsIPrefBranch> prefBranch(
                    do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
                if (NS_SUCCEEDED(rv)) {
                  bool showPreviewText;
                  prefBranch->GetBoolPref("mail.biff.alert.show_preview",
                                          &showPreviewText);
                  // if we're showing preview text, update ourselves if we got a
                  // new unread message copied so that we can download the new
                  // headers and have a chance to preview the msg bodies.
                  if (!folderOpen && showPreviewText &&
                      m_copyState->m_unreadCount > 0 &&
                      !(mFlags &
                        (nsMsgFolderFlags::Trash | nsMsgFolderFlags::Junk)))
                    UpdateFolder(msgWindow);
                }
              } else {
                srcFolder->EnableNotifications(allMessageCountNotifications,
                                               true);
                srcFolder->NotifyFolderEvent(kDeleteOrMoveMsgFailed);
              }
            }
            if (m_copyState->m_msgWindow &&
                m_copyState->m_undoMsgTxn &&  // may be null from filters
                NS_SUCCEEDED(
                    aExitCode))  // we should do this only if move/copy succeeds
            {
              nsCOMPtr<nsITransactionManager> txnMgr;
              m_copyState->m_msgWindow->GetTransactionManager(
                  getter_AddRefs(txnMgr));
              if (txnMgr) {
                RefPtr<nsImapMoveCopyMsgTxn> txn = m_copyState->m_undoMsgTxn;
                mozilla::DebugOnly<nsresult> rv2 = txnMgr->DoTransaction(txn);
                NS_ASSERTION(NS_SUCCEEDED(rv2), "doing transaction failed");
              }
            }
            // nsImapUrl can hold a pointer to our m_copyState, so force a
            // release here (see Bug 1586494).
            imapUrl->SetCopyState(nullptr);
            (void)OnCopyCompleted(m_copyState->m_srcSupport, aExitCode);
          }

          // we're the dest folder of a move/copy - if we're not open in the ui,
          // then we should clear our nsMsgDatabase pointer. Otherwise, the db
          // would be open until the user selected it and then selected another
          // folder. but don't do this for the trash or inbox - we'll leave them
          // open
          if (!folderOpen &&
              !(mFlags & (nsMsgFolderFlags::Trash | nsMsgFolderFlags::Inbox)))
            SetMsgDatabase(nullptr);
          break;
        case nsIImapUrl::nsImapSubtractMsgFlags: {
          // this isn't really right - we'd like to know we were
          // deleting a message to start with, but it probably
          // won't do any harm.
          imapMessageFlagsType flags = 0;
          imapUrl->GetMsgFlags(&flags);
          // we need to subtract the delete flag in db only in case when we show
          // deleted msgs
          if (flags & kImapMsgDeletedFlag && ShowDeletedMessages()) {
            nsCOMPtr<nsIMsgDatabase> db;
            rv = GetMsgDatabase(getter_AddRefs(db));
            if (NS_SUCCEEDED(rv) && db) {
              nsTArray<nsMsgKey> keyArray;
              nsCString keyString;
              imapUrl->GetListOfMessageIds(keyString);
              ParseUidString(keyString.get(), keyArray);
              MarkMessagesImapDeleted(&keyArray, false, db);
              db->Commit(nsMsgDBCommitType::kLargeCommit);
            }
          }
        } break;
        case nsIImapUrl::nsImapAddMsgFlags: {
          imapMessageFlagsType flags = 0;
          imapUrl->GetMsgFlags(&flags);
          if (flags & kImapMsgDeletedFlag) {
            // we need to delete headers from db only when we don't show deleted
            // msgs
            if (!ShowDeletedMessages()) {
              nsCOMPtr<nsIMsgDatabase> db;
              rv = GetMsgDatabase(getter_AddRefs(db));
              if (NS_SUCCEEDED(rv) && db) {
                nsTArray<nsMsgKey> keyArray;
                nsCString keyString;
                imapUrl->GetListOfMessageIds(keyString);
                ParseUidString(keyString.get(), keyArray);

                // For pluggable stores that do not support compaction, we need
                // to delete the messages now.
                bool supportsCompaction = false;
                nsCOMPtr<nsIMsgPluggableStore> offlineStore;
                (void)GetMsgStore(getter_AddRefs(offlineStore));
                if (offlineStore)
                  offlineStore->GetSupportsCompaction(&supportsCompaction);

                nsTArray<RefPtr<nsIMsgDBHdr>> msgHdrs;
                if (notifier || !supportsCompaction) {
                  MsgGetHeadersFromKeys(db, keyArray, msgHdrs);
                }

                // Notify listeners of delete.
                if (notifier && !msgHdrs.IsEmpty()) {
                  // XXX Currently, the DeleteMessages below gets executed twice
                  // on deletes. Once in DeleteMessages, once here. The second
                  // time, it silently fails to delete. This is why we're also
                  // checking whether the array is empty.
                  notifier->NotifyMsgsDeleted(msgHdrs);
                }

                if (!supportsCompaction && !msgHdrs.IsEmpty())
                  DeleteStoreMessages(msgHdrs);

                db->DeleteMessages(keyArray, nullptr);
                db->SetSummaryValid(true);
                db->Commit(nsMsgDBCommitType::kLargeCommit);
              }
            }
          }
        } break;
        case nsIImapUrl::nsImapAppendMsgFromFile:
        case nsIImapUrl::nsImapAppendDraftFromFile:
          if (m_copyState) {
            if (NS_SUCCEEDED(aExitCode)) {
              UpdatePendingCounts();

              m_copyState->m_curIndex++;
              if (m_copyState->m_curIndex >= m_copyState->m_messages.Length()) {
                nsCOMPtr<nsIUrlListener> saveUrlListener = m_urlListener;
                if (folderOpen) {
                  // This gives a way for the caller to get notified
                  // when the UpdateFolder url is done.
                  // (if the nsIMsgCopyServiceListener also implements
                  // nsIUrlListener)
                  if (m_copyState->m_listener)
                    m_urlListener = do_QueryInterface(m_copyState->m_listener);
                }
                if (m_copyState->m_msgWindow && m_copyState->m_undoMsgTxn) {
                  nsCOMPtr<nsITransactionManager> txnMgr;
                  m_copyState->m_msgWindow->GetTransactionManager(
                      getter_AddRefs(txnMgr));
                  if (txnMgr) {
                    RefPtr<nsImapMoveCopyMsgTxn> txn =
                        m_copyState->m_undoMsgTxn;
                    txnMgr->DoTransaction(txn);
                  }
                }
                (void)OnCopyCompleted(m_copyState->m_srcSupport, aExitCode);
                if (folderOpen ||
                    imapAction == nsIImapUrl::nsImapAppendDraftFromFile) {
                  UpdateFolderWithListener(msgWindow, m_urlListener);
                  m_urlListener = saveUrlListener;
                }
              }
            } else {
              // clear the copyState if copy has failed
              (void)OnCopyCompleted(m_copyState->m_srcSupport, aExitCode);
            }
          }
          break;
        case nsIImapUrl::nsImapMoveFolderHierarchy:
          if (m_copyState)  // delete folder gets here, but w/o an m_copyState
          {
            nsCOMPtr<nsIMsgCopyService> copyService = do_GetService(
                "@mozilla.org/messenger/messagecopyservice;1", &rv);
            NS_ENSURE_SUCCESS(rv, rv);
            nsCOMPtr<nsIMsgFolder> srcFolder =
                do_QueryInterface(m_copyState->m_srcSupport);
            if (srcFolder) {
              copyService->NotifyCompletion(m_copyState->m_srcSupport, this,
                                            aExitCode);
            }
            m_copyState = nullptr;
          }
          break;
        case nsIImapUrl::nsImapRenameFolder:
          if (NS_FAILED(aExitCode)) {
            NotifyFolderEvent(kRenameCompleted);
          }
          break;
        case nsIImapUrl::nsImapDeleteAllMsgs:
          if (NS_SUCCEEDED(aExitCode)) {
            if (folderOpen)
              UpdateFolder(msgWindow);
            else {
              ChangeNumPendingTotalMessages(-mNumPendingTotalMessages);
              ChangeNumPendingUnread(-mNumPendingUnreadMessages);
              m_numServerUnseenMessages = 0;
            }
          }
          break;
        case nsIImapUrl::nsImapListFolder:
          if (NS_SUCCEEDED(aExitCode)) {
            // listing folder will open db; don't leave the db open.
            SetMsgDatabase(nullptr);
            if (!m_verifiedAsOnlineFolder) {
              // If folder is not verified, we remove it.
              nsCOMPtr<nsIMsgFolder> parent;
              rv = GetParent(getter_AddRefs(parent));
              if (NS_SUCCEEDED(rv) && parent) {
                nsCOMPtr<nsIMsgImapMailFolder> imapParent =
                    do_QueryInterface(parent);
                if (imapParent) this->RemoveLocalSelf();
              }
            }
          }
          break;
        case nsIImapUrl::nsImapRefreshFolderUrls:
          // we finished getting an admin url for the folder.
          if (!m_adminUrl.IsEmpty()) FolderPrivileges(msgWindow);
          break;
        case nsIImapUrl::nsImapCreateFolder:
          if (NS_FAILED(aExitCode))  // if success notification already done
          {
            NotifyFolderEvent(kFolderCreateFailed);
          }
          break;
        case nsIImapUrl::nsImapSubscribe:
          if (NS_SUCCEEDED(aExitCode) && msgWindow) {
            nsCString canonicalFolderName;
            imapUrl->CreateCanonicalSourceFolderPathString(canonicalFolderName);
            nsCOMPtr<nsIMsgFolder> rootFolder;
            nsresult rv = GetRootFolder(getter_AddRefs(rootFolder));
            if (NS_SUCCEEDED(rv) && rootFolder) {
              nsCOMPtr<nsIMsgImapMailFolder> imapRoot =
                  do_QueryInterface(rootFolder);
              if (imapRoot) {
                nsCOMPtr<nsIMsgImapMailFolder> foundFolder;
                rv = imapRoot->FindOnlineSubFolder(canonicalFolderName,
                                                   getter_AddRefs(foundFolder));
                if (NS_SUCCEEDED(rv) && foundFolder) {
                  nsCString uri;
                  nsCOMPtr<nsIMsgFolder> msgFolder =
                      do_QueryInterface(foundFolder);
                  if (msgFolder) {
                    nsCOMPtr<nsIObserverService> obsServ =
                        mozilla::services::GetObserverService();
                    obsServ->NotifyObservers(msgFolder, "folder-subscribed",
                                             nullptr);
                  }
                }
              }
            }
          }
          break;
        case nsIImapUrl::nsImapExpungeFolder:
          break;
        default:
          break;
      }
    }
    // give base class a chance to send folder loaded notification...
    rv = nsMsgDBFolder::OnStopRunningUrl(aUrl, aExitCode);
  }
  // if we're not running a url, we must not be getting new mail.
  SetGettingNewMessages(false);

  // If we're planning to inform another listener then do that now.
  // Some folder methods can take a listener to inform when the operation
  // is complete e.g. UpdateFolderWithListener(), DownloadAllForOffline(),
  // GetNewMessages(). That listener is stashed in m_urlListener.
  if (m_urlListener) {
    nsCOMPtr<nsIUrlListener> saveListener = m_urlListener;
    m_urlListener = nullptr;
    saveListener->OnStopRunningUrl(aUrl, aExitCode);
  }
  return rv;
}

void nsImapMailFolder::UpdatePendingCounts() {
  if (m_copyState) {
    int32_t delta =
        m_copyState->m_isCrossServerOp ? 1 : m_copyState->m_messages.Length();
    if (!m_copyState->m_selectedState && m_copyState->m_messages.IsEmpty()) {
      // special case from CopyFileMessage():
      // - copied a single message in from a file
      // - no previously-existing messages are involved
      delta = 1;
    }
    ChangePendingTotal(delta);

    // count the moves that were unread
    int numUnread = m_copyState->m_unreadCount;
    if (numUnread) {
      m_numServerUnseenMessages +=
          numUnread;  // adjust last status count by this delta.
      ChangeNumPendingUnread(numUnread);
    }
    SummaryChanged();
  }
}

NS_IMETHODIMP
nsImapMailFolder::ClearFolderRights() {
  SetFolderNeedsACLListed(false);
  delete m_folderACL;
  m_folderACL = new nsMsgIMAPFolderACL(this);
  return NS_OK;
}

NS_IMETHODIMP
nsImapMailFolder::AddFolderRights(const nsACString& userName,
                                  const nsACString& rights) {
  SetFolderNeedsACLListed(false);
  GetFolderACL()->SetFolderRightsForUser(userName, rights);
  return NS_OK;
}

NS_IMETHODIMP
nsImapMailFolder::RefreshFolderRights() {
  if (GetFolderACL()->GetIsFolderShared())
    SetFlag(nsMsgFolderFlags::PersonalShared);
  else
    ClearFlag(nsMsgFolderFlags::PersonalShared);
  return NS_OK;
}

NS_IMETHODIMP
nsImapMailFolder::SetCopyResponseUid(const char* msgIdString,
                                     nsIImapUrl* aUrl) {  // CopyMessages() only
  nsresult rv = NS_OK;
  RefPtr<nsImapMoveCopyMsgTxn> msgTxn;
  nsCOMPtr<nsISupports> copyState;

  if (aUrl) aUrl->GetCopyState(getter_AddRefs(copyState));

  if (copyState) {
    nsCOMPtr<nsImapMailCopyState> mailCopyState =
        do_QueryInterface(copyState, &rv);
    if (NS_FAILED(rv)) return rv;
    if (mailCopyState->m_undoMsgTxn) msgTxn = mailCopyState->m_undoMsgTxn;
  } else if (aUrl && m_pendingOfflineMoves.Length()) {
    nsCString urlSourceMsgIds, undoTxnSourceMsgIds;
    aUrl->GetListOfMessageIds(urlSourceMsgIds);
    RefPtr<nsImapMoveCopyMsgTxn> imapUndo = m_pendingOfflineMoves[0];
    if (imapUndo) {
      imapUndo->GetSrcMsgIds(undoTxnSourceMsgIds);
      if (undoTxnSourceMsgIds.Equals(urlSourceMsgIds)) msgTxn = imapUndo;
      // ### we should handle batched moves, but lets keep it simple for a2.
      m_pendingOfflineMoves.Clear();
    }
  }
  if (msgTxn) msgTxn->SetCopyResponseUid(msgIdString);
  return NS_OK;
}

NS_IMETHODIMP
nsImapMailFolder::StartMessage(nsIMsgMailNewsUrl* aUrl) {
  nsCOMPtr<nsIImapUrl> imapUrl(do_QueryInterface(aUrl));
  nsCOMPtr<nsISupports> copyState;
  NS_ENSURE_TRUE(imapUrl, NS_ERROR_FAILURE);

  imapUrl->GetCopyState(getter_AddRefs(copyState));
  if (copyState) {
    nsCOMPtr<nsICopyMessageListener> listener = do_QueryInterface(copyState);
    if (listener) {
      listener->StartMessage();
    }
  }
  return NS_OK;
}

NS_IMETHODIMP
nsImapMailFolder::EndMessage(nsIMsgMailNewsUrl* aUrl, nsMsgKey uidOfMessage) {
  nsCOMPtr<nsIImapUrl> imapUrl(do_QueryInterface(aUrl));
  nsCOMPtr<nsISupports> copyState;
  NS_ENSURE_TRUE(imapUrl, NS_ERROR_FAILURE);

  imapUrl->GetCopyState(getter_AddRefs(copyState));
  if (copyState) {
    nsCOMPtr<nsICopyMessageListener> listener = do_QueryInterface(copyState);
    if (listener) {
      listener->EndMessage(uidOfMessage);
    }
  }
  return NS_OK;
}

#define WHITESPACE " \015\012"  // token delimiter

NS_IMETHODIMP
nsImapMailFolder::NotifySearchHit(nsIMsgMailNewsUrl* aUrl,
                                  const char* searchHitLine) {
  NS_ENSURE_ARG_POINTER(aUrl);
  nsresult rv = GetDatabase();
  NS_ENSURE_SUCCESS(rv, rv);

  // expect search results in the form of "* SEARCH <hit> <hit> ..."
  // expect search results in the form of "* SEARCH <hit> <hit> ..."
  nsCString tokenString(searchHitLine);
  char* currentPosition = PL_strcasestr(tokenString.get(), "SEARCH");
  if (currentPosition) {
    currentPosition += strlen("SEARCH");
    bool shownUpdateAlert = false;
    char* hitUidToken = NS_strtok(WHITESPACE, &currentPosition);
    while (hitUidToken) {
      long naturalLong;  // %l is 64 bits on OSF1
      sscanf(hitUidToken, "%ld", &naturalLong);
      nsMsgKey hitUid = (nsMsgKey)naturalLong;

      nsCOMPtr<nsIMsgDBHdr> hitHeader;
      rv = mDatabase->GetMsgHdrForKey(hitUid, getter_AddRefs(hitHeader));
      if (NS_SUCCEEDED(rv) && hitHeader) {
        nsCOMPtr<nsIMsgSearchSession> searchSession;
        nsCOMPtr<nsIMsgSearchAdapter> searchAdapter;
        aUrl->GetSearchSession(getter_AddRefs(searchSession));
        if (searchSession) {
          searchSession->GetRunningAdapter(getter_AddRefs(searchAdapter));
          if (searchAdapter) searchAdapter->AddResultElement(hitHeader);
        }
      } else if (!shownUpdateAlert) {
      }

      hitUidToken = NS_strtok(WHITESPACE, &currentPosition);
    }
  }
  return NS_OK;
}

NS_IMETHODIMP
nsImapMailFolder::SetAppendMsgUid(nsMsgKey aKey, nsIImapUrl* aUrl) {
  nsresult rv;
  nsCOMPtr<nsISupports> copyState;
  if (aUrl) aUrl->GetCopyState(getter_AddRefs(copyState));
  if (copyState) {
    nsCOMPtr<nsImapMailCopyState> mailCopyState =
        do_QueryInterface(copyState, &rv);
    if (NS_FAILED(rv)) return rv;

    if (mailCopyState->m_undoMsgTxn)  // CopyMessages()
    {
      RefPtr<nsImapMoveCopyMsgTxn> msgTxn;
      msgTxn = mailCopyState->m_undoMsgTxn;
      msgTxn->AddDstKey(aKey);
    } else if (mailCopyState->m_listener)  // CopyFileMessage();
                                           // Draft/Template goes here
    {
      mailCopyState->m_appendUID = aKey;
      mailCopyState->m_listener->SetMessageKey(aKey);
    }
  }
  return NS_OK;
}

NS_IMETHODIMP
nsImapMailFolder::GetMessageId(nsIImapUrl* aUrl, nsACString& messageId) {
  nsresult rv = NS_OK;
  nsCOMPtr<nsISupports> copyState;

  if (aUrl) aUrl->GetCopyState(getter_AddRefs(copyState));
  if (copyState) {
    nsCOMPtr<nsImapMailCopyState> mailCopyState =
        do_QueryInterface(copyState, &rv);
    if (NS_FAILED(rv)) return rv;
    if (mailCopyState->m_listener)
      rv = mailCopyState->m_listener->GetMessageId(messageId);
  }
  if (NS_SUCCEEDED(rv) && messageId.Length() > 0) {
    if (messageId.First() == '<') messageId.Cut(0, 1);
    if (messageId.Last() == '>') messageId.SetLength(messageId.Length() - 1);
  }
  return rv;
}

NS_IMETHODIMP
nsImapMailFolder::HeaderFetchCompleted(nsIImapProtocol* aProtocol) {
  nsCOMPtr<nsIMsgWindow>
      msgWindow;  // we might need this for the filter plugins.
  if (mBackupDatabase) RemoveBackupMsgDatabase();

  SetSizeOnDisk(mFolderSize);
  int32_t numNewBiffMsgs = 0;
  if (m_performingBiff) GetNumNewMessages(false, &numNewBiffMsgs);

  bool pendingMoves = m_moveCoalescer && m_moveCoalescer->HasPendingMoves();
  PlaybackCoalescedOperations();
  if (aProtocol) {
    // check if we should download message bodies because it's the inbox and
    // the server is specified as one where where we download msg bodies
    // automatically. Or if we autosyncing all offline folders.
    nsCOMPtr<nsIImapIncomingServer> imapServer;
    GetImapIncomingServer(getter_AddRefs(imapServer));

    bool autoDownloadNewHeaders = false;
    bool autoSyncOfflineStores = false;

    if (imapServer) {
      imapServer->GetAutoSyncOfflineStores(&autoSyncOfflineStores);
      imapServer->GetDownloadBodiesOnGetNewMail(&autoDownloadNewHeaders);
      if (m_filterListRequiresBody) autoDownloadNewHeaders = true;
    }
    bool notifiedBodies = false;
    if (m_downloadingFolderForOfflineUse || autoSyncOfflineStores ||
        autoDownloadNewHeaders) {
      nsTArray<nsMsgKey> keysToDownload;
      GetBodysToDownload(&keysToDownload);
      if (!keysToDownload.IsEmpty() &&
          (m_downloadingFolderForOfflineUse || autoDownloadNewHeaders)) {
        // this is the case when DownloadAllForOffline is called.
        notifiedBodies = true;
        aProtocol->NotifyBodysToDownload(keysToDownload);
      } else {
        // create auto-sync state object lazily
        InitAutoSyncState();
        if (MOZ_LOG_TEST(gAutoSyncLog, mozilla::LogLevel::Debug)) {
          int32_t flags = 0;
          GetFlags((uint32_t*)&flags);
          nsString folderName;
          GetName(folderName);
          nsCString utfLeafName;
          CopyUTF16toUTF8(folderName, utfLeafName);
          MOZ_LOG(gAutoSyncLog, mozilla::LogLevel::Debug,
                  ("%s: foldername=%s, flags=0x%X, "
                   "isOffline=%s, nsMsgFolderFlags::Offline=0x%X",
                   __func__, utfLeafName.get(), flags,
                   (flags & nsMsgFolderFlags::Offline) ? "true" : "false",
                   nsMsgFolderFlags::Offline));
          MOZ_LOG(gAutoSyncLog, mozilla::LogLevel::Debug,
                  ("%s: created autosync obj, have keys to download=%s",
                   __func__, keysToDownload.IsEmpty() ? "false" : "true"));
        }
        // make enough room for new downloads
        m_autoSyncStateObj->ManageStorageSpace();  // currently a no-op

        m_autoSyncStateObj->SetServerCounts(
            m_numServerTotalMessages, m_numServerRecentMessages,
            m_numServerUnseenMessages, m_nextUID);
        m_autoSyncStateObj->OnNewHeaderFetchCompleted(keysToDownload);
      }
    }
    if (!notifiedBodies) {
      nsTArray<nsMsgKey> noBodies;
      aProtocol->NotifyBodysToDownload(noBodies);
    }

    nsCOMPtr<nsIURI> runningUri;
    aProtocol->GetRunningUrl(getter_AddRefs(runningUri));
    if (runningUri) {
      nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl = do_QueryInterface(runningUri);
      if (mailnewsUrl) mailnewsUrl->GetMsgWindow(getter_AddRefs(msgWindow));
    }
  }

  // delay calling plugins if filter application is also delayed
  if (!m_filterListRequiresBody) {
    bool filtersRun;
    CallFilterPlugins(msgWindow, &filtersRun);
    if (!filtersRun && m_performingBiff && mDatabase && numNewBiffMsgs > 0 &&
        (!pendingMoves || !ShowPreviewText())) {
      // If we are performing biff for this folder, tell the
      // stand-alone biff about the new high water mark
      // We must ensure that the server knows that we are performing biff.
      // Otherwise the stand-alone biff won't fire.
      nsCOMPtr<nsIMsgIncomingServer> server;
      if (NS_SUCCEEDED(GetServer(getter_AddRefs(server))) && server)
        server->SetPerformingBiff(true);

      SetBiffState(nsIMsgFolder::nsMsgBiffState_NewMail);
      if (server) server->SetPerformingBiff(false);
      m_performingBiff = false;
    }

    if (m_filterList) (void)m_filterList->FlushLogIfNecessary();
  }

  return NS_OK;
}

NS_IMETHODIMP
nsImapMailFolder::SetBiffStateAndUpdate(nsMsgBiffState biffState) {
  SetBiffState(biffState);
  return NS_OK;
}

NS_IMETHODIMP
nsImapMailFolder::GetUidValidity(int32_t* uidValidity) {
  NS_ENSURE_ARG(uidValidity);
  if ((int32_t)m_uidValidity == kUidUnknown) {
    nsCOMPtr<nsIMsgDatabase> db;
    nsCOMPtr<nsIDBFolderInfo> dbFolderInfo;
    (void)GetDBFolderInfoAndDB(getter_AddRefs(dbFolderInfo),
                               getter_AddRefs(db));
    if (db) db->GetDBFolderInfo(getter_AddRefs(dbFolderInfo));

    if (dbFolderInfo)
      dbFolderInfo->GetImapUidValidity((int32_t*)&m_uidValidity);
  }
  *uidValidity = m_uidValidity;
  return NS_OK;
}

NS_IMETHODIMP
nsImapMailFolder::SetUidValidity(int32_t uidValidity) {
  m_uidValidity = uidValidity;
  return NS_OK;
}

NS_IMETHODIMP
nsImapMailFolder::FillInFolderProps(nsIMsgImapFolderProps* aFolderProps) {
  NS_ENSURE_ARG(aFolderProps);
  const char* folderTypeStringID;
  const char* folderTypeDescStringID = nullptr;
  const char* folderQuotaStatusStringID;
  nsString folderType;
  nsString folderTypeDesc;
  nsString folderQuotaStatusDesc;
  nsCOMPtr<nsIStringBundle> bundle;
  nsresult rv = IMAPGetStringBundle(getter_AddRefs(bundle));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIImapIncomingServer> imapServer;
  rv = GetImapIncomingServer(getter_AddRefs(imapServer));
  // if for some bizarre reason this fails, we'll still fall through to the
  // normal sharing code
  if (NS_SUCCEEDED(rv)) {
    // get the latest committed imap capabilities bit mask.
    eIMAPCapabilityFlags capability = kCapabilityUndefined;
    imapServer->GetCapability(&capability);
    bool haveACL = capability & kACLCapability;
    bool haveQuota = capability & kQuotaCapability;

    // Figure out what to display in the Quota tab of the folder properties.
    // Does the server support quotas? This depends on the latest imap
    // CAPABILITY response.
    if (haveQuota) {
      // Have quota capability. Have we asked the server for quota information?
      if (m_folderQuotaCommandIssued) {
        // Has the server replied with all the quota info?
        if (m_folderQuotaDataIsValid) {
          if (!m_folderQuota.IsEmpty()) {
            // If so, set quota data to show in the quota tab
            folderQuotaStatusStringID = nullptr;
            aFolderProps->SetQuotaData(m_folderQuota);
          } else {
            // The server reported no quota limits on this folder.
            folderQuotaStatusStringID = "imapQuotaStatusNoQuota2";
          }
        } else {
          // The getquotaroot command was sent to the server but the complete
          // response was not yet received when the folder properties were
          // requested. This is rare. Request the folder properties again to
          // obtain the quota data.
          folderQuotaStatusStringID = "imapQuotaStatusInProgress";
        }
      } else {
        // The folder is not open, so no quota information is available
        folderQuotaStatusStringID = "imapQuotaStatusFolderNotOpen";
      }
    } else {
      // Either the server doesn't support quotas, or we don't know if it does
      // (e.g., because we don't have a connection yet). If the latter, we fall
      // back to saying that no information is available because the folder is
      // not yet open.
      folderQuotaStatusStringID = (capability == kCapabilityUndefined)
                                      ? "imapQuotaStatusFolderNotOpen"
                                      : "imapQuotaStatusNotSupported";
    }

    if (!folderQuotaStatusStringID) {
      // Display quota data
      aFolderProps->ShowQuotaData(true);
    } else {
      // Hide quota data and show reason why it is not available
      aFolderProps->ShowQuotaData(false);

      rv = IMAPGetStringByName(folderQuotaStatusStringID,
                               getter_Copies(folderQuotaStatusDesc));
      if (NS_SUCCEEDED(rv)) aFolderProps->SetQuotaStatus(folderQuotaStatusDesc);
    }

    // See if the server supports ACL.
    // If not, just set the folder description to a string that says
    // the server doesn't support sharing, and return.
    if (!haveACL) {
      rv = IMAPGetStringByName("imapServerDoesntSupportAcl",
                               getter_Copies(folderTypeDesc));
      if (NS_SUCCEEDED(rv))
        aFolderProps->SetFolderTypeDescription(folderTypeDesc);
      aFolderProps->ServerDoesntSupportACL();
      return NS_OK;
    }
  }
  if (mFlags & nsMsgFolderFlags::ImapPublic) {
    folderTypeStringID = "imapPublicFolderTypeName";
    folderTypeDescStringID = "imapPublicFolderTypeDescription";
  } else if (mFlags & nsMsgFolderFlags::ImapOtherUser) {
    folderTypeStringID = "imapOtherUsersFolderTypeName";
    nsCString owner;
    nsString uniOwner;
    GetFolderOwnerUserName(owner);
    if (owner.IsEmpty()) {
      IMAPGetStringByName(folderTypeStringID, getter_Copies(uniOwner));
      // Another user's folder, for which we couldn't find an owner name
      NS_ASSERTION(false, "couldn't get owner name for other user's folder");
    } else {
      CopyUTF8toUTF16(owner, uniOwner);
    }
    AutoTArray<nsString, 1> params = {uniOwner};
    bundle->FormatStringFromName("imapOtherUsersFolderTypeDescription", params,
                                 folderTypeDesc);
  } else if (GetFolderACL()->GetIsFolderShared()) {
    folderTypeStringID = "imapPersonalSharedFolderTypeName";
    folderTypeDescStringID = "imapPersonalSharedFolderTypeDescription";
  } else {
    folderTypeStringID = "imapPersonalSharedFolderTypeName";
    folderTypeDescStringID = "imapPersonalFolderTypeDescription";
  }

  rv = IMAPGetStringByName(folderTypeStringID, getter_Copies(folderType));
  if (NS_SUCCEEDED(rv)) aFolderProps->SetFolderType(folderType);

  if (folderTypeDesc.IsEmpty() && folderTypeDescStringID)
    IMAPGetStringByName(folderTypeDescStringID, getter_Copies(folderTypeDesc));
  if (!folderTypeDesc.IsEmpty())
    aFolderProps->SetFolderTypeDescription(folderTypeDesc);

  nsString rightsString;
  rv = CreateACLRightsStringForFolder(rightsString);
  if (NS_SUCCEEDED(rv)) aFolderProps->SetFolderPermissions(rightsString);
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::SetAclFlags(uint32_t aclFlags) {
  nsresult rv = NS_OK;
  if (m_aclFlags != aclFlags) {
    nsCOMPtr<nsIDBFolderInfo> dbFolderInfo;
    bool dbWasOpen = (mDatabase != nullptr);
    rv = GetDatabase();

    m_aclFlags = aclFlags;
    if (mDatabase) {
      rv = mDatabase->GetDBFolderInfo(getter_AddRefs(dbFolderInfo));
      if (NS_SUCCEEDED(rv) && dbFolderInfo)
        dbFolderInfo->SetUint32Property("aclFlags", aclFlags);
      // if setting the acl flags caused us to open the db, release the ref
      // because on startup, we might get acl on all folders,which will
      // leave a lot of db's open.
      if (!dbWasOpen) {
        mDatabase->Close(true /* commit changes */);
        mDatabase = nullptr;
      }
    }
  }
  return rv;
}

NS_IMETHODIMP nsImapMailFolder::GetAclFlags(uint32_t* aclFlags) {
  NS_ENSURE_ARG_POINTER(aclFlags);
  nsresult rv;
  ReadDBFolderInfo(false);        // update cache first.
  if (m_aclFlags == kAclInvalid)  // -1 means invalid value, so get it from db.
  {
    nsCOMPtr<nsIDBFolderInfo> dbFolderInfo;
    bool dbWasOpen = (mDatabase != nullptr);
    rv = GetDatabase();

    if (mDatabase) {
      rv = mDatabase->GetDBFolderInfo(getter_AddRefs(dbFolderInfo));
      if (NS_SUCCEEDED(rv) && dbFolderInfo) {
        rv = dbFolderInfo->GetUint32Property("aclFlags", 0, aclFlags);
        m_aclFlags = *aclFlags;
      }
      // if getting the acl flags caused us to open the db, release the ref
      // because on startup, we might get acl on all folders,which will
      // leave a lot of db's open.
      if (!dbWasOpen) {
        mDatabase->Close(true /* commit changes */);
        mDatabase = nullptr;
      }
    }
  } else
    *aclFlags = m_aclFlags;
  return NS_OK;
}

nsresult nsImapMailFolder::SetSupportedUserFlags(uint32_t userFlags) {
  nsCOMPtr<nsIDBFolderInfo> dbFolderInfo;
  nsresult rv = GetDatabase();

  m_supportedUserFlags = userFlags;
  if (mDatabase) {
    rv = mDatabase->GetDBFolderInfo(getter_AddRefs(dbFolderInfo));
    if (NS_SUCCEEDED(rv) && dbFolderInfo)
      dbFolderInfo->SetUint32Property("imapFlags", userFlags);
  }
  return rv;
}

nsresult nsImapMailFolder::GetSupportedUserFlags(uint32_t* userFlags) {
  NS_ENSURE_ARG_POINTER(userFlags);

  nsresult rv = NS_OK;

  ReadDBFolderInfo(false);        // update cache first.
  if (m_supportedUserFlags == 0)  // 0 means invalid value, so get it from db.
  {
    nsCOMPtr<nsIDBFolderInfo> dbFolderInfo;
    rv = GetDatabase();

    if (mDatabase) {
      rv = mDatabase->GetDBFolderInfo(getter_AddRefs(dbFolderInfo));
      if (NS_SUCCEEDED(rv) && dbFolderInfo) {
        rv = dbFolderInfo->GetUint32Property("imapFlags", 0, userFlags);
        m_supportedUserFlags = *userFlags;
      }
    }
  } else
    *userFlags = m_supportedUserFlags;
  return rv;
}

NS_IMETHODIMP nsImapMailFolder::GetCanOpenFolder(bool* aBool) {
  NS_ENSURE_ARG_POINTER(aBool);
  bool noSelect;
  GetFlag(nsMsgFolderFlags::ImapNoselect, &noSelect);
  *aBool = (noSelect) ? false : GetFolderACL()->GetCanIReadFolder();
  return NS_OK;
}

///////// nsMsgIMAPFolderACL class ///////////////////////////////

// This string is defined in the ACL RFC to be "anyone"
#define IMAP_ACL_ANYONE_STRING "anyone"

nsMsgIMAPFolderACL::nsMsgIMAPFolderACL(nsImapMailFolder* folder)
    : m_rightsHash(24) {
  NS_ASSERTION(folder, "need folder");
  m_folder = folder;
  m_aclCount = 0;
  BuildInitialACLFromCache();
}

nsMsgIMAPFolderACL::~nsMsgIMAPFolderACL() {}

// We cache most of our own rights in the MSG_FOLDER_PREF_* flags
void nsMsgIMAPFolderACL::BuildInitialACLFromCache() {
  nsAutoCString myrights;

  uint32_t startingFlags;
  m_folder->GetAclFlags(&startingFlags);

  if (startingFlags & IMAP_ACL_READ_FLAG) myrights += "r";
  if (startingFlags & IMAP_ACL_STORE_SEEN_FLAG) myrights += "s";
  if (startingFlags & IMAP_ACL_WRITE_FLAG) myrights += "w";
  if (startingFlags & IMAP_ACL_INSERT_FLAG) myrights += "i";
  if (startingFlags & IMAP_ACL_POST_FLAG) myrights += "p";
  if (startingFlags & IMAP_ACL_CREATE_SUBFOLDER_FLAG) myrights += "c";
  if (startingFlags & IMAP_ACL_DELETE_FLAG) myrights += "dt";
  if (startingFlags & IMAP_ACL_ADMINISTER_FLAG) myrights += "a";
  if (startingFlags & IMAP_ACL_EXPUNGE_FLAG) myrights += "e";

  if (!myrights.IsEmpty()) SetFolderRightsForUser(EmptyCString(), myrights);
}

void nsMsgIMAPFolderACL::UpdateACLCache() {
  uint32_t startingFlags = 0;
  m_folder->GetAclFlags(&startingFlags);

  if (GetCanIReadFolder())
    startingFlags |= IMAP_ACL_READ_FLAG;
  else
    startingFlags &= ~IMAP_ACL_READ_FLAG;

  if (GetCanIStoreSeenInFolder())
    startingFlags |= IMAP_ACL_STORE_SEEN_FLAG;
  else
    startingFlags &= ~IMAP_ACL_STORE_SEEN_FLAG;

  if (GetCanIWriteFolder())
    startingFlags |= IMAP_ACL_WRITE_FLAG;
  else
    startingFlags &= ~IMAP_ACL_WRITE_FLAG;

  if (GetCanIInsertInFolder())
    startingFlags |= IMAP_ACL_INSERT_FLAG;
  else
    startingFlags &= ~IMAP_ACL_INSERT_FLAG;

  if (GetCanIPostToFolder())
    startingFlags |= IMAP_ACL_POST_FLAG;
  else
    startingFlags &= ~IMAP_ACL_POST_FLAG;

  if (GetCanICreateSubfolder())
    startingFlags |= IMAP_ACL_CREATE_SUBFOLDER_FLAG;
  else
    startingFlags &= ~IMAP_ACL_CREATE_SUBFOLDER_FLAG;

  if (GetCanIDeleteInFolder())
    startingFlags |= IMAP_ACL_DELETE_FLAG;
  else
    startingFlags &= ~IMAP_ACL_DELETE_FLAG;

  if (GetCanIAdministerFolder())
    startingFlags |= IMAP_ACL_ADMINISTER_FLAG;
  else
    startingFlags &= ~IMAP_ACL_ADMINISTER_FLAG;

  if (GetCanIExpungeFolder())
    startingFlags |= IMAP_ACL_EXPUNGE_FLAG;
  else
    startingFlags &= ~IMAP_ACL_EXPUNGE_FLAG;

  m_folder->SetAclFlags(startingFlags);
}

bool nsMsgIMAPFolderACL::SetFolderRightsForUser(const nsACString& userName,
                                                const nsACString& rights) {
  nsCString myUserName;
  nsCOMPtr<nsIMsgIncomingServer> server;
  nsresult rv = m_folder->GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, false);

  server->GetUsername(myUserName);

  nsAutoCString ourUserName;
  if (userName.IsEmpty())
    ourUserName.Assign(myUserName);
  else
    ourUserName.Assign(userName);

  if (ourUserName.IsEmpty()) return false;

  ToLowerCase(ourUserName);
  nsCString oldValue = m_rightsHash.Get(ourUserName);
  if (!oldValue.IsEmpty()) {
    m_rightsHash.Remove(ourUserName);
    m_aclCount--;
    NS_ASSERTION(m_aclCount >= 0, "acl count can't go negative");
  }
  m_aclCount++;
  m_rightsHash.InsertOrUpdate(ourUserName, PromiseFlatCString(rights));

  if (myUserName.Equals(ourUserName) ||
      ourUserName.EqualsLiteral(IMAP_ACL_ANYONE_STRING))
    // if this is setting an ACL for me, cache it in the folder pref flags
    UpdateACLCache();

  return true;
}

NS_IMETHODIMP nsImapMailFolder::GetOtherUsersWithAccess(
    nsIUTF8StringEnumerator** aResult) {
  return GetFolderACL()->GetOtherUsers(aResult);
}

nsresult nsMsgIMAPFolderACL::GetOtherUsers(nsIUTF8StringEnumerator** aResult) {
  nsCString myUserName;
  nsCOMPtr<nsIMsgIncomingServer> server;
  nsresult rv = m_folder->GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);
  server->GetUsername(myUserName);

  // We need to filter out myUserName from m_rightsHash.
  nsTArray<nsCString>* resultArray = new nsTArray<nsCString>;
  for (auto iter = m_rightsHash.Iter(); !iter.Done(); iter.Next()) {
    if (!iter.Key().Equals(myUserName)) resultArray->AppendElement(iter.Key());
  }

  // enumerator will free resultArray
  return NS_NewAdoptingUTF8StringEnumerator(aResult, resultArray);
}

nsresult nsImapMailFolder::GetPermissionsForUser(const nsACString& otherUser,
                                                 nsACString& aResult) {
  nsCString str;
  nsresult rv = GetFolderACL()->GetRightsStringForUser(otherUser, str);
  NS_ENSURE_SUCCESS(rv, rv);
  aResult = str;
  return NS_OK;
}

nsresult nsMsgIMAPFolderACL::GetRightsStringForUser(
    const nsACString& inUserName, nsCString& rights) {
  nsCString userName;
  userName.Assign(inUserName);
  if (userName.IsEmpty()) {
    nsCOMPtr<nsIMsgIncomingServer> server;

    nsresult rv = m_folder->GetServer(getter_AddRefs(server));
    NS_ENSURE_SUCCESS(rv, rv);
    // we need the real user name to match with what the imap server returns
    // in the acl response.
    server->GetUsername(userName);
  }
  ToLowerCase(userName);
  rights = m_rightsHash.Get(userName);
  return NS_OK;
}

// First looks for individual user;  then looks for 'anyone' if the user isn't
// found. Returns defaultIfNotFound, if neither are found.
bool nsMsgIMAPFolderACL::GetFlagSetInRightsForUser(const nsACString& userName,
                                                   char flag,
                                                   bool defaultIfNotFound) {
  nsCString flags;
  nsresult rv = GetRightsStringForUser(userName, flags);
  NS_ENSURE_SUCCESS(rv, defaultIfNotFound);
  if (flags.IsEmpty()) {
    nsCString anyoneFlags;
    GetRightsStringForUser(nsLiteralCString(IMAP_ACL_ANYONE_STRING),
                           anyoneFlags);
    if (anyoneFlags.IsEmpty()) return defaultIfNotFound;
    return (anyoneFlags.FindChar(flag) != kNotFound);
  }
  return (flags.FindChar(flag) != kNotFound);
}

bool nsMsgIMAPFolderACL::GetCanUserLookupFolder(const nsACString& userName) {
  return GetFlagSetInRightsForUser(userName, 'l', false);
}

bool nsMsgIMAPFolderACL::GetCanUserReadFolder(const nsACString& userName) {
  return GetFlagSetInRightsForUser(userName, 'r', false);
}

bool nsMsgIMAPFolderACL::GetCanUserStoreSeenInFolder(
    const nsACString& userName) {
  return GetFlagSetInRightsForUser(userName, 's', false);
}

bool nsMsgIMAPFolderACL::GetCanUserWriteFolder(const nsACString& userName) {
  return GetFlagSetInRightsForUser(userName, 'w', false);
}

bool nsMsgIMAPFolderACL::GetCanUserInsertInFolder(const nsACString& userName) {
  return GetFlagSetInRightsForUser(userName, 'i', false);
}

bool nsMsgIMAPFolderACL::GetCanUserPostToFolder(const nsACString& userName) {
  return GetFlagSetInRightsForUser(userName, 'p', false);
}

bool nsMsgIMAPFolderACL::GetCanUserCreateSubfolder(const nsACString& userName) {
  return GetFlagSetInRightsForUser(userName, 'c', false);
}

bool nsMsgIMAPFolderACL::GetCanUserDeleteInFolder(const nsACString& userName) {
  return GetFlagSetInRightsForUser(userName, 'd', false) ||
         GetFlagSetInRightsForUser(userName, 't', false);
}

bool nsMsgIMAPFolderACL::GetCanUserAdministerFolder(
    const nsACString& userName) {
  return GetFlagSetInRightsForUser(userName, 'a', false);
}

bool nsMsgIMAPFolderACL::GetCanILookupFolder() {
  return GetFlagSetInRightsForUser(EmptyCString(), 'l', true);
}

bool nsMsgIMAPFolderACL::GetCanIReadFolder() {
  return GetFlagSetInRightsForUser(EmptyCString(), 'r', true);
}

bool nsMsgIMAPFolderACL::GetCanIStoreSeenInFolder() {
  return GetFlagSetInRightsForUser(EmptyCString(), 's', true);
}

bool nsMsgIMAPFolderACL::GetCanIWriteFolder() {
  return GetFlagSetInRightsForUser(EmptyCString(), 'w', true);
}

bool nsMsgIMAPFolderACL::GetCanIInsertInFolder() {
  return GetFlagSetInRightsForUser(EmptyCString(), 'i', true);
}

bool nsMsgIMAPFolderACL::GetCanIPostToFolder() {
  return GetFlagSetInRightsForUser(EmptyCString(), 'p', true);
}

bool nsMsgIMAPFolderACL::GetCanICreateSubfolder() {
  return GetFlagSetInRightsForUser(EmptyCString(), 'c', true);
}

bool nsMsgIMAPFolderACL::GetCanIDeleteInFolder() {
  return GetFlagSetInRightsForUser(EmptyCString(), 'd', true) ||
         GetFlagSetInRightsForUser(EmptyCString(), 't', true);
}

bool nsMsgIMAPFolderACL::GetCanIAdministerFolder() {
  return GetFlagSetInRightsForUser(EmptyCString(), 'a', true);
}

bool nsMsgIMAPFolderACL::GetCanIExpungeFolder() {
  return GetFlagSetInRightsForUser(EmptyCString(), 'e', true) ||
         GetFlagSetInRightsForUser(EmptyCString(), 'd', true);
}

// We use this to see if the ACLs think a folder is shared or not.
// We will define "Shared" in 5.0 to mean:
// At least one user other than the currently authenticated user has at least
// one explicitly-listed ACL right on that folder.
bool nsMsgIMAPFolderACL::GetIsFolderShared() {
  // If we have more than one ACL count for this folder, which means that
  // someone other than ourself has rights on it, then it is "shared."
  if (m_aclCount > 1) return true;

  // Or, if "anyone" has rights to it, it is shared.
  nsCString anyonesRights =
      m_rightsHash.Get(nsLiteralCString(IMAP_ACL_ANYONE_STRING));
  return (!anyonesRights.IsEmpty());
}

bool nsMsgIMAPFolderACL::GetDoIHaveFullRightsForFolder() {
  return (GetCanIReadFolder() && GetCanIWriteFolder() &&
          GetCanIInsertInFolder() && GetCanIAdministerFolder() &&
          GetCanICreateSubfolder() && GetCanIDeleteInFolder() &&
          GetCanILookupFolder() && GetCanIStoreSeenInFolder() &&
          GetCanIExpungeFolder() && GetCanIPostToFolder());
}

// Returns a newly allocated string describing these rights
nsresult nsMsgIMAPFolderACL::CreateACLRightsString(nsAString& aRightsString) {
  nsString curRight;
  nsCOMPtr<nsIStringBundle> bundle;
  nsresult rv = IMAPGetStringBundle(getter_AddRefs(bundle));
  NS_ENSURE_SUCCESS(rv, rv);

  if (GetDoIHaveFullRightsForFolder()) {
    nsAutoString result;
    rv = bundle->GetStringFromName("imapAclFullRights", result);
    aRightsString.Assign(result);
    return rv;
  }

  if (GetCanIReadFolder()) {
    bundle->GetStringFromName("imapAclReadRight", curRight);
    aRightsString.Append(curRight);
  }
  if (GetCanIWriteFolder()) {
    if (!aRightsString.IsEmpty()) aRightsString.AppendLiteral(", ");
    bundle->GetStringFromName("imapAclWriteRight", curRight);
    aRightsString.Append(curRight);
  }
  if (GetCanIInsertInFolder()) {
    if (!aRightsString.IsEmpty()) aRightsString.AppendLiteral(", ");
    bundle->GetStringFromName("imapAclInsertRight", curRight);
    aRightsString.Append(curRight);
  }
  if (GetCanILookupFolder()) {
    if (!aRightsString.IsEmpty()) aRightsString.AppendLiteral(", ");
    bundle->GetStringFromName("imapAclLookupRight", curRight);
    aRightsString.Append(curRight);
  }
  if (GetCanIStoreSeenInFolder()) {
    if (!aRightsString.IsEmpty()) aRightsString.AppendLiteral(", ");
    bundle->GetStringFromName("imapAclSeenRight", curRight);
    aRightsString.Append(curRight);
  }
  if (GetCanIDeleteInFolder()) {
    if (!aRightsString.IsEmpty()) aRightsString.AppendLiteral(", ");
    bundle->GetStringFromName("imapAclDeleteRight", curRight);
    aRightsString.Append(curRight);
  }
  if (GetCanIExpungeFolder()) {
    if (!aRightsString.IsEmpty()) aRightsString.AppendLiteral(", ");
    bundle->GetStringFromName("imapAclExpungeRight", curRight);
    aRightsString.Append(curRight);
  }
  if (GetCanICreateSubfolder()) {
    if (!aRightsString.IsEmpty()) aRightsString.AppendLiteral(", ");
    bundle->GetStringFromName("imapAclCreateRight", curRight);
    aRightsString.Append(curRight);
  }
  if (GetCanIPostToFolder()) {
    if (!aRightsString.IsEmpty()) aRightsString.AppendLiteral(", ");
    bundle->GetStringFromName("imapAclPostRight", curRight);
    aRightsString.Append(curRight);
  }
  if (GetCanIAdministerFolder()) {
    if (!aRightsString.IsEmpty()) aRightsString.AppendLiteral(", ");
    bundle->GetStringFromName("imapAclAdministerRight", curRight);
    aRightsString.Append(curRight);
  }
  return rv;
}

NS_IMETHODIMP nsImapMailFolder::GetFilePath(nsIFile** aPathName) {
  // this will return a copy of mPath, which is what we want.
  // this will also initialize mPath using parseURI if it isn't already done
  return nsMsgDBFolder::GetFilePath(aPathName);
}

NS_IMETHODIMP nsImapMailFolder::SetFilePath(nsIFile* aPathName) {
  return nsMsgDBFolder::SetFilePath(
      aPathName);  // call base class so mPath will get set
}

nsresult nsImapMailFolder::DisplayStatusMsg(nsIImapUrl* aImapUrl,
                                            const nsAString& msg) {
  nsCOMPtr<nsIImapMockChannel> mockChannel;
  aImapUrl->GetMockChannel(getter_AddRefs(mockChannel));
  if (mockChannel) {
    nsCOMPtr<nsIProgressEventSink> progressSink;
    mockChannel->GetProgressEventSink(getter_AddRefs(progressSink));
    if (progressSink) {
      progressSink->OnStatus(mockChannel, NS_OK,
                             PromiseFlatString(msg).get());  // XXX i18n message
    }
  }
  return NS_OK;
}

NS_IMETHODIMP
nsImapMailFolder::ProgressStatusString(nsIImapProtocol* aProtocol,
                                       const char* aMsgName,
                                       const char16_t* extraInfo) {
  nsString progressMsg;

  nsCOMPtr<nsIMsgIncomingServer> server;
  nsresult rv = GetServer(getter_AddRefs(server));
  if (NS_SUCCEEDED(rv) && server) {
    nsCOMPtr<nsIImapServerSink> serverSink = do_QueryInterface(server);
    if (serverSink) serverSink->GetImapStringByName(aMsgName, progressMsg);
  }
  if (progressMsg.IsEmpty())
    IMAPGetStringByName(aMsgName, getter_Copies(progressMsg));

  if (aProtocol && !progressMsg.IsEmpty()) {
    nsCOMPtr<nsIImapUrl> imapUrl;
    aProtocol->GetRunningImapURL(getter_AddRefs(imapUrl));
    if (imapUrl) {
      if (extraInfo) {
        nsString printfString;
        nsTextFormatter::ssprintf(printfString, progressMsg.get(), extraInfo);
        progressMsg = printfString;
      }

      DisplayStatusMsg(imapUrl, progressMsg);
    }
  }
  return NS_OK;
}

NS_IMETHODIMP
nsImapMailFolder::PercentProgress(nsIImapProtocol* aProtocol,
                                  nsACString const& aFmtStringName,
                                  int64_t aCurrentProgress,
                                  int64_t aMaxProgress) {
  if (aProtocol) {
    nsCOMPtr<nsIImapUrl> imapUrl;
    aProtocol->GetRunningImapURL(getter_AddRefs(imapUrl));
    if (imapUrl) {
      nsCOMPtr<nsIImapMockChannel> mockChannel;
      imapUrl->GetMockChannel(getter_AddRefs(mockChannel));
      if (mockChannel) {
        nsCOMPtr<nsIProgressEventSink> progressSink;
        mockChannel->GetProgressEventSink(getter_AddRefs(progressSink));
        if (progressSink) {
          progressSink->OnProgress(mockChannel, aCurrentProgress, aMaxProgress);

          if (!aFmtStringName.IsEmpty()) {
            // There's a progress message to format (the progress messages are
            // all localized and expect three params).
            nsAutoString current;
            current.AppendInt(aCurrentProgress);
            nsAutoString expected;
            expected.AppendInt(aMaxProgress);
            // Use the localized (pretty) name and not the the standard imap
            // name. I.e., don't use INBOX but use the local name, e.g.,
            // "Bandeja de entrada".
            nsString prettyName;
            GetPrettyName(prettyName);
            AutoTArray<nsString, 3> params = {current, expected, prettyName};

            nsCOMPtr<nsIStringBundle> bundle;
            nsresult rv = IMAPGetStringBundle(getter_AddRefs(bundle));
            NS_ENSURE_SUCCESS(rv, rv);

            nsString progressText;
            rv = bundle->FormatStringFromName(
                PromiseFlatCString(aFmtStringName).get(), params, progressText);
            NS_ENSURE_SUCCESS(rv, rv);
            if (!progressText.IsEmpty()) {
              progressSink->OnStatus(mockChannel, NS_OK, progressText.get());
            }
          }
        }
      }
    }
  }
  return NS_OK;
}

NS_IMETHODIMP
nsImapMailFolder::CopyNextStreamMessage(bool copySucceeded,
                                        nsISupports* copyState) {
  // if copy has failed it could be either user interrupted it or for some other
  // reason don't do any subsequent copies or delete src messages if it is move
  if (!copySucceeded) return NS_OK;
  nsresult rv;
  nsCOMPtr<nsImapMailCopyState> mailCopyState =
      do_QueryInterface(copyState, &rv);
  if (NS_FAILED(rv)) {
    MOZ_LOG(IMAP, mozilla::LogLevel::Info,
            ("QI copyState failed: %" PRIx32, static_cast<uint32_t>(rv)));
    return rv;  // this can fail...
  }

  if (!mailCopyState->m_streamCopy) return NS_OK;

  uint32_t idx = mailCopyState->m_curIndex;
  if (mailCopyState->m_isMove && idx) {
    nsCOMPtr<nsIMsgFolder> srcFolder(
        do_QueryInterface(mailCopyState->m_srcSupport, &rv));
    if (NS_SUCCEEDED(rv) && srcFolder) {
      // Create "array" of one message header to delete
      idx--;
      if (idx < mailCopyState->m_messages.Length()) {
        RefPtr<nsIMsgDBHdr> msg = mailCopyState->m_messages[idx];
        srcFolder->DeleteMessages({msg}, nullptr, true, true, nullptr, false);
      }
    }
  }

  if (mailCopyState->m_curIndex < mailCopyState->m_messages.Length()) {
    MOZ_LOG(IMAP, mozilla::LogLevel::Info,
            ("CopyNextStreamMessage: %s %u of %u",
             mailCopyState->m_isMove ? "Moving" : "Copying",
             mailCopyState->m_curIndex,
             (uint32_t)mailCopyState->m_messages.Length()));
    nsIMsgDBHdr* message = mailCopyState->m_messages[mailCopyState->m_curIndex];
    bool isRead;
    message->GetIsRead(&isRead);
    mailCopyState->m_unreadCount = (isRead) ? 0 : 1;
    rv = CopyStreamMessage(message, this, mailCopyState->m_msgWindow,
                           mailCopyState->m_isMove);
  } else {
    // Notify of move/copy completion in case we have some source headers
    nsCOMPtr<nsIMsgFolderNotificationService> notifier(
        do_GetService("@mozilla.org/messenger/msgnotificationservice;1"));
    if (notifier && !mailCopyState->m_messages.IsEmpty()) {
      notifier->NotifyMsgsMoveCopyCompleted(
          mailCopyState->m_isMove, mailCopyState->m_messages, this, {});
    }
    if (mailCopyState->m_isMove) {
      nsCOMPtr<nsIMsgFolder> srcFolder(
          do_QueryInterface(mailCopyState->m_srcSupport, &rv));
      if (NS_SUCCEEDED(rv) && srcFolder) {
        // we want to send this notification now that the source messages have
        // been deleted.
        nsCOMPtr<nsIMsgLocalMailFolder> popFolder(do_QueryInterface(srcFolder));
        if (popFolder)  // needed if move pop->imap to notify FE
          srcFolder->NotifyFolderEvent(kDeleteOrMoveMsgCompleted);
      }
    }
  }
  if (NS_FAILED(rv)) (void)OnCopyCompleted(mailCopyState->m_srcSupport, rv);

  return rv;
}

NS_IMETHODIMP
nsImapMailFolder::SetUrlState(nsIImapProtocol* aProtocol,
                              nsIMsgMailNewsUrl* aUrl, bool isRunning,
                              bool aSuspend, nsresult statusCode) {
  // If we have no path, then the folder has been shutdown, and there's
  // no point in doing anything...
  if (!mPath) return NS_OK;
  if (!isRunning) {
    ProgressStatusString(aProtocol, "imapDone", nullptr);
    m_urlRunning = false;
    // if no protocol, then we're reading from the mem or disk cache
    // and we don't want to end the offline download just yet.
    if (aProtocol) {
      EndOfflineDownload();
      m_downloadingFolderForOfflineUse = false;
    }
    nsCOMPtr<nsIImapUrl> imapUrl(do_QueryInterface(aUrl));
    if (imapUrl) {
      nsImapAction imapAction;
      imapUrl->GetImapAction(&imapAction);
      // if the server doesn't support copyUID, then SetCopyResponseUid won't
      // get called, so we need to clear m_pendingOfflineMoves when the online
      // move operation has finished.
      if (imapAction == nsIImapUrl::nsImapOnlineMove)
        m_pendingOfflineMoves.Clear();
    }
  }
  if (aUrl && !aSuspend) return aUrl->SetUrlState(isRunning, statusCode);
  return statusCode;
}

// used when copying from local mail folder, or other imap server)
nsresult nsImapMailFolder::CopyMessagesWithStream(
    nsIMsgFolder* srcFolder, nsTArray<RefPtr<nsIMsgDBHdr>> const& messages,
    bool isMove, bool isCrossServerOp, nsIMsgWindow* msgWindow,
    nsIMsgCopyServiceListener* listener, bool allowUndo) {
  NS_ENSURE_ARG_POINTER(srcFolder);
  nsresult rv;
  rv = InitCopyState(srcFolder, messages, isMove, false, isCrossServerOp, 0,
                     EmptyCString(), listener, msgWindow, allowUndo);
  if (NS_FAILED(rv)) return rv;

  m_copyState->m_streamCopy = true;

  // ** jt - needs to create server to server move/copy undo msg txn
  if (m_copyState->m_allowUndo) {
    nsAutoCString messageIds;
    nsTArray<nsMsgKey> srcKeyArray;
    rv = BuildIdsAndKeyArray(messages, messageIds, srcKeyArray);

    RefPtr<nsImapMoveCopyMsgTxn> undoMsgTxn = new nsImapMoveCopyMsgTxn;

    if (!undoMsgTxn ||
        NS_FAILED(undoMsgTxn->Init(srcFolder, &srcKeyArray, messageIds.get(),
                                   this, true, isMove)))
      return NS_ERROR_OUT_OF_MEMORY;

    if (isMove) {
      if (mFlags & nsMsgFolderFlags::Trash)
        undoMsgTxn->SetTransactionType(nsIMessenger::eDeleteMsg);
      else
        undoMsgTxn->SetTransactionType(nsIMessenger::eMoveMsg);
    } else
      undoMsgTxn->SetTransactionType(nsIMessenger::eCopyMsg);
    m_copyState->m_undoMsgTxn = undoMsgTxn;
  }
  if (NS_SUCCEEDED(rv)) CopyStreamMessage(messages[0], this, msgWindow, isMove);
  return rv;  // we are clearing copy state in CopyMessages on failure
}

nsresult nsImapMailFolder::GetClearedOriginalOp(
    nsIMsgOfflineImapOperation* op, nsIMsgOfflineImapOperation** originalOp,
    nsIMsgDatabase** originalDB) {
  nsCOMPtr<nsIMsgOfflineImapOperation> returnOp;
  nsOfflineImapOperationType opType;
  op->GetOperation(&opType);
  NS_ASSERTION(opType & nsIMsgOfflineImapOperation::kMoveResult,
               "not an offline move op");

  nsCString sourceFolderURI;
  op->GetSourceFolderURI(sourceFolderURI);

  nsresult rv;
  nsCOMPtr<nsIMsgFolder> sourceFolder;
  rv = GetOrCreateFolder(sourceFolderURI, getter_AddRefs(sourceFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIDBFolderInfo> folderInfo;
  sourceFolder->GetDBFolderInfoAndDB(getter_AddRefs(folderInfo), originalDB);
  if (*originalDB) {
    nsCOMPtr<nsIMsgOfflineOpsDatabase> opsDb =
        do_QueryInterface(*originalDB, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    nsMsgKey originalKey;
    op->GetMessageKey(&originalKey);
    rv =
        opsDb->GetOfflineOpForKey(originalKey, false, getter_AddRefs(returnOp));
    if (NS_SUCCEEDED(rv) && returnOp) {
      nsCString moveDestination;
      nsCString thisFolderURI;
      GetURI(thisFolderURI);
      returnOp->GetDestinationFolderURI(moveDestination);
      if (moveDestination.Equals(thisFolderURI))
        returnOp->ClearOperation(nsIMsgOfflineImapOperation::kMoveResult);
    }
  }
  returnOp.forget(originalOp);
  return rv;
}

nsresult nsImapMailFolder::GetOriginalOp(
    nsIMsgOfflineImapOperation* op, nsIMsgOfflineImapOperation** originalOp,
    nsIMsgDatabase** originalDB) {
  nsCOMPtr<nsIMsgOfflineImapOperation> returnOp;
  nsCString sourceFolderURI;
  op->GetSourceFolderURI(sourceFolderURI);

  nsresult rv;
  nsCOMPtr<nsIMsgFolder> sourceFolder;
  rv = GetOrCreateFolder(sourceFolderURI, getter_AddRefs(sourceFolder));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIDBFolderInfo> folderInfo;
  sourceFolder->GetDBFolderInfoAndDB(getter_AddRefs(folderInfo), originalDB);
  if (*originalDB) {
    nsCOMPtr<nsIMsgOfflineOpsDatabase> opsDb =
        do_QueryInterface(*originalDB, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    nsMsgKey originalKey;
    op->GetMessageKey(&originalKey);
    rv =
        opsDb->GetOfflineOpForKey(originalKey, false, getter_AddRefs(returnOp));
  }
  returnOp.forget(originalOp);
  return rv;
}

// Helper to synchronously copy a message from one msgStore to another.
static nsresult CopyStoreMessage(nsIMsgDBHdr* srcHdr, nsIMsgDBHdr* destHdr,
                                 uint64_t& bytesCopied) {
  nsresult rv;

  // Boilerplate setup.
  nsCOMPtr<nsIMsgFolder> srcFolder;
  rv = srcHdr->GetFolder(getter_AddRefs(srcFolder));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIMsgFolder> destFolder;
  rv = destHdr->GetFolder(getter_AddRefs(destFolder));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIMsgPluggableStore> destStore;
  rv = destFolder->GetMsgStore(getter_AddRefs(destStore));
  NS_ENSURE_SUCCESS(rv, rv);

  // Copy message into the msgStore.
  nsCOMPtr<nsIInputStream> srcStream;
  rv = srcFolder->GetLocalMsgStream(srcHdr, getter_AddRefs(srcStream));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIOutputStream> destStream;
  rv = destFolder->GetOfflineStoreOutputStream(destHdr,
                                               getter_AddRefs(destStream));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = SyncCopyStream(srcStream, destStream, bytesCopied);
  if (NS_SUCCEEDED(rv)) {
    rv = destStore->FinishNewMessage(destStream, destHdr);
  } else {
    destStore->DiscardNewMessage(destStream, destHdr);
  }
  return rv;
}

// This imap folder is the destination of an offline move/copy.
// We are either offline, or doing a pseudo-offline delete (where we do an
// offline delete, load the next message, then playback the offline delete).
nsresult nsImapMailFolder::CopyMessagesOffline(
    nsIMsgFolder* srcFolder, nsTArray<RefPtr<nsIMsgDBHdr>> const& messages,
    bool isMove, nsIMsgWindow* msgWindow, nsIMsgCopyServiceListener* listener) {
  nsresult rv;
  nsresult stopit = NS_OK;
  nsCOMPtr<nsIMsgDatabase> sourceMailDB;
  nsCOMPtr<nsIDBFolderInfo> srcDbFolderInfo;
  srcFolder->GetDBFolderInfoAndDB(getter_AddRefs(srcDbFolderInfo),
                                  getter_AddRefs(sourceMailDB));
  bool deleteToTrash = false;
  bool deleteImmediately = false;
  uint32_t srcCount = messages.Length();
  nsCOMPtr<nsIImapIncomingServer> imapServer;
  rv = GetImapIncomingServer(getter_AddRefs(imapServer));

  nsTArray<RefPtr<nsIMsgDBHdr>> msgHdrsCopied;
  nsTArray<RefPtr<nsIMsgDBHdr>> destMsgHdrs;

  if (NS_SUCCEEDED(rv) && imapServer) {
    nsMsgImapDeleteModel deleteModel;
    imapServer->GetDeleteModel(&deleteModel);
    deleteToTrash = (deleteModel == nsMsgImapDeleteModels::MoveToTrash);
    deleteImmediately = (deleteModel == nsMsgImapDeleteModels::DeleteNoTrash);
  }

  // This array is used only when we are actually removing the messages from the
  // source database.
  nsTArray<nsMsgKey> keysToDelete(
      (isMove && (deleteToTrash || deleteImmediately)) ? srcCount : 0);

  if (sourceMailDB) {
    // save the future ops in the source DB, if this is not a imap->local
    // copy/move
    nsCOMPtr<nsITransactionManager> txnMgr;
    if (msgWindow) msgWindow->GetTransactionManager(getter_AddRefs(txnMgr));
    if (txnMgr) txnMgr->BeginBatch(nullptr);
    nsCOMPtr<nsIMsgDatabase> destDB;
    GetMsgDatabase(getter_AddRefs(destDB));
    if (destDB) {
      // N.B. We must not return out of the for loop - we need the matching
      // end notifications to be sent.
      // We don't need to acquire the semaphore since this is synchronous
      // on the UI thread but we should check if the offline store is locked.
      bool isLocked;
      GetLocked(&isLocked);
      nsTArray<nsMsgKey> addedKeys;
      nsTArray<nsMsgKey> srcKeyArray;
      nsCOMArray<nsIMsgDBHdr> addedHdrs;
      nsCOMArray<nsIMsgDBHdr> srcMsgs;
      nsOfflineImapOperationType moveCopyOpType;
      nsOfflineImapOperationType deleteOpType =
          nsIMsgOfflineImapOperation::kDeletedMsg;
      if (!deleteToTrash)
        deleteOpType = nsIMsgOfflineImapOperation::kMsgMarkedDeleted;
      nsCString messageIds;
      rv = BuildIdsAndKeyArray(messages, messageIds, srcKeyArray);
      // put fake message in destination db, delete source if move
      EnableNotifications(nsIMsgFolder::allMessageCountNotifications, false);
      nsCString originalSrcFolderURI;
      srcFolder->GetURI(originalSrcFolderURI);
      nsCOMPtr<nsIMsgOfflineOpsDatabase> opsDb =
          do_QueryInterface(sourceMailDB, &rv);
      NS_ENSURE_SUCCESS(rv, rv);
      for (uint32_t sourceKeyIndex = 0;
           NS_SUCCEEDED(stopit) && (sourceKeyIndex < srcCount);
           sourceKeyIndex++) {
        bool messageReturningHome = false;
        RefPtr<nsIMsgDBHdr> message = messages[sourceKeyIndex];
        nsMsgKey originalKey;
        if (message) {
          rv = message->GetMessageKey(&originalKey);
        } else {
          NS_ERROR("bad msg in src array");
          continue;
        }
        // Set up an offline op for this message in the source DB.
        nsCOMPtr<nsIMsgOfflineImapOperation> sourceOp;
        rv = opsDb->GetOfflineOpForKey(originalKey, true,
                                       getter_AddRefs(sourceOp));
        if (NS_SUCCEEDED(rv) && sourceOp) {
          srcFolder->SetFlag(nsMsgFolderFlags::OfflineEvents);
          nsCOMPtr<nsIMsgDatabase> originalDB;
          nsOfflineImapOperationType opType;
          sourceOp->GetOperation(&opType);
          // if we already have an offline op for this key, then we need to see
          // if it was moved into the source folder while offline
          if (opType ==
              nsIMsgOfflineImapOperation::kMoveResult)  // offline move
          {
            // gracious me, we are moving something we already moved while
            // offline! find the original operation and clear it!
            nsCOMPtr<nsIMsgOfflineImapOperation> originalOp;
            GetClearedOriginalOp(sourceOp, getter_AddRefs(originalOp),
                                 getter_AddRefs(originalDB));
            nsCOMPtr<nsIMsgOfflineOpsDatabase> opsDbOriginal =
                do_QueryInterface(originalDB, &rv);
            if (NS_SUCCEEDED(rv) && originalOp) {
              nsCString srcFolderURI;
              srcFolder->GetURI(srcFolderURI);
              sourceOp->GetSourceFolderURI(originalSrcFolderURI);
              sourceOp->GetMessageKey(&originalKey);
              if (isMove) opsDb->RemoveOfflineOp(sourceOp);
              sourceOp = originalOp;
              if (originalSrcFolderURI.Equals(srcFolderURI)) {
                messageReturningHome = true;
                opsDbOriginal->RemoveOfflineOp(originalOp);
              }
            }
          }
          if (!messageReturningHome) {
            nsCString folderURI;
            GetURI(folderURI);
            if (isMove) {
              uint32_t msgSize;
              uint32_t msgFlags;
              imapMessageFlagsType newImapFlags = 0;
              message->GetMessageSize(&msgSize);
              message->GetFlags(&msgFlags);
              sourceOp->SetDestinationFolderURI(folderURI);  // offline move
              sourceOp->SetOperation(nsIMsgOfflineImapOperation::kMsgMoved);
              sourceOp->SetMsgSize(msgSize);
              newImapFlags = msgFlags & 0x7;
              if (msgFlags & nsMsgMessageFlags::Forwarded)
                newImapFlags |= kImapMsgForwardedFlag;
              sourceOp->SetNewFlags(newImapFlags);
            } else {
              sourceOp->AddMessageCopyOperation(folderURI);  // offline copy
            }

            sourceOp->GetOperation(&moveCopyOpType);
            srcMsgs.AppendObject(message);
          }
        } else {
          stopit = NS_ERROR_FAILURE;
        }
        // End of block to set up offline op.

        nsCOMPtr<nsIMsgDBHdr> mailHdr;
        rv =
            sourceMailDB->GetMsgHdrForKey(originalKey, getter_AddRefs(mailHdr));

        if (NS_SUCCEEDED(rv) && mailHdr) {
          // Copy the DB hdr into the destination folder.
          bool successfulCopy = false;
          nsMsgKey srcDBhighWaterMark;
          srcDbFolderInfo->GetHighWater(&srcDBhighWaterMark);

          // Generate a fake key which is very unlikely to clash with any
          // UIDs that appear once this operation has been played out on the
          // IMAP server (Because IMAP uses server-side UIDs as msgKeys -
          // Bug 1806770).
          nsMsgKey fakeKey;
          destDB->GetNextFakeOfflineMsgKey(&fakeKey);

          nsCOMPtr<nsIMsgDBHdr> newMailHdr;
          rv = destDB->CopyHdrFromExistingHdr(fakeKey, mailHdr, true,
                                              getter_AddRefs(newMailHdr));
          if (!newMailHdr || NS_FAILED(rv)) {
            NS_ASSERTION(false, "failed to copy hdr");
            stopit = rv;
          }

          if (NS_SUCCEEDED(stopit)) {
            bool hasMsgOffline = false;

            destMsgHdrs.AppendElement(newMailHdr);
            srcFolder->HasMsgOffline(originalKey, &hasMsgOffline);
            newMailHdr->SetUint32Property("pseudoHdr", 1);

            if (hasMsgOffline && !isLocked) {
              uint64_t bytesCopied;
              stopit = CopyStoreMessage(mailHdr, newMailHdr, bytesCopied);
              if (NS_SUCCEEDED(stopit)) {
                uint32_t unused;
                newMailHdr->OrFlags(nsMsgMessageFlags::Offline, &unused);
                newMailHdr->SetOfflineMessageSize(bytesCopied);
              }
            } else {
              destDB->MarkOffline(fakeKey, false, nullptr);
            }

            // Create a corresponding offline op in the destination DB.
            nsCOMPtr<nsIMsgOfflineOpsDatabase> opsDb =
                do_QueryInterface(destDB, &rv);
            NS_ENSURE_SUCCESS(rv, rv);

            nsCOMPtr<nsIMsgOfflineImapOperation> destOp;
            opsDb->GetOfflineOpForKey(fakeKey, true, getter_AddRefs(destOp));
            if (destOp) {
              // check if this is a move back to the original mailbox, in which
              // case we just delete the offline operation.
              if (messageReturningHome) {
                opsDb->RemoveOfflineOp(destOp);
              } else {
                SetFlag(nsMsgFolderFlags::OfflineEvents);
                // SetSourceFolderURI() sets the op to kMoveResult.
                destOp->SetSourceFolderURI(originalSrcFolderURI);
                // Attach the key of the source message (in the srcDB).
                destOp->SetSrcMessageKey(originalKey);
                addedKeys.AppendElement(fakeKey);
                addedHdrs.AppendObject(newMailHdr);
              }
            } else {
              stopit = NS_ERROR_FAILURE;
            }
          }
          successfulCopy = NS_SUCCEEDED(stopit);
          nsMsgKey msgKey;
          mailHdr->GetMessageKey(&msgKey);
          if (isMove && successfulCopy) {
            if (deleteToTrash || deleteImmediately)
              keysToDelete.AppendElement(msgKey);
            else
              sourceMailDB->MarkImapDeleted(msgKey, true,
                                            nullptr);  // offline delete
          }
          if (successfulCopy) {
            // This is for both moves and copies
            msgHdrsCopied.AppendElement(mailHdr);
          }
        }
      }  // End message loop.
      EnableNotifications(nsIMsgFolder::allMessageCountNotifications, true);
      RefPtr<nsImapOfflineTxn> addHdrMsgTxn = new nsImapOfflineTxn(
          this, &addedKeys, nullptr, this, isMove,
          nsIMsgOfflineImapOperation::kAddedHeader, addedHdrs);
      if (addHdrMsgTxn && txnMgr) txnMgr->DoTransaction(addHdrMsgTxn);
      RefPtr<nsImapOfflineTxn> undoMsgTxn =
          new nsImapOfflineTxn(srcFolder, &srcKeyArray, messageIds.get(), this,
                               isMove, moveCopyOpType, srcMsgs);
      if (undoMsgTxn) {
        if (isMove) {
          undoMsgTxn->SetTransactionType(nsIMessenger::eMoveMsg);
          nsCOMPtr<nsIMsgImapMailFolder> srcIsImap(
              do_QueryInterface(srcFolder));
          // remember this undo transaction so we can hook up the result
          // msg ids in the undo transaction.
          if (srcIsImap) {
            nsImapMailFolder* srcImapFolder =
                static_cast<nsImapMailFolder*>(srcFolder);
            srcImapFolder->m_pendingOfflineMoves.AppendElement(undoMsgTxn);
          }
        } else {
          undoMsgTxn->SetTransactionType(nsIMessenger::eCopyMsg);
        }
        // we're adding this undo action before the delete is successful. This
        // is evil, but 4.5 did it as well.
        if (txnMgr) txnMgr->DoTransaction(undoMsgTxn);
      }
      undoMsgTxn =
          new nsImapOfflineTxn(srcFolder, &srcKeyArray, messageIds.get(), this,
                               isMove, deleteOpType, srcMsgs);
      if (undoMsgTxn) {
        if (isMove) {
          if (mFlags & nsMsgFolderFlags::Trash) {
            undoMsgTxn->SetTransactionType(nsIMessenger::eDeleteMsg);
          } else {
            undoMsgTxn->SetTransactionType(nsIMessenger::eMoveMsg);
          }
        } else {
          undoMsgTxn->SetTransactionType(nsIMessenger::eCopyMsg);
        }
        if (txnMgr) txnMgr->DoTransaction(undoMsgTxn);
      }

      if (isMove) sourceMailDB->Commit(nsMsgDBCommitType::kLargeCommit);
      destDB->Commit(nsMsgDBCommitType::kLargeCommit);
      SummaryChanged();
      srcFolder->SummaryChanged();
    }
    if (txnMgr) txnMgr->EndBatch(false);
  }

  if (!msgHdrsCopied.IsEmpty()) {
    nsCOMPtr<nsIMsgFolderNotificationService> notifier(
        do_GetService("@mozilla.org/messenger/msgnotificationservice;1"));
    if (notifier) {
      notifier->NotifyMsgsMoveCopyCompleted(isMove, msgHdrsCopied, this,
                                            destMsgHdrs);
    }
  }

  // NOTE (Bug 1787963):
  // If we're performing a move, by rights we should be deleting the source
  // message(s) here. But that would mean they won't be available when we try
  // to run the offline move operation once we're back online. So we'll just
  // leave things as they are:
  //  - the message(s) copied into the destination folder
  //  - the original message(s) left in the source folder
  //  - the offline move operation all queued up for when we go back online
  // When we do go back online, the offline move op will be performed and
  // the source message(s) will be deleted. For real.
  // Would be nice to have some marker to hide or grey out messages which are
  // in this state of impending doom... but it's a pretty obscure corner case
  // and we've already got quite enough of those.
  //
  // BUT... CopyMessagesOffline() is also used when online (ha!), *if* we're
  // copying between folders on the same nsIMsgIncomingServer, in order to
  // support undo. In that case we _do_ want to go ahead with the delete now.

  bool sameServer;
  rv = IsOnSameServer(srcFolder, this, &sameServer);

  if (NS_SUCCEEDED(rv) && sameServer && isMove &&
      (deleteToTrash || deleteImmediately)) {
    DeleteStoreMessages(keysToDelete, srcFolder);
    srcFolder->EnableNotifications(nsIMsgFolder::allMessageCountNotifications,
                                   false);
    sourceMailDB->DeleteMessages(keysToDelete, nullptr);
    srcFolder->EnableNotifications(nsIMsgFolder::allMessageCountNotifications,
                                   true);
  }
  nsCOMPtr<nsISupports> srcSupport = do_QueryInterface(srcFolder);
  OnCopyCompleted(srcSupport, rv);

  if (isMove) {
    srcFolder->NotifyFolderEvent(NS_SUCCEEDED(rv) ? kDeleteOrMoveMsgCompleted
                                                  : kDeleteOrMoveMsgFailed);
  }
  return rv;
}

void nsImapMailFolder::SetPendingAttributes(
    const nsTArray<RefPtr<nsIMsgDBHdr>>& messages, bool aIsMove,
    bool aSetOffline) {
  GetDatabase();
  if (!mDatabase) return;

  uint32_t supportedUserFlags;
  GetSupportedUserFlags(&supportedUserFlags);

  nsresult rv;
  nsCOMPtr<nsIPrefBranch> prefBranch(
      do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS_VOID(rv);

  nsCString dontPreserve;

  // These preferences exist so that extensions can control which properties
  // are preserved in the database when a message is moved or copied. All
  // properties are preserved except those listed in these preferences
  if (aIsMove)
    prefBranch->GetCharPref("mailnews.database.summary.dontPreserveOnMove",
                            dontPreserve);
  else
    prefBranch->GetCharPref("mailnews.database.summary.dontPreserveOnCopy",
                            dontPreserve);

  // We'll add spaces at beginning and end so we can search for space-name-space
  nsCString dontPreserveEx(" "_ns);
  dontPreserveEx.Append(dontPreserve);
  dontPreserveEx.Append(' ');

  // these properties are set as integers below, so don't set them again
  // in the iteration through the properties
  dontPreserveEx.AppendLiteral(
      "offlineMsgSize msgOffset flags priority pseudoHdr ");

  // these fields are either copied separately when the server does not support
  // custom IMAP flags, or managed directly through the flags
  dontPreserveEx.AppendLiteral("keywords label ");

  // check if any msg hdr has special flags or properties set
  // that we need to set on the dest hdr
  for (auto msgDBHdr : messages) {
    if (!(supportedUserFlags & kImapMsgSupportUserFlag)) {
      nsCString keywords;
      msgDBHdr->GetStringProperty("keywords", keywords);
      if (!keywords.IsEmpty())
        mDatabase->SetAttributeOnPendingHdr(msgDBHdr, "keywords",
                                            keywords.get());
    }

    nsTArray<nsCString> properties;
    nsresult rv = msgDBHdr->GetProperties(properties);
    NS_ENSURE_SUCCESS_VOID(rv);

    nsCString sourceString;
    for (auto property : properties) {
      nsAutoCString propertyEx(" "_ns);
      propertyEx.Append(property);
      propertyEx.Append(' ');
      if (dontPreserveEx.Find(propertyEx) != kNotFound) continue;

      nsCString sourceString;
      msgDBHdr->GetStringProperty(property.get(), sourceString);
      mDatabase->SetAttributeOnPendingHdr(msgDBHdr, property.get(),
                                          sourceString.get());
    }

    // Carry over HasRe flag.
    uint32_t flags;
    uint32_t storeFlags = 0;
    msgDBHdr->GetFlags(&flags);
    if (flags & nsMsgMessageFlags::HasRe) {
      storeFlags = nsMsgMessageFlags::HasRe;
      mDatabase->SetUint32AttributeOnPendingHdr(msgDBHdr, "flags", storeFlags);
    }

    uint32_t messageSize;
    msgDBHdr->GetOfflineMessageSize(&messageSize);
    if (messageSize) {
      mDatabase->SetUint32AttributeOnPendingHdr(msgDBHdr, "offlineMsgSize",
                                                messageSize);
      nsCString storeToken;
      msgDBHdr->GetStoreToken(storeToken);
      mDatabase->SetAttributeOnPendingHdr(msgDBHdr, "storeToken",
                                          storeToken.get());
      // Not always setting "flags" attribute to nsMsgMessageFlags::Offline
      // here because it can cause missing parts (inline or attachments)
      // when messages are moved or copied manually or by filter action.
      if (aSetOffline) {
        mDatabase->SetUint32AttributeOnPendingHdr(
            msgDBHdr, "flags", storeFlags | nsMsgMessageFlags::Offline);
      }
    }
    nsMsgPriorityValue priority;
    msgDBHdr->GetPriority(&priority);
    if (priority != 0) {
      nsAutoCString priorityStr;
      priorityStr.AppendInt(priority);
      mDatabase->SetAttributeOnPendingHdr(msgDBHdr, "priority",
                                          priorityStr.get());
    }
  }
}

NS_IMETHODIMP
nsImapMailFolder::CopyMessages(
    nsIMsgFolder* srcFolder, nsTArray<RefPtr<nsIMsgDBHdr>> const& messages,
    bool isMove, nsIMsgWindow* msgWindow, nsIMsgCopyServiceListener* listener,
    bool isFolder,  // isFolder for future use when we do cross-server folder
                    // move/copy
    bool allowUndo) {
  UpdateTimestamps(allowUndo);

  nsresult rv;
  nsCOMPtr<nsISupports> srcSupport = do_QueryInterface(srcFolder);

  bool sameServer;
  rv = IsOnSameServer(srcFolder, this, &sameServer);
  if (NS_FAILED(rv)) goto done;

  // in theory, if allowUndo is true, then this is a user initiated
  // action, and we should do it pseudo-offline. If it's not
  // user initiated (e.g., mail filters firing), then allowUndo is
  // false, and we should just do the action.
  if (!WeAreOffline() && sameServer && allowUndo) {
    // complete the copy operation as in offline mode
    rv = CopyMessagesOffline(srcFolder, messages, isMove, msgWindow, listener);

    NS_WARNING_ASSERTION(NS_SUCCEEDED(rv), "error offline copy");
    // We'll warn if this fails, but we should still try to play back
    // offline ops, because it's possible the copy got far enough to
    // create the offline ops.

    // We make sure that the source folder is an imap folder by limiting
    // pseudo-offline operations to the same imap server. If we extend the code
    // to cover non imap folders in the future (i.e. imap folder->local folder),
    // then the following downcast will cause either a crash or compiler error.
    // Do not forget to change it accordingly.
    nsImapMailFolder* srcImapFolder = static_cast<nsImapMailFolder*>(srcFolder);

    // if there is no pending request, create a new one, and set the timer.
    // Otherwise use the existing one to reset the timer. it is callback
    // function's responsibility to delete the new request object
    if (!srcImapFolder->m_pendingPlaybackReq) {
      srcImapFolder->m_pendingPlaybackReq =
          new nsPlaybackRequest(srcImapFolder, msgWindow);
    }

    // Create and start a new playback one-shot timer. If there is already a
    // timer created that has not timed out, cancel it.
    if (srcImapFolder->m_playbackTimer)
      srcImapFolder->m_playbackTimer->Cancel();
    rv = NS_NewTimerWithFuncCallback(
        getter_AddRefs(srcImapFolder->m_playbackTimer), PlaybackTimerCallback,
        (void*)srcImapFolder->m_pendingPlaybackReq,
        PLAYBACK_TIMER_INTERVAL_IN_MS, nsITimer::TYPE_ONE_SHOT,
        "nsImapMailFolder::PlaybackTimerCallback", nullptr);
    if (NS_FAILED(rv)) {
      NS_WARNING("Could not start m_playbackTimer timer");
    }
    return rv;
  } else {
    // sort the message array by key

    nsTArray<nsMsgKey> keyArray(messages.Length());
    for (nsIMsgDBHdr* aMessage : messages) {
      if (!aMessage) {
        continue;
      }
      nsMsgKey key;
      aMessage->GetMessageKey(&key);
      keyArray.AppendElement(key);
    }
    keyArray.Sort();

    nsTArray<RefPtr<nsIMsgDBHdr>> sortedMsgs;
    rv = MessagesInKeyOrder(keyArray, srcFolder, sortedMsgs);
    NS_ENSURE_SUCCESS(rv, rv);

    if (WeAreOffline())
      return CopyMessagesOffline(srcFolder, sortedMsgs, isMove, msgWindow,
                                 listener);

    nsCOMPtr<nsIImapService> imapService =
        do_GetService("@mozilla.org/messenger/imapservice;1", &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    // 3rd parameter: Do not set offline flag.
    SetPendingAttributes(sortedMsgs, isMove, false);

    // if the folders aren't on the same server, do a stream base copy
    if (!sameServer) {
      rv = CopyMessagesWithStream(srcFolder, sortedMsgs, isMove, true,
                                  msgWindow, listener, allowUndo);
      goto done;
    }

    nsAutoCString messageIds;
    rv = AllocateUidStringFromKeys(keyArray, messageIds);
    if (NS_FAILED(rv)) goto done;

    nsCOMPtr<nsIUrlListener> urlListener;
    rv =
        QueryInterface(NS_GET_IID(nsIUrlListener), getter_AddRefs(urlListener));
    rv = InitCopyState(srcSupport, sortedMsgs, isMove, true, false, 0,
                       EmptyCString(), listener, msgWindow, allowUndo);
    if (NS_FAILED(rv)) goto done;

    m_copyState->m_curIndex = m_copyState->m_messages.Length();

    if (isMove)
      srcFolder->EnableNotifications(
          allMessageCountNotifications,
          false);  // disable message count notification

    nsCOMPtr<nsIURI> resultUrl;
    nsCOMPtr<nsISupports> copySupport = do_QueryInterface(m_copyState);
    rv = imapService->OnlineMessageCopy(
        srcFolder, messageIds, this, true, isMove, urlListener,
        getter_AddRefs(resultUrl), copySupport, msgWindow);
    if (NS_SUCCEEDED(rv) && m_copyState->m_allowUndo) {
      RefPtr<nsImapMoveCopyMsgTxn> undoMsgTxn = new nsImapMoveCopyMsgTxn;
      if (!undoMsgTxn ||
          NS_FAILED(undoMsgTxn->Init(srcFolder, &keyArray, messageIds.get(),
                                     this, true, isMove)))
        return NS_ERROR_OUT_OF_MEMORY;

      if (isMove) {
        if (mFlags & nsMsgFolderFlags::Trash)
          undoMsgTxn->SetTransactionType(nsIMessenger::eDeleteMsg);
        else
          undoMsgTxn->SetTransactionType(nsIMessenger::eMoveMsg);
      } else
        undoMsgTxn->SetTransactionType(nsIMessenger::eCopyMsg);
      m_copyState->m_undoMsgTxn = undoMsgTxn;
    }

  }  // endif

done:
  if (NS_FAILED(rv)) {
    (void)OnCopyCompleted(srcSupport, rv);
    if (isMove) {
      srcFolder->EnableNotifications(
          allMessageCountNotifications,
          true);  // enable message count notification
      NotifyFolderEvent(kDeleteOrMoveMsgFailed);
    }
  }
  return rv;
}

// This is used when copying an imap or local/pop3 folder to an imap server.
// It does not allow completely moving an imap or local/pop3 folder to an imap
// server since only the messages can be moved between servers.
class nsImapFolderCopyState final : public nsIUrlListener,
                                    public nsIMsgCopyServiceListener {
 public:
  nsImapFolderCopyState(nsIMsgFolder* destParent, nsIMsgFolder* srcFolder,
                        bool isMoveMessages, nsIMsgWindow* msgWindow,
                        nsIMsgCopyServiceListener* listener);

  NS_DECL_ISUPPORTS
  NS_DECL_NSIURLLISTENER
  NS_DECL_NSIMSGCOPYSERVICELISTENER

  nsresult StartNextCopy();
  nsresult AdvanceToNextFolder(nsresult aStatus);

 protected:
  ~nsImapFolderCopyState();
  RefPtr<nsImapMailFolder> m_newDestFolder;
  nsCOMPtr<nsISupports> m_origSrcFolder;
  nsCOMPtr<nsIMsgFolder> m_curDestParent;
  nsCOMPtr<nsIMsgFolder> m_curSrcFolder;
  bool m_isMoveMessages;
  nsCOMPtr<nsIMsgCopyServiceListener> m_copySrvcListener;
  nsCOMPtr<nsIMsgWindow> m_msgWindow;
  int32_t m_childIndex;
  nsCOMArray<nsIMsgFolder> m_srcChildFolders;
  nsCOMArray<nsIMsgFolder> m_destParents;
};

NS_IMPL_ISUPPORTS(nsImapFolderCopyState, nsIUrlListener,
                  nsIMsgCopyServiceListener)

nsImapFolderCopyState::nsImapFolderCopyState(
    nsIMsgFolder* destParent, nsIMsgFolder* srcFolder, bool isMoveMessages,
    nsIMsgWindow* msgWindow, nsIMsgCopyServiceListener* listener) {
  m_origSrcFolder = do_QueryInterface(srcFolder);
  m_curDestParent = destParent;
  m_curSrcFolder = srcFolder;
  m_isMoveMessages = isMoveMessages;
  m_msgWindow = msgWindow;
  m_copySrvcListener = listener;
  m_childIndex = -1;
  // NOTE: The nsImapMailFolder doesn't keep a reference to us, so we're
  // relying on our use as a listener by nsImapService and nsMsgCopyService
  // to keep our refcount from zeroing!
  // Might be safer to add a kungfudeathgrip on ourselves for the duration
  // of the operation? Would need to make sure we catch all error conditions.
}

nsImapFolderCopyState::~nsImapFolderCopyState() {}

nsresult nsImapFolderCopyState::StartNextCopy() {
  nsresult rv;
  // Create the destination folder (our OnStopRunningUrl() will be called
  // when done).
  nsCOMPtr<nsIImapService> imapService =
      do_GetService("@mozilla.org/messenger/imapservice;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  nsString folderName;
  m_curSrcFolder->GetName(folderName);
  return imapService->EnsureFolderExists(m_curDestParent, folderName,
                                         m_msgWindow, this);
}

nsresult nsImapFolderCopyState::AdvanceToNextFolder(nsresult aStatus) {
  nsresult rv = NS_OK;
  m_childIndex++;
  if (m_childIndex >= m_srcChildFolders.Count()) {
    if (m_newDestFolder)
      m_newDestFolder->OnCopyCompleted(m_origSrcFolder, aStatus);
  } else {
    m_curDestParent = m_destParents[m_childIndex];
    m_curSrcFolder = m_srcChildFolders[m_childIndex];
    rv = StartNextCopy();
  }
  return rv;
}

NS_IMETHODIMP
nsImapFolderCopyState::OnStartRunningUrl(nsIURI* aUrl) {
  NS_ASSERTION(aUrl, "sanity check - need to be be running non-null url");
  return NS_OK;
}

NS_IMETHODIMP
nsImapFolderCopyState::OnStopRunningUrl(nsIURI* aUrl, nsresult aExitCode) {
  if (NS_FAILED(aExitCode)) {
    if (m_copySrvcListener) m_copySrvcListener->OnStopCopy(aExitCode);
    return aExitCode;  // or NS_OK???
  }
  nsresult rv = NS_OK;
  if (aUrl) {
    nsCOMPtr<nsIImapUrl> imapUrl = do_QueryInterface(aUrl);
    if (imapUrl) {
      nsImapAction imapAction = nsIImapUrl::nsImapTest;
      imapUrl->GetImapAction(&imapAction);

      switch (imapAction) {
        case nsIImapUrl::nsImapEnsureExistsFolder: {
          // Our EnsureFolderExists() call has completed successfully,
          // so our dest folder is ready.
          nsCOMPtr<nsIMsgFolder> newMsgFolder;
          nsString folderName;
          nsCString utfLeafName;
          m_curSrcFolder->GetName(folderName);
          bool utf8AcceptEnabled;
          nsCOMPtr<nsIMsgImapMailFolder> imapFolder =
              do_QueryInterface(m_curDestParent);
          rv = imapFolder->GetShouldUseUtf8FolderName(&utf8AcceptEnabled);
          NS_ENSURE_SUCCESS(rv, rv);
          if (utf8AcceptEnabled) {
            CopyUTF16toUTF8(folderName, utfLeafName);
          } else {
            CopyUTF16toMUTF7(folderName, utfLeafName);
          }
          // Create the nsIMsgFolder object which represents the folder on
          // the IMAP server.
          rv = m_curDestParent->FindSubFolder(utfLeafName,
                                              getter_AddRefs(newMsgFolder));
          NS_ENSURE_SUCCESS(rv, rv);
          // Save the first new folder so we can send a notification to the
          // copy service when this whole process is done.
          if (!m_newDestFolder)
            m_newDestFolder =
                static_cast<nsImapMailFolder*>(newMsgFolder.get());

          // Check if the source folder has children. If it does, list them
          // into m_srcChildFolders, and set m_destParents for the
          // corresponding indexes to the newly created folder.
          nsTArray<RefPtr<nsIMsgFolder>> subFolders;
          rv = m_curSrcFolder->GetSubFolders(subFolders);
          NS_ENSURE_SUCCESS(rv, rv);
          uint32_t childIndex = 0;
          for (nsIMsgFolder* folder : subFolders) {
            m_srcChildFolders.InsertElementAt(m_childIndex + childIndex + 1,
                                              folder);
            m_destParents.InsertElementAt(m_childIndex + childIndex + 1,
                                          newMsgFolder);
            ++childIndex;
          }

          // Now kick off a copy (or move) of messages to the new folder.
          nsCOMPtr<nsIMsgEnumerator> enumerator;
          rv = m_curSrcFolder->GetMessages(getter_AddRefs(enumerator));
          nsTArray<RefPtr<nsIMsgDBHdr>> msgArray;
          bool hasMore = false;

          if (enumerator) rv = enumerator->HasMoreElements(&hasMore);

          // Early-out for empty folder.
          if (!hasMore) return AdvanceToNextFolder(NS_OK);

          while (NS_SUCCEEDED(rv) && hasMore) {
            nsCOMPtr<nsIMsgDBHdr> hdr;
            rv = enumerator->GetNext(getter_AddRefs(hdr));
            NS_ENSURE_SUCCESS(rv, rv);
            msgArray.AppendElement(hdr);
            rv = enumerator->HasMoreElements(&hasMore);
          }

          nsCOMPtr<nsIMsgCopyService> copyService =
              do_GetService("@mozilla.org/messenger/messagecopyservice;1", &rv);
          NS_ENSURE_SUCCESS(rv, rv);
          rv = copyService->CopyMessages(m_curSrcFolder, msgArray, newMsgFolder,
                                         m_isMoveMessages, this, m_msgWindow,
                                         false /* allowUndo */);
        } break;
      }
    }
  }
  return rv;
}

NS_IMETHODIMP nsImapFolderCopyState::OnStartCopy() { return NS_OK; }

/* void OnProgress (in uint32_t aProgress, in uint32_t aProgressMax); */
NS_IMETHODIMP nsImapFolderCopyState::OnProgress(uint32_t aProgress,
                                                uint32_t aProgressMax) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

/* void SetMessageKey (in nsMsgKey aKey); */
NS_IMETHODIMP nsImapFolderCopyState::SetMessageKey(nsMsgKey aKey) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

/* [noscript] void GetMessageId (in nsCString aMessageId); */
NS_IMETHODIMP nsImapFolderCopyState::GetMessageId(nsACString& messageId) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

/* void OnStopCopy (in nsresult aStatus); */
NS_IMETHODIMP nsImapFolderCopyState::OnStopCopy(nsresult aStatus) {
  if (NS_SUCCEEDED(aStatus)) return AdvanceToNextFolder(aStatus);
  if (m_copySrvcListener) {
    (void)m_copySrvcListener->OnStopCopy(aStatus);
    m_copySrvcListener = nullptr;
  }

  return NS_OK;
}

// "this" is the destination (parent) imap folder that srcFolder is copied to.
// srcFolder may be another imap or a local/pop3 folder.
NS_IMETHODIMP
nsImapMailFolder::CopyFolder(nsIMsgFolder* srcFolder, bool isMoveFolder,
                             nsIMsgWindow* msgWindow,
                             nsIMsgCopyServiceListener* listener) {
  NS_ENSURE_ARG_POINTER(srcFolder);
  nsresult rv;
  bool sameServer;
  rv = IsOnSameServer(this, srcFolder, &sameServer);
  NS_ENSURE_SUCCESS(rv, rv);
  if (sameServer && isMoveFolder) {
    // Do a pure folder move within the same IMAP account/server, where
    // "pure" means the folder AND messages are copied to the destination and
    // then both are removed from source account.
    uint32_t folderFlags = 0;
    if (srcFolder) srcFolder->GetFlags(&folderFlags);

    // if our source folder is a virtual folder
    if (folderFlags & nsMsgFolderFlags::Virtual) {
      nsCOMPtr<nsIMsgFolder> newMsgFolder;
      nsString folderName;
      srcFolder->GetName(folderName);

      nsAutoString safeFolderName(folderName);
      NS_MsgHashIfNecessary(safeFolderName);

      srcFolder->ForceDBClosed();

      nsCOMPtr<nsIFile> oldPathFile;
      rv = srcFolder->GetFilePath(getter_AddRefs(oldPathFile));
      NS_ENSURE_SUCCESS(rv, rv);

      nsCOMPtr<nsIFile> summaryFile;
      GetSummaryFileLocation(oldPathFile, getter_AddRefs(summaryFile));

      nsCOMPtr<nsIFile> newPathFile;
      rv = GetFilePath(getter_AddRefs(newPathFile));
      NS_ENSURE_SUCCESS(rv, rv);

      bool isDirectory = false;
      newPathFile->IsDirectory(&isDirectory);
      if (!isDirectory) {
        AddDirectorySeparator(newPathFile);
        rv = newPathFile->Create(nsIFile::DIRECTORY_TYPE, 0700);
        NS_ENSURE_SUCCESS(rv, rv);
      }

      rv = CheckIfFolderExists(folderName, this, msgWindow);
      if (NS_FAILED(rv)) return rv;

      rv = summaryFile->CopyTo(newPathFile, EmptyString());
      NS_ENSURE_SUCCESS(rv, rv);

      rv = AddSubfolder(safeFolderName, getter_AddRefs(newMsgFolder));
      NS_ENSURE_SUCCESS(rv, rv);

      newMsgFolder->SetPrettyName(folderName);

      uint32_t flags;
      srcFolder->GetFlags(&flags);
      newMsgFolder->SetFlags(flags);

      NotifyFolderAdded(newMsgFolder);

      // now remove the old folder
      nsCOMPtr<nsIMsgFolder> msgParent;
      srcFolder->GetParent(getter_AddRefs(msgParent));
      srcFolder->SetParent(nullptr);
      if (msgParent) {
        // The files have already been moved, so delete storage false.
        msgParent->PropagateDelete(srcFolder, false);
        oldPathFile->Remove(false);  // berkeley mailbox
        srcFolder->DeleteStorage();

        nsCOMPtr<nsIFile> parentPathFile;
        rv = msgParent->GetFilePath(getter_AddRefs(parentPathFile));
        NS_ENSURE_SUCCESS(rv, rv);

        AddDirectorySeparator(parentPathFile);
        nsCOMPtr<nsIDirectoryEnumerator> children;
        parentPathFile->GetDirectoryEntries(getter_AddRefs(children));
        bool more;
        // checks if the directory is empty or not
        if (children && NS_SUCCEEDED(children->HasMoreElements(&more)) && !more)
          parentPathFile->Remove(true);
      }
    } else  // non-virtual folder
    {
      nsCOMPtr<nsIImapService> imapService =
          do_GetService("@mozilla.org/messenger/imapservice;1", &rv);
      NS_ENSURE_SUCCESS(rv, rv);
      nsCOMPtr<nsISupports> srcSupport = do_QueryInterface(srcFolder);
      bool match = false;
      bool confirmed = false;
      if (mFlags & nsMsgFolderFlags::Trash) {
        rv = srcFolder->MatchOrChangeFilterDestination(nullptr, false, &match);
        if (match) {
          srcFolder->ConfirmFolderDeletionForFilter(msgWindow, &confirmed);
          // should we return an error to copy service?
          // or send a notification?
          if (!confirmed) return NS_OK;
        }
      }
      rv = InitCopyState(srcSupport, {}, false, false, false, 0, EmptyCString(),
                         listener, msgWindow, false);
      if (NS_FAILED(rv)) return OnCopyCompleted(srcSupport, rv);

      rv = imapService->MoveFolder(srcFolder, this, this, msgWindow);
    }
  } else {
    // !sameServer OR it's a copy. Unit tests expect a successful folder
    // copy within the same IMAP server even though the UI forbids copy and
    // only allows moves inside the same server. folderCopier, set below,
    // handles the folder copy within an IMAP server (needed by unit tests) and
    // the folder move or copy from another account or server into an IMAP
    // account/server. The folder move from another account is "impure" since
    // just the messages are moved and the source folder remains in place.
    RefPtr<nsImapFolderCopyState> folderCopier = new nsImapFolderCopyState(
        this, srcFolder,
        isMoveFolder,  // Always copy folders; if true only move the messages
        msgWindow, listener);
    // NOTE: the copystate object must hold itself in existence until complete,
    // as we're not keeping hold of it here.
    rv = folderCopier->StartNextCopy();
  }
  return rv;
}

NS_IMETHODIMP
nsImapMailFolder::CopyFileMessage(nsIFile* file, nsIMsgDBHdr* msgToReplace,
                                  bool isDraftOrTemplate, uint32_t aNewMsgFlags,
                                  const nsACString& aNewMsgKeywords,
                                  nsIMsgWindow* msgWindow,
                                  nsIMsgCopyServiceListener* listener) {
  nsresult rv = NS_ERROR_NULL_POINTER;
  nsMsgKey key = nsMsgKey_None;
  nsAutoCString messageId;
  nsTArray<RefPtr<nsIMsgDBHdr>> messages;

  nsCOMPtr<nsIImapService> imapService =
      do_GetService("@mozilla.org/messenger/imapservice;1", &rv);
  if (NS_FAILED(rv)) return OnCopyCompleted(file, rv);

  if (msgToReplace) {
    rv = msgToReplace->GetMessageKey(&key);
    if (NS_SUCCEEDED(rv)) {
      messageId.AppendInt((int32_t)key);
      // We have an existing message to replace because the user has deleted or
      // detached one or more attachments. So tell SetPendingAttributes() to
      // not set several pending offline items (offset, message size, etc.) for
      // the message to be replaced by setting message size temporarily to zero.
      // The original message is not actually "replaced" but is imap deleted
      // and a new message with the same body but with some deleted or detached
      // attachments is imap appended from the file to the folder.
      uint32_t saveMsgSize;
      msgToReplace->GetOfflineMessageSize(&saveMsgSize);
      msgToReplace->SetOfflineMessageSize(0);
      SetPendingAttributes({msgToReplace}, false, false);
      msgToReplace->SetOfflineMessageSize(saveMsgSize);
      messages.AppendElement(msgToReplace);
    }
  }

  bool isMove = (msgToReplace ? true : false);
  rv = InitCopyState(file, messages, isMove, isDraftOrTemplate, false,
                     aNewMsgFlags, aNewMsgKeywords, listener, msgWindow, false);
  if (NS_FAILED(rv)) return OnCopyCompleted(file, rv);

  m_copyState->m_streamCopy = true;
  rv = imapService->AppendMessageFromFile(file, this, messageId, true,
                                          isDraftOrTemplate, this, m_copyState,
                                          msgWindow);
  if (NS_FAILED(rv)) return OnCopyCompleted(file, rv);

  return rv;
}

nsresult nsImapMailFolder::CopyStreamMessage(
    nsIMsgDBHdr* message,
    nsIMsgFolder* dstFolder,  // should be this
    nsIMsgWindow* aMsgWindow, bool isMove) {
  NS_ENSURE_ARG_POINTER(message);

  if (!m_copyState) {
    MOZ_LOG(IMAP, mozilla::LogLevel::Info,
            ("CopyStreamMessage failed with null m_copyState"));
  }
  NS_ENSURE_TRUE(m_copyState, NS_ERROR_NULL_POINTER);

  nsresult rv;
  nsCOMPtr<nsICopyMessageListener> copyListener(
      do_QueryInterface(dstFolder, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgFolder> srcFolder(
      do_QueryInterface(m_copyState->m_srcSupport, &rv));
  if (NS_FAILED(rv)) {
    MOZ_LOG(IMAP, mozilla::LogLevel::Info,
            ("CopyStreaMessage failed with null m_copyState->m_srcSupport"));
  }
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString uri;
  srcFolder->GetUriForMsg(message, uri);

  if (!m_copyState->m_msgService) {
    rv = GetMessageServiceFromURI(uri,
                                  getter_AddRefs(m_copyState->m_msgService));
  }

  if (NS_SUCCEEDED(rv) && m_copyState->m_msgService) {
    // put up status message here, if copying more than one message.
    if (m_copyState->m_messages.Length() > 1) {
      nsString dstFolderName, progressText;
      GetName(dstFolderName);
      nsAutoString curMsgString;
      nsAutoString totalMsgString;
      totalMsgString.AppendInt((int32_t)m_copyState->m_messages.Length());
      curMsgString.AppendInt(m_copyState->m_curIndex + 1);

      AutoTArray<nsString, 3> formatStrings = {curMsgString, totalMsgString,
                                               dstFolderName};

      nsCOMPtr<nsIStringBundle> bundle;
      rv = IMAPGetStringBundle(getter_AddRefs(bundle));
      NS_ENSURE_SUCCESS(rv, rv);
      rv = bundle->FormatStringFromName("imapCopyingMessageOf2", formatStrings,
                                        progressText);
      nsCOMPtr<nsIMsgStatusFeedback> statusFeedback;
      if (m_copyState->m_msgWindow)
        m_copyState->m_msgWindow->GetStatusFeedback(
            getter_AddRefs(statusFeedback));
      if (statusFeedback) {
        statusFeedback->ShowStatusString(progressText);
        int32_t percent;
        percent = (100 * m_copyState->m_curIndex) /
                  (int32_t)m_copyState->m_messages.Length();
        statusFeedback->ShowProgress(percent);
      }
    }

    RefPtr<CopyMessageStreamListener> streamListener =
        new CopyMessageStreamListener(copyListener, isMove);

    rv = m_copyState->m_msgService->CopyMessage(
        uri, streamListener, isMove && !m_copyState->m_isCrossServerOp, nullptr,
        aMsgWindow);
    if (NS_FAILED(rv)) {
      MOZ_LOG(IMAP, mozilla::LogLevel::Info,
              ("CopyMessage failed: uri %s", uri.get()));
    }
  }
  return rv;
}

nsImapMailCopyState::nsImapMailCopyState()
    : m_isMove(false),
      m_selectedState(false),
      m_isCrossServerOp(false),
      m_curIndex(0),
      m_streamCopy(false),
      m_dataBuffer(nullptr),
      m_dataBufferSize(0),
      m_leftOver(0),
      m_allowUndo(false),
      m_eatLF(false),
      m_newMsgFlags(0),
      m_appendUID(nsMsgKey_None) {}

nsImapMailCopyState::~nsImapMailCopyState() {
  PR_Free(m_dataBuffer);
  if (m_tmpFile) m_tmpFile->Remove(false);
}

NS_IMPL_ISUPPORTS(nsImapMailCopyState, nsImapMailCopyState)

nsresult nsImapMailFolder::InitCopyState(
    nsISupports* srcSupport, nsTArray<RefPtr<nsIMsgDBHdr>> const& messages,
    bool isMove, bool selectedState, bool acrossServers, uint32_t newMsgFlags,
    const nsACString& newMsgKeywords, nsIMsgCopyServiceListener* listener,
    nsIMsgWindow* msgWindow, bool allowUndo) {
  NS_ENSURE_ARG_POINTER(srcSupport);

  NS_ENSURE_TRUE(!m_copyState, NS_ERROR_FAILURE);

  m_copyState = new nsImapMailCopyState();

  m_copyState->m_isCrossServerOp = acrossServers;
  m_copyState->m_srcSupport = srcSupport;

  m_copyState->m_messages = messages.Clone();
  if (!m_copyState->m_isCrossServerOp) {
    uint32_t numUnread = 0;
    for (nsIMsgDBHdr* message : m_copyState->m_messages) {
      // if the message is not there, then assume what the caller tells us to.
      bool isRead = false;
      uint32_t flags;
      if (message) {
        message->GetFlags(&flags);
        isRead = flags & nsMsgMessageFlags::Read;
      }
      if (!isRead) numUnread++;
    }
    m_copyState->m_unreadCount = numUnread;
  } else {
    nsIMsgDBHdr* message = m_copyState->m_messages[m_copyState->m_curIndex];
    // if the key is not there, then assume what the caller tells us to.
    bool isRead = false;
    uint32_t flags;
    if (message) {
      message->GetFlags(&flags);
      isRead = flags & nsMsgMessageFlags::Read;
    }
    m_copyState->m_unreadCount = (isRead) ? 0 : 1;
  }

  m_copyState->m_isMove = isMove;
  m_copyState->m_newMsgFlags = newMsgFlags;
  m_copyState->m_newMsgKeywords = newMsgKeywords;
  m_copyState->m_allowUndo = allowUndo;
  m_copyState->m_selectedState = selectedState;
  m_copyState->m_msgWindow = msgWindow;
  if (listener) m_copyState->m_listener = listener;
  return NS_OK;
}

nsresult nsImapMailFolder::CopyFileToOfflineStore(nsIFile* srcFile,
                                                  nsMsgKey msgKey) {
  nsresult rv = GetDatabase();
  NS_ENSURE_SUCCESS(rv, rv);

  bool storeOffline = (mFlags & nsMsgFolderFlags::Offline) && !WeAreOffline();

  if (msgKey == nsMsgKey_None) {
    // To support send filters, we need to store the message in the database
    // when it is copied to the FCC folder. In that case, we know the UID of the
    // message and therefore have the correct msgKey. In other cases, where
    // we don't need the offline message copied, don't add to db.
    if (!storeOffline) return NS_OK;

    mDatabase->GetNextFakeOfflineMsgKey(&msgKey);
  }

  nsCOMPtr<nsIMsgDBHdr> fakeHdr;
  rv = mDatabase->CreateNewHdr(msgKey, getter_AddRefs(fakeHdr));
  NS_ENSURE_SUCCESS(rv, rv);
  fakeHdr->SetUint32Property("pseudoHdr", 1);

  // Should we add this to the offline store?
  nsCOMPtr<nsIOutputStream> offlineStore;
  if (storeOffline) {
    rv = GetOfflineStoreOutputStream(fakeHdr, getter_AddRefs(offlineStore));
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // We set an offline kMoveResult because in any case we want to update this
  // msgHdr with one downloaded from the server, with possible additional
  // headers added.
  nsCOMPtr<nsIMsgOfflineImapOperation> op;
  nsCOMPtr<nsIMsgOfflineOpsDatabase> opsDb = do_QueryInterface(mDatabase, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = opsDb->GetOfflineOpForKey(msgKey, true, getter_AddRefs(op));
  if (NS_SUCCEEDED(rv) && op) {
    nsCString destFolderUri;
    GetURI(destFolderUri);
    op->SetOperation(nsIMsgOfflineImapOperation::kMoveResult);
    op->SetDestinationFolderURI(destFolderUri);
    SetFlag(nsMsgFolderFlags::OfflineEvents);
  }

  nsCOMPtr<nsIInputStream> inputStream;
  nsCOMPtr<nsIMsgParseMailMsgState> msgParser =
      do_CreateInstance("@mozilla.org/messenger/messagestateparser;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  msgParser->SetMailDB(mDatabase);

  rv = NS_NewLocalFileInputStream(getter_AddRefs(inputStream), srcFile);
  if (NS_SUCCEEDED(rv) && inputStream) {
    // Now, parse the temp file to (optionally) copy to
    // the offline store for the cur folder.
    RefPtr<nsMsgLineStreamBuffer> inputStreamBuffer =
        new nsMsgLineStreamBuffer(FILE_IO_BUFFER_SIZE, true, false);
    int64_t fileSize;
    srcFile->GetFileSize(&fileSize);
    uint32_t bytesWritten;
    rv = NS_OK;
    msgParser->SetState(nsIMsgParseMailMsgState::ParseHeadersState);
    msgParser->SetNewMsgHdr(fakeHdr);
    bool needMoreData = false;
    char* newLine = nullptr;
    uint32_t numBytesInLine = 0;
    do {
      newLine = inputStreamBuffer->ReadNextLine(inputStream, numBytesInLine,
                                                needMoreData);
      if (newLine) {
        msgParser->ParseAFolderLine(newLine, numBytesInLine);
        if (offlineStore)
          rv = offlineStore->Write(newLine, numBytesInLine, &bytesWritten);

        free(newLine);
        NS_ENSURE_SUCCESS(rv, rv);
      }
    } while (newLine);

    msgParser->FinishHeader();
    uint32_t resultFlags;
    if (offlineStore)
      fakeHdr->OrFlags(nsMsgMessageFlags::Offline | nsMsgMessageFlags::Read,
                       &resultFlags);
    else
      fakeHdr->OrFlags(nsMsgMessageFlags::Read, &resultFlags);
    if (offlineStore) fakeHdr->SetOfflineMessageSize(fileSize);
    mDatabase->AddNewHdrToDB(fakeHdr, true /* notify */);

    // Call FinishNewMessage before setting pending attributes, as in
    //   maildir it copies from tmp to cur and may change the storeToken
    //   to get a unique filename.
    if (offlineStore) {
      nsCOMPtr<nsIMsgPluggableStore> msgStore;
      GetMsgStore(getter_AddRefs(msgStore));
      if (msgStore) msgStore->FinishNewMessage(offlineStore, fakeHdr);
    }

    // We are copying from a file to offline store so set offline flag.
    SetPendingAttributes({&*fakeHdr}, false, true);

    // Gloda needs this notification to index the fake message.
    nsCOMPtr<nsIMsgFolderNotificationService> notifier(
        do_GetService("@mozilla.org/messenger/msgnotificationservice;1"));
    if (notifier) notifier->NotifyMsgsClassified({&*fakeHdr}, false, false);
    inputStream->Close();
    inputStream = nullptr;
  }
  if (offlineStore) offlineStore->Close();
  return rv;
}

nsresult nsImapMailFolder::OnCopyCompleted(nsISupports* srcSupport,
                                           nsresult rv) {
  // if it's a file, and the copy succeeded, then fcc the offline
  // store, and add a kMoveResult offline op.
  if (NS_SUCCEEDED(rv) && m_copyState) {
    nsCOMPtr<nsIFile> srcFile(do_QueryInterface(srcSupport));
    if (srcFile)
      (void)CopyFileToOfflineStore(srcFile, m_copyState->m_appendUID);
  }
  m_copyState = nullptr;
  nsresult result;
  nsCOMPtr<nsIMsgCopyService> copyService =
      do_GetService("@mozilla.org/messenger/messagecopyservice;1", &result);
  NS_ENSURE_SUCCESS(result, result);
  return copyService->NotifyCompletion(srcSupport, this, rv);
}

nsresult nsImapMailFolder::CreateBaseMessageURI(const nsACString& aURI) {
  return nsCreateImapBaseMessageURI(aURI, mBaseMessageURI);
}

NS_IMETHODIMP nsImapMailFolder::GetFolderURL(nsACString& aFolderURL) {
  nsCOMPtr<nsIMsgFolder> rootFolder;
  nsresult rv = GetRootFolder(getter_AddRefs(rootFolder));
  NS_ENSURE_SUCCESS(rv, rv);
  rootFolder->GetURI(aFolderURL);
  if (rootFolder == this) return NS_OK;

  NS_ASSERTION(mURI.Length() > aFolderURL.Length(),
               "Should match with a folder name!");
  nsCString escapedName;
  MsgEscapeString(Substring(mURI, aFolderURL.Length()),
                  nsINetUtil::ESCAPE_URL_PATH, escapedName);
  if (escapedName.IsEmpty()) return NS_ERROR_OUT_OF_MEMORY;
  aFolderURL.Append(escapedName);
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::GetFolderNeedsSubscribing(bool* bVal) {
  NS_ENSURE_ARG_POINTER(bVal);
  *bVal = m_folderNeedsSubscribing;
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::SetFolderNeedsSubscribing(bool bVal) {
  m_folderNeedsSubscribing = bVal;
  return NS_OK;
}

nsMsgIMAPFolderACL* nsImapMailFolder::GetFolderACL() {
  if (!m_folderACL) m_folderACL = new nsMsgIMAPFolderACL(this);
  return m_folderACL;
}

nsresult nsImapMailFolder::CreateACLRightsStringForFolder(
    nsAString& rightsString) {
  GetFolderACL();  // lazy create
  NS_ENSURE_TRUE(m_folderACL, NS_ERROR_NULL_POINTER);
  return m_folderACL->CreateACLRightsString(rightsString);
}

NS_IMETHODIMP nsImapMailFolder::GetFolderNeedsACLListed(bool* bVal) {
  NS_ENSURE_ARG_POINTER(bVal);
  bool dontNeedACLListed = !m_folderNeedsACLListed;
  // if we haven't acl listed, and it's not a no select folder or the inbox,
  //  then we'll list the acl if it's not a namespace.
  if (m_folderNeedsACLListed &&
      !(mFlags & (nsMsgFolderFlags::ImapNoselect | nsMsgFolderFlags::Inbox)))
    GetIsNamespace(&dontNeedACLListed);
  *bVal = !dontNeedACLListed;
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::SetFolderNeedsACLListed(bool bVal) {
  m_folderNeedsACLListed = bVal;
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::GetIsNamespace(bool* aResult) {
  NS_ENSURE_ARG_POINTER(aResult);
  nsresult rv = NS_OK;
  if (!m_namespace) {
    nsCString onlineName, serverKey;
    GetServerKey(serverKey);
    GetOnlineName(onlineName);
    char hierarchyDelimiter;
    GetHierarchyDelimiter(&hierarchyDelimiter);

    nsCOMPtr<nsIImapHostSessionList> hostSession =
        do_GetService(kCImapHostSessionList, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    m_namespace = nsImapNamespaceList::GetNamespaceForFolder(
        serverKey.get(), onlineName.get(), hierarchyDelimiter);
    if (m_namespace == nullptr) {
      if (mFlags & nsMsgFolderFlags::ImapOtherUser)
        rv = hostSession->GetDefaultNamespaceOfTypeForHost(
            serverKey.get(), kOtherUsersNamespace, m_namespace);
      else if (mFlags & nsMsgFolderFlags::ImapPublic)
        rv = hostSession->GetDefaultNamespaceOfTypeForHost(
            serverKey.get(), kPublicNamespace, m_namespace);
      else
        rv = hostSession->GetDefaultNamespaceOfTypeForHost(
            serverKey.get(), kPersonalNamespace, m_namespace);
    }
    NS_ASSERTION(m_namespace, "failed to get namespace");
    if (m_namespace) {
      nsImapNamespaceList::SuggestHierarchySeparatorForNamespace(
          m_namespace, hierarchyDelimiter);
      m_folderIsNamespace = nsImapNamespaceList::GetFolderIsNamespace(
          serverKey.get(), onlineName.get(), hierarchyDelimiter, m_namespace);
    }
  }
  *aResult = m_folderIsNamespace;
  return rv;
}

NS_IMETHODIMP nsImapMailFolder::SetIsNamespace(bool isNamespace) {
  m_folderIsNamespace = isNamespace;
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::ResetNamespaceReferences() {
  nsCString serverKey;
  nsCString onlineName;
  GetServerKey(serverKey);
  GetOnlineName(onlineName);
  char hierarchyDelimiter;
  GetHierarchyDelimiter(&hierarchyDelimiter);
  m_namespace = nsImapNamespaceList::GetNamespaceForFolder(
      serverKey.get(), onlineName.get(), hierarchyDelimiter);
  m_folderIsNamespace = m_namespace ? nsImapNamespaceList::GetFolderIsNamespace(
                                          serverKey.get(), onlineName.get(),
                                          hierarchyDelimiter, m_namespace)
                                    : false;

  nsTArray<RefPtr<nsIMsgFolder>> subFolders;
  nsresult rv = GetSubFolders(subFolders);
  NS_ENSURE_SUCCESS(rv, rv);

  for (nsIMsgFolder* f : subFolders) {
    nsCOMPtr<nsIMsgImapMailFolder> imapFolder(do_QueryInterface(f, &rv));
    NS_ENSURE_SUCCESS(rv, rv);
    rv = imapFolder->ResetNamespaceReferences();
    NS_ENSURE_SUCCESS(rv, rv);
  }
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::FindOnlineSubFolder(
    const nsACString& targetOnlineName, nsIMsgImapMailFolder** aResultFolder) {
  *aResultFolder = nullptr;
  nsresult rv = NS_OK;

  nsCString onlineName;
  GetOnlineName(onlineName);

  if (onlineName.Equals(targetOnlineName)) {
    return QueryInterface(NS_GET_IID(nsIMsgImapMailFolder),
                          (void**)aResultFolder);
  }

  nsTArray<RefPtr<nsIMsgFolder>> subFolders;
  rv = GetSubFolders(subFolders);
  NS_ENSURE_SUCCESS(rv, rv);
  for (nsIMsgFolder* f : subFolders) {
    nsCOMPtr<nsIMsgImapMailFolder> imapFolder(do_QueryInterface(f, &rv));
    NS_ENSURE_SUCCESS(rv, rv);
    rv = imapFolder->FindOnlineSubFolder(targetOnlineName, aResultFolder);
    NS_ENSURE_SUCCESS(rv, rv);
    if (*aResultFolder) {
      return NS_OK;  // Found it!
    }
  }
  return NS_OK;  // Not found.
}

NS_IMETHODIMP nsImapMailFolder::GetFolderNeedsAdded(bool* bVal) {
  NS_ENSURE_ARG_POINTER(bVal);
  *bVal = m_folderNeedsAdded;
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::SetFolderNeedsAdded(bool bVal) {
  m_folderNeedsAdded = bVal;
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::GetFolderQuotaCommandIssued(bool* aCmdIssued) {
  NS_ENSURE_ARG_POINTER(aCmdIssued);
  *aCmdIssued = m_folderQuotaCommandIssued;
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::SetFolderQuotaCommandIssued(bool aCmdIssued) {
  m_folderQuotaCommandIssued = aCmdIssued;
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::SetFolderQuotaData(
    uint32_t aAction, const nsACString& aFolderQuotaRoot,
    uint64_t aFolderQuotaUsage, uint64_t aFolderQuotaLimit) {
  switch (aAction) {
    case kInvalidateQuota:
      // Reset to initialize evaluation of a new quotaroot imap response. This
      // clears any previous array data and marks the quota data for this folder
      // invalid.
      m_folderQuotaDataIsValid = false;
      m_folderQuota.Clear();
      break;
    case kStoreQuota:
      // Store folder's quota data to an array. This will occur zero or more
      // times for a folder.
      m_folderQuota.AppendElement(new nsMsgQuota(
          aFolderQuotaRoot, aFolderQuotaUsage, aFolderQuotaLimit));
      break;
    case kValidateQuota:
      // GETQUOTAROOT command was successful and OK response has occurred. This
      // indicates that all the untagged QUOTA responses have occurred so mark
      // as valid.
      m_folderQuotaDataIsValid = true;
      break;
    default:
      // Called with undefined aAction parameter.
      NS_ASSERTION(false, "undefined action");
  }
  return NS_OK;
}

// Provide the quota array for status bar notification.
NS_IMETHODIMP nsImapMailFolder::GetQuota(
    nsTArray<RefPtr<nsIMsgQuota>>& aArray) {
  if (m_folderQuotaDataIsValid) {
    aArray = m_folderQuota.Clone();
  }
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::PerformExpand(nsIMsgWindow* aMsgWindow) {
  nsresult rv;
  bool usingSubscription = false;
  nsCOMPtr<nsIImapIncomingServer> imapServer;
  rv = GetImapIncomingServer(getter_AddRefs(imapServer));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = imapServer->GetUsingSubscription(&usingSubscription);
  if (NS_SUCCEEDED(rv) && !usingSubscription) {
    nsCOMPtr<nsIImapService> imapService =
        do_GetService("@mozilla.org/messenger/imapservice;1", &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = imapService->DiscoverChildren(this, this, m_onlineFolderName);
  }
  return rv;
}

NS_IMETHODIMP nsImapMailFolder::RenameClient(nsIMsgWindow* msgWindow,
                                             nsIMsgFolder* msgFolder,
                                             const nsACString& oldName,
                                             const nsACString& newName) {
  nsresult rv;
  nsCOMPtr<nsIFile> pathFile;
  rv = GetFilePath(getter_AddRefs(pathFile));
  if (NS_FAILED(rv)) return rv;

  nsCOMPtr<nsIMsgImapMailFolder> oldImapFolder =
      do_QueryInterface(msgFolder, &rv);
  if (NS_FAILED(rv)) return rv;

  char hierarchyDelimiter = '/';
  oldImapFolder->GetHierarchyDelimiter(&hierarchyDelimiter);
  int32_t boxflags = 0;
  oldImapFolder->GetBoxFlags(&boxflags);

  nsAutoString newLeafName;
  NS_ConvertUTF8toUTF16 newNameString(newName);
  NS_ENSURE_SUCCESS(rv, rv);
  newLeafName = newNameString;
  nsAutoString folderNameStr;
  int32_t folderStart = newLeafName.RFindChar(
      '/');  // internal use of hierarchyDelimiter is always '/'
  if (folderStart > 0) {
    newLeafName = Substring(newNameString, folderStart + 1);
    CreateDirectoryForFolder(
        getter_AddRefs(pathFile));  // needed when we move a folder to a folder
                                    // with no subfolders.
  }

  // if we get here, it's really a leaf, and "this" is the parent.
  folderNameStr = newLeafName;

  // Create an empty database for this mail folder, set its name from the user
  nsCOMPtr<nsIMsgDatabase> mailDBFactory;
  nsCOMPtr<nsIMsgFolder> child;
  nsCOMPtr<nsIMsgImapMailFolder> imapFolder;

  nsCOMPtr<nsIMsgDBService> msgDBService =
      do_GetService("@mozilla.org/msgDatabase/msgDBService;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgDatabase> unusedDB;
  nsCOMPtr<nsIFile> dbFile;

  // warning, path will be changed
  rv = CreateFileForDB(folderNameStr, pathFile, getter_AddRefs(dbFile));
  NS_ENSURE_SUCCESS(rv, rv);

  // Use openMailDBFromFile() and not OpenFolderDB() here, since we don't use
  // the DB.
  rv = msgDBService->OpenMailDBFromFile(dbFile, nullptr, true, true,
                                        getter_AddRefs(unusedDB));
  if (NS_SUCCEEDED(rv) && unusedDB) {
    // need to set the folder name
    nsCOMPtr<nsIDBFolderInfo> folderInfo;
    rv = unusedDB->GetDBFolderInfo(getter_AddRefs(folderInfo));

    // Now let's create the actual new folder
    rv = AddSubfolderWithPath(folderNameStr, dbFile, getter_AddRefs(child));
    if (!child || NS_FAILED(rv)) return rv;
    nsAutoString unicodeName;
    rv = CopyFolderNameToUTF16(NS_ConvertUTF16toUTF8(folderNameStr),
                               unicodeName);
    if (NS_SUCCEEDED(rv)) child->SetPrettyName(unicodeName);
    imapFolder = do_QueryInterface(child);
    if (imapFolder) {
      nsAutoCString onlineName(m_onlineFolderName);

      if (!onlineName.IsEmpty()) onlineName.Append(hierarchyDelimiter);
      onlineName.Append(NS_ConvertUTF16toUTF8(folderNameStr));
      imapFolder->SetVerifiedAsOnlineFolder(true);
      imapFolder->SetOnlineName(onlineName);
      imapFolder->SetHierarchyDelimiter(hierarchyDelimiter);
      imapFolder->SetBoxFlags(boxflags);
      // store the online name as the mailbox name in the db folder info
      // I don't think anyone uses the mailbox name, so we'll use it
      // to restore the online name when blowing away an imap db.
      if (folderInfo) {
        nsAutoString unicodeOnlineName;
        CopyUTF8toUTF16(onlineName, unicodeOnlineName);
        folderInfo->SetMailboxName(unicodeOnlineName);
      }
      bool changed = false;
      msgFolder->MatchOrChangeFilterDestination(
          child, false /*caseInsensitive*/, &changed);
      if (changed) msgFolder->AlertFilterChanged(msgWindow);
    }
    unusedDB->SetSummaryValid(true);
    unusedDB->Commit(nsMsgDBCommitType::kLargeCommit);
    unusedDB->Close(true);
    child->RenameSubFolders(msgWindow, msgFolder);
    nsCOMPtr<nsIMsgFolder> msgParent;
    msgFolder->GetParent(getter_AddRefs(msgParent));
    msgFolder->SetParent(nullptr);
    // Reset online status now that the folder is renamed.
    nsCOMPtr<nsIMsgImapMailFolder> oldImapFolder = do_QueryInterface(msgFolder);
    if (oldImapFolder) oldImapFolder->SetVerifiedAsOnlineFolder(false);
    nsCOMPtr<nsIMsgFolderNotificationService> notifier(
        do_GetService("@mozilla.org/messenger/msgnotificationservice;1"));
    if (notifier) notifier->NotifyFolderRenamed(msgFolder, child);

    // Do not propagate the deletion until after we have (synchronously)
    // notified all listeners about the rename.  This allows them to access
    // properties on the source folder without experiencing failures.
    if (msgParent) msgParent->PropagateDelete(msgFolder, true);
    NotifyFolderAdded(child);
  }
  return rv;
}

NS_IMETHODIMP nsImapMailFolder::RenameSubFolders(nsIMsgWindow* msgWindow,
                                                 nsIMsgFolder* oldFolder) {
  m_initialized = true;
  nsTArray<RefPtr<nsIMsgFolder>> subFolders;
  nsresult rv = oldFolder->GetSubFolders(subFolders);
  NS_ENSURE_SUCCESS(rv, rv);

  for (nsIMsgFolder* msgFolder : subFolders) {
    nsCOMPtr<nsIMsgImapMailFolder> folder(do_QueryInterface(msgFolder, &rv));
    NS_ENSURE_SUCCESS(rv, rv);

    char hierarchyDelimiter = '/';
    folder->GetHierarchyDelimiter(&hierarchyDelimiter);

    int32_t boxflags;
    folder->GetBoxFlags(&boxflags);

    bool verified;
    folder->GetVerifiedAsOnlineFolder(&verified);

    nsCOMPtr<nsIFile> oldPathFile;
    rv = msgFolder->GetFilePath(getter_AddRefs(oldPathFile));
    if (NS_FAILED(rv)) return rv;

    nsCOMPtr<nsIFile> newParentPathFile;
    rv = GetFilePath(getter_AddRefs(newParentPathFile));
    if (NS_FAILED(rv)) return rv;

    rv = AddDirectorySeparator(newParentPathFile);
    nsAutoCString oldLeafName;
    oldPathFile->GetNativeLeafName(oldLeafName);
    newParentPathFile->AppendNative(oldLeafName);

    nsCOMPtr<nsIFile> newPathFile =
        do_CreateInstance(NS_LOCAL_FILE_CONTRACTID, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    newPathFile->InitWithFile(newParentPathFile);

    nsCOMPtr<nsIFile> dbFilePath = newPathFile;

    nsCOMPtr<nsIMsgFolder> child;

    nsString folderName;
    rv = msgFolder->GetName(folderName);
    if (folderName.IsEmpty() || NS_FAILED(rv)) return rv;

    nsCString utfLeafName;
    bool utf8AcceptEnabled;
    nsCOMPtr<nsIMsgImapMailFolder> imapFolder = do_QueryInterface(msgFolder);
    rv = imapFolder->GetShouldUseUtf8FolderName(&utf8AcceptEnabled);
    NS_ENSURE_SUCCESS(rv, rv);
    if (utf8AcceptEnabled) {
      CopyUTF16toUTF8(folderName, utfLeafName);
    } else {
      CopyUTF16toMUTF7(folderName, utfLeafName);
    }

    // XXX : Fix this non-sense by fixing AddSubfolderWithPath
    nsAutoString unicodeLeafName;
    CopyUTF8toUTF16(utfLeafName, unicodeLeafName);

    rv = AddSubfolderWithPath(unicodeLeafName, dbFilePath,
                              getter_AddRefs(child));
    if (!child || NS_FAILED(rv)) return rv;

    child->SetName(folderName);
    imapFolder = do_QueryInterface(child);
    nsCString onlineName;
    GetOnlineName(onlineName);
    nsAutoCString onlineCName(onlineName);
    onlineCName.Append(hierarchyDelimiter);
    onlineCName.Append(utfLeafName);
    if (imapFolder) {
      imapFolder->SetVerifiedAsOnlineFolder(verified);
      imapFolder->SetOnlineName(onlineCName);
      imapFolder->SetHierarchyDelimiter(hierarchyDelimiter);
      imapFolder->SetBoxFlags(boxflags);

      bool changed = false;
      msgFolder->MatchOrChangeFilterDestination(
          child, false /*caseInsensitive*/, &changed);
      if (changed) msgFolder->AlertFilterChanged(msgWindow);
      child->RenameSubFolders(msgWindow, msgFolder);
    }
  }
  return rv;
}

NS_IMETHODIMP nsImapMailFolder::IsCommandEnabled(const nsACString& command,
                                                 bool* result) {
  NS_ENSURE_ARG_POINTER(result);
  *result = !(WeAreOffline() && (command.EqualsLiteral("cmd_renameFolder") ||
                                 command.EqualsLiteral("cmd_compactFolder") ||
                                 command.EqualsLiteral("button_compact") ||
                                 command.EqualsLiteral("cmd_delete") ||
                                 command.EqualsLiteral("button_delete")));
  return NS_OK;
}

NS_IMETHODIMP
nsImapMailFolder::GetCanFileMessages(bool* aCanFileMessages) {
  nsresult rv;
  *aCanFileMessages = true;

  nsCOMPtr<nsIMsgIncomingServer> server;
  rv = GetServer(getter_AddRefs(server));
  if (NS_SUCCEEDED(rv) && server)
    rv = server->GetCanFileMessagesOnServer(aCanFileMessages);

  if (*aCanFileMessages)
    rv = nsMsgDBFolder::GetCanFileMessages(aCanFileMessages);

  if (*aCanFileMessages) {
    bool noSelect;
    GetFlag(nsMsgFolderFlags::ImapNoselect, &noSelect);
    *aCanFileMessages =
        (noSelect) ? false : GetFolderACL()->GetCanIInsertInFolder();
    return NS_OK;
  }
  return rv;
}

NS_IMETHODIMP
nsImapMailFolder::GetCanDeleteMessages(bool* aCanDeleteMessages) {
  NS_ENSURE_ARG_POINTER(aCanDeleteMessages);
  *aCanDeleteMessages = GetFolderACL()->GetCanIDeleteInFolder();
  return NS_OK;
}

NS_IMETHODIMP
nsImapMailFolder::GetPerformingBiff(bool* aPerformingBiff) {
  NS_ENSURE_ARG_POINTER(aPerformingBiff);
  *aPerformingBiff = m_performingBiff;
  return NS_OK;
}

NS_IMETHODIMP
nsImapMailFolder::SetPerformingBiff(bool aPerformingBiff) {
  m_performingBiff = aPerformingBiff;
  return NS_OK;
}

NS_IMETHODIMP
nsImapMailFolder::SetFilterList(nsIMsgFilterList* aMsgFilterList) {
  m_filterList = aMsgFilterList;
  return nsMsgDBFolder::SetFilterList(aMsgFilterList);
}

nsresult nsImapMailFolder::GetMoveCoalescer() {
  if (!m_moveCoalescer)
    m_moveCoalescer = new nsImapMoveCoalescer(this, nullptr /* msgWindow */);
  return NS_OK;
}

NS_IMETHODIMP
nsImapMailFolder::StoreCustomKeywords(nsIMsgWindow* aMsgWindow,
                                      const nsACString& aFlagsToAdd,
                                      const nsACString& aFlagsToSubtract,
                                      const nsTArray<nsMsgKey>& aKeysToStore,
                                      nsIURI** _retval) {
  if (aKeysToStore.IsEmpty()) return NS_OK;
  nsresult rv = NS_OK;
  if (WeAreOffline()) {
    GetDatabase();
    if (!mDatabase) return NS_ERROR_UNEXPECTED;
    nsCOMPtr<nsIMsgOfflineOpsDatabase> opsDb =
        do_QueryInterface(mDatabase, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    for (auto key : aKeysToStore) {
      nsCOMPtr<nsIMsgOfflineImapOperation> op;
      nsresult rv2 = opsDb->GetOfflineOpForKey(key, true, getter_AddRefs(op));
      if (NS_FAILED(rv2)) rv = rv2;
      SetFlag(nsMsgFolderFlags::OfflineEvents);
      if (NS_SUCCEEDED(rv2) && op) {
        if (!aFlagsToAdd.IsEmpty())
          op->AddKeywordToAdd(PromiseFlatCString(aFlagsToAdd).get());
        if (!aFlagsToSubtract.IsEmpty())
          op->AddKeywordToRemove(PromiseFlatCString(aFlagsToSubtract).get());
      }
    }
    mDatabase->Commit(nsMsgDBCommitType::kLargeCommit);  // flush offline ops
    return rv;
  }

  nsCOMPtr<nsIImapService> imapService(
      do_GetService("@mozilla.org/messenger/imapservice;1", &rv));
  NS_ENSURE_SUCCESS(rv, rv);
  nsAutoCString msgIds;
  AllocateUidStringFromKeys(aKeysToStore, msgIds);
  nsCOMPtr<nsIURI> retUri;
  rv = imapService->StoreCustomKeywords(this, aMsgWindow, aFlagsToAdd,
                                        aFlagsToSubtract, msgIds,
                                        getter_AddRefs(retUri));
  if (_retval) {
    retUri.forget(_retval);
  }
  return rv;
}

NS_IMETHODIMP nsImapMailFolder::NotifyIfNewMail() {
  return PerformBiffNotifications();
}

bool nsImapMailFolder::ShowPreviewText() {
  bool showPreviewText = false;
  nsCOMPtr<nsIPrefBranch> prefBranch(do_GetService(NS_PREFSERVICE_CONTRACTID));
  if (prefBranch)
    prefBranch->GetBoolPref("mail.biff.alert.show_preview", &showPreviewText);
  return showPreviewText;
}

nsresult nsImapMailFolder::PlaybackCoalescedOperations() {
  if (m_moveCoalescer) {
    nsTArray<nsMsgKey>* junkKeysToClassify = m_moveCoalescer->GetKeyBucket(0);
    if (junkKeysToClassify && !junkKeysToClassify->IsEmpty())
      StoreCustomKeywords(m_moveCoalescer->GetMsgWindow(), "Junk"_ns,
                          EmptyCString(), *junkKeysToClassify, nullptr);
    junkKeysToClassify->Clear();
    nsTArray<nsMsgKey>* nonJunkKeysToClassify =
        m_moveCoalescer->GetKeyBucket(1);
    if (nonJunkKeysToClassify && !nonJunkKeysToClassify->IsEmpty())
      StoreCustomKeywords(m_moveCoalescer->GetMsgWindow(), "NonJunk"_ns,
                          EmptyCString(), *nonJunkKeysToClassify, nullptr);
    nonJunkKeysToClassify->Clear();
    return m_moveCoalescer->PlaybackMoves(ShowPreviewText());
  }
  return NS_OK;  // must not be any coalesced operations
}

NS_IMETHODIMP
nsImapMailFolder::SetJunkScoreForMessages(
    const nsTArray<RefPtr<nsIMsgDBHdr>>& aMessages,
    const nsACString& aJunkScore) {
  nsresult rv = nsMsgDBFolder::SetJunkScoreForMessages(aMessages, aJunkScore);
  if (NS_SUCCEEDED(rv)) {
    nsAutoCString messageIds;
    nsTArray<nsMsgKey> keys;
    nsresult rv = BuildIdsAndKeyArray(aMessages, messageIds, keys);
    NS_ENSURE_SUCCESS(rv, rv);
    StoreCustomKeywords(
        nullptr, aJunkScore.EqualsLiteral("0") ? "NonJunk"_ns : "Junk"_ns,
        aJunkScore.EqualsLiteral("0") ? "Junk"_ns : "NonJunk"_ns, keys,
        nullptr);
    if (mDatabase) mDatabase->Commit(nsMsgDBCommitType::kLargeCommit);
  }
  return rv;
}

NS_IMETHODIMP
nsImapMailFolder::OnMessageClassified(const nsACString& aMsgURI,
                                      nsMsgJunkStatus aClassification,
                                      uint32_t aJunkPercent) {
  nsCOMPtr<nsIMsgIncomingServer> server;
  nsresult rv = GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);

  if (!aMsgURI.IsEmpty())  // not end of batch
  {
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
      nsMsgDBFolder::OnMessageClassified(aMsgURI, aClassification,
                                         aJunkPercent);

      GetMoveCoalescer();
      if (m_moveCoalescer) {
        nsTArray<nsMsgKey>* keysToClassify = m_moveCoalescer->GetKeyBucket(
            (aClassification == nsIJunkMailPlugin::JUNK) ? 0 : 1);
        NS_ASSERTION(keysToClassify, "error getting key bucket");
        if (keysToClassify) keysToClassify->AppendElement(msgKey);
      }
      if (aClassification == nsIJunkMailPlugin::JUNK) {
        nsCOMPtr<nsISpamSettings> spamSettings;
        rv = server->GetSpamSettings(getter_AddRefs(spamSettings));
        NS_ENSURE_SUCCESS(rv, rv);

        bool markAsReadOnSpam;
        (void)spamSettings->GetMarkAsReadOnSpam(&markAsReadOnSpam);
        if (markAsReadOnSpam) {
          m_junkMessagesToMarkAsRead.AppendElement(msgHdr);
        }

        bool willMoveMessage = false;

        // don't do the move when we are opening up
        // the junk mail folder or the trash folder
        // or when manually classifying messages in those folders
        if (!(mFlags & nsMsgFolderFlags::Junk ||
              mFlags & nsMsgFolderFlags::Trash)) {
          bool moveOnSpam;
          (void)spamSettings->GetMoveOnSpam(&moveOnSpam);
          if (moveOnSpam) {
            nsCString spamFolderURI;
            rv = spamSettings->GetSpamFolderURI(spamFolderURI);
            NS_ENSURE_SUCCESS(rv, rv);

            if (!spamFolderURI.IsEmpty()) {
              rv = FindFolder(spamFolderURI, getter_AddRefs(mSpamFolder));
              NS_ENSURE_SUCCESS(rv, rv);
              if (mSpamFolder) {
                rv = mSpamFolder->SetFlag(nsMsgFolderFlags::Junk);
                NS_ENSURE_SUCCESS(rv, rv);
                mSpamKeysToMove.AppendElement(msgKey);
                willMoveMessage = true;
              } else {
                // XXX TODO
                // JUNK MAIL RELATED
                // the listener should do
                // rv = folder->SetFlag(nsMsgFolderFlags::Junk);
                // NS_ENSURE_SUCCESS(rv,rv);
                // if (NS_SUCCEEDED(GetMoveCoalescer())) {
                //   m_moveCoalescer->AddMove(folder, msgKey);
                //   willMoveMessage = true;
                // }
                rv = GetOrCreateJunkFolder(spamFolderURI,
                                           nullptr /* aListener */);
                NS_ASSERTION(NS_SUCCEEDED(rv), "GetOrCreateJunkFolder failed");
              }
            }
          }
        }
        rv = spamSettings->LogJunkHit(msgHdr, willMoveMessage);
        NS_ENSURE_SUCCESS(rv, rv);
      }
    }
  }

  else  // end of batch
  {
    // Parent will apply post bayes filters.
    nsMsgDBFolder::OnMessageClassified(EmptyCString(),
                                       nsIJunkMailPlugin::UNCLASSIFIED, 0);

    if (!m_junkMessagesToMarkAsRead.IsEmpty()) {
      rv = MarkMessagesRead(m_junkMessagesToMarkAsRead, true);
      NS_ENSURE_SUCCESS(rv, rv);
      m_junkMessagesToMarkAsRead.Clear();
    }
    if (!mSpamKeysToMove.IsEmpty()) {
      GetMoveCoalescer();
      for (uint32_t keyIndex = 0; keyIndex < mSpamKeysToMove.Length();
           keyIndex++) {
        // If an upstream filter moved this message, don't move it here.
        nsMsgKey msgKey = mSpamKeysToMove.ElementAt(keyIndex);
        nsMsgProcessingFlagType processingFlags;
        GetProcessingFlags(msgKey, &processingFlags);
        if (!(processingFlags & nsMsgProcessingFlags::FilterToMove)) {
          if (m_moveCoalescer && mSpamFolder)
            m_moveCoalescer->AddMove(mSpamFolder, msgKey);
        } else {
          // We don't need the FilterToMove flag anymore.
          AndProcessingFlags(msgKey, ~nsMsgProcessingFlags::FilterToMove);
        }
      }
      mSpamKeysToMove.Clear();
    }

    // Let's not hold onto the spam folder reference longer than necessary.
    mSpamFolder = nullptr;

    bool pendingMoves = m_moveCoalescer && m_moveCoalescer->HasPendingMoves();
    PlaybackCoalescedOperations();
    // If we are performing biff for this folder, tell the server object
    if ((!pendingMoves || !ShowPreviewText()) && m_performingBiff) {
      // we don't need to adjust the num new messages in this folder because
      // the playback moves code already did that.
      (void)PerformBiffNotifications();
      server->SetPerformingBiff(false);
      m_performingBiff = false;
    }
  }
  return NS_OK;
}

NS_IMETHODIMP
nsImapMailFolder::GetShouldDownloadAllHeaders(bool* aResult) {
  NS_ENSURE_ARG_POINTER(aResult);
  *aResult = false;
  // for just the inbox, we check if the filter list has arbitrary headers.
  // for all folders, check if we have a spam plugin that requires all headers
  if (mFlags & nsMsgFolderFlags::Inbox) {
    nsCOMPtr<nsIMsgFilterList> filterList;
    nsresult rv = GetFilterList(nullptr, getter_AddRefs(filterList));
    NS_ENSURE_SUCCESS(rv, rv);

    rv = filterList->GetShouldDownloadAllHeaders(aResult);
    if (*aResult) return rv;
  }
  nsCOMPtr<nsIMsgFilterPlugin> filterPlugin;
  nsCOMPtr<nsIMsgIncomingServer> server;

  if (NS_SUCCEEDED(GetServer(getter_AddRefs(server))))
    server->GetSpamFilterPlugin(getter_AddRefs(filterPlugin));

  return (filterPlugin) ? filterPlugin->GetShouldDownloadAllHeaders(aResult)
                        : NS_OK;
}

void nsImapMailFolder::GetTrashFolderName(nsAString& aFolderName) {
  nsCOMPtr<nsIMsgIncomingServer> server;
  nsCOMPtr<nsIImapIncomingServer> imapServer;
  nsresult rv;
  rv = GetServer(getter_AddRefs(server));
  if (NS_FAILED(rv)) return;
  imapServer = do_QueryInterface(server, &rv);
  if (NS_FAILED(rv)) return;
  imapServer->GetTrashFolderName(aFolderName);
  return;
}
NS_IMETHODIMP nsImapMailFolder::FetchMsgPreviewText(
    nsTArray<nsMsgKey> const& aKeysToFetch, nsIUrlListener* aUrlListener,
    bool* aAsyncResults) {
  NS_ENSURE_ARG_POINTER(aAsyncResults);

  nsTArray<nsMsgKey> keysToFetchFromServer;

  *aAsyncResults = false;
  nsresult rv = NS_OK;

  nsCOMPtr<nsIMsgMessageService> msgService =
      do_GetService("@mozilla.org/messenger/messageservice;1?type=imap", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  for (uint32_t i = 0; i < aKeysToFetch.Length(); i++) {
    nsCOMPtr<nsIMsgDBHdr> msgHdr;
    nsCString prevBody;
    rv = GetMessageHeader(aKeysToFetch[i], getter_AddRefs(msgHdr));
    NS_ENSURE_SUCCESS(rv, rv);
    // ignore messages that already have a preview body.
    msgHdr->GetStringProperty("preview", prevBody);
    if (!prevBody.IsEmpty()) continue;

    /* check if message is in memory cache or offline store. */
    nsCOMPtr<nsIURI> url;
    nsCOMPtr<nsIInputStream> inputStream;
    nsCString messageUri;
    rv = GetUriForMsg(msgHdr, messageUri);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = msgService->GetUrlForUri(messageUri, nullptr, getter_AddRefs(url));
    NS_ENSURE_SUCCESS(rv, rv);

    // Lets look in the offline store.
    uint32_t msgFlags;
    msgHdr->GetFlags(&msgFlags);
    if (msgFlags & nsMsgMessageFlags::Offline) {
      rv = GetLocalMsgStream(msgHdr, getter_AddRefs(inputStream));
      NS_ENSURE_SUCCESS(rv, rv);
      rv = GetMsgPreviewTextFromStream(msgHdr, inputStream);
      NS_ENSURE_SUCCESS(rv, rv);
    } else {
      nsMsgKey msgKey;
      msgHdr->GetMessageKey(&msgKey);
      keysToFetchFromServer.AppendElement(msgKey);
    }
  }
  if (!keysToFetchFromServer.IsEmpty()) {
    uint32_t msgCount = keysToFetchFromServer.Length();
    nsAutoCString messageIds;
    AllocateImapUidString(keysToFetchFromServer.Elements(), msgCount, nullptr,
                          messageIds);
    nsCOMPtr<nsIImapService> imapService =
        do_GetService("@mozilla.org/messenger/imapservice;1", &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    nsCOMPtr<nsIURI> outUri;
    rv = imapService->GetBodyStart(this, aUrlListener, messageIds, 2048,
                                   getter_AddRefs(outUri));
    *aAsyncResults = true;  // the preview text will be available async...
  }
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::AddKeywordsToMessages(
    const nsTArray<RefPtr<nsIMsgDBHdr>>& aMessages,
    const nsACString& aKeywords) {
  nsresult rv = nsMsgDBFolder::AddKeywordsToMessages(aMessages, aKeywords);
  if (NS_SUCCEEDED(rv)) {
    nsAutoCString messageIds;
    nsTArray<nsMsgKey> keys;
    rv = BuildIdsAndKeyArray(aMessages, messageIds, keys);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = StoreCustomKeywords(nullptr, aKeywords, EmptyCString(), keys, nullptr);
    if (mDatabase) mDatabase->Commit(nsMsgDBCommitType::kLargeCommit);
  }
  return rv;
}

NS_IMETHODIMP nsImapMailFolder::RemoveKeywordsFromMessages(
    const nsTArray<RefPtr<nsIMsgDBHdr>>& aMessages,
    const nsACString& aKeywords) {
  nsresult rv = nsMsgDBFolder::RemoveKeywordsFromMessages(aMessages, aKeywords);
  if (NS_SUCCEEDED(rv)) {
    nsAutoCString messageIds;
    nsTArray<nsMsgKey> keys;
    nsresult rv = BuildIdsAndKeyArray(aMessages, messageIds, keys);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = StoreCustomKeywords(nullptr, EmptyCString(), aKeywords, keys, nullptr);
    if (mDatabase) mDatabase->Commit(nsMsgDBCommitType::kLargeCommit);
  }
  return rv;
}

NS_IMETHODIMP nsImapMailFolder::GetCustomIdentity(nsIMsgIdentity** aIdentity) {
  NS_ENSURE_ARG_POINTER(aIdentity);
  if (mFlags & nsMsgFolderFlags::ImapOtherUser) {
    nsresult rv;
    bool delegateOtherUsersFolders = false;
    nsCOMPtr<nsIPrefBranch> prefBranch(
        do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
    NS_ENSURE_SUCCESS(rv, rv);
    prefBranch->GetBoolPref("mail.imap.delegateOtherUsersFolders",
                            &delegateOtherUsersFolders);
    // if we're automatically delegating other user's folders, we need to
    // cons up an e-mail address for the other user. We do that by
    // taking the other user's name and the current user's domain name,
    // assuming they'll be the same. So, <otherUsersName>@<ourDomain>
    if (delegateOtherUsersFolders) {
      nsCOMPtr<nsIMsgIncomingServer> server = do_QueryReferent(mServer, &rv);
      NS_ENSURE_SUCCESS(rv, rv);
      nsCOMPtr<nsIMsgAccountManager> accountManager =
          do_GetService("@mozilla.org/messenger/account-manager;1", &rv);
      NS_ENSURE_SUCCESS(rv, rv);
      nsCOMPtr<nsIMsgIdentity> ourIdentity;
      nsCOMPtr<nsIMsgIdentity> retIdentity;
      nsCOMPtr<nsIMsgAccount> account;
      nsCString foldersUserName;
      nsCString ourEmailAddress;

      accountManager->FindAccountForServer(server, getter_AddRefs(account));
      NS_ENSURE_SUCCESS(rv, rv);
      account->GetDefaultIdentity(getter_AddRefs(ourIdentity));
      NS_ENSURE_SUCCESS(rv, rv);
      ourIdentity->GetEmail(ourEmailAddress);
      int32_t atPos = ourEmailAddress.FindChar('@');
      if (atPos != kNotFound) {
        nsCString otherUsersEmailAddress;
        GetFolderOwnerUserName(otherUsersEmailAddress);
        otherUsersEmailAddress.Append(
            Substring(ourEmailAddress, atPos, ourEmailAddress.Length()));
        nsTArray<RefPtr<nsIMsgIdentity>> identities;
        rv = accountManager->GetIdentitiesForServer(server, identities);
        NS_ENSURE_SUCCESS(rv, rv);

        for (auto identity : identities) {
          if (!identity) continue;
          nsCString identityEmail;
          identity->GetEmail(identityEmail);
          if (identityEmail.Equals(otherUsersEmailAddress)) {
            retIdentity = identity;
            break;
          }
        }
        if (!retIdentity) {
          // create the identity
          rv = accountManager->CreateIdentity(getter_AddRefs(retIdentity));
          NS_ENSURE_SUCCESS(rv, rv);
          retIdentity->SetEmail(otherUsersEmailAddress);
          nsCOMPtr<nsIMsgAccount> account;
          accountManager->FindAccountForServer(server, getter_AddRefs(account));
          NS_ENSURE_SUCCESS(rv, rv);
          account->AddIdentity(retIdentity);
        }
      }
      if (retIdentity) {
        retIdentity.forget(aIdentity);
        return NS_OK;
      }
    }
  }
  return nsMsgDBFolder::GetCustomIdentity(aIdentity);
}

NS_IMETHODIMP nsImapMailFolder::ChangePendingTotal(int32_t aDelta) {
  ChangeNumPendingTotalMessages(aDelta);
  if (aDelta > 0) NotifyHasPendingMsgs();
  return NS_OK;
}

void nsImapMailFolder::NotifyHasPendingMsgs() {
  InitAutoSyncState();
  nsresult rv;
  nsCOMPtr<nsIAutoSyncManager> autoSyncMgr =
      do_GetService(NS_AUTOSYNCMANAGER_CONTRACTID, &rv);
  if (NS_SUCCEEDED(rv)) autoSyncMgr->OnFolderHasPendingMsgs(m_autoSyncStateObj);
}

/* void changePendingUnread (in long aDelta); */
NS_IMETHODIMP nsImapMailFolder::ChangePendingUnread(int32_t aDelta) {
  ChangeNumPendingUnread(aDelta);
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::GetServerRecent(int32_t* aServerRecent) {
  NS_ENSURE_ARG_POINTER(aServerRecent);
  *aServerRecent = m_numServerRecentMessages;
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::GetServerTotal(int32_t* aServerTotal) {
  NS_ENSURE_ARG_POINTER(aServerTotal);
  *aServerTotal = m_numServerTotalMessages;
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::GetServerUnseen(int32_t* aServerUnseen) {
  NS_ENSURE_ARG_POINTER(aServerUnseen);
  *aServerUnseen = m_numServerUnseenMessages;
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::GetServerNextUID(int32_t* aNextUID) {
  NS_ENSURE_ARG_POINTER(aNextUID);
  *aNextUID = m_nextUID;
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::GetAutoSyncStateObj(
    nsIAutoSyncState** autoSyncStateObj) {
  NS_ENSURE_ARG_POINTER(autoSyncStateObj);

  // create auto-sync state object lazily
  InitAutoSyncState();

  NS_IF_ADDREF(*autoSyncStateObj = m_autoSyncStateObj);
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::InitiateAutoSync(nsIUrlListener* aUrlListener) {
  nsCString folderName;
  GetURI(folderName);
  MOZ_LOG(gAutoSyncLog, mozilla::LogLevel::Debug,
          ("%s: Updating folder: %s", __func__, folderName.get()));

  // HACK: if UpdateFolder finds out that it can't open
  // the folder, it doesn't set the url listener and returns
  // no error. In this case, we return success from this call
  // but the caller never gets a notification on its url listener.
  bool canOpenThisFolder = true;
  GetCanOpenFolder(&canOpenThisFolder);

  if (!canOpenThisFolder) {
    MOZ_LOG(gAutoSyncLog, mozilla::LogLevel::Debug,
            ("%s: Cannot update folder: %s", __func__, folderName.get()));
    return NS_ERROR_FAILURE;
  }

  // create auto-sync state object lazily
  InitAutoSyncState();

  // make sure we get the counts from the folder cache.
  ReadDBFolderInfo(false);

  nsresult rv = m_autoSyncStateObj->ManageStorageSpace();
  NS_ENSURE_SUCCESS(rv, rv);

  int32_t syncState;
  m_autoSyncStateObj->GetState(&syncState);
  if (syncState == nsAutoSyncState::stUpdateNeeded)
    return m_autoSyncStateObj->UpdateFolder();

  // We only want to init the autosyncStateObj server counts the first time
  // we update, and update it when the STATUS call finishes. This deals with
  // the case where biff is doing a STATUS on a non-inbox folder, which
  // can make autosync think the counts aren't changing.
  PRTime lastUpdateTime;
  m_autoSyncStateObj->GetLastUpdateTime(&lastUpdateTime);
  if (!lastUpdateTime)
    m_autoSyncStateObj->SetServerCounts(m_numServerTotalMessages,
                                        m_numServerRecentMessages,
                                        m_numServerUnseenMessages, m_nextUID);
  // Issue a STATUS command and see if any counts changed.
  m_autoSyncStateObj->SetState(nsAutoSyncState::stStatusIssued);
  // The OnStopRunningUrl method of the autosync state obj
  // will check if the counts or next uid have changed,
  // and if so, will issue an UpdateFolder().
  rv = UpdateStatus(m_autoSyncStateObj, nullptr);
  NS_ENSURE_SUCCESS(rv, rv);

  // record the last update time
  m_autoSyncStateObj->SetLastUpdateTime(PR_Now());

  return NS_OK;
}

/* static */
void nsImapMailFolder::PlaybackTimerCallback(nsITimer* aTimer, void* aClosure) {
  nsPlaybackRequest* request = static_cast<nsPlaybackRequest*>(aClosure);

  NS_ASSERTION(request->SrcFolder->m_pendingPlaybackReq == request,
               "wrong playback request pointer");

  RefPtr<nsImapOfflineSync> offlineSync = new nsImapOfflineSync();
  // Execute the offline operations, in pseudoOffline mode.
  offlineSync->Init(request->MsgWindow, nullptr, request->SrcFolder, true);
  if (offlineSync) {
    mozilla::DebugOnly<nsresult> rv = offlineSync->ProcessNextOperation();
    NS_ASSERTION(NS_SUCCEEDED(rv), "pseudo-offline playback is not successful");
  }

  // release request struct and timer
  request->SrcFolder->m_pendingPlaybackReq = nullptr;
  request->SrcFolder->m_playbackTimer = nullptr;  // Just to flag timed out
  delete request;
}

void nsImapMailFolder::InitAutoSyncState() {
  if (!m_autoSyncStateObj) m_autoSyncStateObj = new nsAutoSyncState(this);
}

NS_IMETHODIMP nsImapMailFolder::HasMsgOffline(nsMsgKey msgKey, bool* _retval) {
  NS_ENSURE_ARG_POINTER(_retval);
  *_retval = false;
  nsCOMPtr<nsIMsgFolder> msgFolder;
  nsresult rv = GetOfflineMsgFolder(msgKey, getter_AddRefs(msgFolder));
  if (NS_SUCCEEDED(rv) && msgFolder) *_retval = true;
  return NS_OK;
}

nsresult nsImapMailFolder::GetOfflineMsgFolder(nsMsgKey msgKey,
                                               nsIMsgFolder** aMsgFolder) {
  // Check if we have the message in the current folder.
  NS_ENSURE_ARG_POINTER(aMsgFolder);
  nsCOMPtr<nsIMsgFolder> subMsgFolder;
  nsresult rv = GetDatabase();
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgDBHdr> hdr;
  rv = mDatabase->GetMsgHdrForKey(msgKey, getter_AddRefs(hdr));
  if (NS_FAILED(rv)) return rv;

  if (hdr) {
    uint32_t msgFlags = 0;
    hdr->GetFlags(&msgFlags);
    // Check if we already have this message body offline
    if ((msgFlags & nsMsgMessageFlags::Offline)) {
      NS_IF_ADDREF(*aMsgFolder = this);
      return NS_OK;
    }
  }

  if (!*aMsgFolder) {
    // Checking the existence of message in other folders in case of GMail
    // Server
    bool isGMail;
    nsCOMPtr<nsIImapIncomingServer> imapServer;
    rv = GetImapIncomingServer(getter_AddRefs(imapServer));
    NS_ENSURE_SUCCESS(rv, rv);
    rv = imapServer->GetIsGMailServer(&isGMail);
    NS_ENSURE_SUCCESS(rv, rv);

    if (isGMail) {
      nsCString labels;
      nsTArray<nsCString> labelNames;
      hdr->GetStringProperty("X-GM-LABELS", labels);
      ParseString(labels, ' ', labelNames);
      nsCOMPtr<nsIMsgFolder> rootFolder;
      nsCOMPtr<nsIMsgImapMailFolder> subFolder;
      for (uint32_t i = 0; i < labelNames.Length(); i++) {
        rv = GetRootFolder(getter_AddRefs(rootFolder));
        if (NS_SUCCEEDED(rv) && (rootFolder)) {
          nsCOMPtr<nsIMsgImapMailFolder> imapRootFolder =
              do_QueryInterface(rootFolder);
          if (labelNames[i].EqualsLiteral("\"\\\\Draft\""))
            rv = rootFolder->GetFolderWithFlags(nsMsgFolderFlags::Drafts,
                                                getter_AddRefs(subMsgFolder));
          if (labelNames[i].EqualsLiteral("\"\\\\Inbox\""))
            rv = rootFolder->GetFolderWithFlags(nsMsgFolderFlags::Inbox,
                                                getter_AddRefs(subMsgFolder));
          if (labelNames[i].EqualsLiteral("\"\\\\All Mail\""))
            rv = rootFolder->GetFolderWithFlags(nsMsgFolderFlags::Archive,
                                                getter_AddRefs(subMsgFolder));
          if (labelNames[i].EqualsLiteral("\"\\\\Trash\""))
            rv = rootFolder->GetFolderWithFlags(nsMsgFolderFlags::Trash,
                                                getter_AddRefs(subMsgFolder));
          if (labelNames[i].EqualsLiteral("\"\\\\Spam\""))
            rv = rootFolder->GetFolderWithFlags(nsMsgFolderFlags::Junk,
                                                getter_AddRefs(subMsgFolder));
          if (labelNames[i].EqualsLiteral("\"\\\\Sent\""))
            rv = rootFolder->GetFolderWithFlags(nsMsgFolderFlags::SentMail,
                                                getter_AddRefs(subMsgFolder));
          if (FindInReadable("[Imap]/"_ns, labelNames[i],
                             nsCaseInsensitiveCStringComparator)) {
            labelNames[i].ReplaceSubstring("[Imap]/", "");
            imapRootFolder->FindOnlineSubFolder(labelNames[i],
                                                getter_AddRefs(subFolder));
            subMsgFolder = do_QueryInterface(subFolder);
          }
          if (!subMsgFolder) {
            imapRootFolder->FindOnlineSubFolder(labelNames[i],
                                                getter_AddRefs(subFolder));
            subMsgFolder = do_QueryInterface(subFolder);
          }
          if (subMsgFolder) {
            nsCOMPtr<nsIMsgDatabase> db;
            subMsgFolder->GetMsgDatabase(getter_AddRefs(db));
            if (db) {
              nsCOMPtr<nsIMsgDBHdr> retHdr;
              nsCString gmMsgID;
              hdr->GetStringProperty("X-GM-MSGID", gmMsgID);
              rv = db->GetMsgHdrForGMMsgID(gmMsgID.get(),
                                           getter_AddRefs(retHdr));
              if (NS_FAILED(rv)) return rv;
              if (retHdr) {
                uint32_t gmFlags = 0;
                retHdr->GetFlags(&gmFlags);
                if ((gmFlags & nsMsgMessageFlags::Offline)) {
                  subMsgFolder.forget(aMsgFolder);
                  // Focus on first positive result.
                  return NS_OK;
                }
              }
            }
          }
        }
      }
    }
  }
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::GetLocalMsgStream(nsIMsgDBHdr* hdr,
                                                  nsIInputStream** stream) {
  // Gmail hack. Check if message is actually stored in another folder.
  nsMsgKey msgKey;
  hdr->GetMessageKey(&msgKey);
  nsCOMPtr<nsIMsgFolder> otherFolder;
  nsresult rv = GetOfflineMsgFolder(msgKey, getter_AddRefs(otherFolder));
  NS_ENSURE_SUCCESS(rv, rv);
  if (!otherFolder) {
    return NS_ERROR_FAILURE;
  }

  if (otherFolder != this) {
    // It's in another folder. Find it.
    nsAutoCString gmMsgID;
    hdr->GetStringProperty("X-GM-MSGID", gmMsgID);
    nsCOMPtr<nsIMsgDatabase> otherDB;
    otherFolder->GetMsgDatabase(getter_AddRefs(otherDB));
    nsCOMPtr<nsIMsgDBHdr> otherHdr;
    rv = otherDB->GetMsgHdrForGMMsgID(gmMsgID.get(), getter_AddRefs(otherHdr));
    NS_ENSURE_SUCCESS(rv, rv);
    if (!otherHdr) {
      return NS_ERROR_FAILURE;  // Couldn't find the message.
    }
    return otherFolder->GetLocalMsgStream(otherHdr, stream);
  }

  rv = GetMsgInputStream(hdr, stream);
  NS_ENSURE_SUCCESS(rv, rv);
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::GetIncomingServerType(nsACString& serverType) {
  serverType.AssignLiteral("imap");
  return NS_OK;
}

NS_IMETHODIMP nsImapMailFolder::GetShouldUseUtf8FolderName(bool* aUseUTF8) {
  *aUseUTF8 = false;
  nsCOMPtr<nsIMsgIncomingServer> server;
  nsresult rv = GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIImapIncomingServer> imapServer = do_QueryInterface(server, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  imapServer->GetUtf8AcceptEnabled(aUseUTF8);
  return NS_OK;
}

void nsImapMailFolder::DeleteStoreMessages(
    const nsTArray<RefPtr<nsIMsgDBHdr>>& aMessages) {
  // Delete messages for pluggable stores that do not support compaction.
  nsCOMPtr<nsIMsgPluggableStore> offlineStore;
  (void)GetMsgStore(getter_AddRefs(offlineStore));

  if (offlineStore) {
    bool supportsCompaction;
    offlineStore->GetSupportsCompaction(&supportsCompaction);
    if (!supportsCompaction) offlineStore->DeleteMessages(aMessages);
  }
}

void nsImapMailFolder::DeleteStoreMessages(
    const nsTArray<nsMsgKey>& aMessages) {
  DeleteStoreMessages(aMessages, this);
}

void nsImapMailFolder::DeleteStoreMessages(const nsTArray<nsMsgKey>& aMessages,
                                           nsIMsgFolder* aFolder) {
  // Delete messages for pluggable stores that do not support compaction.
  NS_ASSERTION(aFolder, "Missing Source Folder");
  nsCOMPtr<nsIMsgPluggableStore> offlineStore;
  (void)aFolder->GetMsgStore(getter_AddRefs(offlineStore));
  if (offlineStore) {
    bool supportsCompaction;
    offlineStore->GetSupportsCompaction(&supportsCompaction);
    if (!supportsCompaction) {
      nsCOMPtr<nsIMsgDatabase> db;
      aFolder->GetMsgDatabase(getter_AddRefs(db));
      nsresult rv = NS_ERROR_FAILURE;
      nsTArray<RefPtr<nsIMsgDBHdr>> messages;
      if (db) rv = MsgGetHeadersFromKeys(db, aMessages, messages);
      if (NS_SUCCEEDED(rv))
        offlineStore->DeleteMessages(messages);
      else
        NS_WARNING("Failed to get database");
    }
  }
}
