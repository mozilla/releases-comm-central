ACLOCAL_AMFLAGS = -I config

SUBDIRS = src toolkit
if BUILD_TESTS
SUBDIRS += tests
endif

EXTRA_DIST = Protocol-v3.html UPGRADING packaging libotr.m4 libotr.pc.in bootstrap

aclocaldir = $(datadir)/aclocal
aclocal_DATA = libotr.m4

pkgconfigdir = $(libdir)/pkgconfig
pkgconfig_DATA = libotr.pc
