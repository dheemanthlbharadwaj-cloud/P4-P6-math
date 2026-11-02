// Catapult Classroom data: the real callables (services/api.ts lessonsApi) or, with ?mock=1, a demo backend in this
// browser's localStorage that follows the same rules (lessons/mock.ts).
import { lessonsApi } from "../services/api";
import { MOCK_AREAS } from "../roles/mock";
import { mockLessons } from "./mock";

export type LessonsBackend = typeof lessonsApi;
export const backend: LessonsBackend = MOCK_AREAS ? mockLessons : lessonsApi;
