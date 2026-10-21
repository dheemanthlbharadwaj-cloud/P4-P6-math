// The A4 print view of a worksheet / test, web only. It renders into a plain DOM container attached to <body> (outside
// the app root), so the browser prints exactly this and the page breaks are the browser's own: each question is kept in
// one piece (break-inside: avoid) and @page sets A4 with margins. The questions are drawn with the app's own RichText
// and figure components (figures come from the web figure registry = Cloudinary), numbered, with answer space.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { ClassDoc, ClassTask, Grade, Question } from "@p6/shared";
import { FigureImg } from "../components/FigureImg";
import { RichText, richToPlain } from "../components/RichText";
import { getQuestion } from "../content";
import { bundledImage, isWebFigure, useFigure } from "../content/useFigure";
import { formatDate, partTag } from "./helpers";
import type { PrintMode } from "./PrintSheet";

export type { PrintMode };

const CSS = `
#root, #boot, #update { display: none !important; }
html, body { background: #e9e6df !important; }
.p6p-scroll { position: fixed; inset: 0; overflow: auto; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #111; }
.p6p-bar { position: sticky; top: 0; z-index: 5; display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 10px 16px; background: #fff7ea; border-bottom: 3px solid #33262a; }
.p6p-bar h2 { margin: 0 12px 0 0; font-size: 17px; }
.p6p-btn { font: 700 14px system-ui, sans-serif; padding: 8px 14px; border: 2px solid #33262a; border-radius: 10px; background: #fff; color: #33262a; cursor: pointer; }
.p6p-btn.primary { background: #12aecf; color: #fff; }
.p6p-btn[disabled] { opacity: .5; cursor: default; }
.p6p-btn.on { background: #ffc93c; }
.p6p-note { font-size: 13px; color: #75656a; }
.p6p-page { box-sizing: border-box; width: 210mm; min-height: 297mm; margin: 18px auto; padding: 16mm 16mm 18mm; background: #fff; box-shadow: 0 2px 12px rgba(0,0,0,.25); }
.p6p-head { border-bottom: 2.5px solid #111; padding-bottom: 8px; margin-bottom: 10px; }
.p6p-head .top { display: flex; justify-content: space-between; align-items: baseline; font-size: 12.5px; letter-spacing: .04em; text-transform: uppercase; color: #444; }
.p6p-head h1 { margin: 4px 0 8px; font-size: 22px; line-height: 1.2; }
.p6p-name { display: flex; gap: 18px; align-items: flex-end; font-size: 14px; }
.p6p-name .f { display: flex; align-items: flex-end; gap: 6px; }
.p6p-name .ln { display: inline-block; border-bottom: 1.5px solid #111; height: 1em; }
.p6p-intro { font-size: 12.5px; color: #333; margin: 6px 0 14px; }
.p6p-q { break-inside: avoid; page-break-inside: avoid; display: flex; gap: 10px; margin: 0 0 14px; }
.p6p-n { flex: none; width: 28px; font-weight: 700; font-size: 16px; padding-top: 2px; }
.p6p-b { flex: 1; min-width: 0; }
.p6p-calc { float: right; margin: 0 0 4px 10px; font-size: 10.5px; color: #555; border: 1px solid #999; border-radius: 4px; padding: 0 5px; }
.p6p-opt { display: flex; gap: 8px; align-items: flex-start; margin: 5px 0 0 4px; }
.p6p-opt .k { flex: none; width: 26px; font-size: 14px; padding-top: 4px; }
.p6p-fig { margin: 8px 0 4px; }
.p6p-part { margin-top: 8px; }
.p6p-ans { display: flex; align-items: flex-end; gap: 8px; margin-top: 8px; font-size: 14px; }
.p6p-ans .ln { flex: 0 1 230px; min-width: 90px; border-bottom: 1.5px solid #111; height: 1.35em; }
.p6p-ans.mcq { justify-content: flex-end; }
.p6p-ans .box { display: inline-block; width: 44px; height: 24px; border: 1.5px solid #111; border-radius: 3px; }
.p6p-work { margin-top: 8px; height: 26mm; border: 1.2px dashed #9a9a9a; border-radius: 4px; padding: 3px 6px; font-size: 10px; color: #8a8a8a; }
.p6p-key { width: 100%; border-collapse: collapse; font-size: 14px; }
.p6p-key th, .p6p-key td { border: 1px solid #333; padding: 6px 8px; text-align: left; vertical-align: top; }
.p6p-key th { background: #eee; }
.p6p-key tr { break-inside: avoid; page-break-inside: avoid; }
@page { size: A4; margin: 14mm 14mm 16mm 14mm; @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 9pt system-ui, sans-serif; color: #666; } }
@media print {
  html, body { background: #fff !important; height: auto !important; overflow: visible !important; }
  .p6p-scroll { position: static; overflow: visible; }
  .p6p-bar { display: none !important; }
  .p6p-page { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; }
  .p6p-page + .p6p-page { break-before: page; page-break-before: always; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

type FigState = "loading" | "ready" | "failed";

function PrintFigure({ q, grade, report }: { q: Question; grade: Grade; report: (id: string, s: FigState) => void }) {
  const fig = useFigure(grade, q.figure, q.id);
  const img = fig ? bundledImage(fig) : undefined;
  const failed = !!fig && isWebFigure(fig) && fig.failed;
  const state: FigState = img ? "ready" : failed ? "failed" : "loading";
  useEffect(() => { report(q.id, state); }, [q.id, state, report]);
  if (!fig) return null;
  const dims = typeof img === "object" && img ? { w: img.width, h: img.height } : null;
  const scale = dims ? Math.min(1, 560 / dims.w, 330 / dims.h) : 1; // CSS px: about 148 mm x 87 mm at most
  const style = dims ? { width: Math.round(dims.w * scale), height: Math.round(dims.h * scale) } : { width: "100%" as const, height: 220 };
  return <div className="p6p-fig"><FigureImg fig={fig} style={style} label="Question picture" /></div>;
}

function QuestionBlock({ q, n, grade, report }: { q: Question; n: number; grade: Grade; report: (id: string, s: FigState) => void }) {
  return (
    <div className="p6p-q">
      <div className="p6p-n">{n}.</div>
      <div className="p6p-b">
        <span className="p6p-calc">{q.calculatorAllowed ? "Calculator allowed" : "No calculator"}</span>
        <RichText tokens={q.stem} size={16} />
        {q.figure ? <PrintFigure q={q} grade={grade} report={report} /> : null}
        {q.type === "mcq" ? (
          <>
            {(q.options ?? []).map((o) => (
              <div className="p6p-opt" key={o.key}><div className="k">({o.key})</div><div style={{ flex: 1, minWidth: 0 }}><RichText tokens={o.text} size={15} /></div></div>
            ))}
            <div className="p6p-ans mcq"><span>Ans:</span><span className="box" /></div>
          </>
        ) : (
          <>
            {(q.parts?.length ? q.parts : [undefined]).map((p, i, all) => {
              const unit = p && "unit" in p.answer ? p.answer.unit : undefined;
              return (
                <div className="p6p-part" key={i}>
                  {p && (p.label?.length || all.length > 1) ? (
                    <div style={{ display: "flex", gap: 8 }}>
                      {all.length > 1 ? <div style={{ flex: "none", fontSize: 15 }}>{partTag(i, p.part)}</div> : null}
                      {p.label?.length ? <div style={{ flex: 1, minWidth: 0 }}><RichText tokens={p.label} size={15} /></div> : null}
                    </div>
                  ) : null}
                  <div className="p6p-ans"><span>Ans:</span><span className="ln" />{unit ? <span>{unit}</span> : null}</div>
                </div>
              );
            })}
            <div className="p6p-work">Working</div>
          </>
        )}
      </div>
    </div>
  );
}

function answerOf(q: Question): string {
  if (q.type === "mcq") {
    const o = q.options?.find((x) => x.key === q.correctOption);
    return `(${q.correctOption ?? "?"}) ${o ? richToPlain(o.text) : ""}`.trim();
  }
  const parts = q.parts ?? [];
  return parts.map((p, i) => `${parts.length > 1 ? partTag(i, p.part) + " " : ""}${p.display || "-"}`).join("    ");
}

export function PrintSheet({ cls, task, mode, onMode, onBack }: { cls: ClassDoc; task: ClassTask; mode: PrintMode; onMode: (m: PrintMode) => void; onBack: () => void }) {
  const questions = useMemo(() => task.questionIds.map((id) => ({ id, q: getQuestion(task.grade, id) })), [task]);
  const [figs, setFigs] = useState<Record<string, FigState>>({});
  const report = useCallback((id: string, s: FigState) => setFigs((f) => (f[id] === s ? f : { ...f, [id]: s })), []);
  const loading = Object.values(figs).filter((s) => s === "loading").length;
  const failed = Object.values(figs).filter((s) => s === "failed").length;
  const missing = questions.filter((x) => !x.q).length;
  const date = formatDate(Date.now());
  const kindLabel = task.kind === "worksheet" ? "Worksheet" : "Diagnostic test";

  useEffect(() => { const prev = document.title; document.title = `${task.title} - ${cls.name}`; return () => { document.title = prev; }; }, [task.title, cls.name]);

  const showSheet = mode !== "key";
  const showKey = mode !== "sheet";
  return createPortal(
    <div className="p6p-scroll">
      <style>{CSS}</style>
      <div className="p6p-bar">
        <h2>Print: {task.title}</h2>
        <button className="p6p-btn" onClick={onBack}>Back to dashboard</button>
        <button className={`p6p-btn${mode === "sheet" ? " on" : ""}`} onClick={() => onMode("sheet")}>Worksheet</button>
        <button className={`p6p-btn${mode === "both" ? " on" : ""}`} onClick={() => onMode("both")}>Worksheet + answer key</button>
        <button className={`p6p-btn${mode === "key" ? " on" : ""}`} onClick={() => onMode("key")}>Answer key only (teacher)</button>
        <button className="p6p-btn primary" onClick={() => window.print()} disabled={loading > 0}>Print / Save as PDF</button>
        <span className="p6p-note">
          {loading > 0 ? `Loading ${loading} picture${loading === 1 ? "" : "s"}…` : failed > 0 ? `${failed} picture${failed === 1 ? "" : "s"} didn't load. Reload the page, then print.` : "A4. In the print window choose Save as PDF to make a file."}
          {missing > 0 ? ` ${missing} question${missing === 1 ? " is" : "s are"} not in this build's question bank.` : ""}
        </span>
      </div>

      {showSheet ? (
        <div className="p6p-page" data-testid="sheet">
          <div className="p6p-head">
            <div className="top"><span>{cls.name} · {kindLabel}</span><span>{date}</span></div>
            <h1>{task.title}</h1>
            <div className="p6p-name">
              <span className="f">Name: <span className="ln" style={{ width: 230 }} /></span>
              <span className="f">Class: <span className="ln" style={{ width: 90 }} /></span>
              <span className="f" style={{ marginLeft: "auto" }}>Score: <span className="ln" style={{ width: 40 }} /> / {task.questionIds.length}</span>
            </div>
          </div>
          <div className="p6p-intro">Answer all {task.questionIds.length} questions. Show your working in the box where there is one.{task.dueAt ? ` Hand in by ${formatDate(task.dueAt)}.` : ""}</div>
          {questions.map(({ id, q }, i) => q ? <QuestionBlock key={id} q={q} n={i + 1} grade={task.grade} report={report} /> : (
            <div className="p6p-q" key={id}><div className="p6p-n">{i + 1}.</div><div className="p6p-b">Question {id} is not in this build's question bank.</div></div>
          ))}
        </div>
      ) : null}

      {showKey ? (
        <div className="p6p-page" data-testid="key">
          <div className="p6p-head">
            <div className="top"><span>{cls.name} · Answer key (teacher copy)</span><span>{date}</span></div>
            <h1>{task.title}</h1>
          </div>
          <table className="p6p-key">
            <thead><tr><th style={{ width: 40 }}>No.</th><th>Answer</th></tr></thead>
            <tbody>{questions.map(({ id, q }, i) => <tr key={id}><td>{i + 1}</td><td>{q ? answerOf(q) : "-"}</td></tr>)}</tbody>
          </table>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
