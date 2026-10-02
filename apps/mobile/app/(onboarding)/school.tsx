import React, { useState } from "react";
import { useRouter } from "expo-router";
import { OnboardingFrame } from "../../src/components/OnboardingFrame";
import { catPoses } from "../../src/theme/cats";
import { useProfile } from "../../src/store/profile";
import { SchoolPicker } from "../../src/components/SchoolPicker";

export default function SchoolStep() {
  const router = useRouter();
  const [school, setSchool] = useState(useProfile.getState().school);
  return (
    <OnboardingFrame cat={catPoses.laptop} step={2} title="Which school are you from?" nextDisabled={school.trim().length < 2} onBack={() => router.back()}
      onNext={() => { useProfile.getState().set({ school: school.trim() }); router.push("/(onboarding)/topics"); }}>
      <SchoolPicker value={school} onChange={setSchool} />
    </OnboardingFrame>
  );
}
