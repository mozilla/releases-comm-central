/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _nsLDAPSecurityGlue_h_
#define _nsLDAPSecurityGlue_h_

typedef struct ldap LDAP;
class nsISupports;

nsresult nsLDAPInstallSSL(LDAP* ld, const char* aHostName);
nsresult nsLDAPGetSecInfo(LDAP* ld, nsISupports** secInfo);

#endif  // _nsLDAPSecurityGlue_h_
