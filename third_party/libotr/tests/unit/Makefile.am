AM_CFLAGS = -I$(top_srcdir)/include \
			-I$(top_srcdir)/src \
			-I$(top_srcdir)/tests/utils/ \
			-I$(srcdir) \
			@LIBGCRYPT_CFLAGS@

LIBTAP=$(top_builddir)/tests/utils/tap/libtap.la

LIBOTR=$(top_builddir)/src/libotr.la

noinst_PROGRAMS = test_auth test_proto test_dh \
				  test_b64 test_context \
				  test_userstate test_tlv \
				  test_mem test_sm test_instag \
				  test_privkey

test_auth_SOURCES = test_auth.c
test_auth_LDADD = $(LIBTAP) $(LIBOTR) @LIBGCRYPT_LIBS@

test_proto_SOURCES = test_proto.c
test_proto_LDADD = $(LIBTAP) $(LIBOTR) @LIBGCRYPT_LIBS@

test_dh_SOURCES = test_dh.c
test_dh_LDADD = $(LIBTAP) $(LIBOTR) @LIBGCRYPT_LIBS@

test_b64_SOURCES = test_b64.c
test_b64_LDADD = $(LIBTAP) $(LIBOTR) @LIBGCRYPT_LIBS@

test_context_SOURCES = test_context.c
test_context_LDADD = $(LIBTAP) $(LIBOTR) @LIBGCRYPT_LIBS@

test_userstate_SOURCES = test_userstate.c
test_userstate_LDADD = $(LIBTAP) $(LIBOTR) @LIBGCRYPT_LIBS@

test_tlv_SOURCES = test_tlv.c
test_tlv_LDADD = $(LIBTAP) $(LIBOTR) @LIBGCRYPT_LIBS@

test_mem_SOURCES = test_mem.c
test_mem_LDADD = $(LIBTAP) $(LIBOTR) @LIBGCRYPT_LIBS@

test_sm_SOURCES = test_sm.c
test_sm_LDADD = $(LIBTAP) $(LIBOTR) @LIBGCRYPT_LIBS@

test_instag_SOURCES = test_instag.c
test_instag_LDADD = $(LIBTAP) $(LIBOTR) @LIBGCRYPT_LIBS@

test_privkey_SOURCES = test_privkey.c
test_privkey_LDADD = $(LIBTAP) $(LIBOTR) @LIBGCRYPT_LIBS@

EXTRA_DIST = instag.txt
