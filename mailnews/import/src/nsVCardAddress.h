/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsVCardAddress_h__
#define nsVCardAddress_h__

#include "ImportDebug.h"

class nsIAbDirectory;
class nsIFile;
class nsIUnicharLineInputStream;

class nsVCardAddress {
 public:
  nsVCardAddress();
  virtual ~nsVCardAddress();

  nsresult ImportAddresses(bool* pAbort, const char16_t* pName, nsIFile* pSrc,
                           nsIAbDirectory* pDirectory, nsString& errors,
                           uint32_t* pProgress);

 private:
  static nsresult ReadRecord(nsIUnicharLineInputStream* aLineStream,
                             nsString& aRecord, bool* aMore);
};

#endif /* nsVCardAddress_h__ */
