import React, { useEffect, useState } from "react";
import axios from "axios";
import "bootstrap/dist/css/bootstrap.min.css";
import "./dashboard.css";

const Dashboard = () => {
  const [pins, setPins] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);

  // Fetch user's pins
  useEffect(() => {
    const fetchPins = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const accessToken = urlParams.get("accessToken");
      if (!accessToken) {
        setError("Access token is missing in the URL.");
        setLoading(false);
        return;
      }

      try {
        const response = await axios.get("/auth/pinterest/pins", {
          params: { accessToken, page_size: 25 },
        });
        const fetchedPins = response.data.items || response.data.data || [];
        setPins(fetchedPins);
      } catch (err) {
        console.error(
          "Error fetching pins:",
          err.response?.data || err.message
        );
        setError("Failed to fetch pins.");
      } finally {
        setLoading(false);
      }
    };

    fetchPins();
  }, []);

  // Analyze the pin that the user chooses
  const handleAnalyzePin = async (imageUrl) => {
    setAnalyzing(true);
    setAnalysisResult(null);
    setError(null);

    try {
      const response = await axios.post("/auth/pinterest/analyze-pin", {
        imageUrl,
        userId: "demo-user",
      });
      setAnalysisResult(response.data);
    } catch (error) {
      console.error(
        "Error analyzing pin:",
        error.response?.data || error.message
      );
      setError("Failed to analyze pin.");
    } finally {
      setAnalyzing(false);
    }
  };

  // Analyze the file that the user uploads
  const handleAnalyzeFileUpload = async (image) => {
    setAnalyzing(true);
    setAnalysisResult(null);
    setError(null);

    const formData = new FormData();
    formData.append("image", image);

    try {
      const response = await axios.post("/upload/userfile", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      setAnalysisResult(response.data);
    } catch (error) {
      console.error(
        "Error analyzing file upload:",
        error.response?.data || error.message
      );
      setError("Failed to analyze image upload.");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    // Pins
    <div className="container my-4">
      <h1 className="text-center mb-4">Your Pinterest Pins</h1>
      {error && <div className="alert alert-danger">{error}</div>}
      {loading ? (
        <div className="text-center">Loading your pins...</div>
      ) : (
        // When finished loading
        <div className="row">
          {pins.map((pin) => {
            const imageUrl =
              pin.media?.images?.["600x"]?.url ||
              pin.media?.images?.originals?.url ||
              pin.images?.original?.url ||
              "";
            // Return each pin as a card
            return (
              <div key={pin.id} className="col-md-4 mb-4">
                <div className="card h-100">
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      className="card-img-top"
                      alt={pin.title || "Pinterest Pin"}
                      style={{ cursor: "pointer" }}
                      onClick={() => handleAnalyzePin(imageUrl)}
                    />
                  ) : (
                    <div className="card-body">No image available</div>
                  )}
                  <div className="card-body">
                    <h5 className="card-title">{pin.title || "No Title"}</h5>
                    <p className="card-text">
                      {pin.description || "No Description"}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* User upload section */}
      <div className="text-center">
        <p>--- or ---</p>
        <input
          type="file"
          alt="Upload file"
          accept="image/png, image/jpeg"
          onChange={(e) => handleAnalyzeFileUpload(e.target.files[0])}
        />
      </div>

      {analyzing && <div className="text-center mt-4">Analyzing photo...</div>}
      {/* Analyzing pin or photo */}
      {analysisResult && (
        <div className="mt-5">
          <h2>Mood Analysis Result</h2>
          <p>
            <strong>Detected Moods/Labels:</strong>{" "}
            {analysisResult.labels.join(", ")}
          </p>
          <p>
            <strong>Detected Emotion:</strong> {analysisResult.dominantEmotion}
          </p>

          <h3>Music Recommendations</h3>
          <ul className="list-group mb-4">
            {analysisResult.musicRecommendations.map((rec, index) => (
              <li key={index} className="list-group-item">
                <a
                  href={rec.spotifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {rec.song} - {rec.artist.slice(0, -1)}
                </a>
              </li>
            ))}
          </ul>
          {/* Story */}
          <h3>Story</h3>
          <div className="list-group">
            <div className="list-group-item">{analysisResult.story}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
