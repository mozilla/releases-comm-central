/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#define INITGUID
#define USES_IID_IMAPIProp
#define USES_IID_IMessage
#define USES_IID_IMAPIFolder
#define USES_IID_IMAPIContainer
#define USES_IID_IABContainer
#define USES_IID_IMAPITable
#define USES_IID_IDistList

#include "nsAbWinHelper.h"
#include "nsMapiAddressBook.h"

#include <mapiguid.h>

#include "mozilla/Logging.h"

#define PRINT_TO_CONSOLE 0
#if PRINT_TO_CONSOLE
#  define PRINTF(args) printf args
#else
static mozilla::LazyLogModule gAbWinHelperLog("AbWinHelper");
#  define PRINTF(args) MOZ_LOG(gAbWinHelperLog, mozilla::LogLevel::Debug, args)
#endif

// Small utility to ensure release of all MAPI interfaces
template <class tInterface>
struct nsMapiInterfaceWrapper {
  tInterface mInterface;

  nsMapiInterfaceWrapper(void) : mInterface(NULL) {}
  ~nsMapiInterfaceWrapper(void) {
    if (mInterface != NULL) {
      mInterface->Release();
    }
  }
  operator LPUNKNOWN*(void) {
    return reinterpret_cast<LPUNKNOWN*>(&mInterface);
  }
  tInterface operator->(void) const { return mInterface; }
  operator tInterface*(void) { return &mInterface; }
  tInterface Get(void) const { return mInterface; }
};

static void assignEntryID(LPENTRYID& aTarget, LPENTRYID aSource,
                          ULONG aByteCount) {
  if (aTarget != NULL) {
    delete[](reinterpret_cast<LPBYTE>(aTarget));
    aTarget = NULL;
  }
  if (aSource != NULL) {
    aTarget = reinterpret_cast<LPENTRYID>(new BYTE[aByteCount]);
    memcpy(aTarget, aSource, aByteCount);
  }
}

nsMapiEntry::nsMapiEntry(void) : mByteCount(0), mEntryId(NULL) {
  MOZ_COUNT_CTOR(nsMapiEntry);
}

nsMapiEntry::nsMapiEntry(ULONG aByteCount, LPENTRYID aEntryId)
    : mByteCount(0), mEntryId(NULL) {
  Assign(aByteCount, aEntryId);
  MOZ_COUNT_CTOR(nsMapiEntry);
}

void nsMapiEntry::Move(nsMapiEntry& target, nsMapiEntry& source) {
  target.mByteCount = source.mByteCount;
  target.mEntryId = source.mEntryId;
  source.mByteCount = 0;
  source.mEntryId = NULL;
}

nsMapiEntry::~nsMapiEntry(void) {
  Assign(0, NULL);
  MOZ_COUNT_DTOR(nsMapiEntry);
}

void nsMapiEntry::Assign(ULONG aByteCount, LPENTRYID aEntryId) {
  assignEntryID(mEntryId, aEntryId, aByteCount);
  mByteCount = aByteCount;
}

void nsMapiEntry::Assign(const nsCString& aString) {
  Assign(0, NULL);
  ULONG byteCount = aString.Length() / 2;

  if ((aString.Length() & 0x01) != 0) {
    // Something wrong here, we should always get an even number of hex digits.
    byteCount += 1;
  }
  unsigned char* currentTarget = new unsigned char[byteCount];

  mByteCount = byteCount;
  mEntryId = reinterpret_cast<LPENTRYID>(currentTarget);
  ULONG j = 0;
  for (uint32_t i = 0; i < aString.Length(); i += 2) {
    char c1 = aString.CharAt(i);
    char c2 = i + 1 < aString.Length() ? aString.CharAt(i + 1) : '0';
    // clang-format off
    currentTarget[j] =
        ((c1 <= '9' ? c1 - '0' : c1 - 'A' + 10) << 4) |
         (c2 <= '9' ? c2 - '0' : c2 - 'A' + 10);
    // clang-format on
    j++;
  }
}

void nsMapiEntry::ToString(nsCString& aString) const {
  aString.Truncate();
  aString.SetCapacity(mByteCount * 2);
  char twoBytes[3];

  for (ULONG i = 0; i < mByteCount; i++) {
    sprintf(twoBytes, "%02X", (reinterpret_cast<unsigned char*>(mEntryId))[i]);
    aString.Append(twoBytes);
  }
}

void nsMapiEntry::Dump(void) const {
  PRINTF(("%lu\n", mByteCount));
  for (ULONG i = 0; i < mByteCount; ++i) {
    PRINTF(("%02X", (reinterpret_cast<unsigned char*>(mEntryId))[i]));
  }
  PRINTF(("\n"));
}

nsMapiEntryArray::nsMapiEntryArray(void) : mEntries(NULL), mNbEntries(0) {
  MOZ_COUNT_CTOR(nsMapiEntryArray);
}

nsMapiEntryArray::~nsMapiEntryArray(void) {
  if (mEntries) {
    delete[] mEntries;
  }
  MOZ_COUNT_DTOR(nsMapiEntryArray);
}

void nsMapiEntryArray::CleanUp(void) {
  if (mEntries != NULL) {
    delete[] mEntries;
    mEntries = NULL;
    mNbEntries = 0;
  }
}

// Microsoft distinguishes between address book entries and contacts.
// Address book entries are of class IMailUser and are stored in containers
// of class IABContainer.
// Local contacts are stored in the "contacts folder" of class IMAPIFolder and
// are of class IMessage with "message class" IPM.Contact.
// For local address books the entry ID of the contact can be derived from the
// entry ID of the address book entry and vice versa.
// Most attributes can be retrieved from both classes with some exceptions:
// The primary e-mail address is only stored on the IMailUser, the contact
// has three named email properties (which are not used so far).
// The birthday is only stored on the contact.
// `OpenMAPIObject()` can open the address book entry as well as the contact,
// to open the concact it needs to get the message store from via the
// address book container (or "directory" in Thunderbird terms).
// Apart from Microsoft documentation, the best source of information
// is the MAPI programmers mailing list at MAPI-L@PEACH.EASE.LSOFT.COM.
// All the information that was needed to "refresh" the MAPI implementation
// in Thunderbird was obtained via these threads:
// https://peach.ease.lsoft.com/scripts/wa-PEACH.exe?A2=2012&L=MAPI-L&D=0&P=20988415
// https://peach.ease.lsoft.com/scripts/wa-PEACH.exe?A2=2101&L=MAPI-L&D=0&P=21034512

// Some stuff to access the entry ID of the contact (IMessage, IPM.Contact)
// from the address book entry ID (IMailUser).
// The address book entry ID has the following structure, see:
// https://docs.microsoft.com/en-us/openspecs/exchange_server_protocols/ms-oxcdata/c33d5b9c-d044-4727-96e2-2051f8419ab1
#define ABENTRY_FLAGS_LENGTH 4
#define CONTAB_PROVIDER_ID \
  "\xFE\x42\xAA\x0A\x18\xC7\x1A\x10\xE8\x85\x0B\x65\x1C\x24\x00\x00"
#define CONTAB_PROVIDER_ID_LENGTH 16
#define ABENTRY_VERSION "\x03\x00\x00\x00"
#define ABENTRY_VERSION_LENGTH 4
#define ABENTRY_TYPE "\x04\x00\x00\x00"
#define ABENTRY_TYPE_LENGTH 4

struct AbEntryId {
  BYTE flags[ABENTRY_FLAGS_LENGTH];
  BYTE provider[CONTAB_PROVIDER_ID_LENGTH];
  BYTE version[ABENTRY_VERSION_LENGTH];
  BYTE type[ABENTRY_TYPE_LENGTH];
  ULONG index;
  ULONG length;
  BYTE idBytes[];
};

// Some stuff to access the entry IDs of members in a distribution list
// (IMessage, IPM.DistList):
// https://docs.microsoft.com/en-us/openspecs/exchange_server_protocols/ms-oxocntc/02656215-1cb0-4b06-a077-b07e756216be
// Also handy the reference to the so-called "one off" members:
// https://docs.microsoft.com/en-us/openspecs/exchange_server_protocols/ms-oxcdata/b32d23af-85f6-4e92-8387-53a1950ae7ba
#define DLENTRY_FLAGS_LENGTH 4
#define DL_PROVIDER_ID \
  "\xC0\x91\xAD\xD3\x51\x9D\xCF\x11\xA4\xA9\x00\xAA\x00\x47\xFA\xA4"
#define DL_PROVIDER_ID_LENGTH 16
#define DLENTRY_TYPE_LENGTH 1
struct DlEntryId {
  BYTE flags[DLENTRY_FLAGS_LENGTH];
  BYTE provider[DL_PROVIDER_ID_LENGTH];
  BYTE type[DLENTRY_TYPE_LENGTH];
  BYTE idBytes[];
};

#define DLENTRY_OO_FLAGS_LENGTH 4
#define DL_OO_PROVIDER_ID \
  "\x81\x2B\x1F\xA4\xBE\xA3\x10\x19\x9D\x6E\x00\xDD\x01\x0F\x54\x02"
#define DL_OO_PROVIDER_ID_LENGTH 16
struct DlEntryIdOo {
  BYTE flags[DLENTRY_OO_FLAGS_LENGTH];
  BYTE provider[DL_OO_PROVIDER_ID_LENGTH];
  // Note that the documentation specifies a two-byte version followed by a
  // two-byte "bit collection", but MFCMapi
  // (https://github.com/stephenegriffin/mfcmapi) shows, for example:
  // dwBitmask: 0x80010000 = MAPI_UNICODE | MAPI_SEND_NO_RICH_INFO.
  // Intel x86 and AMD64 / x86-64 hardware is little-endian, so that
  // equates to 0x0000 0x01 0x80 in memory:
  // M (1 bit): (mask 0x0100) (MIME) and U (1 bit): (mask 0x0080) (Unicode).
  ULONG versionAndBits;
  BYTE variable[];
};

using namespace mozilla;

static nsMapiEntry nullEntry;

uint32_t nsAbWinHelper::sEntryCounter = 0;
mozilla::StaticMutex nsAbWinHelper::sMutex;
// There seems to be a deadlock/auto-destruction issue
// in MAPI when multiple threads perform init/release
// operations at the same time. So I've put a mutex
// around both the initialize process and the destruction
// one. I just hope the rest of the calls don't need the
// same protection (MAPI is supposed to be thread-safe).

nsAbWinHelper::nsAbWinHelper(void) : mLastError(S_OK), mAddressBook(NULL) {
  MOZ_COUNT_CTOR(nsAbWinHelper);
}

nsAbWinHelper::~nsAbWinHelper(void) { MOZ_COUNT_DTOR(nsAbWinHelper); }

BOOL nsAbWinHelper::GetFolders(nsMapiEntryArray& aFolders) {
  aFolders.CleanUp();
  nsMapiInterfaceWrapper<LPABCONT> rootFolder;
  nsMapiInterfaceWrapper<LPMAPITABLE> folders;
  ULONG objType = 0;
  ULONG rowCount = 0;
  SRestriction restriction;
  SPropTagArray folderColumns;

  mLastError = mAddressBook->OpenEntry(0, NULL, NULL, 0, &objType, rootFolder);
  if (HR_FAILED(mLastError)) {
    PRINTF(("Cannot open root %08lx.\n", mLastError));
    return FALSE;
  }
  mLastError = rootFolder->GetHierarchyTable(0, folders);
  if (HR_FAILED(mLastError)) {
    PRINTF(("Cannot get hierarchy %08lx.\n", mLastError));
    return FALSE;
  }
  // We only take into account modifiable containers,
  // otherwise, we end up with all the directory services...
  restriction.rt = RES_BITMASK;
  restriction.res.resBitMask.ulPropTag = PR_CONTAINER_FLAGS;
  restriction.res.resBitMask.relBMR = BMR_NEZ;
  restriction.res.resBitMask.ulMask = AB_MODIFIABLE;
  mLastError = folders->Restrict(&restriction, 0);
  if (HR_FAILED(mLastError)) {
    PRINTF(("Cannot restrict table %08lx.\n", mLastError));
  }
  folderColumns.cValues = 1;
  folderColumns.aulPropTag[0] = PR_ENTRYID;
  mLastError = folders->SetColumns(&folderColumns, 0);
  if (HR_FAILED(mLastError)) {
    PRINTF(("Cannot set columns %08lx.\n", mLastError));
    return FALSE;
  }
  mLastError = folders->GetRowCount(0, &rowCount);
  if (HR_SUCCEEDED(mLastError)) {
    aFolders.mEntries = new nsMapiEntry[rowCount];
    aFolders.mNbEntries = 0;
    do {
      LPSRowSet rowSet = NULL;

      rowCount = 0;
      mLastError = folders->QueryRows(1, 0, &rowSet);
      if (HR_SUCCEEDED(mLastError)) {
        rowCount = rowSet->cRows;
        if (rowCount > 0) {
          nsMapiEntry& current = aFolders.mEntries[aFolders.mNbEntries++];
          SPropValue& currentValue = rowSet->aRow->lpProps[0];

          current.Assign(
              currentValue.Value.bin.cb,
              reinterpret_cast<LPENTRYID>(currentValue.Value.bin.lpb));
        }
        MyFreeProws(rowSet);
      } else {
        PRINTF(("Cannot query rows %08lx.\n", mLastError));
      }
    } while (rowCount > 0);
  }
  return HR_SUCCEEDED(mLastError);
}

BOOL nsAbWinHelper::GetCards(const nsMapiEntry& aParent,
                             LPSRestriction aRestriction,
                             nsMapiEntryArray& aCards) {
  aCards.CleanUp();
  return GetContents(aParent, aRestriction, &aCards.mEntries, aCards.mNbEntries,
                     0);
}

BOOL nsAbWinHelper::GetNodes(const nsMapiEntry& aParent,
                             nsMapiEntryArray& aNodes) {
  aNodes.CleanUp();
  return GetContents(aParent, NULL, &aNodes.mEntries, aNodes.mNbEntries,
                     MAPI_DISTLIST);
}

BOOL nsAbWinHelper::GetCardsCount(const nsMapiEntry& aParent, ULONG& aNbCards) {
  aNbCards = 0;
  return GetContents(aParent, NULL, NULL, aNbCards, 0);
}

BOOL nsAbWinHelper::GetPropertyString(const nsMapiEntry& aObject,
                                      ULONG aPropertyTag, nsCString& aName) {
  aName.Truncate();
  LPSPropValue values = NULL;
  ULONG valueCount = 0;

  if (!GetMAPIProperties(nullEntry, aObject, &aPropertyTag, 1, values,
                         valueCount)) {
    return FALSE;
  }

  if (valueCount != 1 || values == NULL) {
    PRINTF(("Unexpected return value in nsAbWinHelper::GetPropertyString"));
    return FALSE;
  }

  BOOL success = TRUE;
  if (PROP_TYPE(values->ulPropTag) == PT_STRING8) {
    aName = values->Value.lpszA;
  } else if (PROP_TYPE(values->ulPropTag) == PT_UNICODE) {
    aName = NS_LossyConvertUTF16toASCII(values->Value.lpszW);
  } else {
    PRINTF(("Unexpected return value for property %08lx (x0A is PT_ERROR).\n",
            values->ulPropTag));
    success = FALSE;
  }
  FreeBuffer(values);
  return success;
}

BOOL nsAbWinHelper::GetPropertyUString(const nsMapiEntry& aObject,
                                       ULONG aPropertyTag, nsString& aName) {
  aName.Truncate();
  LPSPropValue values = NULL;
  ULONG valueCount = 0;

  if (!GetMAPIProperties(nullEntry, aObject, &aPropertyTag, 1, values,
                         valueCount)) {
    return FALSE;
  }
  if (valueCount != 1 || values == NULL) {
    PRINTF(("Unexpected return value in nsAbWinHelper::GetPropertyUString"));
    return FALSE;
  }

  BOOL success = TRUE;
  if (PROP_TYPE(values->ulPropTag) == PT_UNICODE) {
    aName = values->Value.lpszW;
  } else if (PROP_TYPE(values->ulPropTag) == PT_STRING8) {
    aName.AssignASCII(values->Value.lpszA);
  } else {
    PRINTF(("Unexpected return value for property %08lx (x0A is PT_ERROR).\n",
            values->ulPropTag));
    success = FALSE;
  }
  return success;
}

BOOL nsAbWinHelper::GetPropertiesUString(const nsMapiEntry& aDir,
                                         const nsMapiEntry& aObject,
                                         const ULONG aPropertyTags[],
                                         ULONG aNbProperties, nsString aNames[],
                                         bool aSuccess[]) {
  LPSPropValue values = NULL;
  ULONG valueCount = 0;

  if (!GetMAPIProperties(aDir, aObject, aPropertyTags, aNbProperties, values,
                         valueCount, true))
    return FALSE;

  if (valueCount != aNbProperties || values == NULL) {
    PRINTF(("Unexpected return value in nsAbWinHelper::GetPropertiesUString"));
    return FALSE;
  }
  for (ULONG i = 0; i < valueCount; ++i) {
    aNames[i].Truncate();
    aSuccess[i] = false;
    if (PROP_ID(values[i].ulPropTag) == PROP_ID(aPropertyTags[i])) {
      if (PROP_TYPE(values[i].ulPropTag) == PT_STRING8) {
        aNames[i].AssignASCII(values[i].Value.lpszA);
        aSuccess[i] = true;
      } else if (PROP_TYPE(values[i].ulPropTag) == PT_UNICODE) {
        aNames[i] = values[i].Value.lpszW;
        aSuccess[i] = true;
      } else {
        PRINTF(
            ("Unexpected return value for property %08lx (x0A is PT_ERROR).\n",
             values[i].ulPropTag));
      }
    }
  }
  FreeBuffer(values);
  return TRUE;
}

BOOL nsAbWinHelper::GetPropertyDate(const nsMapiEntry& aDir,
                                    const nsMapiEntry& aObject,
                                    bool fromContact, ULONG aPropertyTag,
                                    WORD& aYear, WORD& aMonth, WORD& aDay) {
  aYear = 0;
  aMonth = 0;
  aDay = 0;
  LPSPropValue values = NULL;
  ULONG valueCount = 0;

  if (!GetMAPIProperties(aDir, aObject, &aPropertyTag, 1, values, valueCount,
                         fromContact)) {
    return FALSE;
  }
  if (valueCount != 1 || values == NULL) {
    PRINTF(("Unexpected return value in nsAbWinHelper::GetPropertyDate"));
    return FALSE;
  }

  BOOL success = TRUE;
  if (PROP_TYPE(values->ulPropTag) == PT_SYSTIME) {
    SYSTEMTIME readableTime;
    if (FileTimeToSystemTime(&values->Value.ft, &readableTime)) {
      aYear = readableTime.wYear;
      aMonth = readableTime.wMonth;
      aDay = readableTime.wDay;
    }
  } else {
    PRINTF(("Cannot retrieve PT_SYSTIME property %08lx (x0A is PT_ERROR).\n",
            values->ulPropTag));
    success = FALSE;
  }
  FreeBuffer(values);
  return success;
}

BOOL nsAbWinHelper::GetPropertyLong(const nsMapiEntry& aObject,
                                    ULONG aPropertyTag, ULONG& aValue) {
  aValue = 0;
  LPSPropValue values = NULL;
  ULONG valueCount = 0;

  if (!GetMAPIProperties(nullEntry, aObject, &aPropertyTag, 1, values,
                         valueCount)) {
    return FALSE;
  }
  if (valueCount != 1 || values == NULL) {
    PRINTF(("Unexpected return value in nsAbWinHelper::GetPropertyLong"));
    return FALSE;
  }

  BOOL success = TRUE;
  if (PROP_TYPE(values->ulPropTag) == PT_LONG) {
    aValue = values->Value.ul;
  } else {
    PRINTF(("Cannot retrieve PT_LONG property %08lx (x0A is PT_ERROR).\n",
            values->ulPropTag));
    success = FALSE;
  }
  FreeBuffer(values);
  return success;
}

BOOL nsAbWinHelper::GetPropertyBin(const nsMapiEntry& aObject,
                                   ULONG aPropertyTag, nsMapiEntry& aValue) {
  aValue.Assign(0, NULL);
  LPSPropValue values = NULL;
  ULONG valueCount = 0;

  if (!GetMAPIProperties(nullEntry, aObject, &aPropertyTag, 1, values,
                         valueCount)) {
    return FALSE;
  }
  if (valueCount != 1 || values == NULL) {
    PRINTF(("Unexpected return value in nsAbWinHelper::GetPropertyBin"));
    return FALSE;
  }

  BOOL success = TRUE;
  if (PROP_TYPE(values->ulPropTag) == PT_BINARY) {
    aValue.Assign(values->Value.bin.cb,
                  reinterpret_cast<LPENTRYID>(values->Value.bin.lpb));
  } else {
    PRINTF(("Cannot retrieve PT_BINARY property %08lx (x0A is PT_ERROR).\n",
            values->ulPropTag));
    success = FALSE;
  }

  FreeBuffer(values);
  return success;
}

BOOL nsAbWinHelper::GetPropertiesMVBin(
    const nsMapiEntry& aDir, const nsMapiEntry& aObject,
    const ULONG aPropertyTags[], ULONG aNbProperties, nsMapiEntry* aEntryIDs[],
    ULONG aNbElements[], bool aAllocateMore) {
  LPSPropValue values = NULL;
  ULONG valueCount = 0;

  // Initialise output arrays.
  for (ULONG i = 0; i < aNbProperties; i++) {
    aEntryIDs[i] = NULL;
    aNbElements[i] = 0;
  }

  if (!GetMAPIProperties(aDir, aObject, aPropertyTags, aNbProperties, values,
                         valueCount, true)) {
    return FALSE;
  }
  if (valueCount != aNbProperties || values == NULL) {
    PRINTF(("Unexpected return value in nsAbWinHelper::GetPropertyMVBin"));
    return FALSE;
  }

  BOOL success = TRUE;
  for (ULONG i = 0; i < valueCount; i++) {
    if (PROP_TYPE(values[i].ulPropTag) == PT_MV_BINARY) {
      ULONG count = values[i].Value.MVbin.cValues;
      PRINTF(("Found %lu members in DL.\n", count));
      aEntryIDs[i] = new nsMapiEntry[aAllocateMore ? count + 1 : count];
      aNbElements[i] = count;
      SBinary* currentValue = values[i].Value.MVbin.lpbin;
      for (ULONG j = 0; j < count; j++) {
        nsMapiEntry& current = aEntryIDs[i][j];
        current.Assign(currentValue->cb,
                       reinterpret_cast<LPENTRYID>(currentValue->lpb));
        currentValue++;
      }
    } else {
      PRINTF(
          ("Cannot retrieve PT_MV_BINARY property %08lx (x0A is PT_ERROR).\n",
           values[i].ulPropTag));
      success = FALSE;
    }
  }

  FreeBuffer(values);
  if (!success) {
    for (ULONG i = 0; i < aNbProperties; i++) {
      if (aNbElements[i] > 0) delete[] aEntryIDs[i];
      aEntryIDs[i] = NULL;
      aNbElements[i] = 0;
    }
  }
  return success;
}

BOOL nsAbWinHelper::SetPropertiesMVBin(const nsMapiEntry& aDir,
                                       const nsMapiEntry& aObject,
                                       const ULONG aPropertyTags[],
                                       ULONG aNbProperties,
                                       nsMapiEntry* aEntryIDs[],
                                       ULONG aNbElements[]) {
  LPSPropValue values = new SPropValue[aNbProperties];
  if (!values) return FALSE;

  for (ULONG i = 0; i < aNbProperties; i++) {
    values[i].ulPropTag = aPropertyTags[i];
    values[i].Value.MVbin.cValues = aNbElements[i];
    values[i].Value.MVbin.lpbin = new SBinary[aNbElements[i]];

    SBinary* currentValue = values[i].Value.MVbin.lpbin;
    for (ULONG j = 0; j < aNbElements[i]; j++) {
      currentValue->cb = aEntryIDs[i][j].mByteCount;
      currentValue->lpb = reinterpret_cast<LPBYTE>(aEntryIDs[i][j].mEntryId);
      currentValue++;
    }
  }
  BOOL retCode = SetMAPIProperties(aDir, aObject, aNbProperties, values, true);
  for (ULONG i = 0; i < aNbProperties; i++) {
    delete[] values[i].Value.MVbin.lpbin;
  }
  delete[] values;
  return retCode;
}

// This function, supposedly indicating whether a particular entry was
// in a particular container, doesn't seem to work very well (has
// a tendency to return TRUE even if we're talking to different containers...).
BOOL nsAbWinHelper::TestOpenEntry(const nsMapiEntry& aContainer,
                                  const nsMapiEntry& aEntry) {
  nsMapiInterfaceWrapper<LPMAPICONTAINER> container;
  nsMapiInterfaceWrapper<LPMAPIPROP> subObject;
  ULONG objType = 0;

  mLastError =
      mAddressBook->OpenEntry(aContainer.mByteCount, aContainer.mEntryId,
                              &IID_IMAPIContainer, 0, &objType, container);
  if (HR_FAILED(mLastError)) {
    PRINTF(("Cannot open container %08lx.\n", mLastError));
    return FALSE;
  }
  mLastError = container->OpenEntry(aEntry.mByteCount, aEntry.mEntryId, NULL, 0,
                                    &objType, subObject);
  return HR_SUCCEEDED(mLastError);
}

BOOL nsAbWinHelper::DeleteEntry(const nsMapiEntry& aContainer,
                                const nsMapiEntry& aEntry) {
  nsMapiInterfaceWrapper<LPABCONT> container;
  ULONG objType = 0;
  SBinary entry;
  SBinaryArray entryArray;

  mLastError = mAddressBook->OpenEntry(aContainer.mByteCount,
                                       aContainer.mEntryId, &IID_IABContainer,
                                       MAPI_MODIFY, &objType, container);
  if (HR_FAILED(mLastError)) {
    PRINTF(("Cannot open container %08lx.\n", mLastError));
    return FALSE;
  }
  entry.cb = aEntry.mByteCount;
  entry.lpb = reinterpret_cast<LPBYTE>(aEntry.mEntryId);
  entryArray.cValues = 1;
  entryArray.lpbin = &entry;
  mLastError = container->DeleteEntries(&entryArray, 0);
  if (HR_FAILED(mLastError)) {
    PRINTF(("Cannot delete entry %08lx.\n", mLastError));
    return FALSE;
  }
  return TRUE;
}

BOOL nsAbWinHelper::GetDlMembersTag(IMAPIProp* aMsg, ULONG& aDlMembersTag,
                                    ULONG& aDlMembersTagOneOff) {
  const GUID guid = {0x00062004,
                     0x0000,
                     0x0000,
                     {0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}};
  MAPINAMEID nameID;
  nameID.lpguid = (GUID*)&guid;
  nameID.ulKind = MNID_ID;
  LPSPropTagArray lppPropTags;
  LPMAPINAMEID lpNameID[1] = {&nameID};

  // Strangely requesting two tags at the same time doesn't appear to work,
  // so request them separately.
  // One should be able to set up `lpNameID` with two entries and get two
  // tags returned in `lppPropTags`, but sadly the second one is always 0.
  nameID.Kind.lID = 0x8055;  // PidLidDistributionListMembers
  mLastError = aMsg->GetIDsFromNames(1, lpNameID, 0, &lppPropTags);
  if (HR_FAILED(mLastError)) {
    PRINTF(("Cannot get DL prop tag %08lx.\n", mLastError));
    return FALSE;
  }
  aDlMembersTag = lppPropTags[0].aulPropTag[0] | PT_MV_BINARY;
  mAddressFreeBuffer(lppPropTags);

  nameID.Kind.lID = 0x8054;  // PidLidDistributionListOneOffMembers
  mLastError = aMsg->GetIDsFromNames(1, lpNameID, 0, &lppPropTags);
  if (HR_FAILED(mLastError)) {
    PRINTF(("Cannot open DL prop tag (one off) %08lx.\n", mLastError));
    return FALSE;
  }
  aDlMembersTagOneOff = lppPropTags[0].aulPropTag[0] | PT_MV_BINARY;
  mAddressFreeBuffer(lppPropTags);

  return TRUE;
}

BOOL nsAbWinHelper::GetDlNameTag(IMAPIProp* aMsg, ULONG& aDlNameTag) {
  const GUID guid = {0x00062004,
                     0x0000,
                     0x0000,
                     {0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}};
  MAPINAMEID nameID;
  nameID.lpguid = (GUID*)&guid;
  nameID.ulKind = MNID_ID;
  LPSPropTagArray lppPropTags;
  LPMAPINAMEID lpNameID[1] = {&nameID};

  nameID.Kind.lID = 0x8053;  // PidLidDistributionListName
  mLastError = aMsg->GetIDsFromNames(1, lpNameID, 0, &lppPropTags);
  if (HR_FAILED(mLastError)) {
    PRINTF(("Cannot get DL prop tag %08lx.\n", mLastError));
    return FALSE;
  }
  aDlNameTag = lppPropTags[0].aulPropTag[0] | PT_UNICODE;
  mAddressFreeBuffer(lppPropTags);

  return TRUE;
}

BOOL nsAbWinHelper::DeleteEntryfromDL(const nsMapiEntry& aTopDir,
                                      const nsMapiEntry& aDistList,
                                      const nsMapiEntry& aEntry) {
  // First we need to open the distribution list to get the property tag.
  ULONG dlMembersTag = 0;
  ULONG dlMembersTagOnOff = 0;
  {
    // We do this in a block is `msg` going out of scope will release the
    // object.
    nsMapiInterfaceWrapper<LPMAPIPROP> msg;
    mLastError = OpenMAPIObject(aTopDir, aDistList, true, 0, msg);
    if (HR_FAILED(mLastError)) {
      PRINTF(("Cannot open DL entry %08lx.\n", mLastError));
      return FALSE;
    }
    if (!GetDlMembersTag(msg.Get(), dlMembersTag, dlMembersTagOnOff))
      return FALSE;
  }

  // This will self-destruct when it goes out of scope.
  nsMapiEntryArray dlMembers;
  nsMapiEntryArray dlMembersOneOff;

  // Turn IMailUser into IMessage/IPM.Contact.
  // Check for magic provider GUID.
  struct AbEntryId* abEntryId = (struct AbEntryId*)aEntry.mEntryId;
  if (memcmp(abEntryId->provider, CONTAB_PROVIDER_ID,
             CONTAB_PROVIDER_ID_LENGTH) != 0) {
    PRINTF(("Cannot get to IMessage/IPM.Contact.\n"));
    return FALSE;
  }
  ULONG contactIdLength = abEntryId->length;
  LPENTRYID contactId = reinterpret_cast<LPENTRYID>(&(abEntryId->idBytes));

  ULONG tags[2] = {dlMembersTag, dlMembersTagOnOff};
  nsMapiEntry* values[2];
  ULONG counts[2];
  if (!GetPropertiesMVBin(aTopDir, aDistList, tags, 2, values, counts)) {
    PRINTF(("Cannot get DL members.\n"));
    return FALSE;
  }
  dlMembers.mEntries = values[0];
  dlMembersOneOff.mEntries = values[1];
  dlMembers.mNbEntries = counts[0];
  dlMembersOneOff.mNbEntries = counts[1];

  if (dlMembers.mNbEntries == 0) return FALSE;
  if (dlMembers.mNbEntries != dlMembersOneOff.mNbEntries) {
    PRINTF(("DL members and DL one off members have different length.\n"));
    return FALSE;
  }

  ULONG result;
  for (ULONG i = 0; i < dlMembers.mNbEntries; i++) {
    struct DlEntryId* dlEntryId =
        (struct DlEntryId*)dlMembers.mEntries[i].mEntryId;
    if (memcmp(dlEntryId->provider, DL_PROVIDER_ID, DL_PROVIDER_ID_LENGTH) != 0)
      continue;
    mLastError = mAddressSession->CompareEntryIDs(
        contactIdLength, contactId,
        dlMembers.mEntries[i].mByteCount - sizeof(struct DlEntryId),
        reinterpret_cast<LPENTRYID>(dlEntryId->idBytes), 0, &result);
    if (HR_FAILED(mLastError)) {
      PRINTF(("CompareEntryIDs failed with %08lx (DeleteEntryfromDL()).\n",
              mLastError));
    }
    if (result) {
      PRINTF(("Found card to be deleted at position %lu.\n", i));

      // Kill/free entry and shuffle remaining cards down.
      dlMembers.mEntries[i].Assign(0, NULL);
      dlMembersOneOff.mEntries[i].Assign(0, NULL);
      for (ULONG j = i + 1; j < dlMembers.mNbEntries; j++) {
        nsMapiEntry::Move(dlMembers.mEntries[j - 1], dlMembers.mEntries[j]);
        nsMapiEntry::Move(dlMembersOneOff.mEntries[j - 1],
                          dlMembersOneOff.mEntries[j]);
      }
      dlMembers.mNbEntries--;
      dlMembersOneOff.mNbEntries--;

      counts[0] = dlMembers.mNbEntries;
      counts[1] = dlMembersOneOff.mNbEntries;
      if (counts[0] >= 1) {
        if (!SetPropertiesMVBin(aTopDir, aDistList, tags, 2, values, counts)) {
          PRINTF(("Cannot set DL members.\n"));
          return FALSE;
        }
      } else {
        static const SizedSPropTagArray(2, properties) = {
            2, {dlMembersTag, dlMembersTagOnOff}};
        if (!DeleteMAPIProperties(aTopDir, aDistList,
                                  (LPSPropTagArray)&properties, true)) {
          PRINTF(("Cannot delete DL members.\n"));
          return FALSE;
        }
      }
      return TRUE;
    }
  }
  return FALSE;
}

BOOL nsAbWinHelper::AddEntryToDL(const nsMapiEntry& aTopDir,
                                 const nsMapiEntry& aDistList,
                                 const nsMapiEntry& aEntry,
                                 const wchar_t* aDisplay,
                                 const wchar_t* aEmail) {
  // First we need to open the distribution list to get the property tag.
  ULONG dlMembersTag = 0;
  ULONG dlMembersTagOnOff = 0;
  {
    // We do this in a block is `msg` going out of scope will release the
    // object.
    nsMapiInterfaceWrapper<LPMAPIPROP> msg;
    mLastError = OpenMAPIObject(aTopDir, aDistList, true, 0, msg);
    if (HR_FAILED(mLastError)) {
      PRINTF(("Cannot open DL entry %08lx.\n", mLastError));
      return FALSE;
    }
    if (!GetDlMembersTag(msg.Get(), dlMembersTag, dlMembersTagOnOff))
      return FALSE;
  }

  // This will self-destruct when it goes out of scope.
  nsMapiEntryArray dlMembers;
  nsMapiEntryArray dlMembersOneOff;

  // Turn IMailUser into IMessage/IPM.Contact.
  // Check for magic provider GUID.
  struct AbEntryId* abEntryId = (struct AbEntryId*)aEntry.mEntryId;
  if (memcmp(abEntryId->provider, CONTAB_PROVIDER_ID,
             CONTAB_PROVIDER_ID_LENGTH) != 0) {
    PRINTF(("Cannot get to IMessage/IPM.Contact.\n"));
    return FALSE;
  }
  ULONG contactIdLength = abEntryId->length;
  LPENTRYID contactId = reinterpret_cast<LPENTRYID>(&(abEntryId->idBytes));

  ULONG tags[2] = {dlMembersTag, dlMembersTagOnOff};
  nsMapiEntry* values[2];
  ULONG counts[2];
  // We ask for and array one entry larger.
  if (!GetPropertiesMVBin(aTopDir, aDistList, tags, 2, values, counts, true)) {
    // If the properties aren't there, the list has no entries so far.
    values[0] = new nsMapiEntry[1];
    values[1] = new nsMapiEntry[1];
    counts[0] = counts[1] = 0;
  }
  dlMembers.mEntries = values[0];
  dlMembersOneOff.mEntries = values[1];
  dlMembers.mNbEntries = counts[0];
  dlMembersOneOff.mNbEntries = counts[1];

  if (dlMembers.mNbEntries != dlMembersOneOff.mNbEntries) {
    PRINTF(("DL members and DL one off members have different length.\n"));
    return FALSE;
  }

  // Append a new entry at the end. The array is already large enough.

  // Construct a distribution list entry based on a contact.
  size_t dlEntryIdLength = sizeof(struct DlEntryId) + contactIdLength;
  struct DlEntryId* dlEntryId = (DlEntryId*)moz_xmalloc(dlEntryIdLength);
  memset(dlEntryId->flags, 0, DLENTRY_FLAGS_LENGTH);
  memcpy(dlEntryId->provider, DL_PROVIDER_ID, DL_PROVIDER_ID_LENGTH);
  // See documentation referenced above: 0xC3 = 0x80 | 0x40 | 0x03.
  memset(dlEntryId->type, 0xC3, DLENTRY_TYPE_LENGTH);
  memcpy(dlEntryId->idBytes, contactId, contactIdLength);
  dlMembers.mEntries[dlMembers.mNbEntries].Assign(
      dlEntryIdLength, reinterpret_cast<LPENTRYID>(dlEntryId));

  // Construct a one-off entry.
  size_t dlEntryIdOoLength = sizeof(struct DlEntryIdOo) +
                             2 * (wcslen(aDisplay) + 4 + wcslen(aEmail) + 3);
  struct DlEntryIdOo* dlEntryIdOo =
      (DlEntryIdOo*)moz_xmalloc(dlEntryIdOoLength);
  memset(dlEntryIdOo->flags, 0, DLENTRY_OO_FLAGS_LENGTH);
  memcpy(dlEntryIdOo->provider, DL_OO_PROVIDER_ID, DL_OO_PROVIDER_ID_LENGTH);
  dlEntryIdOo->versionAndBits = MAPI_UNICODE | MAPI_SEND_NO_RICH_INFO;

  // Populate the variable part. A bit of stone-age programming ;-)
  size_t length = 2 * (wcslen(aDisplay) + 1);
  memcpy(dlEntryIdOo->variable, aDisplay, length);
  size_t offset = length;

  length = 2 * (4 + 1);
  memcpy(dlEntryIdOo->variable + offset, L"SMTP", length);
  offset += length;

  length = 2 * (wcslen(aEmail) + 1);
  memcpy(dlEntryIdOo->variable + offset, aEmail, length);

  dlMembersOneOff.mEntries[dlMembersOneOff.mNbEntries].Assign(
      dlEntryIdOoLength, reinterpret_cast<LPENTRYID>(dlEntryIdOo));

  free(dlEntryId);
  free(dlEntryIdOo);

  dlMembers.mNbEntries++;
  dlMembersOneOff.mNbEntries++;

  counts[0] = dlMembers.mNbEntries;
  counts[1] = dlMembersOneOff.mNbEntries;
  if (!SetPropertiesMVBin(aTopDir, aDistList, tags, 2, values, counts)) {
    PRINTF(("Cannot set DL members.\n"));
    return FALSE;
  }
  return TRUE;
}

BOOL nsAbWinHelper::SetPropertyUString(const nsMapiEntry& aObject,
                                       ULONG aPropertyTag,
                                       const char16_t* aValue) {
  SPropValue value;
  nsAutoCString alternativeValue;

  value.ulPropTag = aPropertyTag;
  if (PROP_TYPE(aPropertyTag) == PT_UNICODE) {
    value.Value.lpszW =
        reinterpret_cast<wchar_t*>(const_cast<char16_t*>(aValue));
  } else if (PROP_TYPE(aPropertyTag) == PT_STRING8) {
    alternativeValue = NS_LossyConvertUTF16toASCII(aValue);
    value.Value.lpszA = const_cast<char*>(alternativeValue.get());
  } else {
    PRINTF(("Property %08lx is not a string.\n", aPropertyTag));
    return FALSE;
  }
  return SetMAPIProperties(nullEntry, aObject, 1, &value, false);
}

BOOL nsAbWinHelper::SetPropertiesUString(const nsMapiEntry& aDir,
                                         const nsMapiEntry& aObject,
                                         const ULONG aPropertyTags[],
                                         ULONG aNbProperties,
                                         nsString aValues[]) {
  LPSPropValue values = new SPropValue[aNbProperties];
  if (!values) return FALSE;

  ULONG currentValue = 0;
  nsAutoCString alternativeValue;
  BOOL retCode = TRUE;

  for (ULONG i = 0; i < aNbProperties; ++i) {
    values[currentValue].ulPropTag = aPropertyTags[i];
    if (PROP_TYPE(aPropertyTags[i]) == PT_UNICODE) {
      const wchar_t* value = aValues[i].get();
      values[currentValue++].Value.lpszW = const_cast<wchar_t*>(value);
    } else if (PROP_TYPE(aPropertyTags[i]) == PT_STRING8) {
      LossyCopyUTF16toASCII(aValues[i], alternativeValue);
      char* av = strdup(alternativeValue.get());
      if (!av) {
        retCode = FALSE;
        break;
      }
      values[currentValue++].Value.lpszA = av;
    }
  }
  if (retCode)
    retCode = SetMAPIProperties(aDir, aObject, currentValue, values, true);
  for (ULONG i = 0; i < currentValue; ++i) {
    if (PROP_TYPE(aPropertyTags[i]) == PT_STRING8) {
      free(values[i].Value.lpszA);
    }
  }
  delete[] values;
  return retCode;
}

BOOL nsAbWinHelper::SetPropertyDate(const nsMapiEntry& aDir,
                                    const nsMapiEntry& aObject,
                                    bool fromContact, ULONG aPropertyTag,
                                    WORD aYear, WORD aMonth, WORD aDay) {
  SPropValue value;

  value.ulPropTag = aPropertyTag;
  if (PROP_TYPE(aPropertyTag) == PT_SYSTIME) {
    SYSTEMTIME readableTime;

    readableTime.wYear = aYear;
    readableTime.wMonth = aMonth;
    readableTime.wDay = aDay;
    readableTime.wDayOfWeek = 0;
    readableTime.wHour = 0;
    readableTime.wMinute = 0;
    readableTime.wSecond = 0;
    readableTime.wMilliseconds = 0;
    if (SystemTimeToFileTime(&readableTime, &value.Value.ft)) {
      return SetMAPIProperties(aDir, aObject, 1, &value, fromContact);
    }
    return TRUE;
  }
  return FALSE;
}

BOOL nsAbWinHelper::CreateEntryInternal(const nsMapiEntry& aParent,
                                        nsMapiEntry& aNewEntry,
                                        const char* aContactClass,
                                        const wchar_t* aName) {
  // We create an IPM.Contact or IPM.DistList message in the contacts folder.
  // To find that folder, we look for our `aParent` in the hierarchy table
  // and use the matching `PR_CONTAB_FOLDER_ENTRYID` for the folder.
  nsMapiInterfaceWrapper<LPABCONT> rootFolder;
  nsMapiInterfaceWrapper<LPMAPITABLE> folders;
  ULONG objType = 0;
  mLastError = mAddressBook->OpenEntry(0, NULL, NULL, 0, &objType, rootFolder);
  if (HR_FAILED(mLastError)) {
    PRINTF(("Cannot open root %08lx (creating new entry).\n", mLastError));
    return FALSE;
  }
  mLastError = rootFolder->GetHierarchyTable(CONVENIENT_DEPTH, folders);
  if (HR_FAILED(mLastError)) {
    PRINTF(("Cannot get hierarchy %08lx (creating new entry).\n", mLastError));
    return FALSE;
  }

  // Request `PR_ENTRYID` and `PR_CONTAB_FOLDER_ENTRYID`.
#define PR_CONTAB_FOLDER_ENTRYID PROP_TAG(PT_BINARY, 0x6610)
  static const SizedSPropTagArray(2, properties) = {
      2, {PR_ENTRYID, PR_CONTAB_FOLDER_ENTRYID}};
  mLastError = folders->SetColumns((LPSPropTagArray)&properties, 0);
  if (HR_FAILED(mLastError)) {
    PRINTF(("Cannot set columns %08lx (creating new entry).\n", mLastError));
    return FALSE;
  }

  ULONG rowCount = 0;
  bool found = false;
  nsMapiEntry conTab;
  mLastError = folders->GetRowCount(0, &rowCount);
  if (HR_SUCCEEDED(mLastError)) {
    do {
      LPSRowSet rowSet = NULL;

      rowCount = 0;
      mLastError = folders->QueryRows(1, 0, &rowSet);
      if (HR_SUCCEEDED(mLastError)) {
        rowCount = rowSet->cRows;
        if (rowCount > 0) {
          ULONG result;
          // Get entry ID from row and compare.
          SPropValue& colValue = rowSet->aRow->lpProps[0];

          mLastError = mAddressSession->CompareEntryIDs(
              aParent.mByteCount, aParent.mEntryId, colValue.Value.bin.cb,
              reinterpret_cast<LPENTRYID>(colValue.Value.bin.lpb), 0, &result);
          if (HR_FAILED(mLastError)) {
            PRINTF(("CompareEntryIDs failed with %08lx (creating new entry).\n",
                    mLastError));
          }
          if (result) {
            SPropValue& conTabValue = rowSet->aRow->lpProps[1];
            conTab.Assign(
                conTabValue.Value.bin.cb,
                reinterpret_cast<LPENTRYID>(conTabValue.Value.bin.lpb));
            found = true;
            break;
          }
        }
        MyFreeProws(rowSet);
      } else {
        PRINTF(("Cannot query rows %08lx (creating new entry).\n", mLastError));
      }
    } while (rowCount > 0);
  }
  if (HR_FAILED(mLastError)) return HR_SUCCEEDED(mLastError);

  if (!found) {
    PRINTF(("Cannot find folder for contact in hierarchy table.\n"));
    return FALSE;
  }

  // Open store and contact folder.
  PRINTF(("Found contact folder associated with AB container.\n"));
  nsMapiEntry storeEntry;
  // Get the entry ID of the related store. This won't work for the
  // Global Address List (GAL) since it doesn't provide contacts from a
  // local store.
  if (!GetPropertyBin(aParent, PR_STORE_ENTRYID, storeEntry)) {
    PRINTF(("Cannot get PR_STORE_ENTRYID, likely not a local AB.\n"));
    return FALSE;
  }
  nsMapiInterfaceWrapper<LPMDB> store;
  mLastError = mAddressSession->OpenMsgStore(
      0, storeEntry.mByteCount, storeEntry.mEntryId, NULL, 0, store);
  if (HR_FAILED(mLastError)) {
    PRINTF(("Cannot open MAPI message store %08lx.\n", mLastError));
    return FALSE;
  }
  nsMapiInterfaceWrapper<LPMAPIFOLDER> contactFolder;
  mLastError =
      store->OpenEntry(conTab.mByteCount, conTab.mEntryId, &IID_IMAPIFolder,
                       MAPI_MODIFY, &objType, contactFolder);
  if (HR_FAILED(mLastError)) {
    PRINTF(("Cannot open contact folder %08lx.\n", mLastError));
    return FALSE;
  }

  // Crazy as it seems, contacts and distribution lists are stored as message.
  nsMapiInterfaceWrapper<LPMESSAGE> newEntry;
  mLastError = contactFolder->CreateMessage(&IID_IMessage, 0, newEntry);
  if (HR_FAILED(mLastError)) {
    PRINTF(("Cannot create new entry %08lx.\n", mLastError));
    return FALSE;
  }

  SPropValue propValue;
  LPSPropProblemArray problems = NULL;
  propValue.ulPropTag = PR_MESSAGE_CLASS_A;
  propValue.Value.lpszA = const_cast<char*>(aContactClass);
  mLastError = newEntry->SetProps(1, &propValue, &problems);
  if (HR_FAILED(mLastError)) {
    PRINTF(("Cannot set message class %08lx.\n", mLastError));
    return FALSE;
  }

  if (strcmp(aContactClass, "IPM.DistList") == 0) {
    // Set distribution list name.
    problems = NULL;
    GetDlNameTag(newEntry.Get(), propValue.ulPropTag);
    propValue.Value.lpszW = const_cast<wchar_t*>(aName);
    mLastError = newEntry->SetProps(1, &propValue, &problems);
    if (HR_FAILED(mLastError)) {
      PRINTF(("Cannot set DL name %08lx.\n", mLastError));
      return FALSE;
    }
  }

  mLastError = newEntry->SaveChanges(KEEP_OPEN_READONLY);
  if (HR_FAILED(mLastError)) {
    PRINTF(("Cannot commit new entry %08lx.\n", mLastError));
    return FALSE;
  }

  // Get the entry ID of the contact (IMessage).
  SPropTagArray property;
  LPSPropValue value = NULL;
  ULONG valueCount = 0;
  property.cValues = 1;
  property.aulPropTag[0] = PR_ENTRYID;
  mLastError = newEntry->GetProps(&property, 0, &valueCount, &value);
  if (HR_FAILED(mLastError) || valueCount != 1) {
    PRINTF(("Cannot get entry id %08lx.\n", mLastError));
    return FALSE;
  }

  // Construct the entry ID of the related address book entry (IMailUser).
  AbEntryId* abEntryId =
      (AbEntryId*)moz_xmalloc(sizeof(AbEntryId) + value->Value.bin.cb);
  if (!abEntryId) return FALSE;
  memset(abEntryId, 0, 4);  // Null out the flags.
  memcpy(abEntryId->provider, CONTAB_PROVIDER_ID, CONTAB_PROVIDER_ID_LENGTH);
  memcpy(abEntryId->version, ABENTRY_VERSION, ABENTRY_VERSION_LENGTH);
  memcpy(abEntryId->type, ABENTRY_TYPE, ABENTRY_TYPE_LENGTH);
  abEntryId->index = 0;
  abEntryId->length = value->Value.bin.cb;
  memcpy(abEntryId->idBytes, value->Value.bin.lpb, abEntryId->length);

  aNewEntry.Assign(sizeof(AbEntryId) + value->Value.bin.cb,
                   reinterpret_cast<LPENTRYID>(abEntryId));
  FreeBuffer(value);

  // We need to set a display name otherwise MAPI is really unhappy internally.
  SPropValue displayName;
  displayName.ulPropTag = PR_DISPLAY_NAME_W;
  displayName.Value.lpszW = const_cast<wchar_t*>(aName);
  nsMapiInterfaceWrapper<LPMAPIPROP> object;
  mLastError =
      mAddressBook->OpenEntry(aNewEntry.mByteCount, aNewEntry.mEntryId,
                              &IID_IMAPIProp, MAPI_MODIFY, &objType, object);
  if (HR_FAILED(mLastError)) {
    PRINTF(("Cannot open newly created AB entry %08lx.\n", mLastError));
    return FALSE;
  }
  mLastError = object->SetProps(1, &displayName, &problems);
  if (HR_FAILED(mLastError)) {
    PRINTF(("Cannot set display name %08lx.\n", mLastError));
    return FALSE;
  }

  return TRUE;
}

BOOL nsAbWinHelper::CreateEntry(const nsMapiEntry& aParent,
                                nsMapiEntry& aNewEntry) {
  nsAutoString tempName(L"" kDummyDisplayName);
  tempName.AppendInt(sEntryCounter++);
  return CreateEntryInternal(aParent, aNewEntry, "IPM.Contact", tempName.get());
}

BOOL nsAbWinHelper::CreateDistList(const nsMapiEntry& aParent,
                                   nsMapiEntry& aNewEntry,
                                   const wchar_t* aName) {
  return CreateEntryInternal(aParent, aNewEntry, "IPM.DistList", aName);
}

enum {
  ContentsColumnEntryId = 0,
  ContentsColumnObjectType,
  ContentsColumnsSize
};

static const SizedSPropTagArray(ContentsColumnsSize, ContentsColumns) = {
    ContentsColumnsSize, {PR_ENTRYID, PR_OBJECT_TYPE}};

BOOL nsAbWinHelper::GetContents(const nsMapiEntry& aParent,
                                LPSRestriction aRestriction,
                                nsMapiEntry** aList, ULONG& aNbElements,
                                ULONG aMapiType) {
  if (aList != NULL) {
    *aList = NULL;
  }
  aNbElements = 0;
  nsMapiInterfaceWrapper<LPMAPICONTAINER> parent;
  nsMapiInterfaceWrapper<LPMAPITABLE> contents;
  ULONG objType = 0;
  ULONG rowCount = 0;

  mLastError =
      mAddressBook->OpenEntry(aParent.mByteCount, aParent.mEntryId,
                              &IID_IMAPIContainer, 0, &objType, parent);
  if (HR_FAILED(mLastError)) {
    PRINTF(("Cannot open parent %08lx.\n", mLastError));
    return FALSE;
  }
  // Historic comment: May be relevant in the future.
  // WAB removed in bug 1687132.
  // Here, flags for WAB and MAPI could be different, so this works
  // only as long as we don't want to use any flag in GetContentsTable
  mLastError = parent->GetContentsTable(0, contents);
  if (HR_FAILED(mLastError)) {
    PRINTF(("Cannot get contents %08lx.\n", mLastError));
    return FALSE;
  }
  if (aRestriction != NULL) {
    mLastError = contents->Restrict(aRestriction, 0);
    if (HR_FAILED(mLastError)) {
      PRINTF(("Cannot set restriction %08lx.\n", mLastError));
      return FALSE;
    }
  }
  mLastError = contents->SetColumns((LPSPropTagArray)&ContentsColumns, 0);
  if (HR_FAILED(mLastError)) {
    PRINTF(("Cannot set columns %08lx.\n", mLastError));
    return FALSE;
  }
  mLastError = contents->GetRowCount(0, &rowCount);
  if (HR_FAILED(mLastError)) {
    PRINTF(("Cannot get result count %08lx.\n", mLastError));
    return FALSE;
  }
  if (aList != NULL) {
    *aList = new nsMapiEntry[rowCount];
  }
  aNbElements = 0;
  do {
    LPSRowSet rowSet = NULL;

    rowCount = 0;
    mLastError = contents->QueryRows(1, 0, &rowSet);
    if (HR_FAILED(mLastError)) {
      PRINTF(("Cannot query rows %08lx.\n", mLastError));
      return FALSE;
    }
    rowCount = rowSet->cRows;
    if (rowCount > 0 &&
        (aMapiType == 0 ||
         rowSet->aRow->lpProps[ContentsColumnObjectType].Value.ul ==
             aMapiType)) {
      if (aList != NULL) {
        nsMapiEntry& current = (*aList)[aNbElements];
        SPropValue& currentValue = rowSet->aRow->lpProps[ContentsColumnEntryId];

        // Sometimes Outlooks spits the dummy here :-(
        // That is meant to be a byte count and NOT an error code of 0x8004010F.
        // We gloss over it.
        if (currentValue.Value.bin.cb == MAPI_E_NOT_FOUND ||
            currentValue.Value.bin.lpb == NULL) {
          PRINTF(("Error fetching rows.\n"));
          return TRUE;
        }
        current.Assign(currentValue.Value.bin.cb,
                       reinterpret_cast<LPENTRYID>(currentValue.Value.bin.lpb));
      }
      ++aNbElements;
    }
    MyFreeProws(rowSet);
  } while (rowCount > 0);
  return TRUE;
}

HRESULT nsAbWinHelper::OpenMAPIObject(const nsMapiEntry& aDir,
                                      const nsMapiEntry& aObject,
                                      bool aFromContact, ULONG aFlags,
                                      LPUNKNOWN* aResult) {
  nsMapiEntry storeEntry;
  ULONG contactIdLength = 0;
  LPENTRYID contactId = NULL;
  if (aFromContact) {
    // Get the entry ID of the related store. This won't work for the
    // Global Address List (GAL) since it doesn't provide contacts from a
    // local store.
    if (!GetPropertyBin(aDir, PR_STORE_ENTRYID, storeEntry)) {
      PRINTF(("Cannot get PR_STORE_ENTRYID, likely not a local AB.\n"));
      aFromContact = false;
    }
    // Check for magic provider GUID.
    struct AbEntryId* abEntryId = (struct AbEntryId*)aObject.mEntryId;
    if (memcmp(abEntryId->provider, CONTAB_PROVIDER_ID,
               CONTAB_PROVIDER_ID_LENGTH) != 0) {
      aFromContact = false;
    } else {
      contactIdLength = abEntryId->length;
      contactId = reinterpret_cast<LPENTRYID>(&(abEntryId->idBytes));
    }
  }

  ULONG objType = 0;
  if (aFromContact) {
    // Open the store.
    HRESULT retCode;
    nsMapiInterfaceWrapper<LPMDB> store;
    retCode = mAddressSession->OpenMsgStore(
        0, storeEntry.mByteCount, storeEntry.mEntryId, NULL, 0, store);
    if (HR_FAILED(retCode)) {
      PRINTF(("Cannot open MAPI message store %08lx.\n", retCode));
      return retCode;
    }
    // Open the contact object.
    retCode = store->OpenEntry(contactIdLength, contactId, &IID_IMessage, 0,
                               &objType, aResult);
    return retCode;
  } else {
    // Open the address book object.
    return mAddressBook->OpenEntry(aObject.mByteCount, aObject.mEntryId,
                                   &IID_IMAPIProp, 0, &objType, aResult);
  }
}

BOOL nsAbWinHelper::GetMAPIProperties(const nsMapiEntry& aDir,
                                      const nsMapiEntry& aObject,
                                      const ULONG aPropertyTags[],
                                      ULONG aNbProperties, LPSPropValue& aValue,
                                      ULONG& aValueCount, bool aFromContact) {
  nsMapiInterfaceWrapper<LPMAPIPROP> object;
  LPSPropTagArray properties = NULL;

  mLastError = OpenMAPIObject(aDir, aObject, aFromContact, 0, object);
  if (HR_FAILED(mLastError)) {
    PRINTF(("Cannot open entry %08lx.\n", mLastError));
    return FALSE;
  }
  AllocateBuffer(CbNewSPropTagArray(aNbProperties),
                 reinterpret_cast<void**>(&properties));
  properties->cValues = aNbProperties;
  for (ULONG i = 0; i < aNbProperties; ++i) {
    properties->aulPropTag[i] = aPropertyTags[i];
  }
  mLastError = object->GetProps(properties, 0, &aValueCount, &aValue);
  FreeBuffer(properties);
  if (HR_FAILED(mLastError)) {
    PRINTF(("Cannot get props %08lx.\n", mLastError));
  }
  return HR_SUCCEEDED(mLastError);
}

BOOL nsAbWinHelper::SetMAPIProperties(const nsMapiEntry& aDir,
                                      const nsMapiEntry& aObject,
                                      ULONG aNbProperties,
                                      const LPSPropValue& aValues,
                                      bool aFromContact) {
  nsMapiInterfaceWrapper<LPMAPIPROP> object;
  LPSPropProblemArray problems = NULL;

  mLastError = OpenMAPIObject(aDir, aObject, aFromContact, MAPI_MODIFY, object);
  if (HR_FAILED(mLastError)) {
    PRINTF(("Cannot open entry %08lx.\n", mLastError));
    return FALSE;
  }
  mLastError = object->SetProps(aNbProperties, aValues, &problems);
  if (HR_FAILED(mLastError)) {
    PRINTF(("Cannot update the object %08lx.\n", mLastError));
    return FALSE;
  }
  if (problems != NULL) {
    for (ULONG i = 0; i < problems->cProblem; ++i) {
      PRINTF(("Problem %lu: index %lu code %08lx.\n", i,
              problems->aProblem[i].ulIndex, problems->aProblem[i].scode));
    }
    mAddressFreeBuffer(problems);
  }
  mLastError = object->SaveChanges(0);
  if (HR_FAILED(mLastError)) {
    PRINTF(("Cannot commit changes %08lx.\n", mLastError));
  }
  return HR_SUCCEEDED(mLastError);
}

BOOL nsAbWinHelper::DeleteMAPIProperties(const nsMapiEntry& aDir,
                                         const nsMapiEntry& aObject,
                                         const LPSPropTagArray aProps,
                                         bool aFromContact) {
  nsMapiInterfaceWrapper<LPMAPIPROP> object;
  LPSPropProblemArray problems = NULL;

  mLastError = OpenMAPIObject(aDir, aObject, aFromContact, MAPI_MODIFY, object);
  if (HR_FAILED(mLastError)) {
    PRINTF(("Cannot open entry %08lx.\n", mLastError));
    return FALSE;
  }
  mLastError = object->DeleteProps(aProps, &problems);
  if (HR_FAILED(mLastError)) {
    PRINTF(("Cannot update the object (DeleteProps) %08lx.\n", mLastError));
    return FALSE;
  }
  if (problems != NULL) {
    for (ULONG i = 0; i < problems->cProblem; ++i) {
      PRINTF(("Problem %lu: index %lu code %08lx.\n", i,
              problems->aProblem[i].ulIndex, problems->aProblem[i].scode));
    }
    mAddressFreeBuffer(problems);
  }
  mLastError = object->SaveChanges(0);
  if (HR_FAILED(mLastError)) {
    PRINTF(("Cannot commit changes %08lx.\n", mLastError));
  }
  return HR_SUCCEEDED(mLastError);
}

void nsAbWinHelper::MyFreeProws(LPSRowSet aRowset) {
  if (aRowset == NULL) {
    return;
  }
  ULONG i = 0;

  for (i = 0; i < aRowset->cRows; ++i) {
    FreeBuffer(aRowset->aRow[i].lpProps);
  }
  FreeBuffer(aRowset);
}

nsAbWinHelperGuard::nsAbWinHelperGuard() : mHelper(NULL) {
  mHelper = new nsMapiAddressBook;
}

nsAbWinHelperGuard::~nsAbWinHelperGuard(void) { delete mHelper; }

void makeEntryIdFromURI(const char* aScheme, const char* aUri,
                        nsCString& aEntry) {
  aEntry.Truncate();
  uint32_t schemeLength = strlen(aScheme);

  if (strncmp(aUri, aScheme, schemeLength) == 0) {
    // Assign string from position `schemeLength`.
    aEntry = aUri + schemeLength;

    // Now strip the parent directory before the /.
    int ind = aEntry.FindChar('/');
    if (ind != kNotFound) {
      aEntry = Substring(aEntry, ind + 1);
    }
  }
}

bool nsAbWinHelper::CompareEntryIDs(nsCString& aEntryID1,
                                    nsCString& aEntryID2) {
  ULONG result;
  nsMapiEntry e1;
  nsMapiEntry e2;
  e1.Assign(aEntryID1);
  e2.Assign(aEntryID2);
  mLastError = mAddressSession->CompareEntryIDs(
      e1.mByteCount, e1.mEntryId, e2.mByteCount, e2.mEntryId, 0, &result);
  if (HR_FAILED(mLastError)) {
    PRINTF(("CompareEntryIDs failed with %08lx (CompareEntryIDs()).\n",
            mLastError));
    return false;
  }
  return result ? true : false;
}
