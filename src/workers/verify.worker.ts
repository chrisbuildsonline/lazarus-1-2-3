// The verify Web Worker: parsing and recalculation run here, off the page (requirement 8).
import { installVerifyWorker, type WorkerScopeLike } from "./verify-protocol.ts";
installVerifyWorker(self as unknown as WorkerScopeLike);
