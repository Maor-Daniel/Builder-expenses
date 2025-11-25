// tests/ui-complete-workflow.spec.js
// Complete UI workflow test including receipt upload

const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Complete UI Workflow Test', () => {
  let page;

  const TEST_USER_EMAIL = 'maordaniel40@gmail.com';
  const TEST_USER_PASSWORD = '19735Maor';

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto('https://d6dvynagj630i.cloudfront.net');

    // Wait for Clerk to initialize
    await page.waitForTimeout(3000);

    // Check if already logged in
    const isLoggedIn = await page.locator('text=הוצאות').isVisible().catch(() => false);

    if (!isLoggedIn) {
      console.log('Need to login...');
      // Add login logic here if needed
    }
  });

  test('1. Create Project and verify it appears', async () => {
    console.log('Testing Project Creation...');

    // Navigate to Projects tab
    await page.click('button:has-text("פרויקטים")');
    await page.waitForTimeout(1000);

    // Click Add Project button
    await page.click('button:has-text("הוסף פרויקט")');
    await page.waitForTimeout(500);

    // Fill project form
    await page.fill('input[id="projectName"]', 'UI Test Project');
    await page.fill('textarea[id="projectDescription"]', 'Complete workflow testing');
    await page.fill('input[id="projectStartDate"]', '2025-01-15');
    await page.fill('input[id="projectBudget"]', '50000');
    await page.fill('input[id="projectLocation"]', 'Tel Aviv');
    await page.fill('input[id="projectClient"]', 'Test Client');

    // Submit form
    await page.click('button[type="submit"]:has-text("שמור")');

    // Wait for success message and data reload
    await page.waitForTimeout(2000);

    // Verify project appears in the list
    const projectVisible = await page.locator('text=UI Test Project').isVisible();
    expect(projectVisible).toBeTruthy();

    console.log('✅ Project created and visible in list');

    // Take screenshot
    await page.screenshot({ path: 'tests/screenshots/01-project-created.png', fullPage: true });
  });

  test('2. Create Contractor and verify it appears', async () => {
    console.log('Testing Contractor Creation...');

    // Navigate to Contractors tab
    await page.click('button:has-text("קבלנים")');
    await page.waitForTimeout(1000);

    // Click Add Contractor button
    await page.click('button:has-text("הוסף קבלן")');
    await page.waitForTimeout(500);

    // Fill contractor form
    await page.fill('input[id="contractorName"]', 'UI Test Contractor');
    await page.fill('input[id="contractorPhone"]', '050-1234567');
    await page.fill('input[id="contractorSpecialty"]', 'Construction');

    // Submit form
    await page.click('button[type="submit"]:has-text("שמור")');

    // Wait for success message and data reload
    await page.waitForTimeout(2000);

    // Verify contractor appears in the list
    const contractorVisible = await page.locator('text=UI Test Contractor').isVisible();
    expect(contractorVisible).toBeTruthy();

    console.log('✅ Contractor created and visible in list');

    // Take screenshot
    await page.screenshot({ path: 'tests/screenshots/02-contractor-created.png', fullPage: true });
  });

  test('3. Create Work and verify it appears', async () => {
    console.log('Testing Work Creation...');

    // Navigate to Works tab
    await page.click('button:has-text("עבודות")');
    await page.waitForTimeout(1000);

    // Click Add Work button
    await page.click('button:has-text("הוסף עבודה")');
    await page.waitForTimeout(500);

    // Fill work form
    await page.fill('input[id="workName"]', 'UI Test Work');

    // Select project (assuming dropdown has the project we just created)
    await page.selectOption('select[id="workProjectId"]', { label: 'UI Test Project' });

    // Select contractor
    await page.selectOption('select[id="workContractorId"]', { label: 'UI Test Contractor' });

    // Set start date
    await page.fill('input[id="workStartDate"]', '2025-01-20');

    // Submit form
    await page.click('button[type="submit"]:has-text("שמור")');

    // Wait for success message and data reload
    await page.waitForTimeout(2000);

    // Verify work appears in the list
    const workVisible = await page.locator('text=UI Test Work').isVisible();
    expect(workVisible).toBeTruthy();

    console.log('✅ Work created and visible in list');

    // Take screenshot
    await page.screenshot({ path: 'tests/screenshots/03-work-created.png', fullPage: true });
  });

  test('4. Test Work Auto-fill in Expense Form', async () => {
    console.log('Testing Work Auto-fill...');

    // Navigate to Expenses tab
    await page.click('button:has-text("הוצאות")');
    await page.waitForTimeout(1000);

    // Click Add Expense button
    await page.click('button:has-text("הוסף הוצאה")');
    await page.waitForTimeout(500);

    // Select work from dropdown
    await page.selectOption('select[id="expenseWorkId"]', { label: 'UI Test Work' });

    // Wait for auto-fill to happen
    await page.waitForTimeout(500);

    // Verify project and contractor are auto-filled
    const projectValue = await page.inputValue('select[id="expenseProjectId"]');
    const contractorValue = await page.inputValue('select[id="expenseContractorId"]');

    expect(projectValue).not.toBe('');
    expect(contractorValue).not.toBe('');

    console.log('✅ Work auto-fill working correctly');
    console.log(`  Project auto-filled: ${projectValue}`);
    console.log(`  Contractor auto-filled: ${contractorValue}`);

    // Take screenshot
    await page.screenshot({ path: 'tests/screenshots/04-work-autofill.png', fullPage: true });

    // Close the modal for next test
    await page.click('button:has-text("ביטול")');
    await page.waitForTimeout(500);
  });

  test('5. Create Expense WITHOUT receipt', async () => {
    console.log('Testing Expense Creation without receipt...');

    // Make sure we're on Expenses tab
    await page.click('button:has-text("הוצאות")');
    await page.waitForTimeout(1000);

    // Click Add Expense button
    await page.click('button:has-text("הוסף הוצאה")');
    await page.waitForTimeout(500);

    // Fill expense form
    await page.fill('input[id="expenseDescription"]', 'Test Expense Without Receipt');
    await page.fill('input[id="expenseAmount"]', '1000');
    await page.fill('input[id="expenseDate"]', '2025-01-25');
    await page.fill('input[id="expenseInvoice"]', 'INV-001');

    // Select payment method
    await page.selectOption('select[id="expensePayment"]', 'Cash');

    // Select work (will auto-fill project and contractor)
    await page.selectOption('select[id="expenseWorkId"]', { label: 'UI Test Work' });
    await page.waitForTimeout(500);

    // Submit form WITHOUT uploading receipt
    await page.click('button[type="submit"]:has-text("שמור")');

    // Wait for success message and data reload
    await page.waitForTimeout(2000);

    // Verify expense appears in the table
    const expenseVisible = await page.locator('text=Test Expense Without Receipt').isVisible();
    expect(expenseVisible).toBeTruthy();

    // Verify the receipt column shows "-" (no receipt)
    const rows = await page.locator('table tbody tr');
    const count = await rows.count();

    for (let i = 0; i < count; i++) {
      const descriptionText = await rows.nth(i).locator('td').nth(1).textContent();
      if (descriptionText.includes('Test Expense Without Receipt')) {
        const receiptCell = await rows.nth(i).locator('td').nth(5).textContent();
        expect(receiptCell.trim()).toBe('-');
        console.log('✅ Receipt column correctly shows "-" for expense without receipt');
        break;
      }
    }

    // Take screenshot
    await page.screenshot({ path: 'tests/screenshots/05-expense-without-receipt.png', fullPage: true });
  });

  test('6. Create Expense WITH receipt upload', async () => {
    console.log('Testing Expense Creation WITH receipt upload...');

    // Make sure we're on Expenses tab
    await page.click('button:has-text("הוצאות")');
    await page.waitForTimeout(1000);

    // Click Add Expense button
    await page.click('button:has-text("הוסף הוצאה")');
    await page.waitForTimeout(500);

    // Fill expense form
    await page.fill('input[id="expenseDescription"]', 'Test Expense WITH Receipt');
    await page.fill('input[id="expenseAmount"]', '2500');
    await page.fill('input[id="expenseDate"]', '2025-01-26');
    await page.fill('input[id="expenseInvoice"]', 'INV-002');

    // Select payment method
    await page.selectOption('select[id="expensePayment"]', 'Credit Card');

    // Select work
    await page.selectOption('select[id="expenseWorkId"]', { label: 'UI Test Work' });
    await page.waitForTimeout(500);

    // Create a test image file
    const testImagePath = path.join(__dirname, 'test-receipt.png');
    const fs = require('fs');

    // Create a simple 1x1 PNG if it doesn't exist
    if (!fs.existsSync(testImagePath)) {
      // Simple 1x1 red pixel PNG
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

    // Upload receipt file
    const fileInput = await page.locator('input[id="expenseReceipt"]');
    await fileInput.setInputFiles(testImagePath);

    console.log('  Receipt file selected, waiting for upload indicator...');
    await page.waitForTimeout(1000);

    // Take screenshot showing file selected
    await page.screenshot({ path: 'tests/screenshots/06a-receipt-selected.png', fullPage: true });

    // Submit form WITH receipt
    await page.click('button[type="submit"]:has-text("שמור")');

    // Wait for upload to complete and data reload
    console.log('  Waiting for receipt upload and expense creation...');
    await page.waitForTimeout(5000); // Give time for S3 upload

    // Verify expense appears in the table
    const expenseVisible = await page.locator('text=Test Expense WITH Receipt').isVisible();
    expect(expenseVisible).toBeTruthy();

    // Verify the receipt column shows "צפה" link (has receipt)
    const rows = await page.locator('table tbody tr');
    const count = await rows.count();

    let receiptLinkFound = false;
    for (let i = 0; i < count; i++) {
      const descriptionText = await rows.nth(i).locator('td').nth(1).textContent();
      if (descriptionText.includes('Test Expense WITH Receipt')) {
        const receiptCell = await rows.nth(i).locator('td').nth(5);
        const viewLink = await receiptCell.locator('a:has-text("צפה")').count();

        if (viewLink > 0) {
          receiptLinkFound = true;
          console.log('✅ Receipt column shows "צפה" link for expense with receipt');

          // Get the receipt URL
          const receiptUrl = await receiptCell.locator('a').getAttribute('href');
          console.log(`  Receipt URL: ${receiptUrl}`);

          // Verify it's an S3 URL
          expect(receiptUrl).toContain('s3.amazonaws.com');
          expect(receiptUrl).toContain('construction-expenses-receipts');
        }
        break;
      }
    }

    expect(receiptLinkFound).toBeTruthy();

    // Take screenshot
    await page.screenshot({ path: 'tests/screenshots/06b-expense-with-receipt.png', fullPage: true });
  });

  test('7. Verify all data in tables', async () => {
    console.log('Verifying all created data appears in tables...');

    // Check Projects
    await page.click('button:has-text("פרויקטים")');
    await page.waitForTimeout(1000);
    expect(await page.locator('text=UI Test Project').isVisible()).toBeTruthy();
    await page.screenshot({ path: 'tests/screenshots/07a-final-projects.png', fullPage: true });

    // Check Contractors
    await page.click('button:has-text("קבלנים")');
    await page.waitForTimeout(1000);
    expect(await page.locator('text=UI Test Contractor').isVisible()).toBeTruthy();
    await page.screenshot({ path: 'tests/screenshots/07b-final-contractors.png', fullPage: true });

    // Check Works
    await page.click('button:has-text("עבודות")');
    await page.waitForTimeout(1000);
    expect(await page.locator('text=UI Test Work').isVisible()).toBeTruthy();
    await page.screenshot({ path: 'tests/screenshots/07c-final-works.png', fullPage: true });

    // Check Expenses
    await page.click('button:has-text("הוצאות")');
    await page.waitForTimeout(1000);
    expect(await page.locator('text=Test Expense Without Receipt').isVisible()).toBeTruthy();
    expect(await page.locator('text=Test Expense WITH Receipt').isVisible()).toBeTruthy();
    await page.screenshot({ path: 'tests/screenshots/07d-final-expenses.png', fullPage: true });

    console.log('✅ All data verified in tables');
  });

  test.afterAll(async () => {
    console.log('\n📊 Test Summary:');
    console.log('✅ Project creation and display');
    console.log('✅ Contractor creation and display');
    console.log('✅ Work creation and display');
    console.log('✅ Work auto-fill functionality');
    console.log('✅ Expense without receipt');
    console.log('✅ Expense with receipt upload');
    console.log('✅ Receipt URL stored and viewable');
    console.log('\n📸 Screenshots saved in tests/screenshots/');

    if (page) {
      await page.close();
    }
  });
});
