/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/********************************************************************************************************
 
   Interface for representing Address Book Directory
 
*********************************************************************************************************/

#ifndef nsAbMDBDirectory_h__
#define nsAbMDBDirectory_h__

#include "mozilla/Attributes.h"
#include "nsAbMDBDirProperty.h"  
#include "nsIAbCard.h"
#include "nsCOMArray.h"
#include "nsCOMPtr.h"
#include "nsDirPrefs.h"
#include "nsIAbDirectorySearch.h"
#include "nsIAbDirSearchListener.h"
#include "nsInterfaceHashtable.h"
#include "nsIAddrDBListener.h"

/* 
 * Address Book Directory
 */ 

class nsAbMDBDirectory:
  public nsAbMDBDirProperty,	// nsIAbDirectory, nsIAbMDBDirectory
  public nsIAbDirSearchListener,
  public nsIAddrDBListener, 
  public nsIAbDirectorySearch
{
public: 
  nsAbMDBDirectory(void);

  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_NSIADDRDBLISTENER

  // Override nsAbMDBDirProperty::Init
  NS_IMETHOD Init(const char *aUri) override;

  // nsIAbMDBDirectory methods
  NS_IMETHOD GetURI(nsACString &aURI) override;
  NS_IMETHOD ClearDatabase() override;
  NS_IMETHOD NotifyDirItemAdded(nsISupports *item) override { return NotifyItemAdded(item);}
  NS_IMETHOD RemoveElementsFromAddressList() override;
  NS_IMETHOD RemoveEmailAddressAt(uint32_t aIndex) override;
  NS_IMETHOD AddDirectory(const char *uriName, nsIAbDirectory **childDir) override;
  NS_IMETHOD GetDatabaseFile(nsIFile **aResult) override;
  NS_IMETHOD GetDatabase(nsIAddrDatabase **aResult) override;

  // nsIAbDirectory methods:
  NS_IMETHOD GetChildNodes(nsISimpleEnumerator* *result) override;
  NS_IMETHOD GetChildCards(nsISimpleEnumerator* *result) override;
  NS_IMETHOD GetIsQuery(bool *aResult) override;
  NS_IMETHOD DeleteDirectory(nsIAbDirectory *directory) override;
  NS_IMETHOD DeleteCards(nsIArray *cards) override;
  NS_IMETHOD HasCard(nsIAbCard *cards, bool *hasCard) override;
  NS_IMETHOD HasDirectory(nsIAbDirectory *dir, bool *hasDir) override;
  NS_IMETHOD AddMailList(nsIAbDirectory *list, nsIAbDirectory **addedList) override;
  NS_IMETHOD AddCard(nsIAbCard *card, nsIAbCard **addedCard) override;
  NS_IMETHOD ModifyCard(nsIAbCard *aModifiedCard) override;
  NS_IMETHOD DropCard(nsIAbCard *card, bool needToCopyCard) override;
  NS_IMETHOD EditMailListToDatabase(nsIAbCard *listCard) override;
  NS_IMETHOD CardForEmailAddress(const nsACString &aEmailAddress,
                                 nsIAbCard ** aAbCard) override;
  NS_IMETHOD GetCardFromProperty(const char *aProperty,
                                 const nsACString &aValue,
                                 bool caseSensitive, nsIAbCard **result) override;
  NS_IMETHOD GetCardsFromProperty(const char *aProperty,
                                  const nsACString &aValue,
                                  bool caseSensitive,
                                  nsISimpleEnumerator **result) override;

  // nsIAbDirectorySearch methods
  NS_DECL_NSIABDIRECTORYSEARCH

  // nsIAbDirSearchListener methods
  NS_DECL_NSIABDIRSEARCHLISTENER

protected:
  virtual ~nsAbMDBDirectory();
  nsresult NotifyPropertyChanged(nsIAbDirectory *list, const char *property, const char16_t* oldValue, const char16_t* newValue);
  nsresult NotifyItemAdded(nsISupports *item);
  nsresult NotifyItemDeleted(nsISupports *item);
  nsresult NotifyItemChanged(nsISupports *item);
  nsresult RemoveCardFromAddressList(nsIAbCard* card);

  nsresult GetAbDatabase();
  nsCOMPtr<nsIAddrDatabase> mDatabase;  

  nsCOMArray<nsIAbDirectory> mSubDirectories;

  int32_t mContext;
  bool mPerformingQuery;

  nsInterfaceHashtable<nsISupportsHashKey, nsIAbCard> mSearchCache;
};

#endif
