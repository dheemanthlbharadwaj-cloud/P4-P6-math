import { HttpsError, onCall } from "firebase-functions/v2/https";
import { MAX_REPORTS_PER_DAY, type ReportQuestionResponse } from "./shared/index.js";
import { col, db, FieldValue, requireUid, throwFail } from "./admin.js";
import { sgtDate } from "./logic/dates.js";
import { validateReport } from "./logic/rules.js";

/**
 * A student reports a problem with a question. One report per student per question
 * (question_reports/{questionId}__{uid}); reporting again updates and reopens it. The report copies the question's
 * access_key (chapter|difficulty) so volunteers see reports for the questions they look after (editor rules).
 * Daily cap per student: users/{uid}/reportQuota/{SGT date}.
 */
export const reportQuestion = onCall(async (req): Promise<ReportQuestionResponse> => {
  const uid = requireUid(req);
  const v = validateReport(req.data);
  if (!v.ok) throwFail(v);
  const r = v.report;
  const question = await db.collection(col.questions).doc(r.questionId).get();
  if (!question.exists) throw new HttpsError("not-found", "unknown question");
  const q = question.data() as { access_key?: string; chapter?: string; difficulty?: string };
  const reportRef = db.collection(col.questionReports).doc(`${r.questionId}__${uid}`);
  const quotaRef = db.collection(col.users).doc(uid).collection("reportQuota").doc(sgtDate(Date.now()));

  return db.runTransaction(async (tx) => {
    const [quota, existing] = await Promise.all([tx.get(quotaRef), tx.get(reportRef)]);
    const used = quota.exists ? Number(quota.data()!.count ?? 0) : 0;
    if (used >= MAX_REPORTS_PER_DAY) throw new HttpsError("resource-exhausted", "That's a lot of reports today. Try again tomorrow.");
    tx.set(quotaRef, { count: used + 1, updatedAt: FieldValue.serverTimestamp() });
    tx.set(reportRef, {
      question_id: r.questionId,
      access_key: q.access_key ?? `${q.chapter ?? ""}|${q.difficulty ?? ""}`,
      chapter: q.chapter ?? null,
      difficulty: q.difficulty ?? null,
      grade: r.grade,
      reason: r.reason,
      note: r.note,
      context: r.context,
      answer_given: r.answerGiven,
      content_version: r.contentVersion,
      reporter_uid: uid,
      times_reported: (existing.exists ? Number(existing.data()!.times_reported ?? 1) : 0) + 1,
      status: "open",
      created_at: existing.exists ? existing.data()!.created_at ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
      resolved_by: null,
      resolved_at: null,
    });
    return { reportId: reportRef.id, updated: existing.exists };
  });
});
