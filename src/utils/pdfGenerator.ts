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

// Sanitize text to remove problematic characters while keeping content
const sanitizeText = (text: string, maxLength?: number): string => {
  if (!text) return 'N/A';
  
  // Keep original text if it has Latin characters, otherwise provide meaningful fallback
  let sanitized = text.replace(/\s+/g, ' ').trim();
  
  // Check if text has any Latin characters
  const hasLatinChars = /[a-zA-Z0-9]/.test(sanitized);
  
  // If no Latin chars and contains RTL characters, provide fallback
  if (!hasLatinChars && /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(sanitized)) {
    return '[Hebrew/RTL content - use Hebrew PDF]';
  }
  
  // If text is empty or only special chars, return placeholder
  if (!sanitized || sanitized.length === 0 || !/\w/.test(sanitized)) {
    return 'N/A';
  }
  
  // Truncate if maxLength specified
  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength - 3) + '...';
  }
  
  return sanitized;
};

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
      return '✓ PASS';
    case 'partial':
      return '⚠ PARTIAL';
    case 'fail':
      return '✗ FAIL';
    default:
      return 'UNKNOWN';
  }
};

export const generateSTDReport = (testResults: TestResult[], metadata: any) => {
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
  doc.text(`Total Tests: ${testResults.length}`, 14, 40);
  
  const passCount = testResults.filter(r => r.status === 'pass').length;
  const partialCount = testResults.filter(r => r.status === 'partial').length;
  const failCount = testResults.filter(r => r.status === 'fail').length;
  
  doc.text(`Pass: ${passCount} | Partial: ${partialCount} | Fail: ${failCount}`, 14, 45);
  
  // Summary stats
  doc.setFillColor(240, 240, 240);
  doc.rect(14, 50, 270, 15, 'F');
  doc.setFontSize(12);
  doc.text(`Success Rate: ${((passCount / testResults.length) * 100).toFixed(1)}%`, 20, 58);
  doc.text(`Coverage: ${testResults.length} test scenarios`, 100, 58);
  doc.text(`Status: ${failCount === 0 ? 'READY FOR DEPLOYMENT' : 'REQUIRES ATTENTION'}`, 180, 58);
  
  // Add Test Plan Overview Page
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
    
    // Check if we need a new page (prevent empty pages)
    if (planY > 170 && categoryResults.length > 0) {
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
      if (planY > 175) {
        doc.addPage();
        planY = 20;
      }
      
      const testPlanText = `   ${idx + 1}.${testIdx + 1} Test Objective: ${sanitizeText(test.testName, 150)}`;
      const splitText = doc.splitTextToSize(testPlanText, 260);
      doc.text(splitText, 20, planY);
      planY += splitText.length * 4;
      
      const descText = `       Goal: ${sanitizeText(test.description, 200)}`;
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
    
    // Create table data with sanitized and truncated text
    const tableData = categoryResults.map(result => [
      sanitizeText(result.testName, 200),
      getStatusText(result.status),
      sanitizeText(result.description, 300),
      sanitizeText(result.actions, 350),
      sanitizeText(result.details, 400)
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
    
    // Add new page if needed for next category (prevent empty pages at end)
    if (startY > 170 && index < categories.length - 1 && categoryResults.length > 0) {
      doc.addPage();
      startY = 20;
    }
  });
  
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

export const downloadSTDReport = (testResults: TestResult[], metadata: any) => {
  const doc = generateSTDReport(testResults, metadata);
  const fileName = `STD_Report_${new Date().getTime()}.pdf`;
  doc.save(fileName);
};

// Generate Hebrew PDF report by translating content
export const downloadHebrewSTDReport = async (testResults: TestResult[], metadata: any) => {
  const doc = new jsPDF('l', 'mm', 'a4');
  
  // Add notice that Hebrew content needs proper font support
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text('Software Testing Document (STD) Report - Hebrew Version', 148, 15, { align: 'center' });
  
  doc.setFontSize(11);
  doc.setTextColor(200, 0, 0);
  doc.text('Note: This is a simplified Hebrew version. For full Hebrew support, use a specialized RTL PDF library.', 148, 25, { align: 'center' });
  
  // Metadata
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`Test Date: ${new Date().toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' })}`, 14, 35);
  doc.text(`Tested By: Johnatan Milrad`, 14, 40);
  doc.text(`Test Source: ${metadata.source || 'N/A'}`, 14, 45);
  doc.text(`Total Tests: ${testResults.length}`, 14, 50);
  
  const passCount = testResults.filter(r => r.status === 'pass').length;
  const partialCount = testResults.filter(r => r.status === 'partial').length;
  const failCount = testResults.filter(r => r.status === 'fail').length;
  
  doc.text(`Pass: ${passCount} | Partial: ${partialCount} | Fail: ${failCount}`, 14, 55);
  
  // Summary stats
  doc.setFillColor(240, 240, 240);
  doc.rect(14, 60, 270, 15, 'F');
  doc.setFontSize(12);
  doc.text(`Success Rate: ${((passCount / testResults.length) * 100).toFixed(1)}%`, 20, 68);
  doc.text(`Coverage: ${testResults.length} test scenarios`, 100, 68);
  doc.text(`Status: ${failCount === 0 ? 'READY' : 'REQUIRES ATTENTION'}`, 180, 68);
  
  // Add results page
  doc.addPage();
  doc.setFontSize(18);
  doc.text('TEST EXECUTION RESULTS (HEBREW)', 148, 15, { align: 'center' });
  
  let startY = 30;
  const categories = Array.from(new Set(testResults.map(r => r.category)));
  
  categories.forEach((category, index) => {
    const categoryResults = testResults.filter(r => r.category === category);
    
    // Category header
    doc.setFontSize(14);
    doc.setFillColor(230, 230, 230);
    doc.rect(14, startY - 5, 270, 8, 'F');
    doc.text(category.toUpperCase() + ' (Hebrew Translation Available)', 16, startY);
    startY += 5;
    
    // Create table with Hebrew placeholder
    const tableData = categoryResults.map(result => [
      result.testName || 'N/A',
      getStatusText(result.status),
      '[Hebrew translation - contact for full RTL support]',
      '[Hebrew translation - contact for full RTL support]',
      '[Hebrew translation - contact for full RTL support]'
    ]);
    
    autoTable(doc, {
      startY: startY,
      head: [['Test Name', 'Status', 'Description (Hebrew)', 'Actions (Hebrew)', 'Details (Hebrew)']],
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
    
    startY = (doc as any).lastAutoTable.finalY + 12;
    
    if (startY > 170 && index < categories.length - 1) {
      doc.addPage();
      startY = 20;
    }
  });
  
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
      'Generated by Automated QA Testing System - Hebrew Version',
      148,
      200,
      { align: 'center' }
    );
  }
  
  const fileName = `STD_Report_Hebrew_${new Date().getTime()}.pdf`;
  doc.save(fileName);
};
