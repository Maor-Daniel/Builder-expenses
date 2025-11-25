// tests/test-tab-navigation.spec.js
// Test tab navigation and jumping issue

const { test, expect } = require('@playwright/test');

test.describe('Tab Navigation Bug Investigation', () => {
  test('Investigate tab jumping issue when creating entities from different tabs', async ({ page }) => {
    console.log('\n🔍 Starting tab navigation bug investigation...\n');

    // Navigate to app
    await page.goto('https://d6dvynagj630i.cloudfront.net');

    // Wait for page to load and Clerk to initialize
    await page.waitForTimeout(5000);

    // Check if we're on login page or already logged in
    const isLoggedIn = await page.locator('button:has-text("הוצאות")').isVisible().catch(() => false);

    if (!isLoggedIn) {
      console.log('⚠️  Not logged in - please log in first');
      console.log('   Waiting for manual login...');

      // Wait for expenses tab to appear (means login completed)
      await page.waitForSelector('button:has-text("הוצאות")', { timeout: 120000 });
      await page.waitForTimeout(3000);
    }

    console.log('✅ Page loaded and Clerk initialized');

    // Take initial screenshot
    await page.screenshot({ path: 'tests/screenshots/tab-nav-00-initial.png', fullPage: true });

    // ==================== TEST 1: Navigate to Reports Tab ====================
    console.log('\n📊 TEST 1: Navigate to Reports Tab');
    await page.click('button:has-text("דוחות")');
    await page.waitForTimeout(2000);

    // Check which tab is active
    const activeTab1 = await page.evaluate(() => {
      const activeBtn = document.querySelector('.tab-button.active');
      return activeBtn ? activeBtn.textContent.trim() : 'NONE';
    });
    console.log(`   Current active tab: ${activeTab1}`);
    console.log(`   Expected: דוחות, Actual: ${activeTab1}`);

    await page.screenshot({ path: 'tests/screenshots/tab-nav-01-reports.png', fullPage: true });

    // ==================== TEST 2: Create Project from Reports Tab ====================
    console.log('\n📁 TEST 2: Create Project from Reports Tab');

    await page.click('button:has-text("הוסף פרויקט")');
    await page.waitForTimeout(1000);

    await page.fill('input[id="projectName"]', 'Tab Nav Test Project');
    await page.fill('input[id="projectBudget"]', '50000');
    await page.fill('input[id="projectStartDate"]', '2025-01-15');

    await page.click('button[type="submit"]:has-text("שמור")');
    await page.waitForTimeout(3000);

    // Check which tab we're on after submission
    const activeTab2 = await page.evaluate(() => {
      const activeBtn = document.querySelector('.tab-button.active');
      return activeBtn ? activeBtn.textContent.trim() : 'NONE';
    });
    console.log(`   After creating project:`);
    console.log(`   Expected: דוחות (should stay on reports), Actual: ${activeTab2}`);
    console.log(`   BUG?: ${activeTab2 !== 'דוחות' ? 'YES - Tab jumped!' : 'NO - Stayed on reports'}`);

    await page.screenshot({ path: 'tests/screenshots/tab-nav-02-after-project.png', fullPage: true });

    // ==================== TEST 3: Navigate to Works Tab ====================
    console.log('\n🔨 TEST 3: Navigate to Works Tab');
    await page.click('button:has-text("עבודות")');
    await page.waitForTimeout(2000);

    const activeTab3 = await page.evaluate(() => {
      const activeBtn = document.querySelector('.tab-button.active');
      return activeBtn ? activeBtn.textContent.trim() : 'NONE';
    });
    console.log(`   Current active tab: ${activeTab3}`);
    console.log(`   Expected: עבודות, Actual: ${activeTab3}`);

    await page.screenshot({ path: 'tests/screenshots/tab-nav-03-works.png', fullPage: true });

    // ==================== TEST 4: Create Contractor from Works Tab ====================
    console.log('\n👷 TEST 4: Create Contractor from Works Tab');

    await page.click('button:has-text("הוסף קבלן")');
    await page.waitForTimeout(1000);

    await page.fill('input[id="contractorName"]', 'Tab Nav Test Contractor');
    await page.fill('input[id="contractorPhone"]', '050-1234567');
    await page.fill('input[id="contractorSpecialty"]', 'Testing');

    await page.click('button[type="submit"]:has-text("שמור")');
    await page.waitForTimeout(3000);

    // Check which tab we're on after submission
    const activeTab4 = await page.evaluate(() => {
      const activeBtn = document.querySelector('.tab-button.active');
      return activeBtn ? activeBtn.textContent.trim() : 'NONE';
    });
    console.log(`   After creating contractor:`);
    console.log(`   Expected: קבלנים (goes to contractors), Actual: ${activeTab4}`);
    console.log(`   BUG?: ${activeTab4 !== 'קבלנים' ? 'YES - Unexpected tab!' : 'NO - Correct'}`);

    await page.screenshot({ path: 'tests/screenshots/tab-nav-04-after-contractor.png', fullPage: true });

    // ==================== TEST 5: Go back to Works and create a Work ====================
    console.log('\n🔨 TEST 5: Create Work from Works Tab');
    await page.click('button:has-text("עבודות")');
    await page.waitForTimeout(2000);

    await page.click('button:has-text("הוסף עבודה")');
    await page.waitForTimeout(1000);

    await page.fill('input[id="workName"]', 'Tab Nav Test Work');
    await page.selectOption('select[id="workProjectId"]', { label: 'Tab Nav Test Project' });
    await page.selectOption('select[id="workContractorId"]', { label: 'Tab Nav Test Contractor' });
    await page.fill('input[id="workStartDate"]', '2025-01-20');

    await page.click('button[type="submit"]:has-text("שמור")');
    await page.waitForTimeout(3000);

    // Check which tab we're on after submission
    const activeTab5 = await page.evaluate(() => {
      const activeBtn = document.querySelector('.tab-button.active');
      return activeBtn ? activeBtn.textContent.trim() : 'NONE';
    });
    console.log(`   After creating work:`);
    console.log(`   Expected: עבודות (stays on works), Actual: ${activeTab5}`);
    console.log(`   BUG?: ${activeTab5 !== 'עבודות' ? 'YES - Tab jumped!' : 'NO - Stayed on works'}`);

    await page.screenshot({ path: 'tests/screenshots/tab-nav-05-after-work.png', fullPage: true });

    // ==================== TEST 6: Check currentTab variable ====================
    console.log('\n🔍 TEST 6: Check JavaScript currentTab variable');
    const currentTabVar = await page.evaluate(() => {
      return window.currentTab || 'UNDEFINED';
    });
    console.log(`   window.currentTab value: ${currentTabVar}`);

    // ==================== SUMMARY ====================
    console.log('\n📊 TAB NAVIGATION TEST SUMMARY:');
    console.log('=====================================');
    console.log(`1. Initial page load → Active: ${activeTab1}`);
    console.log(`2. After creating project from Reports → Active: ${activeTab2} ${activeTab2 !== 'דוחות' ? '❌' : '✅'}`);
    console.log(`3. Navigate to Works → Active: ${activeTab3} ${activeTab3 !== 'עבודות' ? '❌' : '✅'}`);
    console.log(`4. After creating contractor from Works → Active: ${activeTab4} ${activeTab4 !== 'קבלנים' ? '⚠️' : '✅'}`);
    console.log(`5. After creating work from Works → Active: ${activeTab5} ${activeTab5 !== 'עבודות' ? '❌' : '✅'}`);
    console.log(`6. JavaScript currentTab variable: ${currentTabVar}`);
    console.log('=====================================');
  });
});
