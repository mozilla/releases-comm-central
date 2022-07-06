/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#ifndef nsAbWinHelper_h___
#define nsAbWinHelper_h___

#include <windows.h>
#include "../../mapi/include/mapix.h"

#include "nsString.h"
#include "mozilla/StaticMutex.h"

#define kOutlookDirectoryScheme "moz-aboutlookdirectory:///"
#define kOutlookCardScheme "moz-aboutlookcard:///"
#define kDummyDisplayName "__MailUser__"

struct nsMapiEntry {
  // Can't be assigned since it would double up the reference in `mEntryId`.
  nsMapiEntry& operator=(nsMapiEntry&) = delete;
  ULONG mByteCount;
  LPENTRYID mEntryId;

  nsMapiEntry(void);
  ~nsMapiEntry(void);
  nsMapiEntry(ULONG aByteCount, LPENTRYID aEntryId);

  static void Move(nsMapiEntry& target, nsMapiEntry& source);
  void Assign(ULONG aByteCount, LPENTRYID aEntryId);
  void Assign(const nsCString& aString);
  void ToString(nsCString& aString) const;
  void Dump(void) const;
};

struct nsMapiEntryArray {
  nsMapiEntry* mEntries;
  ULONG mNbEntries;

  nsMapiEntryArray(void);
  ~nsMapiEntryArray(void);

  void CleanUp(void);
};

class nsAbWinHelper {
 public:
  nsAbWinHelper(void);
  virtual ~nsAbWinHelper(void);

  // Get the top address books
  BOOL GetFolders(nsMapiEntryArray& aFolders);
  // Get a list of entries for cards/mailing lists in a folder/mailing list
  BOOL GetCards(const nsMapiEntry& aParent, LPSRestriction aRestriction,
                nsMapiEntryArray& aCards);
  // Get a list of mailing lists in a folder
  BOOL GetNodes(const nsMapiEntry& aParent, nsMapiEntryArray& aNodes);
  // Get the number of cards/mailing lists in a folder/mailing list
  BOOL GetCardsCount(const nsMapiEntry& aParent, ULONG& aNbCards);
  // Access last MAPI error
  HRESULT LastError(void) const { return mLastError; }
  // Get the value of a MAPI property of type string
  BOOL GetPropertyString(const nsMapiEntry& aObject, ULONG aPropertyTag,
                         nsCString& aValue);
  // Same as previous, but string is returned as unicode.
  BOOL GetPropertyUString(const nsMapiEntry& aObject, ULONG aPropertyTag,
                          nsString& aValue);
  // Get multiple string MAPI properties in one call.
  // Retrieves the properties from the associated contact object (IMessage)
  // not the address book entry (IMailUser).
  BOOL GetPropertiesUString(const nsMapiEntry& aDir, const nsMapiEntry& aObject,
                            const ULONG aPropertyTags[], ULONG aNbProperties,
                            nsString aValues[], bool aSuccess[]);
  // Get the value of a MAPI property of type SYSTIME
  BOOL GetPropertyDate(const nsMapiEntry& aDir, const nsMapiEntry& aObject,
                       bool fromContact, ULONG aPropertyTag, WORD& aYear,
                       WORD& aMonth, WORD& aDay);
  // Get the value of a MAPI property of type LONG
  BOOL GetPropertyLong(const nsMapiEntry& aObject, ULONG aPropertyTag,
                       ULONG& aValue);
  // Get the value of a MAPI property of type BIN
  BOOL GetPropertyBin(const nsMapiEntry& aObject, ULONG aPropertyTag,
                      nsMapiEntry& aValue);
  // Get the values of a multiple MAPI properties of type MV BIN
  BOOL GetPropertiesMVBin(const nsMapiEntry& aDir, const nsMapiEntry& aObject,
                          const ULONG aPropertyTags[], ULONG aNbProperties,
                          nsMapiEntry* aEntryIDs[], ULONG aNbElements[],
                          bool aAllocateMore = false);
  // Set the value of a MAPI property of type MV BIN
  BOOL SetPropertiesMVBin(const nsMapiEntry& aDir, const nsMapiEntry& aObject,
                          const ULONG aPropertyTags[], ULONG aNbProperties,
                          nsMapiEntry* aEntryIDs[], ULONG aNbElements[]);
  // Tests if a container contains an entry
  BOOL TestOpenEntry(const nsMapiEntry& aContainer, const nsMapiEntry& aEntry);
  // Delete an entry in the address book
  BOOL DeleteEntry(const nsMapiEntry& aContainer, const nsMapiEntry& aEntry);
  // Delete an entry from an Outlook distribution list.
  BOOL DeleteEntryfromDL(const nsMapiEntry& aTopDir,
                         const nsMapiEntry& aDistList,
                         const nsMapiEntry& aEntry);
  // Add an entry to an Outlook distribution list.
  BOOL AddEntryToDL(const nsMapiEntry& aTopDir, const nsMapiEntry& aDistList,
                    const nsMapiEntry& aEntry, const wchar_t* aDisplay,
                    const wchar_t* aEmail);
  // Set the value of a MAPI property of type string in unicode
  BOOL SetPropertyUString(const nsMapiEntry& aObject, ULONG aPropertyTag,
                          const char16_t* aValue);
  // Same as previous, but with a bunch of properties in one call.
  // Sets the properties on the associated contact object (IMessage)
  // not the address book entry (IMailUser).
  BOOL SetPropertiesUString(const nsMapiEntry& aDir, const nsMapiEntry& aObject,
                            const ULONG aPropertyTags[], ULONG aNbProperties,
                            nsString aValues[]);
  // Set the value of a MAPI property of type SYSTIME
  BOOL SetPropertyDate(const nsMapiEntry& aDir, const nsMapiEntry& aObject,
                       bool fromContact, ULONG aPropertyTag, WORD aYear,
                       WORD aMonth, WORD aDay);
  // Create entry in the address book
  BOOL CreateEntry(const nsMapiEntry& aParent, nsMapiEntry& aNewEntry);
  // Create a distribution list in the address book
  BOOL CreateDistList(const nsMapiEntry& aParent, nsMapiEntry& aNewEntry,
                      const wchar_t* aName);
  // Create entry worker
  BOOL CreateEntryInternal(const nsMapiEntry& aParent, nsMapiEntry& aNewEntry,
                           const char* aContactClass, const wchar_t* aName);
  // Is the helper correctly initialised?
  BOOL IsOK(void) const { return mAddressBook != NULL; }
  // Helper to get distribution list members tag.
  BOOL GetDlMembersTag(IMAPIProp* aMsg, ULONG& aDlMembersTag,
                       ULONG& aDlMembersTagOneOff);
  // Helper to get distribution list name tag.
  BOOL GetDlNameTag(IMAPIProp* aMsg, ULONG& aDlNameTag);
  // Helper to compare entry IDs.
  bool CompareEntryIDs(nsCString& aEntryID1, nsCString& aEntryID2);

 protected:
  HRESULT mLastError;
  LPADRBOOK mAddressBook;
  LPMAPISESSION mAddressSession;
  LPMAPIFREEBUFFER mAddressFreeBuffer;
  static uint32_t sEntryCounter;
  static mozilla::StaticMutex sMutex;

  // Retrieve the contents of a container, with an optional restriction
  BOOL GetContents(const nsMapiEntry& aParent, LPSRestriction aRestriction,
                   nsMapiEntry** aList, ULONG& aNbElements, ULONG aMapiType);
  // Retrieve the values of a set of properties on a MAPI object
  BOOL GetMAPIProperties(const nsMapiEntry& aDir, const nsMapiEntry& aObject,
                         const ULONG aPropertyTags[], ULONG aNbProperties,
                         LPSPropValue& aValues, ULONG& aValueCount,
                         bool aFromContact = false);
  // Set the values of a set of properties on a MAPI object
  BOOL SetMAPIProperties(const nsMapiEntry& aDir, const nsMapiEntry& aObject,
                         ULONG aNbProperties, const LPSPropValue& aValues,
                         bool aFromContact);
  // Delete a set of properties on a MAPI object
  BOOL DeleteMAPIProperties(const nsMapiEntry& aDir, const nsMapiEntry& aObject,
                            const LPSPropTagArray aProps, bool aFromContact);
  HRESULT OpenMAPIObject(const nsMapiEntry& aDir, const nsMapiEntry& aObject,
                         bool aFromContact, ULONG aFlags, LPUNKNOWN* aResult);
  // Clean-up a rowset returned by QueryRows
  void MyFreeProws(LPSRowSet aSet);
  // Allocation of a buffer for transmission to interfaces
  virtual void AllocateBuffer(ULONG aByteCount, LPVOID* aBuffer) = 0;
  // Destruction of a buffer provided by the interfaces
  virtual void FreeBuffer(LPVOID aBuffer) = 0;

 private:
};

class nsAbWinHelperGuard {
 public:
  explicit nsAbWinHelperGuard();
  ~nsAbWinHelperGuard(void);

  nsAbWinHelper* operator->(void) { return mHelper; }

 private:
  nsAbWinHelper* mHelper;
};

void makeEntryIdFromURI(const char* aScheme, const char* aUri,
                        nsCString& aEntry);
#endif  // nsAbWinHelper_h___
