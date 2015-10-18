/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
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
#include "nsIInterfaceRequestor.h"
#include "nsIInterfaceRequestorUtils.h"
#include "nsIStringBundle.h"
#include "nsIMsgSearchNotify.h"
#include "nsIUrlListener.h"
#include "nsIMsgCopyServiceListener.h"
#include "nsIMsgLocalMailFolder.h"
#include "nsIMsgDatabase.h"
#include "nsIMsgHdr.h"
#include "nsIDBFolderInfo.h"
#include "nsIRDFService.h"
#include "nsMsgBaseCID.h"
#include "nsIMsgCopyService.h"
#include "nsIInputStream.h"
#include "nsIOutputStream.h"
#include "nsISafeOutputStream.h"
#include "nsIMsgComposeService.h"
#include "nsMsgCompCID.h"
#include "nsNetUtil.h"
#include "nsMsgUtils.h"
#include "nsIMutableArray.h"
#include "nsIMsgMailSession.h"
#include "nsArrayUtils.h"
#include "nsCOMArray.h"
#include "nsIMsgFilterCustomAction.h"
#include "nsArrayEnumerator.h"
#include "nsMsgMessageFlags.h"
#include "nsIMsgWindow.h"
#include "nsIMsgSearchCustomTerm.h"
#include "nsIMsgSearchTerm.h"
#include "nsIMsgThread.h"
#include "nsAutoPtr.h"
#include "nsIMsgFilter.h"
#include "nsIMsgOperationListener.h"

#define BREAK_IF_FAILURE(_rv, _text) if (NS_FAILED(_rv)) { \
  NS_WARNING(_text); \
  mFinalResult = _rv; \
  break; \
}

#define CONTINUE_IF_FAILURE(_rv, _text) if (NS_FAILED(_rv)) { \
  NS_WARNING(_text); \
  mFinalResult = _rv; \
  if (m_msgWindow && !ContinueExecutionPrompt()) \
    return OnEndExecution(); \
  continue; \
}

#define BREAK_IF_FALSE(_assertTrue, _text) if (!(_assertTrue)) { \
  NS_WARNING(_text); \
  mFinalResult = NS_ERROR_FAILURE; \
  break; \
}

#define CONTINUE_IF_FALSE(_assertTrue, _text) if (!(_assertTrue)) { \
  NS_WARNING(_text); \
  mFinalResult = NS_ERROR_FAILURE; \
  if (m_msgWindow && !ContinueExecutionPrompt()) \
    return OnEndExecution(); \
  continue; \
}

NS_IMPL_ISUPPORTS(nsMsgFilterService, nsIMsgFilterService)

nsMsgFilterService::nsMsgFilterService()
{
}

nsMsgFilterService::~nsMsgFilterService()
{
}

NS_IMETHODIMP nsMsgFilterService::OpenFilterList(nsIFile *aFilterFile,
                                                 nsIMsgFolder *rootFolder,
                                                 nsIMsgWindow *aMsgWindow,
                                                 nsIMsgFilterList **resultFilterList)
{
  NS_ENSURE_ARG_POINTER(aFilterFile);
  NS_ENSURE_ARG_POINTER(resultFilterList);

  bool exists = false;
  nsresult rv = aFilterFile->Exists(&exists);
  if (NS_FAILED(rv) || !exists)
  {
    rv = aFilterFile->Create(nsIFile::NORMAL_FILE_TYPE, 0644);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  nsCOMPtr<nsIInputStream> fileStream;
  rv = NS_NewLocalFileInputStream(getter_AddRefs(fileStream), aFilterFile);
  NS_ENSURE_SUCCESS(rv, rv);
  NS_ENSURE_TRUE(fileStream, NS_ERROR_OUT_OF_MEMORY);

  RefPtr<nsMsgFilterList> filterList = new nsMsgFilterList();
  NS_ENSURE_TRUE(filterList, NS_ERROR_OUT_OF_MEMORY);
  filterList->SetFolder(rootFolder);

  // temporarily tell the filter where its file path is
  filterList->SetDefaultFile(aFilterFile);

  int64_t size = 0;
  rv = aFilterFile->GetFileSize(&size);
  if (NS_SUCCEEDED(rv) && size > 0)
    rv = filterList->LoadTextFilters(fileStream);
  fileStream->Close();
  fileStream = nullptr;
  if (NS_SUCCEEDED(rv))
  {
    int16_t version;
    filterList->GetVersion(&version);
    if (version != kFileVersion)
      SaveFilterList(filterList, aFilterFile);
  }
  else
  {
    if (rv == NS_MSG_FILTER_PARSE_ERROR && aMsgWindow)
    {
      rv = BackUpFilterFile(aFilterFile, aMsgWindow);
      NS_ENSURE_SUCCESS(rv, rv);
      rv = aFilterFile->SetFileSize(0);
      NS_ENSURE_SUCCESS(rv, rv);
      return OpenFilterList(aFilterFile, rootFolder, aMsgWindow, resultFilterList);
    }
    else if (rv == NS_MSG_CUSTOM_HEADERS_OVERFLOW && aMsgWindow)
      ThrowAlertMsg("filterCustomHeaderOverflow", aMsgWindow);
    else if (rv == NS_MSG_INVALID_CUSTOM_HEADER && aMsgWindow)
      ThrowAlertMsg("invalidCustomHeader", aMsgWindow);
  }

  NS_ADDREF(*resultFilterList = filterList);
  return rv;
}

NS_IMETHODIMP nsMsgFilterService::CloseFilterList(nsIMsgFilterList *filterList)
{
  //NS_ASSERTION(false,"CloseFilterList doesn't do anything yet");
  return NS_OK;
}

/* save without deleting */
NS_IMETHODIMP  nsMsgFilterService::SaveFilterList(nsIMsgFilterList *filterList, nsIFile *filterFile)
{
  NS_ENSURE_ARG_POINTER(filterFile);
  NS_ENSURE_ARG_POINTER(filterList);

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
    }
  }
  return rv;
}

NS_IMETHODIMP nsMsgFilterService::CancelFilterList(nsIMsgFilterList *filterList)
{
  return NS_ERROR_NOT_IMPLEMENTED;
}

nsresult nsMsgFilterService::BackUpFilterFile(nsIFile *aFilterFile, nsIMsgWindow *aMsgWindow)
{
  AlertBackingUpFilterFile(aMsgWindow);

  nsCOMPtr<nsIFile> localParentDir;
  nsresult rv = aFilterFile->GetParent(getter_AddRefs(localParentDir));
  NS_ENSURE_SUCCESS(rv,rv);

  //if back-up file exists delete the back up file otherwise copy fails.
  nsCOMPtr <nsIFile> backupFile;
  rv = localParentDir->Clone(getter_AddRefs(backupFile));
  NS_ENSURE_SUCCESS(rv,rv);
  backupFile->AppendNative(NS_LITERAL_CSTRING("rulesbackup.dat"));
  bool exists;
  backupFile->Exists(&exists);
  if (exists)
    backupFile->Remove(false);

  return aFilterFile->CopyToNative(localParentDir, NS_LITERAL_CSTRING("rulesbackup.dat"));
}

nsresult nsMsgFilterService::AlertBackingUpFilterFile(nsIMsgWindow *aMsgWindow)
{
  return ThrowAlertMsg("filterListBackUpMsg", aMsgWindow);
}

nsresult //Do not use this routine if you have to call it very often because it creates a new bundle each time
nsMsgFilterService::GetStringFromBundle(const char *aMsgName, char16_t **aResult)
{
  NS_ENSURE_ARG_POINTER(aResult);

  nsCOMPtr <nsIStringBundle> bundle;
  nsresult rv = GetFilterStringBundle(getter_AddRefs(bundle));
  if (NS_SUCCEEDED(rv) && bundle)
    rv = bundle->GetStringFromName(NS_ConvertASCIItoUTF16(aMsgName).get(), aResult);
  return rv;

}

nsresult
nsMsgFilterService::GetFilterStringBundle(nsIStringBundle **aBundle)
{
  NS_ENSURE_ARG_POINTER(aBundle);

  nsCOMPtr<nsIStringBundleService> bundleService =
         mozilla::services::GetStringBundleService();
  NS_ENSURE_TRUE(bundleService, NS_ERROR_UNEXPECTED);
  nsCOMPtr<nsIStringBundle> bundle;
  if (bundleService)
    bundleService->CreateBundle("chrome://messenger/locale/filter.properties",
                                 getter_AddRefs(bundle));
  NS_IF_ADDREF(*aBundle = bundle);
  return NS_OK;
}

nsresult
nsMsgFilterService::ThrowAlertMsg(const char*aMsgName, nsIMsgWindow *aMsgWindow)
{
  nsString alertString;
  nsresult rv = GetStringFromBundle(aMsgName, getter_Copies(alertString));
  nsCOMPtr<nsIMsgWindow> msgWindow(do_QueryInterface(aMsgWindow));
  if (!msgWindow) {
    nsCOMPtr<nsIMsgMailSession> mailSession ( do_GetService(NS_MSGMAILSESSION_CONTRACTID, &rv));
    if (NS_SUCCEEDED(rv))
      rv = mailSession->GetTopmostMsgWindow(getter_AddRefs(msgWindow));
  }

  if (NS_SUCCEEDED(rv) && !alertString.IsEmpty() && msgWindow)
  {
    nsCOMPtr <nsIDocShell> docShell;
    msgWindow->GetRootDocShell(getter_AddRefs(docShell));
    if (docShell)
    {
      nsCOMPtr<nsIPrompt> dialog(do_GetInterface(docShell));
      if (dialog && !alertString.IsEmpty())
        dialog->Alert(nullptr, alertString.get());
    }
  }
  return rv;
}

// this class is used to run filters after the fact, i.e., after new mail has been downloaded from the server.
// It can do the following:
// 1. Apply a single imap or pop3 filter on a single folder.
// 2. Apply multiple filters on a single imap or pop3 folder.
// 3. Apply a single filter on multiple imap or pop3 folders in the same account.
// 4. Apply multiple filters on multiple imap or pop3 folders in the same account.
// This will be called from the front end js code in the case of the apply filters to folder menu code,
// and from the filter dialog js code with the run filter now command.


// this class holds the list of filters and folders, and applies them in turn, first iterating
// over all the filters on one folder, and then advancing to the next folder and repeating.
// For each filter,we take the filter criteria and create a search term list. Then, we execute the search.
// We are a search listener so that we can build up the list of search hits.
// Then, when the search is done, we will apply the filter action(s) en-masse, so, for example, if the action is a move,
// we calls one method to move all the messages to the destination folder. Or, mark all the messages read.
// In the case of imap operations, or imap/local  moves, the action will be asynchronous, so we'll need to be a url listener
// as well, and kick off the next filter when the action completes.
class nsMsgFilterAfterTheFact : public nsIUrlListener, public nsIMsgSearchNotify, public nsIMsgCopyServiceListener
{
public:
  nsMsgFilterAfterTheFact(nsIMsgWindow *aMsgWindow,
                          nsIMsgFilterList *aFilterList, nsIArray *aFolderList,
                          nsIMsgOperationListener *aCallback);
  NS_DECL_ISUPPORTS
  NS_DECL_NSIURLLISTENER
  NS_DECL_NSIMSGSEARCHNOTIFY
  NS_DECL_NSIMSGCOPYSERVICELISTENER

  nsresult  AdvanceToNextFolder();  // kicks off the process
protected:
  virtual ~nsMsgFilterAfterTheFact();
  virtual   nsresult  RunNextFilter();
  /**
   * apply filter actions to current search hits
   */
  nsresult  ApplyFilter();
  nsresult  OnEndExecution(); // do what we have to do to cleanup.
  bool      ContinueExecutionPrompt();
  nsresult  DisplayConfirmationPrompt(nsIMsgWindow *msgWindow, const char16_t *confirmString, bool *confirmed);
  nsCOMPtr<nsIMsgWindow>      m_msgWindow;
  nsCOMPtr<nsIMsgFilterList>  m_filters;
  nsCOMPtr<nsIArray>          m_folders;
  nsCOMPtr<nsIMsgFolder>      m_curFolder;
  nsCOMPtr<nsIMsgDatabase>    m_curFolderDB;
  nsCOMPtr<nsIMsgFilter>      m_curFilter;
  uint32_t                    m_curFilterIndex;
  uint32_t                    m_curFolderIndex;
  uint32_t                    m_numFilters;
  uint32_t                    m_numFolders;
  nsTArray<nsMsgKey>          m_searchHits;
  nsCOMPtr<nsIMutableArray>   m_searchHitHdrs;
  nsTArray<nsMsgKey>          m_stopFiltering;
  nsCOMPtr<nsIMsgSearchSession> m_searchSession;
  nsCOMPtr<nsIMsgOperationListener> m_callback;
  uint32_t                    m_nextAction; // next filter action to perform
  nsresult                    mFinalResult; // report of overall success or failure
  bool                        mNeedsRelease; // Did we need to release ourself?
};

NS_IMPL_ISUPPORTS(nsMsgFilterAfterTheFact, nsIUrlListener, nsIMsgSearchNotify, nsIMsgCopyServiceListener)

nsMsgFilterAfterTheFact::nsMsgFilterAfterTheFact(nsIMsgWindow *aMsgWindow,
                                                 nsIMsgFilterList *aFilterList,
                                                 nsIArray *aFolderList,
                                                 nsIMsgOperationListener *aCallback)
{
  m_curFilterIndex = m_curFolderIndex = m_nextAction = 0;
  m_msgWindow = aMsgWindow;
  m_filters = aFilterList;
  m_folders = aFolderList;
  m_filters->GetFilterCount(&m_numFilters);
  m_folders->GetLength(&m_numFolders);

  NS_ADDREF(this); // we own ourselves, and will release ourselves when execution is done.
  mNeedsRelease = true;

  m_searchHitHdrs = do_CreateInstance(NS_ARRAY_CONTRACTID);
  m_callback = aCallback;
  mFinalResult = NS_OK;
}

nsMsgFilterAfterTheFact::~nsMsgFilterAfterTheFact()
{
}

// do what we have to do to cleanup.
nsresult nsMsgFilterAfterTheFact::OnEndExecution()
{
  if (m_searchSession)
    m_searchSession->UnregisterListener(this);

  if (m_filters)
    (void)m_filters->FlushLogIfNecessary();

  if (m_callback)
    (void)m_callback->OnStopOperation(mFinalResult);

  nsresult rv = mFinalResult;
  MOZ_ASSERT(mNeedsRelease, "OnEndExecution called a second time");
  if (mNeedsRelease)
  {
    Release(); // release ourselves.
    mNeedsRelease = false;
  }
  return rv;
}

nsresult nsMsgFilterAfterTheFact::RunNextFilter()
{
  nsresult rv = NS_OK;
  while (true)
  {
    m_curFilter = nullptr;
    if (m_curFilterIndex >= m_numFilters)
      break;
    BREAK_IF_FALSE(m_filters, "Missing filters");
    rv = m_filters->GetFilterAt(m_curFilterIndex++, getter_AddRefs(m_curFilter));
    CONTINUE_IF_FAILURE(rv, "Could not get filter at index");

    nsCOMPtr <nsISupportsArray> searchTerms;
    rv = m_curFilter->GetSearchTerms(getter_AddRefs(searchTerms));
    CONTINUE_IF_FAILURE(rv, "Could not get searchTerms");

    if (m_searchSession)
      m_searchSession->UnregisterListener(this);
    m_searchSession = do_CreateInstance(NS_MSGSEARCHSESSION_CONTRACTID, &rv);
    BREAK_IF_FAILURE(rv, "Failed to get search session");

    nsMsgSearchScopeValue searchScope = nsMsgSearchScope::offlineMail;
    uint32_t termCount;
    searchTerms->Count(&termCount);
    for (uint32_t termIndex = 0; termIndex < termCount; termIndex++)
    {
      nsCOMPtr <nsIMsgSearchTerm> term;
      nsresult rv = searchTerms->QueryElementAt(termIndex, NS_GET_IID(nsIMsgSearchTerm), getter_AddRefs(term));
      BREAK_IF_FAILURE(rv, "Could not get search term");
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
    return NS_OK; // OnSearchDone will continue
  }
  m_curFilter = nullptr;
  NS_WARN_IF_FALSE(NS_SUCCEEDED(rv), "Search failed");
  return AdvanceToNextFolder();
}

nsresult nsMsgFilterAfterTheFact::AdvanceToNextFolder()
{
  nsresult rv = NS_OK;
  // Advance through folders, making sure m_curFolder is null on errors
  while (true)
  {
    m_stopFiltering.Clear();
    m_curFolder = nullptr;
    if (m_curFolderIndex >= m_numFolders)
      // final end of nsMsgFilterAfterTheFact object
      return OnEndExecution();

    // reset the filter index to apply all filters to this new folder
    m_curFilterIndex = 0;
    m_nextAction = 0;
    rv = m_folders->QueryElementAt(m_curFolderIndex++, NS_GET_IID(nsIMsgFolder), getter_AddRefs(m_curFolder));
    CONTINUE_IF_FAILURE(rv, "Could not get next folder");

    // Note: I got rv = NS_OK but null m_curFolder after deleting a folder
    // outside of TB, when I select a single message and "run filter on message"
    // and the filter is to move the message to the deleted folder.

     // m_curFolder may be null when the folder is deleted externally.
    CONTINUE_IF_FALSE(m_curFolder, "Next folder returned null");

    rv = m_curFolder->GetMsgDatabase(getter_AddRefs(m_curFolderDB));
    if (rv == NS_MSG_ERROR_FOLDER_SUMMARY_OUT_OF_DATE)
    {
      nsCOMPtr<nsIMsgLocalMailFolder> localFolder = do_QueryInterface(m_curFolder, &rv);
      if (NS_SUCCEEDED(rv) && localFolder)
        // will continue with OnStopRunningUrl
        return localFolder->ParseFolder(m_msgWindow, this);
    }
    CONTINUE_IF_FAILURE(rv, "Could not get folder db");

    rv = RunNextFilter();
    // RunNextFilter returns success when either filters are done, or an async process has started.
    // It will call AdvanceToNextFolder itself if possible, so no need to call here.
    BREAK_IF_FAILURE(rv, "Failed to run next filter");
    break;
  }
  return rv;
}

NS_IMETHODIMP nsMsgFilterAfterTheFact::OnStartRunningUrl(nsIURI *aUrl)
{
  return NS_OK;
}

// This is the return from a folder parse
NS_IMETHODIMP nsMsgFilterAfterTheFact::OnStopRunningUrl(nsIURI *aUrl, nsresult aExitCode)
{
  if (NS_SUCCEEDED(aExitCode))
    return RunNextFilter();

  mFinalResult = aExitCode;
   // If m_msgWindow then we are in a context where the user can deal with
   //  errors. Put up a prompt, and exit if user wants.
  if (m_msgWindow && !ContinueExecutionPrompt())
    return OnEndExecution();

  // folder parse failed, so stop processing this folder.
  return AdvanceToNextFolder();
}

NS_IMETHODIMP nsMsgFilterAfterTheFact::OnSearchHit(nsIMsgDBHdr *header, nsIMsgFolder *folder)
{
  NS_ENSURE_ARG_POINTER(header);
  NS_ENSURE_TRUE(m_searchHitHdrs, NS_ERROR_NOT_INITIALIZED);

  nsMsgKey msgKey;
  header->GetMessageKey(&msgKey);

  // Under various previous actions (a move, delete, or stopExecution)
  //  we do not want to process filters on a per-message basis.
  if (m_stopFiltering.Contains(msgKey))
    return NS_OK;

  m_searchHits.AppendElement(msgKey);
  m_searchHitHdrs->AppendElement(header, false);
  return NS_OK;
}

// Continue after an async operation.
NS_IMETHODIMP nsMsgFilterAfterTheFact::OnSearchDone(nsresult status)
{
  if (NS_SUCCEEDED(status))
    return m_searchHits.IsEmpty() ? RunNextFilter() : ApplyFilter();

  mFinalResult = status;
  if (m_msgWindow && !ContinueExecutionPrompt())
    return OnEndExecution();

  // The search failed, so move on to the next filter.
  return RunNextFilter();
}

NS_IMETHODIMP nsMsgFilterAfterTheFact::OnNewSearch()
{
  m_searchHits.Clear();
  m_searchHitHdrs->Clear();
  return NS_OK;
}

// This method will apply filters. It will continue to advance though headers,
//   filters, and folders until done, unless it starts an async operation with
//   a callback. The callback should call ApplyFilter again. It only returns
//   an error if it is impossible to continue after attempting to continue the
//   next filter action, filter, or folder.
nsresult nsMsgFilterAfterTheFact::ApplyFilter()
{
  nsresult rv;
  do { // error management block, break if unable to continue with filter.
    if (!m_curFilter)
      break; // Maybe not an error, we just need to call RunNextFilter();
    if (!m_curFolder)
      break; // Maybe not an error, we just need to call AdvanceToNextFolder();
    BREAK_IF_FALSE(m_searchHitHdrs, "No search headers object");
    // we're going to log the filter actions before firing them because some actions are async
    bool loggingEnabled = false;
    if (m_filters)
      (void)m_filters->GetLoggingEnabled(&loggingEnabled);

    nsCOMPtr<nsIArray> actionList;
    rv = m_curFilter->GetSortedActionList(getter_AddRefs(actionList));
    BREAK_IF_FAILURE(rv, "Could not get action list for filter");

    uint32_t numActions;
    actionList->GetLength(&numActions);

    // We start from m_nextAction to allow us to continue applying actions
    // after the return from an async copy.
    while (m_nextAction < numActions)
    {
      nsCOMPtr<nsIMsgRuleAction>filterAction(do_QueryElementAt(actionList, m_nextAction++, &rv));
      CONTINUE_IF_FAILURE(rv, "actionList cannot QI element");

      nsMsgRuleActionType actionType;
      rv = filterAction->GetType(&actionType);
      CONTINUE_IF_FAILURE(rv, "Could not get type for filter action");

      nsCString actionTargetFolderUri;
      if (actionType == nsMsgFilterAction::MoveToFolder ||
          actionType == nsMsgFilterAction::CopyToFolder)
      {
        rv = filterAction->GetTargetFolderUri(actionTargetFolderUri);
        CONTINUE_IF_FALSE(NS_SUCCEEDED(rv) && !actionTargetFolderUri.IsEmpty(),
                          "actionTargetFolderUri is empty");
      }

      if (loggingEnabled)
      {
        for (uint32_t msgIndex = 0; msgIndex < m_searchHits.Length(); msgIndex++)
        {
          nsCOMPtr <nsIMsgDBHdr> msgHdr;
          m_searchHitHdrs->QueryElementAt(msgIndex, NS_GET_IID(nsIMsgDBHdr), getter_AddRefs(msgHdr));
          if (msgHdr)
            (void)m_curFilter->LogRuleHit(filterAction, msgHdr);
          else
            NS_WARNING("could not QI element to nsIMsgDBHdr");
        }
      }

      // all actions that pass "this" as a listener in order to chain filter execution
      // when the action is finished need to return before reaching the bottom of this
      // routine, because we run the next filter at the end of this routine.
      switch (actionType)
      {
      case nsMsgFilterAction::Delete:
        // we can't pass ourselves in as a copy service listener because the copy service
        // listener won't get called in several situations (e.g., the delete model is imap delete)
        // and we rely on the listener getting called to continue the filter application.
        // This means we're going to end up firing off the delete, and then subsequently
        // issuing a search for the next filter, which will block until the delete finishes.
        m_curFolder->DeleteMessages(m_searchHitHdrs, m_msgWindow, false, false, nullptr, false /*allow Undo*/ );

        // don't allow any more filters on this message
        m_stopFiltering.AppendElements(m_searchHits);
        for (uint32_t i = 0; i < m_searchHits.Length(); i++)
          m_curFolder->OrProcessingFlags(m_searchHits[i], nsMsgProcessingFlags::FilterToMove);
        //if we are deleting then we couldn't care less about applying remaining filter actions
        m_nextAction = numActions;
        break;

      case nsMsgFilterAction::MoveToFolder:
        // Even if move fails we will not run additional actions, as they
        //   would not have run if move succeeded.
        m_nextAction = numActions;
        // Fall through to the copy case.

      case nsMsgFilterAction::CopyToFolder:
      {
        nsCString uri;
        m_curFolder->GetURI(uri);
        if (!actionTargetFolderUri.IsEmpty() &&
            !uri.Equals(actionTargetFolderUri))
        {
          nsCOMPtr<nsIRDFService> rdf = do_GetService("@mozilla.org/rdf/rdf-service;1",&rv);
          nsCOMPtr<nsIRDFResource> res;
          rv = rdf->GetResource(actionTargetFolderUri, getter_AddRefs(res));
          CONTINUE_IF_FAILURE(rv, "Could not get resource for action folder");

          nsCOMPtr<nsIMsgFolder> destIFolder(do_QueryInterface(res, &rv));
          CONTINUE_IF_FAILURE(rv, "Could not QI resource to folder");

          bool canFileMessages = true;
          nsCOMPtr<nsIMsgFolder> parentFolder;
          destIFolder->GetParent(getter_AddRefs(parentFolder));
          if (parentFolder)
            destIFolder->GetCanFileMessages(&canFileMessages);
          if (!parentFolder || !canFileMessages)
          {
            m_curFilter->SetEnabled(false);
            destIFolder->ThrowAlertMsg("filterDisabled",m_msgWindow);
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
            mFinalResult = NS_ERROR_FAILURE;
            break;
          }
          nsCOMPtr<nsIMsgCopyService> copyService = do_GetService(NS_MSGCOPYSERVICE_CONTRACTID, &rv);
          CONTINUE_IF_FAILURE(rv, "Could not get copy service")

          if (actionType == nsMsgFilterAction::MoveToFolder)
          {
            m_stopFiltering.AppendElements(m_searchHits);
            for (uint32_t i = 0; i < m_searchHits.Length(); i++)
              m_curFolder->OrProcessingFlags(m_searchHits[i],
                                             nsMsgProcessingFlags::FilterToMove);
          }

          rv = copyService->CopyMessages(m_curFolder, m_searchHitHdrs,
              destIFolder, actionType == nsMsgFilterAction::MoveToFolder,
              this, m_msgWindow, false);
          CONTINUE_IF_FAILURE(rv, "CopyMessages failed");
          return NS_OK; // OnStopCopy callback to continue;
        }
        else
          NS_WARNING("Move or copy failed, empty or unchanged destination");
      }
        break;
      case nsMsgFilterAction::MarkRead:
          // crud, no listener support here - we'll probably just need to go on and apply
          // the next filter, and, in the imap case, rely on multiple connection and url
          // queueing to stay out of trouble
        m_curFolder->MarkMessagesRead(m_searchHitHdrs, true);
        break;
      case nsMsgFilterAction::MarkUnread:
        m_curFolder->MarkMessagesRead(m_searchHitHdrs, false);
        break;
      case nsMsgFilterAction::MarkFlagged:
        m_curFolder->MarkMessagesFlagged(m_searchHitHdrs, true);
        break;
      case nsMsgFilterAction::KillThread:
      case nsMsgFilterAction::WatchThread:
        {
          for (uint32_t msgIndex = 0; msgIndex < m_searchHits.Length(); msgIndex++)
          {
            nsCOMPtr <nsIMsgDBHdr> msgHdr;
            m_searchHitHdrs->QueryElementAt(msgIndex, NS_GET_IID(nsIMsgDBHdr), getter_AddRefs(msgHdr));
            CONTINUE_IF_FALSE(msgHdr, "Could not get msg header");

            nsCOMPtr<nsIMsgThread> msgThread;
            nsMsgKey threadKey;
            m_curFolderDB->GetThreadContainingMsgHdr(msgHdr, getter_AddRefs(msgThread));
            CONTINUE_IF_FALSE(msgThread, "Could not find msg thread");
            msgThread->GetThreadKey(&threadKey);
            if (actionType == nsMsgFilterAction::KillThread)
              m_curFolderDB->MarkThreadIgnored(msgThread, threadKey, true, nullptr);
            else
              m_curFolderDB->MarkThreadWatched(msgThread, threadKey, true, nullptr);
          }
        }
        break;
      case nsMsgFilterAction::KillSubthread:
        {
          for (uint32_t msgIndex = 0; msgIndex < m_searchHits.Length(); msgIndex++)
          {
            nsCOMPtr<nsIMsgDBHdr> msgHdr;
            m_searchHitHdrs->QueryElementAt(msgIndex, NS_GET_IID(nsIMsgDBHdr), getter_AddRefs(msgHdr));
            CONTINUE_IF_FALSE(msgHdr, "Could not get msg header");
            m_curFolderDB->MarkHeaderKilled(msgHdr, true, nullptr);
          }
        }
        break;
      case nsMsgFilterAction::ChangePriority:
        {
          nsMsgPriorityValue filterPriority;
          filterAction->GetPriority(&filterPriority);
          for (uint32_t msgIndex = 0; msgIndex < m_searchHits.Length(); msgIndex++)
          {
            nsCOMPtr <nsIMsgDBHdr> msgHdr;
            m_searchHitHdrs->QueryElementAt(msgIndex, NS_GET_IID(nsIMsgDBHdr), getter_AddRefs(msgHdr));
            CONTINUE_IF_FALSE(msgHdr, "Could not get msg header");
            msgHdr->SetPriority(filterPriority);
          }
        }
        break;
      case nsMsgFilterAction::Label:
        {
          nsMsgLabelValue filterLabel;
          filterAction->GetLabel(&filterLabel);
          m_curFolder->SetLabelForMessages(m_searchHitHdrs, filterLabel);
        }
        break;
      case nsMsgFilterAction::AddTag:
        {
          nsCString keyword;
          filterAction->GetStrValue(keyword);
          m_curFolder->AddKeywordsToMessages(m_searchHitHdrs, keyword);
        }
        break;
      case nsMsgFilterAction::JunkScore:
        {
          nsAutoCString junkScoreStr;
          int32_t junkScore;
          filterAction->GetJunkScore(&junkScore);
          junkScoreStr.AppendInt(junkScore);
          m_curFolder->SetJunkScoreForMessages(m_searchHitHdrs, junkScoreStr);
        }
        break;
      case nsMsgFilterAction::Forward:
        {
          nsCOMPtr<nsIMsgIncomingServer> server;
          rv = m_curFolder->GetServer(getter_AddRefs(server));
          CONTINUE_IF_FAILURE(rv, "Could not get server");
          nsCString forwardTo;
          filterAction->GetStrValue(forwardTo);
          CONTINUE_IF_FALSE(!forwardTo.IsEmpty(), "blank forwardTo URI");
          nsCOMPtr<nsIMsgComposeService> compService =
            do_GetService(NS_MSGCOMPOSESERVICE_CONTRACTID, &rv);
          CONTINUE_IF_FAILURE(rv, "Could not get compose service");

          for (uint32_t msgIndex = 0; msgIndex < m_searchHits.Length(); msgIndex++)
          {
            nsCOMPtr<nsIMsgDBHdr> msgHdr(do_QueryElementAt(m_searchHitHdrs,
                                         msgIndex));
            if (msgHdr)
              rv = compService->ForwardMessage(NS_ConvertASCIItoUTF16(forwardTo),
                                               msgHdr, m_msgWindow, server,
                                               nsIMsgComposeService::kForwardAsDefault);
            CONTINUE_IF_FALSE(msgHdr && NS_SUCCEEDED(rv), "Forward action failed");
          }
        }
        break;
      case nsMsgFilterAction::Reply:
        {
          nsCString replyTemplateUri;
          filterAction->GetStrValue(replyTemplateUri);
          CONTINUE_IF_FALSE(!replyTemplateUri.IsEmpty(), "Empty reply template URI");

          nsCOMPtr<nsIMsgIncomingServer> server;
          rv = m_curFolder->GetServer(getter_AddRefs(server));
          CONTINUE_IF_FAILURE(rv, "Could not get server");

          nsCOMPtr<nsIMsgComposeService> compService = do_GetService(NS_MSGCOMPOSESERVICE_CONTRACTID, &rv);
          CONTINUE_IF_FAILURE(rv, "Could not get compose service");
          for (uint32_t msgIndex = 0; msgIndex < m_searchHits.Length(); msgIndex++)
          {
            nsCOMPtr <nsIMsgDBHdr> msgHdr;
            m_searchHitHdrs->QueryElementAt(msgIndex, NS_GET_IID(nsIMsgDBHdr), getter_AddRefs(msgHdr));
            CONTINUE_IF_FALSE(msgHdr, "Could not get msgHdr");
            rv = compService->ReplyWithTemplate(msgHdr, replyTemplateUri.get(), m_msgWindow, server);
            CONTINUE_IF_FAILURE(rv, "ReplyWithtemplate failed");
          }
        }
        break;
      case nsMsgFilterAction::DeleteFromPop3Server:
        {
          nsCOMPtr<nsIMsgLocalMailFolder> localFolder = do_QueryInterface(m_curFolder);
          CONTINUE_IF_FALSE(localFolder, "Current folder not a local folder");
          // This action ignores the deleteMailLeftOnServer preference
          rv = localFolder->MarkMsgsOnPop3Server(m_searchHitHdrs, POP3_FORCE_DEL);
          CONTINUE_IF_FAILURE(rv, "MarkMsgsOnPop3Server failed");

          nsCOMPtr<nsIMutableArray> partialMsgs;
          // Delete the partial headers. They're useless now
          //   that the server copy is being deleted.
          for (uint32_t msgIndex = 0; msgIndex < m_searchHits.Length(); msgIndex++)
          {
            nsCOMPtr <nsIMsgDBHdr> msgHdr;
            m_searchHitHdrs->QueryElementAt(msgIndex, NS_GET_IID(nsIMsgDBHdr), getter_AddRefs(msgHdr));
            CONTINUE_IF_FALSE(msgHdr, "Could not get msgHdr");
            uint32_t flags;
            msgHdr->GetFlags(&flags);
            if (flags & nsMsgMessageFlags::Partial)
            {
              if (!partialMsgs)
                partialMsgs = do_CreateInstance(NS_ARRAY_CONTRACTID, &rv);
              CONTINUE_IF_FALSE(partialMsgs, "Could not create partialMsgs array");
              partialMsgs->AppendElement(msgHdr, false);
              m_stopFiltering.AppendElement(m_searchHits[msgIndex]);
              m_curFolder->OrProcessingFlags(m_searchHits[msgIndex],
                                             nsMsgProcessingFlags::FilterToMove);
            }
          }
          if (partialMsgs)
          {
            m_curFolder->DeleteMessages(partialMsgs, m_msgWindow, true, false, nullptr, false);
            CONTINUE_IF_FAILURE(rv, "Delete messages failed");
          }
        }
        break;
      case nsMsgFilterAction::FetchBodyFromPop3Server:
        {
          nsCOMPtr<nsIMsgLocalMailFolder> localFolder = do_QueryInterface(m_curFolder);
          CONTINUE_IF_FALSE(localFolder, "current folder not local");
          nsCOMPtr<nsIMutableArray> messages(do_CreateInstance(NS_ARRAY_CONTRACTID, &rv));
          CONTINUE_IF_FAILURE(rv, "Could not create messages array");
          for (uint32_t msgIndex = 0; msgIndex < m_searchHits.Length(); msgIndex++)
          {
            nsCOMPtr<nsIMsgDBHdr> msgHdr;
            m_searchHitHdrs->QueryElementAt(msgIndex, NS_GET_IID(nsIMsgDBHdr), getter_AddRefs(msgHdr));
            CONTINUE_IF_FALSE(msgHdr, "Could not get msgHdr");
            uint32_t flags = 0;
            msgHdr->GetFlags(&flags);
            if (flags & nsMsgMessageFlags::Partial)
              messages->AppendElement(msgHdr, false);
          }
          uint32_t msgsToFetch;
          messages->GetLength(&msgsToFetch);
          if (msgsToFetch > 0)
          {
            rv = m_curFolder->DownloadMessagesForOffline(messages, m_msgWindow);
            CONTINUE_IF_FAILURE(rv, "DownloadMessagesForOffline failed");
          }
        }
        break;

      case nsMsgFilterAction::StopExecution:
        {
          // don't apply any more filters
          m_stopFiltering.AppendElements(m_searchHits);
          m_nextAction = numActions;
        }
      break;

      case nsMsgFilterAction::Custom:
        {
          nsMsgFilterTypeType filterType;
          m_curFilter->GetFilterType(&filterType);
          nsCOMPtr<nsIMsgFilterCustomAction> customAction;
          rv = filterAction->GetCustomAction(getter_AddRefs(customAction));
          CONTINUE_IF_FAILURE(rv, "Could not get custom action");

          nsAutoCString value;
          filterAction->GetStrValue(value);
          bool isAsync = false;
          customAction->GetIsAsync(&isAsync);
          rv = customAction->Apply(m_searchHitHdrs, value, this,
                                   filterType, m_msgWindow);
          CONTINUE_IF_FAILURE(rv, "custom action failed to apply");
          if (isAsync)
            return NS_OK; // custom action should call ApplyFilter on callback
        }
      break;

      default:
        break;
      }
    }
  } while (false); // end error management block
  return RunNextFilter();
}

NS_IMETHODIMP nsMsgFilterService::GetTempFilterList(nsIMsgFolder *aFolder, nsIMsgFilterList **aFilterList)
{
  NS_ENSURE_ARG_POINTER(aFilterList);

  nsMsgFilterList *filterList = new nsMsgFilterList;
  NS_ENSURE_TRUE(filterList, NS_ERROR_OUT_OF_MEMORY);
  NS_ADDREF(*aFilterList = filterList);
  (*aFilterList)->SetFolder(aFolder);
  filterList->m_temporaryList = true;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgFilterService::ApplyFiltersToFolders(nsIMsgFilterList *aFilterList,
                                          nsIArray *aFolders,
                                          nsIMsgWindow *aMsgWindow,
                                          nsIMsgOperationListener *aCallback)
{
  NS_ENSURE_ARG_POINTER(aFilterList);
  NS_ENSURE_ARG_POINTER(aFolders);

  RefPtr<nsMsgFilterAfterTheFact> filterExecutor =
    new nsMsgFilterAfterTheFact(aMsgWindow, aFilterList, aFolders, aCallback);
  if (filterExecutor)
    return filterExecutor->AdvanceToNextFolder();
  else
    return NS_ERROR_OUT_OF_MEMORY;
}

NS_IMETHODIMP nsMsgFilterService::AddCustomAction(nsIMsgFilterCustomAction *aAction)
{
  mCustomActions.AppendObject(aAction);
  return NS_OK;
}

NS_IMETHODIMP nsMsgFilterService::GetCustomActions(nsISimpleEnumerator** aResult)
{
  NS_ENSURE_ARG_POINTER(aResult);

  return NS_NewArrayEnumerator(aResult, mCustomActions);
}

NS_IMETHODIMP
nsMsgFilterService::GetCustomAction(const nsACString & aId,
                                    nsIMsgFilterCustomAction** aResult)
{
  NS_ENSURE_ARG_POINTER(aResult);

  for (int32_t i = 0; i < mCustomActions.Count(); i++)
  {
    nsAutoCString id;
    nsresult rv = mCustomActions[i]->GetId(id);
    if (NS_SUCCEEDED(rv) && aId.Equals(id))
    {
      NS_ADDREF(*aResult = mCustomActions[i]);
      return NS_OK;
    }
  }
  aResult = nullptr;
  return NS_ERROR_FAILURE;
}

NS_IMETHODIMP nsMsgFilterService::AddCustomTerm(nsIMsgSearchCustomTerm *aTerm)
{
  mCustomTerms.AppendObject(aTerm);
  return NS_OK;
}

NS_IMETHODIMP nsMsgFilterService::GetCustomTerms(nsISimpleEnumerator** aResult)
{
  NS_ENSURE_ARG_POINTER(aResult);

  return NS_NewArrayEnumerator(aResult, mCustomTerms);
}

NS_IMETHODIMP
nsMsgFilterService::GetCustomTerm(const nsACString& aId,
                                    nsIMsgSearchCustomTerm** aResult)
{
  NS_ENSURE_ARG_POINTER(aResult);

  for (int32_t i = 0; i < mCustomTerms.Count(); i++)
  {
    nsAutoCString id;
    nsresult rv = mCustomTerms[i]->GetId(id);
    if (NS_SUCCEEDED(rv) && aId.Equals(id))
    {
      NS_ADDREF(*aResult = mCustomTerms[i]);
      return NS_OK;
    }
  }
  aResult = nullptr;
  // we use a null result to indicate failure to find a term
  return NS_OK;
}

// nsMsgApplyFiltersToMessages overrides nsMsgFilterAfterTheFact in order to
// apply filters to a list of messages, rather than an entire folder
class nsMsgApplyFiltersToMessages : public nsMsgFilterAfterTheFact
{
public:
  nsMsgApplyFiltersToMessages(nsIMsgWindow *aMsgWindow,
                              nsIMsgFilterList *aFilterList,
                              nsIArray *aFolderList, nsIArray *aMsgHdrList,
                              nsMsgFilterTypeType aFilterType,
                              nsIMsgOperationListener *aCallback);

protected:
  virtual   nsresult  RunNextFilter();

  nsCOMArray<nsIMsgDBHdr> m_msgHdrList;
  nsMsgFilterTypeType     m_filterType;
};

nsMsgApplyFiltersToMessages::nsMsgApplyFiltersToMessages(nsIMsgWindow *aMsgWindow,
                                                         nsIMsgFilterList *aFilterList,
                                                         nsIArray *aFolderList,
                                                         nsIArray *aMsgHdrList,
                                                         nsMsgFilterTypeType aFilterType,
                                                         nsIMsgOperationListener *aCallback)
: nsMsgFilterAfterTheFact(aMsgWindow, aFilterList, aFolderList, aCallback),
  m_filterType(aFilterType)
{
  nsCOMPtr<nsISimpleEnumerator> msgEnumerator;
  if (NS_SUCCEEDED(aMsgHdrList->Enumerate(getter_AddRefs(msgEnumerator))))
  {
    uint32_t length;
    if (NS_SUCCEEDED(aMsgHdrList->GetLength(&length)))
      m_msgHdrList.SetCapacity(length);

    bool hasMore;
    while (NS_SUCCEEDED(msgEnumerator->HasMoreElements(&hasMore)) && hasMore)
    {
      nsCOMPtr<nsISupports> supports;
      nsCOMPtr<nsIMsgDBHdr> msgHdr;
      if (NS_SUCCEEDED(msgEnumerator->GetNext(getter_AddRefs(supports))) &&
          (msgHdr = do_QueryInterface(supports)))
        m_msgHdrList.AppendObject(msgHdr);
    }
  }
}

nsresult nsMsgApplyFiltersToMessages::RunNextFilter()
{
  nsresult rv = NS_OK;
  while (true)
  {
    m_curFilter = nullptr; // we are done with the current filter
    if (!m_curFolder || // Not an error, we just need to run AdvanceToNextFolder()
        m_curFilterIndex >= m_numFilters)
      break;
    BREAK_IF_FALSE(m_filters, "No filters");
    nsMsgFilterTypeType filterType;
    bool isEnabled;
    rv = m_filters->GetFilterAt(m_curFilterIndex++, getter_AddRefs(m_curFilter));
    CONTINUE_IF_FAILURE(rv, "Could not get filter");
    rv = m_curFilter->GetFilterType(&filterType);
    CONTINUE_IF_FAILURE(rv, "Could not get filter type");
    if (!(filterType & m_filterType))
      continue;
    rv = m_curFilter->GetEnabled(&isEnabled);
    CONTINUE_IF_FAILURE(rv, "Could not get isEnabled");
    if (!isEnabled)
      continue;

    nsCOMPtr<nsIMsgSearchScopeTerm> scope(new nsMsgSearchScopeTerm(nullptr, nsMsgSearchScope::offlineMail, m_curFolder));
    BREAK_IF_FALSE(scope, "Could not create scope, OOM?");
    m_curFilter->SetScope(scope);
    OnNewSearch();

    for (int32_t i = 0; i < m_msgHdrList.Count(); i++)
    {
      nsCOMPtr<nsIMsgDBHdr> msgHdr = m_msgHdrList[i];
      CONTINUE_IF_FALSE(msgHdr, "null msgHdr");

      bool matched;
      rv = m_curFilter->MatchHdr(msgHdr, m_curFolder, m_curFolderDB, nullptr, 0, &matched);
      if (NS_SUCCEEDED(rv) && matched)
      {
        // In order to work with nsMsgFilterAfterTheFact::ApplyFilter we initialize
        // nsMsgFilterAfterTheFact's information with a search hit now for the message
        // that we're filtering.
        OnSearchHit(msgHdr, m_curFolder);
      }
    }
    m_curFilter->SetScope(nullptr);

    if (m_searchHits.Length() > 0)
    {
      m_nextAction = 0;
      rv = ApplyFilter();
      if (NS_SUCCEEDED(rv))
        return NS_OK; // async callback will continue, or we are done.
    }
  }
  m_curFilter = nullptr;
  NS_WARN_IF_FALSE(NS_SUCCEEDED(rv), "Failed to run filters");
  // We expect the failure is already recorded through one of the macro
  // expressions, that will have console logging added to them.
  // So an additional console warning is not needed here.
  return AdvanceToNextFolder();
}

NS_IMETHODIMP nsMsgFilterService::ApplyFilters(nsMsgFilterTypeType aFilterType,
                                               nsIArray *aMsgHdrList,
                                               nsIMsgFolder *aFolder,
                                               nsIMsgWindow *aMsgWindow,
                                               nsIMsgOperationListener *aCallback)
{
  NS_ENSURE_ARG_POINTER(aFolder);

  nsCOMPtr<nsIMsgFilterList>    filterList;
  nsresult rv = aFolder->GetFilterList(aMsgWindow, getter_AddRefs(filterList));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMutableArray> folderList(do_CreateInstance(NS_ARRAY_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  folderList->AppendElement(aFolder, false);

  // Create our nsMsgApplyFiltersToMessages object which will be called when ApplyFiltersToHdr
  // finds one or more filters that hit.
  RefPtr<nsMsgApplyFiltersToMessages> filterExecutor =
    new nsMsgApplyFiltersToMessages(aMsgWindow, filterList, folderList,
                                    aMsgHdrList, aFilterType, aCallback);

  if (filterExecutor)
    return filterExecutor->AdvanceToNextFolder();

  return NS_ERROR_OUT_OF_MEMORY;
}

/* void OnStartCopy (); */
NS_IMETHODIMP nsMsgFilterAfterTheFact::OnStartCopy()
{
  return NS_OK;
}

/* void OnProgress (in uint32_t aProgress, in uint32_t aProgressMax); */
NS_IMETHODIMP nsMsgFilterAfterTheFact::OnProgress(uint32_t aProgress, uint32_t aProgressMax)
{
  return NS_OK;
}

/* void SetMessageKey (in uint32_t aKey); */
NS_IMETHODIMP nsMsgFilterAfterTheFact::SetMessageKey(nsMsgKey /* aKey */)
{
  return NS_OK;
}

NS_IMETHODIMP nsMsgFilterAfterTheFact::GetMessageId(nsACString& messageId)
{
  return NS_OK;
}

/* void OnStopCopy (in nsresult aStatus); */
NS_IMETHODIMP nsMsgFilterAfterTheFact::OnStopCopy(nsresult aStatus)
{
  if (NS_SUCCEEDED(aStatus))
    return ApplyFilter();

  mFinalResult = aStatus;
  if (m_msgWindow && !ContinueExecutionPrompt())
    return OnEndExecution();

  // Copy failed, so run the next filter
  return RunNextFilter();
}

bool nsMsgFilterAfterTheFact::ContinueExecutionPrompt()
{
  if (!m_curFilter)
    return false;
  nsCOMPtr<nsIStringBundle> bundle;
  nsCOMPtr<nsIStringBundleService> bundleService =
    mozilla::services::GetStringBundleService();
  if (!bundleService)
    return false;
  bundleService->CreateBundle("chrome://messenger/locale/filter.properties",
                              getter_AddRefs(bundle));
  if (!bundle)
    return false;
  nsString filterName;
  m_curFilter->GetFilterName(filterName);
  nsString formatString;
  nsString confirmText;
  const char16_t *formatStrings[] =
  {
    filterName.get()
  };
  nsresult rv = bundle->FormatStringFromName(MOZ_UTF16("continueFilterExecution"),
                                             formatStrings, 1, getter_Copies(confirmText));
  if (NS_FAILED(rv))
    return false;
  bool returnVal = false;
  (void) DisplayConfirmationPrompt(m_msgWindow, confirmText.get(), &returnVal);
  return returnVal;
}

nsresult
nsMsgFilterAfterTheFact::DisplayConfirmationPrompt(nsIMsgWindow *msgWindow, const char16_t *confirmString, bool *confirmed)
{
  if (msgWindow)
  {
    nsCOMPtr <nsIDocShell> docShell;
    msgWindow->GetRootDocShell(getter_AddRefs(docShell));
    if (docShell)
    {
      nsCOMPtr<nsIPrompt> dialog(do_GetInterface(docShell));
      if (dialog && confirmString)
        dialog->Confirm(nullptr, confirmString, confirmed);
    }
  }
  return NS_OK;
}
