def test(mod, path, entity=None):
  import re
  # ignore anything but Thunderbird
  if mod not in ("netwerk", "dom", "toolkit", "security/manager",
                 "devtools/shared", "devtools/client",
                 "mail", "chat", "editor/ui", "extensions/spellcheck",
                 "other-licenses/branding/thunderbird"):
    return "ignore"

  # ignore MOZ_LANGPACK_CONTRIBUTORS
  if mod == "mail" and path == "defines.inc" and \
     entity == "MOZ_LANGPACK_CONTRIBUTORS":
    return "ignore"
  # ignore dictionaries
  if mod == "extensions/spellcheck":
    return "ignore"

  if path == "chrome/messenger-region/region.properties":
    return ("ignore" if (re.match(r"browser\.search\.order\.[1-9]", entity))
            else "error")

  # ignore search plugins
  if re.match(r"searchplugins\/.+\.xml", path):
    return "ignore"
  return "error"
