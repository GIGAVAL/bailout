import { describe, expect, it } from "vitest";
import { terminalKeyAction } from "./terminal";

describe("Terminal function keys", () => {
  it("maps F1 to Undo", () => expect(terminalKeyAction("F1")).toBe("undo"));
  it("maps F2 to Reset", () => expect(terminalKeyAction("F2")).toBe("reset"));
  it("maps F3 to 2D/3D", () => expect(terminalKeyAction("F3")).toBe("view"));
  it("maps F4 to Short", () => expect(terminalKeyAction("F4")).toBe("short"));
  it("ignores other keys", () => expect(terminalKeyAction("F5")).toBeUndefined());
});