const express = require("express");
require("dotenv").config();
const path = require("path");
const uploadRoute = require("./routes/upload");
const authRoute = require("./routes/auth");

const app = express();
app.use(express.json());

// Serve static files from the React app
app.use(express.static(path.join(__dirname, "public", "build")));

// OAuth route
app.use("/auth", authRoute);

// User upload route
app.use("/upload", uploadRoute);

// Serve frontend
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "build", "index.html"));
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
