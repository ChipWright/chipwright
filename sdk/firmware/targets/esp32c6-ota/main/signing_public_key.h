#ifndef OPENHOME_SIGNING_PUBLIC_KEY_H
#define OPENHOME_SIGNING_PUBLIC_KEY_H

// Ed25519 signing public key the device trusts for firmware. Generated with:
//   pnpm --filter @openhome/cloud firmware pubkey-c <private-key-path>
// The matching private key stays on the publisher; the device applies only builds whose
// signature verifies against this key. Regenerate both to rotate the signing identity.
static const unsigned char OH_SIGNING_PUBLIC_KEY[32] = {
    0xbe, 0x26, 0x73, 0x7b, 0xe4, 0x1a, 0xa7, 0x1e,
    0x0f, 0xfa, 0xd2, 0x49, 0xd5, 0x6b, 0x24, 0x83,
    0xd1, 0x4c, 0xbd, 0xa2, 0xb3, 0xf8, 0xb9, 0xc6,
    0xf2, 0xd5, 0xa2, 0x87, 0x34, 0xb7, 0x3e, 0x9a,
};

#endif  // OPENHOME_SIGNING_PUBLIC_KEY_H
