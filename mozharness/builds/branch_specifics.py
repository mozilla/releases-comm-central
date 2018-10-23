# this is a dict of branch specific keys/values. As this fills up and more
# fx build factories are ported, we might deal with this differently

# we should be able to port this in-tree and have the respective repos and
# revisions handle what goes on in here. Tracking: bug 978510

# example config and explanation of how it works:
# config = {
#     # if a branch matches a key below, override items in self.config with
#     # items in the key's value.
#     # this override can be done for every platform or at a platform level
#     '<branch-name>': {
#         # global config items (applies to all platforms and build types)
#         'repo_path': "projects/<branch-name>",
#
#         # platform config items (applies to specific platforms)
#         'platform_overrides': {
#             # if a platform matches a key below, override items in
#             # self.config with items in the key's value
#             'linux64-debug': {
#                 'upload_symbols': False,
#             },
#             'win64': {
#                 'enable_checktests': False,
#             },
#         }
#     },
# }

config = {
    "comm-central": {
        "repo_path": 'comm-central',
    },
    "comm-beta": {
        "enable_release_promotion": True,
        'repo_path': 'releases/comm-beta',
        'platform_overrides': {
            'linux': {
                'mozconfig_variant': 'release',
            },
            'linux64': {
                'mozconfig_variant': 'release',
            },
            'macosx64': {
                'mozconfig_variant': 'release',
            },
            'win32': {
                'mozconfig_variant': 'release',
            },
            'win64': {
                'mozconfig_variant': 'release',
            },
        },
    },
    "comm-esr60": {
        "enable_release_promotion": True,
        'repo_path': 'releases/comm-esr60',
        'platform_overrides': {
            'linux': {
                'mozconfig_variant': 'release',
            },
            'linux64': {
                'mozconfig_variant': 'release',
            },
            'macosx64': {
                'mozconfig_variant': 'release',
            },
            'win32': {
                'mozconfig_variant': 'release',
            },
            'win64': {
                'mozconfig_variant': 'release',
            },
        },
    },
    'try-comm-central': {
        'repo_path': 'try-comm-central',
    },
}
