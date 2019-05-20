# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

otr-auth =
    .title = Verify contact's identity
    .buttonlabelaccept = Verify

# Variables:
#   $name (String) - the screen name of a chat contact person
auth-title = Verify the identity of { $name }

# Variables:
#   $own_name (String) - the user's own screen name
auth-your-fp-value = Fingerprint for you, { $own_name }:

# Variables:
#   $their_name (String) - the screen name of a chat contact
auth-their-fp-value = Purported fingerprint for { $their_name }:

auth-help = Verifying a contact's identity helps ensure that the person you are talking to is who they claim to be.
auth-helpTitle = Verification help

auth-questionReceived = This is the question asked by your contact:

auth-yes =
    .label = Yes

auth-no =
    .label = No

auth-verified = I have verified that this is in fact the correct fingerprint.

auth-manualVerification = Manual fingerprint verification
auth-questionAndAnswer = Question and answer
auth-sharedSecret = Shared secret

auth-manualVerification-label =
    .label = { auth-manualVerification }

auth-questionAndAnswer-label =
    .label = { auth-questionAndAnswer }

auth-sharedSecret-label =
    .label = { auth-sharedSecret }

auth-manualInstruction = To verify the fingerprint, contact your conversation partner via some other authenticated channel, such as the telephone or GPG-signed email. Both conversation partners should tell the other person their fingerprint. If the fingerprint matches, you should indicate in the dialog below that you have verified the fingerprint.

auth-how = How would you like to verify your contact's identity?

auth-qaInstruction = To verify their identity, pick a question whose answer is known only to you and your contact. Enter this question and answer, then wait for your contact to enter the answer as well. If the answers do not match, then you may be talking to an imposter.

auth-secretInstruction = To verify their identity, pick a secret known only to you and your contact. Enter this secret, then wait for your contact to enter it as well. If the secrets do not match, then you may be talking to an imposter.

auth-question = Enter question here:

auth-answer = Enter secret answer here (case sensitive):

auth-secret = Enter secret here:
