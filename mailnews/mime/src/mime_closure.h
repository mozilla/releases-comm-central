/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _MIME_CLOSURE_H_
#define _MIME_CLOSURE_H_

class MimeClosure {
 public:
  enum ClosureType {
    isUndefined = 0,
    isMimeObject = 1,
    isMimeStreamData,
    isMimeCMSData,
    isMimeMultCMSData,
    isMimePgpeData,
    isMimeDraftData,
    isMimeMultipartRelated,
  };

  MimeClosure() : mType(isUndefined), mClosure(nullptr) {}
  MimeClosure(ClosureType t, void* c) : mType(t), mClosure(c) {}

  static MimeClosure zero() { return MimeClosure(); }

  MimeClosure& operator=(const MimeClosure& other) {
    if (this == &other) return *this;

    mType = other.mType;
    mClosure = other.mClosure;
    return *this;
  }

  // explicit: the bool value cannot get implicitly converted to
  //           integer or pointer.
  explicit operator bool() const { return mClosure != nullptr; }

  ClosureType mType;
  void* mClosure;
};

#endif
