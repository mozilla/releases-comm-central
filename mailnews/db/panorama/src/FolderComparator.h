/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_DB_PANORAMA_SRC_FOLDERCOMPARATOR_H_
#define COMM_MAILNEWS_DB_PANORAMA_SRC_FOLDERCOMPARATOR_H_

#include "Folder.h"
#include "mozilla/intl/Collator.h"
#include "mozilla/RefPtr.h"

using mozilla::intl::Collator;

namespace mozilla::mailnews {

class Folder;

/**
 * Compares folders for display in the right order. Folders with an ordinal in
 * the database are sorted ahead of those without. Folders without an ordinal
 * are sorted in alphabetical order.
 *
 * A future version of this class will handle special folder types (e.g.
 * Inbox, which goes ahead of ordinary folders).
 */
class FolderComparator {
 public:
  bool Equals(const RefPtr<Folder>& a, const RefPtr<Folder>& b) const;
  bool LessThan(const RefPtr<Folder>& a, const RefPtr<Folder>& b) const;

 private:
  static const Collator* sCollator;
  static const Collator* GetCollator();
  uint8_t SpecialFlagsOrder(const uint64_t flags) const;
};

}  // namespace mozilla::mailnews

#endif  // COMM_MAILNEWS_DB_PANORAMA_SRC_FOLDERCOMPARATOR_H_
