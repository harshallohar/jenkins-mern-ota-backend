const mongoose = require('mongoose');
const RecentActivity = require('./Models/RecentActivityModel');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/firmware-management')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Sample activities data
const sampleActivities = [
  {
    userId: '507f1f77bcf86cd799439011', // Default user ID
    activityType: 'OTA_UPDATE_SUCCESS',
    title: 'OTA Update Success',
    description: 'Device 0x009CADF19EF0 successfully updated to version 1.0',
    severity: 'success',
    details: {
      deviceId: '0x009CADF19EF0',
      status: 'Success',
      version: '1.0',
      pic_id: '34003100004642500000040505003699'
    },
    timestamp: new Date(Date.now() - 1000 * 60 * 5) // 5 minutes ago
  },
  {
    userId: '507f1f77bcf86cd799439011',
    activityType: 'FIRMWARE_UPLOADED',
    title: 'Firmware Uploaded',
    description: 'Firmware version 15.8 uploaded for device 0x009CAD',
    severity: 'success',
    details: {
      deviceId: '0x009CAD',
      version: '15.8',
      filename: 'vcuproject_car-1234567890.bin'
    },
    timestamp: new Date(Date.now() - 1000 * 60 * 15) // 15 minutes ago
  },
  {
    userId: '507f1f77bcf86cd799439011',
    activityType: 'OTA_UPDATE_FAILED',
    title: 'OTA Update Failed',
    description: 'Device 0068B8F19 failed update to version 10.0',
    severity: 'error',
    details: {
      deviceId: '0068B8F19',
      status: 'Failed',
      version: '10.0',
      pic_id: '34003100004642500000040505003699'
    },
    timestamp: new Date(Date.now() - 1000 * 60 * 30) // 30 minutes ago
  },
  {
    userId: '507f1f77bcf86cd799439011',
    activityType: 'DEVICE_ADDED',
    title: 'Device Added',
    description: 'Device "Car" (0x009CAD) added to system',
    severity: 'success',
    details: {
      deviceId: '0x009CAD',
      deviceName: 'Car'
    },
    timestamp: new Date(Date.now() - 1000 * 60 * 60) // 1 hour ago
  },
  {
    userId: '507f1f77bcf86cd799439011',
    activityType: 'PROJECT_CREATED',
    title: 'Project Created',
    description: 'Project "VCUProject" created',
    severity: 'success',
    details: {
      projectId: '507f1f77bcf86cd799439012',
      projectName: 'VCUProject'
    },
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2) // 2 hours ago
  },
  {
    userId: '507f1f77bcf86cd799439011',
    activityType: 'DEVICE_ASSIGNED',
    title: 'Device Assigned',
    description: 'Device "ABC" assigned to project "BikeProject"',
    severity: 'success',
    details: {
      deviceId: '0068B8F19',
      deviceName: 'ABC',
      projectName: 'BikeProject'
    },
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3) // 3 hours ago
  },
  {
    userId: '507f1f77bcf86cd799439011',
    activityType: 'EXPORT_DATA',
    title: 'Data Exported',
    description: 'OTA Updates data exported to OTA_Updates_7d_2025-07-30.xlsx',
    severity: 'info',
    details: {
      exportType: 'OTA Updates',
      fileName: 'OTA_Updates_7d_2025-07-30.xlsx'
    },
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 4) // 4 hours ago
  },
  {
    userId: '507f1f77bcf86cd799439011',
    activityType: 'LOGIN',
    title: 'User Login',
    description: 'User logged in successfully',
    severity: 'info',
    details: {
      loginTime: new Date(Date.now() - 1000 * 60 * 60 * 5)
    },
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5) // 5 hours ago
  }
];

// Function to populate activities
async function populateActivities() {
  try {
    // Clear existing activities for the test user
    await RecentActivity.deleteMany({ userId: '507f1f77bcf86cd799439011' });
    console.log('Cleared existing test activities');

    // Insert sample activities
    const activities = await RecentActivity.insertMany(sampleActivities);
    console.log(`Successfully inserted ${activities.length} sample activities`);

    // Display the created activities
    console.log('\nCreated activities:');
    activities.forEach((activity, index) => {
      console.log(`${index + 1}. ${activity.title} - ${activity.description}`);
    });

  } catch (error) {
    console.error('Error populating activities:', error);
  } finally {
    mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Test function for updated success/failure logic
function testSuccessFailureLogic() {
  console.log('\n=== Testing Updated Success/Failure Logic ===');
  
  const testCases = [
    { status: '2', expectedSuccess: true, description: 'Status 2 should be success' },
    { status: '3', expectedSuccess: true, description: 'Status 3 should be success' },
    { status: '-1', expectedSuccess: false, description: 'Status -1 should be failure' },
    { status: '-2', expectedSuccess: false, description: 'Status -2 should be failure' },
    { status: '0', expectedSuccess: false, description: 'Status 0 should be failure' },
    { status: '1', expectedSuccess: false, description: 'Status 1 should be failure' },
    { status: '4', expectedSuccess: false, description: 'Status 4 should be failure' },
    { status: '10', expectedSuccess: false, description: 'Status 10 should be failure' },
    { status: 'abc', expectedSuccess: false, description: 'Non-numeric status should be failure' }
  ];
  
  testCases.forEach(testCase => {
    const statusCode = parseInt(testCase.status);
    const isSuccess = !isNaN(statusCode) ? (statusCode === 2 || statusCode === 3) : false;
    const passed = isSuccess === testCase.expectedSuccess;
    
    console.log(`${passed ? '✅' : '❌'} ${testCase.description}`);
    console.log(`   Status: ${testCase.status} → Success: ${isSuccess} (Expected: ${testCase.expectedSuccess})`);
  });
  
  console.log('\n=== Logic Summary ===');
  console.log('✅ Only status codes 2 and 3 are considered SUCCESS');
  console.log('❌ All other codes (including -1, -2, 0, 1, 4, etc.) are considered FAILURE');
  console.log('❌ Non-numeric status codes are considered FAILURE');
}

// Test function for ESP statistics counting logic
function testESPStatsLogic() {
  console.log('\n=== Testing ESP Statistics Counting Logic ===');
  
  // Simulate OTA updates for an ESP with multiple firmware versions
  const mockOTAUpdates = [
    // Firmware Version 1.0
    {
      deviceId: 'ESP_001',
      pic_id: 'PIC_A',
      updatedVersion: '1.0',
      successAttempts: 0,
      failureAttempts: 2
    },
    {
      deviceId: 'ESP_001',
      pic_id: 'PIC_B',
      updatedVersion: '1.0',
      successAttempts: 1,
      failureAttempts: 0
    },
    // Firmware Version 2.0
    {
      deviceId: 'ESP_001',
      pic_id: 'PIC_A',
      updatedVersion: '2.0',
      successAttempts: 0,
      failureAttempts: 1
    },
    {
      deviceId: 'ESP_001',
      pic_id: 'PIC_C',
      updatedVersion: '2.0',
      successAttempts: 1,
      failureAttempts: 0
    }
  ];
  
  // Group by firmware version
  const updatesByVersion = new Map();
  mockOTAUpdates.forEach(update => {
    const version = update.updatedVersion;
    if (!updatesByVersion.has(version)) {
      updatesByVersion.set(version, []);
    }
    updatesByVersion.get(version).push(update);
  });
  
  let totalPicsWithSuccess = 0;
  let totalPicsWithFailure = 0;
  
  console.log('Processing by firmware version:');
  
  for (const [version, updates] of updatesByVersion) {
    const picsWithSuccess = new Set();
    const picsWithFailure = new Set();
    
    updates.forEach(update => {
      const picId = update.pic_id;
      
      if (update.successAttempts > 0) {
        picsWithSuccess.add(picId);
      }
      
      if (update.failureAttempts > 0) {
        picsWithFailure.add(picId);
      }
    });
    
    console.log(`Version ${version}:`);
    console.log(`  PICs with Success: ${picsWithSuccess.size} (${Array.from(picsWithSuccess).join(', ')})`);
    console.log(`  PICs with Failure: ${picsWithFailure.size} (${Array.from(picsWithFailure).join(', ')})`);
    
    totalPicsWithSuccess += picsWithSuccess.size;
    totalPicsWithFailure += picsWithFailure.size;
  }
  
  console.log('\nTotal ESP Statistics:');
  console.log(`Total PICs with Success: ${totalPicsWithSuccess}`);
  console.log(`Total PICs with Failure: ${totalPicsWithFailure}`);
  
  // Expected results:
  // Version 1.0: 1 success (PIC_B), 1 failure (PIC_A) = 2 total
  // Version 2.0: 1 success (PIC_C), 1 failure (PIC_A) = 2 total
  // Total: 2 success, 2 failure = 4 total experiences
  
  const expectedSuccess = 2;
  const expectedFailure = 2;
  
  console.log('\nVerification:');
  console.log(`${totalPicsWithSuccess === expectedSuccess ? '✅' : '❌'} Success count: ${totalPicsWithSuccess} (Expected: ${expectedSuccess})`);
  console.log(`${totalPicsWithFailure === expectedFailure ? '✅' : '❌'} Failure count: ${totalPicsWithFailure} (Expected: ${expectedFailure})`);
  
  console.log('\n=== Logic Summary ===');
  console.log('✅ Each firmware version is counted separately');
  console.log('✅ Same PIC can contribute to both success and failure counts across versions');
  console.log('✅ Total counts reflect all experiences across all versions');
}

// Run the script
populateActivities(); 
testSuccessFailureLogic();
testESPStatsLogic(); 