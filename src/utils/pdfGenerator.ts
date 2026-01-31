import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface TestResult {
  category: string;
  testName: string;
  status: 'pass' | 'partial' | 'fail';
  description: string;
  actions: string;
  details: string;
}

interface QAReportItem {
  type: string;
  description: string;
  location: string;
  recommendation?: string;
  impact?: string;
}

interface QAReportData {
  summary: {
    totalFiles: number;
    criticalIssues: number;
    highPriorityIssues: number;
    warnings: number;
    passedChecks: number;
    overallStatus: 'pass' | 'warning' | 'fail';
  };
  criticalIssues: QAReportItem[];
  highPriorityIssues: QAReportItem[];
  warnings: QAReportItem[];
  passedChecks: QAReportItem[];
  detailedTests?: TestResult[];
  metadata?: any;
}

const getStatusColor = (status: string): [number, number, number] => {
  switch (status) {
    case 'pass':
      return [34, 197, 94]; // Green
    case 'partial':
      return [234, 179, 8]; // Yellow
    case 'fail':
      return [239, 68, 68]; // Red
    default:
      return [156, 163, 175]; // Gray
  }
};

const getStatusText = (status: string): string => {
  switch (status) {
    case 'pass':
      return 'PASS';
    case 'partial':
      return 'PARTIAL';
    case 'fail':
      return 'FAIL';
    default:
      return 'UNKNOWN';
  }
};

const drawPieSlice = (doc: jsPDF, cx: number, cy: number, radius: number, startAngle: number, endAngle: number) => {
  const steps = Math.max(20, Math.ceil(Math.abs(endAngle - startAngle) * 20));
  
  // Draw filled triangles to create the pie slice
  for (let i = 0; i < steps; i++) {
    const angle1 = startAngle + (endAngle - startAngle) * (i / steps);
    const angle2 = startAngle + (endAngle - startAngle) * ((i + 1) / steps);
    
    const x1 = cx + radius * Math.cos(angle1);
    const y1 = cy + radius * Math.sin(angle1);
    const x2 = cx + radius * Math.cos(angle2);
    const y2 = cy + radius * Math.sin(angle2);
    
    doc.triangle(cx, cy, x1, y1, x2, y2, 'F');
  }
};

export const generateSTDReport = (reportData: QAReportData) => {
  const testResults = reportData.detailedTests || [];
  const metadata = reportData.metadata || {};
  const doc = new jsPDF('l', 'mm', 'a4'); // Landscape for more space
  
  // Title
  doc.setFontSize(20);
  doc.setTextColor(0, 0, 0);
  doc.text('Software Testing Document (STD) Report', 148, 15, { align: 'center' });
  
  // Metadata
  doc.setFontSize(10);
  doc.text(`Test Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 14, 25);
  doc.text(`Tested By: Johnatan Milrad`, 14, 30);
  doc.text(`Test Source: ${metadata.source || 'N/A'}`, 14, 35);
  const passCount = testResults.filter(r => r.status === 'pass').length;
  const partialCount = testResults.filter(r => r.status === 'partial').length;
  const failCount = testResults.filter(r => r.status === 'fail').length;
  
  doc.text(`Pass: ${passCount} | Partial: ${partialCount} | Fail: ${failCount}`, 14, 45);
  
  // Summary stats from report data
  doc.setFillColor(240, 240, 240);
  doc.rect(14, 50, 270, 45, 'F');
  doc.setFontSize(12);
  doc.text(`Overall Status: ${reportData.summary.overallStatus.toUpperCase()}`, 20, 58);
  doc.text(`Critical Issues: ${reportData.summary.criticalIssues}`, 20, 66);
  doc.text(`High Priority: ${reportData.summary.highPriorityIssues}`, 20, 74);
  doc.text(`Warnings: ${reportData.summary.warnings}`, 20, 82);
  doc.text(`Passed Checks: ${reportData.summary.passedChecks}`, 20, 90);
  const totalTests = testResults.length || (passCount + partialCount + failCount);
  const totalForChart = totalTests || 1;
  doc.text(`Success Rate: ${((passCount / totalForChart) * 100).toFixed(1)}%`, 150, 58);
  doc.text(`Total Tests: ${totalTests}`, 150, 66);
  
  // Add SUMMARY ISSUES section (Critical, High Priority, Warnings, Passed)
  doc.addPage();
  doc.setFontSize(18);
  doc.setTextColor(0, 0, 0);
  doc.text('SUMMARY ISSUES & FINDINGS', 148, 15, { align: 'center' });
  
  // Pie chart for issue severity distribution at top of summary page
  const issueTotal = (reportData.summary.criticalIssues || 0) +
    (reportData.summary.highPriorityIssues || 0) +
    (reportData.summary.warnings || 0) +
    (reportData.summary.passedChecks || 0) || 1;
  const critPerc = (reportData.summary.criticalIssues || 0) / issueTotal;
  const highPerc = (reportData.summary.highPriorityIssues || 0) / issueTotal;
  const warnPerc = (reportData.summary.warnings || 0) / issueTotal;
  const passedPerc = (reportData.summary.passedChecks || 0) / issueTotal;
  
  const issueChartX = 60;
  const issueChartY = 55;
  const issueRadius = 22;
  
  doc.setFontSize(11);
  doc.text('Issue Severity', issueChartX, 30, { align: 'center' });
  
  let issueStart = -Math.PI / 2;
  
  // Critical - red
  if (critPerc > 0) {
    const end = issueStart + critPerc * 2 * Math.PI;
    doc.setFillColor(239, 68, 68);
    drawPieSlice(doc, issueChartX, issueChartY, issueRadius, issueStart, end);
    issueStart = end;
  }
  // High Priority - orange
  if (highPerc > 0) {
    const end = issueStart + highPerc * 2 * Math.PI;
    doc.setFillColor(249, 115, 22);
    drawPieSlice(doc, issueChartX, issueChartY, issueRadius, issueStart, end);
    issueStart = end;
  }
  // Warnings - yellow
  if (warnPerc > 0) {
    const end = issueStart + warnPerc * 2 * Math.PI;
    doc.setFillColor(234, 179, 8);
    drawPieSlice(doc, issueChartX, issueChartY, issueRadius, issueStart, end);
    issueStart = end;
  }
  // Passed checks - green
  if (passedPerc > 0) {
    const end = issueStart + passedPerc * 2 * Math.PI;
    doc.setFillColor(34, 197, 94);
    drawPieSlice(doc, issueChartX, issueChartY, issueRadius, issueStart, end);
  }
  
  // Chart border
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.circle(issueChartX, issueChartY, issueRadius, 'S');
  
  // Legend to the right of issue chart
  const issueLegendX = issueChartX + issueRadius + 10;
  const issueLegendY = issueChartY - 10;
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  
  doc.setFillColor(239, 68, 68);
  doc.rect(issueLegendX, issueLegendY, 4, 4, 'F');
  doc.text(`Critical: ${reportData.summary.criticalIssues}`, issueLegendX + 6, issueLegendY + 3);
  
  doc.setFillColor(249, 115, 22);
  doc.rect(issueLegendX, issueLegendY + 6, 4, 4, 'F');
  doc.text(`High: ${reportData.summary.highPriorityIssues}`, issueLegendX + 6, issueLegendY + 9);
  
  doc.setFillColor(234, 179, 8);
  doc.rect(issueLegendX, issueLegendY + 12, 4, 4, 'F');
  doc.text(`Warnings: ${reportData.summary.warnings}`, issueLegendX + 6, issueLegendY + 15);
  
  doc.setFillColor(34, 197, 94);
  doc.rect(issueLegendX, issueLegendY + 18, 4, 4, 'F');
  doc.text(`Passed: ${reportData.summary.passedChecks}`, issueLegendX + 6, issueLegendY + 21);
  
  let summaryY = 85;
  
  // Critical Issues Section
  if (reportData.criticalIssues.length > 0) {
    doc.setFontSize(14);
    doc.setFillColor(239, 68, 68);
    doc.rect(14, summaryY, 270, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(`CRITICAL ISSUES (${reportData.criticalIssues.length})`, 16, summaryY + 5);
    summaryY += 12;
    
    reportData.criticalIssues.forEach((issue, idx) => {
      if (summaryY > 185) {
        doc.addPage();
        summaryY = 20;
      }
      
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.setFillColor(254, 226, 226);
      doc.rect(14, summaryY, 270, 6, 'F');
      doc.text(`${idx + 1}. ${issue.type}`, 16, summaryY + 4);
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`Location: ${issue.location}`, 200, summaryY + 4);
      summaryY += 8;
      
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      const descLines = doc.splitTextToSize(issue.description, 260);
      doc.text(descLines, 20, summaryY);
      summaryY += descLines.length * 4;
      
      if (issue.impact) {
        doc.setTextColor(139, 0, 0);
        const impactLines = doc.splitTextToSize(`Impact: ${issue.impact}`, 260);
        doc.text(impactLines, 20, summaryY);
        summaryY += impactLines.length * 4;
      }
      
      if (issue.recommendation) {
        doc.setTextColor(0, 100, 0);
        const recLines = doc.splitTextToSize(`Fix: ${issue.recommendation}`, 260);
        doc.text(recLines, 20, summaryY);
        summaryY += recLines.length * 4;
      }
      
      summaryY += 4;
    });
    summaryY += 6;
  }
  
  // High Priority Issues Section
  if (reportData.highPriorityIssues.length > 0) {
    if (summaryY > 170) {
      doc.addPage();
      summaryY = 20;
    }
    
    doc.setFontSize(14);
    doc.setFillColor(249, 115, 22);
    doc.rect(14, summaryY, 270, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(`HIGH PRIORITY ISSUES (${reportData.highPriorityIssues.length})`, 16, summaryY + 5);
    summaryY += 12;
    
    reportData.highPriorityIssues.forEach((issue, idx) => {
      if (summaryY > 185) {
        doc.addPage();
        summaryY = 20;
      }
      
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.setFillColor(255, 237, 213);
      doc.rect(14, summaryY, 270, 6, 'F');
      doc.text(`${idx + 1}. ${issue.type}`, 16, summaryY + 4);
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`Location: ${issue.location}`, 200, summaryY + 4);
      summaryY += 8;
      
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      const descLines = doc.splitTextToSize(issue.description, 260);
      doc.text(descLines, 20, summaryY);
      summaryY += descLines.length * 4;
      
      if (issue.recommendation) {
        doc.setTextColor(0, 100, 0);
        const recLines = doc.splitTextToSize(`Fix: ${issue.recommendation}`, 260);
        doc.text(recLines, 20, summaryY);
        summaryY += recLines.length * 4;
      }
      
      summaryY += 4;
    });
    summaryY += 6;
  }
  
  // Warnings Section
  if (reportData.warnings.length > 0) {
    if (summaryY > 170) {
      doc.addPage();
      summaryY = 20;
    }
    
    doc.setFontSize(14);
    doc.setFillColor(234, 179, 8);
    doc.rect(14, summaryY, 270, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(`WARNINGS (${reportData.warnings.length})`, 16, summaryY + 5);
    summaryY += 12;
    
    reportData.warnings.forEach((issue, idx) => {
      if (summaryY > 185) {
        doc.addPage();
        summaryY = 20;
      }
      
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.setFillColor(254, 249, 195);
      doc.rect(14, summaryY, 270, 6, 'F');
      doc.text(`${idx + 1}. ${issue.type}`, 16, summaryY + 4);
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`Location: ${issue.location}`, 200, summaryY + 4);
      summaryY += 8;
      
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      const descLines = doc.splitTextToSize(issue.description, 260);
      doc.text(descLines, 20, summaryY);
      summaryY += descLines.length * 4;
      
      if (issue.recommendation) {
        doc.setTextColor(0, 100, 0);
        const recLines = doc.splitTextToSize(`Fix: ${issue.recommendation}`, 260);
        doc.text(recLines, 20, summaryY);
        summaryY += recLines.length * 4;
      }
      
      summaryY += 4;
    });
    summaryY += 6;
  }
  
  // Passed Checks Section
  if (reportData.passedChecks.length > 0) {
    if (summaryY > 170) {
      doc.addPage();
      summaryY = 20;
    }
    
    doc.setFontSize(14);
    doc.setFillColor(34, 197, 94);
    doc.rect(14, summaryY, 270, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(`PASSED CHECKS (${reportData.passedChecks.length})`, 16, summaryY + 5);
    summaryY += 12;
    
    reportData.passedChecks.forEach((check, idx) => {
      if (summaryY > 190) {
        doc.addPage();
        summaryY = 20;
      }
      
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.setFillColor(220, 252, 231);
      doc.rect(14, summaryY, 270, 6, 'F');
      doc.text(`${idx + 1}. ${check.type}`, 16, summaryY + 4);
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`Location: ${check.location}`, 200, summaryY + 4);
      summaryY += 8;
      
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      const descLines = doc.splitTextToSize(check.description, 260);
      doc.text(descLines, 20, summaryY);
      summaryY += descLines.length * 4 + 3;
    });
  }
  
  // Only add detailed tests section if there are detailed tests
  if (testResults.length > 0) {
  doc.addPage();
  doc.setFontSize(18);
  doc.setTextColor(0, 0, 0);
  doc.text('TEST PLAN OVERVIEW', 148, 15, { align: 'center' });
  
  doc.setFontSize(11);
  doc.text('This section describes the test strategy and objectives before execution.', 148, 25, { align: 'center' });
  
  // Group results by category
  const categories = Array.from(new Set(testResults.map(r => r.category)));
  
  // Test Plan by Category
  let planY = 35;
  doc.setFontSize(12);
  doc.setTextColor(59, 130, 246);
  doc.text('Test Scope by Category:', 14, planY);
  planY += 8;
  
  categories.forEach((category, idx) => {
    const categoryResults = testResults.filter(r => r.category === category);
    
    // Check if we need a new page
    if (planY > 180) {
      doc.addPage();
      planY = 20;
    }
    
    // Category header
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.setFillColor(230, 230, 230);
    doc.rect(14, planY - 4, 270, 7, 'F');
    doc.text(`${idx + 1}. ${category.toUpperCase()} (${categoryResults.length} tests)`, 16, planY);
    planY += 8;
    
    // List test objectives (first 5 tests per category to keep it manageable)
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    const testsToShow = categoryResults.slice(0, 5);
    
    testsToShow.forEach((test, testIdx) => {
      if (planY > 185) {
        doc.addPage();
        planY = 20;
      }
      
      const testPlanText = `   ${idx + 1}.${testIdx + 1} Test Objective: ${test.testName}`;
      const splitText = doc.splitTextToSize(testPlanText, 260);
      doc.text(splitText, 20, planY);
      planY += splitText.length * 4;
      
      const descText = `       Goal: ${test.description}`;
      const splitDesc = doc.splitTextToSize(descText, 255);
      doc.text(splitDesc, 20, planY);
      planY += splitDesc.length * 4 + 2;
    });
    
    if (categoryResults.length > 5) {
      doc.setTextColor(100, 100, 100);
      doc.text(`   ... and ${categoryResults.length - 5} more tests in this category`, 20, planY);
      planY += 6;
    }
    
    planY += 4;
  });
  
  // Add Expected vs Actual Results section header
  doc.addPage();
  doc.setFontSize(18);
  doc.setTextColor(0, 0, 0);
  doc.text('TEST EXECUTION RESULTS', 148, 15, { align: 'center' });
  
  doc.setFontSize(11);
  doc.text('This section shows what was expected vs what actually happened during testing.', 148, 25, { align: 'center' });
  
  let startY = 35;
  
  categories.forEach((category, index) => {
    const categoryResults = testResults.filter(r => r.category === category);
    
    // Category header
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.setFillColor(230, 230, 230);
    doc.rect(14, startY - 5, 270, 8, 'F');
    doc.text(category.toUpperCase(), 16, startY);
    startY += 5;
    
    // Create table data with proper text wrapping
    const tableData = categoryResults.map(result => [
      result.testName || 'N/A',
      getStatusText(result.status),
      result.description || 'N/A',
      result.actions || 'N/A',
      result.details || 'N/A'
    ]);
    
    autoTable(doc, {
      startY: startY,
      head: [['Test Name', 'Status', 'Description', 'Actions Performed', 'Expected vs Actual']],
      body: tableData,
      theme: 'grid',
      headStyles: { 
        fillColor: [59, 130, 246],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
        halign: 'center',
        valign: 'middle',
        minCellHeight: 8
      },
      styles: { 
        fontSize: 8,
        cellPadding: 3,
        overflow: 'linebreak',
        cellWidth: 'wrap',
        valign: 'top',
        lineColor: [200, 200, 200],
        lineWidth: 0.1,
        minCellHeight: 10,
        halign: 'left'
      },
      columnStyles: {
        0: { cellWidth: 50, fontStyle: 'bold', minCellWidth: 50 },
        1: { cellWidth: 20, halign: 'center', valign: 'middle', minCellWidth: 20 },
        2: { cellWidth: 60, minCellWidth: 60 },
        3: { cellWidth: 65, minCellWidth: 65 },
        4: { cellWidth: 73, minCellWidth: 73 }
      },
      didParseCell: function(data) {
        // Color code the status column
        if (data.column.index === 1 && data.section === 'body') {
          const rowIndex = data.row.index;
          const status = categoryResults[rowIndex].status;
          const color = getStatusColor(status);
          data.cell.styles.fillColor = color;
          data.cell.styles.textColor = [255, 255, 255];
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fontSize = 9;
        }
      },
      margin: { left: 14, right: 14 },
      tableWidth: 'auto',
      pageBreak: 'auto',
      rowPageBreak: 'avoid',
      tableLineColor: [200, 200, 200],
      tableLineWidth: 0.1
    });
    
    // Update startY for next category
    startY = (doc as any).lastAutoTable.finalY + 12;
    
    // Add new page if needed for next category
    if (startY > 180 && index < categories.length - 1) {
      doc.addPage();
      startY = 20;
    }
  });
  } // End of if (testResults.length > 0)
  
  // Add footer with page numbers
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(
      `Page ${i} of ${pageCount}`,
      148,
      205,
      { align: 'center' }
    );
    doc.text(
      'Generated by Automated QA Testing System',
      148,
      200,
      { align: 'center' }
    );
  }
  
  return doc;
};

export const downloadSTDReport = (reportData: QAReportData) => {
  const doc = generateSTDReport(reportData);
  const fileName = `STD_Report_${new Date().getTime()}.pdf`;
  doc.save(fileName);
};
