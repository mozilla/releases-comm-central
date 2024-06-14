Files in this directory were manually crafted.
Ideally they should be automatically created by scripts.

File alice.env.mixed.dsig.SHA256.multipart.eml
was created by taking file alice.env.dsig.SHA256.multipart.eml as input,
but the inner encrypted block was wrapped in another layer.
That layer was taken from file mailnews/test/data/multipart-message-1.eml
(As a result, the signature doesn't match the data, but that doesn't
matter for this test.)


alice.dsig.SHA256.multipart.env.dsig.eml
was created by using the outer structure from alice.env.dsig.SHA256.multipart.eml
and then the inner encrypted block was replaced with the encrypted
block from alice.dsig.SHA256.multipart.env.eml


outer-smime-bad-sig-inner-smime-enc.eml
It uses an outer signature block from any another S/MIME signed message,
for the purposes of the test it doesn't matter that the signature
mismatches.
To update this message, replace the inner encrypted block with the
data block from alice.env.eml


outer-smime-bad-sig-inner-smime-enc-sig.eml
It uses an outer signature block from any another S/MIME signed message,
for the purposes of the test it doesn't matter that the signature
mismatches.
To update this message, replace the inner encrypted block with the
data block from alice.dsig.SHA256.multipart.env.eml


TODO:

These comments should be moved to X-Explanation headers in the
individual message files, and any future automation to update
those files should ensure those explanations are kept.
