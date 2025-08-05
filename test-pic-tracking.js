const mongoose = require('mongoose');
const Device = require('./Models/DeviceModel');
const OTAUpdate = require('./Models/OTAUpdateModel');
const DeviceStatsService = require('./Services/DeviceStatsService');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/iot_management', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function testPICTracking() {
  try {
    console.log('Testing PIC ID tracking functionality...');
    
    // Create test device
    const testDevice = new Device({
      name: 'Test ESP',
      deviceId: 'TEST_ESP_001'
    });
    await testDevice.save();
    console.log('✅ Test device created:', testDevice.deviceId);
    
    // Create test OTA updates with different PICs
    const testUpdates = [
      {
        deviceId: 'TEST_ESP_001',
        pic_id: 'PIC_A',
        updatedVersion: '1.0',
        totalAttempts: 3,
        successAttempts: 1,
        failureAttempts: 2,
        finalStatus: 'failed',
        statusEntries: [
          { status: '-1', message: 'Failed attempt 1', timestamp: new Date() },
          { status: '-1', message: 'Failed attempt 2', timestamp: new Date() },
          { status: '2', message: 'Success attempt', timestamp: new Date() }
        ],
        lastUpdated: new Date()
      },
      {
        deviceId: 'TEST_ESP_001',
        pic_id: 'PIC_B',
        updatedVersion: '1.0',
        totalAttempts: 2,
        successAttempts: 2,
        failureAttempts: 0,
        finalStatus: 'success',
        statusEntries: [
          { status: '2', message: 'Success attempt 1', timestamp: new Date() },
          { status: '3', message: 'Success attempt 2', timestamp: new Date() }
        ],
        lastUpdated: new Date()
      },
      {
        deviceId: 'TEST_ESP_001',
        pic_id: 'PIC_A',
        updatedVersion: '2.0',
        totalAttempts: 1,
        successAttempts: 0,
        failureAttempts: 1,
        finalStatus: 'failed',
        statusEntries: [
          { status: '-1', message: 'Failed attempt in v2', timestamp: new Date() }
        ],
        lastUpdated: new Date()
      }
    ];
    
    // Save test updates
    for (const update of testUpdates) {
      const otaUpdate = new OTAUpdate(update);
      await otaUpdate.save();
    }
    console.log('✅ Test OTA updates created');
    
    // Update ESP statistics
    const espStats = await DeviceStatsService.updateESPStats('TEST_ESP_001');
    console.log('✅ ESP statistics updated');
    
    // Verify the results
    console.log('\n=== ESP Statistics Results ===');
    console.log('Total PICs with Success:', espStats.totalPicsWithSuccess);
    console.log('Total PICs with Failure:', espStats.totalPicsWithFailure);
    console.log('PICs with Success:', espStats.picsWithSuccess);
    console.log('PICs with Failure:', espStats.picsWithFailure);
    
    console.log('\n=== Firmware Version Breakdown ===');
    espStats.byFirmwareVersion.forEach(version => {
      console.log(`Version ${version.version}:`);
      console.log(`  PICs with Success: ${version.picsWithSuccess} (${version.picIdsWithSuccess.join(', ')})`);
      console.log(`  PICs with Failure: ${version.picsWithFailure} (${version.picIdsWithFailure.join(', ')})`);
    });
    
    // Expected results:
    // - PIC_A: Had success in v1.0, had failure in v1.0 and v2.0
    // - PIC_B: Had success in v1.0, no failures
    // - Total: 2 PICs with success (PIC_A, PIC_B), 1 PIC with failure (PIC_A)
    
    const expectedSuccessPics = ['PIC_A', 'PIC_B'];
    const expectedFailurePics = ['PIC_A'];
    
    console.log('\n=== Verification ===');
    console.log(`${espStats.picsWithSuccess.length === expectedSuccessPics.length ? '✅' : '❌'} Success PICs count: ${espStats.picsWithSuccess.length} (Expected: ${expectedSuccessPics.length})`);
    console.log(`${espStats.picsWithFailure.length === expectedFailurePics.length ? '✅' : '❌'} Failure PICs count: ${espStats.picsWithFailure.length} (Expected: ${expectedFailurePics.length})`);
    
    // Check if specific PICs are included
    const successMatch = expectedSuccessPics.every(pic => espStats.picsWithSuccess.includes(pic));
    const failureMatch = expectedFailurePics.every(pic => espStats.picsWithFailure.includes(pic));
    
    console.log(`${successMatch ? '✅' : '❌'} Success PICs match expected: ${espStats.picsWithSuccess.join(', ')}`);
    console.log(`${failureMatch ? '✅' : '❌'} Failure PICs match expected: ${espStats.picsWithFailure.join(', ')}`);
    
    // Clean up test data
    await Device.deleteOne({ deviceId: 'TEST_ESP_001' });
    await OTAUpdate.deleteMany({ deviceId: 'TEST_ESP_001' });
    console.log('✅ Test data cleaned up');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    mongoose.connection.close();
  }
}

testPICTracking(); 