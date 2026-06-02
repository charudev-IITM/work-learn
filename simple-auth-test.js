#!/usr/bin/env node

const puppeteer = require('puppeteer');

async function simpleAuthTest() {
  console.log('🚀 Starting Simple Authentication Test...\n');

  const browser = await puppeteer.launch({ 
    headless: false,
    defaultViewport: { width: 390, height: 844 },
    args: ['--no-sandbox']
  });

  try {
    const page = await browser.newPage();
    console.log('📱 Testing authentication UI...');
    
    await page.goto('http://localhost:3001', { waitUntil: 'networkidle0', timeout: 10000 });
    
    // Wait for the page to load
    await page.waitForTimeout(2000);
    
    // Check page content
    const pageText = await page.evaluate(() => document.body.innerText);
    console.log('📄 Page content loaded:', pageText.includes('Competitive Intelligence') ? '✅' : '❌');
    
    // Look for authentication elements
    const authElements = await page.evaluate(() => {
      const signUp = Array.from(document.querySelectorAll('*')).find(el => 
        el.textContent && el.textContent.includes('Sign Up')
      );
      const signIn = Array.from(document.querySelectorAll('*')).find(el => 
        el.textContent && el.textContent.includes('Sign In')
      );
      const masterKey = Array.from(document.querySelectorAll('*')).find(el => 
        el.textContent && el.textContent.includes('Master Key')
      );
      const username = document.querySelector('input[type="text"]');
      const password = document.querySelector('input[type="password"]');
      
      return {
        hasSignUp: !!signUp,
        hasSignIn: !!signIn,
        hasMasterKey: !!masterKey,
        hasUsername: !!username,
        hasPassword: !!password,
        pageText: document.body.innerText.substring(0, 200)
      };
    });
    
    console.log('\n🔍 Authentication UI Elements:');
    console.log(`   👆 Sign Up button: ${authElements.hasSignUp ? '✅' : '❌'}`);
    console.log(`   👆 Sign In button: ${authElements.hasSignIn ? '✅' : '❌'}`);
    console.log(`   🔑 Master Key mention: ${authElements.hasMasterKey ? '✅' : '❌'}`);
    console.log(`   👤 Username input: ${authElements.hasUsername ? '✅' : '❌'}`);
    console.log(`   🔒 Password input: ${authElements.hasPassword ? '✅' : '❌'}`);
    
    console.log(`\n📄 First 200 chars of page: ${authElements.pageText}`);
    
    // Test clicking on Sign Up if it exists
    if (authElements.hasSignUp) {
      console.log('\n🧪 Testing Sign Up interaction...');
      
      // Find and click sign up button
      await page.evaluate(() => {
        const signUpBtn = Array.from(document.querySelectorAll('*')).find(el => 
          el.textContent && el.textContent.includes('Sign Up') && el.tagName === 'BUTTON'
        );
        if (signUpBtn) signUpBtn.click();
      });
      
      await page.waitForTimeout(1000);
      
      // Check if signup form appeared
      const signupForm = await page.evaluate(() => {
        const masterKeyField = Array.from(document.querySelectorAll('input')).find(input => 
          input.placeholder && input.placeholder.toLowerCase().includes('master')
        );
        const createAccount = Array.from(document.querySelectorAll('*')).find(el => 
          el.textContent && el.textContent.includes('Create Account')
        );
        
        return {
          hasMasterKeyField: !!masterKeyField,
          hasCreateAccount: !!createAccount
        };
      });
      
      console.log(`   🔑 Master Key field: ${signupForm.hasMasterKeyField ? '✅' : '❌'}`);
      console.log(`   🚀 Create Account text: ${signupForm.hasCreateAccount ? '✅' : '❌'}`);
    }
    
    // Take a screenshot
    await page.screenshot({ path: 'auth-ui-test.png', fullPage: true });
    console.log('\n📸 Screenshot saved: auth-ui-test.png');
    
    console.log('\n🎉 Simple Authentication Test Complete!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    try {
      await page.screenshot({ path: 'auth-test-error.png', fullPage: true });
      console.log('📸 Error screenshot saved: auth-test-error.png');
    } catch (e) {
      console.log('Could not save error screenshot');
    }
  } finally {
    await browser.close();
  }
}

simpleAuthTest().catch(console.error);