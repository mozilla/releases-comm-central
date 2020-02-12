/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _NSDIRPREFS_H_
#define _NSDIRPREFS_H_

/* DIR_Server.dirType */
typedef enum {
  LDAPDirectory,
  MAPIDirectory = 3,
  JSDirectory = 101
} DirectoryType;

#endif /* dirprefs.h */
