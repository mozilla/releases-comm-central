/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef SuiteDirectoryProvider_h__
#define SuiteDirectoryProvider_h__

#include "nsCOMArray.h"
#include "nsIDirectoryService.h"
#include "nsIFile.h"
#include "nsISimpleEnumerator.h"
#include "nsString.h"
#include "nsCOMPtr.h"
#include "nsIProperties.h"
#include "mozilla/Attributes.h"
#include "nsSuiteCID.h"

#define NS_APP_BOOKMARKS_50_FILE "BMarks"

class nsSuiteDirectoryProvider final : public nsIDirectoryServiceProvider2
{
public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIDIRECTORYSERVICEPROVIDER
  NS_DECL_NSIDIRECTORYSERVICEPROVIDER2

private:
  ~nsSuiteDirectoryProvider() {}

  void EnsureProfileFile(const nsACString& aLeafName,
                         nsIFile* aParentDir, nsIFile* aTarget);

  void AppendDistroSearchDirs(nsIProperties* aDirSvc,
                              nsCOMArray<nsIFile> &array);

  void AppendFileKey(const char *key, nsIProperties* aDirSvc,
                     nsCOMArray<nsIFile> &array);

  class AppendingEnumerator final : public nsISimpleEnumerator
  {
  public:
    NS_DECL_ISUPPORTS
    NS_DECL_NSISIMPLEENUMERATOR

    AppendingEnumerator(nsISimpleEnumerator* aBase,
                        const char* const aLeafName);

  private:
    ~AppendingEnumerator() {}
    void GetNext();

    nsCOMPtr<nsISimpleEnumerator> mBase;
    nsDependentCString            mLeafName;
    nsCOMPtr<nsIFile>             mNext;
  };
};

#endif
