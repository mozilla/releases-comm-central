/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsCOMPtr.h"
#include "nsComponentManagerUtils.h"
#include "nsServiceManagerUtils.h"
#include "nsIFile.h"
#include "nsISimpleEnumerator.h"
#include "nsIDirectoryEnumerator.h"
#include "nsIMutableArray.h"
#include "nsStringGlue.h"
#include "nsAbBaseCID.h"
#include "nsIAbManager.h"
#include "nsIImportService.h"
#include "nsIImportABDescriptor.h"
#include "nsMsgUtils.h"
#include "nsIStringBundle.h"
#include "nsVCardAddress.h"

#include "nsBeckyAddressBooks.h"
#include "nsBeckyStringBundle.h"
#include "nsBeckyUtils.h"

NS_IMPL_ISUPPORTS(nsBeckyAddressBooks, nsIImportAddressBooks)

nsresult
nsBeckyAddressBooks::Create(nsIImportAddressBooks **aImport)
{
  NS_ENSURE_ARG_POINTER(aImport);

  *aImport = new nsBeckyAddressBooks();

  NS_ADDREF(*aImport);
  return NS_OK;
}

nsBeckyAddressBooks::nsBeckyAddressBooks()
: mReadBytes(0)
{
}

nsBeckyAddressBooks::~nsBeckyAddressBooks()
{
}

NS_IMETHODIMP
nsBeckyAddressBooks::GetSupportsMultiple(bool *_retval)
{
  NS_ENSURE_ARG_POINTER(_retval);
  *_retval = true;
  return NS_OK;
}

NS_IMETHODIMP
nsBeckyAddressBooks::GetAutoFind(char16_t **aDescription,
                                 bool *_retval)
{
  NS_ENSURE_ARG_POINTER(aDescription);
  NS_ENSURE_ARG_POINTER(_retval);

  *aDescription =
    nsBeckyStringBundle::GetStringByName(u"BeckyImportDescription");
  *_retval = false;

  return NS_OK;
}

NS_IMETHODIMP
nsBeckyAddressBooks::GetNeedsFieldMap(nsIFile *aLocation, bool *_retval)
{
  NS_ENSURE_ARG_POINTER(_retval);

  *_retval = false;
  return NS_OK;
}

nsresult
nsBeckyAddressBooks::FindAddressBookDirectory(nsIFile **aAddressBookDirectory)
{
  nsCOMPtr<nsIFile> userDirectory;
  nsresult rv = nsBeckyUtils::FindUserDirectory(getter_AddRefs(userDirectory));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = userDirectory->Append(NS_LITERAL_STRING("AddrBook"));
  NS_ENSURE_SUCCESS(rv, rv);

  bool exists = false;
  rv = userDirectory->Exists(&exists);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!exists)
    return NS_ERROR_FILE_NOT_FOUND;

  bool isDirectory = false;
  rv = userDirectory->IsDirectory(&isDirectory);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!isDirectory)
    return NS_ERROR_FILE_NOT_FOUND;

  userDirectory.forget(aAddressBookDirectory);
  return NS_OK;
}

NS_IMETHODIMP
nsBeckyAddressBooks::GetDefaultLocation(nsIFile **aLocation,
                                        bool *aFound,
                                        bool *aUserVerify)
{
  NS_ENSURE_ARG_POINTER(aFound);
  NS_ENSURE_ARG_POINTER(aLocation);
  NS_ENSURE_ARG_POINTER(aUserVerify);

  *aLocation = nullptr;
  *aFound = false;
  *aUserVerify = true;

  if (NS_SUCCEEDED(nsBeckyAddressBooks::FindAddressBookDirectory(aLocation))) {
    *aFound = true;
    *aUserVerify = false;
  }

  return NS_OK;
}

nsresult
nsBeckyAddressBooks::CreateAddressBookDescriptor(nsIImportABDescriptor **aDescriptor)
{
  nsresult rv;
  nsCOMPtr<nsIImportService> importService = do_GetService(NS_IMPORTSERVICE_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  return importService->CreateNewABDescriptor(aDescriptor);
}

bool
nsBeckyAddressBooks::IsAddressBookFile(nsIFile *aFile)
{
  if (!aFile)
    return false;

  nsresult rv;
  bool isFile = false;
  rv = aFile->IsFile(&isFile);
  if (NS_FAILED(rv) && !isFile)
    return false;

  nsAutoString name;
  rv = aFile->GetLeafName(name);
  return StringEndsWith(name, NS_LITERAL_STRING(".bab"));
}

bool
nsBeckyAddressBooks::HasAddressBookFile(nsIFile *aDirectory)
{
  if (!aDirectory)
    return false;

  nsresult rv;
  bool isDirectory = false;
  rv = aDirectory->IsDirectory(&isDirectory);
  if (NS_FAILED(rv) || !isDirectory)
    return false;

  nsCOMPtr<nsISimpleEnumerator> entries;
  rv = aDirectory->GetDirectoryEntries(getter_AddRefs(entries));
  NS_ENSURE_SUCCESS(rv, false);

  bool more;
  nsCOMPtr<nsISupports> entry;
  while (NS_SUCCEEDED(entries->HasMoreElements(&more)) && more) {
    rv = entries->GetNext(getter_AddRefs(entry));
    NS_ENSURE_SUCCESS(rv, false);

    nsCOMPtr<nsIFile> file = do_QueryInterface(entry, &rv);
    NS_ENSURE_SUCCESS(rv, false);
    if (IsAddressBookFile(file))
      return true;
  }

  return false;
}

uint32_t
nsBeckyAddressBooks::CountAddressBookSize(nsIFile *aDirectory)
{
  if (!aDirectory)
    return 0;

  nsresult rv;
  bool isDirectory = false;
  rv = aDirectory->IsDirectory(&isDirectory);
  if (NS_FAILED(rv) || !isDirectory)
    return 0;

  nsCOMPtr<nsISimpleEnumerator> entries;
  rv = aDirectory->GetDirectoryEntries(getter_AddRefs(entries));
  NS_ENSURE_SUCCESS(rv, 0);

  uint32_t total = 0;
  bool more;
  nsCOMPtr<nsISupports> entry;
  while (NS_SUCCEEDED(entries->HasMoreElements(&more)) && more) {
    rv = entries->GetNext(getter_AddRefs(entry));
    NS_ENSURE_SUCCESS(rv, 0);

    nsCOMPtr<nsIFile> file = do_QueryInterface(entry, &rv);
    NS_ENSURE_SUCCESS(rv, 0);

    int64_t size;
    file->GetFileSize(&size);
    if (total + size > std::numeric_limits<uint32_t>::max())
      return std::numeric_limits<uint32_t>::max();

    total += static_cast<uint32_t>(size);
  }

  return total;
}

nsresult
nsBeckyAddressBooks::AppendAddressBookDescriptor(nsIFile *aEntry,
                                                 nsIMutableArray *aCollected)
{
  NS_ENSURE_ARG_POINTER(aCollected);

  if (!HasAddressBookFile(aEntry))
    return NS_OK;

  nsresult rv;
  nsCOMPtr<nsIImportABDescriptor> descriptor;
  rv = CreateAddressBookDescriptor(getter_AddRefs(descriptor));
  NS_ENSURE_SUCCESS(rv, rv);

  uint32_t size = CountAddressBookSize(aEntry);
  descriptor->SetSize(size);
  descriptor->SetAbFile(aEntry);

  nsAutoString name;
  aEntry->GetLeafName(name);
  descriptor->SetPreferredName(name);

  return aCollected->AppendElement(descriptor, false);
}

nsresult
nsBeckyAddressBooks::CollectAddressBooks(nsIFile *aTarget,
                                         nsIMutableArray *aCollected)
{
  nsresult rv = AppendAddressBookDescriptor(aTarget, aCollected);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsISimpleEnumerator> entries;
  rv = aTarget->GetDirectoryEntries(getter_AddRefs(entries));
  NS_ENSURE_SUCCESS(rv, rv);

  bool more;
  nsCOMPtr<nsISupports> entry;
  while (NS_SUCCEEDED(entries->HasMoreElements(&more)) && more) {
    rv = entries->GetNext(getter_AddRefs(entry));
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIFile> file = do_QueryInterface(entry, &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    bool isDirectory = false;
    rv = file->IsDirectory(&isDirectory);
    if (NS_SUCCEEDED(rv) && isDirectory)
      rv = CollectAddressBooks(file, aCollected);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  return NS_OK;
}

NS_IMETHODIMP
nsBeckyAddressBooks::FindAddressBooks(nsIFile *aLocation,
                                      nsIArray **_retval)
{
  NS_ENSURE_ARG_POINTER(aLocation);
  NS_ENSURE_ARG_POINTER(_retval);

  nsresult rv;
  nsCOMPtr<nsIMutableArray> array(do_CreateInstance(NS_ARRAY_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  bool isDirectory = false;
  rv = aLocation->IsDirectory(&isDirectory);
  if (NS_FAILED(rv) || !isDirectory)
    return NS_ERROR_FAILURE;

  rv = CollectAddressBooks(aLocation, array);
  NS_ENSURE_SUCCESS(rv, rv);

  array.forget(_retval);

  return NS_OK;
}

NS_IMETHODIMP
nsBeckyAddressBooks::InitFieldMap(nsIImportFieldMap *aFieldMap)
{
  return NS_ERROR_FAILURE;
}

NS_IMETHODIMP
nsBeckyAddressBooks::ImportAddressBook(nsIImportABDescriptor *aSource,
                                       nsIAddrDatabase *aDestination,
                                       nsIImportFieldMap *aFieldMap,
                                       nsISupports *aSupportService,
                                       char16_t **aErrorLog,
                                       char16_t **aSuccessLog,
                                       bool *aFatalError)
{
  NS_ENSURE_ARG_POINTER(aSource);
  NS_ENSURE_ARG_POINTER(aDestination);
  NS_ENSURE_ARG_POINTER(aErrorLog);
  NS_ENSURE_ARG_POINTER(aSuccessLog);
  NS_ENSURE_ARG_POINTER(aFatalError);

  mReadBytes = 0;

  nsCOMPtr<nsIFile> file;
  nsresult rv = aSource->GetAbFile(getter_AddRefs(file));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsISimpleEnumerator> entries;
  rv = file->GetDirectoryEntries(getter_AddRefs(entries));
  NS_ENSURE_SUCCESS(rv, rv);

  bool more;
  nsCOMPtr<nsISupports> entry;
  nsAutoString error;
  while (NS_SUCCEEDED(entries->HasMoreElements(&more)) && more) {
    rv = entries->GetNext(getter_AddRefs(entry));
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIFile> file = do_QueryInterface(entry, &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    if (!IsAddressBookFile(file))
      continue;

    bool aborted = false;
    nsAutoString name;
    aSource->GetPreferredName(name);
    nsVCardAddress vcard;
    rv = vcard.ImportAddresses(&aborted, name.get(), file, aDestination, error, &mReadBytes);
    if (NS_FAILED(rv)) {
      break;
    }
  }

  if (!error.IsEmpty())
    *aErrorLog = ToNewUnicode(error);
  else
    *aSuccessLog = nsBeckyStringBundle::GetStringByName(u"BeckyImportAddressSuccess");

  return rv;
}

NS_IMETHODIMP
nsBeckyAddressBooks::GetImportProgress(uint32_t *_retval)
{
  NS_ENSURE_ARG_POINTER(_retval);
  *_retval = mReadBytes;
  return NS_OK;
}

NS_IMETHODIMP
nsBeckyAddressBooks::SetSampleLocation(nsIFile *aLocation)
{
  return NS_OK;
}

NS_IMETHODIMP
nsBeckyAddressBooks::GetSampleData(int32_t aRecordNumber,
                                   bool *aRecordExists,
                                   char16_t **_retval)
{
  return NS_ERROR_FAILURE;
}

