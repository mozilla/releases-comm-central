# This file is normally included by autoconf.mk, but it is also used
# directly in python/mozbuild/mozbuild/base.py for gmake validation.
# We thus use INCLUDED_AUTOCONF_MK to enable/disable some parts depending
# whether a normal build is happening or whether the check is running.

# When mach wants to know if we're to use mozmake, it runs:
# make -f topsrcdir/config/baseconfig.mk
# The first word of MAKEFILE_LIST is the main file we're running. Grabbing the
# parent of that directory therefore gets us the topsrcdir of comm-central,
# whence we get the mozilla directory to run the "real" baseconfig.mk logic.
ifndef INCLUDED_AUTOCONF_MK
topsrcdir := $(dir $(firstword $(MAKEFILE_LIST)))..
endif

MOZILLA_SRCDIR = $(topsrcdir)/mozilla
include $(MOZILLA_SRCDIR)/config/baseconfig.mk
