/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _MIME_CLOSURE_H_
#define _MIME_CLOSURE_H_

struct MimeObject;
class mime_stream_data;
struct MimeCMSdata;
struct MimeMultCMSdata;
class MimePgpeData;
class mime_draft_data;
struct MimeMultipartRelated;
class nsMsgComposeSecure;
class mime_image_stream_data;
struct MimeMessage;

class MimeClosure {
  // MimeClosure is a helper class to make it safer to pass the various mime
  // data objects through callbacks without relying on void* and risky casting.
  // The basic idea is that attempts to pull out the wrong kind of pointer will
  // assert on debug builds and produce a null pointer on release builds.
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
    isMsgComposeSecure,
    isMimeImageStreamData,
    isMimeMessage,
  };

  MimeObject* AsMimeObject();
  mime_stream_data* AsMimeStreamData();
  MimeCMSdata* AsMimeCMSData();
  MimeMultCMSdata* AsMimeMultCMSData();
  MimePgpeData* AsMimePgpeData();
  mime_draft_data* AsMimeDraftData();
  MimeMultipartRelated* AsMimeMultipartRelated();
  nsMsgComposeSecure* AsMsgComposeSecure();
  mime_image_stream_data* AsMimeImageStreamData();
  MimeMessage* AsMimeMessage();

  bool IsMimeDraftData() { return mType == isMimeDraftData; }

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
