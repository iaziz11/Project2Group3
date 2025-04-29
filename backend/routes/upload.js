const express = require("express");
const axios = require("axios");
const multer = require("multer");
const path = require("path");
const router = express.Router();
const fs = require("fs");
const { Logging } = require("@google-cloud/logging");

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

let spotifyAccessToken = "";
let tokenExpiresAt = 0;

// Function to get new access token
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

  spotifyAccessToken = response.data.access_token;
  tokenExpiresAt = Date.now() + response.data.expires_in * 1000; // cache expiration time
  return spotifyAccessToken;
};

// To handle user uploads
const upload = multer({ dest: "uploads/" });
router.post("/userfile", upload.single("image"), async (req, res) => {
  const filePath = path.join(__dirname, "..", req.file.path);
  const fileBuffer = fs.readFileSync(filePath);
  const base64Image = fileBuffer.toString("base64");
  let labels;
  let dominantEmotion = "neutral";
  const songs = [];
  const spotifyResults = [];

  // Send image to Google Vision API
  try {
    const visionResponse = await axios.post(
      `https://vision.googleapis.com/v1/images:annotate?key=${VISION_API_KEY}`,
      {
        requests: [
          {
            image: { content: base64Image },
            features: [
              { type: "LABEL_DETECTION", maxResults: 5 },
              { type: "FACE_DETECTION", maxResults: 1 },
            ],
          },
        ],
      }
    );

    logRequest({ message: "Google Vision API called" }, googleVisionLog);

    const visionData = visionResponse.data;
    labels =
      visionData.responses[0].labelAnnotations?.map(
        (label) => label.description
      ) || [];
    const faceData = visionData.responses[0].faceAnnotations?.[0];

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
  } catch (e) {
    console.log("Something went wrong with google vision");
    console.log(e.message);
  }

  // Send photo data to Gemini

  try {
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

    const recommendationsText =
      geminiResponse.data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const regex = /\*\*\s*(.*?)\s*-\s*(.*?)\s*\*\*/g;
    let match;
    while ((match = regex.exec(recommendationsText)) !== null) {
      songs.push({ song: match[1].trim(), artist: match[2].trim() });
    }
    console.log("recieved gemini");
    console.log("sending spotify");
  } catch (e) {
    console.log("Something went wrong with gemini");
    console.log(e.message);
  }

  // Search Spotify
  try {
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
  } catch (e) {
    console.log("Something went wrong with spotify");
    console.log(e.message);
  }

  // Generate Story with Gemini
  try {
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

    const storyText =
      storyResponse.data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Respond to frontend
    res.json({
      labels,
      dominantEmotion,
      musicRecommendations: spotifyResults,
      story: storyText,
    });
  } catch (e) {
    console.log("Something went wrong with gemini (2)");
    console.log(e.message);
  }
});

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
