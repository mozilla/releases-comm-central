AM_CFLAGS = -I$(top_srcdir)/include \
			-I$(top_srcdir)/src \
			-I$(top_srcdir)/tests/utils/ \
			-I$(srcdir) \
			@LIBGCRYPT_CFLAGS@

LIBTAP=$(top_builddir)/tests/utils/tap/libtap.la

LIBOTR=$(top_builddir)/src/libotr.la

noinst_PROGRAMS = client

client_SOURCES = client.c
client_LDADD = $(LIBTAP) $(LIBOTR) -lpthread @LIBGCRYPT_LIBS@

EXTRA_DIST = otr.key
