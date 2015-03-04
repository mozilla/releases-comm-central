# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

def test(mod, path, entity = None):
  import re
  # ignore anything but Instantbird
  if mod not in ("netwerk", "dom", "toolkit", "security/manager",
                 "im", "chat", "purple", "extensions/reporter", "extensions/spellcheck",
                 "im/branding/release", "im/branding/nightly"):
    return False
  if mod == "im" and path.startswith("branding/"):
    return False
  if mod != "im" and mod != "extensions/spellcheck":
    # we only have exceptions for instantbird and extensions/spellcheck
    return True
  if not entity:
    if mod == "extensions/spellcheck":
      return False
    # instantbird
    return not (re.match(r"searchplugins\/.+\.xml", path))
  if mod == "extensions/spellcheck":
    # l10n ships en-US dictionary or something, do compare
    return True
  if path == "defines.inc":
    return entity != "MOZ_LANGPACK_CONTRIBUTORS"

  if path == "chrome/instantbird/accountWizard.properties":
    return not (re.match(r"topProtocol\.[^\.]+\.description", entity))

  if path != "chrome/instantbird/region.properties":
    # only region.properties exceptions remain, compare all others
    return True

  return not (re.match(r"browser\.search\.order\.[1-9]", entity))
