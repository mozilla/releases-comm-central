/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
   Interface for representing News folders.
*/

#ifndef nsMsgNewsFolder_h__
#define nsMsgNewsFolder_h__

#include "mozilla/Attributes.h"
#include "nsMsgDBFolder.h"
#include "nsIFile.h"
#include "nsINntpIncomingServer.h" // need this for the IID
#include "nsNewsUtils.h"
#include "nsMsgKeySet.h"
#include "nsIMsgNewsFolder.h"
#include "nsCOMPtr.h"
#include "nsIMsgFilterService.h"
#include "nsIArray.h"

class nsMsgNewsFolder : public nsMsgDBFolder, public nsIMsgNewsFolder
{
public:
  nsMsgNewsFolder(void);

  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_NSIMSGNEWSFOLDER

  // nsIUrlListener method
  NS_IMETHOD OnStopRunningUrl(nsIURI * aUrl, nsresult aExitCode) override;
  // nsIMsgFolder methods:
  NS_IMETHOD GetSubFolders(nsISimpleEnumerator **aResult) override;

  NS_IMETHOD GetMessages(nsISimpleEnumerator **result) override;
  NS_IMETHOD UpdateFolder(nsIMsgWindow *aWindow) override;

  NS_IMETHOD CreateSubfolder(const nsAString& folderName,
                             nsIMsgWindow *msgWindow) override;

  NS_IMETHOD Delete() override;
  NS_IMETHOD Rename(const nsAString& newName,
                     nsIMsgWindow *msgWindow) override;

  NS_IMETHOD GetAbbreviatedName(nsAString& aAbbreviatedName) override;

  NS_IMETHOD GetFolderURL(nsACString& url) override;

  NS_IMETHOD GetExpungedBytesCount(int64_t *count);
  NS_IMETHOD GetDeletable(bool *deletable) override;

  NS_IMETHOD RefreshSizeOnDisk();

  NS_IMETHOD GetSizeOnDisk(int64_t *size) override;

  NS_IMETHOD GetDBFolderInfoAndDB(nsIDBFolderInfo **folderInfo,
                                  nsIMsgDatabase **db) override;

  NS_IMETHOD DeleteMessages(nsIArray *messages,
                            nsIMsgWindow *msgWindow, bool deleteStorage,
                            bool isMove, nsIMsgCopyServiceListener* listener, 
                            bool allowUndo) override;
  NS_IMETHOD GetNewMessages(nsIMsgWindow *aWindow,
                            nsIUrlListener *aListener) override;

  NS_IMETHOD GetCanSubscribe(bool *aResult) override;
  NS_IMETHOD GetCanFileMessages(bool *aResult) override;
  NS_IMETHOD GetCanCreateSubfolders(bool *aResult) override;
  NS_IMETHOD GetCanRename(bool *aResult) override;
  NS_IMETHOD GetCanCompact(bool *aResult) override;
  NS_IMETHOD OnReadChanged(nsIDBChangeListener * aInstigator) override;

  NS_IMETHOD DownloadMessagesForOffline(nsIArray *messages,
                                        nsIMsgWindow *window) override;
  NS_IMETHOD Compact(nsIUrlListener *aListener,
                     nsIMsgWindow *aMsgWindow) override;
  NS_IMETHOD DownloadAllForOffline(nsIUrlListener *listener,
                                   nsIMsgWindow *msgWindow) override;
  NS_IMETHOD GetSortOrder(int32_t *order) override;
  NS_IMETHOD SetSortOrder(int32_t order) override;

  NS_IMETHOD Shutdown(bool shutdownChildren) override;

  NS_IMETHOD GetFilterList(nsIMsgWindow *aMsgWindow,
                           nsIMsgFilterList **aFilterList) override;
  NS_IMETHOD GetEditableFilterList(nsIMsgWindow *aMsgWindow,
                                   nsIMsgFilterList **aFilterList) override;
  NS_IMETHOD SetFilterList(nsIMsgFilterList *aFilterList) override;
  NS_IMETHOD SetEditableFilterList(nsIMsgFilterList *aFilterList) override;
  NS_IMETHOD ApplyRetentionSettings() override;

protected:
  virtual ~nsMsgNewsFolder();
  // helper routine to parse the URI and update member variables
  nsresult AbbreviatePrettyName(nsAString& prettyName, int32_t fullwords);
  nsresult ParseFolder(nsIFile *path);
  nsresult CreateSubFolders(nsIFile *path);
  nsresult AddDirectorySeparator(nsIFile *path);
  nsresult GetDatabase() override;
  virtual nsresult CreateChildFromURI(const nsCString &uri,
                                      nsIMsgFolder **folder) override;

  nsresult LoadNewsrcFileAndCreateNewsgroups();
  int32_t RememberLine(const nsACString& line);
  nsresult RememberUnsubscribedGroup(const nsACString& newsgroup, const nsACString& setStr);
  nsresult ForgetLine(void);
  nsresult GetNewsMessages(nsIMsgWindow *aMsgWindow, bool getOld, nsIUrlListener *aListener);

  int32_t HandleNewsrcLine(const char * line, uint32_t line_size);
  virtual void GetIncomingServerType(nsCString& serverType) override
  {
    serverType.AssignLiteral("nntp");
  }
  virtual nsresult CreateBaseMessageURI(const nsACString& aURI) override;

protected:
  int64_t mExpungedBytes;
  bool mGettingNews;
  bool mInitialized;
  bool m_downloadMessageForOfflineUse;
  bool m_downloadingMultipleMessages;

  nsCString mOptionLines;
  nsCString mUnsubscribedNewsgroupLines;
  nsMsgKeySet *mReadSet;

  nsCOMPtr<nsIFile> mNewsrcFilePath;

  // used for auth news
  nsCString mGroupUsername;
  nsCString mGroupPassword;

  // the name of the newsgroup.
  nsCString mRawName;
  int32_t mSortOrder;

private:
  /**
   * Constructs a signon url for use in login manager.
   *
   * @param ref    The URI ref (should be null unless working with legacy).
   * @param result The result of the string
   */
  nsresult CreateNewsgroupUrlForSignon(const char *ref, nsAString &result);
  nsCOMPtr <nsIMsgFilterList> mFilterList;
};

#endif // nsMsgNewsFolder_h__
