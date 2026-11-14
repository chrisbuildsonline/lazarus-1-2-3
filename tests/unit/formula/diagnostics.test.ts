import { describe, expect, it } from "vitest";
import { diag, hexOpcode } from "../../../src/formula/diagnostics.ts";

describe("formula diagnostics", () => {
  it("formats opcodes as 0x%02X", () => {
    expect(hexOpcode(31)).toBe("0x1F");
    expect(hexOpcode(10)).toBe("0x0A");
    expect(hexOpcode(0)).toBe("0x00");
    expect(hexOpcode(255)).toBe("0xFF");
  });

  it("builds a diagnostic whose message names the opcode and the decimal offset", () => {
    const d = diag("unknown-opcode", "error", 12, "no table entry", 0x1f);
    expect(d).toMatchObject({ code: "unknown-opcode", severity: "error", offset: 12, opcode: 0x1f });
    expect(d.message).toContain("0x1F");
    expect(d.message).toContain("12");
  });

  it("leaves opcode out when no token is involved", () => {
    const d = diag("excel-limit", "error", 3, "too long");
    expect("opcode" in d).toBe(false);
    expect(d.message).toContain("3");
  });
});
