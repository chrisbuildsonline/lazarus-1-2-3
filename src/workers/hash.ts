// The worker hashes with the report module's sha256Hex (no copy). Re-exported here so that
// verify-protocol.ts imports only ../verify, ../parser and files of src/workers.
export { sha256Hex } from "../report/sha256.ts";
