const mongoose = require('mongoose');

const StatusEntrySchema = new mongoose.Schema({
  status: { type: String, required: true },
  statusMessage: { type: String },
  badge: { type: String, enum: ['success', 'failure', 'other'], default: 'other' },
  color: { type: String },
  date: { type: Date, default: Date.now },
  attemptNumber: { type: Number, default: 1 }
});

const OTAUpdateSchema = new mongoose.Schema({
  pic_id: { type: String, required: true },
  deviceId: { type: String, required: true },
  previousVersion: { type: String, required: true },
  updatedVersion: { type: String, required: true },
  date: { type: Date, default: Date.now },
  statusEntries: [StatusEntrySchema],
  finalStatus: { type: String, default: 'pending' }, // 'success', 'failed', 'pending'
  totalAttempts: { type: Number, default: 1 },
  successAttempts: { type: Number, default: 0 },
  failureAttempts: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now }
});

// Compound index for unique PIC ID + Firmware Version combination
OTAUpdateSchema.index({ pic_id: 1, updatedVersion: 1 }, { unique: true });

// Method to add a new status entry
OTAUpdateSchema.methods.addStatusEntry = function(status, statusMessage, entryDate = null, badge = 'other', color = undefined) {
  const attemptNumber = this.statusEntries.length + 1;
  
  this.statusEntries.push({
    status,
    statusMessage,
    badge,
    color,
    date: entryDate instanceof Date && !isNaN(entryDate.getTime()) ? entryDate : new Date(),
    attemptNumber
  });
  
  // Update counters
  this.totalAttempts = this.statusEntries.length;
  this.successAttempts = this.statusEntries.filter(entry => {
    // Prefer badge if available; fallback to code check (2 or 3 considered success)
    if (entry.badge === 'success') return true;
    const code = parseInt(entry.status);
    return !isNaN(code) && (code === 2 || code === 3);
  }).length;
  this.failureAttempts = this.statusEntries.filter(entry => {
    if (entry.badge === 'failure') return true;
    const code = parseInt(entry.status);
    return !isNaN(code) && (code !== 2 && code !== 3);
  }).length;
  
  // Update final status based on latest entry
  if (badge === 'success') {
    this.finalStatus = 'success';
  } else if (badge === 'failure') {
    this.finalStatus = 'failed';
  } else {
    const latestCode = parseInt(status);
    if (!isNaN(latestCode)) {
      if (latestCode === 2 || latestCode === 3) {
        this.finalStatus = 'success';
      } else {
        this.finalStatus = 'failed';
      }
    }
  }
  
  this.lastUpdated = new Date();
  return this;
};

// Method to get the latest status
OTAUpdateSchema.methods.getLatestStatus = function() {
  if (this.statusEntries.length === 0) return null;
  return this.statusEntries[this.statusEntries.length - 1];
};

// Method to get consolidated status information
OTAUpdateSchema.methods.getStatusSummary = function() {
  const latest = this.getLatestStatus();
  return {
    finalStatus: this.finalStatus,
    totalAttempts: this.totalAttempts,
    successAttempts: this.successAttempts,
    failureAttempts: this.failureAttempts,
    latestStatus: latest ? latest.status : null,
    latestMessage: latest ? latest.statusMessage : null,
    latestDate: latest ? latest.date : null
  };
};

module.exports = mongoose.model('OTAUpdate', OTAUpdateSchema); 