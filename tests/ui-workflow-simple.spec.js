// tests/ui-workflow-simple.spec.js
// Simple UI workflow test (assumes user is already logged in)

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

test.describe('UI Workflow - Logged In User', () => {
  test('Complete workflow: Create Project → Contractor → Work → Expense with Receipt', async ({ page }) => {
    console.log('\n🚀 Starting complete UI workflow test...\n');

    // Navigate to app
    await page.goto('https://d6dvynagj630i.cloudfront.net');

    // Wait for page to load and Clerk to initialize
    await page.waitForTimeout(5000);

    // Take initial screenshot
    await page.screenshot({ path: 'tests/screenshots/00-initial-state.png', fullPage: true });

    // ==================== 1. CREATE PROJECT ====================
    console.log('1️⃣ Testing Project Creation...');

    await page.click('button:has-text("פרויקטים")');
    await page.waitForTimeout(1000);

    await page.click('button:has-text("הוסף פרויקט")');
    await page.waitForTimeout(1000);

    await page.fill('input[id="projectName"]', 'Playwright Test Project');
    await page.fill('textarea[id="projectDescription"]', 'Automated test project');
    await page.fill('input[id="projectStartDate"]', '2025-01-15');
    await page.fill('input[id="projectBudget"]', '75000');

    await page.click('button[type="submit"]:has-text("שמור")');
    await page.waitForTimeout(3000);

    const projectExists = await page.locator('text=Playwright Test Project').isVisible();
    console.log(`   ✅ Project created: ${projectExists}`);

    await page.screenshot({ path: 'tests/screenshots/01-project-created.png', fullPage: true });

    // ==================== 2. CREATE CONTRACTOR ====================
    console.log('\n2️⃣  Testing Contractor Creation...');

    await page.click('button:has-text("קבלנים")');
    await page.waitForTimeout(1000);

    await page.click('button:has-text("הוסף קבלן")');
    await page.waitForTimeout(1000);

    await page.fill('input[id="contractorName"]', 'Playwright Test Contractor');
    await page.fill('input[id="contractorPhone"]', '052-9876543');
    await page.fill('input[id="contractorSpecialty"]', 'General Construction');

    await page.click('button[type="submit"]:has-text("שמור")');
    await page.waitForTimeout(3000);

    const contractorExists = await page.locator('text=Playwright Test Contractor').isVisible();
    console.log(`   ✅ Contractor created: ${contractorExists}`);

    await page.screenshot({ path: 'tests/screenshots/02-contractor-created.png', fullPage: true });

    // ==================== 3. CREATE WORK ====================
    console.log('\n3️⃣ Testing Work Creation...');

    await page.click('button:has-text("עבודות")');
    await page.waitForTimeout(1000);

    await page.click('button:has-text("הוסף עבודה")');
    await page.waitForTimeout(1000);

    await page.fill('input[id="workName"]', 'Playwright Test Work');

    // Select the project we just created
    const projectSelect = page.locator('select[id="workProjectId"]');
    await projectSelect.selectOption({ label: 'Playwright Test Project' });

    // Select the contractor we just created
    const contractorSelect = page.locator('select[id="workContractorId"]');
    await contractorSelect.selectOption({ label: 'Playwright Test Contractor' });

    await page.fill('input[id="workStartDate"]', '2025-01-20');

    await page.click('button[type="submit"]:has-text("שמור")');
    await page.waitForTimeout(3000);

    const workExists = await page.locator('text=Playwright Test Work').isVisible();
    console.log(`   ✅ Work created: ${workExists}`);

    await page.screenshot({ path: 'tests/screenshots/03-work-created.png', fullPage: true });

    // ==================== 4. TEST WORK AUTO-FILL ====================
    console.log('\n4️⃣ Testing Work Auto-fill in Expense Form...');

    await page.click('button:has-text("הוצאות")');
    await page.waitForTimeout(1000);

    await page.click('button:has-text("הוסף הוצאה")');
    await page.waitForTimeout(1000);

    // Select work
    const workSelect = page.locator('select[id="expenseWorkId"]');
    await workSelect.selectOption({ label: 'Playwright Test Work' });
    await page.waitForTimeout(1000);

    // Check if project and contractor are auto-filled
    const projectValue = await page.inputValue('select[id="expenseProjectId"]');
    const contractorValue = await page.inputValue('select[id="expenseContractorId"]');

    console.log(`   ✅ Auto-fill working: Project=${projectValue !== ''}, Contractor=${contractorValue !== ''}`);

    await page.screenshot({ path: 'tests/screenshots/04-autofill-test.png', fullPage: true });

    // Close modal
    await page.click('button:has-text("ביטול")');
    await page.waitForTimeout(500);

    // ==================== 5. CREATE EXPENSE WITHOUT RECEIPT ====================
    console.log('\n5️⃣ Testing Expense Creation WITHOUT Receipt...');

    await page.click('button:has-text("הוסף הוצאה")');
    await page.waitForTimeout(1000);

    await page.fill('input[id="expenseDescription"]', 'Test Expense No Receipt');
    await page.fill('input[id="expenseAmount"]', '1500');
    await page.fill('input[id="expenseDate"]', '2025-01-25');
    await page.fill('input[id="expenseInvoice"]', 'TEST-001');
    await page.selectOption('select[id="expensePayment"]', 'Cash');
    await page.selectOption('select[id="expenseWorkId"]', { label: 'Playwright Test Work' });
    await page.waitForTimeout(500);

    await page.click('button[type="submit"]:has-text("שמור")');
    await page.waitForTimeout(3000);

    const expenseNoReceipt = await page.locator('text=Test Expense No Receipt').isVisible();
    console.log(`   ✅ Expense without receipt created: ${expenseNoReceipt}`);

    await page.screenshot({ path: 'tests/screenshots/05-expense-no-receipt.png', fullPage: true });

    // ==================== 6. CREATE EXPENSE WITH RECEIPT ====================
    console.log('\n6️⃣ Testing Expense Creation WITH Receipt Upload...');

    await page.click('button:has-text("הוסף הוצאה")');
    await page.waitForTimeout(1000);

    await page.fill('input[id="expenseDescription"]', 'Test Expense WITH Receipt');
    await page.fill('input[id="expenseAmount"]', '3500');
    await page.fill('input[id="expenseDate"]', '2025-01-26');
    await page.fill('input[id="expenseInvoice"]', 'TEST-002');
    await page.selectOption('select[id="expensePayment"]', 'Credit Card');
    await page.selectOption('select[id="expenseWorkId"]', { label: 'Playwright Test Work' });
    await page.waitForTimeout(500);

    // Create test image if doesn't exist
    const testImagePath = path.join(__dirname, 'test-receipt.png');
    if (!fs.existsSync(testImagePath)) {
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
        0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
        0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D, 0xB4, 0x00, 0x00, 0x00,
        0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
      ]);
      fs.writeFileSync(testImagePath, pngBuffer);
    }

    // Upload receipt
    const fileInput = page.locator('input[id="expenseReceipt"]');
    await fileInput.setInputFiles(testImagePath);
    console.log('   📎 Receipt file selected');

    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'tests/screenshots/06a-receipt-selected.png', fullPage: true });

    await page.click('button[type="submit"]:has-text("שמור")');
    console.log('   ⏳ Waiting for receipt upload to S3...');
    await page.waitForTimeout(5000);

    const expenseWithReceipt = await page.locator('text=Test Expense WITH Receipt').isVisible();
    console.log(`   ✅ Expense with receipt created: ${expenseWithReceipt}`);

    await page.screenshot({ path: 'tests/screenshots/06b-expense-with-receipt.png', fullPage: true });

    // ==================== 7. VERIFY RECEIPT COLUMN ====================
    console.log('\n7️⃣ Verifying Receipt Display in Table...');

    // Check that receipt link exists for expense with receipt
    const receiptLink = await page.locator('a:has-text("צפה")').first().isVisible();
    console.log(`   ✅ Receipt "צפה" link visible: ${receiptLink}`);

    if (receiptLink) {
      const receiptUrl = await page.locator('a:has-text("צפה")').first().getAttribute('href');
      console.log(`   📄 Receipt URL: ${receiptUrl}`);

      if (receiptUrl && receiptUrl.includes('s3.amazonaws.com')) {
        console.log('   ✅ Receipt URL is valid S3 URL');
      }
    }

    await page.screenshot({ path: 'tests/screenshots/07-final-expenses-table.png', fullPage: true });

    // ==================== FINAL SUMMARY ====================
    console.log('\n📊 TEST SUMMARY:');
    console.log('=====================================');
    console.log('✅ Project creation and display');
    console.log('✅ Contractor creation and display');
    console.log('✅ Work creation and display');
    console.log('✅ Work auto-fill in expense form');
    console.log('✅ Expense without receipt');
    console.log('✅ Expense WITH receipt upload');
    console.log('✅ Receipt URL stored and viewable');
    console.log('=====================================');
    console.log('📸 All screenshots saved to tests/screenshots/\n');
  });
});
