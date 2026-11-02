import { describe, expect, it } from "vitest";
import { feedbackText, formatFamilyCode, isFamilyCode, joinNames, normalizeFamilyCode, type Lesson } from "../src/lessons";

const lesson: Pick<Lesson, "title" | "intro" | "goals"> = {
  title: "Science end-year paper",
  intro: "Today, {names} completed their science papers to test their understanding.",
  goals: [
    { id: "g1", text: "MCQ", scripts: { good: "{name} got full marks for the MCQ.", ok: "{name} did well in the MCQ.", bad: "{name} found the MCQ hard." } },
    { id: "g2", text: "Keywords", scripts: { good: "{name} used the keywords well.", ok: "{name} is applying more keywords.", bad: "{name} forgot many keywords." } },
  ],
};

describe("feedbackText", () => {
  it("one message per family: greeting, intro with all names, then each child's sentences and note", () => {
    const t = feedbackText({ parentName: "Ning Lee", lesson, children: [
      { name: "Zimo Tan", goals: { g1: "good", g2: "ok" }, note: "She didn't finish in time." },
      { name: "Ziqiao Tan", goals: { g1: "good" }, note: "" },
    ] });
    expect(t).toBe([
      "Hi Ning!",
      "Today, Zimo and Ziqiao completed their science papers to test their understanding.",
      "Zimo got full marks for the MCQ. Zimo is applying more keywords. She didn't finish in time.",
      "Ziqiao got full marks for the MCQ.",
    ].join("\n\n"));
  });
  it("a child with nothing chosen and no note adds nothing; a missing intro has a default", () => {
    expect(feedbackText({ parentName: "", lesson: { ...lesson, intro: "" }, children: [{ name: "Ann", goals: {}, note: "" }] }))
      .toBe("Hi there!\n\nToday, Ann worked on Science end-year paper.");
  });
});

describe("names and codes", () => {
  it("joins first names", () => {
    expect(joinNames(["Zimo Tan"])).toBe("Zimo");
    expect(joinNames(["A B", "C", "D"])).toBe("A, C and D");
  });
  it("family codes", () => {
    expect(normalizeFamilyCode(" abcde-fghjk ")).toBe("ABCDEFGHJK");
    expect(isFamilyCode("ABCDEFGHJK")).toBe(true);
    expect(isFamilyCode("ABCDEFGHJ0")).toBe(false); // 0 is not in the alphabet
    expect(formatFamilyCode("ABCDEFGHJK")).toBe("ABCDE-FGHJK");
  });
});
