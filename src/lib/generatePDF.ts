import { jsPDF } from "jspdf";

export function generateQAReportPDF(report: any) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const margin = 16;
  const contentW = W - margin * 2;
  let y = margin;

  const colors = {
    bg: [8, 10, 20] as [number, number, number],
    panel: [18, 22, 40] as [number, number, number],
    critical: [220, 38, 38] as [number, number, number],
    high: [234, 88, 12] as [number, number, number],
    warning: [202, 138, 4] as [number, number, number],
    pass: [22, 163, 74] as [number, number, number],
    text: [230, 232, 245] as [number, number, number],
    muted: [140, 145, 175] as [number, number, number],
    accent: [99, 102, 241] as [number, number, number],
    white: [255, 255, 255] as [number, number, number],
    border: [40, 45, 70] as [number, number, number],
  };

  const PAGE_H = 297;

  function checkPage(needed = 10) {
    if (y + needed > PAGE_H - margin) {
      doc.addPage();
      // dark bg on new page
      doc.setFillColor(...colors.bg);
      doc.rect(0, 0, W, PAGE_H, "F");
      y = margin;
    }
  }

  function setFont(style: "normal" | "bold" | "italic" = "normal", size = 10, color = colors.text) {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  }

  function text(str: string, x: number, yPos: number, opts?: any) {
    doc.text(str, x, yPos, opts);
  }

  function wrappedText(str: string, x: number, yPos: number, maxW: number, lineH = 5): number {
    const lines = doc.splitTextToSize(str || "", maxW);
    lines.forEach((line: string) => {
      checkPage(lineH + 2);
      doc.text(line, x, yPos);
      yPos += lineH;
    });
    return yPos;
  }

  // ── Background ──────────────────────────────────────────────────────────────
  doc.setFillColor(...colors.bg);
  doc.rect(0, 0, W, PAGE_H, "F");

  // ── Header banner ───────────────────────────────────────────────────────────
  doc.setFillColor(...colors.accent);
  doc.roundedRect(margin, y, contentW, 28, 4, 4, "F");
  setFont("bold", 20, colors.white);
  text("QA Security Test Report", margin + 8, y + 12);
  setFont("normal", 9, [200, 200, 230]);
  const src = report?.summary?.source || report?.metadata?.source || "Unknown";
  text(`Target: ${src}`, margin + 8, y + 19);
  const ts = report?.summary?.testedAt ? new Date(report.summary.testedAt).toLocaleString() : new Date().toLocaleString();
  text(`Generated: ${ts}`, margin + 8, y + 25);
  y += 34;

  // ── Summary stats ───────────────────────────────────────────────────────────
  checkPage(24);
  setFont("bold", 11, colors.text);
  text("Summary", margin, y);
  y += 6;

  const stats = [
    { label: "CRITICAL", value: report?.summary?.criticalIssues ?? 0, color: colors.critical },
    { label: "HIGH", value: report?.summary?.highPriorityIssues ?? 0, color: colors.high },
    { label: "WARNINGS", value: report?.summary?.warnings ?? 0, color: colors.warning },
    { label: "PASSED", value: report?.summary?.passedChecks ?? 0, color: colors.pass },
  ];
  const boxW = (contentW - 9) / 4;
  stats.forEach((s, i) => {
    const bx = margin + i * (boxW + 3);
    doc.setFillColor(...colors.panel);
    doc.roundedRect(bx, y, boxW, 18, 3, 3, "F");
    doc.setDrawColor(...s.color);
    doc.setLineWidth(0.8);
    doc.roundedRect(bx, y, boxW, 18, 3, 3, "S");
    setFont("bold", 16, s.color);
    text(String(s.value), bx + boxW / 2, y + 11, { align: "center" });
    setFont("normal", 7, colors.muted);
    text(s.label, bx + boxW / 2, y + 16, { align: "center" });
  });
  y += 24;

  // Overall status pill
  checkPage(12);
  const status = (report?.summary?.overallStatus || "warning").toUpperCase();
  const statusColor = status === "PASS" ? colors.pass : status === "FAIL" ? colors.critical : colors.warning;
  doc.setFillColor(...statusColor);
  doc.roundedRect(margin, y, 40, 8, 2, 2, "F");
  setFont("bold", 9, colors.white);
  text(`STATUS: ${status}`, margin + 20, y + 5.5, { align: "center" });
  const totalTests = report?.summary?.totalTests || (
    (report?.summary?.criticalIssues ?? 0) +
    (report?.summary?.highPriorityIssues ?? 0) +
    (report?.summary?.warnings ?? 0) +
    (report?.summary?.passedChecks ?? 0)
  );
  setFont("normal", 9, colors.muted);
  text(`${totalTests} tests run`, margin + 46, y + 5.5);
  y += 14;

  // ── Issue sections ──────────────────────────────────────────────────────────
  interface ReportSection {
    title: string;
    items: any[];
    color: [number, number, number];
    severity: string;
  }

  const sections: ReportSection[] = [
    { title: "CRITICAL ISSUES", items: report?.criticalIssues || [], color: colors.critical, severity: "CRITICAL" },
    { title: "HIGH PRIORITY ISSUES", items: report?.highPriorityIssues || [], color: colors.high, severity: "HIGH" },
    { title: "WARNINGS", items: report?.warnings || [], color: colors.warning, severity: "WARN" },
    { title: "PASSED CHECKS", items: report?.passedChecks || [], color: colors.pass, severity: "PASS" },
  ];

  for (const section of sections) {
    if (section.items.length === 0) continue;

    checkPage(16);
    // Section header
    doc.setFillColor(...section.color);
    doc.rect(margin, y, 3, 8, "F");
    setFont("bold", 11, section.color);
    text(`${section.title} (${section.items.length})`, margin + 6, y + 6);
    y += 12;

    for (const item of section.items) {
      checkPage(30);

      // Card background
      const startY = y;
      doc.setFillColor(...colors.panel);
      // Estimate height
      const descLines = doc.splitTextToSize(item.description || "", contentW - 24).length;
      const impactLines = item.impact ? doc.splitTextToSize(`Impact: ${item.impact}`, contentW - 24).length : 0;
      const howLines = item.howTested ? doc.splitTextToSize(`How Tested: ${item.howTested}`, contentW - 24).length : 0;
      const causedLines = item.howCaused ? doc.splitTextToSize(`How Caused: ${item.howCaused}`, contentW - 24).length : 0;
      const fixLines = item.recommendation ? doc.splitTextToSize(`Fix: ${item.recommendation}`, contentW - 24).length : 0;
      const totalLines = descLines + impactLines + howLines + causedLines + fixLines;
      const cardH = Math.min(8 + totalLines * 4.5 + 6, 120);

      if (y + cardH > PAGE_H - margin) {
        doc.addPage();
        doc.setFillColor(...colors.bg);
        doc.rect(0, 0, W, PAGE_H, "F");
        y = margin;
      }

      doc.setFillColor(...colors.panel);
      doc.roundedRect(margin, y, contentW, cardH, 3, 3, "F");
      doc.setDrawColor(...section.color);
      doc.setLineWidth(0.4);
      doc.roundedRect(margin, y, contentW, cardH, 3, 3, "S");
      doc.setFillColor(...section.color);
      doc.rect(margin, y, 3, cardH, "F");

      const cx = margin + 6;
      y += 5;

      // Type badge
      setFont("bold", 8, section.color);
      text(`[${section.severity}] ${item.type || "Issue"}`, cx, y);
      if (item.location) {
        setFont("normal", 7, colors.muted);
        text(String(item.location).slice(0, 60), margin + contentW - 2, y, { align: "right" });
      }
      y += 5;

      // Description
      setFont("normal", 8.5, colors.text);
      y = wrappedText(item.description || "", cx, y, contentW - 24, 4.5);

      // Impact
      if (item.impact) {
        setFont("bold", 7.5, [255, 160, 80]);
        y = wrappedText(`Impact: ${item.impact}`, cx, y, contentW - 24, 4.2);
      }

      // How Tested
      if (item.howTested) {
        setFont("bold", 7.5, [140, 180, 255]);
        y = wrappedText(`How Tested: ${item.howTested}`, cx, y, contentW - 24, 4.2);
      }

      // How Caused
      if (item.howCaused) {
        setFont("bold", 7.5, [255, 200, 100]);
        y = wrappedText(`How Caused: ${item.howCaused}`, cx, y, contentW - 24, 4.2);
      }

      // Fix
      if (item.recommendation) {
        setFont("bold", 7.5, [100, 220, 130]);
        y = wrappedText(`Fix: ${item.recommendation}`, cx, y, contentW - 24, 4.2);
      }

      y = Math.max(y, startY + cardH) + 4;
    }

    y += 4;
  }

  // ── Footer on every page ────────────────────────────────────────────────────
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFillColor(...colors.bg);
    doc.rect(0, PAGE_H - margin, W, margin, "F");
    setFont("normal", 7, colors.muted);
    text(`QA Testing Platform — Designed, built & tested by Johnatan Milrad`, margin, PAGE_H - 6);
    text(`Page ${i} / ${totalPages}`, W - margin, PAGE_H - 6, { align: "right" });
  }

  const filename = `QA-Report-${src.replace(/[^a-z0-9]/gi, "_").slice(0, 40)}-${Date.now()}.pdf`;
  doc.save(filename);
}
