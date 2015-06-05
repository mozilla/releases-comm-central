/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsVCardAddress_h__
#define nsVCardAddress_h__

#include "mozilla/Logging.h"

extern PRLogModuleInfo *VCARDLOGMODULE;  // Logging module

#define IMPORT_LOG0(x)          MOZ_LOG(VCARDLOGMODULE, mozilla::LogLevel::Debug, (x))
#define IMPORT_LOG1(x, y)       MOZ_LOG(VCARDLOGMODULE, mozilla::LogLevel::Debug, (x, y))
#define IMPORT_LOG2(x, y, z)    MOZ_LOG(VCARDLOGMODULE, mozilla::LogLevel::Debug, (x, y, z))
#define IMPORT_LOG3(a, b, c, d) MOZ_LOG(VCARDLOGMODULE, mozilla::LogLevel::Debug, (a, b, c, d))

class nsIAddrDatabase;
class nsIFile;
class nsILineInputStream;

class nsVCardAddress {
public:
  nsVCardAddress();
  virtual ~nsVCardAddress();

  nsresult ImportAddresses(
      bool *pAbort,
      const char16_t *pName,
      nsIFile *pSrc,
      nsIAddrDatabase *pDb,
      nsString& errors,
      uint32_t *pProgress);

private:
  static nsresult ReadRecord(
      nsILineInputStream *aLineStream, nsCString &aRecord, bool *aMore);
};

#endif /* nsVCardAddress_h__ */

