const express = require("express");
require("dotenv").config();
const path = require("path");
const uploadRoute = require("./routes/upload");
const authRoute = require("./routes/auth");

const app = express();
const cors = require("cors");
app.use(cors({ origin: "http://localhost:3000" })); // Allow frontend
app.use(express.json());
// Serve static files from the React app
app.use(express.static(path.join(__dirname, "public", "build")));

// OAuth route
app.use("/auth", authRoute);
app.use("/upload", uploadRoute);
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "build", "index.html"));
});
// // Serve frontend
// const path = require('path');
// app.use(express.static(path.join(__dirname, '../frontend/build')));
// app.get('*', (req, res) => {
//   res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
// });

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
