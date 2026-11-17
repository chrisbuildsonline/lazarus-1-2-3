// The raise Web Worker of the browser app: parsing, verification and hashing run here (requirement 16).
import { installRaiseWorker, type RaiseScopeLike } from "./verify-protocol.ts";
installRaiseWorker(self as unknown as RaiseScopeLike);
