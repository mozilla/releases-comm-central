/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsOutlookMail_h___
#define nsOutlookMail_h___

#include "nsIMsgFolder.h"
#include "nsTArray.h"
#include "nsString.h"
#include "nsOutlookCompose.h"
#include "nsIFile.h"
#include "MapiApi.h"
#include "nsIAbDirectory.h"
#include "nsThreadUtils.h"

class nsOutlookMail {
 public:
  nsOutlookMail();
  ~nsOutlookMail();

  nsresult GetMailFolders(nsTArray<RefPtr<nsIImportMailboxDescriptor>>& boxes);
  nsresult GetAddressBooks(nsTArray<RefPtr<nsIImportABDescriptor>>& books);
  nsresult ImportMailbox(uint32_t* pDoneSoFar, bool* pAbort, int32_t index,
                         const char16_t* pName, nsIMsgFolder* pDest,
                         int32_t* pMsgCount);
  nsresult ImportAddresses(uint32_t* pCount, uint32_t* pTotal,
                           const char16_t* pName, uint32_t id,
                           nsIAbDirectory* pDirectory, nsString& errors);
  void OpenMessageStore(CMapiFolder* pNextFolder);
  static BOOL WriteData(nsIOutputStream* pDest, const char* pData,
                        uint32_t len);

 private:
  bool IsAddressBookNameUnique(nsString& name, nsString& list);
  void MakeAddressBookNameUnique(nsString& name, nsString& list);
  void SanitizeValue(nsString& val);
  void SplitString(nsString& val1, nsString& val2);
  bool BuildCard(const char16_t* pName, nsIAbDirectory* pDirectory,
                 nsIAbCard* newCard, LPMAPIPROP pUser);
  nsresult SetFieldValue(nsIAbCard* row, int32_t fieldNum,
                         const nsAString& value);
  nsresult CreateList(const nsString& pName, nsIAbDirectory* pDirectory,
                      LPMAPIPROP pUserList);

 private:
  bool m_gotFolders;
  bool m_gotAddresses;
  bool m_haveMapi;
  CMapiFolderList m_addressList;
  CMapiFolderList m_storeList;

 public:
  // Needed for the proxy class.
  CMapiApi m_mapi;
  CMapiFolderList m_folderList;
  LPMDB m_lpMdb;
};

class ImportMailboxRunnable : public mozilla::Runnable {
 public:
  ImportMailboxRunnable(uint32_t* pDoneSoFar, bool* pAbort, int32_t index,
                        const char16_t* pName, nsIMsgFolder* dstFolder,
                        int32_t* pMsgCount, nsOutlookMail* aCaller);
  NS_DECL_NSIRUNNABLE
  static nsresult ImportMessage(LPMESSAGE lpMsg, nsIOutputStream* pDest,
                                nsMsgDeliverMode mode);
  nsresult mResult;

 private:
  nsOutlookMail* mCaller;
  uint32_t* mDoneSoFar;
  bool* mAbort;
  int32_t mIndex;
  const char16_t* mName;
  nsCOMPtr<nsIFile> mMessageFile;
  nsCOMPtr<nsIMsgFolder> mDstFolder;
  int32_t* mMsgCount;
};

#endif /* nsOutlookMail_h___ */
