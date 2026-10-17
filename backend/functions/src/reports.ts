import { HttpsError, onCall } from "firebase-functions/v2/https";
import { MAX_REPORTS_PER_DAY, type ReportQuestionResponse } from "./shared/index.js";
import { col, db, editorDb, FieldValue, requireUid, throwFail } from "./admin.js";
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
  // The editor owns the question bank: if it renamed or removed the question, the report is still kept (the master
  // sees reports without an access_key; volunteers see the ones in their scope).
  const question = await editorDb.collection(col.questions).doc(r.questionId).get();
  const q = (question.data() ?? {}) as { access_key?: string; chapter?: string; difficulty?: string };
  const reportRef = editorDb.collection(col.questionReports).doc(`${r.questionId}__${uid}`);
  const quotaRef = db.collection(col.users).doc(uid).collection("reportQuota").doc(sgtDate(Date.now()));

  // The quota lives in the student project, the report in the editor project: two transactions (one cannot span
  // projects). A failed report write gives the quota unit back.
  await db.runTransaction(async (tx) => {
    const quota = await tx.get(quotaRef);
    const used = quota.exists ? Number(quota.data()!.count ?? 0) : 0;
    if (used >= MAX_REPORTS_PER_DAY) throw new HttpsError("resource-exhausted", "That's a lot of reports today. Try again tomorrow.");
    tx.set(quotaRef, { count: used + 1, updatedAt: FieldValue.serverTimestamp() });
  });
  try {
    return await editorDb.runTransaction(async (tx) => {
      const existing = await tx.get(reportRef);
      tx.set(reportRef, {
        question_id: r.questionId,
        access_key: q.access_key ?? (q.chapter && q.difficulty ? `${q.chapter}|${q.difficulty}` : null),
        question_found: question.exists,
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
  } catch (e) {
    await quotaRef.set({ count: FieldValue.increment(-1), updatedAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => undefined);
    throw e;
  }
});
