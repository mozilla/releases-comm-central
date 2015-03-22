/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */


#ifndef nsAbBSDirectory_h__
#define nsAbBSDirectory_h__

#include "mozilla/Attributes.h"
#include "nsAbDirProperty.h"

#include "nsDataHashtable.h"
#include "nsCOMArray.h"

class nsAbBSDirectory : public nsAbDirProperty
{
public:
	NS_DECL_ISUPPORTS_INHERITED

	nsAbBSDirectory();

	// nsIAbDirectory methods
  NS_IMETHOD Init(const char *aURI) override;
  NS_IMETHOD GetChildNodes(nsISimpleEnumerator* *result) override;
  NS_IMETHOD CreateNewDirectory(const nsAString &aDirName,
                                const nsACString &aURI,
                                uint32_t aType,
                                const nsACString &aPrefName,
                                nsACString &aResult) override;
  NS_IMETHOD CreateDirectoryByURI(const nsAString &aDisplayName,
                                  const nsACString &aURI) override;
  NS_IMETHOD DeleteDirectory(nsIAbDirectory *directory) override;
  NS_IMETHOD HasDirectory(nsIAbDirectory *dir, bool *hasDir) override;
  NS_IMETHOD UseForAutocomplete(const nsACString &aIdentityKey, bool *aResult) override;
  NS_IMETHOD GetURI(nsACString &aURI) override;

protected:
  virtual ~nsAbBSDirectory();
  nsresult EnsureInitialized();
	nsresult CreateDirectoriesFromFactory(const nsACString &aURI,
                                        DIR_Server* aServer, bool aNotify);

protected:
	bool mInitialized;
	nsCOMArray<nsIAbDirectory> mSubDirectories;
	nsDataHashtable<nsISupportsHashKey, DIR_Server*> mServers;
};

#endif
