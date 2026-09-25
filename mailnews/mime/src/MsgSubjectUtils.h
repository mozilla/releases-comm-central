/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_MIME_SRC_MSGSUBJECTUTILS_H_
#define COMM_MAILNEWS_MIME_SRC_MSGSUBJECTUTILS_H_

#include "nsIMsgSubjectUtils.h"
#include "nsString.h"

namespace mozilla::mailnews {

/**
 * Remove reply prefixes, including counters such as "Re[2]", from a decoded
 * subject.
 *
 * If mailnews.localizedRe is set, localized prefixes are removed as well.
 *
 * @param subject The subject to modify in place.
 * @return true if at least one prefix was removed.
 */
bool StripSubjectReplyPrefixes(nsCString& subject);

/** Encode a decoded subject for storage in a legacy message database. */
nsresult EncodeSubjectForLegacyStorage(const nsACString& subject,
                                       nsACString& encodedSubject);

class MsgSubjectUtils final : public nsIMsgSubjectUtils {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGSUBJECTUTILS

 private:
  ~MsgSubjectUtils() = default;
};

}  // namespace mozilla::mailnews

#endif  // COMM_MAILNEWS_MIME_SRC_MSGSUBJECTUTILS_H_
