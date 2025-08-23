const express = require('express');
const app = express();
require('./Models/db');

const FirmwareManagement = require('./Routes/FirmwareManagement');

const bodyParser = require('body-parser');

const cors = require('cors');
require('dotenv').config();

const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Routes

app.use('/firmware',FirmwareManagement);
app.use('/devices', require('./Routes/DeviceManagement'));
app.use('/users', require('./Routes/UserManagement'));
app.use('/projects', require('./Routes/ProjectManagement'));
app.use('/recent-activities', require('./Routes/RecentActivities'));
app.use('/status-management', require('./Routes/StatusManagement'));
app.use('/ota-updates', require('./Routes/OTAUpdates'));
app.use('/dashboard', require('./Routes/Dashboard'));

app.get('/', (req, res) => {  
    res.send('Welcome to the Firmware Management API');
}
);



app.listen(PORT,()=>{
    console.log(`Server is running on port ${PORT}`);
});