import { describe, expect, it } from "vitest";
import { docsFromExport } from "../src/sync";

const q = { question: "What is 1/2 of 10?", difficulty: "LV2", topic_primary: "Fractions" };

describe("docsFromExport", () => {
  it("reads a plain array with ids", () => {
    expect(docsFromExport([{ ...q, id: "2024_A_P2_Q1" }]).map((d) => d.id)).toEqual(["2024_A_P2_Q1"]);
  });
  it("reads {questions: [...]}", () => {
    expect(docsFromExport({ questions: [{ ...q, id: "x" }] })).toHaveLength(1);
  });
  it("takes ids from map keys", () => {
    expect(docsFromExport({ questions: { "2023_B_P1_Q4": q } })[0].id).toBe("2023_B_P1_Q4");
    expect(docsFromExport({ "2022_C_P2_Q9": q })[0].id).toBe("2022_C_P2_Q9");
  });
  it("derives ids from year + source_id", () => {
    expect(docsFromExport([{ ...q, year: 2025, source_id: "D_P2_Q3" }])[0].id).toBe("2025_D_P2_Q3");
  });
  it("skips entries that are not questions", () => {
    expect(docsFromExport({ meta: { exportedAt: "today" }, "2021_E_P2_Q1": q })).toHaveLength(1);
    expect(docsFromExport(null)).toEqual([]);
  });
});
