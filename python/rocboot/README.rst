rocboot - Bootstrap your system to build Mozilla Thunderbird!
=============================================================

This package contains code used for bootstrapping a system to build from
comm-central.

This code is not part of the build system per se. Instead, it is related
to everything up to invoking the actual build system.

If you have a copy of the source tree, you run:

    python bin/bootstrap.py

If you don't have a copy of the source tree, you can run:

    curl https://hg.mozilla.org/comm-central/raw-file/default/python/rocboot/bin/bootstrap.py -o bootstrap.py
    python bootstrap.py

The bootstrap script will download everything it needs from hg.mozilla.org
automagically!
