/**
 * PERSONAL AI STUDIO - G2.8 AUTOMATED VERIFICATION SUITE
 *
 * Kiểm tra toàn diện 15 năng lực cốt lõi của G2.8:
 * 1. Standardized Usage Model (Token usage, duration, latency, request counts, provenance, metric_status)
 * 2. Character-to-token inference strictly forbidden (integer token counts only)
 * 3. Differentiation of 3 Limit Types (Context Window, Usage Quota, Rate Limit separate cards)
 * 4. Absolute Account Isolation (Account A and Account B are independent: no quota pooling, no usage sharing)
 * 5. Cross-account / Cross-provider contamination strictly rejected with error
 * 6. Per-Provider and per-Account Capability Registry (supported, unsupported, unknown, freshness, reasons)
 * 7. Honest Metrics & Zero Fake Data (no converting unknown/unsupported to 0)
 * 8. Cost Tracking & Classification (actual vs estimated based on pricing records)
 * 9. 3-Tier Concurrency Management (Runtime, Provider, Account active slot tracking)
 * 10. Concurrency Bounded Queue & Rejection under Saturation
 * 11. Owner-configured Concurrency Limits persistence and immediate enforcement
 * 12. Rate Limit Event Recording (HTTP 429, status code, retry_after_seconds, source)
 * 13. Alert Engine Quota & Rate Limit Triggers on verified data
 * 14. False Alarm Prevention on missing/unknown data
 * 15. Daily Rollup Aggregation & Controlled Retention Pruning
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const toUrl = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

// Import compiled dist modules
const { DatabaseClient } = await import(toUrl('dist/main/database/DatabaseClient.js'));
const { UsageQuotaService } = await import(toUrl('dist/main/services/UsageQuotaService.js'));
const { ConcurrencyManager } = await import(toUrl('dist/main/services/runtime/ConcurrencyManager.js'));
const { UsageAlertEngine } = await import(toUrl('dist/main/services/UsageAlertEngine.js'));

const TEST_DB_PATH = path.join(ROOT, 'storage', 'test-g28-usage.db');
if (fs.existsSync(TEST_DB_PATH)) {
  fs.unlinkSync(TEST_DB_PATH);
}

let totalAssertions = 0;
let passedAssertions = 0;

function assert(condition, message) {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`  [PASS] ${message}`);
  } else {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runVerification() {
  console.log('================================================================');
  console.log('PERSONAL AI STUDIO - G2.8 USAGE, QUOTA & ACCOUNT VERIFICATION');
  console.log('================================================================\n');

  // Khởi tạo Database với Migration v8
  const db = new DatabaseClient(TEST_DB_PATH);
  db.initialize();

  const usageQuotaService = new UsageQuotaService(db);
  const concurrencyManager = usageQuotaService.concurrencyManager;
  const alertEngine = usageQuotaService.alertEngine;

  // Chuẩn bị dữ liệu mẫu: 2 tài khoản Gemini độc lập (Account A và Account B) và 1 tài khoản Codex
  const nowIso = new Date().toISOString();

  db.prepare(`
    INSERT INTO accounts (id, provider_id, display_name, auth_method, credential_ref, storage_backend, masked_hint, auth_status, created_at, updated_at)
    VALUES
      ('acc-gemini-a', 'antigravity', 'Gemini Pro Account A', 'ide-extension-session', 'ext-session://gemini-a', 'wincred', 'a***@gmail.com', 'authenticated', ?, ?),
      ('acc-gemini-b', 'antigravity', 'Gemini Pro Account B', 'ide-extension-session', 'ext-session://gemini-b', 'wincred', 'b***@gmail.com', 'authenticated', ?, ?),
      ('acc-codex-1', 'openai-codex', 'OpenAI Codex Main Account', 'cli-delegated-auth', 'cli-auth://codex-main', 'wincred', 'sk-...1234', 'authenticated', ?, ?)
  `).run(nowIso, nowIso, nowIso, nowIso, nowIso, nowIso);

  // ---------------------------------------------------------------------------
  // TEST 1 & 2: Standardized Usage Model & No Character Inference
  // ---------------------------------------------------------------------------
  console.log('[TEST 1 & 2] Standardized Usage Data Model & No Character-to-Token Inference');
  const usageRecord = usageQuotaService.recordUsage({
    providerId: 'openai-codex',
    accountId: 'acc-codex-1',
    modelId: 'mdl-openai-codex-mini',
    inputTokens: 1500,
    outputTokens: 600,
    cachedInputTokens: 200,
    reasoningTokens: 100,
    totalRequests: 1,
    successfulRequests: 1,
    failedRequests: 0,
    averageDurationMs: 420,
    source: 'runtime-telemetry',
    dataConfidence: 'actual_usage',
    provenance: 'runtime_measured',
    metricStatus: 'reported',
    rateLimitHits: 0,
    providerLatencyMs: 380,
  });

  assert(usageRecord.totalTokens === 2400, 'Tokens are accurately summed: 1500 + 600 + 200 + 100 = 2400');
  assert(usageRecord.inputTokens === 1500, 'Input tokens recorded as exact integer count');
  assert(usageRecord.rateLimitHits === 0, 'Rate limit hits recorded as 0');
  assert(usageRecord.providerLatencyMs === 380, 'Provider latency recorded as 380ms');
  assert(usageRecord.provenance === 'runtime_measured', 'Provenance recorded accurately as runtime_measured');
  assert(usageRecord.metricStatus === 'reported', 'Metric status recorded as reported');
  assert(usageRecord.estimatedTotalCostUsd > 0, `Estimated cost calculated automatically from pricing record: $${usageRecord.estimatedTotalCostUsd}`);

  // ---------------------------------------------------------------------------
  // TEST 3: Differentiation of 3 Limit Types
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 3] Differentiation of 3 Limit Types (Context Window, Usage Quota, Rate Limit)');

  // Ghi Quota Snapshot cho Codex Account
  usageQuotaService.recordQuotaSnapshot({
    providerId: 'openai-codex',
    accountId: 'acc-codex-1',
    quotaPeriod: 'monthly',
    usageLimit: 2000000,
    usedAmount: 500000,
    unit: 'tokens',
    rateLimitRpm: 1000,
    rateLimitTpm: 500000,
    quotaSource: 'provider-api',
    dataConfidence: 'provider_reported_quota',
  });

  const codexDetails = usageQuotaService.getAccountUsageQuotaDetails('acc-codex-1');

  // Verify Card 1: Context Window
  assert(codexDetails.contextWindowLimit !== undefined, 'Context Window limit object exists independently');
  assert(codexDetails.contextWindowLimit.maxTokens !== null, `Context Window max tokens reported from model catalog: ${codexDetails.contextWindowLimit.maxTokens}`);

  // Verify Card 2: Usage Quota
  assert(codexDetails.quotaLimit !== undefined, 'Usage Quota limit object exists independently');
  assert(codexDetails.quotaLimit.usageLimit === 2000000, 'Usage Quota limit is 2,000,000 tokens');
  assert(codexDetails.quotaLimit.usedAmount === 500000, 'Usage Quota used amount is 500,000 tokens');
  assert(codexDetails.quotaLimit.remainingAmount === 1500000, 'Usage Quota remaining amount is 1,500,000 tokens');
  assert(codexDetails.quotaLimit.status === 'reported', 'Usage Quota status is reported');

  // Verify Card 3: Rate Limit
  assert(codexDetails.rateLimit !== undefined, 'Rate Limit object exists independently');
  assert(codexDetails.rateLimit.rpm === 1000, 'Rate Limit RPM is 1000');
  assert(codexDetails.rateLimit.tpm === 500000, 'Rate Limit TPM is 500000');
  assert(codexDetails.rateLimit.rateLimitHitsCount === 0, 'Initial rate limit hits is 0');

  // ---------------------------------------------------------------------------
  // TEST 4 & 5: Absolute Account Isolation (Gemini Account A vs Gemini Account B)
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 4 & 5] Absolute Account Isolation (Gemini Account A vs Account B)');

  // Record usage on Gemini Account A
  usageQuotaService.recordUsage({
    providerId: 'antigravity',
    accountId: 'acc-gemini-a',
    inputTokens: 5000,
    outputTokens: 1000,
    source: 'runtime-telemetry',
    dataConfidence: 'actual_usage',
  });

  const detailsA = usageQuotaService.getAccountUsageQuotaDetails('acc-gemini-a');
  const detailsB = usageQuotaService.getAccountUsageQuotaDetails('acc-gemini-b');

  assert(detailsA.recentUsage.length === 1, 'Account A has 1 usage record');
  assert(detailsA.recentUsage[0].totalTokens === 6000, 'Account A total tokens = 6000');
  assert(detailsB.recentUsage.length === 0, 'Account B has 0 usage records (Strict Account Isolation)');

  // Cross-account validation check: Attempting to record Account B with wrong Provider must throw
  let crossProvErrorThrown = false;
  try {
    usageQuotaService.recordUsage({
      providerId: 'openai-codex', // Wrong provider for acc-gemini-a
      accountId: 'acc-gemini-a',
      inputTokens: 100,
      outputTokens: 50,
      source: 'manual-audit-record',
      dataConfidence: 'actual_usage',
    });
  } catch (err) {
    crossProvErrorThrown = true;
  }
  assert(crossProvErrorThrown === true, 'Cross-provider contamination strictly rejected with error');

  // ---------------------------------------------------------------------------
  // TEST 6 & 7: Per-Account Capability Registry & Honest Metrics
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 6 & 7] Per-Account Capability Registry & Honest Metrics (No fake 0s)');

  const capsAntigravity = usageQuotaService.getAccountCapabilities('acc-gemini-a');
  assert(capsAntigravity.length >= 6, `Capabilities count for Gemini A: ${capsAntigravity.length}`);

  const quotaCap = capsAntigravity.find((c) => c.metricKey === 'quota');
  assert(quotaCap !== undefined, 'Quota capability entry exists');
  assert(quotaCap.capabilityStatus === 'unsupported', 'Antigravity quota status is honestly marked as unsupported');
  assert(quotaCap.reasonOrError !== null && quotaCap.reasonOrError.length > 5, 'Honest technical reason provided for unsupported quota');

  // Verify Antigravity Quota limit is NOT reported as fake 0
  assert(detailsA.quotaLimit.status === 'unsupported', 'Account A quota limit status is unsupported (not converted to fake 0)');

  // ---------------------------------------------------------------------------
  // TEST 8: Cost Tracking & Classification
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 8] Cost Tracking & Classification (Actual vs Estimated)');
  assert(detailsA.costSummary.costStatus === 'estimated', 'Account A cost status is estimated');
  assert(typeof detailsA.costSummary.totalEstimatedCostUsd === 'number', 'Estimated cost is numerical value');

  // ---------------------------------------------------------------------------
  // TEST 9: 3-Tier Concurrency Management (Runtime, Provider, Account)
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 9] 3-Tier Concurrency Management (Runtime, Provider, Account)');

  // Set limits: Runtime=3, Provider antigravity=2, Account gemini-a=1, Account gemini-b=1
  concurrencyManager.updateConcurrencyLimit({ scopeType: 'runtime', scopeId: 'global', maxConcurrency: 3 });
  concurrencyManager.updateConcurrencyLimit({ scopeType: 'provider', scopeId: 'antigravity', maxConcurrency: 2 });
  concurrencyManager.updateConcurrencyLimit({ scopeType: 'account', scopeId: 'acc-gemini-a', maxConcurrency: 1 });
  concurrencyManager.updateConcurrencyLimit({ scopeType: 'account', scopeId: 'acc-gemini-b', maxConcurrency: 1 });

  // Slot 1 for Account A: should succeed
  const slotA1 = concurrencyManager.acquireSlot({
    sessionId: 'sess-a-1',
    providerId: 'antigravity',
    accountId: 'acc-gemini-a',
  });
  assert(slotA1.acquired === true, 'Slot 1 for Gemini Account A acquired successfully');

  // Slot 2 for Account A: should be queued because Account A has max_concurrency = 1
  const slotA2 = concurrencyManager.acquireSlot({
    sessionId: 'sess-a-2',
    providerId: 'antigravity',
    accountId: 'acc-gemini-a',
  });
  assert(slotA2.acquired === false && slotA2.queued === true, 'Slot 2 for Account A is queued (Account level limit 1 reached)');

  // Slot 1 for Account B: should succeed independently because Account B is isolated!
  const slotB1 = concurrencyManager.acquireSlot({
    sessionId: 'sess-b-1',
    providerId: 'antigravity',
    accountId: 'acc-gemini-b',
  });
  assert(slotB1.acquired === true, 'Slot 1 for Gemini Account B acquired successfully (Account isolation respected)');

  // ---------------------------------------------------------------------------
  // TEST 10: Concurrency Bounded Queue & Rejection
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 10] Concurrency Bounded Queue & Rejection under Saturation');

  // Provider antigravity is now at 2/2 active slots (sess-a-1 and sess-b-1)
  // Fill queue with requests
  const smallQueueManager = new ConcurrencyManager({ db, maxQueueSize: 1 });
  smallQueueManager.updateConcurrencyLimit({ scopeType: 'account', scopeId: 'acc-gemini-a', maxConcurrency: 1 });

  smallQueueManager.acquireSlot({ sessionId: 's-active', providerId: 'antigravity', accountId: 'acc-gemini-a' });
  const qItem = smallQueueManager.acquireSlot({ sessionId: 's-queued-1', providerId: 'antigravity', accountId: 'acc-gemini-a' });
  assert(qItem.queued === true, 'First saturated request enters queue');

  const qReject = smallQueueManager.acquireSlot({ sessionId: 's-rejected-2', providerId: 'antigravity', accountId: 'acc-gemini-a' });
  assert(qReject.rejected === true, 'Second request is safely rejected because bounded queue is full (maxQueueSize=1)');

  // Release slot on original manager: verify queue processing
  const releaseRes = concurrencyManager.releaseSlot('sess-a-1');
  assert(releaseRes.released === true, 'Slot released successfully');
  assert(releaseRes.dequeuedSessionId === 'sess-a-2', 'sess-a-2 dequeued automatically to take available slot');

  // Clean up remaining slots
  concurrencyManager.releaseSlot('sess-a-2');
  concurrencyManager.releaseSlot('sess-b-1');

  // ---------------------------------------------------------------------------
  // TEST 11: Owner-Configured Concurrency Limits Persistence
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 11] Owner-Configured Concurrency Limits Persistence');
  const updatedLimit = concurrencyManager.updateConcurrencyLimit({
    scopeType: 'account',
    scopeId: 'acc-codex-1',
    maxConcurrency: 4,
    notes: 'Owner upgraded limit for testing',
  });
  assert(updatedLimit.maxConcurrency === 4, 'Updated max concurrency is 4');
  assert(updatedLimit.sourceType === 'owner_configured', 'Source type is owner_configured');

  const stateCodex = concurrencyManager.getConcurrencyState('account', 'acc-codex-1');
  assert(stateCodex.maxConcurrency === 4, 'Enforced immediately in getConcurrencyState');

  // ---------------------------------------------------------------------------
  // TEST 12: Rate Limit Event Recording (HTTP 429)
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 12] Rate Limit Event Recording (HTTP 429)');
  const rle = usageQuotaService.recordRateLimitEvent({
    providerId: 'openai-codex',
    accountId: 'acc-codex-1',
    limitType: 'rpm',
    statusCode: 429,
    retryAfterSeconds: 30,
    errorMessage: 'Rate limit reached for Requests Per Minute (HTTP 429)',
    source: 'test_audit',
  });

  assert(rle.limitType === 'rpm', 'Rate limit type is rpm');
  assert(rle.statusCode === 429, 'Status code is 429');
  assert(rle.retryAfterSeconds === 30, 'Retry after seconds is 30');

  const refreshedCodex = usageQuotaService.getAccountUsageQuotaDetails('acc-codex-1');
  assert(refreshedCodex.rateLimit.rateLimitHitsCount === 1, 'Rate limit hits count incremented to 1');

  // ---------------------------------------------------------------------------
  // TEST 13 & 14: Alert Engine Triggers & False Alarm Prevention
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 13 & 14] Alert Engine Triggers on Verified Data & False Alarm Prevention');

  // Seed alert rule for rate limit hit was triggered automatically when rle was recorded!
  const activeAlerts = alertEngine.listAlerts({ accountId: 'acc-codex-1', isAcknowledged: false });
  assert(activeAlerts.length >= 1, `Alert triggered for rate limit event: ${activeAlerts[0]?.message}`);
  assert(activeAlerts[0].metricType === 'rate_limit_hit', 'Alert metric type is rate_limit_hit');

  // Trigger quota 80% alert with verified data
  usageQuotaService.recordQuotaSnapshot({
    providerId: 'openai-codex',
    accountId: 'acc-codex-1',
    quotaPeriod: 'monthly',
    usageLimit: 100000,
    usedAmount: 85000, // 85% > 80% threshold
    unit: 'tokens',
    quotaSource: 'provider-api',
    dataConfidence: 'provider_reported_quota',
  });

  const alertsAfterQuota = alertEngine.listAlerts({ accountId: 'acc-codex-1', isAcknowledged: false });
  const quotaAlert = alertsAfterQuota.find((a) => a.metricType === 'quota_percentage');
  assert(quotaAlert !== undefined, `Quota 80% threshold alert triggered on verified data: ${quotaAlert?.message}`);

  // Test False Alarm Prevention: Record quota with unknown confidence -> should NOT trigger alert
  const alertCountBefore = alertEngine.listAlerts({ accountId: 'acc-gemini-a' }).length;
  usageQuotaService.recordQuotaSnapshot({
    providerId: 'antigravity',
    accountId: 'acc-gemini-a',
    quotaPeriod: 'monthly',
    usageLimit: null,
    usedAmount: null,
    unit: 'tokens',
    quotaSource: 'unsupported',
    dataConfidence: 'unknown_metric',
  });
  const alertCountAfter = alertEngine.listAlerts({ accountId: 'acc-gemini-a' }).length;
  assert(alertCountBefore === alertCountAfter, 'False alarm prevention: no alert fired for unknown/unsupported quota');

  // Acknowledge alert
  const acked = alertEngine.acknowledgeAlert(quotaAlert.id);
  assert(acked.isAcknowledged === true, 'Alert acknowledged successfully');
  assert(acked.acknowledgedAt !== null, `Acknowledged timestamp set: ${acked.acknowledgedAt}`);

  // ---------------------------------------------------------------------------
  // TEST 15: Rollup Aggregation & Controlled Retention Pruning
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 15] Rollup Aggregation & Controlled Retention Pruning');

  // Record historical usage records
  const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(); // 100 days ago
  db.prepare(`
    INSERT INTO usage_records (
      id, provider_id, account_id, input_tokens, output_tokens, cached_input_tokens, reasoning_tokens,
      total_tokens, total_requests, successful_requests, failed_requests, average_duration_ms,
      input_cost_usd, output_cost_usd, cached_input_cost_usd, estimated_total_cost_usd,
      pricing_source, pricing_version, source, data_confidence, timestamp, metric_status, cost_status, rate_limit_hits
    ) VALUES (
      'usg-old-1', 'openai-codex', 'acc-codex-1', 1000, 500, 0, 0,
      1500, 1, 1, 0, 300,
      0.001, 0.002, 0, 0.003,
      'test-pricing', '1.0', 'manual-audit-record', 'actual_usage', ?, 'reported', 'estimated', 0
    )
  `).run(oldDate);

  const rollupResult = usageQuotaService.aggregateDailyRollups();
  assert(rollupResult.count > 0, `Rollup aggregation executed: updated ${rollupResult.count} daily buckets`);

  const dailyRows = db.prepare('SELECT * FROM aggregated_usage_daily WHERE account_id = ?').all('acc-codex-1');
  assert(dailyRows.length >= 1, `Daily aggregated rows exist in aggregated_usage_daily: ${dailyRows.length}`);

  // Retention prune: raw records older than 90 days should be deleted, rollups preserved
  const pruneResult = usageQuotaService.pruneUsageRetention();
  assert(pruneResult.deletedRawRecords >= 1, `Pruned ${pruneResult.deletedRawRecords} raw records older than 90 days`);

  const oldRawCheck = db.prepare('SELECT id FROM usage_records WHERE id = ?').get('usg-old-1');
  assert(oldRawCheck === undefined, 'Old raw usage record was safely purged');

  const rollupStillExists = db.prepare('SELECT id FROM aggregated_usage_daily WHERE account_id = ?').all('acc-codex-1');
  assert(rollupStillExists.length >= 1, 'Long-term analytics rollups remain intact after raw pruning');

  // Cleanup test DB
  db.close();
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  console.log('\n================================================================');
  console.log(`G2.8 VERIFICATION COMPLETE: ${passedAssertions}/${totalAssertions} assertions passed.`);
  console.log('================================================================\n');
}

runVerification().catch((err) => {
  console.error('\nVerification failed with exception:', err);
  process.exit(1);
});

