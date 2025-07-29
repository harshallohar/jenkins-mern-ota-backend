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

// Run the script
populateActivities(); 