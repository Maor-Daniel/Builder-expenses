import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Font
} from '@react-pdf/renderer';

// Register Hebrew font (Rubik) with proper embedding
Font.register({
  family: 'Rubik',
  fonts: [
    {
      src: '/fonts/Rubik-Regular.ttf',
      fontWeight: 400
    },
    {
      src: '/fonts/Rubik-Bold.ttf',
      fontWeight: 700
    }
  ]
});

// Create styles with RTL support and Hebrew fonts
const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontFamily: 'Rubik',
    fontSize: 10,
    direction: 'rtl'
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    textAlign: 'center',
    marginBottom: 20,
    color: '#2c3e50'
  },
  subtitle: {
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 15,
    color: '#7f8c8d',
    fontStyle: 'italic'
  },
  summaryBox: {
    marginBottom: 20,
    padding: 10,
    backgroundColor: '#f8f9fa',
    borderRadius: 5
  },
  summaryRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginBottom: 5,
    fontSize: 11
  },
  summaryLabel: {
    fontWeight: 700
  },
  summaryValue: {
    textAlign: 'left'
  },
  projectHeader: {
    backgroundColor: '#2c3e50',
    color: 'white',
    padding: 10,
    borderRadius: 5,
    marginTop: 20,
    marginBottom: 5
  },
  projectTitle: {
    fontSize: 14,
    fontWeight: 700
  },
  projectSummary: {
    flexDirection: 'row-reverse',
    justifyContent: 'flex-start',
    marginBottom: 10,
    paddingRight: 10,
    fontSize: 10
  },
  contractorHeader: {
    backgroundColor: '#7f8c8d',
    color: 'white',
    padding: 8,
    borderRadius: 4,
    marginRight: 15,
    marginTop: 10,
    marginBottom: 5
  },
  contractorTitle: {
    fontSize: 12,
    fontWeight: 700
  },
  contractorSummary: {
    flexDirection: 'row-reverse',
    justifyContent: 'flex-start',
    marginBottom: 5,
    paddingRight: 10,
    fontSize: 9
  },
  table: {
    marginRight: 25,
    marginBottom: 10
  },
  tableHeader: {
    flexDirection: 'row-reverse',
    backgroundColor: '#95a5a6',
    color: 'white',
    padding: 6,
    fontSize: 8,
    fontWeight: 700
  },
  tableRow: {
    flexDirection: 'row-reverse',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    padding: 6,
    fontSize: 8,
    minHeight: 55 // Accommodate thumbnail height
  },
  tableRowEven: {
    backgroundColor: '#f8f9fa'
  },
  tableRowOdd: {
    backgroundColor: '#ffffff'
  },
  // Column widths with receipt thumbnail
  colReceipt: {
    width: '12%',
    textAlign: 'center',
    justifyContent: 'center',
    alignItems: 'center'
  },
  colInvoice: {
    width: '13%',
    textAlign: 'center',
    justifyContent: 'center'
  },
  colAmount: {
    width: '13%',
    textAlign: 'center',
    justifyContent: 'center'
  },
  colDescription: {
    width: '42%',
    textAlign: 'right',
    justifyContent: 'center',
    paddingRight: 5
  },
  colDate: {
    width: '20%',
    textAlign: 'center',
    justifyContent: 'center'
  },
  bold: {
    fontWeight: 700
  },
  // Receipt thumbnail styles
  receiptThumbnail: {
    width: 40,
    height: 50,
    objectFit: 'cover',
    borderRadius: 3,
    border: '1px solid #ddd'
  },
  receiptPlaceholder: {
    width: 40,
    height: 50,
    borderRadius: 3,
    border: '1px dashed #ccc',
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center'
  },
  receiptPlaceholderText: {
    fontSize: 18,
    color: '#999'
  },
  receiptPlaceholderSubtext: {
    fontSize: 6,
    color: '#999',
    marginTop: 2
  },
  receiptErrorPlaceholder: {
    width: 40,
    height: 50,
    borderRadius: 3,
    border: '1px solid #e74c3c',
    backgroundColor: '#ffe6e6',
    justifyContent: 'center',
    alignItems: 'center'
  },
  receiptErrorText: {
    fontSize: 16,
    color: '#e74c3c'
  }
});

/**
 * Receipt Thumbnail Component
 * Shows receipt image, placeholder, or error state
 */
const ReceiptThumbnail = ({ expense }) => {
  // Case 1: Has receipt image data (downloaded successfully)
  if (expense.receiptImageData) {
    return (
      <Image
        src={expense.receiptImageData}
        style={styles.receiptThumbnail}
      />
    );
  }

  // Case 2: Download error
  if (expense.receiptError) {
    return (
      <View style={styles.receiptErrorPlaceholder}>
        <Text style={styles.receiptErrorText}>❌</Text>
        <Text style={styles.receiptPlaceholderSubtext}>Failed</Text>
      </View>
    );
  }

  // Case 3: No receipt attached
  return (
    <View style={styles.receiptPlaceholder}>
      <Text style={styles.receiptPlaceholderText}>📄</Text>
      <Text style={styles.receiptPlaceholderSubtext}>אין</Text>
    </View>
  );
};

/**
 * ExpenseReportPDF_Compact Component
 *
 * Generates a compact PDF report with receipt thumbnails
 * Perfect for monthly reports and email sharing
 *
 * @param {Object} props
 * @param {Array} props.expenses - Expenses array with receiptImageData
 * @param {Array} props.projects - Projects array (for names)
 * @param {Array} props.contractors - Contractors array (for names)
 * @param {Object} props.filters - Applied filters (for report header)
 */
const ExpenseReportPDF_Compact = ({ expenses, projects, contractors, filters }) => {
  // Group expenses by project -> contractor
  const groupedData = {};

  expenses.forEach(expense => {
    const projectKey = expense.projectId || 'no-project';
    const projectName = expense.projectName || projects?.find(p => p.projectId === expense.projectId)?.name || 'ללא פרויקט';
    const contractorKey = expense.contractorId || 'no-contractor';
    const contractorName = expense.contractorName || contractors?.find(c => c.contractorId === expense.contractorId)?.name || 'ללא קבלן';

    if (!groupedData[projectKey]) {
      groupedData[projectKey] = {
        name: projectName,
        contractors: {}
      };
    }

    if (!groupedData[projectKey].contractors[contractorKey]) {
      groupedData[projectKey].contractors[contractorKey] = {
        name: contractorName,
        expenses: []
      };
    }

    groupedData[projectKey].contractors[contractorKey].expenses.push(expense);
  });

  // Calculate totals
  const totalAmount = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const reportDate = new Date().toLocaleString('he-IL');
  const withReceiptCount = expenses.filter(e => e.receiptImageData).length;
  const errorReceiptCount = expenses.filter(e => e.receiptError).length;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Title */}
        <Text style={styles.title}>דוח הוצאות מהיר - עם קבלות מצורפות</Text>
        <Text style={styles.subtitle}>כל הקבלות מוטמעות בדוח ויישארו תקפות לעד</Text>

        {/* Summary Box */}
        <View style={styles.summaryBox}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>תאריך דוח:</Text>
            <Text style={styles.summaryValue}>{reportDate}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>סה״כ הוצאות:</Text>
            <Text style={styles.summaryValue}>{expenses.length}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>סכום כולל:</Text>
            <Text style={styles.summaryValue}>₪{totalAmount.toLocaleString('he-IL')}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>קבלות מוטמעות:</Text>
            <Text style={styles.summaryValue}>
              {withReceiptCount} מתוך {expenses.length}
              {errorReceiptCount > 0 && ` (${errorReceiptCount} שגיאות)`}
            </Text>
          </View>
          {filters && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>פילטרים:</Text>
              <Text style={styles.summaryValue}>
                {filters.projectName && `פרויקט: ${filters.projectName} | `}
                {filters.contractorName && `קבלן: ${filters.contractorName} | `}
                {filters.dateRange && `תקופה: ${filters.dateRange}`}
              </Text>
            </View>
          )}
        </View>

        {/* Projects and Contractors */}
        {Object.keys(groupedData).sort().map((projectKey) => {
          const projectData = groupedData[projectKey];
          const projectExpenses = Object.values(projectData.contractors)
            .flatMap(c => c.expenses);
          const projectTotal = projectExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

          return (
            <View key={projectKey} wrap={false} break={projectKey !== Object.keys(groupedData)[0]}>
              {/* Project Header */}
              <View style={styles.projectHeader}>
                <Text style={styles.projectTitle}>פרויקט: {projectData.name}</Text>
              </View>
              <View style={styles.projectSummary}>
                <Text style={styles.bold}>סה״כ הוצאות: </Text>
                <Text>{projectExpenses.length} | </Text>
                <Text style={styles.bold}>סכום: </Text>
                <Text>₪{projectTotal.toLocaleString('he-IL')}</Text>
              </View>

              {/* Contractors */}
              {Object.keys(projectData.contractors).sort().map((contractorKey) => {
                const contractorData = projectData.contractors[contractorKey];
                const contractorExpenses = contractorData.expenses;
                const contractorTotal = contractorExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

                return (
                  <View key={contractorKey} wrap={false}>
                    {/* Contractor Header */}
                    <View style={styles.contractorHeader}>
                      <Text style={styles.contractorTitle}>קבלן: {contractorData.name}</Text>
                    </View>
                    <View style={styles.contractorSummary}>
                      <Text style={styles.bold}>סה״כ הוצאות: </Text>
                      <Text>{contractorExpenses.length} | </Text>
                      <Text style={styles.bold}>סכום: </Text>
                      <Text>₪{contractorTotal.toLocaleString('he-IL')}</Text>
                    </View>

                    {/* Expenses Table with Receipt Thumbnails */}
                    <View style={styles.table}>
                      {/* Table Header */}
                      <View style={styles.tableHeader}>
                        <Text style={styles.colReceipt}>קבלה</Text>
                        <Text style={styles.colInvoice}>מס׳ חשבונית</Text>
                        <Text style={styles.colAmount}>סכום</Text>
                        <Text style={styles.colDescription}>תיאור</Text>
                        <Text style={styles.colDate}>תאריך</Text>
                      </View>

                      {/* Table Rows */}
                      {contractorExpenses.map((expense, idx) => (
                        <View
                          key={expense.expenseId || idx}
                          style={[
                            styles.tableRow,
                            idx % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd
                          ]}
                        >
                          {/* Receipt Thumbnail */}
                          <View style={styles.colReceipt}>
                            <ReceiptThumbnail expense={expense} />
                          </View>

                          {/* Invoice Number */}
                          <Text style={styles.colInvoice}>
                            {expense.invoiceNum ? `#${expense.invoiceNum}` : 'אין'}
                          </Text>

                          {/* Amount */}
                          <Text style={styles.colAmount}>
                            ₪{Number(expense.amount || 0).toLocaleString('he-IL')}
                          </Text>

                          {/* Description */}
                          <Text style={styles.colDescription}>
                            {expense.description || '-'}
                          </Text>

                          {/* Date */}
                          <Text style={styles.colDate}>
                            {new Date(expense.date).toLocaleDateString('he-IL')}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}

        {/* Page Numbers */}
        <Text
          style={{
            position: 'absolute',
            bottom: 20,
            left: 30,
            fontSize: 8,
            color: '#666'
          }}
          render={({ pageNumber, totalPages }) => `עמוד ${pageNumber} מתוך ${totalPages}`}
          fixed
        />

        {/* Watermark */}
        <Text
          style={{
            position: 'absolute',
            bottom: 20,
            right: 30,
            fontSize: 7,
            color: '#999'
          }}
          fixed
        >
          🔒 קבלות מוטמעות - תקף לצמיתות
        </Text>
      </Page>
    </Document>
  );
};

export default ExpenseReportPDF_Compact;
