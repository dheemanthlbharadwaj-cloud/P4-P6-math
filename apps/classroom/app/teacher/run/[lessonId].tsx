import React from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Shell } from "../../../src/lessons/Shell";
import { RunLesson } from "../../../src/lessons/RunLesson";
import { useTeacher } from "../../../src/lessons/store";
import { Notice } from "../../../src/components/dash";

export default function RunLessonPage() {
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  const router = useRouter();
  const lesson = useTeacher((s) => s.lessons.find((l) => l.id === lessonId));
  const back = () => { useTeacher.getState().go("lessons"); router.replace("/teacher"); };
  return <Shell active="lessons">{lesson ? <RunLesson lesson={lesson} onBack={back} /> : <Notice>That lesson isn't in the library (it may be archived).</Notice>}</Shell>;
}
