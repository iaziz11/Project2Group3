const {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  addDoc,
} = require("firebase/firestore");
const { initializeApp } = require("firebase/app");

// Firebase project configuration object
const firebaseConfig = {
  apiKey: "AIzaSyBJMlZhUCLbZkB0s__pLOkqaW9n1eqWGtg",
  authDomain: "project-2-a6359.firebaseapp.com",
  projectId: "project-2-a6359",
  storageBucket: "project-2-a6359.firebasestorage.app",
  messagingSenderId: "809495421889",
  appId: "1:809495421889:web:928deb201d6375649f4540",
  measurementId: "G-YENQ3GENCT",
};

// Initialize Firebase app with the configuration
const app = initializeApp(firebaseConfig);
// Initialize Firestore database instance
const db = getFirestore(app);

// Checks if an image with the given URL already exists in our cache
async function checkImageInCache(imageUrl) {
  const imagesRef = collection(db, "cache");
  const q = query(imagesRef, where("imageUrl", "==", imageUrl));
  const querySnapshot = await getDocs(q);

  if (!querySnapshot.empty) {
    // Image already exists
    const doc = querySnapshot.docs[0];
    console.log("Image found:", doc.data());
    return doc.data();
  } else {
    return null;
  }
}

// Adds a new image URL and its data into the cache
async function addImageInCache(imageUrl, data) {
  const imagesRef = collection(db, "cache");

  await addDoc(imagesRef, {
    imageUrl: imageUrl,
    imageData: data,
  });
  console.log("Added new image to cache");
}

module.exports = { checkImageInCache, addImageInCache };
