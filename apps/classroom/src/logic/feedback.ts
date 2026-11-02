// What a marked question may reveal. Owner rule: a WRONG answer never shows the right answer (no green correct
// option, no "Answer: ..." line), so students cannot copy it. A right answer behaves as before. The Classroom
// "Practice (show answer)" mode passes correct: true (the kid self-marks after the reveal), so it is unchanged.
export interface RevealLike {
  correct: boolean;
  /** the screen asks for the model answer to be listed under each part (mini games, practice) */
  showAnswer?: boolean;
}

/** Green-highlight the question's correct MCQ option? Only when the kid got it right. */
export const showCorrectOption = (reveal?: RevealLike | null): boolean => !!reveal && reveal.correct;

/** List "Answer: ..." under each part? Only when requested AND the kid got it right (or practice mode). */
export const showAnswerLines = (reveal?: RevealLike | null): boolean => !!reveal && reveal.correct && !!reveal.showAnswer;
