/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _nsMsgEnumerator_H_
#define _nsMsgEnumerator_H_

#include "nsIMsgEnumerator.h"

/**
 * A base implementation nsIMsgEnumerator for stepping over an ordered set
 * of nsIMsgDBHdr objects.
 * This provides the javascript iterable protocol (to support for...of
 * constructs), but getNext() and hasMoreElements() must be implemented by
 * derived classes.
 */
class nsBaseMsgEnumerator : public nsIMsgEnumerator {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGENUMERATOR
  nsBaseMsgEnumerator() {};

 protected:
  virtual ~nsBaseMsgEnumerator() {};
};

/**
 * A base implementation nsIMsgThreadEnumerator for stepping over an ordered
 * set of nsIMsgThread objects.
 * This provides the javascript iterable protocol (to support for...of
 * constructs), but getNext() and hasMoreElements() must be implemented by
 * derived classes.
 */
class nsBaseMsgThreadEnumerator : public nsIMsgThreadEnumerator {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGTHREADENUMERATOR
  nsBaseMsgThreadEnumerator() {};

 protected:
  virtual ~nsBaseMsgThreadEnumerator() {};
};

#endif /* _nsMsgEnumerator_H_ */
