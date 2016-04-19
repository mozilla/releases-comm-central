/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsBeckyImport_h___
#define nsBeckyImport_h___

#include "nsIImportModule.h"

#define NS_BECKYIMPORT_CID          \
{                                   \
  0x7952a6cf, 0x2442,0x4c04,        \
  {0x9f, 0x02, 0x15, 0x0b, 0x15, 0xa0, 0xa8, 0x41}}

#define kBeckySupportsString NS_IMPORT_MAIL_STR "," NS_IMPORT_ADDRESS_STR "," NS_IMPORT_SETTINGS_STR "," NS_IMPORT_FILTERS_STR

class nsBeckyImport final : public nsIImportModule
{
public:
  nsBeckyImport();

  NS_DECL_ISUPPORTS
  NS_DECL_NSIIMPORTMODULE

private:
  virtual ~nsBeckyImport();

  nsresult GetMailImportInterface(nsISupports **aInterface);
  nsresult GetAddressBookImportInterface(nsISupports **aInterface);
  nsresult GetSettingsImportInterface(nsISupports **aInterface);
  nsresult GetFiltersImportInterface(nsISupports **aInterface);

};

#endif /* nsBeckyImport_h___ */
