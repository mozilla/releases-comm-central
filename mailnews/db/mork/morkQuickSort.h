/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-  */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_DB_MORK_MORKQUICKSORT_H_
#define COMM_MAILNEWS_DB_MORK_MORKQUICKSORT_H_

#ifndef _MDB_
#  include "mdb.h"
#endif

#ifndef _MORK_
#  include "mork.h"
#endif

// 456789_123456789_123456789_123456789_123456789_123456789_123456789_123456789

extern void morkQuickSort(mork_u1* ioVec, mork_u4 inCount, mork_u4 inSize,
                          mdbAny_Order inOrder, void* ioClosure);

// 456789_123456789_123456789_123456789_123456789_123456789_123456789_123456789

#endif  // COMM_MAILNEWS_DB_MORK_MORKQUICKSORT_H_
