import { describe, expect, it } from "vitest";
import { screenClass } from "./screenClass";

describe("screenClass", () => {
  it("phones, including held sideways", () => {
    expect(screenClass(390, 844)).toBe("phone");
    expect(screenClass(844, 390)).toBe("phone");
  });
  it("tablets", () => {
    expect(screenClass(820, 1180)).toBe("tablet");
    expect(screenClass(1024, 768)).toBe("tablet");
  });
  it("laptops and desktops", () => {
    expect(screenClass(1366, 768)).toBe("desktop");
    expect(screenClass(1920, 1080)).toBe("desktop");
    expect(screenClass(1280, 720)).toBe("desktop");
  });
});
