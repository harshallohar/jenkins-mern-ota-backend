const mongoose = require('mongoose');

const DeviceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  deviceId: { type: String, required: true, unique: true },
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  status: { type: String, default: 'active' },
  dateCreated: { type: Date, default: Date.now },
  dateAssigned: { type: Date },
  // Enhanced OTA Statistics
  otaStats: {
    // Final outcomes (by PIC)
    totalPics: { type: Number, default: 0 },
    successfulPics: { type: Number, default: 0 },
    failedPics: { type: Number, default: 0 },
    pendingPics: { type: Number, default: 0 },
    
    // Attempt-level statistics
    totalAttempts: { type: Number, default: 0 },
    successfulAttempts: { type: Number, default: 0 },
    failedAttempts: { type: Number, default: 0 },
    
    // Calculated metrics
    averageAttemptsPerPic: { type: Number, default: 0 },
    successRateByPics: { type: Number, default: 0 },      // % of PICs that eventually succeeded
    successRateByAttempts: { type: Number, default: 0 },  // % of attempts that succeeded
    
    lastUpdated: { type: Date, default: Date.now }
  },
  
  // ESP-Level Statistics by Firmware Version
  espStats: {
    // Overall ESP statistics
    totalPicsWithSuccess: { type: Number, default: 0 },  // Total PICs that had success experiences
    totalPicsWithFailure: { type: Number, default: 0 },  // Total PICs that had failure experiences
    picsWithSuccess: [{ type: String }],                 // Array of PIC IDs that had success experiences
    picsWithFailure: [{ type: String }],                 // Array of PIC IDs that had failure experiences
    
    // Statistics by firmware version
    byFirmwareVersion: [{
      version: { type: String, required: true },
      date: { type: Date, default: Date.now },
      picsWithSuccess: { type: Number, default: 0 },     // PICs with success experiences
      picsWithFailure: { type: Number, default: 0 },     // PICs with failure experiences
      totalPics: { type: Number, default: 0 },           // Total PICs for this version
      picIdsWithSuccess: [{ type: String }],             // Array of PIC IDs with success for this version
      picIdsWithFailure: [{ type: String }],             // Array of PIC IDs with failure for this version
      lastUpdated: { type: Date, default: Date.now }
    }],
    
    lastUpdated: { type: Date, default: Date.now }
  }
});

module.exports = mongoose.model('Device', DeviceSchema); 