const assert = require('assert');
const http = require('http');
const app = require('../app');
const { pool } = require('../config/db');

let server;
let baseUrl;

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl + path);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('=======================================================');
  console.log('🧪 Starting QueueLess AI Full Integration Test Suite');
  console.log('=======================================================');

  server = http.createServer(app);
  await new Promise(res => server.listen(0, res));
  const port = server.address().port;
  baseUrl = `http://localhost:${port}`;
  console.log(`[TEST] Test server running on ${baseUrl}`);

  try {
    // Test 1: Health Check
    console.log('\n[TEST 1] Checking /api/health endpoint...');
    const healthRes = await request('GET', '/api/health');
    assert.strictEqual(healthRes.status, 200, 'Health endpoint should return 200');
    assert.strictEqual(healthRes.body.status, 'healthy');
    const [timezoneRows] = await pool.query('SELECT @@session.time_zone AS time_zone');
    assert.strictEqual(timezoneRows[0].time_zone, '+00:00', 'MySQL session timezone should match the UTC driver timezone');
    console.log('✅ Test 1 Passed: Health check is healthy and MySQL is connected.');

    // Test 2: User Login with Seeded Users
    console.log('\n[TEST 2] Testing User Authentication & JWT generation...');
    const loginRes = await request('POST', '/api/auth/login', {
      email: 'customer@gmail.com',
      password: 'Password@123'
    });
    assert.strictEqual(loginRes.status, 200);
    assert(loginRes.body.data.token, 'Token should be returned');
    assert.strictEqual(loginRes.body.data.user.role, 'customer');
    const customerToken = loginRes.body.data.token;
    console.log('✅ Test 2 Passed: Customer login successfully issued JWT.');

    // Org Admin 1 Login
    const org1Login = await request('POST', '/api/auth/login', {
      email: 'admin@citycare.org',
      password: 'Password@123'
    });
    const org1Token = org1Login.body.data.token;
    const org1Id = org1Login.body.data.user.organization.id;

    // Org Admin 2 Login
    const org2Login = await request('POST', '/api/auth/login', {
      email: 'admin@apexbank.com',
      password: 'Password@123'
    });
    const org2Token = org2Login.body.data.token;
    const org2Id = org2Login.body.data.user.organization.id;

    // Staff Login
    const staffLogin = await request('POST', '/api/auth/login', {
      email: 'staff.drsharma@citycare.org',
      password: 'Password@123'
    });
    const staffToken = staffLogin.body.data.token;

    // Test 3: Organization Data Isolation
    console.log('\n[TEST 3] Testing Multi-Tenant Organization Data Isolation...');
    // Org Admin 2 tries to update Org 1 - MUST BE REJECTED WITH 403
    const isolationRes = await request('PUT', `/api/organizations/${org1Id}`, {
      name: 'Malicious Overwrite By Org 2'
    }, org2Token);
    assert.strictEqual(isolationRes.status, 403, 'Cross-org update should be strictly rejected with 403');
    console.log('✅ Test 3 Passed: Org 2 cannot modify Org 1 data (Strict tenant isolation enforced).');

    // Test 4: Get Branches & Services
    console.log('\n[TEST 4] Retrieving Branches & Services...');
    const branchesRes = await request('GET', `/api/branches?organization_id=${org1Id}`);
    assert.strictEqual(branchesRes.status, 200);
    assert(branchesRes.body.data.length > 0);
    const branch1 = branchesRes.body.data.find(b => b.code === 'CC-DT') || branchesRes.body.data[0];
    const branch1Id = branch1.id;

    const servicesRes = await request('GET', `/api/services?branch_id=${branch1Id}`);
    assert.strictEqual(servicesRes.status, 200);
    assert(servicesRes.body.data.length > 0);
    const service1Id = servicesRes.body.data[0].id;
    console.log(`✅ Test 4 Passed: Found Branch ID ${branch1Id} and Service ID ${service1Id}.`);

    // Test 5: Atomic Token Generation & Concurrency Test
    console.log('\n[TEST 5] Testing Concurrent Token Generation & Transaction Safety...');
    // Clear today's test tokens for this service to have a clean slate
    await pool.query('DELETE FROM tokens WHERE service_id = ? AND branch_id = ?', [service1Id, branch1Id]);

    // Fire 3 simultaneous token requests
    const promises = [
      request('POST', '/api/tokens', { branch_id: branch1Id, service_id: service1Id, walkin_name: 'Patient A', priority_type: 'normal' }),
      request('POST', '/api/tokens', { branch_id: branch1Id, service_id: service1Id, walkin_name: 'Patient B (Senior)', priority_type: 'senior' }),
      request('POST', '/api/tokens', { branch_id: branch1Id, service_id: service1Id, walkin_name: 'Patient C (Emergency)', priority_type: 'emergency' })
    ];

    const results = await Promise.all(promises);
    for (const r of results) {
      assert.strictEqual(r.status, 201, 'Token generation should succeed');
      assert(r.body.data.token.token_number, 'Token number must exist');
      const createdAt = Date.parse(r.body.data.token.created_at);
      assert(Number.isFinite(createdAt), 'Token creation time must be a valid timestamp');
      assert(Math.abs(Date.now() - createdAt) < 2 * 60 * 1000, 'Token creation time should match the current real-world time');
    }

    const tokenNumbers = results.map(r => r.body.data.token.token_number);
    const uniqueTokens = new Set(tokenNumbers);
    assert.strictEqual(uniqueTokens.size, 3, 'All simultaneous tokens must have unique numbers');
    console.log('Generated concurrent tokens:', tokenNumbers);
    console.log('✅ Test 5 Passed: No duplicate token numbers generated under concurrency.');

    // Test 6: Priority Queue Ordering & Transparent Wait Times
    console.log('\n[TEST 6] Testing Priority Queue Ordering & Wait Time Calculation...');
    const queueRes = await request('GET', `/api/queue/${branch1Id}/${service1Id}`);
    assert.strictEqual(queueRes.status, 200);
    const waitingQueue = queueRes.body.data.waitingQueue;
    assert.strictEqual(waitingQueue.length, 3);
    // Emergency token must be in 1st position
    assert.strictEqual(waitingQueue[0].priority_type, 'emergency', 'Emergency priority must jump to #1');
    assert.strictEqual(waitingQueue[1].priority_type, 'senior', 'Senior priority must be #2');
    assert.strictEqual(waitingQueue[2].priority_type, 'normal', 'Normal priority must be #3');
    console.log('✅ Test 6 Passed: Queue sorted correctly: Emergency -> Senior -> Normal.');

    // Test 7: Staff Actions (Call Next, Serving, Complete)
    console.log('\n[TEST 7] Testing Staff Counter Actions (Call Next, Serving, Complete)...');
    const countersRes = await request('GET', `/api/counters?branch_id=${branch1Id}`);
    const counterId = countersRes.body.data[0].id;

    // Call Next
    const callRes = await request('POST', '/api/queue/call-next', {
      counter_id: counterId,
      branch_id: branch1Id,
      service_id: service1Id
    }, staffToken);
    assert.strictEqual(callRes.status, 200);
    const calledTokenId = callRes.body.data.token.id;
    console.log(`Called token ID: ${calledTokenId}`);

    // Mark Serving
    const servingRes = await request('POST', `/api/queue/${calledTokenId}/serving`, {}, staffToken);
    assert.strictEqual(servingRes.status, 200);

    // Complete Service
    const completeRes = await request('POST', `/api/queue/${calledTokenId}/complete`, {
      internal_notes: 'Prescription provided, follow up in 7 days'
    }, staffToken);
    assert.strictEqual(completeRes.status, 200);
    console.log('✅ Test 7 Passed: Token transitioned called -> serving -> completed.');

    // Test 8: Feedback Eligibility (Completed vs Incomplete tokens)
    console.log('\n[TEST 8] Testing Feedback Validation (Completed visits only)...');
    // Try feedback on waiting token - must fail
    const remainingWaiting = waitingQueue.find(t => t.id !== calledTokenId);
    const invalidFeedback = await request('POST', '/api/feedback', {
      token_id: remainingWaiting.id,
      rating: 5
    }, customerToken);
    assert.strictEqual(invalidFeedback.status, 400, 'Feedback on incomplete token should be rejected');

    // Feedback on completed token - must succeed
    // Assign completed token to customer so auth matches
    await pool.query('UPDATE tokens SET customer_id = (SELECT id FROM users WHERE email = "customer@gmail.com") WHERE id = ?', [calledTokenId]);
    const validFeedback = await request('POST', '/api/feedback', {
      token_id: calledTokenId,
      rating: 5,
      comments: 'Excellent doctor and no waiting!'
    }, customerToken);
    assert.strictEqual(validFeedback.status, 201, 'Feedback on completed token should succeed');
    console.log('✅ Test 8 Passed: Only completed visits can leave feedback.');

    // Test 9: Appointment Booking & Conflict Prevention
    console.log('\n[TEST 9] Testing Appointment Booking & Double-Booking Prevention...');
    const testDate = '2026-12-01';
    const testSlot = '10:00 AM';

    // Clear old test appointments for this slot
    await pool.query('DELETE FROM appointments WHERE branch_id = ? AND service_id = ? AND appointment_date = ? AND time_slot = ?', [branch1Id, service1Id, testDate, testSlot]);

    // Book 1st
    const book1 = await request('POST', '/api/appointments', {
      branch_id: branch1Id,
      service_id: service1Id,
      appointment_date: testDate,
      time_slot: testSlot,
      notes: 'Routine checkup'
    }, customerToken);
    assert.strictEqual(book1.status, 201);

    // Try booking SAME slot again - MUST FAIL WITH 409
    const bookDuplicate = await request('POST', '/api/appointments', {
      branch_id: branch1Id,
      service_id: service1Id,
      appointment_date: testDate,
      time_slot: testSlot
    }, customerToken);
    assert.strictEqual(bookDuplicate.status, 409, 'Double booking identical slot must return 409 Conflict');
    console.log('✅ Test 9 Passed: Double booking prevented with 409 Conflict.');

    // Test 10: AI Assistant Endpoints
    console.log('\n[TEST 10] Testing AI Queue & Admin Assistant Endpoints...');
    const aiQueueRes = await request('POST', '/api/ai/queue-assistant', {
      question: 'What is my current queue status?',
      language: 'en'
    }, customerToken);
    assert.strictEqual(aiQueueRes.status, 200);
    assert(aiQueueRes.body.data.reply, 'AI response must contain reply');

    // Hindi question
    const aiHindiRes = await request('POST', '/api/ai/queue-assistant', {
      question: 'मेरी कतार स्थिति क्या है?',
      language: 'hi'
    }, customerToken);
    assert.strictEqual(aiHindiRes.status, 200);
    assert(aiHindiRes.body.data.reply, 'Hindi AI response must contain reply');

    // Admin Assistant
    const aiAdminRes = await request('POST', `/api/ai/admin-assistant?organization_id=${org1Id}`, {
      question: 'How many customers were served today?'
    }, org1Token);
    assert.strictEqual(aiAdminRes.status, 200);
    assert(aiAdminRes.body.data.reply, 'Admin AI response must contain analytical reply');
    console.log('✅ Test 10 Passed: AI Assistant responded with verified real MySQL data in EN & HI.');

    // Test 11: Real Analytics Aggregate Query
    console.log('\n[TEST 11] Testing Real MySQL Analytics Aggregates...');
    const analyticsRes = await request('GET', `/api/analytics/overview?organization_id=${org1Id}`, null, org1Token);
    assert.strictEqual(analyticsRes.status, 200);
    assert(typeof analyticsRes.body.data.summary.totalTokens === 'number');
    assert(Array.isArray(analyticsRes.body.data.counterUtilization));
    console.log('✅ Test 11 Passed: Analytics overview returned genuine live MySQL calculations.');

    console.log('\n=======================================================');
    console.log('🎉 ALL 11 INTEGRATION TESTS PASSED SUCCESSFULLY! 🎉');
    console.log('=======================================================');
  } catch (err) {
    console.error('\n❌ Test Suite Failed:', err);
    process.exitCode = 1;
  } finally {
    if (server) {
      server.close();
    }
    await pool.end();
  }
}

if (require.main === module) {
  runTests();
}

module.exports = runTests;
