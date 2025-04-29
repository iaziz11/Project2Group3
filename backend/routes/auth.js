const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const router = express.Router();
const { addImageInCache, checkImageInCache } = require("../services/firebase");
const { Logging } = require("@google-cloud/logging");

// Environment variables
const CLIENT_ID = process.env.PINTEREST_CLIENT_ID;
const CLIENT_SECRET = process.env.PINTEREST_CLIENT_SECRET;
const REDIRECT_URI = process.env.PINTEREST_REDIRECT_URI;
const VISION_API_KEY = process.env.GOOGLE_VISION_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`;

// Set up Google Cloud Logging
const logging = new Logging();
const geminiLog = logging.log("gemini-api-requests");
const spotifyLog = logging.log("spotify-api-requests");
const googleVisionLog = logging.log("gvision-api-requests");

async function logRequest(requestData, log) {
  const metadata = { resource: { type: "global" } };
  const entry = log.entry(metadata, requestData);
  await log.write(entry);
}

// Google analytics API
function trackEvent(eventName) {
  axios.post("https://www.google-analytics.com/mp/collect", {
    client_id: "G-FCPFRLKXJR",
    events: [{ name: eventName }],
  });
}

// State token for CSRF protection
let stateToken = "";

// Spotify access token management
let spotifyAccessToken = "";
let tokenExpiresAt = 0;

// Function to get new Spotify access token
const getSpotifyAccessToken = async () => {
  if (spotifyAccessToken && Date.now() < tokenExpiresAt) {
    return spotifyAccessToken; // return cached token
  }

  const response = await axios.post(
    "https://accounts.spotify.com/api/token",
    new URLSearchParams({ grant_type: "client_credentials" }).toString(),
    {
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(
            process.env.SPOTIFY_CLIENT_ID +
              ":" +
              process.env.SPOTIFY_CLIENT_SECRET
          ).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  // Save token and expiration time
  spotifyAccessToken = response.data.access_token;
  tokenExpiresAt = Date.now() + response.data.expires_in * 1000; // cache expiration time
  return spotifyAccessToken;
};

// Spotify search route
router.get("/spotify/search", async (req, res) => {
  const { query } = req.query;
  if (!query) {
    return res.status(400).json({ message: "Missing query parameter" });
  }

  try {
    const token = await getSpotifyAccessToken();
    const response = await axios.get("https://api.spotify.com/v1/search", {
      headers: { Authorization: `Bearer ${token}` },
      params: { q: query, type: "track", limit: 1 },
    });

    const track = response.data.tracks.items[0];
    res.json({
      song: track.name,
      artist: track.artists[0].name,
      spotifyUrl: track.external_urls.spotify,
    });
  } catch (error) {
    console.error(
      "Spotify Search Error:",
      error.response?.data || error.message
    );
    res.status(500).json({
      message: "Failed to search Spotify",
      error: error.response?.data || error.message,
    });
  }
});

// Step 1: Redirect to Pinterest OAuth
router.get("/pinterest", (req, res) => {
  stateToken = crypto.randomBytes(16).toString("hex"); // Generate state token

  const scope = "user_accounts:read,pins:read,boards:read";
  const authUrl = `https://www.pinterest.com/oauth/?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(
    REDIRECT_URI
  )}&scope=${scope}&state=${stateToken}`;

  console.log(`Redirecting to Pinterest OAuth URL: ${authUrl}`);
  res.redirect(authUrl);
});

// Step 2: Handle Pinterest OAuth callback
router.get("/pinterest/callback", async (req, res) => {
  const { code, state } = req.query;

  // Validate the state token
  if (state !== stateToken) {
    console.error("Invalid state parameter. Possible CSRF attack.");
    return res.status(400).send("Invalid state parameter.");
  }

  if (!code) {
    console.error("Authorization code not found.");
    return res.status(400).send("Authorization code not found.");
  }

  console.log(`Received Authorization Code: ${code}`);

  // Prepare request data
  const postData = new URLSearchParams();
  postData.append("grant_type", "authorization_code");
  postData.append("redirect_uri", REDIRECT_URI);
  postData.append("code", code);

  const authHeader = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString(
    "base64"
  );

  try {
    console.log("Exchanging code for access token...");

    const tokenResponse = await axios.post(
      "https://api.pinterest.com/v5/oauth/token",
      postData.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${authHeader}`,
        },
      }
    );

    const { access_token } = tokenResponse.data;
    console.log("Access Token:", access_token);

    // Fetch user profile
    const profileResponse = await axios.get(
      "https://api.pinterest.com/v5/user_account",
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    const profile = profileResponse.data;
    console.log("Logged-in User Profile:", profile);

    // Fetch user pins and pass to frontend
    let pins = [];
    let bookmark = null;

    try {
      console.log("Fetching user pins...");
      do {
        const pinsResponse = await axios.get(
          "https://api.pinterest.com/v5/pins",
          {
            headers: {
              Authorization: `Bearer ${access_token}`,
            },
            params: {
              bookmark: bookmark,
              page_size: 25,
              fields: "id,title,description,media", // Added fields param here
            },
          }
        );

        const pagePins = pinsResponse.data?.items || [];
        pins = [...pins, ...pagePins];

        bookmark = pinsResponse.data?.bookmark || null;
      } while (bookmark);

      console.log("Total Pins Retrieved:", pins.length);
    } catch (pinsError) {
      console.warn("No pins found or error fetching pins:", pinsError.message);
    }

    // Redirect back to frontend with token and first pin (optional)
    res.redirect(
      `/dashboard?accessToken=${encodeURIComponent(
        access_token
      )}&pinId=${encodeURIComponent(pins[0]?.id || "")}`
    );
  } catch (error) {
    console.error(
      "Error during token exchange or profile fetch:",
      error.response?.data || error.message
    );
    res.status(500).json({
      message: "OAuth process failed",
      error: error.response?.data || error.message,
    });
  }
});

// Fetch Pinterest pins (requires access token)
router.get("/pinterest/pins", async (req, res) => {
  const accessToken = req.query.accessToken; // Get token from frontend

  if (!accessToken) {
    return res.status(400).json({ message: "Access token missing" });
  }

  try {
    const response = await axios.get("https://api.pinterest.com/v5/pins", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      params: {
        page_size: 25,
        fields: "id,title,description,media", // Added fields param here
      },
    });

    res.json(response.data);
  } catch (error) {
    console.error(
      "Error fetching pins from Pinterest API:",
      error.response?.data || error.message
    );
    res.status(500).json({
      message: "Failed to fetch pins",
      error: error.response?.data || error.message,
    });
  }
});

// Analyze a Pinterest Pin's image: detect labels, emotion, recommend music and create a story
router.post("/pinterest/analyze-pin", async (req, res) => {
  const { imageUrl } = req.body;

  if (!imageUrl) {
    return res.status(400).json({ message: "Image URL is required" });
  }

  let cacheCheck = await checkImageInCache(imageUrl);
  console.log(cacheCheck);
  if (cacheCheck) {
    res.json({
      labels: cacheCheck.imageData.labels,
      dominantEmotion: cacheCheck.imageData.dominantEmotion,
      musicRecommendations: cacheCheck.imageData.spotifyResults,
      story: cacheCheck.imageData.storyText,
    });
    return;
  }
  // Analyze image using Google Vision API
  try {
    const visionResponse = await axios.post(
      `https://vision.googleapis.com/v1/images:annotate?key=${VISION_API_KEY}`,
      {
        requests: [
          {
            image: { source: { imageUri: imageUrl } },
            features: [
              { type: "LABEL_DETECTION", maxResults: 5 },
              { type: "FACE_DETECTION", maxResults: 1 },
            ],
          },
        ],
      }
    );
    logRequest({ message: "Google Vision API called" }, googleVisionLog);
    trackEvent("Google Vision API Call");

    const visionData = visionResponse.data;
    const labels =
      visionData.responses[0].labelAnnotations?.map(
        (label) => label.description
      ) || [];
    const faceData = visionData.responses[0].faceAnnotations?.[0];

    // Detect dominant emotion
    let dominantEmotion = "neutral";
    if (faceData) {
      const emotions = [
        { emotion: "joy", likelihood: faceData.joyLikelihood },
        { emotion: "sorrow", likelihood: faceData.sorrowLikelihood },
        { emotion: "anger", likelihood: faceData.angerLikelihood },
        { emotion: "surprise", likelihood: faceData.surpriseLikelihood },
      ];
      emotions.sort(
        (a, b) => likelihoodScore(b.likelihood) - likelihoodScore(a.likelihood)
      );
      dominantEmotion =
        emotions[0].likelihood !== "VERY_UNLIKELY"
          ? emotions[0].emotion
          : "neutral";
    }

    // Ask Gemini AI for music recommendations based on labels and emotion
    const geminiPrompt = `Detected emotion: ${dominantEmotion}. Context labels: ${labels.join(
      ", "
    )}. Recommend songs matching this mood as **Song - Artist**.`;

    const geminiResponse = await axios.post(GEMINI_API_URL, {
      contents: [
        {
          parts: [{ text: geminiPrompt }],
        },
      ],
    });

    logRequest({ message: "Gemini API called", geminiPrompt }, geminiLog);
    trackEvent("Gemini API Call");

    const recommendationsText =
      geminiResponse.data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Extract songs from Gemini response
    const regex = /\*\*\s*(.*?)\s*-\s*(.*?)\s*\*\*/g;
    let match;
    const songs = [];
    while ((match = regex.exec(recommendationsText)) !== null) {
      songs.push({ song: match[1].trim(), artist: match[2].trim() });
    }

    // Search songs on Spotify
    const spotifyResults = [];
    const spotifyToken = await getSpotifyAccessToken();

    for (const { song, artist } of songs) {
      try {
        const searchQuery = `${song} ${artist}`;
        const spotifySearchResponse = await axios.get(
          "https://api.spotify.com/v1/search",
          {
            headers: { Authorization: `Bearer ${spotifyToken}` },
            params: { q: searchQuery, type: "track", limit: 1 },
          }
        );
        const track = spotifySearchResponse.data.tracks.items[0];
        if (track) {
          spotifyResults.push({
            song,
            artist,
            spotifyUrl: track.external_urls.spotify,
          });
        }
      } catch (err) {
        console.warn(`Spotify search failed for ${song} - ${artist}`);
      }
    }
    logRequest({ message: "Spotify API called" }, spotifyLog);
    trackEvent("Spotify API Call");

    // Generate a short story using Gemini
    const storyPrompt = `Detected emotion: ${dominantEmotion}. Context labels: ${labels.join(
      ", "
    )}. Write a short story that reflects this mood and setting.`;
    const storyResponse = await axios.post(GEMINI_API_URL, {
      contents: [
        {
          parts: [{ text: storyPrompt }],
        },
      ],
    });

    logRequest({ message: "Gemini API called", storyPrompt }, geminiLog);
    trackEvent("Gemini API Call");

    const storyText =
      storyResponse.data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Save results in cache
    addImageInCache(imageUrl, {
      labels,
      dominantEmotion,
      spotifyResults,
      storyText,
    });

    // Respond to frontend
    res.json({
      labels,
      dominantEmotion,
      musicRecommendations: spotifyResults,
      story: storyText,
    });
  } catch (error) {
    console.error(
      "Error analyzing pin:",
      error.response?.data || error.message
    );
    res.status(500).json({
      message: "Failed to analyze pin",
      error: error.response?.data || error.message,
    });
  }
});

// Convert likelihood string to score
function likelihoodScore(likelihood) {
  const levels = {
    VERY_UNLIKELY: 0,
    UNLIKELY: 1,
    POSSIBLE: 2,
    LIKELY: 3,
    VERY_LIKELY: 4,
  };
  return levels[likelihood] || 0;
}

module.exports = router;
