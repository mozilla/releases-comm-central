/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mimemoth.h"
#include "prlog.h"

#define MIME_SUPERCLASS mimeMultipartClass
MimeDefClass(MimeMultipartOther, MimeMultipartOtherClass,
             mimeMultipartOtherClass, &MIME_SUPERCLASS);

static int MimeMultipartOtherClassInitialize(MimeObjectClass* oclass) {
#ifdef DEBUG
  PR_ASSERT(!oclass->class_initialized);
#endif
  return 0;
}

#undef MIME_SUPERCLASS
