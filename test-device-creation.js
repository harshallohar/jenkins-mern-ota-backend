const mongoose = require('mongoose');
const Device = require('./Models/DeviceModel');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/iot_management', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function testDeviceCreation() {
  try {
    console.log('Testing device creation...');
    
    // Test 1: Create a device without project (should work)
    const device1 = new Device({
      name: 'Test Device 1',
      deviceId: 'TEST_001'
    });
    
    await device1.save();
    console.log('✅ Device created successfully:', device1);
    
    // Test 2: Try to create device with duplicate deviceId (should fail)
    try {
      const device2 = new Device({
        name: 'Test Device 2',
        deviceId: 'TEST_001' // Same deviceId
      });
      
      await device2.save();
      console.log('❌ Should have failed due to duplicate deviceId');
    } catch (error) {
      console.log('✅ Correctly failed due to duplicate deviceId:', error.message);
    }
    
    // Test 3: Create device with different deviceId (should work)
    const device3 = new Device({
      name: 'Test Device 3',
      deviceId: 'TEST_002'
    });
    
    await device3.save();
    console.log('✅ Device created successfully:', device3);
    
    // Clean up test devices
    await Device.deleteMany({ deviceId: { $in: ['TEST_001', 'TEST_002'] } });
    console.log('✅ Test devices cleaned up');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    mongoose.connection.close();
  }
}

testDeviceCreation(); 