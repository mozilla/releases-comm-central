To add a new certificate, make a file named foo.cert.certspec, then run:
- mach generate-test-certs foo.cert.certspec
- openssl pkcs12 -export -inkey ca.key -in foo.cert -name foo -out foo.key

This will generate foo.cert and foo.key. All three files should be checked in.
The .cert and .key files should be added to mailnews/moz.build.

See ServerTestUtils.sys.mjs to see how to use the files.
