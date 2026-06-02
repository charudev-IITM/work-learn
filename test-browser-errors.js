const { chromium } = require('playwright');

async function testBrowserErrors() {
  console.log('🎭 Starting Playwright browser error detection...');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Capture console messages and errors
  const consoleMessages = [];
  const errors = [];
  
  page.on('console', (msg) => {
    const text = msg.text();
    consoleMessages.push({
      type: msg.type(),
      text: text,
      location: msg.location()
    });
    
    // Log errors and warnings to our error collection
    if (msg.type() === 'error' || msg.type() === 'warning') {
      errors.push({
        type: msg.type(),
        text: text,
        location: msg.location()
      });
    }
  });
  
  // Capture page errors
  page.on('pageerror', (error) => {
    errors.push({
      type: 'pageerror',
      text: error.message,
      stack: error.stack
    });
  });
  
  try {
    console.log('📄 Navigating to application...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    
    console.log('⏳ Waiting for page to fully load...');
    await page.waitForTimeout(3000);
    
    console.log('🔐 Testing authentication flow...');
    
    // Check if we see the login page
    const isAuthPage = await page.locator('text=Sign In').first().isVisible();
    
    if (isAuthPage) {
      console.log('🔑 Attempting to sign up...');
      
      // Click Sign Up
      await page.click('button:has-text("Sign Up")');
      await page.waitForTimeout(1000);
      
      // Fill out signup form
      await page.fill('input[placeholder*="Username"], input[name*="username"]', 'testuser');
      await page.fill('input[type="password"]:not([placeholder*="Confirm"])', 'testpass123');
      await page.fill('input[placeholder*="Confirm"], input[name*="confirmPassword"]', 'testpass123');
      await page.fill('input[placeholder*="Master"], input[name*="masterKey"]', 'super_secret_master_key_123!');
      
      // Submit form
      await page.click('button:has-text("Create Account")');
      
      console.log('⏳ Waiting for authentication to complete...');
      await page.waitForTimeout(5000);
    }
    
    console.log('🎯 Testing watchlist interactions...');
    
    // Try clicking on dropdown menus that were mentioned in the error
    const sortButton = page.locator('button:has-text("Sort")');
    if (await sortButton.isVisible()) {
      console.log('📋 Testing sort dropdown...');
      await sortButton.click();
      await page.waitForTimeout(1000);
      await page.press('Escape'); // Close dropdown
    }
    
    // Test view mode toggles
    const viewModeButtons = page.locator('[role="tablist"] button');
    const buttonCount = await viewModeButtons.count();
    for (let i = 0; i < buttonCount; i++) {
      if (await viewModeButtons.nth(i).isVisible()) {
        console.log(`🔄 Testing view mode button ${i + 1}...`);
        await viewModeButtons.nth(i).click();
        await page.waitForTimeout(1000);
      }
    }
    
    console.log('✅ Browser testing completed!');
    
  } catch (error) {
    console.error('❌ Error during testing:', error.message);
    errors.push({
      type: 'test-error',
      text: error.message,
      stack: error.stack
    });
  }
  
  await browser.close();
  
  // Report results
  console.log('\n📊 BROWSER ERROR REPORT');
  console.log('═'.repeat(50));
  
  if (errors.length === 0) {
    console.log('✅ No browser errors detected!');
  } else {
    console.log(`❌ Found ${errors.length} error(s):`);
    errors.forEach((error, index) => {
      console.log(`\n${index + 1}. [${error.type.toUpperCase()}]`);
      console.log(`   ${error.text}`);
      if (error.location) {
        console.log(`   📍 ${error.location.url}:${error.location.lineNumber}:${error.location.columnNumber}`);
      }
      if (error.stack) {
        console.log(`   📚 ${error.stack.split('\n')[0]}`);
      }
    });
  }
  
  console.log('\n📝 All console messages:');
  console.log('─'.repeat(30));
  const relevantMessages = consoleMessages.filter(msg => 
    !msg.text.includes('[vite]') && 
    !msg.text.includes('React DevTools') && 
    msg.text.length > 0
  );
  
  relevantMessages.forEach((msg, index) => {
    console.log(`${index + 1}. [${msg.type}] ${msg.text}`);
  });
  
  if (relevantMessages.length === 0) {
    console.log('ℹ️ No relevant console messages found.');
  }
  
  return errors.length === 0;
}

// Run the test
testBrowserErrors()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });