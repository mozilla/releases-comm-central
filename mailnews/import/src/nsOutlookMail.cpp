/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
  Outlook mail import
*/

#include "nsCOMPtr.h"
#include "nscore.h"
#include "nsMsgUtils.h"
#include "nsIImportService.h"
#include "nsIImportFieldMap.h"
#include "nsIImportMailboxDescriptor.h"
#include "nsIImportABDescriptor.h"
#include "nsOutlookStringBundle.h"
#include "nsAbBaseCID.h"
#include "nsIAbCard.h"
#include "mdb.h"
#include "ImportDebug.h"
#include "nsOutlookMail.h"
#include "nsUnicharUtils.h"
#include "nsIOutputStream.h"
#include "nsIMsgPluggableStore.h"
#include "nsIMsgHdr.h"
#include "nsIMsgFolder.h"
#include "nsMsgI18N.h"
#include "nsNetUtil.h"

/* ------------ Address book stuff ----------------- */
typedef struct {
  int32_t mozField;
  int32_t multiLine;
  ULONG mapiTag;
} MAPIFields;

/*
  Fields in MAPI, not in Mozilla
  PR_OFFICE_LOCATION
  FIX - PR_BIRTHDAY - stored as PT_SYSTIME - FIX to extract for moz address book
  birthday PR_DISPLAY_NAME_PREFIX - Mr., Mrs. Dr., etc. PR_SPOUSE_NAME PR_GENDER
  - integer, not text FIX - PR_CONTACT_EMAIL_ADDRESSES - multiuline strings for
  email addresses, needs parsing to get secondary email address for mozilla
*/

#define kIsMultiLine -2
#define kNoMultiLine -1

static MAPIFields gMapiFields[] = {
    {35, kIsMultiLine, PR_BODY},
    {6, kNoMultiLine, PR_BUSINESS_TELEPHONE_NUMBER},
    {7, kNoMultiLine, PR_HOME_TELEPHONE_NUMBER},
    {25, kNoMultiLine, PR_COMPANY_NAME},
    {23, kNoMultiLine, PR_TITLE},
    {10, kNoMultiLine, PR_CELLULAR_TELEPHONE_NUMBER},
    {9, kNoMultiLine, PR_PAGER_TELEPHONE_NUMBER},
    {8, kNoMultiLine, PR_BUSINESS_FAX_NUMBER},
    {8, kNoMultiLine, PR_HOME_FAX_NUMBER},
    {22, kNoMultiLine, PR_COUNTRY},
    {19, kNoMultiLine, PR_LOCALITY},
    {20, kNoMultiLine, PR_STATE_OR_PROVINCE},
    {17, 18, PR_STREET_ADDRESS},
    {21, kNoMultiLine, PR_POSTAL_CODE},
    {27, kNoMultiLine, PR_PERSONAL_HOME_PAGE},
    {26, kNoMultiLine, PR_BUSINESS_HOME_PAGE},
    {13, kNoMultiLine, PR_HOME_ADDRESS_CITY},
    {16, kNoMultiLine, PR_HOME_ADDRESS_COUNTRY},
    {15, kNoMultiLine, PR_HOME_ADDRESS_POSTAL_CODE},
    {14, kNoMultiLine, PR_HOME_ADDRESS_STATE_OR_PROVINCE},
    {11, 12, PR_HOME_ADDRESS_STREET},
    {24, kNoMultiLine, PR_DEPARTMENT_NAME}};
/* ---------------------------------------------------- */

#define kCopyBufferSize (16 * 1024)

// The email address in Outlook Contacts doesn't have a named
// property,  we need to use this mapi name ID to access the email
// The MAPINAMEID for email address has ulKind=MNID_ID
// Outlook stores each email address in two IDs,  32899/32900 for Email1
// 32915/32916 for Email2, 32931/32932 for Email3
// Current we use OUTLOOK_EMAIL1_MAPI_ID1 for primary email
// OUTLOOK_EMAIL2_MAPI_ID1 for secondary email
#define OUTLOOK_EMAIL1_MAPI_ID1 32899
#define OUTLOOK_EMAIL1_MAPI_ID2 32900
#define OUTLOOK_EMAIL2_MAPI_ID1 32915
#define OUTLOOK_EMAIL2_MAPI_ID2 32916
#define OUTLOOK_EMAIL3_MAPI_ID1 32931
#define OUTLOOK_EMAIL3_MAPI_ID2 32932

nsOutlookMail::nsOutlookMail() {
  m_gotAddresses = false;
  m_gotFolders = false;
  m_haveMapi = CMapiApi::LoadMapi();
  m_lpMdb = NULL;
}

nsOutlookMail::~nsOutlookMail() {
  //  EmptyAttachments();
}

nsresult nsOutlookMail::GetMailFolders(
    nsTArray<RefPtr<nsIImportMailboxDescriptor>>& boxes) {
  if (!m_haveMapi) {
    IMPORT_LOG0("GetMailFolders called before Mapi is initialized\n");
    return NS_ERROR_FAILURE;
  }
  nsresult rv;
  boxes.Clear();

  nsCOMPtr<nsIImportService> impSvc(
      do_GetService(NS_IMPORTSERVICE_CONTRACTID, &rv));
  if (NS_FAILED(rv)) return rv;

  m_gotFolders = true;

  m_folderList.ClearAll();

  m_mapi.Initialize();
  m_mapi.LogOn();

  if (m_storeList.GetSize() == 0) m_mapi.IterateStores(m_storeList);

  int i = 0;
  CMapiFolder* pFolder;
  if (m_storeList.GetSize() > 1) {
    while ((pFolder = m_storeList.GetItem(i))) {
      CMapiFolder* pItem = new CMapiFolder(pFolder);
      pItem->SetDepth(1);
      m_folderList.AddItem(pItem);
      if (!m_mapi.GetStoreFolders(pItem->GetCBEntryID(), pItem->GetEntryID(),
                                  m_folderList, 2)) {
        IMPORT_LOG1("GetStoreFolders for index %d failed.\n", i);
      }
      i++;
    }
  } else {
    if ((pFolder = m_storeList.GetItem(i))) {
      if (!m_mapi.GetStoreFolders(pFolder->GetCBEntryID(),
                                  pFolder->GetEntryID(), m_folderList, 1)) {
        IMPORT_LOG1("GetStoreFolders for index %d failed.\n", i);
      }
    }
  }

  // Create the mailbox descriptors for the list of folders
  nsCOMPtr<nsIImportMailboxDescriptor> pID;
  nsString name;
  nsString uniName;

  for (i = 0; i < m_folderList.GetSize(); i++) {
    pFolder = m_folderList.GetItem(i);
    rv = impSvc->CreateNewMailboxDescriptor(getter_AddRefs(pID));
    if (NS_SUCCEEDED(rv)) {
      pID->SetDepth(pFolder->GetDepth());
      pID->SetIdentifier(i);

      pFolder->GetDisplayName(name);
      pID->SetDisplayName(name.get());

      pID->SetSize(1000);
      boxes.AppendElement(pID);
    }
  }
  return NS_OK;
}

bool nsOutlookMail::IsAddressBookNameUnique(nsString& name, nsString& list) {
  nsString usedName;
  usedName.Append('[');
  usedName.Append(name);
  usedName.AppendLiteral("],");

  return list.Find(usedName) == -1;
}

void nsOutlookMail::MakeAddressBookNameUnique(nsString& name, nsString& list) {
  nsString newName;
  int idx = 1;

  newName = name;
  while (!IsAddressBookNameUnique(newName, list)) {
    newName = name;
    newName.Append(char16_t(' '));
    newName.AppendInt((int32_t)idx);
    idx++;
  }

  name = newName;
  list.Append('[');
  list.Append(name);
  list.AppendLiteral("],");
}

nsresult nsOutlookMail::GetAddressBooks(
    nsTArray<RefPtr<nsIImportABDescriptor>>& books) {
  books.Clear();
  if (!m_haveMapi) {
    IMPORT_LOG0("GetAddressBooks called before Mapi is initialized\n");
    return NS_ERROR_FAILURE;
  }
  nsresult rv;
  nsCOMPtr<nsIImportService> impSvc(
      do_GetService(NS_IMPORTSERVICE_CONTRACTID, &rv));
  if (NS_FAILED(rv)) return rv;

  m_gotAddresses = true;

  m_addressList.ClearAll();
  m_mapi.Initialize();
  m_mapi.LogOn();
  if (m_storeList.GetSize() == 0) m_mapi.IterateStores(m_storeList);

  int i = 0;
  CMapiFolder* pFolder;
  if (m_storeList.GetSize() > 1) {
    while ((pFolder = m_storeList.GetItem(i))) {
      CMapiFolder* pItem = new CMapiFolder(pFolder);
      pItem->SetDepth(1);
      m_addressList.AddItem(pItem);
      if (!m_mapi.GetStoreAddressFolders(pItem->GetCBEntryID(),
                                         pItem->GetEntryID(), m_addressList)) {
        IMPORT_LOG1("GetStoreAddressFolders for index %d failed.\n", i);
      }
      i++;
    }
  } else {
    if ((pFolder = m_storeList.GetItem(i))) {
      if (!m_mapi.GetStoreAddressFolders(
              pFolder->GetCBEntryID(), pFolder->GetEntryID(), m_addressList)) {
        IMPORT_LOG1("GetStoreFolders for index %d failed.\n", i);
      }
    }
  }

  // Create the mailbox descriptors for the list of folders
  nsCOMPtr<nsIImportABDescriptor> pID;
  nsString name;
  nsString list;

  for (i = 0; i < m_addressList.GetSize(); i++) {
    pFolder = m_addressList.GetItem(i);
    if (!pFolder->IsStore()) {
      rv = impSvc->CreateNewABDescriptor(getter_AddRefs(pID));
      if (NS_SUCCEEDED(rv)) {
        pID->SetIdentifier(i);
        pFolder->GetDisplayName(name);
        MakeAddressBookNameUnique(name, list);
        pID->SetPreferredName(name);
        pID->SetSize(100);
        books.AppendElement(pID);
      }
    }
  }
  return NS_OK;
}

void nsOutlookMail::OpenMessageStore(CMapiFolder* pNextFolder) {
  // Open the store specified
  if (pNextFolder->IsStore()) {
    if (!m_mapi.OpenStore(pNextFolder->GetCBEntryID(),
                          pNextFolder->GetEntryID(), &m_lpMdb)) {
      m_lpMdb = NULL;
      IMPORT_LOG0("CMapiApi::OpenStore failed\n");
    }

    return;
  }

  // Check to see if we should open the one and only store
  if (!m_lpMdb) {
    if (m_storeList.GetSize() == 1) {
      CMapiFolder* pFolder = m_storeList.GetItem(0);
      if (pFolder) {
        if (!m_mapi.OpenStore(pFolder->GetCBEntryID(), pFolder->GetEntryID(),
                              &m_lpMdb)) {
          m_lpMdb = NULL;
          IMPORT_LOG0("CMapiApi::OpenStore failed\n");
        }
      } else {
        IMPORT_LOG0("Error retrieving the one & only message store\n");
      }
    } else {
      IMPORT_LOG0(
          "*** Error importing a folder without a valid message store\n");
    }
  }
}

// Roles and responsibilities:
// nsOutlookMail
//   - Connect to Outlook
//   - Enumerate the mailboxes
//   - Iterate the mailboxes
//   - For each mail, create one nsOutlookCompose object
//   - For each mail, create one CMapiMessage object
//
// nsOutlookCompose
//   - Establish a TB session
//   - Connect to all required services
//   - Perform the composition of the RC822 document from the data gathered by
//   CMapiMessage
//   - Save the composed message to the TB mailbox
//   - Ensure the proper cleanup
//
// CMapiMessage
//   - Encapsulate the MAPI message interface
//   - Gather the information required to (re)compose the message

ImportMailboxRunnable::ImportMailboxRunnable(
    uint32_t* pDoneSoFar, bool* pAbort, int32_t index, const char16_t* pName,
    nsIMsgFolder* dstFolder, int32_t* pMsgCount, nsOutlookMail* aCaller)
    : mozilla::Runnable("ImportMailboxRunnable"),
      mResult(NS_OK),
      mCaller(aCaller),
      mDoneSoFar(pDoneSoFar),
      mAbort(pAbort),
      mIndex(index),
      mName(pName),
      mDstFolder(dstFolder),
      mMsgCount(pMsgCount) {}
NS_IMETHODIMP ImportMailboxRunnable::Run() {
  if ((mIndex < 0) || (mIndex >= mCaller->m_folderList.GetSize())) {
    IMPORT_LOG0("*** Bad mailbox identifier, unable to import\n");
    *mAbort = true;
    mResult = NS_ERROR_FAILURE;
    return NS_OK;  // Sync runnable must return OK.
  }

  int32_t dummyMsgCount = 0;
  if (mMsgCount)
    *mMsgCount = 0;
  else
    mMsgCount = &dummyMsgCount;

  CMapiFolder* pFolder = mCaller->m_folderList.GetItem(mIndex);
  mCaller->OpenMessageStore(pFolder);
  if (!mCaller->m_lpMdb) {
    IMPORT_LOG1("*** Unable to obtain mapi message store for mailbox: %S\n",
                mName);
    mResult = NS_ERROR_FAILURE;
    return NS_OK;  // Sync runnable must return OK.
  }

  if (pFolder->IsStore()) return NS_OK;

  // now what?
  CMapiFolderContents contents(mCaller->m_lpMdb, pFolder->GetCBEntryID(),
                               pFolder->GetEntryID());

  BOOL done = FALSE;
  ULONG cbEid;
  LPENTRYID lpEid;
  ULONG oType;
  LPMESSAGE lpMsg = nullptr;
  ULONG totalCount;
  double doneCalc;

  nsCOMPtr<nsIOutputStream> outputStream;
  nsCOMPtr<nsIMsgPluggableStore> msgStore;
  nsresult rv = mDstFolder->GetMsgStore(getter_AddRefs(msgStore));
  NS_ENSURE_SUCCESS(rv, rv);

  while (!done) {
    if (!contents.GetNext(&cbEid, &lpEid, &oType, &done)) {
      IMPORT_LOG1("*** Error iterating mailbox: %S\n", mName);
      mResult = NS_ERROR_FAILURE;
      return NS_OK;  // Sync runnable must return OK.
    }

    nsCOMPtr<nsIMsgDBHdr> msgHdr;
    bool reusable;

    rv = msgStore->GetNewMsgOutputStream(mDstFolder, getter_AddRefs(msgHdr),
                                         &reusable,
                                         getter_AddRefs(outputStream));
    if (NS_FAILED(rv)) {
      IMPORT_LOG1("*** Error getting nsIOutputStream of mailbox: %S\n", mName);
      mResult = rv;
      return NS_OK;  // Sync runnable must return OK.
    }
    totalCount = contents.GetCount();
    doneCalc = *mMsgCount;
    doneCalc /= totalCount;
    doneCalc *= 1000;
    if (mDoneSoFar) {
      *mDoneSoFar = (uint32_t)doneCalc;
      if (*mDoneSoFar > 1000) *mDoneSoFar = 1000;
    }

    if (!done && (oType == MAPI_MESSAGE)) {
      if (!mCaller->m_mapi.OpenMdbEntry(mCaller->m_lpMdb, cbEid, lpEid,
                                        (LPUNKNOWN*)&lpMsg)) {
        IMPORT_LOG1("*** Error opening messages in mailbox: %S\n", mName);
        mResult = NS_ERROR_FAILURE;
        return NS_OK;  // Sync runnable must return OK.
      }

      // See if it's a drafts folder. Outlook doesn't allow drafts
      // folder to be configured so it's ok to hard code it here.
      nsAutoString folderName(mName);
      nsMsgDeliverMode mode = nsIMsgSend::nsMsgDeliverNow;
      mode = nsIMsgSend::nsMsgSaveAsDraft;
      if (folderName.LowerCaseEqualsLiteral("drafts"))
        mode = nsIMsgSend::nsMsgSaveAsDraft;

      rv = ImportMessage(lpMsg, outputStream, mode);
      if (NS_SUCCEEDED(rv)) {  // No errors & really imported
        (*mMsgCount)++;
        msgStore->FinishNewMessage(outputStream, msgHdr);
      } else {
        IMPORT_LOG1("*** Error reading message from mailbox: %S\n", mName);
        msgStore->DiscardNewMessage(outputStream, msgHdr);
      }
      if (!reusable) outputStream->Close();
    }
  }

  if (outputStream) outputStream->Close();
  return NS_OK;
}

nsresult ProxyImportMailbox(uint32_t* pDoneSoFar, bool* pAbort, int32_t index,
                            const char16_t* pName, nsIMsgFolder* dstFolder,
                            int32_t* pMsgCount, nsOutlookMail* aCaller) {
  RefPtr<ImportMailboxRunnable> importMailbox = new ImportMailboxRunnable(
      pDoneSoFar, pAbort, index, pName, dstFolder, pMsgCount, aCaller);
  nsresult rv = NS_DispatchToMainThread(importMailbox, NS_DISPATCH_SYNC);
  NS_ENSURE_SUCCESS(rv, rv);

  return importMailbox->mResult;
}

nsresult nsOutlookMail::ImportMailbox(uint32_t* pDoneSoFar, bool* pAbort,
                                      int32_t index, const char16_t* pName,
                                      nsIMsgFolder* dstFolder,
                                      int32_t* pMsgCount) {
  return ProxyImportMailbox(pDoneSoFar, pAbort, index, pName, dstFolder,
                            pMsgCount, this);
}

nsresult ImportMailboxRunnable::ImportMessage(LPMESSAGE lpMsg,
                                              nsIOutputStream* pDest,
                                              nsMsgDeliverMode mode) {
  CMapiMessage msg(lpMsg);
  // If we wanted to skip messages that were downloaded in header only mode, we
  // would return NS_ERROR_FAILURE if !msg.FullMessageDownloaded. However, we
  // don't do this because it may cause seemingly wrong import results.
  // A user will get less mails in his imported folder than were in the original
  // folder, and this may make user feel like TB import is bad. In reality, the
  // skipped messages are those that have not been downloaded yet, because they
  // were downloaded in the "headers-only" mode. This is different from the case
  // when the message is downloaded completely, but consists only of headers -
  // in this case the message will be imported anyway.

  if (!msg.ValidState()) return NS_ERROR_FAILURE;

  // I have to create a composer for each message, since it turns out that if we
  // create one composer for several messages, the Send Proxy object that is
  // shared between those messages isn't reset properly (at least in the current
  // implementation), which leads to crash. If there's a proper way to
  // reinitialize the Send Proxy object, then we could slightly optimize the
  // send process.
  nsOutlookCompose compose;
  nsresult rv = compose.ProcessMessage(mode, msg, pDest);

  // Just for YUCKS, let's try an extra endline
  nsOutlookMail::WriteData(pDest, "\x0D\x0A", 2);

  return rv;
}

BOOL nsOutlookMail::WriteData(nsIOutputStream* pDest, const char* pData,
                              int32_t len) {
  uint32_t written;
  nsresult rv = pDest->Write(pData, len, &written);
  return NS_SUCCEEDED(rv) && written == len;
}

nsresult nsOutlookMail::ImportAddresses(uint32_t* pCount, uint32_t* pTotal,
                                        const char16_t* pName, uint32_t id,
                                        nsIAbDirectory* pDirectory,
                                        nsString& errors) {
  if (id >= (uint32_t)(m_addressList.GetSize())) {
    IMPORT_LOG0("*** Bad address identifier, unable to import\n");
    return NS_ERROR_FAILURE;
  }

  uint32_t dummyCount = 0;
  if (pCount)
    *pCount = 0;
  else
    pCount = &dummyCount;

  CMapiFolder* pFolder;
  if (id > 0) {
    int32_t idx = (int32_t)id;
    idx--;
    while (idx >= 0) {
      pFolder = m_addressList.GetItem(idx);
      if (pFolder->IsStore()) {
        OpenMessageStore(pFolder);
        break;
      }
      idx--;
    }
  }

  pFolder = m_addressList.GetItem(id);
  OpenMessageStore(pFolder);
  if (!m_lpMdb) {
    IMPORT_LOG1(
        "*** Unable to obtain mapi message store for address book: %S\n",
        pName);
    return NS_ERROR_FAILURE;
  }

  if (pFolder->IsStore()) return NS_OK;

  nsresult rv;

  nsCOMPtr<nsIImportFieldMap> pFieldMap;

  nsCOMPtr<nsIImportService> impSvc(
      do_GetService(NS_IMPORTSERVICE_CONTRACTID, &rv));
  if (NS_SUCCEEDED(rv)) {
    rv = impSvc->CreateNewFieldMap(getter_AddRefs(pFieldMap));
  }

  CMapiFolderContents contents(m_lpMdb, pFolder->GetCBEntryID(),
                               pFolder->GetEntryID());

  BOOL done = FALSE;
  ULONG cbEid;
  LPENTRYID lpEid;
  ULONG oType;
  LPMESSAGE lpMsg;
  nsCString type;
  LPSPropValue pVal;
  nsString subject;

  while (!done) {
    (*pCount)++;

    if (!contents.GetNext(&cbEid, &lpEid, &oType, &done)) {
      IMPORT_LOG1("*** Error iterating address book: %S\n", pName);
      return NS_ERROR_FAILURE;
    }

    if (pTotal && (*pTotal == 0)) *pTotal = contents.GetCount();

    if (!done && (oType == MAPI_MESSAGE)) {
      if (!m_mapi.OpenMdbEntry(m_lpMdb, cbEid, lpEid, (LPUNKNOWN*)&lpMsg)) {
        IMPORT_LOG1("*** Error opening messages in mailbox: %S\n", pName);
        return NS_ERROR_FAILURE;
      }

      // Get the PR_MESSAGE_CLASS attribute,
      // ensure that it is IPM.Contact
      pVal = m_mapi.GetMapiProperty(lpMsg, PR_MESSAGE_CLASS);
      if (pVal) {
        type.Truncate();
        m_mapi.GetStringFromProp(pVal, type);
        if (type.EqualsLiteral("IPM.Contact")) {
          // This is a contact, add it to the address book!
          subject.Truncate();
          pVal = m_mapi.GetMapiProperty(lpMsg, PR_SUBJECT);
          if (pVal) m_mapi.GetStringFromProp(pVal, subject);

          nsCOMPtr<nsIAbCard> newCard =
              do_CreateInstance(NS_ABCARDPROPERTY_CONTRACTID, &rv);
          if (newCard) {
            if (BuildCard(subject.get(), pDirectory, newCard, lpMsg,
                          pFieldMap)) {
              nsIAbCard* outCard;
              pDirectory->AddCard(newCard, &outCard);
            }
          }
        } else if (type.EqualsLiteral("IPM.DistList")) {
          // This is a list/group, add it to the address book!
          subject.Truncate();
          pVal = m_mapi.GetMapiProperty(lpMsg, PR_SUBJECT);
          if (pVal) m_mapi.GetStringFromProp(pVal, subject);
          CreateList(subject, pDirectory, lpMsg, pFieldMap);
        }
      }

      lpMsg->Release();
    }
  }

  return rv;
}
nsresult nsOutlookMail::CreateList(const nsString& pName,
                                   nsIAbDirectory* pDirectory,
                                   LPMAPIPROP pUserList,
                                   nsIImportFieldMap* pFieldMap) {
  // If no name provided then we're done.
  if (pName.IsEmpty()) return NS_OK;

  nsresult rv = NS_ERROR_FAILURE;
  // Make sure we have db to work with.
  if (!pDirectory) return rv;

  nsCOMPtr<nsIAbDirectory> newList =
      do_CreateInstance(NS_ABDIRPROPERTY_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = newList->SetDirName(pName);
  NS_ENSURE_SUCCESS(rv, rv);

  HRESULT hr;
  LPSPropValue value = NULL;
  ULONG valueCount = 0;

  LPSPropTagArray properties = NULL;
  m_mapi.MAPIAllocateBuffer(CbNewSPropTagArray(1), (void**)&properties);
  properties->cValues = 1;
  properties->aulPropTag[0] = m_mapi.GetEmailPropertyTag(pUserList, 0x8054);
  hr = pUserList->GetProps(properties, 0, &valueCount, &value);
  m_mapi.MAPIFreeBuffer(properties);
  if (HR_FAILED(hr)) return NS_ERROR_FAILURE;
  if (!value) return NS_ERROR_NOT_AVAILABLE;
  // XXX from here out, value must be freed with MAPIFreeBuffer

  SBinaryArray* sa = (SBinaryArray*)&value->Value.bin;
  if (!sa || !sa->lpbin) {
    m_mapi.MAPIFreeBuffer(value);
    return NS_ERROR_NULL_POINTER;
  }

  LPENTRYID lpEid;
  ULONG cbEid;
  ULONG idx;
  LPMESSAGE lpMsg;
  nsCString type;
  LPSPropValue pVal;
  nsString subject;
  ULONG total;

  total = sa->cValues;
  for (idx = 0; idx < total; idx++) {
    lpEid = (LPENTRYID)sa->lpbin[idx].lpb;
    cbEid = sa->lpbin[idx].cb;

    if (!m_mapi.OpenEntry(cbEid, lpEid, (LPUNKNOWN*)&lpMsg)) {
      IMPORT_LOG1("*** Error opening messages in mailbox: %S\n", pName.get());
      m_mapi.MAPIFreeBuffer(value);
      return NS_ERROR_FAILURE;
    }
    // This is a contact, add it to the address book!
    subject.Truncate();
    pVal = m_mapi.GetMapiProperty(lpMsg, PR_SUBJECT);
    if (pVal) m_mapi.GetStringFromProp(pVal, subject);

    nsCOMPtr<nsIAbCard> newCard =
        do_CreateInstance(NS_ABCARDPROPERTY_CONTRACTID, &rv);
    if (newCard) {
      if (BuildCard(subject.get(), pDirectory, newCard, lpMsg, pFieldMap)) {
        nsIAbCard* outCard;
        newList->AddCard(newCard, &outCard);
      }
    }
  }
  m_mapi.MAPIFreeBuffer(value);

  nsIAbDirectory* outList;
  rv = pDirectory->AddMailList(newList, &outList);
  return rv;
}

void nsOutlookMail::SanitizeValue(nsString& val) {
  val.ReplaceSubstring(u"\r\n"_ns, u", "_ns);
  val.ReplaceChar("\r\n", ',');
}

void nsOutlookMail::SplitString(nsString& val1, nsString& val2) {
  // Find the last line if there is more than one!
  int32_t idx = val1.RFind("\x0D\x0A");
  int32_t cnt = 2;
  if (idx == -1) {
    cnt = 1;
    idx = val1.RFindChar(13);
  }
  if (idx == -1) idx = val1.RFindChar(10);
  if (idx != -1) {
    val2 = Substring(val1, idx + cnt);
    val1.SetLength(idx);
    SanitizeValue(val1);
  }
}

bool nsOutlookMail::BuildCard(const char16_t* pName, nsIAbDirectory* pDirectory,
                              nsIAbCard* newCard, LPMAPIPROP pUser,
                              nsIImportFieldMap* pFieldMap) {
  nsString lastName;
  nsString firstName;
  nsString eMail;
  nsString nickName;
  nsString middleName;
  nsString secondEMail;
  ULONG emailTag;

  LPSPropValue pProp = m_mapi.GetMapiProperty(pUser, PR_EMAIL_ADDRESS);
  if (!pProp) {
    emailTag = m_mapi.GetEmailPropertyTag(pUser, OUTLOOK_EMAIL1_MAPI_ID1);
    if (emailTag) {
      pProp = m_mapi.GetMapiProperty(pUser, emailTag);
    }
  }
  if (pProp) {
    m_mapi.GetStringFromProp(pProp, eMail);
    SanitizeValue(eMail);
  }

  // for secondary email
  emailTag = m_mapi.GetEmailPropertyTag(pUser, OUTLOOK_EMAIL2_MAPI_ID1);
  if (emailTag) {
    pProp = m_mapi.GetMapiProperty(pUser, emailTag);
    if (pProp) {
      m_mapi.GetStringFromProp(pProp, secondEMail);
      SanitizeValue(secondEMail);
    }
  }

  pProp = m_mapi.GetMapiProperty(pUser, PR_GIVEN_NAME);
  if (pProp) {
    m_mapi.GetStringFromProp(pProp, firstName);
    SanitizeValue(firstName);
  }
  pProp = m_mapi.GetMapiProperty(pUser, PR_SURNAME);
  if (pProp) {
    m_mapi.GetStringFromProp(pProp, lastName);
    SanitizeValue(lastName);
  }
  pProp = m_mapi.GetMapiProperty(pUser, PR_MIDDLE_NAME);
  if (pProp) {
    m_mapi.GetStringFromProp(pProp, middleName);
    SanitizeValue(middleName);
  }
  pProp = m_mapi.GetMapiProperty(pUser, PR_NICKNAME);
  if (pProp) {
    m_mapi.GetStringFromProp(pProp, nickName);
    SanitizeValue(nickName);
  }
  if (firstName.IsEmpty() && lastName.IsEmpty()) {
    firstName = pName;
  }

  nsString displayName;
  pProp = m_mapi.GetMapiProperty(pUser, PR_DISPLAY_NAME);
  if (pProp) {
    m_mapi.GetStringFromProp(pProp, displayName);
    SanitizeValue(displayName);
  }
  if (displayName.IsEmpty()) {
    if (firstName.IsEmpty())
      displayName = pName;
    else {
      displayName = firstName;
      if (!middleName.IsEmpty()) {
        displayName.Append(char16_t(' '));
        displayName.Append(middleName);
      }
      if (!lastName.IsEmpty()) {
        displayName.Append(char16_t(' '));
        displayName.Append(lastName);
      }
    }
  }

  // We now have the required fields
  // write them out followed by any optional fields!
  if (!displayName.IsEmpty()) {
    newCard->SetDisplayName(displayName);
  }
  if (!firstName.IsEmpty()) {
    newCard->SetFirstName(firstName);
  }
  if (!lastName.IsEmpty()) {
    newCard->SetLastName(lastName);
  }
  if (!nickName.IsEmpty()) {
    newCard->SetPropertyAsAString(kNicknameProperty, nickName);
  }
  if (!eMail.IsEmpty()) {
    newCard->SetPrimaryEmail(eMail);
  }
  if (!secondEMail.IsEmpty()) {
    newCard->SetPropertyAsAString(k2ndEmailProperty, secondEMail);
  }

  // Do all of the extra fields!

  nsString value;
  nsString line2;

  if (pFieldMap) {
    int max = sizeof(gMapiFields) / sizeof(MAPIFields);
    for (int i = 0; i < max; i++) {
      pProp = m_mapi.GetMapiProperty(pUser, gMapiFields[i].mapiTag);
      if (pProp) {
        m_mapi.GetStringFromProp(pProp, value);
        if (!value.IsEmpty()) {
          if (gMapiFields[i].multiLine == kNoMultiLine) {
            SanitizeValue(value);
            pFieldMap->SetFieldValue(pDirectory, newCard,
                                     gMapiFields[i].mozField, value);
          } else if (gMapiFields[i].multiLine == kIsMultiLine) {
            pFieldMap->SetFieldValue(pDirectory, newCard,
                                     gMapiFields[i].mozField, value);
          } else {
            line2.Truncate();
            SplitString(value, line2);
            if (!value.IsEmpty())
              pFieldMap->SetFieldValue(pDirectory, newCard,
                                       gMapiFields[i].mozField, value);
            if (!line2.IsEmpty())
              pFieldMap->SetFieldValue(pDirectory, newCard,
                                       gMapiFields[i].multiLine, line2);
          }
        }
      }
    }
  }

  return true;
}
