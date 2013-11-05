/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsIRssService.h"
#include "nsRssIncomingServer.h"
#include "nsMsgFolderFlags.h"
#include "nsINewsBlogFeedDownloader.h"
#include "nsMsgBaseCID.h"
#include "nsIFile.h"
#include "nsIMsgFolderNotificationService.h"

#include "nsIMsgLocalMailFolder.h"
#include "nsIDBFolderInfo.h"
#include "nsServiceManagerUtils.h"
#include "nsComponentManagerUtils.h"
#include "nsArrayUtils.h"
#include "nsMsgUtils.h"

nsrefcnt nsRssIncomingServer::gInstanceCount    = 0;

NS_IMPL_ISUPPORTS_INHERITED3(nsRssIncomingServer,
                             nsMsgIncomingServer,
                             nsIRssIncomingServer,
                             nsIMsgFolderListener,
                             nsILocalMailIncomingServer)

nsRssIncomingServer::nsRssIncomingServer()
{
  m_canHaveFilters = true;

  if (gInstanceCount == 0)
  {
    nsresult rv;
    nsCOMPtr<nsIMsgFolderNotificationService> notifyService =
      do_GetService(NS_MSGNOTIFICATIONSERVICE_CONTRACTID, &rv);
    if (NS_SUCCEEDED(rv))
      notifyService->AddListener(this,
          nsIMsgFolderNotificationService::folderAdded |
          nsIMsgFolderNotificationService::folderDeleted |
          nsIMsgFolderNotificationService::folderMoveCopyCompleted |
          nsIMsgFolderNotificationService::folderRenamed);
  }

  gInstanceCount++;
}

nsRssIncomingServer::~nsRssIncomingServer()
{
  gInstanceCount--;

  if (gInstanceCount == 0)
  {
    nsresult rv;
    nsCOMPtr<nsIMsgFolderNotificationService> notifyService =
      do_GetService(NS_MSGNOTIFICATIONSERVICE_CONTRACTID, &rv);
    if (NS_SUCCEEDED(rv))
      notifyService->RemoveListener(this);
  }
}

nsresult nsRssIncomingServer::FillInDataSourcePath(const nsAString& aDataSourceName, nsIFile ** aLocation)
{
  nsresult rv;
  // start by gettting the local path for this server
  nsCOMPtr<nsIFile> localFile;
  rv = GetLocalPath(getter_AddRefs(localFile));
  NS_ENSURE_SUCCESS(rv, rv);

  // now append the name of the subscriptions data source
  rv = localFile->Append(aDataSourceName);
  NS_IF_ADDREF(*aLocation = localFile);
  return rv;
}

// nsIRSSIncomingServer methods
NS_IMETHODIMP nsRssIncomingServer::GetSubscriptionsDataSourcePath(nsIFile ** aLocation)
{
  return FillInDataSourcePath(NS_LITERAL_STRING("feeds.rdf"), aLocation);
}

NS_IMETHODIMP nsRssIncomingServer::GetFeedItemsDataSourcePath(nsIFile ** aLocation)
{
  return FillInDataSourcePath(NS_LITERAL_STRING("feeditems.rdf"), aLocation);
}

NS_IMETHODIMP nsRssIncomingServer::CreateDefaultMailboxes()
{
  // for RSS, all we have is Trash
  // XXX or should we be use Local Folders/Trash?
  return CreateLocalFolder(NS_LITERAL_STRING("Trash"));
}

NS_IMETHODIMP nsRssIncomingServer::SetFlagsOnDefaultMailboxes()
{
  nsCOMPtr<nsIMsgFolder> rootFolder;
  nsresult rv = GetRootFolder(getter_AddRefs(rootFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgLocalMailFolder> localFolder =
      do_QueryInterface(rootFolder, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  localFolder->SetFlagsOnDefaultMailboxes(nsMsgFolderFlags::Trash);
  return NS_OK;
}

NS_IMETHODIMP nsRssIncomingServer::PerformBiff(nsIMsgWindow *aMsgWindow)
{
  // Get the account root (server) folder and pass it on.
  nsCOMPtr<nsIMsgFolder> rootRSSFolder;
  GetRootMsgFolder(getter_AddRefs(rootRSSFolder));
  nsCOMPtr<nsIUrlListener> urlListener = do_QueryInterface(rootRSSFolder);
  GetNewMail(aMsgWindow, urlListener, rootRSSFolder, nullptr);
  return NS_OK;
}

NS_IMETHODIMP nsRssIncomingServer::GetNewMail(nsIMsgWindow *aMsgWindow, nsIUrlListener *aUrlListener,
                                              nsIMsgFolder *aFolder, nsIURI **_retval)
{
  // Pass the selected folder on to the downloader.
  NS_ENSURE_ARG_POINTER(aFolder);
  nsresult rv;
  nsCOMPtr <nsINewsBlogFeedDownloader> rssDownloader = do_GetService("@mozilla.org/newsblog-feed-downloader;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  rssDownloader->DownloadFeed(nullptr, aFolder, false, nullptr, aUrlListener, aMsgWindow);
  return NS_OK;
}

NS_IMETHODIMP nsRssIncomingServer::GetAccountManagerChrome(nsAString& aResult)
{
  aResult.AssignLiteral("am-newsblog.xul");
  return NS_OK;
}

NS_IMETHODIMP nsRssIncomingServer::GetOfflineSupportLevel(int32_t *aSupportLevel)
{
  NS_ENSURE_ARG_POINTER(aSupportLevel);
  *aSupportLevel = OFFLINE_SUPPORT_LEVEL_NONE;
  return NS_OK;
}

NS_IMETHODIMP nsRssIncomingServer::GetSupportsDiskSpace(bool *aSupportsDiskSpace)
{
  NS_ENSURE_ARG_POINTER(aSupportsDiskSpace);
  *aSupportsDiskSpace = true;
  return NS_OK;
}

NS_IMETHODIMP nsRssIncomingServer::GetServerRequiresPasswordForBiff(bool *aServerRequiresPasswordForBiff)
{
  NS_ENSURE_ARG_POINTER(aServerRequiresPasswordForBiff);
  *aServerRequiresPasswordForBiff = false;  // for rss folders, we don't require a password
  return NS_OK;
}

NS_IMETHODIMP nsRssIncomingServer::GetCanSearchMessages(bool *canSearchMessages)
{
  NS_ENSURE_ARG_POINTER(canSearchMessages);
  *canSearchMessages = true;
  return NS_OK;
}

NS_IMETHODIMP nsRssIncomingServer::MsgAdded(nsIMsgDBHdr *aMsg)
{
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsRssIncomingServer::MsgsClassified(nsIArray *aMsgs,
                                                  bool aJunkProcessed,
                                                  bool aTraitProcessed)
{
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsRssIncomingServer::MsgsDeleted(nsIArray *aMsgs)
{
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsRssIncomingServer::MsgsMoveCopyCompleted(
  bool aMove, nsIArray *aSrcMsgs, nsIMsgFolder *aDestFolder,
  nsIArray *aDestMsgs)
{
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsRssIncomingServer::MsgKeyChanged(nsMsgKey aOldKey,
                                                 nsIMsgDBHdr *aNewHdr)
{
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsRssIncomingServer::FolderAdded(nsIMsgFolder *aFolder)
{
  // Nothing to do. Not necessary for new folder adds, as a new folder never
  // has a subscription.
  return NS_OK;
}

NS_IMETHODIMP nsRssIncomingServer::FolderDeleted(nsIMsgFolder *aFolder)
{
  // Not necessary for folder deletes, which are move to Trash and handled by
  // movecopy. Virtual folder or trash folder deletes send a folderdeleted,
  // but these should have no subscriptions already.
  return NS_OK;
}

NS_IMETHODIMP nsRssIncomingServer::FolderMoveCopyCompleted(bool aMove, nsIMsgFolder *aSrcFolder, nsIMsgFolder *aDestFolder)
{
  return FolderChanged(aDestFolder, aSrcFolder);
}

NS_IMETHODIMP nsRssIncomingServer::FolderRenamed(nsIMsgFolder *aOrigFolder, nsIMsgFolder *aNewFolder)
{
  return FolderChanged(aNewFolder, nullptr);
}

NS_IMETHODIMP nsRssIncomingServer::ItemEvent(nsISupports *aItem, const nsACString &aEvent, nsISupports *aData)
{
  return NS_ERROR_NOT_IMPLEMENTED;
}

nsresult nsRssIncomingServer::FolderChanged(nsIMsgFolder *aFolder, nsIMsgFolder *aOrigFolder)
{
  if (!aFolder)
    return NS_OK;

  nsCOMPtr<nsIMsgIncomingServer> server;
  nsresult rv = aFolder->GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString type;
  rv = server->GetType(type);
  NS_ENSURE_SUCCESS(rv, rv);

  if (!type.EqualsLiteral("rss"))
    return rv;

  nsCOMPtr <nsINewsBlogFeedDownloader> rssDownloader = do_GetService("@mozilla.org/newsblog-feed-downloader;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  rssDownloader->UpdateSubscriptionsDS(aFolder, aOrigFolder);
  return rv;
}

NS_IMETHODIMP
nsRssIncomingServer::GetSortOrder(int32_t* aSortOrder)
{
  NS_ENSURE_ARG_POINTER(aSortOrder);
  *aSortOrder = 400000000;
  return NS_OK;
}
