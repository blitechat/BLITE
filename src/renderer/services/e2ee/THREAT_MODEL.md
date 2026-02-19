# BLITE E2EE Threat Model

This document describes the security properties, trust assumptions, and threat model
for BLITE's end-to-end encryption implementation.

## Overview

BLITE implements E2EE for:
- **Direct Messages (DMs)**: X3DH key agreement + Symmetric Ratchet
- **Channels**: Sender Keys with symmetric ratchet per sender
- **Voice/Video**: AES-128-GCM with ephemeral Curve25519 DH key exchange

## Cryptographic Primitives

| Purpose | Algorithm | Library |
|---------|-----------|---------|
| Key Agreement | X25519 (Curve25519 DH) | tweetnacl |
| Signatures | Ed25519 | tweetnacl |
| Symmetric Encryption | XSalsa20-Poly1305 | tweetnacl |
| Voice Encryption | AES-128-GCM | Web Crypto API |
| Key Derivation | HKDF-SHA256, PBKDF2-SHA256 | Web Crypto API |
| Chain Keys | HMAC-SHA256 | Web Crypto API |

## Security Goals

### Confidentiality
- **End-to-end encryption**: Server cannot read message content
- **Forward secrecy**: Compromise of current keys doesn't reveal past messages
- **Post-compromise security**: New messages are protected after key compromise ends

### Integrity
- **Authenticated encryption**: Messages cannot be modified without detection
- **Signed pre-keys**: Pre-keys are signed to prevent MitM during X3DH

### Availability
- **Graceful degradation**: Voice continues unencrypted if E2EE fails
- **Key rotation**: Automatic recovery from key synchronization issues

## Trust Assumptions

### What We Trust

1. **Client device**: The device running BLITE is not compromised
2. **Cryptographic primitives**: NaCl/TweetNaCl and Web Crypto are implemented correctly
3. **Random number generation**: `crypto.getRandomValues()` provides cryptographic randomness
4. **Memory isolation**: Other processes cannot read our memory (OS guarantee)

### What We Do NOT Trust

1. **Server**: Cannot read message content (only encrypted ciphertext)
2. **Network**: All sensitive data is encrypted in transit
3. **Other clients**: Cannot decrypt messages not intended for them

### Partial Trust

1. **Server (key distribution)**: We trust the server to deliver the correct public keys
   - **Mitigation**: Signed pre-keys prevent MitM on pre-key bundles
   - **Future work**: Out-of-band key verification (safety numbers)

2. **Server (message delivery)**: We trust the server to deliver messages
   - **Risk**: Server could selectively drop messages
   - **Mitigation**: None currently (inherent to client-server model)

## Threat Model

### In Scope (Protected Against)

| Threat | Protection |
|--------|------------|
| Passive network eavesdropping | All messages encrypted |
| Server reads message content | E2EE - server only sees ciphertext |
| Compromise of old session keys | Forward secrecy via key ratcheting |
| Message tampering | Authenticated encryption (Poly1305/GCM) |
| Pre-key substitution attack | Ed25519 signatures on pre-keys |
| Voice call eavesdropping | AES-GCM with ephemeral DH keys |
| Key material in memory after use | Secure zeroing of sensitive keys |

### Out of Scope (NOT Protected Against)

| Threat | Reason |
|--------|--------|
| Compromised client device | Must trust client |
| Malicious client software | Must trust BLITE application |
| Metadata analysis | Server sees who talks to whom, message timing/size |
| Active MitM on identity keys | No out-of-band verification (yet) |
| Sender key reset trust-on-first-use | Channel members trust first key from each sender |
| Side-channel attacks | JavaScript timing not constant-time |
| Memory forensics | JavaScript GC may retain key copies |

## Protocol Details

### X3DH (Extended Triple Diffie-Hellman)

Used for establishing DM sessions. Provides:
- Mutual authentication (both parties prove identity)
- Forward secrecy (ephemeral keys used)
- Deniability (no signatures on messages)

```
DH1 = DH(IK_A, SPK_B)  # Initiator identity x Responder signed pre-key
DH2 = DH(EK_A, IK_B)   # Initiator ephemeral x Responder identity
DH3 = DH(EK_A, SPK_B)  # Initiator ephemeral x Responder signed pre-key
DH4 = DH(EK_A, OPK_B)  # Initiator ephemeral x Responder one-time pre-key (optional)
SK  = HKDF(DH1 || DH2 || DH3 [|| DH4])
```

### Symmetric Ratchet

After X3DH establishes a shared secret:
1. Derive separate send/receive chain keys
2. For each message: derive message key, advance chain key
3. Message keys are zeroed immediately after use

```
chain_key_new = HMAC-SHA256(chain_key, 0x01)
message_key   = HMAC-SHA256(chain_key, 0x02)
```

**Note**: This is a symmetric-only ratchet (no DH ratchet). Forward secrecy depends
on chain key advancement. A full Double Ratchet would provide stronger post-compromise
security.

### Sender Keys (Channels)

Each channel member has their own sender key:
1. Generate 32-byte random sender key
2. Encrypt for each channel member using nacl.box
3. Ratchet the sender key for each message sent

### Voice E2EE

1. Generate ephemeral Curve25519 DH key pair per voice session
2. Exchange public keys via signaling
3. Derive shared secret via DH
4. Encrypt voice frames with AES-128-GCM
5. Key IDs (1 byte) identify which key encrypted each frame

## Key Storage

| Key Type | Storage | Protection |
|----------|---------|------------|
| Identity key pair | IndexedDB | Encrypted with password-derived key (AES-GCM) |
| Signed pre-key | IndexedDB | Encrypted with password-derived key |
| One-time pre-keys | IndexedDB | Encrypted with password-derived key |
| Session chain keys | IndexedDB | Encrypted with identity-derived key |
| Sender key states | IndexedDB | Encrypted with identity-derived key |
| Recovery key | User's responsibility | PBKDF2-derived key encrypts identity backup |

## Known Limitations

### 1. No Out-of-Band Key Verification
Users cannot verify contact identity keys through an independent channel (e.g., safety numbers).
This means a compromised server could perform a MitM attack on identity keys.

**Recommendation**: Implement safety number comparison in future version.

### 2. Full Double Ratchet Available
The implementation now includes a full Double Ratchet with DH ratchet steps:
- `advanceSendChainWithDH()` and `advanceRecvChainWithDH()` perform periodic DH ratchets
- DH ratchet provides "healing" after key compromise
- Backward compatible with v1 sessions (symmetric-only)

**Status**: DH ratchet functions implemented and exported. Can be used by updating
message encryption code to use `advanceSendChainWithDH`/`advanceRecvChainWithDH`
instead of the basic `advanceSendChain`/`advanceRecvChain`.

### 3. Sender Key Trust-on-First-Use
When a new member joins a channel, their first sender key is implicitly trusted.
A malicious server could substitute a fake key.

**Mitigation**: Sender keys are encrypted per-recipient with authenticated encryption.

### 4. JavaScript Memory Constraints
- Garbage collection may leave key material in memory
- No guaranteed constant-time operations
- `secureZero()` provides best-effort zeroing

### 5. Metadata Exposure
The server learns:
- Who communicates with whom
- Message timing and frequency
- Message sizes (approximate plaintext length)
- Voice call participants and duration

## Audit History

| Date | Scope | Findings |
|------|-------|----------|
| 2024-XX | Initial implementation | See code comments |
| 2026-02 | Comprehensive review | Added secure zeroing, PBKDF2, voice key collision handling |

## References

- [The X3DH Key Agreement Protocol](https://signal.org/docs/specifications/x3dh/)
- [The Double Ratchet Algorithm](https://signal.org/docs/specifications/doubleratchet/)
- [NaCl: Networking and Cryptography library](https://nacl.cr.yp.to/)
- [Web Cryptography API](https://www.w3.org/TR/WebCryptoAPI/)
