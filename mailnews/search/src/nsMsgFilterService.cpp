/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// this file implements the nsMsgFilterService interface

#include "msgCore.h"
#include "nsMsgFilterService.h"
#include "nsMsgFilterList.h"
#include "nsMsgSearchScopeTerm.h"
#include "nsDirectoryServiceDefs.h"
#include "nsIPrompt.h"
#include "nsIDocShell.h"
#include "nsIStringBundle.h"
#include "nsIMsgSearchNotify.h"
#include "nsIUrlListener.h"
#include "nsIMsgCopyServiceListener.h"
#include "nsIMsgLocalMailFolder.h"
#include "nsIMsgDatabase.h"
#include "nsIMsgHdr.h"
#include "nsIMsgCopyService.h"
#include "nsIInputStream.h"
#include "nsIOutputStream.h"
#include "nsISafeOutputStream.h"
#include "nsIMsgComposeService.h"
#include "nsNetUtil.h"
#include "nsMsgUtils.h"
#include "nsIMsgMailSession.h"
#include "nsIFile.h"
#include "nsIMsgFilterCustomAction.h"
#include "nsMsgMessageFlags.h"
#include "nsIMsgWindow.h"
#include "nsIMsgSearchCustomTerm.h"
#include "nsIMsgSearchTerm.h"
#include "nsIMsgThread.h"
#include "nsIMsgFilter.h"
#include "nsIMsgOperationListener.h"
#include "mozilla/Components.h"
#include "mozilla/Logging.h"

using namespace mozilla;

LazyLogModule FILTERLOGMODULE("Filters");

#define BREAK_IF_FAILURE(_rv, _text)                                   \
  if (NS_FAILED(_rv)) {                                                \
    MOZ_LOG(FILTERLOGMODULE, LogLevel::Error,                          \
            ("(Post) Filter error: %s", _text));                       \
    m_filters->LogFilterMessage(NS_LITERAL_STRING_FROM_CSTRING(_text), \
                                m_curFilter);                          \
    NS_WARNING(_text);                                                 \
    mFinalResult = _rv;                                                \
    break;                                                             \
  }

#define CONTINUE_IF_FAILURE(_rv, _text)                                     \
  if (NS_FAILED(_rv)) {                                                     \
    MOZ_LOG(FILTERLOGMODULE, LogLevel::Warning,                             \
            ("(Post) Filter problem: %s", _text));                          \
    m_filters->LogFilterMessage(NS_LITERAL_STRING_FROM_CSTRING(_text),      \
                                m_curFilter);                               \
    NS_WARNING(_text);                                                      \
    mFinalResult = _rv;                                                     \
    if (m_msgWindow && !ContinueExecutionPrompt()) return OnEndExecution(); \
    continue;                                                               \
  }

#define BREAK_IF_FALSE(_assertTrue, _text)                             \
  if (MOZ_UNLIKELY(!(_assertTrue))) {                                  \
    MOZ_LOG(FILTERLOGMODULE, LogLevel::Error,                          \
            ("(Post) Filter error: %s", _text));                       \
    m_filters->LogFilterMessage(NS_LITERAL_STRING_FROM_CSTRING(_text), \
                                m_curFilter);                          \
    NS_WARNING(_text);                                                 \
    mFinalResult = NS_ERROR_FAILURE;                                   \
    break;                                                             \
  }

#define CONTINUE_IF_FALSE(_assertTrue, _text)                               \
  if (MOZ_UNLIKELY(!(_assertTrue))) {                                       \
    MOZ_LOG(FILTERLOGMODULE, LogLevel::Warning,                             \
            ("(Post) Filter problem: %s", _text));                          \
    m_filters->LogFilterMessage(NS_LITERAL_STRING_FROM_CSTRING(_text),      \
                                m_curFilter);                               \
    NS_WARNING(_text);                                                      \
    mFinalResult = NS_ERROR_FAILURE;                                        \
    if (m_msgWindow && !ContinueExecutionPrompt()) return OnEndExecution(); \
    continue;                                                               \
  }

#define BREAK_ACTION(_text)                                               \
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Error,                               \
          ("(Post) Filter Error: %s", _text));                            \
  if (loggingEnabled)                                                     \
    m_filters->LogFilterMessage(NS_LITERAL_STRING_FROM_CSTRING(_text),    \
                                m_curFilter);                             \
  NS_WARNING(_text);                                                      \
  if (m_msgWindow && !ContinueExecutionPrompt()) return OnEndExecution(); \
  break;

#define BREAK_ACTION_IF_FALSE(_assertTrue, _text) \
  if (MOZ_UNLIKELY(!(_assertTrue))) {             \
    finalResult = NS_ERROR_FAILURE;               \
    BREAK_ACTION(_text);                          \
  }

#define BREAK_ACTION_IF_FAILURE(_rv, _text) \
  if (NS_FAILED(_rv)) {                     \
    finalResult = _rv;                      \
    BREAK_ACTION(_text);                    \
  }

NS_IMPL_ISUPPORTS(nsMsgFilterService, nsIMsgFilterService)

nsMsgFilterService::nsMsgFilterService() {
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Debug, ("nsMsgFilterService"));
}

nsMsgFilterService::~nsMsgFilterService() {
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Debug, ("~nsMsgFilterService"));
}

NS_IMETHODIMP nsMsgFilterService::OpenFilterList(
    nsIFile* aFilterFile, nsIMsgFolder* rootFolder, nsIMsgWindow* aMsgWindow,
    nsIMsgFilterList** resultFilterList) {
  NS_ENSURE_ARG_POINTER(aFilterFile);
  NS_ENSURE_ARG_POINTER(resultFilterList);

  nsresult rv;
  if (rootFolder) {
    nsCOMPtr<nsIMsgIncomingServer> server;
    rv = rootFolder->GetServer(getter_AddRefs(server));
    NS_ENSURE_SUCCESS(rv, rv);
    nsString serverName;
    server->GetPrettyName(serverName);
    MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
            ("Reading filter list for account '%s'",
             NS_ConvertUTF16toUTF8(serverName).get()));
  }

  nsString fileName;
  (void)aFilterFile->GetPath(fileName);
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Debug,
          ("Reading filter list from file '%s'",
           NS_ConvertUTF16toUTF8(fileName).get()));

  bool exists = false;
  rv = aFilterFile->Exists(&exists);
  if (NS_FAILED(rv) || !exists) {
    rv = aFilterFile->Create(nsIFile::NORMAL_FILE_TYPE, 0644);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  nsCOMPtr<nsIInputStream> fileStream;
  rv = NS_NewLocalFileInputStream(getter_AddRefs(fileStream), aFilterFile);
  NS_ENSURE_SUCCESS(rv, rv);
  NS_ENSURE_TRUE(fileStream, NS_ERROR_OUT_OF_MEMORY);

  RefPtr<nsMsgFilterList> filterList = new nsMsgFilterList();
  filterList->SetFolder(rootFolder);

  // temporarily tell the filter where its file path is
  filterList->SetDefaultFile(aFilterFile);

  int64_t size = 0;
  rv = aFilterFile->GetFileSize(&size);
  if (NS_SUCCEEDED(rv) && size > 0)
    rv = filterList->LoadTextFilters(fileStream.forget());
  if (NS_SUCCEEDED(rv)) {
    int16_t version;
    filterList->GetVersion(&version);
    if (version != kFileVersion) SaveFilterList(filterList, aFilterFile);
  } else {
    if (rv == NS_MSG_FILTER_PARSE_ERROR && aMsgWindow) {
      rv = BackUpFilterFile(aFilterFile, aMsgWindow);
      NS_ENSURE_SUCCESS(rv, rv);
      rv = aFilterFile->SetFileSize(0);
      NS_ENSURE_SUCCESS(rv, rv);
      return OpenFilterList(aFilterFile, rootFolder, aMsgWindow,
                            resultFilterList);
    } else if (rv == NS_MSG_CUSTOM_HEADERS_OVERFLOW && aMsgWindow)
      ThrowAlertMsg("filterCustomHeaderOverflow", aMsgWindow);
    else if (rv == NS_MSG_INVALID_CUSTOM_HEADER && aMsgWindow)
      ThrowAlertMsg("invalidCustomHeader", aMsgWindow);
  }

  nsCString listId;
  filterList->GetListId(listId);
  uint32_t filterCount = 0;
  (void)filterList->GetFilterCount(&filterCount);
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
          ("Read %" PRIu32 " filters", filterCount));
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
          ("Filter list stored as %s", listId.get()));

  filterList.forget(resultFilterList);
  return rv;
}

NS_IMETHODIMP nsMsgFilterService::CloseFilterList(
    nsIMsgFilterList* filterList) {
  // NS_ASSERTION(false,"CloseFilterList doesn't do anything yet");
  return NS_OK;
}

/* save without deleting */
NS_IMETHODIMP nsMsgFilterService::SaveFilterList(nsIMsgFilterList* filterList,
                                                 nsIFile* filterFile) {
  NS_ENSURE_ARG_POINTER(filterFile);
  NS_ENSURE_ARG_POINTER(filterList);

  nsCString listId;
  filterList->GetListId(listId);
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
          ("Saving filter list %s", listId.get()));

  nsCOMPtr<nsIOutputStream> strm;
  nsresult rv = MsgNewSafeBufferedFileOutputStream(getter_AddRefs(strm),
                                                   filterFile, -1, 0600);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = filterList->SaveToFile(strm);

  nsCOMPtr<nsISafeOutputStream> safeStream = do_QueryInterface(strm);
  NS_ASSERTION(safeStream, "expected a safe output stream!");
  if (safeStream) {
    rv = safeStream->Finish();
    if (NS_FAILED(rv)) {
      NS_WARNING("failed to save filter file! possible data loss");
      MOZ_LOG(FILTERLOGMODULE, LogLevel::Error, ("Save of list failed"));
    }
  }
  return rv;
}

NS_IMETHODIMP nsMsgFilterService::CancelFilterList(
    nsIMsgFilterList* filterList) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

nsresult nsMsgFilterService::BackUpFilterFile(nsIFile* aFilterFile,
                                              nsIMsgWindow* aMsgWindow) {
  AlertBackingUpFilterFile(aMsgWindow);

  nsCOMPtr<nsIFile> localParentDir;
  nsresult rv = aFilterFile->GetParent(getter_AddRefs(localParentDir));
  NS_ENSURE_SUCCESS(rv, rv);

  // if back-up file exists delete the back up file otherwise copy fails.
  nsCOMPtr<nsIFile> backupFile;
  rv = localParentDir->Clone(getter_AddRefs(backupFile));
  NS_ENSURE_SUCCESS(rv, rv);
  backupFile->AppendNative("rulesbackup.dat"_ns);
  bool exists;
  backupFile->Exists(&exists);
  if (exists) backupFile->Remove(false);

  return aFilterFile->CopyToNative(localParentDir, "rulesbackup.dat"_ns);
}

nsresult nsMsgFilterService::AlertBackingUpFilterFile(
    nsIMsgWindow* aMsgWindow) {
  return ThrowAlertMsg("filterListBackUpMsg", aMsgWindow);
}

// Do not use this routine if you have to call it very often because it creates
// a new bundle each time.
nsresult nsMsgFilterService::GetStringFromBundle(const char* aMsgName,
                                                 nsAString& aResult) {
  nsCOMPtr<nsIStringBundle> bundle;
  nsresult rv = GetFilterStringBundle(getter_AddRefs(bundle));
  if (NS_SUCCEEDED(rv) && bundle)
    rv = bundle->GetStringFromName(aMsgName, aResult);
  return rv;
}

nsresult nsMsgFilterService::GetFilterStringBundle(nsIStringBundle** aBundle) {
  NS_ENSURE_ARG_POINTER(aBundle);

  nsCOMPtr<nsIStringBundleService> bundleService =
      mozilla::components::StringBundle::Service();
  NS_ENSURE_TRUE(bundleService, NS_ERROR_UNEXPECTED);
  nsCOMPtr<nsIStringBundle> bundle;
  if (bundleService)
    bundleService->CreateBundle("chrome://messenger/locale/filter.properties",
                                getter_AddRefs(bundle));
  bundle.forget(aBundle);
  return NS_OK;
}

nsresult nsMsgFilterService::ThrowAlertMsg(const char* aMsgName,
                                           nsIMsgWindow* aMsgWindow) {
  nsString alertString;
  nsresult rv = GetStringFromBundle(aMsgName, alertString);
  nsCOMPtr<nsIMsgWindow> msgWindow = aMsgWindow;
  if (!msgWindow) {
    nsCOMPtr<nsIMsgMailSession> mailSession(
        do_GetService("@mozilla.org/messenger/services/session;1", &rv));
    if (NS_SUCCEEDED(rv))
      rv = mailSession->GetTopmostMsgWindow(getter_AddRefs(msgWindow));
  }

  if (NS_SUCCEEDED(rv) && !alertString.IsEmpty() && msgWindow) {
    nsCOMPtr<nsIDocShell> docShell;
    msgWindow->GetRootDocShell(getter_AddRefs(docShell));
    if (docShell) {
      nsCOMPtr<nsIPrompt> dialog(do_GetInterface(docShell));
      if (dialog && !alertString.IsEmpty())
        dialog->Alert(nullptr, alertString.get());
    }
  }
  return rv;
}

// this class is used to run filters after the fact, i.e., after new mail has
// been downloaded from the server. It can do the following:
// 1. Apply a single imap or pop3 filter on a single folder.
// 2. Apply multiple filters on a single imap or pop3 folder.
// 3. Apply a single filter on multiple imap or pop3 folders in the same
//    account.
// 4. Apply multiple filters on multiple imap or pop3 folders in the same
//    account.
// This will be called from the front end js code in the case of the
// apply filters to folder menu code, and from the filter dialog js code with
// the run filter now command.

// this class holds the list of filters and folders, and applies them in turn,
// first iterating over all the filters on one folder, and then advancing to the
// next folder and repeating. For each filter,we take the filter criteria and
// create a search term list. Then, we execute the search. We are a search
// listener so that we can build up the list of search hits. Then, when the
// search is done, we will apply the filter action(s) en-masse, so, for example,
// if the action is a move, we calls one method to move all the messages to the
// destination folder. Or, mark all the messages read. In the case of imap
// operations, or imap/local  moves, the action will be asynchronous, so we'll
// need to be a url listener as well, and kick off the next filter when the
// action completes.
class nsMsgFilterAfterTheFact : public nsIUrlListener,
                                public nsIMsgSearchNotify,
                                public nsIMsgCopyServiceListener {
 public:
  nsMsgFilterAfterTheFact(nsIMsgWindow* aMsgWindow,
                          nsIMsgFilterList* aFilterList,
                          const nsTArray<RefPtr<nsIMsgFolder>>& aFolderList,
                          nsIMsgOperationListener* aCallback);
  NS_DECL_ISUPPORTS
  NS_DECL_NSIURLLISTENER
  NS_DECL_NSIMSGSEARCHNOTIFY
  NS_DECL_NSIMSGCOPYSERVICELISTENER

  nsresult AdvanceToNextFolder();  // kicks off the process
 protected:
  virtual ~nsMsgFilterAfterTheFact();
  virtual nsresult RunNextFilter();
  /**
   * apply filter actions to current search hits
   */
  nsresult ApplyFilter();
  nsresult OnEndExecution();  // do what we have to do to cleanup.
  bool ContinueExecutionPrompt();
  nsresult DisplayConfirmationPrompt(nsIMsgWindow* msgWindow,
                                     const char16_t* confirmString,
                                     bool* confirmed);
  nsCOMPtr<nsIMsgWindow> m_msgWindow;
  nsCOMPtr<nsIMsgFilterList> m_filters;
  nsTArray<RefPtr<nsIMsgFolder>> m_folders;
  nsCOMPtr<nsIMsgFolder> m_curFolder;
  nsCOMPtr<nsIMsgDatabase> m_curFolderDB;
  nsCOMPtr<nsIMsgFilter> m_curFilter;
  uint32_t m_curFilterIndex;
  uint32_t m_curFolderIndex;
  uint32_t m_numFilters;
  nsTArray<nsMsgKey> m_searchHits;
  nsTArray<RefPtr<nsIMsgDBHdr>> m_searchHitHdrs;
  nsTArray<nsMsgKey> m_stopFiltering;
  nsCOMPtr<nsIMsgSearchSession> m_searchSession;
  nsCOMPtr<nsIMsgOperationListener> m_callback;
  uint32_t m_nextAction;  // next filter action to perform
  nsresult mFinalResult;  // report of overall success or failure
  bool mNeedsRelease;     // Did we need to release ourself?
};

NS_IMPL_ISUPPORTS(nsMsgFilterAfterTheFact, nsIUrlListener, nsIMsgSearchNotify,
                  nsIMsgCopyServiceListener)

nsMsgFilterAfterTheFact::nsMsgFilterAfterTheFact(
    nsIMsgWindow* aMsgWindow, nsIMsgFilterList* aFilterList,
    const nsTArray<RefPtr<nsIMsgFolder>>& aFolderList,
    nsIMsgOperationListener* aCallback) {
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Debug, ("(Post) nsMsgFilterAfterTheFact"));
  m_curFilterIndex = m_curFolderIndex = m_nextAction = 0;
  m_msgWindow = aMsgWindow;
  m_filters = aFilterList;
  m_folders = aFolderList.Clone();
  m_filters->GetFilterCount(&m_numFilters);

  NS_ADDREF_THIS();  // we own ourselves, and will release ourselves when
                     // execution is done.
  mNeedsRelease = true;

  m_callback = aCallback;
  mFinalResult = NS_OK;
}

nsMsgFilterAfterTheFact::~nsMsgFilterAfterTheFact() {
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Debug,
          ("(Post) ~nsMsgFilterAfterTheFact"));
}

// do what we have to do to cleanup.
nsresult nsMsgFilterAfterTheFact::OnEndExecution() {
  if (m_searchSession) m_searchSession->UnregisterListener(this);

  if (m_filters) (void)m_filters->FlushLogIfNecessary();

  if (m_callback) (void)m_callback->OnStopOperation(mFinalResult);

  nsresult rv = mFinalResult;
  // OnEndExecution() can be called a second time when a rule execution fails
  // and the user is prompted whether he wants to continue.
  if (mNeedsRelease) {
    NS_RELEASE_THIS();  // release ourselves.
    mNeedsRelease = false;
  }
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Info, ("(Post) End executing filters"));
  return rv;
}

nsresult nsMsgFilterAfterTheFact::RunNextFilter() {
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Debug,
          ("(Post) nsMsgFilterAfterTheFact::RunNextFilter"));
  nsresult rv = NS_OK;
  while (true) {
    m_curFilter = nullptr;
    if (m_curFilterIndex >= m_numFilters) break;

    BREAK_IF_FALSE(m_filters, "Missing filters");

    MOZ_LOG(FILTERLOGMODULE, LogLevel::Debug,
            ("(Post) Running filter %" PRIu32, m_curFilterIndex));

    rv =
        m_filters->GetFilterAt(m_curFilterIndex++, getter_AddRefs(m_curFilter));
    CONTINUE_IF_FAILURE(rv, "Could not get filter at index");

    nsString filterName;
    m_curFilter->GetFilterName(filterName);
    // clang-format off
    MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
            ("(Post) Filter name: %s", NS_ConvertUTF16toUTF8(filterName).get()));
    // clang-format on

    nsTArray<RefPtr<nsIMsgSearchTerm>> searchTerms;
    rv = m_curFilter->GetSearchTerms(searchTerms);
    CONTINUE_IF_FAILURE(rv, "Could not get searchTerms");

    if (m_searchSession) m_searchSession->UnregisterListener(this);
    m_searchSession =
        do_CreateInstance("@mozilla.org/messenger/searchSession;1", &rv);
    BREAK_IF_FAILURE(rv, "Failed to get search session");

    nsMsgSearchScopeValue searchScope = nsMsgSearchScope::offlineMail;
    for (nsIMsgSearchTerm* term : searchTerms) {
      rv = m_searchSession->AppendTerm(term);
      BREAK_IF_FAILURE(rv, "Could not append search term");
    }
    CONTINUE_IF_FAILURE(rv, "Failed to setup search terms");
    m_searchSession->RegisterListener(this,
                                      nsIMsgSearchSession::allNotifications);

    rv = m_searchSession->AddScopeTerm(searchScope, m_curFolder);
    CONTINUE_IF_FAILURE(rv, "Failed to add scope term");
    m_nextAction = 0;
    rv = m_searchSession->Search(m_msgWindow);
    CONTINUE_IF_FAILURE(rv, "Search failed");
    return NS_OK;  // OnSearchDone will continue
  }

  if (NS_FAILED(rv)) {
    MOZ_LOG(FILTERLOGMODULE, LogLevel::Error,
            ("(Post) Filter evaluation failed"));
    m_filters->LogFilterMessage(u"Filter evaluation failed"_ns, m_curFilter);
  }

  m_curFilter = nullptr;
  NS_WARNING_ASSERTION(NS_SUCCEEDED(rv), "Search failed");
  return AdvanceToNextFolder();
}

nsresult nsMsgFilterAfterTheFact::AdvanceToNextFolder() {
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Debug,
          ("(Post) nsMsgFilterAfterTheFact::AdvanceToNextFolder"));
  nsresult rv = NS_OK;
  // Advance through folders, making sure m_curFolder is null on errors
  while (true) {
    m_stopFiltering.Clear();
    m_curFolder = nullptr;
    if (m_curFolderIndex >= m_folders.Length()) {
      // final end of nsMsgFilterAfterTheFact object
      return OnEndExecution();
    }

    MOZ_LOG(FILTERLOGMODULE, LogLevel::Debug,
            ("(Post) Entering folder %" PRIu32, m_curFolderIndex));

    // reset the filter index to apply all filters to this new folder
    m_curFilterIndex = 0;
    m_nextAction = 0;
    m_curFolder = m_folders[m_curFolderIndex++];

    // Note: I got rv = NS_OK but null m_curFolder after deleting a folder
    // outside of TB, when I select a single message and "run filter on message"
    // and the filter is to move the message to the deleted folder.

    // m_curFolder may be null when the folder is deleted externally.
    CONTINUE_IF_FALSE(m_curFolder, "Next folder returned null");

    nsString folderName;
    (void)m_curFolder->GetName(folderName);
    MOZ_LOG(
        FILTERLOGMODULE, LogLevel::Info,
        ("(Post) Folder name: %s", NS_ConvertUTF16toUTF8(folderName).get()));

    nsCOMPtr<nsIFile> folderPath;
    (void)m_curFolder->GetFilePath(getter_AddRefs(folderPath));
    (void)folderPath->GetPath(folderName);
    MOZ_LOG(
        FILTERLOGMODULE, LogLevel::Debug,
        ("(Post) Folder path: %s", NS_ConvertUTF16toUTF8(folderName).get()));

    rv = m_curFolder->GetMsgDatabase(getter_AddRefs(m_curFolderDB));
    if (rv == NS_MSG_ERROR_FOLDER_SUMMARY_OUT_OF_DATE) {
      nsCOMPtr<nsIMsgLocalMailFolder> localFolder =
          do_QueryInterface(m_curFolder, &rv);
      if (NS_SUCCEEDED(rv) && localFolder)
        // will continue with OnStopRunningUrl
        return localFolder->ParseFolder(m_msgWindow, this);
    }
    CONTINUE_IF_FAILURE(rv, "Could not get folder db");

    rv = RunNextFilter();
    // RunNextFilter returns success when either filters are done, or an async
    // process has started. It will call AdvanceToNextFolder itself if possible,
    // so no need to call here.
    BREAK_IF_FAILURE(rv, "Failed to run next filter");
    break;
  }
  return rv;
}

NS_IMETHODIMP nsMsgFilterAfterTheFact::OnStartRunningUrl(nsIURI* aUrl) {
  return NS_OK;
}

// This is the return from a folder parse
NS_IMETHODIMP nsMsgFilterAfterTheFact::OnStopRunningUrl(nsIURI* aUrl,
                                                        nsresult aExitCode) {
  if (NS_SUCCEEDED(aExitCode)) return RunNextFilter();

  mFinalResult = aExitCode;
  // If m_msgWindow then we are in a context where the user can deal with
  //  errors. Put up a prompt, and exit if user wants.
  if (m_msgWindow && !ContinueExecutionPrompt()) return OnEndExecution();

  // folder parse failed, so stop processing this folder.
  return AdvanceToNextFolder();
}

NS_IMETHODIMP nsMsgFilterAfterTheFact::OnSearchHit(nsIMsgDBHdr* header,
                                                   nsIMsgFolder* folder) {
  NS_ENSURE_ARG_POINTER(header);

  nsMsgKey msgKey;
  header->GetMessageKey(&msgKey);

  nsCString msgId;
  header->GetMessageId(msgId);
  // clang-format off
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
          ("(Post) Filter matched message with key %" PRIu32,
           msgKeyToInt(msgKey)));
  // clang-format on
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Debug,
          ("(Post) Matched message ID: %s", msgId.get()));

  // Under various previous actions (a move, delete, or stopExecution)
  //  we do not want to process filters on a per-message basis.
  if (m_stopFiltering.Contains(msgKey)) {
    MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
            ("(Post) Stopping further filter execution on this message"));
    return NS_OK;
  }

  m_searchHits.AppendElement(msgKey);
  m_searchHitHdrs.AppendElement(header);
  return NS_OK;
}

// Continue after an async operation.
NS_IMETHODIMP nsMsgFilterAfterTheFact::OnSearchDone(nsresult status) {
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
          ("(Post) Done matching current filter"));
  if (NS_SUCCEEDED(status))
    return m_searchHits.IsEmpty() ? RunNextFilter() : ApplyFilter();

  mFinalResult = status;
  if (m_msgWindow && !ContinueExecutionPrompt()) return OnEndExecution();

  // The search failed, so move on to the next filter.
  return RunNextFilter();
}

NS_IMETHODIMP nsMsgFilterAfterTheFact::OnNewSearch() {
  m_searchHits.Clear();
  m_searchHitHdrs.Clear();
  return NS_OK;
}

// This method will apply filters. It will continue to advance though headers,
//   filters, and folders until done, unless it starts an async operation with
//   a callback. The callback should call ApplyFilter again. It only returns
//   an error if it is impossible to continue after attempting to continue the
//   next filter action, filter, or folder.
nsresult nsMsgFilterAfterTheFact::ApplyFilter() {
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Debug,
          ("(Post) nsMsgFilterAfterTheFact::ApplyFilter"));
  nsresult rv;
  do {
    // Error management block, break if unable to continue with filter.

    if (!m_curFilter)
      break;  // Maybe not an error, we just need to call RunNextFilter();
    if (!m_curFolder)
      break;  // Maybe not an error, we just need to call AdvanceToNextFolder();

    // 'm_curFolder' can be reset asynchronously by the copy service
    // calling OnStopCopy(). So take a local copy here and use it throughout the
    // function.
    nsCOMPtr<nsIMsgFolder> curFolder = m_curFolder;
    nsCOMPtr<nsIMsgFilter> curFilter = m_curFilter;

    // We're going to log the filter actions before firing them because some
    // actions are async.
    bool loggingEnabled = false;
    if (m_filters) (void)m_filters->GetLoggingEnabled(&loggingEnabled);

    nsTArray<RefPtr<nsIMsgRuleAction>> actionList;
    rv = curFilter->GetSortedActionList(actionList);
    BREAK_IF_FAILURE(rv, "Could not get action list for filter");

    uint32_t numActions = actionList.Length();

    if (m_nextAction == 0) {
      MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
              ("(Post) Applying %" PRIu32 " filter actions to %" PRIu32
               " matched messages",
               numActions, static_cast<uint32_t>(m_searchHits.Length())));
    } else if (m_nextAction < numActions) {
      MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
              ("(Post) Applying remaining %" PRIu32
               " filter actions to %" PRIu32 " matched messages",
               numActions - m_nextAction,
               static_cast<uint32_t>(m_searchHits.Length())));
    }

    // We start from m_nextAction to allow us to continue applying actions
    // after the return from an async copy.
    while (m_nextAction < numActions) {
      nsresult finalResult = NS_OK;
      nsCOMPtr<nsIMsgRuleAction> filterAction(actionList[m_nextAction]);
      ++m_nextAction;

      nsMsgRuleActionType actionType;
      rv = filterAction->GetType(&actionType);
      CONTINUE_IF_FAILURE(rv, "Could not get type for filter action");
      MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
              ("(Post) Running filter action at index %" PRIu32
               ", action type = %i",
               m_nextAction - 1, actionType));

      nsCString actionTargetFolderUri;
      if (actionType == nsMsgFilterAction::MoveToFolder ||
          actionType == nsMsgFilterAction::CopyToFolder) {
        rv = filterAction->GetTargetFolderUri(actionTargetFolderUri);
        CONTINUE_IF_FAILURE(rv, "GetTargetFolderUri failed");
        CONTINUE_IF_FALSE(!actionTargetFolderUri.IsEmpty(),
                          "actionTargetFolderUri is empty");
      }

      if (loggingEnabled) {
        for (auto msgHdr : m_searchHitHdrs) {
          (void)curFilter->LogRuleHit(filterAction, msgHdr);
        }
      }

      // all actions that pass "this" as a listener in order to chain filter
      // execution when the action is finished need to return before reaching
      // the bottom of this routine, because we run the next filter at the end
      // of this routine.
      switch (actionType) {
        case nsMsgFilterAction::Delete:
          // we can't pass ourselves in as a copy service listener because the
          // copy service listener won't get called in several situations (e.g.,
          // the delete model is imap delete) and we rely on the listener
          // getting called to continue the filter application. This means we're
          // going to end up firing off the delete, and then subsequently
          // issuing a search for the next filter, which will block until the
          // delete finishes.
          rv = curFolder->DeleteMessages(m_searchHitHdrs, m_msgWindow, false,
                                         false, nullptr, false /*allow Undo*/);
          BREAK_ACTION_IF_FAILURE(rv, "Deleting messages failed");

          // don't allow any more filters on this message
          m_stopFiltering.AppendElements(m_searchHits);
          for (uint32_t i = 0; i < m_searchHits.Length(); i++)
            curFolder->OrProcessingFlags(m_searchHits[i],
                                         nsMsgProcessingFlags::FilterToMove);
          // if we are deleting then we couldn't care less about applying
          // remaining filter actions
          m_nextAction = numActions;
          break;

        case nsMsgFilterAction::MoveToFolder:
          // Even if move fails we will not run additional actions, as they
          // would not have run if move succeeded.
          m_nextAction = numActions;
          // Fall through to the copy case.
          [[fallthrough]];
        case nsMsgFilterAction::CopyToFolder: {
          nsCString uri;
          curFolder->GetURI(uri);

          if (uri.Equals(actionTargetFolderUri)) {
            MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
                    ("(Post) Target folder is the same as source folder, "
                     "skipping"));
            break;
          }

          nsCOMPtr<nsIMsgFolder> destIFolder;
          rv = GetOrCreateFolder(actionTargetFolderUri,
                                 getter_AddRefs(destIFolder));
          BREAK_ACTION_IF_FAILURE(rv, "Could not get action folder");

          bool canFileMessages = true;
          nsCOMPtr<nsIMsgFolder> parentFolder;
          destIFolder->GetParent(getter_AddRefs(parentFolder));
          if (parentFolder) destIFolder->GetCanFileMessages(&canFileMessages);
          if (!parentFolder || !canFileMessages) {
            curFilter->SetEnabled(false);
            destIFolder->ThrowAlertMsg("filterDisabled", m_msgWindow);
            // we need to explicitly save the filter file.
            m_filters->SaveToDefaultFile();
            // In the case of applying multiple filters
            // we might want to remove the filter from the list, but
            // that's a bit evil since we really don't know that we own
            // the list. Disabling it doesn't do a lot of good since
            // we still apply disabled filters. Currently, we don't
            // have any clients that apply filters to multiple folders,
            // so this might be the edge case of an edge case.
            m_nextAction = numActions;
            BREAK_ACTION_IF_FALSE(false,
                                  "No parent folder or folder can't file "
                                  "messages, disabling the filter");
          }
          nsCOMPtr<nsIMsgCopyService> copyService =
              do_GetService("@mozilla.org/messenger/messagecopyservice;1", &rv);
          BREAK_ACTION_IF_FAILURE(rv, "Could not get copy service");

          if (actionType == nsMsgFilterAction::MoveToFolder) {
            m_stopFiltering.AppendElements(m_searchHits);
            for (uint32_t i = 0; i < m_searchHits.Length(); i++)
              curFolder->OrProcessingFlags(m_searchHits[i],
                                           nsMsgProcessingFlags::FilterToMove);
          }

          rv = copyService->CopyMessages(
              curFolder, m_searchHitHdrs, destIFolder,
              actionType == nsMsgFilterAction::MoveToFolder, this, m_msgWindow,
              false);
          BREAK_ACTION_IF_FAILURE(rv, "CopyMessages failed");
          MOZ_LOG(FILTERLOGMODULE, LogLevel::Debug,
                  ("(Post) Action execution continues async"));
          return NS_OK;  // OnStopCopy callback to continue;
        } break;
        case nsMsgFilterAction::MarkRead:
          // crud, no listener support here - we'll probably just need to go on
          // and apply the next filter, and, in the imap case, rely on multiple
          // connection and url queueing to stay out of trouble
          rv = curFolder->MarkMessagesRead(m_searchHitHdrs, true);
          BREAK_ACTION_IF_FAILURE(rv, "Setting message flags failed");
          break;
        case nsMsgFilterAction::MarkUnread:
          rv = curFolder->MarkMessagesRead(m_searchHitHdrs, false);
          BREAK_ACTION_IF_FAILURE(rv, "Setting message flags failed");
          break;
        case nsMsgFilterAction::MarkFlagged:
          rv = curFolder->MarkMessagesFlagged(m_searchHitHdrs, true);
          BREAK_ACTION_IF_FAILURE(rv, "Setting message flags failed");
          break;
        case nsMsgFilterAction::KillThread:
        case nsMsgFilterAction::WatchThread: {
          for (auto msgHdr : m_searchHitHdrs) {
            nsCOMPtr<nsIMsgThread> msgThread;
            nsMsgKey threadKey;
            m_curFolderDB->GetThreadContainingMsgHdr(msgHdr,
                                                     getter_AddRefs(msgThread));
            BREAK_ACTION_IF_FALSE(msgThread, "Could not find msg thread");
            msgThread->GetThreadKey(&threadKey);
            if (actionType == nsMsgFilterAction::KillThread) {
              rv = m_curFolderDB->MarkThreadIgnored(msgThread, threadKey, true,
                                                    nullptr);
              BREAK_ACTION_IF_FAILURE(rv, "Setting message flags failed");
            } else {
              rv = m_curFolderDB->MarkThreadWatched(msgThread, threadKey, true,
                                                    nullptr);
              BREAK_ACTION_IF_FAILURE(rv, "Setting message flags failed");
            }
          }
        } break;
        case nsMsgFilterAction::KillSubthread: {
          for (auto msgHdr : m_searchHitHdrs) {
            rv = m_curFolderDB->MarkHeaderKilled(msgHdr, true, nullptr);
            BREAK_ACTION_IF_FAILURE(rv, "Setting message flags failed");
          }
        } break;
        case nsMsgFilterAction::ChangePriority: {
          nsMsgPriorityValue filterPriority;
          filterAction->GetPriority(&filterPriority);
          for (auto msgHdr : m_searchHitHdrs) {
            rv = msgHdr->SetPriority(filterPriority);
            BREAK_ACTION_IF_FAILURE(rv, "Setting message flags failed");
          }
        } break;
        case nsMsgFilterAction::AddTag: {
          nsCString keyword;
          filterAction->GetStrValue(keyword);
          rv = curFolder->AddKeywordsToMessages(m_searchHitHdrs, keyword);
          BREAK_ACTION_IF_FAILURE(rv, "Setting message flags failed");
        } break;
        case nsMsgFilterAction::JunkScore: {
          nsAutoCString junkScoreStr;
          int32_t junkScore;
          filterAction->GetJunkScore(&junkScore);
          junkScoreStr.AppendInt(junkScore);
          rv =
              curFolder->SetJunkScoreForMessages(m_searchHitHdrs, junkScoreStr);
          BREAK_ACTION_IF_FAILURE(rv, "Setting message flags failed");
        } break;
        case nsMsgFilterAction::Forward: {
          nsCOMPtr<nsIMsgIncomingServer> server;
          rv = curFolder->GetServer(getter_AddRefs(server));
          BREAK_ACTION_IF_FAILURE(rv, "Could not get server");
          nsCString forwardTo;
          filterAction->GetStrValue(forwardTo);
          BREAK_ACTION_IF_FALSE(!forwardTo.IsEmpty(), "blank forwardTo URI");
          nsCOMPtr<nsIMsgComposeService> compService =
              do_GetService("@mozilla.org/messengercompose;1", &rv);
          BREAK_ACTION_IF_FAILURE(rv, "Could not get compose service");

          for (auto msgHdr : m_searchHitHdrs) {
            rv = compService->ForwardMessage(
                NS_ConvertASCIItoUTF16(forwardTo), msgHdr, m_msgWindow, server,
                nsIMsgComposeService::kForwardAsDefault);
            BREAK_ACTION_IF_FAILURE(rv, "Forward action failed");
          }
        } break;
        case nsMsgFilterAction::Reply: {
          nsCString replyTemplateUri;
          filterAction->GetStrValue(replyTemplateUri);
          BREAK_ACTION_IF_FALSE(!replyTemplateUri.IsEmpty(),
                                "Empty reply template URI");

          nsCOMPtr<nsIMsgIncomingServer> server;
          rv = curFolder->GetServer(getter_AddRefs(server));
          BREAK_ACTION_IF_FAILURE(rv, "Could not get server");

          nsCOMPtr<nsIMsgComposeService> compService =
              do_GetService("@mozilla.org/messengercompose;1", &rv);
          BREAK_ACTION_IF_FAILURE(rv, "Could not get compose service");
          for (auto msgHdr : m_searchHitHdrs) {
            rv = compService->ReplyWithTemplate(msgHdr, replyTemplateUri,
                                                m_msgWindow, server);
            if (NS_FAILED(rv)) {
              if (rv == NS_ERROR_ABORT) {
                (void)curFilter->LogRuleHitFail(
                    filterAction, msgHdr, rv,
                    "filterFailureSendingReplyAborted"_ns);
              } else {
                (void)curFilter->LogRuleHitFail(
                    filterAction, msgHdr, rv,
                    "filterFailureSendingReplyError"_ns);
              }
            }
            BREAK_ACTION_IF_FAILURE(rv, "ReplyWithTemplate failed");
          }
        } break;
        case nsMsgFilterAction::DeleteFromPop3Server: {
          nsCOMPtr<nsIMsgLocalMailFolder> localFolder =
              do_QueryInterface(curFolder, &rv);
          BREAK_ACTION_IF_FAILURE(rv, "Current folder not a local folder");
          BREAK_ACTION_IF_FALSE(localFolder,
                                "Current folder not a local folder");
          // This action ignores the deleteMailLeftOnServer preference
          rv = localFolder->MarkMsgsOnPop3Server(m_searchHitHdrs,
                                                 POP3_FORCE_DEL);
          BREAK_ACTION_IF_FAILURE(rv, "MarkMsgsOnPop3Server failed");

          // Delete the partial headers. They're useless now
          //   that the server copy is being deleted.
          nsTArray<RefPtr<nsIMsgDBHdr>> partialMsgs;
          for (uint32_t i = 0; i < m_searchHits.Length(); ++i) {
            nsIMsgDBHdr* msgHdr = m_searchHitHdrs[i];
            nsMsgKey msgKey = m_searchHits[i];
            uint32_t flags;
            msgHdr->GetFlags(&flags);
            if (flags & nsMsgMessageFlags::Partial) {
              partialMsgs.AppendElement(msgHdr);
              m_stopFiltering.AppendElement(msgKey);
              curFolder->OrProcessingFlags(msgKey,
                                           nsMsgProcessingFlags::FilterToMove);
            }
          }
          if (!partialMsgs.IsEmpty()) {
            rv = curFolder->DeleteMessages(partialMsgs, m_msgWindow, true,
                                           false, nullptr, false);
            BREAK_ACTION_IF_FAILURE(rv, "Delete messages failed");
          }
        } break;
        case nsMsgFilterAction::FetchBodyFromPop3Server: {
          nsCOMPtr<nsIMsgLocalMailFolder> localFolder =
              do_QueryInterface(curFolder, &rv);
          BREAK_ACTION_IF_FAILURE(rv, "current folder not local");
          BREAK_ACTION_IF_FALSE(localFolder, "current folder not local");
          nsTArray<RefPtr<nsIMsgDBHdr>> messages;
          for (nsIMsgDBHdr* msgHdr : m_searchHitHdrs) {
            uint32_t flags = 0;
            msgHdr->GetFlags(&flags);
            if (flags & nsMsgMessageFlags::Partial)
              messages.AppendElement(msgHdr);
          }
          if (messages.Length() > 0) {
            rv = curFolder->DownloadMessagesForOffline(messages, m_msgWindow);
            BREAK_ACTION_IF_FAILURE(rv, "DownloadMessagesForOffline failed");
          }
        } break;

        case nsMsgFilterAction::StopExecution: {
          // don't apply any more filters
          m_stopFiltering.AppendElements(m_searchHits);
          m_nextAction = numActions;
        } break;

        case nsMsgFilterAction::Custom: {
          nsMsgFilterTypeType filterType;
          curFilter->GetFilterType(&filterType);
          nsCOMPtr<nsIMsgFilterCustomAction> customAction;
          rv = filterAction->GetCustomAction(getter_AddRefs(customAction));
          BREAK_ACTION_IF_FAILURE(rv, "Could not get custom action");

          nsAutoCString value;
          rv = filterAction->GetStrValue(value);
          BREAK_ACTION_IF_FAILURE(rv, "Could not get custom action value");
          bool isAsync = false;
          customAction->GetIsAsync(&isAsync);
          rv = customAction->ApplyAction(m_searchHitHdrs, value, this,
                                         filterType, m_msgWindow);
          BREAK_ACTION_IF_FAILURE(rv, "custom action failed to apply");
          if (isAsync) {
            MOZ_LOG(FILTERLOGMODULE, LogLevel::Debug,
                    ("(Post) Action execution continues async"));
            return NS_OK;  // custom action should call ApplyFilter on callback
          }
        } break;

        default:
          NS_ERROR("unexpected filter action");
          BREAK_ACTION_IF_FAILURE(NS_ERROR_UNEXPECTED,
                                  "Unexpected filter action");
      }
      if (NS_FAILED(finalResult)) {
        mFinalResult = finalResult;
        MOZ_LOG(FILTERLOGMODULE, LogLevel::Error,
                ("(Post) Action execution failed with error: %" PRIx32,
                 static_cast<uint32_t>(mFinalResult)));
        if (loggingEnabled && m_searchHitHdrs.Length() > 0) {
          (void)curFilter->LogRuleHitFail(filterAction, m_searchHitHdrs[0],
                                          mFinalResult,
                                          "filterActionFailed"_ns);
        }
      } else {
        MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
                ("(Post) Action execution succeeded"));
      }
    }
  } while (false);  // end error management block
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
          ("(Post) Finished executing actions"));
  return RunNextFilter();
}

NS_IMETHODIMP nsMsgFilterService::GetTempFilterList(
    nsIMsgFolder* aFolder, nsIMsgFilterList** aFilterList) {
  NS_ENSURE_ARG_POINTER(aFilterList);

  nsMsgFilterList* filterList = new nsMsgFilterList;
  filterList->SetFolder(aFolder);
  filterList->m_temporaryList = true;
  NS_ADDREF(*aFilterList = filterList);
  return NS_OK;
}

NS_IMETHODIMP
nsMsgFilterService::ApplyFiltersToFolders(
    nsIMsgFilterList* aFilterList,
    const nsTArray<RefPtr<nsIMsgFolder>>& aFolders, nsIMsgWindow* aMsgWindow,
    nsIMsgOperationListener* aCallback) {
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Debug,
          ("(Post) nsMsgFilterService::ApplyFiltersToFolders"));
  NS_ENSURE_ARG_POINTER(aFilterList);

  uint32_t filterCount;
  aFilterList->GetFilterCount(&filterCount);
  nsCString listId;
  aFilterList->GetListId(listId);
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
          ("(Post) Manual filter run initiated"));
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
          ("(Post) Running %" PRIu32 " filters from %s on %" PRIu32 " folders",
           filterCount, listId.get(), (int)aFolders.Length()));

  RefPtr<nsMsgFilterAfterTheFact> filterExecutor =
      new nsMsgFilterAfterTheFact(aMsgWindow, aFilterList, aFolders, aCallback);
  if (filterExecutor)
    return filterExecutor->AdvanceToNextFolder();
  else
    return NS_ERROR_OUT_OF_MEMORY;
}

NS_IMETHODIMP nsMsgFilterService::AddCustomAction(
    nsIMsgFilterCustomAction* aAction) {
  mCustomActions.AppendElement(aAction);
  return NS_OK;
}

NS_IMETHODIMP nsMsgFilterService::GetCustomActions(
    nsTArray<RefPtr<nsIMsgFilterCustomAction>>& actions) {
  actions = mCustomActions.Clone();
  return NS_OK;
}

NS_IMETHODIMP
nsMsgFilterService::GetCustomAction(const nsACString& aId,
                                    nsIMsgFilterCustomAction** aResult) {
  NS_ENSURE_ARG_POINTER(aResult);

  for (nsIMsgFilterCustomAction* action : mCustomActions) {
    nsAutoCString id;
    nsresult rv = action->GetId(id);
    if (NS_SUCCEEDED(rv) && aId.Equals(id)) {
      NS_ADDREF(*aResult = action);
      return NS_OK;
    }
  }
  aResult = nullptr;
  return NS_ERROR_FAILURE;
}

NS_IMETHODIMP nsMsgFilterService::AddCustomTerm(nsIMsgSearchCustomTerm* aTerm) {
  mCustomTerms.AppendElement(aTerm);
  return NS_OK;
}

NS_IMETHODIMP nsMsgFilterService::GetCustomTerms(
    nsTArray<RefPtr<nsIMsgSearchCustomTerm>>& terms) {
  terms = mCustomTerms.Clone();
  return NS_OK;
}

NS_IMETHODIMP
nsMsgFilterService::GetCustomTerm(const nsACString& aId,
                                  nsIMsgSearchCustomTerm** aResult) {
  NS_ENSURE_ARG_POINTER(aResult);

  for (nsIMsgSearchCustomTerm* term : mCustomTerms) {
    nsAutoCString id;
    nsresult rv = term->GetId(id);
    if (NS_SUCCEEDED(rv) && aId.Equals(id)) {
      NS_ADDREF(*aResult = term);
      return NS_OK;
    }
  }
  aResult = nullptr;
  // we use a null result to indicate failure to find a term
  return NS_OK;
}

/**
 * Translate the filter type flag into human readable type names.
 * In case of multiple flag they are delimited by '&'.
 */
NS_IMETHODIMP
nsMsgFilterService::FilterTypeName(nsMsgFilterTypeType filterType,
                                   nsACString& typeName) {
  typeName.Truncate();
  if (filterType == nsMsgFilterType::None) {
    typeName.Assign("None");
    return NS_OK;
  }

  if ((filterType & nsMsgFilterType::Incoming) == nsMsgFilterType::Incoming) {
    typeName.Append("Incoming&");
  } else {
    if ((filterType & nsMsgFilterType::Inbox) == nsMsgFilterType::Inbox) {
      typeName.Append("Inbox&");
    } else {
      if (filterType & nsMsgFilterType::InboxRule)
        typeName.Append("InboxRule&");
      if (filterType & nsMsgFilterType::InboxJavaScript)
        typeName.Append("InboxJavaScript&");
    }
    if ((filterType & nsMsgFilterType::News) == nsMsgFilterType::News) {
      typeName.Append("News&");
    } else {
      if (filterType & nsMsgFilterType::NewsRule) typeName.Append("NewsRule&");
      if (filterType & nsMsgFilterType::NewsJavaScript)
        typeName.Append("NewsJavaScript&");
    }
  }
  if (filterType & nsMsgFilterType::Manual) typeName.Append("Manual&");
  if (filterType & nsMsgFilterType::PostPlugin) typeName.Append("PostPlugin&");
  if (filterType & nsMsgFilterType::PostOutgoing)
    typeName.Append("PostOutgoing&");
  if (filterType & nsMsgFilterType::Archive) typeName.Append("Archive&");
  if (filterType & nsMsgFilterType::Periodic) typeName.Append("Periodic&");

  if (typeName.IsEmpty()) {
    typeName.Assign("UNKNOWN");
  } else {
    // Cut the trailing '&' character.
    typeName.Truncate(typeName.Length() - 1);
  }
  return NS_OK;
}

// nsMsgApplyFiltersToMessages overrides nsMsgFilterAfterTheFact in order to
// apply filters to a list of messages, rather than an entire folder
class nsMsgApplyFiltersToMessages : public nsMsgFilterAfterTheFact {
 public:
  nsMsgApplyFiltersToMessages(nsIMsgWindow* aMsgWindow,
                              nsIMsgFilterList* aFilterList,
                              const nsTArray<RefPtr<nsIMsgFolder>>& aFolderList,
                              const nsTArray<RefPtr<nsIMsgDBHdr>>& aMsgHdrList,
                              nsMsgFilterTypeType aFilterType,
                              nsIMsgOperationListener* aCallback);

 protected:
  virtual nsresult RunNextFilter();

  nsTArray<RefPtr<nsIMsgDBHdr>> m_msgHdrList;
  nsMsgFilterTypeType m_filterType;
};

nsMsgApplyFiltersToMessages::nsMsgApplyFiltersToMessages(
    nsIMsgWindow* aMsgWindow, nsIMsgFilterList* aFilterList,
    const nsTArray<RefPtr<nsIMsgFolder>>& aFolderList,
    const nsTArray<RefPtr<nsIMsgDBHdr>>& aMsgHdrList,
    nsMsgFilterTypeType aFilterType, nsIMsgOperationListener* aCallback)
    : nsMsgFilterAfterTheFact(aMsgWindow, aFilterList, aFolderList, aCallback),
      m_msgHdrList(aMsgHdrList.Clone()),
      m_filterType(aFilterType) {
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Debug,
          ("(Post) nsMsgApplyFiltersToMessages"));
}

nsresult nsMsgApplyFiltersToMessages::RunNextFilter() {
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Debug,
          ("(Post) nsMsgApplyFiltersToMessages::RunNextFilter"));
  nsresult rv = NS_OK;
  while (true) {
    m_curFilter = nullptr;  // we are done with the current filter
    if (!m_curFolder ||     // Not an error, we just need to run
                            // AdvanceToNextFolder()
        m_curFilterIndex >= m_numFilters)
      break;

    BREAK_IF_FALSE(m_filters, "No filters");
    nsMsgFilterTypeType filterType;
    bool isEnabled;
    rv =
        m_filters->GetFilterAt(m_curFilterIndex++, getter_AddRefs(m_curFilter));
    CONTINUE_IF_FAILURE(rv, "Could not get filter");
    rv = m_curFilter->GetFilterType(&filterType);
    CONTINUE_IF_FAILURE(rv, "Could not get filter type");
    if (!(filterType & m_filterType)) continue;
    rv = m_curFilter->GetEnabled(&isEnabled);
    CONTINUE_IF_FAILURE(rv, "Could not get isEnabled");
    if (!isEnabled) continue;

    MOZ_LOG(FILTERLOGMODULE, LogLevel::Debug,
            ("(Post) Running filter %" PRIu32, m_curFilterIndex));
    nsString filterName;
    m_curFilter->GetFilterName(filterName);
    // clang-format off
    MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
            ("(Post) Filter name: %s", NS_ConvertUTF16toUTF8(filterName).get()));
    // clang-format on

    nsCOMPtr<nsIMsgSearchScopeTerm> scope(new nsMsgSearchScopeTerm(
        nullptr, nsMsgSearchScope::offlineMail, m_curFolder));
    BREAK_IF_FALSE(scope, "Could not create scope, OOM?");
    m_curFilter->SetScope(scope);
    OnNewSearch();

    for (auto msgHdr : m_msgHdrList) {
      bool matched;
      rv = m_curFilter->MatchHdr(msgHdr, m_curFolder, m_curFolderDB,
                                 EmptyCString(), &matched);
      if (NS_SUCCEEDED(rv) && matched) {
        // In order to work with nsMsgFilterAfterTheFact::ApplyFilter we
        // initialize nsMsgFilterAfterTheFact's information with a search hit
        // now for the message that we're filtering.
        OnSearchHit(msgHdr, m_curFolder);
      }
    }
    m_curFilter->SetScope(nullptr);

    if (m_searchHits.Length() > 0) {
      m_nextAction = 0;
      rv = ApplyFilter();
      if (NS_SUCCEEDED(rv))
        return NS_OK;  // async callback will continue, or we are done.
    }
  }

  if (NS_FAILED(rv)) {
    // clang-format off
    MOZ_LOG(FILTERLOGMODULE, LogLevel::Error,
            ("(Post) Filter run failed (%" PRIx32 ")",
             static_cast<uint32_t>(rv)));
    // clang-format on
    m_filters->LogFilterMessage(u"Filter run failed"_ns, m_curFilter);
    NS_WARNING_ASSERTION(false, "Failed to run filters");
  } else {
    MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
            ("(Post) Filter run finished on the current folder"));
  }

  m_curFilter = nullptr;

  // We expect the failure is already recorded through one of the macro
  // expressions, that will have console logging added to them.
  // So an additional console warning is not needed here.
  return AdvanceToNextFolder();
}

NS_IMETHODIMP nsMsgFilterService::ApplyFilters(
    nsMsgFilterTypeType aFilterType,
    const nsTArray<RefPtr<nsIMsgDBHdr>>& aMsgHdrList, nsIMsgFolder* aFolder,
    nsIMsgWindow* aMsgWindow, nsIMsgOperationListener* aCallback) {
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Debug,
          ("(Post) nsMsgApplyFiltersToMessages::ApplyFilters"));
  NS_ENSURE_ARG_POINTER(aFolder);

  nsCOMPtr<nsIMsgFilterList> filterList;
  aFolder->GetFilterList(aMsgWindow, getter_AddRefs(filterList));
  NS_ENSURE_STATE(filterList);

  uint32_t filterCount;
  filterList->GetFilterCount(&filterCount);
  nsCString listId;
  filterList->GetListId(listId);
  nsString folderName;
  aFolder->GetName(folderName);
  nsCString typeName;
  FilterTypeName(aFilterType, typeName);
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
          ("(Post) Filter run initiated, trigger=%s (%i)", typeName.get(),
           aFilterType));
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
          ("(Post) Running %" PRIu32 " filters from %s on %" PRIu32
           " message(s) in folder '%s'",
           filterCount, listId.get(), (uint32_t)aMsgHdrList.Length(),
           NS_ConvertUTF16toUTF8(folderName).get()));

  // Create our nsMsgApplyFiltersToMessages object which will be called when
  // ApplyFiltersToHdr finds one or more filters that hit.
  RefPtr<nsMsgApplyFiltersToMessages> filterExecutor =
      new nsMsgApplyFiltersToMessages(aMsgWindow, filterList, {aFolder},
                                      aMsgHdrList, aFilterType, aCallback);

  if (filterExecutor) return filterExecutor->AdvanceToNextFolder();

  return NS_ERROR_OUT_OF_MEMORY;
}

/* void OnStartCopy (); */
NS_IMETHODIMP nsMsgFilterAfterTheFact::OnStartCopy() { return NS_OK; }

/* void OnProgress (in uint32_t aProgress, in uint32_t aProgressMax); */
NS_IMETHODIMP nsMsgFilterAfterTheFact::OnProgress(uint32_t aProgress,
                                                  uint32_t aProgressMax) {
  return NS_OK;
}

/* void SetMessageKey (in uint32_t aKey); */
NS_IMETHODIMP nsMsgFilterAfterTheFact::SetMessageKey(nsMsgKey /* aKey */) {
  return NS_OK;
}

NS_IMETHODIMP nsMsgFilterAfterTheFact::GetMessageId(nsACString& messageId) {
  return NS_OK;
}

/* void OnStopCopy (in nsresult aStatus); */
NS_IMETHODIMP nsMsgFilterAfterTheFact::OnStopCopy(nsresult aStatus) {
  if (NS_SUCCEEDED(aStatus)) {
    // clang-format off
    MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
            ("(Post) Async message copy from filter action finished successfully"));
    // clang-format on
    return ApplyFilter();
  }
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Error,
          ("(Post) Async message copy from filter action failed (%" PRIx32 ")",
           static_cast<uint32_t>(aStatus)));

  mFinalResult = aStatus;
  if (m_msgWindow && !ContinueExecutionPrompt()) return OnEndExecution();

  // Copy failed, so run the next filter
  return RunNextFilter();
}

bool nsMsgFilterAfterTheFact::ContinueExecutionPrompt() {
  if (!m_curFilter) return false;
  nsCOMPtr<nsIStringBundle> bundle;
  nsCOMPtr<nsIStringBundleService> bundleService =
      mozilla::components::StringBundle::Service();
  if (!bundleService) return false;
  bundleService->CreateBundle("chrome://messenger/locale/filter.properties",
                              getter_AddRefs(bundle));
  if (!bundle) return false;
  nsString filterName;
  m_curFilter->GetFilterName(filterName);
  nsString formatString;
  nsString confirmText;
  AutoTArray<nsString, 1> formatStrings = {filterName};
  nsresult rv = bundle->FormatStringFromName("continueFilterExecution",
                                             formatStrings, confirmText);
  if (NS_FAILED(rv)) return false;
  bool returnVal = false;
  (void)DisplayConfirmationPrompt(m_msgWindow, confirmText.get(), &returnVal);
  if (!returnVal) {
    MOZ_LOG(FILTERLOGMODULE, LogLevel::Warning,
            ("(Post) User aborted further filter execution on prompt"));
  }
  return returnVal;
}

nsresult nsMsgFilterAfterTheFact::DisplayConfirmationPrompt(
    nsIMsgWindow* msgWindow, const char16_t* confirmString, bool* confirmed) {
  if (msgWindow) {
    nsCOMPtr<nsIDocShell> docShell;
    msgWindow->GetRootDocShell(getter_AddRefs(docShell));
    if (docShell) {
      nsCOMPtr<nsIPrompt> dialog(do_GetInterface(docShell));
      if (dialog && confirmString)
        dialog->Confirm(nullptr, confirmString, confirmed);
    }
  }
  return NS_OK;
}
