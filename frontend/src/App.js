import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import LoginButton from "./components/LoginButton";
import Dashboard from "./components/Dashboard";
import ReactGA from "react-ga4";

ReactGA.initialize("G-FCPFRLKXJR");
ReactGA.send("pageview"); // This sends a pageview event

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LoginButton />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </Router>
  );
}

export default App;
