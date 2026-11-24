/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMsgCopy.h"

#include "nsCOMPtr.h"
#include "nsISupports.h"
#include "nsIThread.h"
#include "nscore.h"
#include "mozilla/RefPtr.h"
#include "nsMsgFolderFlags.h"
#include "nsMsgMessageFlags.h"
#include "nsIMsgFolder.h"
#include "nsIMsgAccountManager.h"
#include "nsIMsgFolder.h"
#include "nsIMsgIncomingServer.h"
#include "nsISupports.h"
#include "nsIURL.h"
#include "nsNetCID.h"
#include "nsMsgCompUtils.h"
#include "prcmon.h"
#include "nsIMsgImapMailFolder.h"
#include "nsThreadUtils.h"
#include "nsIMsgProgress.h"
#include "prmem.h"
#include "nsServiceManagerUtils.h"
#include "nsMsgUtils.h"
#include "nsIURIMutator.h"
#include "mozilla/Components.h"

////////////////////////////////////////////////////////////////////////////////////
// This is the listener class for the copy operation. We have to create this
// class to listen for message copy completion and eventually notify the caller
////////////////////////////////////////////////////////////////////////////////////
NS_IMPL_ISUPPORTS(CopyListener, nsIMsgCopyServiceListener)

CopyListener::CopyListener(void) { mCopyInProgress = false; }

CopyListener::~CopyListener(void) {}

nsresult CopyListener::OnStartCopy() {
#ifdef NS_DEBUG
  printf("CopyListener::OnStartCopy()\n");
#endif

  if (mComposeAndSend) mComposeAndSend->NotifyListenerOnStartCopy();
  return NS_OK;
}

nsresult CopyListener::OnProgress(uint32_t aProgress, uint32_t aProgressMax) {
#ifdef NS_DEBUG
  printf("CopyListener::OnProgress() %d of %d\n", aProgress, aProgressMax);
#endif

  if (mComposeAndSend)
    mComposeAndSend->NotifyListenerOnProgressCopy(aProgress, aProgressMax);

  return NS_OK;
}

nsresult CopyListener::SetMessageKey(nsMsgKey aMessageKey) {
  if (mComposeAndSend) mComposeAndSend->SetMessageKey(aMessageKey);
  return NS_OK;
}

NS_IMETHODIMP
CopyListener::GetMessageId(nsACString& aMessageId) {
  if (mComposeAndSend) mComposeAndSend->GetMessageId(aMessageId);
  return NS_OK;
}

nsresult CopyListener::OnStopCopy(nsresult aStatus) {
  if (NS_SUCCEEDED(aStatus)) {
#ifdef NS_DEBUG
    printf("CopyListener: SUCCESSFUL ON THE COPY OPERATION!\n");
#endif
  } else {
#ifdef NS_DEBUG
    printf("CopyListener: COPY OPERATION FAILED!\n");
#endif
  }

  if (mCopyInProgress) {
    PR_CEnterMonitor(this);
    PR_CNotifyAll(this);
    mCopyInProgress = false;
    PR_CExitMonitor(this);
  }
  if (mComposeAndSend) mComposeAndSend->NotifyListenerOnStopCopy(aStatus);

  return NS_OK;
}

nsresult CopyListener::SetMsgComposeAndSendObject(nsIMsgSend* obj) {
  if (obj) mComposeAndSend = obj;

  return NS_OK;
}

////////////////////////////////////////////////////////////////////////////////////
// END  END  END  END  END  END  END  END  END  END  END  END  END  END  END
// This is the listener class for the copy operation. We have to create this
// class to listen for message copy completion and eventually notify the caller
////////////////////////////////////////////////////////////////////////////////////

NS_IMPL_ISUPPORTS(nsMsgCopy, nsIMsgCopy)

nsMsgCopy::nsMsgCopy() { mSavePref = nullptr; }

nsMsgCopy::~nsMsgCopy() { PR_Free(mSavePref); }

NS_IMETHODIMP
nsMsgCopy::StartCopyOperation(nsIMsgIdentity* aUserIdentity, nsIFile* aFile,
                              nsMsgDeliverMode aMode, nsIMsgSend* aMsgSendObj,
                              const nsACString& aSavePref,
                              nsIMsgDBHdr* aMsgToReplace) {
  nsCOMPtr<nsIMsgFolder> dstFolder;
  bool isDraft = false;
  uint32_t msgFlags = nsMsgMessageFlags::Read;
  nsresult rv;

  if (!aMsgSendObj) return NS_ERROR_INVALID_ARG;

  // Store away the server location...
  if (!aSavePref.IsEmpty()) mSavePref = ToNewCString(aSavePref);

  //
  // Vars for implementation...
  //

  // QueueForLater (Outbox)
  if (aMode == nsIMsgSend::nsMsgQueueForLater ||
      aMode == nsIMsgSend::nsMsgDeliverBackground) {
    rv = GetUnsentMessagesFolder(aUserIdentity, getter_AddRefs(dstFolder));
    isDraft = false;
    // Do not mark outgoing messages as read.
    msgFlags = 0;
  } else if (aMode == nsIMsgSend::nsMsgSaveAsDraft)  // SaveAsDraft (Drafts)
  {
    rv = GetDraftsFolder(aUserIdentity, getter_AddRefs(dstFolder));
    isDraft = true;
    // Do not mark drafts as read.
    msgFlags = 0;
  } else if (aMode ==
             nsIMsgSend::nsMsgSaveAsTemplate)  // SaveAsTemplate (Templates)
  {
    rv = GetTemplatesFolder(aUserIdentity, getter_AddRefs(dstFolder));
    // Mark saved templates as read.
    isDraft = false;
    msgFlags = nsMsgMessageFlags::Read;
  } else  // SaveInSentFolder (Sent) -  nsMsgDeliverNow or nsMsgSendUnsent
  {
    rv = GetSentFolder(aUserIdentity, getter_AddRefs(dstFolder));
    // Mark send messages as read.
    isDraft = false;
    msgFlags = nsMsgMessageFlags::Read;
  }

  NS_ENSURE_SUCCESS(rv, rv);
  NS_ENSURE_TRUE(dstFolder, NS_MSG_ERROR_FOLDER_MISSING);

  bool interactive = false;

  if (aMsgSendObj) {
    nsCOMPtr<nsIMsgProgress> progress;
    aMsgSendObj->GetProgress(getter_AddRefs(progress));
    if (progress) progress->GetInteractive(&interactive);
  }

  mDstFolder = dstFolder;
  return DoCopy(aFile, dstFolder, aMsgToReplace, isDraft, msgFlags, interactive,
                aMsgSendObj);
}

nsresult nsMsgCopy::DoCopy(nsIFile* aDiskFile, nsIMsgFolder* dstFolder,
                           nsIMsgDBHdr* aMsgToReplace, bool aIsDraft,
                           uint32_t aMsgFlags, bool interactive,
                           nsIMsgSend* aMsgSendObj) {
  nsresult rv = NS_OK;

  // Check sanity
  if ((!aDiskFile) || (!dstFolder)) return NS_ERROR_INVALID_ARG;

  // Call copyservice with dstFolder, disk file, and txnManager
  if (NS_SUCCEEDED(rv)) {
    RefPtr<CopyListener> copyListener = new CopyListener();
    if (!copyListener) return NS_ERROR_OUT_OF_MEMORY;

    copyListener->SetMsgComposeAndSendObject(aMsgSendObj);
    nsCOMPtr<nsIThread> thread;

    if (aIsDraft) {
      nsCOMPtr<nsIMsgImapMailFolder> imapFolder = do_QueryInterface(dstFolder);
      nsCOMPtr<nsIMsgAccountManager> accountManager =
          mozilla::components::AccountManager::Service();
      bool shutdownInProgress = false;
      rv = accountManager->GetShutdownInProgress(&shutdownInProgress);

      if (NS_SUCCEEDED(rv) && shutdownInProgress && imapFolder) {
        // set the following only when we were in the middle of shutdown
        // process
        copyListener->mCopyInProgress = true;
        thread = do_GetCurrentThread();
      }
    }
    nsCOMPtr<nsIMsgCopyService> copyService =
        mozilla::components::Copy::Service();
    rv = copyService->CopyFileMessage(aDiskFile, dstFolder, aMsgToReplace,
                                      aIsDraft, aMsgFlags, EmptyCString(),
                                      copyListener, interactive);
    // copyListener->mCopyInProgress can only be set when we are in the
    // middle of the shutdown process
    while (copyListener->mCopyInProgress) {
      PR_CEnterMonitor(copyListener);
      PR_CWait(copyListener, PR_MicrosecondsToInterval(1000UL));
      PR_CExitMonitor(copyListener);
      if (thread) NS_ProcessPendingEvents(thread);
    }
  }

  return rv;
}

NS_IMETHODIMP
nsMsgCopy::GetDstFolder(nsIMsgFolder** aDstFolder) {
  NS_ENSURE_ARG_POINTER(aDstFolder);
  NS_IF_ADDREF(*aDstFolder = mDstFolder);
  return NS_OK;
}

nsresult nsMsgCopy::GetUnsentMessagesFolder(nsIMsgIdentity* userIdentity,
                                            nsIMsgFolder** folder) {
  nsresult ret = LocateMessageFolder(
      userIdentity, nsIMsgSend::nsMsgQueueForLater, mSavePref, folder);
  if (*folder) (*folder)->SetFlag(nsMsgFolderFlags::Queue);
  return ret;
}

nsresult nsMsgCopy::GetDraftsFolder(nsIMsgIdentity* userIdentity,
                                    nsIMsgFolder** folder) {
  nsresult ret = LocateMessageFolder(userIdentity, nsIMsgSend::nsMsgSaveAsDraft,
                                     mSavePref, folder);
  if (*folder) (*folder)->SetFlag(nsMsgFolderFlags::Drafts);
  return ret;
}

nsresult nsMsgCopy::GetTemplatesFolder(nsIMsgIdentity* userIdentity,
                                       nsIMsgFolder** folder) {
  nsresult ret = LocateMessageFolder(
      userIdentity, nsIMsgSend::nsMsgSaveAsTemplate, mSavePref, folder);
  if (*folder) (*folder)->SetFlag(nsMsgFolderFlags::Templates);
  return ret;
}

nsresult nsMsgCopy::GetSentFolder(nsIMsgIdentity* userIdentity,
                                  nsIMsgFolder** folder) {
  nsresult ret = LocateMessageFolder(userIdentity, nsIMsgSend::nsMsgDeliverNow,
                                     mSavePref, folder);
  if (*folder) {
    // If mSavePref is the same as the identity's fcc folder, set the sent flag.
    nsCString identityFccUri;
    userIdentity->GetFccFolderURI(identityFccUri);
    if (identityFccUri.Equals(mSavePref))
      (*folder)->SetFlag(nsMsgFolderFlags::SentMail);
  }
  return ret;
}

////////////////////////////////////////////////////////////////////////////////////
// Utility Functions for MsgFolders
////////////////////////////////////////////////////////////////////////////////////
nsresult LocateMessageFolder(nsIMsgIdentity* userIdentity,
                             nsMsgDeliverMode aFolderType,
                             const char* aFolderURI, nsIMsgFolder** msgFolder) {
  nsresult rv = NS_OK;

  if (!msgFolder) return NS_ERROR_NULL_POINTER;
  *msgFolder = nullptr;

  if (!aFolderURI || !*aFolderURI) return NS_ERROR_INVALID_ARG;

  // as long as it doesn't start with anyfolder://
  if (PL_strncasecmp(ANY_SERVER, aFolderURI, strlen(aFolderURI)) != 0) {
    nsCOMPtr<nsIMsgIncomingServer> server;
    rv = FindServerForFolderURI(nsDependentCString(aFolderURI),
                                getter_AddRefs(server));
    NS_ENSURE_SUCCESS(rv, rv);
    NS_ENSURE_TRUE(server, NS_MSG_ERROR_FOLDER_MISSING);
    rv = server->GetFolderFromURI(nsDependentCString(aFolderURI), msgFolder);
    NS_ENSURE_SUCCESS(rv, rv);
    return *msgFolder ? NS_OK : NS_MSG_ERROR_FOLDER_MISSING;
  } else {
    if (!userIdentity) return NS_ERROR_INVALID_ARG;

    nsCOMPtr<nsIMsgAccountManager> accountManager =
        mozilla::components::AccountManager::Service();
    // If any folder will do, go look for one.
    nsTArray<RefPtr<nsIMsgIncomingServer>> servers;
    rv = accountManager->GetServersForIdentity(userIdentity, servers);
    NS_ENSURE_SUCCESS(rv, rv);

    // Ok, we have to look through the servers and try to find the server that
    // has a valid folder of the type that interests us...
    for (auto inServer : servers) {
      // Now that we have the server...we need to get the named message folder

      // If aFolderURI is passed in, then the user has chosen a specific
      // mail folder to save the message, but if it is null, just find the
      // first one and make that work. The folder is specified as a URI, like
      // the following:
      //
      //   mailbox://nobody@Local Folders/Sent
      //                  imap://rhp@nsmail-2/Drafts
      //                  newsgroup://news.mozilla.org/netscape.test
      //
      nsCString serverURI;
      rv = inServer->GetServerURI(serverURI);
      if (NS_FAILED(rv) || serverURI.IsEmpty()) continue;

      nsCOMPtr<nsIMsgFolder> rootFolder;
      rv = inServer->GetRootFolder(getter_AddRefs(rootFolder));

      if (NS_FAILED(rv) || (!rootFolder)) continue;

      // use the defaults by getting the folder by flags
      if (aFolderType == nsIMsgSend::nsMsgQueueForLater ||
          aFolderType == nsIMsgSend::nsMsgDeliverBackground) {
        // QueueForLater (Outbox)
        rootFolder->GetFolderWithFlags(nsMsgFolderFlags::Queue, msgFolder);
      } else if (aFolderType ==
                 nsIMsgSend::nsMsgSaveAsDraft)  // SaveAsDraft (Drafts)
      {
        rootFolder->GetFolderWithFlags(nsMsgFolderFlags::Drafts, msgFolder);
      } else if (aFolderType ==
                 nsIMsgSend::nsMsgSaveAsTemplate)  // SaveAsTemplate (Templates)
      {
        rootFolder->GetFolderWithFlags(nsMsgFolderFlags::Templates, msgFolder);
      } else  // SaveInSentFolder (Sent) -  nsMsgDeliverNow or nsMsgSendUnsent
      {
        rootFolder->GetFolderWithFlags(nsMsgFolderFlags::SentMail, msgFolder);
      }

      if (*msgFolder) {
        return NS_OK;
      }
    }
  }
  return NS_ERROR_FAILURE;
}

//
// Figure out if a folder is local or not and return a boolean to
// say so.
//
nsresult MessageFolderIsLocal(nsIMsgIdentity* userIdentity,
                              nsMsgDeliverMode aFolderType,
                              const char* aFolderURI, bool* aResult) {
  nsresult rv;

  if (!aFolderURI) return NS_ERROR_NULL_POINTER;

  nsCOMPtr<nsIURL> url;
  rv = MsgNewStandardURL(nsDependentCString(aFolderURI), getter_AddRefs(url));
  if (NS_FAILED(rv)) return rv;

  /* mailbox:/ means its local (on disk) */
  rv = url->SchemeIs("mailbox", aResult);
  if (NS_FAILED(rv)) return rv;
  return NS_OK;
}
