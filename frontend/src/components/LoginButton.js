import React from "react";
import "./login.css";
import ReactGA from "react-ga4";

ReactGA.initialize("G-FCPFRLKXJR");
ReactGA.send("pageview"); // This sends a pageview event
// Login button
const LoginButton = () => {
  const handleLogin = () => {
    ReactGA.event({
      category: "API Request",
      action: "Called Pinterest OAuth API",
      label: "Pinterest",
    });
    window.location.href = "/auth/pinterest";
  };

  return (
    <div className="container d-flex align-items-center justify-content-center vh-100">
      <div className="card p-4 text-center">
        <h2 className="mb-4">Welcome to Mood Melody</h2>
        <p className="mb-4">
          Login with Pinterest to get personalized music recommendations based
          on your mood.
        </p>
        <button
          onClick={handleLogin}
          className="btn btn-danger btn-lg LoginButton"
        >
          Login with Pinterest
        </button>
      </div>
    </div>
  );
};

export default LoginButton;
