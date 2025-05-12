/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsSuiteDirectoryProvider.h"
#include "nsAppDirectoryServiceDefs.h"
#include "nsCategoryManagerUtils.h"
#include "nsXULAppAPI.h"
#include "nsDirectoryServiceUtils.h"
#include "nsIPrefBranch.h"
#include "nsDirectoryServiceDefs.h"
#include "mozilla/intl/LocaleService.h"
#include "nsIPrefService.h"
#include "nsArrayEnumerator.h"
#include "nsEnumeratorUtils.h"

using mozilla::intl::LocaleService;

NS_IMPL_ISUPPORTS(nsSuiteDirectoryProvider,
                   nsIDirectoryServiceProvider,
                   nsIDirectoryServiceProvider2)

NS_IMETHODIMP
nsSuiteDirectoryProvider::GetFile(const char *aKey,
                                  bool *aPersist,
                                  nsIFile* *aResult)
{
  // NOTE: This function can be reentrant through the NS_GetSpecialDirectory
  // call, so be careful not to cause infinite recursion.
  // i.e. the check for supported files must come first.
  const char* leafName = nullptr;

  if (!strcmp(aKey, NS_APP_BOOKMARKS_50_FILE))
    leafName = "bookmarks.html";
  else if (!strcmp(aKey, NS_APP_USER_PANELS_50_FILE))
    leafName = "panels.rdf";
  else
    return NS_ERROR_FAILURE;

  nsCOMPtr<nsIFile> parentDir;
  nsresult rv = NS_GetSpecialDirectory(NS_APP_USER_PROFILE_50_DIR,
                                       getter_AddRefs(parentDir));
  if (NS_FAILED(rv))
    return rv;

  nsCOMPtr<nsIFile> file;
  rv = parentDir->Clone(getter_AddRefs(file));
  if (NS_FAILED(rv))
    return rv;

  nsDependentCString leafStr(leafName);
  file->AppendNative(leafStr);

  bool exists;
  if (NS_SUCCEEDED(file->Exists(&exists)) && !exists)
    EnsureProfileFile(leafStr, parentDir, file);

  *aPersist = true;
  NS_IF_ADDREF(*aResult = file);

  return NS_OK;
}

NS_IMETHODIMP
nsSuiteDirectoryProvider::GetFiles(const char *aKey,
                                   nsISimpleEnumerator* *aResult)
{
  nsresult rv;
  nsCOMPtr<nsIProperties> dirSvc(do_GetService(NS_DIRECTORY_SERVICE_CONTRACTID, &rv));
  if (NS_FAILED(rv))
    return rv;

  nsCOMArray<nsIFile> baseFiles;
  AppendDistroSearchDirs(dirSvc, baseFiles);

  nsCOMPtr<nsISimpleEnumerator> baseEnum;
  rv = NS_NewArrayEnumerator(getter_AddRefs(baseEnum), baseFiles);
  if (NS_FAILED(rv))
    return rv;

  return NS_ERROR_FAILURE;
}

void
nsSuiteDirectoryProvider::EnsureProfileFile(const nsACString& aLeafName,
                                            nsIFile* aParentDir,
                                            nsIFile* aTarget)
{
  nsCOMPtr<nsIFile> defaultsDir;

  NS_GetSpecialDirectory(NS_APP_DEFAULTS_50_DIR,
                        getter_AddRefs(defaultsDir));
  if (!defaultsDir)
    return;

  nsresult rv = defaultsDir->AppendNative("profile"_ns);
  NS_ENSURE_SUCCESS_VOID(rv);

  defaultsDir->AppendNative(aLeafName);

  defaultsDir->CopyToNative(aParentDir, aLeafName);
}

NS_IMPL_ISUPPORTS(nsSuiteDirectoryProvider::AppendingEnumerator,
                   nsISimpleEnumerator)

NS_IMETHODIMP
nsSuiteDirectoryProvider::AppendingEnumerator::HasMoreElements(bool *aResult)
{
  *aResult = mNext != nullptr;
  return NS_OK;
}

void
nsSuiteDirectoryProvider::AppendingEnumerator::GetNext()
{
  // Ignore all errors

  bool more;
  while (NS_SUCCEEDED(mBase->HasMoreElements(&more)) && more) {
    nsCOMPtr<nsISupports> nextSupports;
    mBase->GetNext(getter_AddRefs(nextSupports));

    mNext = do_QueryInterface(nextSupports);
    if (!mNext)
      continue;

    mNext->AppendNative(mLeafName);

    bool exists;
    if (NS_SUCCEEDED(mNext->Exists(&exists)) && exists)
      return;
  }

  mNext = nullptr;
}

NS_IMETHODIMP
nsSuiteDirectoryProvider::AppendingEnumerator::GetNext(nsISupports* *aResult)
{
  NS_ENSURE_ARG_POINTER(aResult);

  if (!mNext) {
    *aResult = nullptr;
    return NS_ERROR_FAILURE;
  }

  NS_ADDREF(*aResult = mNext);

  GetNext();

  return NS_OK;
}

nsSuiteDirectoryProvider::AppendingEnumerator::AppendingEnumerator
    (nsISimpleEnumerator* aBase, const char* const aLeafName) :
  mBase(aBase), mLeafName(aLeafName)
{
  // Initialize mNext to begin.
  GetNext();
}

// Appends the distribution-specific search engine directories to the
// array.  The directory structure is as follows:

// appdir/
// \- distribution/
//    \- searchplugins/
//       |- common/
//       \- locale/
//          |- <locale 1>/
//          ...
//          \- <locale N>/

// common engines are loaded for all locales.  If there is no locale
// directory for the current locale, there is a pref:
// "distribution.searchplugins.defaultLocale"
// which specifies a default locale to use.

void
nsSuiteDirectoryProvider::AppendDistroSearchDirs(nsIProperties* aDirSvc,
                                                 nsCOMArray<nsIFile> &array)
{
  nsCOMPtr<nsIFile> searchPlugins;
  nsresult rv = aDirSvc->Get(NS_XPCOM_CURRENT_PROCESS_DIR,
                             NS_GET_IID(nsIFile),
                             getter_AddRefs(searchPlugins));
  if (NS_FAILED(rv))
    return;
  searchPlugins->AppendNative("distribution"_ns);
  searchPlugins->AppendNative("searchplugins"_ns);

  bool exists;
  rv = searchPlugins->Exists(&exists);
  if (NS_FAILED(rv) || !exists)
    return;

  nsCOMPtr<nsIFile> commonPlugins;
  rv = searchPlugins->Clone(getter_AddRefs(commonPlugins));
  if (NS_SUCCEEDED(rv)) {
    commonPlugins->AppendNative("common"_ns);
    rv = commonPlugins->Exists(&exists);
    if (NS_SUCCEEDED(rv) && exists)
        array.AppendObject(commonPlugins);
  }

  nsCOMPtr<nsIPrefBranch> prefs(do_GetService(NS_PREFSERVICE_CONTRACTID));
  if (prefs) {
    nsCOMPtr<nsIFile> localePlugins;
    rv = searchPlugins->Clone(getter_AddRefs(localePlugins));
    if (NS_FAILED(rv))
      return;

    localePlugins->AppendNative("locale"_ns);

    // we didn't append the locale dir - try the default one
    nsCString defLocale;
    rv = prefs->GetCharPref("distribution.searchplugins.defaultLocale",
                            defLocale);
    if (NS_SUCCEEDED(rv)) {
      nsCOMPtr<nsIFile> defLocalePlugins;
      rv = localePlugins->Clone(getter_AddRefs(defLocalePlugins));
      if (NS_SUCCEEDED(rv)) {
        defLocalePlugins->AppendNative(defLocale);
        rv = defLocalePlugins->Exists(&exists);
        if (NS_SUCCEEDED(rv) && exists) {
          array.AppendObject(defLocalePlugins);
          return; // all done
        }
      }
    }

    // we didn't have a defaultLocale, use the user agent locale
    nsAutoCString locale;
    LocaleService::GetInstance()->GetAppLocaleAsLangTag(locale);

    nsCOMPtr<nsIFile> curLocalePlugins;
    rv = localePlugins->Clone(getter_AddRefs(curLocalePlugins));
    if (NS_SUCCEEDED(rv)) {
      curLocalePlugins->AppendNative(locale);
      rv = curLocalePlugins->Exists(&exists);
      if (NS_SUCCEEDED(rv) && exists) {
        array.AppendObject(curLocalePlugins);
        return; // all done
      }
    }
  }
}
