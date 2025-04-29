import React from "react";
import "./login.css";

const LoginButton = () => {
  const handleLogin = () => {
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
