import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
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
  workHeader: {
    marginRight: 25,
    marginTop: 10,
    marginBottom: 5
  },
  workTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: '#34495e',
    marginBottom: 3
  },
  workSummary: {
    fontSize: 9,
    marginBottom: 10
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
    fontSize: 8
  },
  tableRowEven: {
    backgroundColor: '#f8f9fa'
  },
  tableRowOdd: {
    backgroundColor: '#ffffff'
  },
  col1: {
    width: '15%',
    textAlign: 'center'
  },
  col2: {
    width: '15%',
    textAlign: 'center'
  },
  col3: {
    width: '50%',
    textAlign: 'right'
  },
  col4: {
    width: '20%',
    textAlign: 'center'
  },
  bold: {
    fontWeight: 700
  }
});

/**
 * ExpenseReportPDF Component
 *
 * Generates a professional PDF report with Hebrew text and RTL support
 * Groups expenses by: Project → Contractor → Work
 *
 * @param {Object} props
 * @param {Array} props.expenses - Filtered expenses array
 * @param {Array} props.projects - Projects array (for names)
 * @param {Array} props.contractors - Contractors array (for names)
 * @param {Array} props.works - Works array (for names)
 * @param {Object} props.filters - Applied filters (for report header)
 */
const ExpenseReportPDF = ({ expenses, projects, contractors, works, filters }) => {
  // Group expenses by project -> contractor (no work grouping since expenses don't have workId)
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

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Title */}
        <Text style={styles.title}>דוח הוצאות - מערכת מעקב הוצאות בניה</Text>

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

                    {/* Expenses Table */}
                    <View style={styles.table}>
                      {/* Table Header */}
                      <View style={styles.tableHeader}>
                        <Text style={styles.col1}>מס׳ חשבונית</Text>
                        <Text style={styles.col2}>סכום</Text>
                        <Text style={styles.col3}>תיאור</Text>
                        <Text style={styles.col4}>תאריך</Text>
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
                          <Text style={styles.col1}>
                            {expense.invoiceNum ? `#${expense.invoiceNum}` : 'אין'}
                          </Text>
                          <Text style={styles.col2}>
                            ₪{Number(expense.amount || 0).toLocaleString('he-IL')}
                          </Text>
                          <Text style={styles.col3}>
                            {expense.description || '-'}
                          </Text>
                          <Text style={styles.col4}>
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
      </Page>
    </Document>
  );
};

export default ExpenseReportPDF;
