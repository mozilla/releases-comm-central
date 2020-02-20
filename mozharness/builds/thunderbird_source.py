config = {
    'default_actions': ['package-source'],
    'stage_platform': 'source',  # Not used, but required by the script
    'app_ini_path': 'FAKE',  # Not used, but required by the script
    'env': {
        'HG_SHARE_BASE_DIR': '/builds/hg-shared',
        'TINDERBOX_OUTPUT': '1',
        'LC_ALL': 'C',
        'MOZ_OBJDIR': '%(abs_obj_dir)s',
    },
    'src_mozconfig': 'comm/mail/config/mozconfigs/linux64/source',
}
