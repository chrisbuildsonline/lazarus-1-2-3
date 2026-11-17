// A RaisedFile from real bytes through the worker's handler, as the app receives it.
import { readFileSync } from "node:fs";
import { handleRaiseRequest, type RaisedFile } from "../../../src/workers/verify-protocol.ts";

export async function raiseBytes(bytes: Uint8Array, name: string): Promise<RaisedFile> {
  let file: RaisedFile | null = null;
  await handleRaiseRequest({ type: "raise", id: 1, name, bytes: bytes.slice().buffer }, (m) => {
    if (m.type === "raised") file = m.file;
  });
  if (!file) throw new Error(`${name} was not raised`);
  return file;
}

export const raiseFixture = (path: string): Promise<RaisedFile> => raiseBytes(new Uint8Array(readFileSync(path)), path.split("/").pop()!);
