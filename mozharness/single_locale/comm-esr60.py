import os
config = {
    "app_name": "comm/mail",
    "nightly_build": True,
    "branch": "comm-esr60",
    'is_automation': True,

    "mar_tools_url": os.environ["MAR_TOOLS_URL"],
    "hg_l10n_base": "https://hg.mozilla.org/l10n-central",

    "update_channel": "esr",
}
