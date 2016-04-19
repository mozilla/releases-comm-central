/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsBeckyMail_h___
#define nsBeckyMail_h___

#include "nsIImportMail.h"

class nsIFile;
class nsIMutableArray;
class nsIMsgFolder;

class nsBeckyMail final : public nsIImportMail
{
public:
  nsBeckyMail();
  static nsresult Create(nsIImportMail **aImport);

  NS_DECL_ISUPPORTS
  NS_DECL_NSIIMPORTMAIL

private:
  virtual ~nsBeckyMail();

  uint32_t mReadBytes;

  nsresult CollectMailboxesInDirectory(nsIFile *aDirectory,
                                       uint32_t aDepth,
                                       nsIMutableArray *aCollected);
  nsresult CollectMailboxesInFolderListFile(nsIFile *aListFile,
                                            uint32_t aDepth,
                                            nsIMutableArray *aCollected);
  nsresult AppendMailboxDescriptor(nsIFile *aEntry,
                                   const nsString &aName,
                                   uint32_t aDepth,
                                   nsIMutableArray *aCollected);
  nsresult ImportMailFile(nsIFile *aMailFile,
                          nsIMsgFolder *aDestination);
  nsresult CreateMailboxDescriptor(nsIImportMailboxDescriptor **aDescriptor);
  nsresult GetMailboxName(nsIFile *aMailbox, nsAString &aName);
};

#endif /* nsBeckyMail_h___ */
