/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#include "mime_closure.h"
#include "prlog.h"

MimeObject* MimeClosure::AsMimeObject() {
  PR_ASSERT(mType == isMimeObject);
  return (mType == isMimeObject) ? static_cast<MimeObject*>(mClosure) : nullptr;
}

mime_stream_data* MimeClosure::AsMimeStreamData() {
  PR_ASSERT(mType == isMimeStreamData);
  return (mType == isMimeStreamData) ? static_cast<mime_stream_data*>(mClosure)
                                     : nullptr;
}

MimeCMSdata* MimeClosure::AsMimeCMSData() {
  PR_ASSERT(mType == isMimeCMSData);
  return (mType == isMimeCMSData) ? static_cast<MimeCMSdata*>(mClosure)
                                  : nullptr;
}

MimeMultCMSdata* MimeClosure::AsMimeMultCMSData() {
  PR_ASSERT(mType == isMimeMultCMSData);
  return (mType == isMimeMultCMSData) ? static_cast<MimeMultCMSdata*>(mClosure)
                                      : nullptr;
}

MimePgpeData* MimeClosure::AsMimePgpeData() {
  PR_ASSERT(mType == isMimePgpeData);
  return (mType == isMimePgpeData) ? static_cast<MimePgpeData*>(mClosure)
                                   : nullptr;
}

mime_draft_data* MimeClosure::AsMimeDraftData() {
  PR_ASSERT(mType == isMimeDraftData);
  return (mType == isMimeDraftData) ? static_cast<mime_draft_data*>(mClosure)
                                    : nullptr;
}

MimeMultipartRelated* MimeClosure::AsMimeMultipartRelated() {
  PR_ASSERT(mType == isMimeMultipartRelated);
  return (mType == isMimeMultipartRelated)
             ? static_cast<MimeMultipartRelated*>(mClosure)
             : nullptr;
}

nsMsgComposeSecure* MimeClosure::AsMsgComposeSecure() {
  PR_ASSERT(mType == isMsgComposeSecure);
  return (mType == isMsgComposeSecure)
             ? static_cast<nsMsgComposeSecure*>(mClosure)
             : nullptr;
}

mime_image_stream_data* MimeClosure::AsMimeImageStreamData() {
  PR_ASSERT(mType == isMimeImageStreamData);
  return (mType == isMimeImageStreamData)
             ? static_cast<mime_image_stream_data*>(mClosure)
             : nullptr;
}

MimeMessage* MimeClosure::AsMimeMessage() {
  PR_ASSERT(mType == isMimeMessage);
  return (mType == isMimeMessage) ? static_cast<MimeMessage*>(mClosure)
                                  : nullptr;
}
