/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#ifndef _nsBeckyStringBundle_H__
#define _nsBeckyStringBundle_H__

#include "nsString.h"

class nsIStringBundle;

class nsBeckyStringBundle final {
public:
  static char16_t *GetStringByName(const char16_t *name);
  static nsresult FormatStringFromName(const char16_t *name,
                                       const char16_t **params,
                                       uint32_t length,
                                       char16_t **_retval);
  static nsIStringBundle * GetStringBundle(void); // don't release
  static void EnsureStringBundle(void);
  static void Cleanup(void);
private:
  static nsIStringBundle *mBundle;
};

#define BECKYIMPORT_NAME                     2000
#define BECKYIMPORT_DESCRIPTION              2001
#define BECKYIMPORT_MAILBOX_SUCCESS          2002
#define BECKYIMPORT_MAILBOX_BADPARAM         2003
#define BECKYIMPORT_MAILBOX_CONVERTERROR     2004
#define BECKYIMPORT_ADDRESS_SUCCESS          2005


#endif /* _nsBeckyStringBundle_H__ */
