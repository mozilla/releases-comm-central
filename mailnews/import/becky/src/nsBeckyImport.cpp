/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nscore.h"
#include "nsIServiceManager.h"
#include "nsIImportService.h"
#include "nsIComponentManager.h"
#include "nsIMemory.h"
#include "nsIImportMail.h"
#include "nsIImportMailboxDescriptor.h"
#include "nsIImportGeneric.h"
#include "nsIImportAddressBooks.h"
#include "nsIImportABDescriptor.h"
#include "nsIImportSettings.h"
#include "nsIImportFilters.h"
#include "nsIImportFieldMap.h"
#include "nsXPCOM.h"
#include "nsISupportsPrimitives.h"
#include "nsIOutputStream.h"
#include "nsIAddrDatabase.h"
#include "nsTextFormatter.h"
#include "nsIStringBundle.h"
#include "nsUnicharUtils.h"
#include "nsIMsgTagService.h"
#include "nsMsgBaseCID.h"
#include "nsCOMPtr.h"
#include "nsServiceManagerUtils.h"
#include "nsComponentManagerUtils.h"

#include "nsBeckyImport.h"
#include "nsBeckyMail.h"
#include "nsBeckyAddressBooks.h"
#include "nsBeckySettings.h"
#include "nsBeckyFilters.h"
#include "nsBeckyStringBundle.h"

nsBeckyImport::nsBeckyImport()
{
}

nsBeckyImport::~nsBeckyImport()
{
}

NS_IMPL_ISUPPORTS(nsBeckyImport, nsIImportModule)

NS_IMETHODIMP
nsBeckyImport::GetName(char16_t **aName)
{
  NS_ENSURE_ARG_POINTER(aName);
  *aName =
    nsBeckyStringBundle::GetStringByName(u"BeckyImportName");
  return NS_OK;
}

NS_IMETHODIMP
nsBeckyImport::GetDescription(char16_t **aDescription)
{
  NS_ENSURE_ARG_POINTER(aDescription);
  *aDescription =
    nsBeckyStringBundle::GetStringByName(u"BeckyImportDescription");
  return NS_OK;
}

NS_IMETHODIMP
nsBeckyImport::GetSupports(char **aSupports)
{
  NS_ENSURE_ARG_POINTER(aSupports);
  *aSupports = strdup(kBeckySupportsString);
  return NS_OK;
}

NS_IMETHODIMP
nsBeckyImport::GetSupportsUpgrade(bool *aUpgrade)
{
  NS_ENSURE_ARG_POINTER(aUpgrade);
  *aUpgrade = true;
  return NS_OK;
}

nsresult
nsBeckyImport::GetMailImportInterface(nsISupports **aInterface)
{
  nsCOMPtr<nsIImportMail> importer;
  nsresult rv = nsBeckyMail::Create(getter_AddRefs(importer));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIImportService> importService(do_GetService(NS_IMPORTSERVICE_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIImportGeneric> generic;
  rv = importService->CreateNewGenericMail(getter_AddRefs(generic));
  NS_ENSURE_SUCCESS(rv, rv);

  generic->SetData("mailInterface", importer);

  nsString name;
  name.Adopt(nsBeckyStringBundle::GetStringByName(u"BeckyImportName"));

  nsCOMPtr<nsISupportsString> nameString(do_CreateInstance(NS_SUPPORTS_STRING_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  nameString->SetData(name);
  generic->SetData("name", nameString);

  return CallQueryInterface(generic, aInterface);
}

nsresult
nsBeckyImport::GetAddressBookImportInterface(nsISupports **aInterface)
{
  nsresult rv;
  nsCOMPtr<nsIImportAddressBooks> importer;
  rv = nsBeckyAddressBooks::Create(getter_AddRefs(importer));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIImportService> importService(do_GetService(NS_IMPORTSERVICE_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIImportGeneric> generic;
  rv = importService->CreateNewGenericAddressBooks(getter_AddRefs(generic));
  NS_ENSURE_SUCCESS(rv, rv);

  generic->SetData("addressInterface", importer);
  return CallQueryInterface(generic, aInterface);
}

nsresult
nsBeckyImport::GetSettingsImportInterface(nsISupports **aInterface)
{
  nsresult rv;
  nsCOMPtr<nsIImportSettings> importer;
  rv = nsBeckySettings::Create(getter_AddRefs(importer));
  NS_ENSURE_SUCCESS(rv, rv);

  return CallQueryInterface(importer, aInterface);
}

nsresult
nsBeckyImport::GetFiltersImportInterface(nsISupports **aInterface)
{
  nsresult rv;
  nsCOMPtr<nsIImportFilters> importer;
  rv = nsBeckyFilters::Create(getter_AddRefs(importer));
  NS_ENSURE_SUCCESS(rv, rv);

  return CallQueryInterface(importer, aInterface);
}

NS_IMETHODIMP
nsBeckyImport::GetImportInterface(const char *aImportType, nsISupports **aInterface)
{
  NS_ENSURE_ARG_POINTER(aImportType);
  NS_ENSURE_ARG_POINTER(aInterface);

  *aInterface = nullptr;
  if (!strcmp(aImportType, "mail"))
    return GetMailImportInterface(aInterface);
  if (!strcmp(aImportType, "addressbook"))
    return GetAddressBookImportInterface(aInterface);
  if (!strcmp(aImportType, "settings"))
    return GetSettingsImportInterface(aInterface);
  if (!strcmp(aImportType, "filters"))
    return GetFiltersImportInterface(aInterface);

  return NS_ERROR_NOT_AVAILABLE;
}
