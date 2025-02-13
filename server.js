const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const moment = require('moment-timezone');
const faceapi = require('face-api.js');
const canvas = require('canvas');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcrypt');
let overtimeRequests = [];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, 'uploads/'); 
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`); 
  },
});

const upload = multer({ storage });
const app = express();
const PORT = process.env.PORT || 3000;
app.use(bodyParser.json());
app.use(cors());
app.use(express.json());

mongoose.connect('mongodb+srv://gulshann:7DSbWzEpuzEQBInI@cluster01.4m836.mongodb.net')
  .then(() => {
    console.log('✅ Connected to MongoDB');
  })
  .catch((e) => {
    console.log('❌ Failed to connect to MongoDB:', e);
  });
  const Overtime = mongoose.model('Overtime', new mongoose.Schema({
    userId: String,
    field: String,
    date: String,
    amount: Number,
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending',
    },
  })); 
  const WorkFromHome = mongoose.model('WorkFromHome', new mongoose.Schema({
    userName: String,
    userId: String,
    projectName: String,
    under: String,
    startDate: Date,
    endDate: Date,
    approvalStatus: { type: String, default: 'Pending' }, 
  }));
  const User = mongoose.model('User', new mongoose.Schema({
    userId: String,
    name: String,
    email: String,
    phone: String,
    department: String,
    designation: String,
    role: String,
    CTC: Number,
    pancard: String,
    aadharcard: String,
    profileImage: String,
    isBlocked: { type: Boolean, default: false },
    loginAttempts: { type: Number, default: 0 },
  }));
  
  const Punch = mongoose.model('Punch', new mongoose.Schema({
    userId: { type: String, required: true },
    date: { type: Date, default: Date.now },
    punchInTime: { type: Date, default: Date.now },
    punchOutTime: { type: Date },
  }));
const Attendance = mongoose.model('Attendance', new mongoose.Schema({
  userId: { type: String, required: true },
  date: { type: Date, default: Date.now },
  punchedIn: { type: Boolean, default: false },
  punchedOut: { type: Boolean, default: false },
  punchInTime: { type: Date },
  punchOutTime: { type: Date },
  status: { type: String, enum: ['Present', 'Late Entry'], default: 'Late Entry' }
}));
const Leave = mongoose.model('Leave', new mongoose.Schema({
  userId: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  reason: { type: String, required: true },
  status: { type: String, default: 'Pending' },
  createdAt: { type: Date, default: Date.now },
}));
const MedicalLeave = mongoose.model('Medical-leave',new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
  reason: {
    type: String,
    required: true,
  },
  documentPath: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}));
const taskSchema = new mongoose.Schema({
  moduleName: String,
  platform: String,
  feature: String,
  status: String,
  projectMembers: [String], // Assuming it's an array of members
  hours: Number,
});

const Task = mongoose.model('Task', taskSchema);
const adminPasswordSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  }
}, { timestamps: true });

// Create the AdminPassword model
const AdminPassword = mongoose.models.AdminPassword || mongoose.model('AdminPassword', adminPasswordSchema);
const AnnouncementSchema = new mongoose.Schema({
  message: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 86400 }, // Auto-delete after 24 hours
});

const Announcement = mongoose.model('Announcement', AnnouncementSchema);
  const getCurrentDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = (today.getMonth() + 1).toString().padStart(2, '0'); 
    const day = today.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`; 
};
const ManualAttendanceSchema = new mongoose.Schema({
  employeeId: { type: String, required: true }, // Employee ID
  date: { type: String, required: true }, // Store date as 'YYYY-MM-DD' for consistency
  time: { type: String, required: true }, // Store time as 'HH:mm:ss' format
  punchType: { type: String, enum: ["Punch In", "Punch Out"], required: true } // Punch type validation
});

const ManualAttendance = mongoose.model("ManualAttendance", ManualAttendanceSchema);
app.post("/manual-attendance", async (req, res) => {
  try {
    const { employeeId, date, time, punchType } = req.body;

    // Check if all required fields are provided
    if (!employeeId || !date || !time || !punchType) {
      return res.status(400).json({ message: "All fields are required." });
    }

    // Convert time to Date object
    const punchTime = new Date(`${date} ${time}`);

    // Find existing attendance for the user on the selected date
    let attendance = await Attendance.findOne({ userId: employeeId, date });

    if (!attendance) {
      // If no record exists, create a new one
      attendance = new Attendance({ 
        userId: employeeId, 
        date, 
        punchedIn: punchType === "Punch In",
        punchInTime: punchType === "Punch In" ? punchTime : null,
        punchedOut: punchType === "Punch Out",
        punchOutTime: punchType === "Punch Out" ? punchTime : null,
        status: punchType === "Punch In" ? "Present" : "Late Entry"
      });
    } else {
      // If record exists, update it based on punch type
      if (punchType === "Punch In") {
        if (attendance.punchedIn) {
          return res.status(400).json({ message: "Already punched in!" });
        }
        attendance.punchedIn = true;
        attendance.punchInTime = punchTime;
        attendance.status = "Present"; // Update status
      } else if (punchType === "Punch Out") {
        if (attendance.punchedOut) {
          return res.status(400).json({ message: "Already punched out!" });
        }
        attendance.punchedOut = true;
        attendance.punchOutTime = punchTime;
      }
    }

    // Save the record
    await attendance.save();
    
    res.json({ message: "Attendance recorded successfully.", attendance });
  } catch (error) {
    console.error("Error submitting attendance:", error);
    res.status(500).json({ message: "Server error. Please try again." });
  }
});
// ✅ Get All Attendance Records
app.get("/attendance", async (req, res) => {
  try {
    const attendanceRecords = await ManualAttendance.find();
    res.status(200).json(attendanceRecords);
  } catch (error) {
    console.error("Error fetching attendance records:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ✅ Get Attendance for a Specific Employee
app.get("/attendance/:employeeId", async (req, res) => {
  try {
    const { employeeId } = req.params;
    const attendanceRecords = await ManualAttendance.find({ employeeId });

    if (attendanceRecords.length === 0) {
      return res.status(404).json({ message: "No attendance records found" });
    }

    res.status(200).json(attendanceRecords);
  } catch (error) {
    console.error("Error fetching attendance:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ✅ Delete an Attendance Record
app.delete("/attendance/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deletedAttendance = await ManualAttendance.findByIdAndDelete(id);

    if (!deletedAttendance) {
      return res.status(404).json({ message: "Attendance record not found" });
    }

    res.status(200).json({ message: "Attendance record deleted successfully" });
  } catch (error) {
    console.error("Error deleting attendance record:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.post('/announcement', async (req, res) => {
  try {
    const newAnnouncement = new Announcement({ message: req.body.message });
    await newAnnouncement.save();
    res.status(200).json({ message: 'Announcement saved for 24 hours' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save announcement' });
  }
});

// API to fetch the latest announcement (only if less than 24 hours old)
app.get('/announcement', async (req, res) => {
  try {
    const latestAnnouncement = await Announcement.findOne().sort({ createdAt: -1 });

    if (!latestAnnouncement) {
      return res.json({ announcement: 'No announcements available' });
    }

    res.json({ announcement: latestAnnouncement.message });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch announcement' });
  }
});

async function createDefaultAdmin() {
  try {
    const existingAdmin = await AdminPassword.findOne({ username: "admin" });
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash("admin123", 10);
      const newAdmin = new AdminPassword({ username: "admin", password: hashedPassword });
      await newAdmin.save();
      console.log("✅ Default admin created: Username: admin, Password: admin123");
    } else {
      console.log("🔹 Admin already exists.");
    }
  } catch (error) {
    console.error("❌ Error creating default admin:", error);
  }
}

// Call the function to create the admin when the server starts
createDefaultAdmin();

// Admin Login API
app.post("/admin-login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const admin = await AdminPassword.findOne({ username });
    if (!admin) {
      return res.status(400).json({ message: "Invalid admin username." });
    }
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid admin password." });
    }
    res.status(200).json({ message: "Login successful", username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "An error occurred. Please try again later." });
  }
});

// Change Admin Password API
app.post("/change-admin-password", async (req, res) => {
  const { currentUsername, currentPassword, newUsername, newPassword } = req.body;
  try {
    const admin = await AdminPassword.findOne({ username: currentUsername });
    if (!admin) {
      return res.status(400).json({ message: "Admin not found." });
    }
    const isMatch = await bcrypt.compare(currentPassword, admin.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Incorrect password." });
    }
    admin.username = newUsername || admin.username;
    admin.password = newPassword ? await bcrypt.hash(newPassword, 10) : admin.password;
    await admin.save();
    res.status(200).json({ message: "Admin username and password updated successfully!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "An error occurred. Please try again later." });
  }
});


app.use('/uploads', express.static('uploads'));

// POST route for uploading image
app.post('/upload', upload.single('profileImage'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded');
    }
    res.send({
        message: 'Image uploaded successfully!',
        filePath: `/uploads/${req.file.filename}`,
    });
});
// Get all tasks
app.get("/tasks", async (req, res) => {
  try {
    const tasks = await Task.find();
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
app.get("/tasks/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    console.log("Fetching tasks for user:", userId); // Log userId to debug
    const tasks = await Task.find({ userId }); // Filter tasks by userId
    console.log("Fetched tasks:", tasks); // Log tasks returned from database
    res.json(tasks);
  } catch (error) {
    console.error("Error fetching tasks:", error); // Log error
    res.status(500).json({ error: "Error fetching tasks" });
  }
});

// Add a new task
app.post("/tasks", async (req, res) => {
  try {
    const { moduleName, platform, feature, status, projectMembers, hours, userId } = req.body;
    console.log("Creating task with userId:", userId); // Log the incoming userId
    const newTask = new Task({ moduleName, platform, feature, status, projectMembers, hours, userId });
    await newTask.save();
    res.json(newTask);
  } catch (error) {
    res.status(500).json({ error: "Error adding task" });
  }
});


// Update a task
app.put("/tasks/:id", async (req, res) => {
  const { id } = req.params;
  const { moduleName, platform, feature, status, projectMembers, hours, userId } = req.body;

  try {
    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    if (task.userId !== userId) {
      return res.status(403).json({ message: "Unauthorized to edit this task" });
    }

    const updatedTask = await Task.findByIdAndUpdate(
      id,
      { moduleName, platform, feature, status, projectMembers, hours },
      { new: true }
    );

    res.json(updatedTask);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete a task
app.delete("/tasks/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const deletedTask = await Task.findByIdAndDelete(id);
    if (!deletedTask) {
      return res.status(404).json({ message: "Task not found" });
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/work-from-home', async (req, res) => {
  try {
    const workFromHome = new WorkFromHome(req.body);
    await workFromHome.save();
    res.status(201).send('Work From Home data saved successfully');
  } catch (error) {
    res.status(400).send(`Error: ${error.message}`);
  }
});

app.get('/work-from-home', async (req, res) => {
  try {
    const data = await WorkFromHome.find({ approvalStatus: 'Pending' });
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: `Error: ${error.message}` });
  }
});

app.post('/approve-work-from-home/:id', async (req, res) => {
  try {
    const workFromHome = await WorkFromHome.findByIdAndUpdate(req.params.id, { approvalStatus: 'Approved' }, { new: true });
    if (!workFromHome) return res.status(404).json({ error: 'Request not found' });
    res.status(200).json({ message: 'Approved successfully', workFromHome });
  } catch (error) {
    res.status(500).json({ error: `Error: ${error.message}` });
  }
});

app.post('/reject-work-from-home/:id', async (req, res) => {
  try {
    const workFromHome = await WorkFromHome.findByIdAndUpdate(req.params.id, { approvalStatus: 'Rejected' }, { new: true });
    if (!workFromHome) return res.status(404).json({ error: 'Request not found' });
    res.status(200).json({ message: 'Rejected successfully', workFromHome });
  } catch (error) {
    res.status(500).json({ error: `Error: ${error.message}` });
  }
});



// Endpoint to send a notification
app.post('/send-notification', async (req, res) => {
  const { userId, message, type } = req.body;

  // Validation
  if (!userId || !message || !type) {
    return res.status(400).send('User ID, message, and type are required');
  }

  try {
    // Create a new notification
    const notification = new Notification({
      userId,
      message,
      type,
      status: 'sent',
    });

    // Save the notification to the database
    await notification.save();
    
    res.status(201).json({ message: 'Notification sent successfully', notification });
  } catch (error) {
    console.error('Error sending notification:', error.message);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});
// Endpoint to fetch notifications for a user
app.get('/notifications/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const notifications = await Notification.find({ userId }).sort({ createdAt: -1 });

    if (notifications.length === 0) {
      return res.status(404).json({ message: 'No notifications found for this user' });
    }

    res.status(200).json(notifications);
  } catch (error) {
    console.error('Error fetching notifications:', error.message);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});
// Endpoint to update notification status
app.post('/update-notification-status/:notificationId', async (req, res) => {
  const { notificationId } = req.params;
  const { status } = req.body; // Status can be 'read', 'pending', or 'sent'

  if (!status) {
    return res.status(400).send('Status is required');
  }

  try {
    const notification = await Notification.findByIdAndUpdate(
      notificationId,
      { status },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.status(200).json({ message: 'Notification status updated', notification });
  } catch (error) {
    console.error('Error updating notification status:', error.message);
    res.status(500).json({ error: 'Failed to update notification status' });
  }
});
app.post('/apply-overtime', async (req, res) => {
  try {
    console.log('Request received:', req.body); // Debug
    const { userId, date, amount } = req.body;

    if (!userId || !date || !amount) {
      console.error('Validation error: Missing fields');
      return res.status(400).send('All fields are required');
    }

    const newRequest = await Overtime.create({
      userId,
      date,
      amount,
      status: 'Pending',
    });

    console.log('Overtime request created:', newRequest); // Debug
    overtimeRequests.push(newRequest);
    res.status(201).json({ message: 'Overtime request submitted', request: newRequest });
  } catch (error) {
    console.error('Error creating overtime request:', error.message);
    res.status(500).send('Internal Server Error');
  }
});
app.put('/overtime/approve/:id', async (req, res) => {
const { id } = req.params;
  const requestIndex = overtimeRequests.findIndex((req) => req.id == id);

  if (requestIndex === -1) {
    return res.status(404).json({ error: 'Request not found' });
  }

  overtimeRequests.splice(requestIndex, 1);
  res.status(200).json({ message: 'Overtime request approved and removed' });
});

// ✅ Reject Overtime Request (Removes after Rejection)
app.put('/overtime/reject/:id', (req, res) => {
  const { id } = req.params;
  const requestIndex = overtimeRequests.findIndex((req) => req.id == id);

  if (requestIndex === -1) {
    return res.status(404).json({ error: 'Request not found' });
  }

  overtimeRequests.splice(requestIndex, 1);
  res.status(200).json({ message: 'Overtime request rejected and removed' });
});

// ✅ Get Only Pending Overtime Requests
app.get('/overtime-requests', async (req, res) => {
  try {
    // Fetch only the overtime requests with status 'Pending'
    const requests = await Overtime.find({ status: 'Pending' });
    
    // Send the filtered requests as the response
    res.status(200).json(requests);
  } catch (error) {
    console.error(error);
    res.status(500).send('Failed to fetch overtime requests');
  }
});

app.get('/user-overtime-requests/:userId', async (req, res) => {
  const { userId } = req.params;
  const { filterDate, filterStatus } = req.query;  // Allow filtering by date or status

  try {
    // Build the query object
    let query = { userId };

    // Apply date filter if provided
    if (filterDate) {
      query.date = { $regex: filterDate, $options: 'i' }; // Match date pattern (case-insensitive)
    }

    // Apply status filter if provided
    if (filterStatus) {
      query.status = { $regex: filterStatus, $options: 'i' }; // Match status pattern (case-insensitive)
    }

    // Fetch overtime requests for the given userId with optional filters
    const userRequests = await Overtime.find(query);

    if (userRequests.length === 0) {
      return res.status(404).json({ error: 'No overtime requests found for this user' });
    }

    // Return the overtime requests of the user
    res.status(200).json(userRequests);
  } catch (error) {
    console.error(error);
    res.status(500).send('Failed to fetch user overtime requests');
  }
});



app.get('/overtime-requests/:status', async (req, res) => {
  const { status } = req.params;

  try {
    const requests = await Overtime.find({ status });
    res.status(200).json(requests);
  } catch (error) {
    console.error(error);
    res.status(500).send('Failed to fetch overtime requests');
  }
});

app.post('/register', upload.single('profileImage'), async (req, res) => {
  const {
    userId,
    name,
    email,
    phone,
    department,
    designation,
    role,
    CTC,
    pancard,
    aadharcard,
  } = req.body;

  // Save the file path in the database
  const profileImage = req.file ? req.file.path : null; // Get the file path

  const user = new User({
    userId,
    name,
    email,
    phone,
    department,
    designation,
    role,
    CTC,
    pancard,
    aadharcard,
    profileImage,
  });

  try {
    await user.save();
    res.status(201).send('User registered successfully');
  } catch (error) {
    console.error('Error registering user:', error.message);
    res.status(400).send(`Failed to register user: ${error.message}`);
  }
});

// Fetch Users
app.get('/users', async (req, res) => {
  try {
    const users = await User.find();
    res.status(200).json(users);
  } catch (e) {
    console.error('Error fetching users:', e.message);
    res.status(500).send(`Failed to fetch users: ${e.message}`);
  }
});

// Fetch User by ID
app.get('/users/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).send('User not found');
    }
    res.send(user);
  } catch (error) {
    console.error('Error fetching user:', error.message);
    res.status(500).send(`Failed to fetch user: ${error.message}`);
  }
});

// Update User
app.put('/users/:userId', async (req, res) => {
  const { userId } = req.params;
  const { name, email, phone, department, designation, role, CTC } = req.body;
  if (!name || !email || !phone || !department || !designation || !role || !CTC) {
    return res.status(400).send('All fields are required');
  }
  try {
    const user = await User.findOneAndUpdate(
      { userId },
      { name, email, phone, department, designation, role, CTC },
      { new: true, runValidators: true }
    );
    if (!user) {
      return res.status(404).send('User not found');
    }
    res.send('User updated successfully');
  } catch (error) {
    console.error('Error updating user:', error.message);
    res.status(400).send(`Failed to update user: ${error.message}`);
  }
});

// Delete User
app.delete('/users/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const user = await User.findOneAndDelete({ userId });
    if (!user) {
      return res.status(404).send('User not found');
    }
    res.send('User deleted successfully');
  } catch (error) {
    console.error('Error deleting user:', error.message);
    res.status(500).send(`Failed to delete user: ${error.message}`);
  }
});

app.post('/login', async (req, res) => {
  const { userId } = req.body;  // The employee code (userId)

  // Check if the user exists
  const user = await User.findOne({ userId });

  if (!user) {
    return res.status(400).json({ message: "Invalid employee code." });
  }

  // Check if the account is blocked
  if (user.isBlocked) {
    return res.status(403).json({ message: "Your account is blocked due to multiple failed login attempts." });
  }

  // Check if the login is successful (For this case, we assume the user exists)
  // You can add logic to compare employee code or other fields, but we are assuming it's valid here.

  // Reset failed attempts on successful login (if needed)
  await User.updateOne({ userId }, { $set: { failedAttempts: 0 } });

  // Respond with success
  res.status(200).json({ message: "Login successful", userName: user.name });

  // Handle failed login attempt (for demonstration purposes, assuming the login failed)
  // You can add actual verification if needed.
  const loginFailed = true;  // Change this logic if necessary

  try {
    if (loginFailed) {
        const updatedFailedAttempts = user.failedAttempts + 1;
        
        if (updatedFailedAttempts >= 2) {
            await User.updateOne({ userId }, { $set: { failedAttempts: updatedFailedAttempts, isBlocked: true } });
            return res.status(403).json({ message: "Your account has been locked due to 2 failed attempts." });
        } else {
            await User.updateOne({ userId }, { $set: { failedAttempts: updatedFailedAttempts } });
            return res.status(400).json({ message: "Invalid employee code." });
        }
    }

    // If login succeeds, return success response (only once)
    return res.status(200).json({ message: "Login successful" });

} catch (error) {
  console.log("Sending response...");
  // return res.status(500).json({ message: "Internal server error" });
  
}


});


const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const toRadians = (degree) => (degree * Math.PI) / 180;
  const R = 6371000; // Earth's radius in meters
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const lat1Rad = toRadians(lat1);
  const lat2Rad = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in meters
};

// Office Location Coordinates
const officeCoordinates = { latitude: 26.8573425, longitude: 75.8060799 };

// Routes
app.post('/attendance-status', async (req, res) => {
  const { userId } = req.body;
  const currentDate = getCurrentDate();

  console.log(`Received request for User ID: ${userId} on Date: ${currentDate}`);

  if (!userId) {
    return res.status(400).json({ message: "User ID is required" });
  }

  try {
    const attendance = await Attendance.findOne({ userId, date: currentDate });
    console.log("Attendance found:", attendance); // Log the fetched data

    if (!attendance) {
      return res.status(404).json({ message: "Attendance record not found" });
    }

    res.json(attendance);
  } catch (error) {
    console.error("Error fetching attendance:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});


app.post('/punch-in', async (req, res) => {
  const { userId, latitude, longitude } = req.body;
  const currentDate = getCurrentDate();

  try {
    const existingAttendance = await Attendance.findOne({ userId, date: currentDate });
    if (existingAttendance && existingAttendance.punchedIn) {
      return res.status(400).json({ error: 'User has already punched in for today.' });
    }

    // Validate Geolocation
    const distance = calculateDistance(
      latitude,
      longitude,
      officeCoordinates.latitude,
      officeCoordinates.longitude
    );

    if (distance > 100) {
      return res.status(400).send('You are not within 100 meters of the office.');
    }

    const punchInTime = new Date();
    const hours = punchInTime.getHours();
    const minutes = punchInTime.getMinutes();
    const status = (hours < 9 || (hours === 9 && minutes === 0)) ? 'Present' : 'Late Entry';

    const newAttendance = new Attendance({
      userId,
      punchInTime,
      punchedIn: true,
      punchedOut: false,
      date: currentDate,
      status,
    });
    await newAttendance.save();
    console.log(`Punch-in recorded for User ID: ${userId}with status: ${status}`);
    res.status(200).json({ message: 'Punch-in successful',status });
  } catch (error) {
    console.error(error);
    res.status(500).send('Failed to record punch-in');
  }
});

app.post('/punch-out', async (req, res) => {
  const { userId, latitude, longitude } = req.body;

  try {
    const attendance = await Attendance.findOne({ userId, date: getCurrentDate() });

    if (!attendance || !attendance.punchedIn) {
      return res.status(400).send('User has not punched in yet.');
    }

    if (attendance.punchedOut) {
      return res.status(400).send('User has already punched out for today.');
    }

    // Validate Geolocation
    const distance = calculateDistance(
      latitude,
      longitude,
      officeCoordinates.latitude,
      officeCoordinates.longitude
    );

    if (distance > 100) {
      return res.status(400).send('You are not within 100 meters of the office.');
    }

    attendance.punchOutTime = new Date();
    attendance.punchedOut = true;
    await attendance.save();
    console.log(`Punch-out recorded for User ID: ${userId}`);
    res.status(200).send('Punch-out successful');
  } catch (error) {
    console.error(error);
    res.status(500).send('Failed to record punch-out');
  }
});

app.get('/punch/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const punches = await Attendance.find({ userId });
    if (punches.length === 0) {
      return res.status(404).json({ error: 'No punch records found for this user' });
    }
    res.status(200).json(punches);
  } catch (e) {
    console.error('Error fetching punch records:', e.message);
    res.status(500).json({ error: `Failed to fetch punch records: ${e.message}` });
  }
});

// Apply Leave
app.post('/apply-leave', async (req, res) => {
  const { userId, startDate, endDate, reason } = req.body;

  // Validate inputs
  if (!userId || !startDate || !endDate || !reason) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  if (new Date(startDate) > new Date(endDate)) {
    return res.status(400).json({ message: 'Start date cannot be later than end date' });
  }

  try {
    // Save leave application
    const leave = new Leave({
      userId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      reason,
    });

    await leave.save();
    return res.status(201).json({ message: 'Leave applied successfully' });
  } catch (error) {
    console.error('Error applying leave:', error.message);

    // Send detailed error in development mode
    if (process.env.NODE_ENV === 'development') {
      return res.status(500).json({ message: `Failed to apply leave: ${error.message}` });
    }

    // Generic error for production
    return res.status(500).json({ message: 'Failed to apply leave. Please try again later.' });
  }
});
app.post('/medical-leave', upload.single('document'), async (req, res) => {
  const { userId, startDate, endDate, reason } = req.body;

  // Validate inputs
  if (!userId || !startDate || !endDate || !reason) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  if (new Date(startDate) > new Date(endDate)) {
    return res.status(400).json({ message: 'Start date cannot be later than end date' });
  }

  // Validate file upload
  if (!req.file) {
    return res.status(400).json({ message: 'Supporting document is required' });
  }

  try {
    // Save leave application
    const leave = new Leave({
      userId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      reason,
      documentPath: req.file.path, // Save the file path
    });

    await leave.save();
    return res.status(201).json({ message: 'Leave applied successfully' });
  } catch (error) {
    console.error('Error applying leave:', error.message);

    // Send detailed error in development mode
    if (process.env.NODE_ENV === 'development') {
      return res.status(500).json({ message: `Failed to apply leave: ${error.message}` });
    }

    // Generic error for production
    return res.status(500).json({ message: 'Failed to apply leave. Please try again later.' });
  }
});
// Fetch Leave Applications by User ID
app.get('/leave/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log(userId)
    const leaves = await Leave.find({ userId });
    if (leaves.length === 0) {
      console.log('No leave applications found for this user')
      return res.status(404).json({ message: 'No leave applications found for this user' });
    }
    res.status(200).json(leaves);
  } catch (e) {
    console.error('Error fetching leave applications:', e.message);
    res.status(500).json({ error: `Failed to fetch leave applications: ${e.message}` });
  }
});

// Fetch pending leave applications
app.get('/pending-leaves', async (req, res) => {
  try {
    const pendingLeaves = await Leave.find({ status: 'Pending' });
    res.status(200).json(pendingLeaves);
  } catch (e) {
    console.error('Error fetching pending leaves:', e.message);
    res.status(500).json({ error: `Failed to fetch pending leaves: ${e.message}` });
  }
});

// Approve leave application
app.post('/approve-leave/:leaveId', async (req, res) => {
  try {
    const { leaveId } = req.params;
    const leave = await Leave.findByIdAndUpdate(leaveId, { status: 'Approved' }, { new: true });
    if (!leave) {
      return res.status(404).json({ error: 'Leave application not found' });
    }
    res.status(200).json({ message: 'Leave application approved successfully', leave });
  } catch (e) {
    console.error('Error approving leave:', e.message);
    res.status(500).json({ error: `Failed to approve leave: ${e.message}` });
  }
});

// Reject leave application
app.post('/reject-leave/:leaveId', async (req, res) => {
  try {
    const { leaveId } = req.params;
    const leave = await Leave.findByIdAndUpdate(leaveId, { status: 'Rejected' }, { new: true });
    if (!leave) {
      return res.status(404).json({ error: 'Leave application not found' });
    }
    res.status(200).json({ message: 'Leave application rejected successfully', leave });
  } catch (e) {
    console.error('Error rejecting leave:', e.message);
    res.status(500).json({ error: `Failed to reject leave: ${e.message}` });
  }
});

app.get('/blocked-users', async (req, res) => {
  try {
    const blockedUsers = await User.find({ isBlocked: true });
    console.log('Blocked users:', blockedUsers); 
    res.status(200).json(blockedUsers);
  } catch (e) {
    console.error('Error fetching blocked users:', e.message);
    res.status(500).json({ error: `Failed to fetch blocked users: ${e.message}` });
  }
});

// Fetch blocked user by ID
app.get('/blocked-users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findOne({ userId, isBlocked: true });
    if (!user) {
      return res.status(404).json({ error: 'Blocked user not found' });
    }
    res.status(200).json(user);
  } catch (e) {
    console.error('Error fetching blocked user by ID:', e.message);
    res.status(500).json({ error: `Failed to fetch blocked user by ID: ${e.message}` });
  }
});

// Approve blocked user
app.post('/approve-user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findOneAndUpdate({ userId }, { isBlocked: false }, { new: true });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.status(200).json({ message: 'User approved successfully', user });
  } catch (e) {
    console.error('Error approving user:', e.message);
    res.status(500).json({ error: `Failed to approve user: ${e.message}` });
  }
});

// Reject blocked user
app.post('/reject-user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findOneAndUpdate({ userId }, { isBlocked: true }, { new: true });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.status(200).json({ message: 'User rejection confirmed', user });
  } catch (e) {
    console.error('Error rejecting user:', e.message);
    res.status(500).json({ error: `Failed to reject user: ${e.message}` });
  }
});
// Test Route
app.get('/test', (req, res) => res.send('Hello World'));


// Start Server
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
