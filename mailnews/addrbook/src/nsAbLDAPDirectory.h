/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsAbLDAPDirectory_h__
#define nsAbLDAPDirectory_h__

#include "mozilla/Attributes.h"
#include "nsAbDirProperty.h"
#include "nsAbLDAPDirectoryModify.h"
#include "nsIAbDirectoryQuery.h"
#include "nsIAbDirectorySearch.h"
#include "nsIAbDirSearchListener.h"
#include "nsIAbLDAPDirectory.h"
#include "nsIMutableArray.h"
#include "nsInterfaceHashtable.h"
#include "mozilla/Mutex.h"

class nsAbLDAPDirectory :
  public nsAbDirProperty,             // nsIAbDirectory
  public nsAbLDAPDirectoryModify,
  public nsIAbDirectorySearch,
  public nsIAbLDAPDirectory,
  public nsIAbDirSearchListener
{
public:
  NS_DECL_ISUPPORTS_INHERITED

  nsAbLDAPDirectory();

  NS_IMETHOD Init(const char *aUri) override;

  // nsIAbDirectory methods
  NS_IMETHOD GetPropertiesChromeURI(nsACString &aResult) override;
  NS_IMETHOD GetURI(nsACString &aURI) override;
  NS_IMETHOD GetChildNodes(nsISimpleEnumerator* *result) override;
  NS_IMETHOD GetChildCards(nsISimpleEnumerator* *result) override;
  NS_IMETHOD GetIsQuery(bool *aResult) override;
  NS_IMETHOD HasCard(nsIAbCard *cards, bool *hasCard) override;
  NS_IMETHOD GetSupportsMailingLists(bool *aSupportsMailingsLists) override;
  NS_IMETHOD GetReadOnly(bool *aReadOnly) override;
  NS_IMETHOD GetIsRemote(bool *aIsRemote) override;
  NS_IMETHOD GetIsSecure(bool *aIsRemote) override;
  NS_IMETHOD UseForAutocomplete(const nsACString &aIdentityKey, bool *aResult) override;
  NS_IMETHOD AddCard(nsIAbCard *aChildCard, nsIAbCard **aAddedCard) override;
  NS_IMETHOD ModifyCard(nsIAbCard *aModifiedCard) override;
  NS_IMETHOD DeleteCards(nsIArray *aCards) override;

  // nsIAbDirectorySearch methods
  NS_DECL_NSIABDIRECTORYSEARCH
  NS_DECL_NSIABLDAPDIRECTORY
  NS_DECL_NSIABDIRSEARCHLISTENER

protected:
  virtual ~nsAbLDAPDirectory();
  nsresult Initiate();

  nsresult SplitStringList(const nsACString& aString,
                           uint32_t *aCount,
                           char ***aValues);

  bool mPerformingQuery;
  int32_t mContext;
  int32_t mMaxHits;

  nsInterfaceHashtable<nsISupportsHashKey, nsIAbCard> mCache;

  mozilla::Mutex mLock;
  nsCOMPtr<nsIAbDirectoryQuery> mDirectoryQuery;
  nsCOMPtr<nsIMutableArray> mSearchServerControls;
  nsCOMPtr<nsIMutableArray> mSearchClientControls;
};

#endif
