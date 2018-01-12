import os
config = {
    "app_name": "comm/mail",
    "nightly_build": False,
    "branch": "try-comm-central",
    'is_automation': True,

    "mar_tools_url": os.environ["MAR_TOOLS_URL"],
    "en_us_binary_url": os.environ["EN_US_BINARY_URL"],
    "hg_l10n_base": "https://hg.mozilla.org/l10n-central",

    #FIXME
    "update_channel": "nightly",
}
