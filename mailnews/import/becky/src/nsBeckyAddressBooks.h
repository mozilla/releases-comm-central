/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsBeckyAddressBooks_h___
#define nsBeckyAddressBooks_h___

#include "nsIImportAddressBooks.h"

class nsBeckyAddressBooks final : public nsIImportAddressBooks
{
public:
  nsBeckyAddressBooks();
  static nsresult Create(nsIImportAddressBooks **aImport);

  NS_DECL_ISUPPORTS
  NS_DECL_NSIIMPORTADDRESSBOOKS

private:
  virtual ~nsBeckyAddressBooks();

  uint32_t mReadBytes;

  nsresult CollectAddressBooks(nsIFile *aTarget, nsIMutableArray *aCollected);
  nsresult FindAddressBookDirectory(nsIFile **aAddressBookDirectory);
  nsresult AppendAddressBookDescriptor(nsIFile *aEntry,
                                       nsIMutableArray *aCollected);
  uint32_t CountAddressBookSize(nsIFile *aDirectory);
  bool HasAddressBookFile(nsIFile *aDirectory);
  bool IsAddressBookFile(nsIFile *aFile);
  nsresult CreateAddressBookDescriptor(nsIImportABDescriptor **aDescriptor);
};

#endif /* nsBeckyAddressBooks_h___ */
