/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _nsMsgCopy_H_
#define _nsMsgCopy_H_

#include "mozilla/Attributes.h"
#include "nscore.h"
#include "nsIFile.h"
#include "nsIMsgHdr.h"
#include "nsIMsgFolder.h"
#include "nsITransactionManager.h"
#include "nsIMsgCopy.h"
#include "nsIMsgCopyServiceListener.h"
#include "nsIMsgCopyService.h"

// Forward declarations...
class nsMsgCopy;

////////////////////////////////////////////////////////////////////////////////////
// This is the listener class for the copy operation. We have to create this
// class to listen for message copy completion and eventually notify the caller
////////////////////////////////////////////////////////////////////////////////////
class CopyListener : public nsIMsgCopyServiceListener {
 public:
  CopyListener(void);

  // nsISupports interface
  NS_DECL_THREADSAFE_ISUPPORTS

  NS_IMETHOD OnStartCopy() override;

  NS_IMETHOD OnProgress(uint32_t aProgress, uint32_t aProgressMax) override;

  NS_IMETHOD SetMessageKey(nsMsgKey aMessageKey) override;

  NS_IMETHOD GetMessageId(nsACString& aMessageId) override;

  NS_IMETHOD OnStopCopy(nsresult aStatus) override;

  NS_IMETHOD SetMsgComposeAndSendObject(nsIMsgSend* obj);

  bool mCopyInProgress;

 private:
  virtual ~CopyListener();
  nsCOMPtr<nsIMsgSend> mComposeAndSend;
};

//
// This is a class that deals with processing remote attachments. It implements
// an nsIStreamListener interface to deal with incoming data
//
class nsMsgCopy : public nsIMsgCopy, public nsIUrlListener {
 public:
  nsMsgCopy();

  // nsISupports interface
  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGCOPY
  NS_DECL_NSIURLLISTENER

  //////////////////////////////////////////////////////////////////////
  // Object methods...
  //////////////////////////////////////////////////////////////////////
  //
  nsresult DoCopy(nsIFile* aDiskFile, nsIMsgFolder* dstFolder,
                  nsIMsgDBHdr* aMsgToReplace, bool aIsDraft, uint32_t aMsgFlags,
                  nsIMsgWindow* msgWindow, nsIMsgSend* aMsgSendObj);

  nsresult GetUnsentMessagesFolder(nsIMsgIdentity* userIdentity,
                                   nsIMsgFolder** msgFolder, bool* waitForUrl);
  nsresult GetDraftsFolder(nsIMsgIdentity* userIdentity,
                           nsIMsgFolder** msgFolder, bool* waitForUrl);
  nsresult GetTemplatesFolder(nsIMsgIdentity* userIdentity,
                              nsIMsgFolder** msgFolder, bool* waitForUrl);
  nsresult GetSentFolder(nsIMsgIdentity* userIdentity, nsIMsgFolder** msgFolder,
                         bool* waitForUrl);
  nsresult CreateIfMissing(nsIMsgFolder** folder, bool* waitForUrl);

  //
  // Vars for implementation...
  //
  nsIFile* mFile;  // the file we are sending...
  nsMsgDeliverMode mMode;
  nsCOMPtr<nsIMsgFolder> mDstFolder;
  nsCOMPtr<nsIMsgDBHdr> mMsgToReplace;
  bool mIsDraft;
  uint32_t mMsgFlags;
  nsCOMPtr<nsIMsgSend> mMsgSendObj;
  char* mSavePref;

 private:
  virtual ~nsMsgCopy();
};

// Useful function for the back end...
nsresult LocateMessageFolder(nsIMsgIdentity* userIdentity,
                             nsMsgDeliverMode aFolderType, const char* aSaveURI,
                             nsIMsgFolder** msgFolder);

nsresult MessageFolderIsLocal(nsIMsgIdentity* userIdentity,
                              nsMsgDeliverMode aFolderType,
                              const char* aSaveURI, bool* aResult);

#endif /* _nsMsgCopy_H_ */
