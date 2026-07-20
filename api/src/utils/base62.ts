/**
 * Base62 encoding for short-code generation.
 *
 * Design note (good interview talking point):
 * We encode the Postgres BIGSERIAL `id` directly rather than generating a
 * random string and checking for collisions. This guarantees uniqueness for
 * free and avoids the retry-on-collision loop that random schemes need once
 * the keyspace starts filling up.
 *
 * The trade-off: sequential ids are guessable and leak how many links exist
 * (code "5" was created way before code "9j2Kx"). We mitigate this cheaply
 * by XOR-ing the id with a fixed 64-bit salt before encoding — it's not
 * cryptographic security, just enough to stop trivial enumeration of
 * "/1, /2, /3...". For genuinely unguessable codes, swap this for a
 * Feistel-network-based permutation or move to random generation + a
 * Redis-backed uniqueness check.
 *
 * At multi-node write scale, a single Postgres sequence becomes a
 * contention point. The standard fix is a Snowflake-style ID (timestamp +
 * node id + sequence bits) generated in the app layer instead of relying on
 * the DB's autoincrement.
 */

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BASE = BigInt(ALPHABET.length);

// Fixed XOR salt to de-correlate short codes from raw sequential order.
// (Not a secret — just enough obfuscation to avoid trivial enumeration.)
const OBFUSCATION_SALT = BigInt("0x9E3779B97F4A7C15"); // golden-ratio-derived constant

export function encode(id: bigint): string {
  const obfuscated = id ^ OBFUSCATION_SALT;
  // Force positive representation since bigint XOR can go negative depending on bit width
  let n = obfuscated < 0n ? -obfuscated : obfuscated;

  if (n === 0n) return ALPHABET[0];

  let out = "";
  while (n > 0n) {
    const remainder = n % BASE;
    out = ALPHABET[Number(remainder)] + out;
    n = n / BASE;
  }
  return out;
}

export function decode(code: string): bigint {
  let n = 0n;
  for (const char of code) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid character in short code: ${char}`);
    }
    n = n * BASE + BigInt(index);
  }
  return n ^ OBFUSCATION_SALT;
}
